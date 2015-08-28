/// <reference path="Scripts/typings/node/node.d.ts" />
import dgram = require('dgram');
import tls = require('tls');
import net = require('net');
export declare module Child {
    /**
    *設定ファイルに保存する内容
    */
    interface Setting {
        guid: GUID;
        devi2c: string;
    }
    /**
    *UDPでサーバ探査時に送信する内容
    */
    interface udpMessage {
        name: string;
        guid: GUID;
        port: number;
    }
    /**
    *GUIDの値
    */
    class GUID {
        private bytes;
        /**
        *dataを設定して初期化する
        *@param {number[]} data GUIDのデータ(16Bytes)
        */
        constructor(data: number[]);
        /**
        *ランダムに生成し初期化する
        */
        constructor();
        /**
        *文字列から作成
        *@param {string} text GUIDの文字列FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF
        */
        constructor(text: string);
        /**
        *GUIDを文字列に変換
        *@return GUIDの文字列 FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF
        */
        toString(): string;
        /**
        *GUIDをJSONに変換(JSON.stringify用 )
        */
        toJSON(): string;
    }
    enum PinModes {
        Disabled = -1,
        Output = 0,
        PwmOut = 1,
        ServoOut = 2,
        AnalogIn = 4,
        PullDown = 5,
        PullUp = 6,
        Input = 7,
    }
    class IoExpander {
        /**
        *このインスタンスで扱うアドレス
        */
        slaveAddr: number;
        /**
        *I2Cのインスタンス
        */
        device: any;
        /**
        *デバイス名(デフォルト:/dev/i2c-*)
        */
        devName: string;
        /**
        *送信バッファ
        */
        private buffer;
        /**
        *バッファに書き込んだ数
        */
        private bufferCount;
        /**
        *新しいエキスパンダーを作成します
        *@param {number} Addr I2Cのアドレス
        */
        constructor(Addr: number, dev?: string);
        /**
        *コマンド番号とデータからArduinoの機能を呼び出す
        *@param {number} commandNo Arduino側で設定したコマンドの番号
        *@param {Buffer} datas 送信するデータ
        *@param {number} returnLength 返信時に要求する長さ
        *@param {(Error,Buffer)=>void} callback エラーや返信を受け取るコールバック関数
        */
        callCommand(commandNo: number, datas: Buffer, returnLength?: number, callback?: (err: Error, buff: Buffer) => void): any;
        /**
        *コマンド番号とデータからArduinoの機能を呼び出す
        *@param {number} commandNo Arduino側で設定したコマンドの番号
        *@param {number[]} datas 送信するデータ
        *@param {number} returnLength 返信時に要求する長さ
        *@param {(Error,Buffer)=>void} callback エラーや返信を受け取るコールバック関数
        */
        callCommand(commandNo: number, datas: number[], returnLength?: number, callback?: (err: Error, buff: Buffer) => void): any;
        /**
        *I2Cのバッファの中身を送信する
        *@param {(err:Error)=>void} callback エラー通知のコールバック
        */
        private sendBuff(callback);
        /**
        *I2Cのデータを要求する
        *@param {number} length 要求するバイト数
        *@param {(err:Error,buff:Buffer)=>void} callback エラー通知のコールバック
        */
        private getBytes(length, callback);
        /**
        *特定のビットを取得する
        *@param {number} value 値
        *@param {number} bit どのビットを返すか
        *@return 0 or 1
        */
        private static getBit(value, bit);
        /**
        *4bitの値にハミング符号で3Bit付け足す
        *@param {number} b4 元の4Bitの値
        *@return 変換した値
        */
        private static getHumming(b4);
        /**
        *送信バッファの最後にバイト値を追加する
        *@param {number} byte 送信する値
        */
        private addToBuff(byte);
        /**
        *ピンの入出力を設定する
        *@param {number} pinNo 設定するピン番号
        *@param {PinModes} mode 設定するモード
        */
        pinMode(pinNo: number, mode: PinModes): void;
        /**
        *デジタル値を出力する
        *
        *@param {number} pinNo 設定するピン番号
        *@param {boolean} state 出力(True=Hi)
        */
        digitalWrite(pinNo: number, state: boolean): any;
        /**
        *デジタル値を出力する
        *@param {boolean[]} states 設定値(長さは最大24)
        */
        digitalWrite(states: boolean[]): any;
        /**
        *PWMで出力する強さを設定する
        *@param {number} pinNo 設定するピン番号
        *@param {number} value 設定する値(0~255)
        */
        analogWrite(pinNo: number, value: number): void;
        /**
        *サーボモータの角度を設定する
        *@param {number} pinNo 設定するピン番号
        *@param {number} value 設定する値(0~180)
        */
        servoWrite(pinNo: number, angle: number): void;
        /**
        *アナログ値を読み取ります(0~1023)
        *@param {number} pinNo 読み取るピン番号
        *@param {(pinNo:number,value: number, Error: Error) => void} callback 返り値やエラーを読み取る
        */
        analogRead(pinNo: number, callback: (pinNo: number, value: number, Error: Error) => void): void;
        digitalRead(pinNo: number, callback: (pinNo: number, value: boolean, error: Error) => void): any;
        digitalRead(callback: (IDBCursorWithValue: Buffer, Error: Error) => void): any;
    }
    /**
    *子機
    */
    class Client {
        /**
        *udpの送信元のポート番号
        */
        srcPort: number;
        /**
        *udpのポートが開けなかった場合開きなおす範囲
        */
        portRange: number;
        /**
        *udpの送信先のポート番号
        */
        destPort: number;
        /**
        *tcp(tls)の受信するポート番号
        */
        tcpPort: number;
        /**
        *tcpポート番号の選ばれる最大
        */
        tcpMaxPort: number;
        /**
        *tcpポート番号の選ばれる最小
        */
        tcpMinPort: number;
        /**
        *UDPによる探索パケットの送信間隔
        */
        udpInterval: number;
        private _clientType;
        /**
        *子機の機能の種類
        */
        /**
        *子機の機能の種類
        */
        clientType: string;
        /**
        *サーバ検索時のメッセージ
        */
        private udpMessage;
        /**
        *サーバのアドレス
        */
        serverAddr: dgram.AddressInfo;
        /**
        *静的コンストラクタ
        */
        static init(): void;
        /**
        *UDPのソケット
        */
        udp: dgram.Socket;
        /**
        *プライベートキー
        */
        privateKey: any;
        /**
        *パブリックキー
        */
        publicKey: any;
        /**
        *証明書ファイル
        */
        cert: Buffer;
        /**
        *SSL(TLS)サーバ
        */
        ssl: tls.Server;
        /**
        *SSLソケット
        */
        socket: net.Socket;
        /**
        *サーバの探索が終わっているか否か
        *これがtrueになるまでUDPの送信を続ける
        */
        private serverFound;
        private funcNo;
        private registedFunc;
        private registerBuff;
        /**
        *SSLのメッセージを受けた際呼ばれる関数
        *@param {Client} client このインスタンス
        *@param {any} msg 受け取ったJSON(オブジェクトにParse済み)
        */
        onmessage: (client: Client, msg: any) => void;
        /**
        *初期化
        *@param {string} privateKey プライベートキーのパス
        *@param {string} publicKey パブリックキーのパス
        *@param {string} cert 証明書のパス
        *@param {string} setting 設定ファイルのパス
        *@param {string} clientType クライアントの種類
        */
        constructor(privateKey: string, publicKey: string, cert: string, setting: string, clientType: string);
        /**
        *使用できる関数を登録する
        *@param {Function} func 呼び出される関数
        *@param {funcDef} def 関数に関する情報
        *@param {string} name 関数名(重複不可)
        */
        register(func: Function, define: funcDef, name?: string): void;
        /**
        *プッシュ通知を行う
        *@param {string} name 関数名
        *@param {any} value 送る値
        */
        push(name: string, value: any): void;
        /**
        *関数の返り値を返す(自動で呼び出されます)
        *@param {string} name 関数名
        *@param {any} result 送りたい返り値
        *@param {boolean} cancelled キャンセルされたか
        *@param {Error} error エラーの内容
        */
        private sendResult(name, result, cancelled?, error?);
        /**
        *関数の返り値を返す(非同期用)
        *@param {string} name 関数名
        *@param {any} result 送りたい返り値
        */
        sendResultAsync(name: string, result: any): void;
        /**
        *検索、実行
        */
        run(): void;
        /**
        *TCP(SSL)受信時のイベント
        *@param {Buffer} msg 受信したバイナリ
        */
        private tcpReceived(msg);
        /**
        *@param {string} name 関数名
        *@param {any[]} args 引数一覧
        */
        private callFunction(name, args);
        /**
        *メッセージを送信します
        *@param {any} msg 送信するオブジェクト(JSONに変換されます)
        */
        private sendMessage(msg);
        /**
        *テキストのメッセージを送信します
        *@param {string} text 送信するテキスト(JSONの形式に従ってください)
        */
        private sendText(text);
        /**
        *SSLソケットでエラーが起こった時のイベント
        *@param {Error} err エラー
        */
        private tlsError(err);
        /**
        *ソケットのクローズ時のイベント
        *@param {boolean} had_error エラーのせいでソケットが閉じられたかのフラグ
        */
        private closed(had_error);
        /**
        *再接続を行う
        */
        private reconnect();
        /**
        *TCP(SSL)接続時のイベント
        *@param {net.Socket} socket 接続したソケット
        */
        private tcpConnected(socket);
        /**
        *UDPのポートを開ける
        *@return 成功したか(普通は大丈夫)
        */
        openUdp(): boolean;
        /**
        *サーバにudpメッセージ(GUID+クライアント名)を送る
        *searchServerによりスケジュールされます
        *@param {Client} client このクラス(this対策)
        *@param {Buffer} cipher 暗号化された送るもの
        *@param {number} interval 送る間隔
        */
        private sendSearcher(client, cipher, interval);
        /**
        *ssl(サーバ)でエラーが起きた時のイベント
        *@param {Error} err エラー内容
        */
        private sslError(err);
        /**
        *SSLのポートを開ける
        */
        private openSslPort(callback);
        /**
        *ポート番号の登録、受信時の処理の設定を行う
        */
        /**
        *サーバの探査を開始する
        *@param {number} interval 送信する間隔
        */
        searchServer(interval: number): void;
        /**
        *base64の暗号をキーを利用して文字列に復号化する
        *@param {string} base64化された暗号文
        */
        decrypt(msg: string): string;
        /**
        *文字列を暗号化してBase64変換を行う
        *@param {string} 送信したい文字列
        */
        encrypt(msg: string): string;
    }
    /**
    *子機からのメッセージのタイプ
    */
    enum msgType {
        result,
        function,
        message,
        call,
    }
    /**
    *送信先
    */
    enum destination {
        server,
        raspi,
        both,
    }
    /**
    *関数メッセージの内容の種類
    */
    enum funcmsgType {
        add,
        remove,
        state,
    }
    /**
    *関数に関する
    */
    interface funcDef {
        name: string;
        desc: string;
        perm: destination;
        status: boolean;
        auto: boolean;
        push: boolean;
        args: argument[];
        result: argument;
        sync: boolean;
    }
    enum argType {
        boolean,
        number,
        string,
        int,
        array,
        img,
        object,
    }
    interface argument {
        arg?: string;
        name: string;
        desc: string;
        type: argType;
        min?: number;
        max?: number;
        step?: number;
    }
}
