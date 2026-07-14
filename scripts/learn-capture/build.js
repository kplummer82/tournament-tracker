const fs = require("fs");
const path = require("path");

const dir = __dirname;
let html = fs.readFileSync(path.join(dir, "deck-template.html"), "utf8");

const dataUri = (file, mime) =>
  `data:${mime};base64,${fs.readFileSync(path.join(dir, file)).toString("base64")}`;

html = html.replace(/\{\{IMG:([^}]+)\}\}/g, (_, f) => dataUri(f, "image/png"));
html = html.replace(/\{\{FONT:([^}]+)\}\}/g, (_, f) => dataUri(f, "font/woff2"));

const out = path.join(dir, "defensive-lineup-guide.html");
fs.writeFileSync(out, html);
console.log(`${out}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
