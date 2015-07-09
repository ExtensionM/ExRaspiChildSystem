var extension = require("./extension.js");
var c = new extension.Child.Client("certs/private.pem", "certs/public.pem", "certs/cert.pem", "config.json", "ConsoleTest");
c.regist(function (str) {
    console.log("message:" + str);
}, {
    name: "出力",
    args: [{ arg: "str", name: "文字列", desc: "出力する文字列", type: extension.Child.argType.string }],
    status: true,
    push: false,
    desc: "文字を出力します",
    auto: false,
    perm: extension.Child.destination.server,
    result: undefined
}, "output");
var readStr;
c.regist(function () {
    return readStr;
}, {
    name: "入力",
    args: [],
    status: true,
    push: true,
    desc: "入力された文字をお知らせします",
    auto: false,
    perm: extension.Child.destination.server,
    result: { name: "文字列", desc: "入力された文字", type: extension.Child.argType.string }
}, "input");
process.stdin.on('data', function (chunk) {
    chunk.toString().trim().split('\n').forEach(function (line) {
        // 1行ずつ表示
        c.push("input", line);
    });
});
c.run();
//# sourceMappingURL=app.js.map