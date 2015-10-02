///<reference path="Scripts/typings/node/node.d.ts" />
//<reference path="Scripts/typings/es6-promise.d.ts"/>
import fs = require('fs');
var ursa = require('ursa');
import dgram = require('dgram');
import tls = require('tls');
import net = require('net');

export module Child {

    /**
    *設定ファイルに保存する内容
    */
    export interface Setting {
        guid: GUID;
    }
    /**
    *UDPでサーバ探査時に送信する内容
    */
    export interface udpMessage {
        name: string;
        guid: GUID;
        port: number;
    }

    /**
    *GUIDの値
    */
    export class GUID {

        private bytes: number[];

        /**
        *dataを設定して初期化する
        *@param {number[]} data GUIDのデータ(16Bytes) 
        */
        public constructor(data: number[])
        /**
        *ランダムに生成し初期化する
        */
        public constructor()
        /**
        *文字列から作成
        *@param {string} text GUIDの文字列FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF
        */
        public constructor(text: string)
        constructor(arg?: any) {
            var data: number[];
            var text: string;
            if (typeof (arg) == "string") {
                //stringから作成
                this.bytes = new Array(16);
                text = arg;
                if (/^\"*\"$/.test(text)) {
                    text = text.substr(1, text.length - 2);
                }
                if (text.length == 32 + 4) {
                    text = text.replace(/-/g, '');
                    if (text.length == 32) {
                        for (var i = 0; i < 16; i++) {
                            var hex = text.substr(i * 2, 2);
                            this.bytes[i] = parseInt(hex, 16);
                        }
                        return;
                    }
                }
                throw new Error("GUIDのフォーマットが正しくありません");
            }
            else if ((data == undefined) || (data.length != 16)) {
                //ランダムに生成
                this.bytes = new Array(16);
                for (var i = 0; i < 16; i++) {
                    var byte = Math.floor(Math.random() * 256);
                    if (255 < byte) {
                        i--;
                        continue;
                    }
                    this.bytes[i] = byte;
                }
            }
            else {
                //配列から作成
                this.bytes = data;
            }
        }

        /**
        *GUIDを文字列に変換
        *@return GUIDの文字列 FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF
        */
        public toString(): string {
            var output: string = "";
            var lens = [4, 2, 2, 2, 6];
            var i: number, j: number;
            var index: number = 0;
            for (i = 0; i < lens.length; i++) {
                for (j = 0; j < lens[i]; j++) {
                    var numStr = this.bytes[index].toString(16);
                    if (numStr.length < 2) numStr = '0' + numStr;
                    output += numStr;
                    index++;
                }
                if (i + 1 != lens.length) {
                    output += '-';
                }
            }
            return output;
        }

        /**
        *GUIDをJSONに変換(JSON.stringify用 )
        */
        public toJSON(): string {
            return this.toString();
        }
    }

    /**
    *子機
    */
    export class Client {
        /**
        *udpの送信元のポート番号
        */
        public get srcPort(): number { return 10001; }
        /**
        *udpのポートが開けなかった場合開きなおす範囲
        */
        public get portRange(): number { return 1000; }
        /**
        *udpの送信先のポート番号
        */
        public get destPort(): number { return 8000; }
        /**
        *tcp(tls)の受信するポート番号
        */
        public tcpPort: number;
        /**
        *tcpポート番号の選ばれる最大
        */
        public get tcpMaxPort(): number { return 65000; }
        /**
        *tcpポート番号の選ばれる最小
        */
        public get tcpMinPort(): number { return 10000; }

        /**
        *UDPによる探索パケットの送信間隔
        */
        public get udpInterval(): number { return 2500; }

        private _clientType: string = "Client";

        /**
        *TLSの送信バッファ
        */
        public sendBuff: Buffer[] = [];

        /**
        *受信バッファにキャッシュされた長さ
        */
        public sendBuffLen: number = 0;

