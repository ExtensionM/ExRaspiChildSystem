///<reference path="Scripts/typings/node/node.d.ts" />
//<reference path="Scripts/typings/es6-promise.d.ts"/>
import fs = require('fs');
var ursa = require('ursa');
import dgram = require('dgram');
import tls = require('tls');
import net = require('net');
var i2c = require('i2c');

export module Child {

    /**
    *設定ファイルに保存する内容
    */
    export interface Setting {
        guid: GUID;
        devi2c: string;
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

    enum Commands {
        //ピン入出力設定
        Destination = 1,
        //出力命令
        Output = 2,
        //出力命令ex
        OutputEx = 3,
        //PWM出力命令
        PwmOut = 4,
        //サーボ出力命令
        ServoOut = 5,
        //アナログ入力命令
        AnalogIn = 6,
        //入力命令
        InputEx = 7,
        //入力命令
        Input = 8
    }

    /*
    *ピンのモード
    */
    export enum PinModes {
        Disabled = -1,
        Output = 0,
        PwmOut = 1,
        ServoOut = 2,
        AnalogIn = 4,
        PullDown = 5,
        PullUp = 6,
        Input = 7
    }

    /*
    *送信バッファ
    */
    interface SendBuffer {
        //バッファ
        buffer: Buffer;
        //バッファ長
        length: number;
        //コールバック
        callback: Function;
    }

    export class IoExpander {
        /**
        *このインスタンスで扱うアドレス
        */
        public slaveAddr: number;
        /**
        *I2Cのインスタンス
        */
        public device: any;
        /**
        *デバイス名(デフォルト:/dev/i2c-*)
        */
        public devName: string;
        /**
        *送信バッファ
        */
        private buffer: Buffer = new Buffer(128);
        /**
        *バッファに書き込んだ数
        */
        private bufferCount: number = 0;
        /**
  *送信待ち状況
  */
        private sendWaitingCount: number = 0;
        /**
        *バッファやコールバックを持っている配列
        */
        private sendBuffer: SendBuffer[] = [];
        /**
              *新しいエキスパンダーを作成します
              *@param {number} Addr I2Cのアドレス
              */
        constructor(Addr: number, dev?: string) {
            if (0x07 < Addr && Addr < 0xf0) {
                this.slaveAddr = Addr;
                if (dev == undefined) {
                    if (fs.existsSync("/dev/i2c_dev"))
                        this.devName = "/dev/i2c_dev";
                    else {
                        var devs = fs.readdirSync("/dev/");
                        var reg = /i2c-\d+/;
                        var nums: number[] = [];
                        devs = devs.filter(function (value, index, array): boolean {
                            if (reg.test(value)) {
                                nums.push(parseInt(value.substr(4)));
                                return true;
                            }
                            return false;
                        });
                        var min: number = Math.min.apply({}, nums);
                        this.devName = "/dev/i2c-" + min.toString();
                    }
                } else if (fs.existsSync(dev)) {
                    this.devName = dev;
                }
                if (this.devName == undefined) {
                    throw new Error("i2cデバイスが見つかりません");
                }
                this.device = new i2c(Addr, { device: this.devName });

            } else {
                throw new Error("アドレスが範囲外です");
            }
        }

        /**
        *コマンド番号とデータからArduinoの機能を呼び出す
        *@param {number} commandNo Arduino側で設定したコマンドの番号
        *@param {Buffer} datas 送信するデータ
        *@param {number} returnLength 返信時に要求する長さ
        *@param {(Error,Buffer)=>void} callback エラーや返信を受け取るコールバック関数
        */
        public callCommand(commandNo: number, datas: Buffer, returnLength?: number, callback?: (err: Error, buff: Buffer) => void);
        /**
        *コマンド番号とデータからArduinoの機能を呼び出す
        *@param {number} commandNo Arduino側で設定したコマンドの番号
        *@param {number[]} datas 送信するデータ
        *@param {number} returnLength 返信時に要求する長さ
        *@param {(Error,Buffer)=>void} callback エラーや返信を受け取るコールバック関数
        */
        public callCommand(commandNo: number, datas: number[], returnLength?: number, callback?: (err: Error, buff: Buffer) => void);
        callCommand(commandNo: number, datas: any, returnLength?: number, callback?: (err: Error, buff: Buffer) => void) {
            this.addToBuff(commandNo);
            if ((<NodeBuffer>datas).writeUInt8) {
                datas.copy(this.buffer, this.bufferCount);
                this.bufferCount += datas.length;
            } else {
                for (var i: number = 0; i < datas.length; i++) {
                    this.addToBuff(datas[i]);
                }
            }
            this.sendBuff((err: Error) => {
                if (err) {
                    if (callback) callback(err, undefined);
                    return;
                }
                if (returnLength) this.getBytes(returnLength, callback);
            });
        }

        /**
        *I2Cのバッファの中身を送信する
        *@param {(err:Error)=>void} callback エラー通知のコールバック
        */
        private sendBuff(callback: (err: Error) => void) {
            var query: SendBuffer = { buffer: this.buffer, length: this.bufferCount, callback: callback };
            this.sendBuffer[this.sendWaitingCount];
            this.sendWaitingCount++;
            this.bufferCount = 0;

            var func = (): void=> {
                var send = this.sendBuffer[0];
                var b: Buffer = new Buffer(send.length - 1);
                send.buffer.copy(b, 0, 1);
                this.device.writeBytes(send.buffer[0], b,
                    (err: Error): void=> {
                        send.callback(err);
                        this.sendBuffer.shift();
                        this.sendWaitingCount--;
                        if (this.sendWaitingCount) func();
                    });
            };
            if (this.sendWaitingCount == 1) {
                //待機していない
                func();
            }
        }

