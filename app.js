var extension = require("./extension.js");
var c = new extension.Child.Client("certs/private.pem", "certs/public.pem", "certs/cert.pem", "config.json", "ConsoleTest");
c.regist(function (str) {
    console.log("message:" + str);
}, {
    name: "出力",
    args: [{ arg: "str", name: "文字列", desc: "出力する文字列", type: extension.Child.argType.string }],
    status: true,
    push: false,
    desc: "",
    auto: false,
    perm: extension.Child.destination.server,
    result: undefined
}, "output");
c.run();
//# sourceMappingURL=app.js.map