        /**
        *子機の機能の種類
        */
        public get clientType(): string {
            return this._clientType;
        }
        /**
        *子機の機能の種類
        */
        public set clientType(name: string) {
            if (name == undefined || name.replace(" ", "").replace("　", "") == "") throw new Error("Clientの名前に空白は使用できません")
            if (name == "server") throw new Error("Clientの名前に[server]は使用できません");
            this._clientType = name;
        }
        /**
        *サーバ検索時のメッセージ
        */
        private udpMessage: udpMessage;
        /**
        *サーバのアドレス
        */
        public serverAddr: dgram.AddressInfo;
        /**
        *静的コンストラクタ
        */
        static init() {

        }
        /**
        *UDPのソケット
        */
        public udp: dgram.Socket;
        /**
        *プライベートキー
        */
        public privateKey: any;
        /**
        *パブリックキー
        */
        public publicKey: any;
        /**
        *証明書ファイル
        */
        public cert: Buffer;
        /**
        *SSL(TLS)サーバ
        */
        public ssl: tls.Server;
        /**
        *SSLソケット
        */
        public socket: net.Socket;
        /**
        *サーバの探索が終わっているか否か
        *これがtrueになるまでUDPの送信を続ける
        */
        private serverFound: boolean = false;

        //関数が登録されるたびに増える番号
        private funcNo: number = 0;
        //登録された関数
        private registedFunc: { [key: string]: registedFunc; } = {};

        private registerBuff: functionMessages;

        /**
        *SSLのメッセージを受けた際呼ばれる関数
        *@param {Client} client このインスタンス
        *@param {any} msg 受け取ったJSON(オブジェクトにParse済み)
        */
        public onmessage: (client: Client, msg: any) => void;

        /**
        *初期化
        *@param {string} privateKey プライベートキーのパス
        *@param {string} publicKey パブリックキーのパス
        *@param {string} cert 証明書のパス
        *@param {string} setting 設定ファイルのパス
        *@param {string} clientType クライアントの種類
        */
        constructor(privateKey: string, publicKey: string, cert: string, setting: string, clientType: string) {
            console.log("Reading Keys...");
            this.clientType = clientType;
            try {
                this.privateKey = ursa.createPrivateKey(fs.readFileSync(privateKey));
                this.publicKey = ursa.createPublicKey(fs.readFileSync(publicKey));
                this.cert = fs.readFileSync(cert);
            } catch (ex) {
                console.log("Key Config Error" + ex);
            }
            var guid: GUID = undefined;
            if (setting != undefined && fs.existsSync(setting)) {
                //設定ファイルが存在
                try {
                    var obj = JSON.parse(fs.readFileSync(setting).toString("utf8"));
                    if (obj.guid != undefined) {
                        guid = new GUID(obj.guid);
                    }
                } catch (ex) {

                }
            }
            if (guid == undefined) {
                guid = new GUID();
                var config: Setting = { guid: guid };
                try {
                    fs.writeFileSync(setting, JSON.stringify(config));
                } catch (ex) {
                    console.log("Cannot Write Config File : " + setting);
                }
            }
            this.udpMessage = { name: this.clientType, guid: guid, port: -1 }
            console.log("Read Keys");
            console.log("GUID : " + this.udpMessage.guid.toString());

            this.udp = dgram.createSocket("udp4");
        }

        /**
        *使用できる関数を登録する
        *@param {Function} func 呼び出される関数
        *@param {funcDef} def 関数に関する情報
        *@param {string} name 関数名(重複不可)
        */
        public register(func: Function, define: funcDef, name?: string) {
            if (define.sync === undefined) define.sync = true;
            if (name == undefined) {
                if ((<any>func).name == undefined || (<any>func).name == "") {
                    name = "function" + this.funcNo;
                    this.funcNo++;
                }
            }
            if (name in this.registedFunc) {
                //関数名が被ってる→エラー
                throw new Error("Already Exist '" + name + "'");
            }
            var reg: registedFunc = <any>define;
            reg.func = func;
            //登録
            this.registedFunc[name] = reg;

            var val: functionMessage;
            val = { functionName: name, type: funcmsgType.add, value: define }

            if (this.serverFound) {
                //サーバと接続済み
                var msg: functionMessages;
                msg = { id: this.udpMessage.guid, name: this.udpMessage.name, type: msgType.function, dest: destination.server, value: [val] };
                this.sendMessage(msg);
            } else {
                if (this.registerBuff == undefined) {
                    //バッファが存在しない
                    this.registerBuff = { id: this.udpMessage.guid, name: this.udpMessage.name, type: msgType.function, dest: destination.server, value: [val] };
                } else {
                    //バッファが既に存在
                    this.registerBuff.value.push(val);
                }
            }

        }

