// Ghép tools/demo-shim.js + backend/Code.gs -> web/demo-backend.js (chế độ dùng thử không cần máy chủ)
const fs = require('fs');
const code = fs.readFileSync(__dirname + '/../backend/Code.gs', 'utf8');
const shim = fs.readFileSync(__dirname + '/demo-shim.js', 'utf8');
fs.writeFileSync(__dirname + '/../web/demo-backend.js', shim.replace('/*__CODE_GS__*/', () => code));
console.log('web/demo-backend.js', fs.statSync(__dirname + '/../web/demo-backend.js').size, 'bytes');
