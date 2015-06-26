/// <reference path="Scripts/typings/node/node.d.ts" />
//var fs = require('fs');
//var ursa = require('ursa');
//var dgram = require('dgram');
var fs = require('fs');
var ursa = require('ursa');
var dgram = require('dgram');
var tls = require('tls');
var Child;
(function (Child) {
    /**
    *GUIDの値
    */
    var GUID = (function () {
        function GUID(arg) {
            var data;
            var text;
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
        GUID.prototype.toString = function () {
            var output = "";
            var lens = [4, 2, 2, 2, 6];
            var i, j;
            var index = 0;
            for (i = 0; i < lens.length; i++) {
                for (j = 0; j < lens[i]; j++) {
                    output += this.bytes[index].toString(16);
                    index++;
                }
                if (i + 1 != lens.length) {
                    output += '-';
                }
            }
            return output;
        };
        /**
        *GUIDをJSONに変換(JSON.stringify用 )
        */
        GUID.prototype.toJSON = function () {
            return this.toString();
        };
        return GUID;
    })();
    Child.GUID = GUID;
    /**
    *子機
    */
    var Client = (function () {
        /**
        *初期化
        *@param {string} privateKey プライベートキーのパス
        *@param {string} publicKey パブリックキーのパス
        *@param {string} cert 証明書のパス
        *@param {string} setting 設定ファイルのパス
        *@param {string} clientType クライアントの種類
        */
        function Client(privateKey, publicKey, cert, setting, clientType) {
            this._clientType = "Client";
            /**
            *サーバの探索が終わっているか否か
            *これがtrueになるまでUDPの送信を続ける
            */
            this.serverFound = false;
            //関数が登録されるたびに増える番号
            this.funcNo = 0;
            //登録された関数
            this.registedFunc = {};
            console.log("Reading Keys...");
            this.clientType = clientType;
            try {
                this.privateKey = ursa.createPrivateKey(fs.readFileSync(privateKey));
                this.publicKey = ursa.createPublicKey(fs.readFileSync(publicKey));
                this.cert = fs.readFileSync(cert);
            }
            catch (ex) {
                console.log("Key Config Error" + ex);
            }
            var guid = undefined;
            if (setting != undefined && fs.existsSync(setting)) {
                try {
                    var obj = JSON.parse(fs.readFileSync(setting).toString("utf8"));
                    if (obj.guid != undefined) {
                        guid = new GUID(obj.guid);
                    }
                }
                catch (ex) {
                }
            }
            if (guid == undefined) {
                guid = new GUID();
                var config = { guid: guid };
                try {
                    fs.writeFileSync(setting, JSON.stringify(config));
                }
                catch (ex) {
                    console.log("Cannot Write Config File : " + setting);
                }
            }
            this.udpMessage = { name: this.clientType, guid: guid };
            console.log("Read Keys");
            console.log("GUID : " + this.udpMessage.guid.toString());
            this.udp = dgram.createSocket("udp4");
        }
        Object.defineProperty(Client.prototype, "srcPort", {
            /**
            *udpの送信元のポート番号
            */
            get: function () {
                return 10001;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Client.prototype, "portRange", {
            /**
            *udpのポートが開けなかった場合開きなおす範囲
            */
            get: function () {
                return 100;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Client.prototype, "destPort", {
            /**
            *udpの送信先のポート番号
            */
            get: function () {
                return 8000;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Client.prototype, "tcpPort", {
            /**
            *tcp(tls)の受信するポート番号
            */
            get: function () {
                return 15000;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Client.prototype, "udpInterval", {
            /**
            *UDPによる探索パケットの送信間隔
            */
            get: function () {
                return 2500;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Client.prototype, "clientType", {
            /**
            *子機の機能の種類
            */
            get: function () {
                return this._clientType;
            },
            /**
            *子機の機能の種類
            */
            set: function (name) {
                if (name == undefined || name.replace(" ", "").replace("　", "") == "")
                    throw new Error("Clientの名前に空白は使用できません");
                if (name == "server")
                    throw new Error("Clientの名前に[server]は使用できません");
                this._clientType = name;
            },
            enumerable: true,
            configurable: true
        });
        /**
        *静的コンストラクタ
        */
        Client.init = function () {
        };
        /**
        *使用できる関数を登録する
        *@param {Function} func 呼び出される関数
        *@param {funcDef} def 関数に関する情報
        *@param {string} name 関数名(重複不可)
        */
        Client.prototype.regist = function (func, def, name) {
            if (name == undefined) {
                if (func.name == undefined || func.name == "") {
                    name = "function" + this.funcNo;
                    this.funcNo++;
                }
            }
            if (name in this.registedFunc) {
                throw new Error("Already Exist '" + name + "'");
            }
            var reg = def;
            reg.func = func;
            //登録
            this.registedFunc[name] = reg;
            var val;
            val = { function: name, type: funcmsgType.add, value: def };
            if (this.serverFound) {
                //サーバと接続済み
                var msg;
                msg = { id: this.udpMessage.guid, name: this.udpMessage.name, type: msgType.function, dest: destination.server, value: [val] };
                this.sendMessage(msg);
            }
            else {
                if (this.registerBuff == undefined) {
                    //バッファが存在しない
                    this.registerBuff = { id: this.udpMessage.guid, name: this.udpMessage.name, type: msgType.function, dest: destination.server, value: [val] };
                }
                else {
                    //バッファが既に存在
                    this.registerBuff.value.push(val);
                }
            }
        };
        /**
        *検索、実行
        */
        Client.prototype.run = function () {
            this.openUdp();
            this.openSslPort();
            this.searchServer(this.udpInterval);
        };
        /**
        *TCP(SSL)受信時のイベント
        *@param {Buffer} msg 受信したバイナリ
        */
        Client.prototype.tcpReceived = function (msg) {
            var that = this.this;
            var txt = msg.toString("utf8", 0, msg.length);
            var obj = JSON.parse(txt);
            switch (obj.type) {
                case msgType.function:
                    //親機からの関数呼び出し命令
                    var cMsg = obj;
                    if (cMsg.value.function != undefined) {
                        that.callFunction(cMsg.value.function, cMsg.value.args);
                    }
                    break;
            }
            /*
            try {
                var txt = msg.toString("utf8", 0, msg.length);
                try {
                    var obj = JSON.parse(txt);
                    console.log(txt);
                    var that: Client = (<any>this).this;
                    if (that.onmessage != undefined) {
                        that.onmessage(that, obj);
                    }
                } catch (ex) {
                    console.log('Parse Error :' + txt);
                }
            } catch (e) {
                console.log('Error Message' + e);
            }
            */
        };
        /**
        *@param {string} name 関数名
        *@param {any[]} args 引数一覧
        */
        Client.prototype.callFunction = function (name, args) {
            if (name in this.registedFunc) {
                //関数が存在するならば
                this.registedFunc[name].func.apply(this, args);
            }
            return false;
        };
        /**
        *メッセージを送信します
        *@param {any} msg 送信するオブジェクト(JSONに変換されます)
        */
        Client.prototype.sendMessage = function (msg) {
            this.sendText(JSON.stringify(msg));
        };
        /**
        *テキストのメッセージを送信します
        *@param {string} text 送信するテキスト(JSONの形式に従ってください)
        */
        Client.prototype.sendText = function (text) {
            this.socket.write(new Buffer(text, "utf8"));
        };
        /**
        *SSLソケットでエラーが起こった時のイベント
        *@param {Error} err エラー
        */
        Client.prototype.tlsError = function (err) {
            console.log("Socket Error : " + err.name);
            console.log(err.message);
        };
        /**
        *ソケットのクローズ時のイベント
        *@param {boolean} had_error エラーのせいでソケットが閉じられたかのフラグ
        */
        Client.prototype.closed = function (had_error) {
            var that = this.this;
            console.log("ReConnecting...");
            that.reconnect();
        };
        /**
        *再接続を行う
        */
        Client.prototype.reconnect = function () {
            this.searchServer(this.udpInterval);
        };
        /**
        *TCP(SSL)接続時のイベント
        *@param {net.Socket} socket 接続したソケット
        */
        Client.prototype.tcpConnected = function (socket) {
            var that = this.this;
            that.serverAddr = socket.address();
            that.socket = socket;
            that.socket.this = that;
            that.socket.on('data', that.tcpReceived);
            that.socket.on('error', that.tlsError);
            that.socket.on('close', that.closed);
            that.serverFound = true;
            console.log("SSL Connected");
            if (that.registerBuff != undefined) {
                that.sendMessage(that.registerBuff);
                that.registerBuff = undefined;
            }
        };
        /**
        *UDPのポートを開ける
        *@return 成功したか(普通は大丈夫)
        */
        Client.prototype.openUdp = function () {
            for (var portCount = 0; portCount < this.portRange; portCount++) {
                try {
                    var sender;
                    this.udp.bind(this.srcPort + portCount);
                }
                catch (ex) {
                    console.log("\rCannot Open Port Reconnecting... ( " + (portCount + 1) + "/" + this.portRange + " )");
                    continue;
                }
                console.log("Openned ( Port : " + (portCount + this.srcPort) + " )");
                return true;
            }
            return false;
        };
        /**
        *サーバにudpメッセージ(GUID+クライアント名)を送る
        *searchServerによりスケジュールされます
        *@param {Client} client このクラス(this対策)
        *@param {Buffer} cipher 暗号化された送るもの
        *@param {number} interval 送る間隔
        */
        Client.prototype.sendSearcher = function (client, cipher, interval) {
            var addr = client.udp.address();
            if (!client.serverFound) {
                client.udp.send(cipher, 0, cipher.length, client.destPort, "255.255.255.255");
                setTimeout(client.sendSearcher, interval, client, cipher, interval);
            }
        };
        /**
        *ssl(サーバ)でエラーが起きた時のイベント
        *@param {Error} err エラー内容
        */
        Client.prototype.sslError = function (err) {
            console.log('TlsServer Error : ' + err.name);
            console.log(err.message);
        };
        /**
        *SSLのポートを開ける
        */
        Client.prototype.openSslPort = function () {
            var k = this.privateKey.toPrivatePem();
            this.ssl = tls.createServer({ cert: this.cert, key: k });
            this.ssl.maxConnections = 1;
            this.ssl.listen(this.tcpPort);
            (this.ssl).this = this;
            this.ssl.on('secureConnection', this.tcpConnected);
            this.ssl.on('clientError', this.sslError);
        };
        /**
        *サーバの探査を開始する
        *@param {number} interval 送信する間隔
        */
        Client.prototype.searchServer = function (interval) {
            this.serverFound = false;
            var plane = JSON.stringify(this.udpMessage);
            var cipher = this.encrypt(plane);
            setTimeout(function (client) {
                client.udp.setBroadcast(true);
                setTimeout(client.sendSearcher, 0, client, new Buffer(cipher), interval);
            }, 0, this);
        };
        /**
        *base64の暗号をキーを利用して文字列に復号化する
        *@param {string} base64化された暗号文
        */
        Client.prototype.decrypt = function (msg) {
            return this.privateKey.decrypt(msg, 'base64', 'utf8');
        };
        /**
        *文字列を暗号化してBase64変換を行う
        *@param {string} 送信したい文字列
        */
        Client.prototype.encrypt = function (msg) {
            return this.publicKey.encrypt(msg, 'utf8', 'base64');
        };
        return Client;
    })();
    Child.Client = Client;
    /**
    *子機からのメッセージのタイプ
    */
    (function (msgType) {
        msgType[msgType["result"] = "result"] = "result";
        msgType[msgType["function"] = "function"] = "function";
        msgType[msgType["message"] = "message"] = "message";
        msgType[msgType["call"] = "call"] = "call";
    })(Child.msgType || (Child.msgType = {}));
    var msgType = Child.msgType;
    ;
    /**
    *送信先
    */
    (function (destination) {
        destination[destination["server"] = "server"] = "server";
        destination[destination["raspi"] = "raspi"] = "raspi";
        destination[destination["both"] = "both"] = "both";
    })(Child.destination || (Child.destination = {}));
    var destination = Child.destination;
    /**
    *関数メッセージの内容の種類
    */
    (function (funcmsgType) {
        funcmsgType[funcmsgType["add"] = "add"] = "add";
        funcmsgType[funcmsgType["remove"] = "remove"] = "remove";
        funcmsgType[funcmsgType["state"] = "state"] = "state";
    })(Child.funcmsgType || (Child.funcmsgType = {}));
    var funcmsgType = Child.funcmsgType;
    //引数の型
    (function (argType) {
        argType[argType["boolean"] = "boolean"] = "boolean";
        argType[argType["number"] = "number"] = "number";
        argType[argType["string"] = "string"] = "string";
        argType[argType["int"] = "int"] = "int";
        argType[argType["array"] = "[]"] = "array";
        argType[argType["img"] = "img"] = "img";
        argType[argType["object"] = "object"] = "object";
    })(Child.argType || (Child.argType = {}));
    var argType = Child.argType;
    Client.init();
})(Child = exports.Child || (exports.Child = {}));
//# sourceMappingURL=extension.js.map