        /**
        *プッシュ通知を行う
        *@param {string} name 関数名
        *@param {any} value 送る値
        */
        public push(name: string, value: any) {
            var obj: pushMessage = {
                dest: destination.server,
                id: this.udpMessage.guid,
                name: this.udpMessage.name,
                type: msgType.message,
                value: { function: name, value: value }
            };
            this.sendMessage(obj);
        }

        /**
        *関数の返り値を返す(自動で呼び出されます)
        *@param {string} name 関数名
        *@param {any} result 送りたい返り値
        *@param {boolean} cancelled キャンセルされたか
        *@param {Error} error エラーの内容
        */
        private sendResult(name: string, result: any, cancelled?: boolean, error?: Error) {
            var msg: resultMessage = {
                dest: destination.server,
                id: this.udpMessage.guid,
                name: this.udpMessage.name,
                type: msgType.result,
                value: {
                    functionName: name, result: result,
                    cancelled: cancelled || (error != undefined),
                    hasError: error != undefined, error: error
                }
            };
            this.sendMessage(msg);
        }

        /**
        *関数の返り値を返す(非同期用)
        *@param {string} name 関数名
        *@param {any} result 送りたい返り値
        */
        public sendResultAsync(name: string, result: any) {
            var msg: message = {
                dest: destination.server,
                id: this.udpMessage.guid,
                name: this.udpMessage.name,
                type: msgType.message,
                value: {
                    functionName: name,
                    value: result
                }
            };
            this.sendMessage(msg);
        }

        /**
        *検索、実行
        */
        public run() {
            this.openUdp();
            var th = this;
            th.openSslPort(function () {
                th.searchServer(th.udpInterval);
            });
        }
        /**
        *TCP(SSL)受信時のイベント
        *@param {Buffer} msg 受信したバイナリ
        */
        private tcpReceived(msg: Buffer): void {
            var that: Client = (<any>this).this;
            try {
                var txt = msg.toString("utf8", 0, msg.length);
                var obj: message = JSON.parse(txt);
            } catch (ex) {
                console.log("Err Message");
                return;
            }
            console.log("Message Type: " + obj.type);
            switch (obj.type) {
                case msgType.call:
                    //親機からの関数呼び出し命令
                    var cMsg: callMessage = <any>obj;
                    if (cMsg.value.functionName != undefined) {
                        that.callFunction(cMsg.value.functionName, cMsg.value.args);
                    }
                    break;
            }
        }

        /**
        *@param {string} name 関数名
        *@param {any[]} args 引数一覧
        */
        private callFunction(name: string, args: { [key: string]: any }): boolean {
            if (name in this.registedFunc) {
                //関数が存在するならば
                var result;
                var err: Error;
                try {
                    var argarr = [];
                    var registedArg = this.registedFunc[name].args;
                    for (var i = 0; i < registedArg.length; i++) {
                        if (registedArg[i].arg in args) {
                            argarr[i] = args[registedArg[i].arg];
                        } else {
                            argarr[i] = undefined;
                        }
                    }
                    result = this.registedFunc[name].func.apply(this, argarr);
                } catch (ex) {
                    err = ex;
                    console.log("Call Error : " + err.message);
                }
                this.sendResult(name, result, err != undefined, err);
                return true;
            } else {
                console.log("Call Error : Not Exist Function \"" + name + "\"");
            }
            return false;
        }