        /**
        *I2Cのデータを要求する
        *@param {number} length 要求するバイト数 
        *@param {(err:Error,buff:Buffer)=>void} callback エラー通知のコールバック
        */
        private getBytes(length: number, callback: (err: Error, buff: Buffer) => void) {
            this.device.readBytes(0, length, callback);
        }

        /**
        *特定のビットを取得する
        *@param {number} value 値
        *@param {number} bit どのビットを返すか
        *@return 0 or 1
        */
        private static getBit(value: number, bit: number): number {
            return 1 & (value >> bit);
        }

        /**
        *4bitの値にハミング符号で3Bit付け足す
        *@param {number} b4 元の4Bitの値
        *@return 変換した値
        */
        private static getHumming(b4: number): number {
            var b = IoExpander.getBit;
            b4 |= (b(b4, 0) ^ b(b4, 1) ^ b(b4, 2)) << 4;
            b4 |= (b(b4, 1) ^ b(b4, 2) ^ b(b4, 3)) << 5;
            b4 |= (b(b4, 0) ^ b(b4, 1) ^ b(b4, 3)) << 6;
            return b4;
        }

        /**
        *送信バッファの最後にバイト値を追加する
        *@param {number} byte 送信する値
        */
        private addToBuff(byte: number) {
            var low: number = IoExpander.getHumming(byte & 0xf);
            var high: number = IoExpander.getHumming(0xf & (byte >> 4));
            this.buffer.writeUInt8(low, this.bufferCount);
            this.bufferCount++;
            this.buffer.writeUInt8(high, this.bufferCount);
            this.bufferCount++;
        }

        /**
        *ピンの入出力を設定する
        *@param {number} pinNo 設定するピン番号
        *@param {PinModes} mode 設定するモード
        */
        public pinMode(pinNo: number, mode: PinModes) {
            this.callCommand(Commands.Destination, [mode, pinNo]);
        }

        /**
        *デジタル値を出力する
        *
        *@param {number} pinNo 設定するピン番号
        *@param {boolean} state 出力(True=Hi)
        */
        public digitalWrite(pinNo: number, state: boolean)
        /**
        *デジタル値を出力する
        *@param {boolean[]} states 設定値(長さは最大24)
        */
        public digitalWrite(states: boolean[])
        digitalWrite(obj: any, state?: boolean) {
            if (state === undefined) {
                this.addToBuff(Commands.Output);
                var byte: number = 0;
                var states: boolean[] = obj;
                for (var i: number; i < 24; i++) {
                    if ((states[i] !== undefined) && states[i]) {
                        byte |= (i & 7) << 1;
                    }
                    if ((i & 7) == 7) {
                        this.addToBuff(byte);
                        byte = 0;
                    }
                }
            } else {
                this.addToBuff(Commands.OutputEx);
                var pinNo: number = obj;
                this.addToBuff(pinNo | (state ? 0x80 : 0));
            }
            this.sendBuff(function () { });
        }

        /**
        *PWMで出力する強さを設定する
        *@param {number} pinNo 設定するピン番号
        *@param {number} value 設定する値(0~255)
        */
        public analogWrite(pinNo: number, value: number) {
            this.callCommand(Commands.PwmOut, [pinNo, value]);
        }

        /**
        *サーボモータの角度を設定する
        *@param {number} pinNo 設定するピン番号
        *@param {number} value 設定する値(0~180)
        */
        public servoWrite(pinNo: number, angle: number) {
            this.callCommand(Commands.ServoOut, [pinNo, angle]);
        }

        /**
        *アナログ値を読み取ります(0~1023)
        *@param {number} pinNo 読み取るピン番号
        *@param {(pinNo:number,value: number, Error: Error) => void} callback 返り値やエラーを読み取る
        */
        public analogRead(pinNo: number, callback: (pinNo: number, value: number, Error: Error) => void): void {
            var th = this;
            this.addToBuff(Commands.AnalogIn);
            this.addToBuff(pinNo);
            this.sendBuff(function (err) {
                if (err)
                    callback(pinNo, -1, err);
                th.getBytes(3, function (err2, res) {
                    if (err2)
                        callback(pinNo, -1, err2);
                    callback(res[0], (res[1] << 2) | res[3], err);
                });
            });
        }

        public digitalRead(pinNo: number, callback: (pinNo: number, value: boolean, error: Error) => void)
        public digitalRead(callback: (IDBCursorWithValue: Buffer, Error: Error) => void)
        digitalRead(arg1, arg2?: (pinNo: number, value: boolean, error: Error) => void) {
            var th = this;
            if (arg2 === undefined) {
                var pinNo: number = arg1;
                var callback1: (pinNo: number, value: boolean, error: Error) => void = arg2;
                this.addToBuff(Commands.InputEx);
                this.addToBuff(pinNo);
                this.sendBuff(function (err) {
                    if (err)
                        callback1(pinNo, undefined, err);
                    th.getBytes(3, function (err2, res) {
                        if (err2)
                            callback1(pinNo, undefined, err2);
                        callback1(pinNo, (res[0] & 0x80) ? true : false, err);
                    });
                });
            } else {
                var callback2: (IDBCursorWithValue: Buffer, Error: Error) => void = arg1;
                this.addToBuff(Commands.Input);
                this.sendBuff(function (err) {
                    if (err)
                        callback2(undefined, err);
                    th.getBytes(3, function (err2, res) {
                        if (err2)
                            callback2(undefined, err2);
                        callback2(res, err);
                    });
                });
            }
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
                var config: Setting = { guid: guid, devi2c: "/dev/i2c-1" };
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
            var reg: registedFunc = <any> define;
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
            this.socket.write(new Buffer(text, "utf8"));
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