        /**
        *メッセージを送信します
        *@param {any} msg 送信するオブジェクト(JSONに変換されます)
        */
        private sendMessage(msg: any) {
            this.sendText(JSON.stringify(msg));
        }
        /**
        *テキストのメッセージを送信します
        *@param {string} text 送信するテキスト(JSONの形式に従ってください)
        */
        private sendText(text: string) {
            var buff = new Buffer(text, "utf8")
            if (this.sendBuffLen) {
                var que = () => {
                    this.sendBuff[this.sendBuffLen] = buff;
                    this.sendBuffLen++;
                };
                que();
            } else {
                var sendit = () => {
                    if (this.sendBuff) {
                        this.sendBuffLen--;
                        this.sendBuff.shift();
                    }
                    if (this.sendBuffLen) {
                        this.socket.write(this.sendBuff[0], sendit);
                    }
                };
                this.socket.write(buff, sendit);
            }
        }

        /**
        *SSLソケットでエラーが起こった時のイベント
        *@param {Error} err エラー
        */
        private tlsError(err: Error): void {
            console.log("Socket Error : " + err.name);
            console.log(err.message);
        }
        /**
        *ソケットのクローズ時のイベント
        *@param {boolean} had_error エラーのせいでソケットが閉じられたかのフラグ
        */
        private closed(had_error: boolean) {
            var that: Client = (<any>this).this;
            console.log("ReConnecting...");
            that.reconnect();
        }

        /**
        *再接続を行う
        */
        private reconnect(): void {
            this.searchServer(this.udpInterval);
        }

        /**
        *TCP(SSL)接続時のイベント
        *@param {net.Socket} socket 接続したソケット
        */
        private tcpConnected(socket: net.Socket): void {
            var that: Client = (<any>this).this;

            that.serverAddr = socket.address();
            that.socket = socket;
            (<any>that.socket).this = that;
            that.socket.on('data', that.tcpReceived);
            that.socket.on('error', that.tlsError);
            that.socket.on('close', that.closed);
            that.serverFound = true;
            console.log("SSL Connected");
            if (that.registerBuff != undefined) {
                that.sendMessage(that.registerBuff);
                that.registerBuff = undefined;
            }
        }

        /**
        *UDPのポートを開ける
        *@return 成功したか(普通は大丈夫)
        */
        public openUdp(): boolean {
            for (var portCount = 0; portCount < this.portRange; portCount++) {
                try {
                    var sender;
                    this.udp.bind(this.srcPort + portCount);
                } catch (ex) {
                    console.log("\rCannot Open Port Reconnecting... ( " + (portCount + 1) + "/" + this.portRange + " )");
                    continue;
                }
                console.log("Openned ( Port : " + (portCount + this.srcPort) + " )");
                return true;
            }
            return false;
        }

        /**
        *サーバにudpメッセージ(GUID+クライアント名)を送る
        *searchServerによりスケジュールされます
        *@param {Client} client このクラス(this対策)
        *@param {Buffer} cipher 暗号化された送るもの
        *@param {number} interval 送る間隔
        */
        private sendSearcher(client: Client, cipher: Buffer, interval: number): void {
            var addr = client.udp.address();
            if (!client.serverFound) {
                client.udp.send(cipher, 0, cipher.length, client.destPort, "255.255.255.255");
                setTimeout(client.sendSearcher, interval, client, cipher, interval);
            }
        }

        /**
        *ssl(サーバ)でエラーが起きた時のイベント
        *@param {Error} err エラー内容
        */
        private sslError(err: Error): void {
            console.log('TlsServer Error : ' + err.name);
            console.log(err.message);
        }

        /**
        *SSLのポートを開ける
        */
        private openSslPort(callback: Function): void {
            var k = this.privateKey.toPrivatePem();

            this.ssl = tls.createServer({ cert: this.cert, key: k });
            this.ssl.maxConnections = 1;

            var th = this;

            var openedSslPort = function () {
                //th.ssl.on('error', null);
                th.udpMessage.port = th.tcpPort;
                console.log("Port No : " + th.tcpPort);
                (<any>(th.ssl)).this = th;
                th.ssl.on('secureConnection', th.tcpConnected);
                th.ssl.on('clientError', th.sslError);
                callback();
            }
            var openingSslPort = function () {
                th.tcpPort = Math.floor(Math.random() * (th.tcpMaxPort - th.tcpMinPort + 1) + th.tcpMinPort);
                th.ssl.listen(th.tcpPort, undefined, openedSslPort);
            }
            th.ssl.on('error', openingSslPort);
            openingSslPort();
        }

        /**
        *ポート番号の登録、受信時の処理の設定を行う
        */

        /**
        *サーバの探査を開始する
        *@param {number} interval 送信する間隔
        */
        public searchServer(interval: number): void {
            this.serverFound = false;
            var plane = JSON.stringify(this.udpMessage);
            var cipher = this.encrypt(plane);
            setTimeout((client: Client) => {
                client.udp.setBroadcast(true);
                setTimeout(client.sendSearcher, 0, client, new Buffer(cipher), interval);
            }, 0, this);
        }

        /**
        *base64の暗号をキーを利用して文字列に復号化する
        *@param {string} base64化された暗号文
        */
        decrypt(msg: string): string {
            return this.privateKey.decrypt(msg, 'base64', 'utf8');
        }

        /**
        *文字列を暗号化してBase64変換を行う
        *@param {string} 送信したい文字列
        */
        encrypt(msg: string): string {
            return this.publicKey.encrypt(msg, 'utf8', 'base64');
        }
    }

    /**
    *子機からのメッセージのタイプ
    */
    export enum msgType {
        result = <any>"result",
        function = <any>"function",
        message = <any>"message",
        call = <any>"call"
    };
    /**
    *送信先
    */
    export enum destination {
        server = <any>"server",
        raspi = <any>"raspi",
        both = <any>"both"
    }
    /**
    *メッセージ
    */
    interface message {
        //ファームウェア名
        name: string;
        //GUID
        id: GUID;
        //送信先
        dest: destination;
        //メッセージの種類(結果を返しているのか、プッシュなのか...)
        type: msgType;
        //種類に応じた値
        value: Object;
    }

    interface pushMessage extends message {
        value: {
            //関数名
            function: string;
            //返り値
            value: any;
        }
    }

    /**
    *関数に関するメッセージ(集合体)
    */
    interface functionMessages extends message {
        //種類に応じた値
        value: functionMessage[];
    }

    //関数呼び出しに関する情報
    interface callMessage extends message {
        //呼び出しの情報
        value: {
            //関数の名前(固有)
            functionName: string;
            //引数(登録時にarrとして設定した引数の名前をキーとする連想配列)
            args: { [key: string]: any };
        };
    }

    //非同期通知型の結果
    interface resultMessage extends message {
        //返り値に関するデータ
        value: {
            //関数名
            functionName: string;
            //エラーがあるか
            hasError: boolean;
            //キャンセルされたか
            cancelled: boolean;
            //エラー
            error: Error;
            //結果
            result: any;
        }
    }

    /**
    *関数メッセージの内容の種類
    */
    export enum funcmsgType {
        add = <any>"add",
        remove = <any>"remove",
        state = <any>"state"
    }

    /**
    *関数に関するメッセージ
    */
    interface functionMessage {
        //メッセージのタイプ
        type: funcmsgType;
        //関数名
        functionName: string;
        //利用可能か(type==stateの場合のみ)
        state?: boolean;
        //関数の情報
        value: funcDef;
    }

    /**
    *関数に関する
    */
    export interface funcDef {
        //表示名
        name: string;
        //機能説明
        desc: string;
        //呼び出し制限(呼び出せるもの)
        perm: destination;
        //呼び出せるか
        status: boolean;
        //勝手に返り値が変わる関数か
        auto: boolean;
        //こちらからプッシュ通知をかけるか
        push: boolean;
        //引数
        args: argument[];
        //返り値
        result: argument;
        //同期か
        sync: boolean
    }

    //登録された関数データ
    interface registedFunc extends funcDef {
        //呼び出される関数
        func: Function;
    }

    //引数の型
    export enum argType {
        boolean = <any>"boolean",
        number = <any>"number",
        string = <any>"string",
        int = <any>"int",
        array = <any>"[]",
        img = <any>"img",
        object = <any>"object",

    }

    //引数
    export interface argument {
        //引数名(Resultの場合省略可能)
        arg?: string;
        //表示名
        name: string;
        //説明
        desc: string;
        //型名
        type: argType;
        //型の最小値
        min?: number;
        //型の最大値
        max?: number;
        //設定できる数値の間隔
        step?: number;
    }

    Client.init();

}

