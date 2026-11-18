/* Giả lập Google Apps Script trong trình duyệt để chạy Code.gs ngay trên điện thoại (CHẾ ĐỘ DÙNG THỬ).
   Dữ liệu lưu trong bộ nhớ của máy (localStorage). File này được ghép với Code.gs thành web/demo-backend.js. */
(function (root) {
  'use strict';
  const KEY = 'cc2_demo_db', PKEY = 'cc2_demo_props', PH = 'cc2_demo_ph_';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const toBytes = x => typeof x === 'string' ? Array.from(enc.encode(x)) : Array.from(x).map(b => b & 255);

  /* ---- SHA-256 & HMAC (đồng bộ) ---- */
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(bytes) {
    const m = bytes.slice(), l = m.length * 8; m.push(0x80); while (m.length % 64 !== 56) m.push(0);
    for (let i = 7; i >= 0; i--) m.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < m.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    const out = []; H.forEach(x => out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255)); return out;
  }
  function hmac(msg, key) {
    let k = toBytes(key); if (k.length > 64) k = sha256(k); while (k.length < 64) k.push(0);
    return sha256(k.map(b => b ^ 0x5c).concat(sha256(k.map(b => b ^ 0x36).concat(toBytes(msg)))));
  }
  const b64 = bytes => { let s = ''; toBytes(bytes).forEach(b => s += String.fromCharCode(b)); return btoa(s); };
  const unb64 = s => Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

  /* ---- Sheet giả lập ---- */
  let DB = load(KEY, {});
  function Sheet(name, data) { this.name = name; this.data = data; }
  Sheet.prototype = {
    getRange(r, c, nr = 1, nc = 1) {
      const s = this; return {
        setValues(v) { for (let i = 0; i < v.length; i++) { const row = s.data[r - 1 + i] = s.data[r - 1 + i] || []; for (let j = 0; j < v[i].length; j++) row[c - 1 + j] = String(v[i][j]); } return this; },
        setValue(v) { return this.setValues([[v]]); },
        getDisplayValues() { const o = []; for (let i = 0; i < nr; i++) { const row = s.data[r - 1 + i] || [], x = []; for (let j = 0; j < nc; j++) x.push(row[c - 1 + j] == null ? '' : row[c - 1 + j]); o.push(x); } return o; },
        clearContent() { for (let i = 0; i < nr; i++) if (s.data[r - 1 + i]) s.data[r - 1 + i] = s.data[r - 1 + i].map(() => ''); while (s.data.length > 1 && !s.data[s.data.length - 1].some(String)) s.data.pop(); return this; },
        setNumberFormat() { return this; }, setFontWeight() { return this; }, setFontSize() { return this; }, setBackground() { return this; }, setWrap() { return this; }
      };
    },
    getDataRange() { const w = Math.max(1, ...this.data.map(r => r.length)); return this.getRange(1, 1, Math.max(1, this.data.length), w); },
    getLastRow() { return this.data.length; }, getMaxRows() { return 1000; }, setFrozenRows() { }, setFrozenColumns() { }, setColumnWidths() { },
    deleteRow(r) { this.data.splice(r - 1, 1); }, clear() { this.data.length = 0; }, getSheetId() { return 0; }
  };
  const book = {
    getSheetByName: n => DB[n] ? new Sheet(n, DB[n]) : null,
    insertSheet: n => new Sheet(n, DB[n] = []),
    getUrl: () => '#', getSheets: () => []
  };
  const SpreadsheetApp = { getActiveSpreadsheet: () => book, openById: () => book,
    create: n => { const sh = new Sheet(n, []); return { getSheets: () => [sh], getUrl: () => '#' }; } };
  const PropertiesService = { getScriptProperties: () => { const P = load(PKEY, {}); return { getProperty: k => P[k] == null ? null : P[k], setProperty: (k, v) => { P[k] = v; save(PKEY, P); } }; } };
  const blob = (bytes, type, name) => ({ getBytes: () => bytes, getContentType: () => type || 'application/octet-stream', getName: () => name, getDataAsString: () => dec.decode(new Uint8Array(bytes)) });
  const DriveApp = {
    createFolder: () => folder, getFolderById: () => folder,
    getFileById: id => { const x = load(PH + id, null); if (!x) throw new Error('Không có ảnh'); return { getBlob: () => blob(unb64(x.d), x.t) }; }
  };
  const folder = { getId: () => 'DEMO', createFile: b => {
    const id = 'P' + Date.now().toString(36); const list = load(PH + 'list', []);
    save(PH + id, { d: b64(b.getBytes()), t: b.getContentType() }); list.push(id);
    while (list.length > 40) { try { localStorage.removeItem(PH + list.shift()); } catch (e) { } }
    save(PH + 'list', list); return { getId: () => id };
  } };
  const pad = n => String(n).padStart(2, '0');
  const Utilities = {
    getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (Math.random() * 16 | 0).toString(16))),
    formatDate: (d, tz, f) => { const x = new Date(d.getTime() + 7 * 36e5); const s = x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate());
      return f === 'yyyy-MM-dd' ? s : s + ' ' + pad(x.getUTCHours()) + ':' + pad(x.getUTCMinutes()) + ':' + pad(x.getUTCSeconds()); },
    computeDigest: (a, s) => sha256(toBytes(s)), computeHmacSha256Signature: (s, k) => hmac(s, k),
    base64Encode: b => b64(b), base64EncodeWebSafe: b => b64(b).replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: s => unb64(s), base64Decode: s => unb64(s), newBlob: (b, t, n) => blob(b, t, n),
    DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }
  };
  const noop = { waitLock() { }, releaseLock() { } };
  const LockService = { getScriptLock: () => noop };
  const MailApp = { sendEmail() { } };
  const ContentService = { createTextOutput: s => ({ setMimeType() { return this; } }), MimeType: { JSON: 'json' } };
  const CacheService = { getScriptCache: () => ({ get: () => null, getAll: () => ({}), putAll() { }, remove() { } }) };
  const ScriptApp = { getProjectTriggers: () => [], deleteTrigger() { }, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() { } }) }) }) };

  const mod = (function (SpreadsheetApp, PropertiesService, DriveApp, Utilities, LockService, MailApp, ContentService, ScriptApp, CacheService) {
    /**
 * CHẤM CÔNG GPS — BACKEND v2 (Google Apps Script + Google Sheets + Google Drive)
 * ------------------------------------------------------------------------------
 * Cài đặt: Google Sheet mới > Tiện ích mở rộng > Apps Script > dán file này > Lưu >
 *   chạy hàm setup() 1 lần (cấp quyền) > Triển khai > Tùy chọn triển khai mới > Ứng dụng web
 *   (Thực thi: Tôi · Quyền truy cập: Bất kỳ ai) > copy URL /exec vào config.js của app.
 * Nâng cấp backend: dán code mới > Triển khai > Quản lý triển khai > Sửa (bút chì) > Phiên bản mới.
 * Tài khoản quản trị đầu tiên: ADMIN / admin123 (bắt buộc đổi khi đăng nhập).
 */
const BACKEND_VERSION = '3.5.1';
const TZ = 'Asia/Ho_Chi_Minh';
const T = {
  NV: ['id', 'name', 'password', 'role', 'dept', 'shiftId', 'workDays', 'email', 'phone', 'deviceId', 'leaveQuota', 'siteIds', 'active', 'mustChange', 'startDate', 'title', 'empType', 'birthday', 'contractType', 'contractEnd', 'managerId', 'salary', 'note', 'address', 'emergency', 'allowance', 'insSalary', 'dependents'],
  CA: ['id', 'name', 'start', 'end', 'breakMin', 'graceMin'],
  DD: ['id', 'name', 'lat', 'lng', 'radius', 'active', 'wifi'],
  CC: ['id', 'time', 'date', 'clientTime', 'empId', 'empName', 'dept', 'type', 'siteId', 'siteName', 'lat', 'lng', 'accuracy', 'distance', 'valid', 'photoId', 'offline', 'source', 'device', 'note', 'wifi', 'client'],
  DON: ['id', 'createdAt', 'empId', 'empName', 'dept', 'type', 'fromDate', 'toDate', 'fromTime', 'toTime', 'half', 'days', 'reason', 'status', 'approver', 'approvedAt', 'approverNote', 'level', 'history'],
  LE: ['date', 'name'],
  TB: ['id', 'time', 'to', 'title', 'body', 'by'],
  LC: ['date', 'empId', 'shiftId', 'by'],
  DG: ['id', 'time', 'date', 'empId', 'level', 'comment', 'customer', 'device'],
  CFG: ['key', 'value']
};
const NAME = { NV: 'NhanVien', CA: 'CaLam', DD: 'DiaDiem', CC: 'ChamCong', DON: 'DonTu', LE: 'NgayLe', CFG: 'CauHinh', TB: 'ThongBao', LC: 'LichCa', DG: 'DanhGiaKH' };
const DEF = {
  company: 'Công ty CP ĐLGNVT XD Tân Cảng', maxAccuracy: '100', requireSelfie: 'TRUE', bindDevice: 'FALSE', unit: '', taxCode: '', orgPhone: '', orgAddress: '',
  allowOffline: 'TRUE', offlineMaxHours: '24', minAppVersion: '3.0.0', wifiMode: 'OFF', requireApp: 'FALSE', notifyRejected: 'TRUE', allowOutsideRequest: 'TRUE', standardDays: '26', otRate: '1.5',
  selfRegister: 'TRUE', regApproval: 'TRUE', empPrefix: 'TCL', leaveL2Days: '3', leaveNoticeDays: '3',
  otWeekday: '1.5', otWeekend: '2', otHoliday: '3', otMonthCap: '40', otWeekCap: '12',
  insRate: '10.5', taxPersonal: '15500000', taxDependent: '6200000', taxTable: '10:5,30:10,60:20,100:30,0:35',
  rankXS: '100', rankTot: '90', rankKha: '75', bonusXS: '1000000', bonusTot: '500000', bonusKha: '0',
  rateXS: '3', rateTOT: '1', rateBT: '0', rateKEM: '-3', rateLimitPerDay: '1', defaultLeaveQuota: '12',
  fullDayRatio: '0.9', remindEnabled: 'FALSE', remindAfterMin: '15', photoFolderId: ''
};
const REQ = { DT: 'Xin đi trễ', VS: 'Xin về sớm', P: 'Nghỉ phép năm', NCL: 'Nghỉ có tính công (hiếu, hỉ, chế độ)', KL: 'Nghỉ không tính công', NDX: 'Nghỉ đột xuất', O: 'Nghỉ ốm', CT: 'Công tác / làm ngoài', QCC: 'Quên chấm công', OT: 'Đăng ký tăng ca', DMVS: 'Đi muộn / về sớm' };
const LEAVE_TYPES = ['P', 'O', 'KL', 'CT', 'NDX', 'NCL'];
const RATE = { XS: 'Xuất sắc', TOT: 'Tốt', BT: 'Bình thường', KEM: 'Kém' };

/* ============================ TIỆN ÍCH SHEET ============================ */
let MEMO = {};
const SHEET_ID = '1Eqh0OJLG_NAls0aqPVE8gHilba8QVqbnkYEqMiKsA_E'; // Google Sheet ChamCong_TCL_Data
let BOOK = null;
function book() { return BOOK || (BOOK = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet()); }
function sh(k) {
  let s = book().getSheetByName(NAME[k]);
  if (!s) {
    s = book().insertSheet(NAME[k]);
    s.getRange(1, 1, 1, T[k].length).setValues([T[k]]).setFontWeight('bold');
    s.setFrozenRows(1);
    s.getRange(1, 1, s.getMaxRows(), T[k].length).setNumberFormat('@');
    if (k === 'CFG') Object.keys(DEF).forEach(x => put('CFG', { key: x, value: DEF[x] }, s));
    if (k === 'CA') put('CA', { id: 'HC', name: 'Hành chính', start: '07:30', end: '17:00', breakMin: '90', graceMin: '5' }, s);
    if (k === 'NV') put('NV', { id: 'ADMIN', name: 'Quản trị hệ thống', password: hash('ADMIN', 'admin123'), role: 'AD', dept: 'TCHC', shiftId: 'HC', workDays: '1,2,3,4,5,6', active: 'TRUE', mustChange: 'TRUE', leaveQuota: '12', startDate: today() }, s);
  } else if (!MEMO['_h' + k] && !hdrOk(k)) {
    MEMO['_h' + k] = 1; hdrOk(k, 1); const h = s.getRange(1, 1, 1, T[k].length).getDisplayValues()[0];
    if (h.join('|') !== T[k].join('|')) s.getRange(1, 1, 1, T[k].length).setValues([T[k]]);
  }
  return s;
}
const CACHED = { CFG: 1, NV: 1, CA: 1, DD: 1, LE: 1, LC: 1, DON: 1 };
function cacheGet(k) {
  try { const c = CacheService.getScriptCache(), n = +c.get('R_' + k + '_n'); if (!n) return null;
    const parts = c.getAll(Array.from({ length: n }, (_, i) => 'R_' + k + '_' + i)), txt = Array.from({ length: n }, (_, i) => parts['R_' + k + '_' + i]);
    return txt.some(x => x == null) ? null : JSON.parse(txt.join('')); } catch (e) { return null; }
}
function cachePut(k, v) {
  try { const c = CacheService.getScriptCache(), t = JSON.stringify(v), o = {}, n = Math.ceil(t.length / 90000) || 1;
    for (let i = 0; i < n; i++) o['R_' + k + '_' + i] = t.slice(i * 90000, (i + 1) * 90000);
    o['R_' + k + '_n'] = String(n); c.putAll(o, 21600); } catch (e) { }
}
function hdrOk(k, set) { try { const c = CacheService.getScriptCache(), key = 'H_' + k + '_' + T[k].length; if (set) c.put(key, '1', 21600); else return !!c.get(key); } catch (e) { return false; } }
function cacheDrop(k) { try { CacheService.getScriptCache().remove('R_' + k + '_n'); } catch (e) { } }
function rows(k) {
  if (MEMO[k]) return MEMO[k];
  if (CACHED[k]) { const hit = cacheGet(k); if (hit) return (MEMO[k] = hit); }
  const v = sh(k).getDataRange().getDisplayValues(); v.shift();
  MEMO[k] = v.map((r, i) => { const o = { _r: i + 2 }; T[k].forEach((h, j) => o[h] = r[j]); return o; });
  if (CACHED[k]) cachePut(k, MEMO[k]);
  return MEMO[k];
}
function put(k, o, s) {
  s = s || sh(k);
  const r = s.getLastRow() + 1, vals = T[k].map(h => o[h] == null ? '' : String(o[h]));
  s.getRange(r, 1, 1, vals.length).setNumberFormat('@').setValues([vals]);
  delete MEMO[k]; if (CACHED[k]) cacheDrop(k); return r;
}
function upd(k, o) {
  const vals = T[k].map(h => o[h] == null ? '' : String(o[h]));
  sh(k).getRange(o._r, 1, 1, vals.length).setNumberFormat('@').setValues([vals]);
  delete MEMO[k]; if (CACHED[k]) cacheDrop(k);
}
function del(k, r) { sh(k).deleteRow(r); delete MEMO[k]; if (CACHED[k]) cacheDrop(k); }
function tailLogs(n) {
  const s = sh('CC'), last = s.getLastRow(); if (last < 2) return [];
  const st = Math.max(2, last - n + 1);
  return s.getRange(st, 1, last - st + 1, T.CC.length).getDisplayValues().map((r, i) => { const o = { _r: st + i }; T.CC.forEach((h, j) => o[h] = r[j]); return o; });
}
function cfg() { const c = Object.assign({}, DEF); rows('CFG').forEach(r => { if (r.key) c[r.key] = r.value; }); return c; }
function setCfg(k, v) { const r = rows('CFG').find(x => x.key === k); if (r) { r.value = v; upd('CFG', r); } else put('CFG', { key: k, value: v }); }
const isT = v => String(v).toUpperCase() === 'TRUE';
const uid = p => p + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
const nowStr = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
const today = () => nowStr().slice(0, 10);
const toMin = t => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = m => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
function dParse(ds) { const [y, m, d] = ds.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function dFmt(ms) { const d = new Date(ms); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
const addDays = (ds, n) => dFmt(dParse(ds) + n * 864e5);
const dow = ds => { const w = new Date(dParse(ds)).getUTCDay(); return w === 0 ? 7 : w; }; // 1=T2..7=CN
function dist(a, b, c, d) { const R = 6371000, r = x => x * Math.PI / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function verCmp(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; }

/* ============================ BẢO MẬT ============================ */
function secret() { const p = PropertiesService.getScriptProperties(); let s = p.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRET', s); } return s; }
function hash(id, pw) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, secret() + '|' + id + '|' + pw, Utilities.Charset.UTF_8)); }
function sign(s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret())); }
function makeToken(u, d) { const b = Utilities.base64EncodeWebSafe(JSON.stringify({ u, d, e: Date.now() + 180 * 864e5 })); return b + '.' + sign(b); }
function readToken(t) {
  try { const [b, s] = String(t || '').split('.'); if (!b || sign(b) !== s) return null;
    const o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b)).getDataAsString()); return o.e > Date.now() ? o : null; } catch (e) { return null; }
}
function pubEmp(e, pay) { const o = {}; T.NV.forEach(h => { if (h !== 'password' && (pay || h !== 'salary')) o[h] = e[h]; }); o.hasDevice = !!e.deviceId; delete o.deviceId; return o; }
function emp(id) { return rows('NV').find(e => e.id === String(id || '').trim().toUpperCase()); }
function shiftOf(e) { const c = rows('CA'); return c.find(s => s.id === e.shiftId) || c[0] || { id: 'HC', start: '07:30', end: '17:00', breakMin: '90', graceMin: '5' }; }
function sitesOf(e) { const all = rows('DD').filter(s => s.id && isT(s.active)).map(s => ({ id: s.id, name: s.name, lat: +s.lat, lng: +s.lng, radius: +s.radius, wifi: String(s.wifi || '').toLowerCase().split(',').map(x => x.trim()).filter(String) }));
  const ids = String(e.siteIds || '').split(',').map(x => x.trim()).filter(String); return ids.length ? all.filter(s => ids.includes(s.id)) : all; }
function scope(u) { return rows('NV').filter(e => e.id && (u.role === 'AD' || (u.role === 'QL' && e.dept === u.dept) || e.id === u.id)); }

/* ============================ HTTP ============================ */
function locked(fn) { const l = LockService.getScriptLock(); l.waitLock(15000); try { MEMO = {}; return fn(); } finally { l.releaseLock(); } }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) { return out(api((e && e.parameter) || {})); }
function doPost(e) { let p = {}; try { p = JSON.parse(e.postData.contents); } catch (x) {} return out(api(p)); }

function api(p) {
  MEMO = {};
  try {
    const a = p.action, c = cfg();
    if (a === 'ping') return { ok: true, backend: BACKEND_VERSION, minAppVersion: c.minAppVersion, company: c.company, time: nowStr() };
    if (p.appVersion && verCmp(p.appVersion, c.minAppVersion) < 0) return { ok: false, code: 'UPDATE', error: 'Ứng dụng đã cũ, cần cập nhật bản ' + c.minAppVersion };
    if (a === 'login') return login(p, c);
    if (a === 'register') return locked(() => register(p, c));
    if (a === 'rateInfo') { const e = emp(p.e); return e && isT(e.active) ? { ok: true, id: e.id, name: e.name, title: e.title, dept: e.dept, company: c.company, levels: RATE } : { ok: false, error: 'Không tìm thấy nhân viên' }; }
    if (a === 'rate') return locked(() => rate(p, c));
    const tk = readToken(p.token); const u = tk && emp(tk.u);
    if (!u || !isT(u.active)) return { ok: false, code: 'AUTH', error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' };
    if (isT(c.bindDevice) && u.deviceId && u.deviceId !== tk.d) return { ok: false, code: 'AUTH', error: 'Tài khoản đã được chuyển sang thiết bị khác' };
    const QL = u.role === 'QL' || u.role === 'AD', AD = u.role === 'AD';
    const W = fn => { const l = LockService.getScriptLock(); l.waitLock(15000); try { MEMO = {}; return fn(); } finally { l.releaseLock(); } };
    switch (a) {
      case 'me': return me(u, c);
      case 'changePw': return W(() => changePw(u, p));
      case 'punch': return W(() => punch(u, p, c, tk.d));
      case 'myMonth': return { ok: true, sheet: timesheet([u], p.month, c, true), logs: logsRange(p.month + '-01', p.month + '-31', [u.id]) };
      case 'myRequests': return { ok: true, list: rows('DON').filter(r => r.empId === u.id).reverse().slice(0, 100), balance: leaveBalance(u, c) };
      case 'createRequest': return W(() => createRequest(u, p.req, c));
      case 'cancelRequest': return W(() => cancelRequest(u, p.id));
      case 'photo': return photo(u, p.id, QL);
      case 'notifs': return notifs(u, p.since);
      case 'updateProfile': return W(() => updateProfile(u, p.profile));
      case 'myPayslip': { const ts = timesheet([u], p.month, c, true); return { ok: true, slip: ts.rows[0].slip, sum: ts.rows[0].sum, month: ts.month }; }
      case 'directory': return { ok: true, list: rows('NV').filter(e => e.id && isT(e.active)).map(e => ({ id: e.id, name: e.name, title: e.title, dept: e.dept, phone: e.phone, email: e.email })) };
    }
    if (!QL) return { ok: false, error: 'Bạn không có quyền thực hiện chức năng này' };
    switch (a) {
      case 'dashboard': return dashboard(u, p.date || today(), c);
      case 'pending': return { ok: true, list: pendingFor(u), punches: pendingPunches(u) };
      case 'approvePunch': return W(() => approvePunch(u, p.id, p.decision, p.note));
      case 'schedule': return { ok: true, list: rows('LC').filter(x => x.date >= (p.from || '0') && x.date <= (p.to || '9') && scope(u).some(e => e.id === x.empId)), shifts: rows('CA') };
      case 'saveSchedule': return W(() => saveSchedule(u, p));
      case 'evaluation': { const ts = timesheet(scope(u).filter(e => isT(e.active)), p.month, c, false);
        return { ok: true, month: ts.month, list: ts.rows.map(r => ({ empId: r.empId, name: r.name, dept: r.dept, score: r.sum.score, rank: r.sum.rank, detail: r.sum.scoreDetail, ratings: r.sum.ratings, paid: r.sum.paid })).sort((a, b) => b.score - a.score) }; }
      case 'ratings': return { ok: true, list: rows('DG').filter(x => x.date.slice(0, 7) === (p.month || today().slice(0, 7)) && scope(u).some(e => e.id === x.empId)).reverse().map(x => { const o = Object.assign({}, x); delete o._r; delete o.device; return o; }) };
      case 'approve': return W(() => approve(u, p.id, p.decision, p.note));
      case 'timesheet': return { ok: true, sheet: timesheet(scope(u).filter(e => isT(e.active) && (!p.dept || e.dept === p.dept)), p.month, c, u.role === 'AD') };
      case 'logs': return { ok: true, logs: logsRange(p.from, p.to, scope(u).map(e => e.id), p.all) };
      case 'employees': return { ok: true, list: scope(u).map(e => pubEmp(e, u.role === 'AD')), shifts: rows('CA'), sites: rows('DD'), holidays: rows('LE') };
      case 'exportSheet': return exportSheet(u, p.month, c);
      case 'announce': return W(() => { if (!String(p.title || '').trim()) return { ok: false, error: 'Nhập tiêu đề' };
        const to = u.role === 'AD' ? (p.dept ? 'DEPT:' + p.dept : '*') : 'DEPT:' + u.dept; notify(to, String(p.title).slice(0, 120), String(p.body || '').slice(0, 1000), u.id); return { ok: true }; });
    }
    if (!AD) return { ok: false, error: 'Chỉ quản trị viên được thực hiện' };
    switch (a) {
      case 'saveEmployee': return W(() => saveEmployee(p.emp));
      case 'resetDevice': return W(() => { const e = emp(p.id); e.deviceId = ''; upd('NV', e); return { ok: true }; });
      case 'resetPw': return W(() => { const e = emp(p.id); e.password = hash(e.id, '123456'); e.mustChange = 'TRUE'; upd('NV', e); return { ok: true }; });
      case 'saveShift': return W(() => saveSimple('CA', p.item, 'CA'));
      case 'deleteShift': return W(() => delSimple('CA', p.id));
      case 'saveSite': return W(() => saveSimple('DD', Object.assign({ active: 'TRUE' }, p.item), 'DD'));
      case 'deleteSite': return W(() => delSimple('DD', p.id));
      case 'saveHoliday': return W(() => { if (!/^\d{4}-\d{2}-\d{2}$/.test(p.item.date)) return { ok: false, error: 'Ngày không hợp lệ' };
        const r = rows('LE').find(x => x.date === p.item.date); r ? (r.name = p.item.name, upd('LE', r)) : put('LE', p.item); return { ok: true, list: rows('LE') }; });
      case 'deleteHoliday': return W(() => { const r = rows('LE').find(x => x.date === p.date); if (r) del('LE', r._r); return { ok: true, list: rows('LE') }; });
      case 'getCfg': return { ok: true, cfg: c };
      case 'payslips': { const ts = timesheet(scope(u).filter(e => isT(e.active)), p.month, c, true); return { ok: true, month: ts.month, list: ts.rows.map(r => Object.assign({ empId: r.empId, name: r.name, dept: r.dept, email: (emp(r.empId) || {}).email || '' }, r.slip || {})) }; }
      case 'sendPayslips': return sendPayslips(u, p, c);
      case 'approveEmployee': return W(() => { const e = emp(p.id); if (!e) return { ok: false, error: 'Không tìm thấy' }; e.active = p.decision === 'REJECT' ? 'FALSE' : 'TRUE'; upd('NV', e);
        notify(e.id, e.active === 'TRUE' ? 'Tài khoản đã được duyệt' : 'Đăng ký không được duyệt', e.active === 'TRUE' ? 'Bạn có thể đăng nhập bằng mã ' + e.id : 'Liên hệ Phòng TCHC', u.id); return { ok: true }; });
      case 'archive': return W(() => archive(p.before));
      case 'saveCfg': return W(() => { Object.keys(p.cfg || {}).forEach(k => { if (k in DEF && k !== 'photoFolderId') setCfg(k, String(p.cfg[k])); }); return { ok: true, cfg: cfg() }; });
    }
    return { ok: false, error: 'Yêu cầu không hợp lệ: ' + a };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
}

/* ============================ TÀI KHOẢN ============================ */
function login(p, c) {
  const e = emp(p.id);
  if (e && e.active === 'PENDING' && e.password === hash(e.id, String(p.password || ''))) return { ok: false, error: 'Tài khoản ' + e.id + ' đang chờ quản trị duyệt. Vui lòng liên hệ Phòng TCHC.' };
  if (!e || !isT(e.active) || e.password !== hash(e.id, String(p.password || ''))) return { ok: false, error: 'Sai mã nhân viên hoặc mật khẩu' };
  const dev = String(p.deviceId || '');
  if (isT(c.bindDevice)) {
    if (!e.deviceId) { const l = LockService.getScriptLock(); l.waitLock(15000); try { MEMO = {}; const x = emp(e.id); x.deviceId = dev; upd('NV', x); } finally { l.releaseLock(); } }
    else if (e.deviceId !== dev) return { ok: false, error: 'Tài khoản đã gắn với điện thoại khác. Liên hệ quản trị để đổi thiết bị.' };
  }
  const r = { ok: true, token: makeToken(e.id, dev), mustChange: isT(e.mustChange) };
  try { r.me = me(emp(e.id), cfg()); } catch (x) { }
  return r;
}
function changePw(u, p) {
  if (u.password !== hash(u.id, String(p.old || ''))) return { ok: false, error: 'Mật khẩu hiện tại không đúng' };
  if (String(p.pw || '').length < 6) return { ok: false, error: 'Mật khẩu mới tối thiểu 6 ký tự' };
  const e = emp(u.id); e.password = hash(e.id, p.pw); e.mustChange = 'FALSE'; upd('NV', e); return { ok: true };
}
function me(u, c) {
  const t = today(), logs = tailLogs(400).filter(l => l.empId === u.id && l.date === t);
  const pub = {}; ['company', 'maxAccuracy', 'requireSelfie', 'allowOffline', 'offlineMaxHours', 'minAppVersion', 'wifiMode', 'requireApp', 'leaveL2Days', 'leaveNoticeDays', 'allowOutsideRequest', 'unit'].forEach(k => pub[k] = c[k]);
  return { ok: true, me: pubEmp(u), shift: shiftOf(u), sites: sitesOf(u), cfg: pub, today: logs, serverTime: nowStr(), backend: BACKEND_VERSION,
    balance: leaveBalance(u, c), pending: (u.role === 'QL' || u.role === 'AD') ? pendingFor(u).length + pendingPunches(u).length : 0,
    holidays: rows('LE').filter(h => h.date >= t).slice(0, 10), reqTypes: REQ, notifs: notifs(u, '').list.slice(0, 20) };
}

/* ============================ CHẤM CÔNG ============================ */
function punch(u, p, c, dev) {
  if (p.type !== 'IN' && p.type !== 'OUT') return { ok: false, error: 'Loại chấm công không hợp lệ' };
  const cid = String(p.cid || ''), tail = tailLogs(800);
  if (cid) { const dup = tail.find(l => l.id === cid); if (dup) return { ok: dup.valid === 'TRUE', dup: true, time: dup.time, site: dup.siteName, error: dup.note }; }
  let time = nowStr(), offline = false;
  if (p.offline && p.clientTime) {
    if (!isT(c.allowOffline)) return { ok: false, error: 'Không cho phép chấm công ngoại tuyến' };
    const ct = new Date(p.clientTime).getTime(), diffH = (Date.now() - ct) / 36e5;
    if (isNaN(ct) || diffH < -0.1 || diffH > +c.offlineMaxHours) return { ok: false, error: 'Bản ghi ngoại tuyến quá hạn đồng bộ (' + c.offlineMaxHours + ' giờ)' };
    time = Utilities.formatDate(new Date(ct), TZ, 'yyyy-MM-dd HH:mm:ss'); offline = true;
  }
  const date = time.slice(0, 10), sites = sitesOf(u);
  if (!sites.length) return { ok: false, error: 'Chưa khai báo địa điểm làm việc cho bạn' };
  const lat = +p.lat, lng = +p.lng, acc = Math.round(+p.accuracy || 9999);
  if (isNaN(lat) || isNaN(lng)) return { ok: false, error: 'Không có tọa độ GPS' };
  let best = null; const pick = p.siteId ? sites.find(s => s.id === p.siteId) : null;
  if (pick) best = { s: pick, d: dist(lat, lng, pick.lat, pick.lng) };
  else sites.forEach(s => { const d = dist(lat, lng, s.lat, s.lng); if (!best || d < best.d) best = { s, d }; });
  const ssid = String(p.ssid || '').replace(/^"|"$/g, '').trim().toLowerCase(), bssid = String(p.bssid || '').trim().toLowerCase();
  const wifiSite = (ssid || bssid) ? sites.find(s => s.wifi.some(w => w && (w === ssid || w === bssid))) : null;
  const mode = String(c.wifiMode || 'OFF').toUpperCase();
  if (wifiSite && (mode === 'GPS_OR_WIFI' || best.d > best.s.radius)) best = { s: wifiSite, d: dist(lat, lng, wifiSite.lat, wifiSite.lng) };
  const d = Math.round(best.d); let note = '', source = wifiSite ? 'WIFI' : 'GPS';
  const gpsOk = acc <= +c.maxAccuracy && d <= best.s.radius, wifiOk = !!wifiSite && wifiSite.id === best.s.id;
  const ct = rows('DON').find(r => r.empId === u.id && r.type === 'CT' && r.status === 'APPROVED' && r.fromDate <= date && r.toDate >= date);
  if (isT(c.requireApp) && p.client !== 'android') note = 'Chỉ được chấm công bằng ứng dụng Android của công ty';
  else if (p.mock) note = 'Phát hiện vị trí giả lập (Fake GPS)';
  else if (ct && !(gpsOk || wifiOk)) source = 'CT';
  else if (mode === 'GPS_OR_WIFI') { if (!gpsOk && !wifiOk) note = (acc > +c.maxAccuracy ? 'Sai số GPS ' + acc + 'm' : 'Ngoài phạm vi ' + best.s.name + ' (cách ' + d + 'm)') + ' và không bắt Wi-Fi công ty'; }
  else {
    if (acc > +c.maxAccuracy) note = 'Sai số GPS ' + acc + 'm vượt mức ' + c.maxAccuracy + 'm';
    else if (d > best.s.radius) note = 'Ngoài phạm vi: cách ' + best.s.name + ' ' + d + 'm (cho phép ' + best.s.radius + 'm)';
    else if (mode === 'GPS_AND_WIFI' && !wifiOk) note = 'Chưa kết nối Wi-Fi của ' + best.s.name;
  }
  const geoNote = (!p.mock && !(isT(c.requireApp) && p.client !== 'android')) ? note : '';
  if (!note && isT(c.requireSelfie) && !p.photo) note = 'Thiếu ảnh xác thực khuôn mặt';
  const todays = tail.filter(l => l.empId === u.id && l.date === date && (l.valid === 'TRUE' || l.valid === 'PENDING')).sort((a, b) => a.time < b.time ? -1 : 1);
  const last = todays.length ? todays[todays.length - 1].type : '';
  const seqNote = p.type === 'IN' && last === 'IN' ? 'Bạn đã check-in lúc ' + todays[todays.length - 1].time.slice(11, 16) + ', cần check-out trước'
    : p.type === 'OUT' && last !== 'IN' ? 'Chưa có check-in trong ngày' : '';
  if (!note) note = seqNote;
  const canAsk = !!geoNote && note === geoNote && !seqNote && isT(c.allowOutsideRequest);
  const asking = canAsk && String(p.reason || '').trim().length > 2;
  if (asking) note = geoNote + ' | Lý do: ' + String(p.reason).trim().slice(0, 200);
  let photoId = '';
  if (p.photo) { try { photoId = savePhoto(p.photo, u.id + '_' + time.replace(/[: ]/g, '') + '_' + p.type, c); } catch (e) { if (!note && isT(c.requireSelfie)) note = 'Lỗi lưu ảnh: ' + e.message; } }
  const valid = !note || asking;
  put('CC', { id: cid || uid('C'), time, date, clientTime: p.clientTime || '', empId: u.id, empName: u.name, dept: u.dept, type: p.type, siteId: best.s.id, siteName: best.s.name,
    lat: lat.toFixed(6), lng: lng.toFixed(6), accuracy: acc, distance: d, valid: asking ? 'PENDING' : valid ? 'TRUE' : 'FALSE', photoId, offline: offline ? 'TRUE' : 'FALSE', source, device: String(dev || '').slice(0, 40) + ' ' + String(p.ua || '').slice(0, 80), note, wifi: ssid ? ssid + (bssid ? ' ' + bssid : '') : '', client: p.client || 'web' });
  if (asking) { notifyManagers(u, 'Chấm công cần duyệt: ' + u.name, time.slice(11, 16) + ' ' + (p.type === 'IN' ? 'vào ca' : 'ra ca') + ' ngoài vùng. ' + note + '. Vào Quản lý › Duyệt.');
    return { ok: true, pending: true, time, site: best.s.name, distance: d }; }
  if (!valid) { if (isT(c.notifyRejected)) notifyManagers(u, 'Cảnh báo chấm công: ' + u.name, time.slice(11, 16) + ' ' + (p.type === 'IN' ? 'check-in' : 'check-out') + ' bị từ chối: ' + note); return { ok: false, error: note, distance: d, canAsk }; }
  const sh = shiftOf(u), t = toMin(time.slice(11, 16));
  let extra = '';
  if (p.type === 'IN' && !todays.length && t > toMin(sh.start) + (+sh.graceMin || 0)) extra = 'Đi muộn ' + (t - toMin(sh.start)) + ' phút';
  if (p.type === 'OUT' && t < toMin(sh.end)) extra = 'Về sớm ' + (toMin(sh.end) - t) + ' phút';
  return { ok: true, time, site: best.s.name, distance: d, offline, extra, source };
}
function photoFolder(c) {
  if (c.photoFolderId) { try { return DriveApp.getFolderById(c.photoFolderId); } catch (e) {} }
  const f = DriveApp.createFolder('ChamCong_AnhXacThuc'); setCfg('photoFolderId', f.getId()); return f;
}
function savePhoto(dataUrl, name, c) {
  const m = String(dataUrl).match(/^data:(image\/\w+);base64,(.+)$/); if (!m) throw new Error('Ảnh không hợp lệ');
  if (m[2].length > 400000) throw new Error('Ảnh quá lớn');
  const f = photoFolder(c).createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '.jpg')); return f.getId();
}
function photo(u, id, QL) {
  const l = rows('CC').find(x => x.photoId === id); if (!l) return { ok: false, error: 'Không tìm thấy ảnh' };
  if (l.empId !== u.id && !(QL && scope(u).some(e => e.id === l.empId))) return { ok: false, error: 'Không có quyền xem ảnh' };
  const b = DriveApp.getFileById(id).getBlob(); return { ok: true, data: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) };
}
function logsRange(from, to, ids, all) {
  const set = new Set(ids);
  return rows('CC').filter(l => l.date >= (from || '0') && l.date <= (to || '9') && set.has(l.empId) && (all || l.valid === 'TRUE'))
    .map(l => { const o = Object.assign({}, l); delete o._r; delete o.device; return o; });
}

/* ============================ ĐƠN TỪ ============================ */
function workDaysBetween(e, from, to, half) {
  const wd = String(e.workDays || '1,2,3,4,5,6').split(','), hol = new Set(rows('LE').map(h => h.date)); let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (wd.includes(String(dow(d))) && !hol.has(d)) n++;
  return half ? n * 0.5 : n;
}
function leaveBalance(u, c) {
  const y = today().slice(0, 4), quota = +(u.leaveQuota || c.defaultLeaveQuota);
  const used = rows('DON').filter(r => r.empId === u.id && r.type === 'P' && r.status === 'APPROVED' && r.fromDate.slice(0, 4) === y).reduce((s, r) => s + (+r.days || 0), 0);
  const pend = rows('DON').filter(r => r.empId === u.id && r.type === 'P' && /^PENDING/.test(r.status)).reduce((s, r) => s + (+r.days || 0), 0);
  return { quota, used, pending: pend, left: quota - used };
}
function createRequest(u, r, c) {
  r = r || {}; const type = r.type;
  if (!REQ[type] || type === 'DMVS') return { ok: false, error: 'Loại đơn không hợp lệ' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fromDate || '')) return { ok: false, error: 'Chọn ngày' };
  const toDate = LEAVE_TYPES.includes(type) ? (r.toDate || r.fromDate) : r.fromDate;
  if (toDate < r.fromDate) return { ok: false, error: 'Ngày kết thúc phải sau ngày bắt đầu' };
  if (!String(r.reason || '').trim()) return { ok: false, error: 'Nhập lý do' };
  let days = '';
  if (LEAVE_TYPES.includes(type)) {
    days = workDaysBetween(u, r.fromDate, toDate, r.half && r.fromDate === toDate);
    if (!days) return { ok: false, error: 'Khoảng ngày không có ngày làm việc' };
    if (type === 'P') { const b = leaveBalance(u, c); if (days > b.left - b.pending) return { ok: false, error: 'Không đủ phép năm (còn ' + (b.left - b.pending) + ' ngày)' }; }
  }
  let level = '1';
  if (['P', 'KL', 'NCL', 'NDX'].includes(type) && +days >= +c.leaveL2Days) level = '2';
  if (type === 'P' && +days >= +c.leaveL2Days && r.fromDate < addDays(today(), +c.leaveNoticeDays))
    return { ok: false, error: 'Theo quy định, nghỉ phép từ ' + c.leaveL2Days + ' ngày phải đăng ký trước ít nhất ' + c.leaveNoticeDays + ' ngày. Trường hợp gấp, chọn "Nghỉ đột xuất".' };
  if (type === 'NDX' && r.fromDate > addDays(today(), 1)) return { ok: false, error: 'Nghỉ đột xuất chỉ áp dụng cho hôm nay/ngày mai hoặc ngày đã qua. Nghỉ có kế hoạch, chọn Nghỉ phép năm.' };
  if ((type === 'DT' || type === 'VS') && toMin(r.fromTime) == null) return { ok: false, error: type === 'DT' ? 'Nhập giờ dự kiến đến' : 'Nhập giờ dự kiến về' };
  if (type === 'QCC' && toMin(r.fromTime) == null && toMin(r.toTime) == null) return { ok: false, error: 'Nhập giờ vào và/hoặc giờ ra cần bổ sung' };
  if (type === 'OT' && !(toMin(r.toTime) > toMin(r.fromTime))) return { ok: false, error: 'Giờ làm thêm không hợp lệ' };
  const dup = rows('DON').find(x => x.empId === u.id && x.type === type && x.status !== 'REJECTED' && x.status !== 'CANCELLED' && x.fromDate <= toDate && x.toDate >= r.fromDate);
  if (dup && LEAVE_TYPES.includes(type)) return { ok: false, error: 'Đã có đơn trùng thời gian' };
  put('DON', { id: uid('D'), createdAt: nowStr(), empId: u.id, empName: u.name, dept: u.dept, type, fromDate: r.fromDate, toDate, fromTime: r.fromTime || '', toTime: r.toTime || '',
    half: r.half && r.fromDate === toDate ? r.half : '', days, reason: String(r.reason).slice(0, 500), status: 'PENDING', level, history: nowStr().slice(0, 16) + ' Gửi đơn' });
  notifyApprovers(u, type, r.fromDate);
  notifyManagers(u, 'Đơn mới: ' + REQ[type], u.name + ' gửi đơn ' + REQ[type] + ' ngày ' + r.fromDate.split('-').reverse().join('/') + '. Vào Quản lý › Duyệt đơn.');
  return { ok: true, level };
}
function cancelRequest(u, id) {
  const r = rows('DON').find(x => x.id === id && x.empId === u.id); if (!r || !/^PENDING/.test(r.status)) return { ok: false, error: 'Chỉ hủy được đơn đang chờ duyệt' };
  r.status = 'CANCELLED'; upd('DON', r); return { ok: true };
}
function pendingFor(u) { const ids = new Set(scope(u).filter(e => e.id !== u.id || u.role === 'AD').map(e => e.id)); return rows('DON').filter(r => ids.has(r.empId) && (r.status === 'PENDING' || (r.status === 'PENDING2' && u.role === 'AD'))); }
function approve(u, id, decision, note) {
  const r = pendingFor(u).find(x => x.id === id); if (!r) return { ok: false, error: 'Không tìm thấy đơn hoặc không có quyền duyệt' };
  r.history = (r.history ? r.history + ' | ' : '') + nowStr().slice(0, 16) + ' ' + (decision === 'APPROVE' ? 'Duyệt' : 'Từ chối') + ': ' + u.name + (note ? ' (' + note + ')' : '');
  if (decision === 'APPROVE' && r.level === '2' && r.status === 'PENDING' && u.role !== 'AD') {
    r.status = 'PENDING2'; upd('DON', r);
    rows('NV').filter(e => isT(e.active) && e.role === 'AD').forEach(e => notify(e.id, 'Đơn chờ duyệt cấp 2: ' + REQ[r.type], r.empName + ' · ' + r.days + ' ngày từ ' + r.fromDate.split('-').reverse().join('/') + ' · QL ' + u.name + ' đã duyệt'));
    notify(r.empId, 'Đơn đã qua duyệt cấp 1', REQ[r.type] + ' — chờ Ban Giám đốc/Quản trị duyệt cấp 2', u.id);
    return { ok: true, step: 2 };
  }
  r.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'; r.approver = u.id + ' - ' + u.name; r.approvedAt = nowStr(); r.approverNote = note || ''; upd('DON', r);
  if (r.status === 'APPROVED' && r.type === 'QCC') {
    const e = emp(r.empId), base = { date: r.fromDate, empId: e.id, empName: e.name, dept: e.dept, siteId: '', siteName: 'Bổ sung theo đơn', lat: '', lng: '', accuracy: '', distance: '', valid: 'TRUE', photoId: '', offline: 'FALSE', source: 'DON', device: '', note: 'Đơn ' + r.id + ' duyệt bởi ' + u.id };
    if (toMin(r.fromTime) != null) put('CC', Object.assign({}, base, { id: uid('C'), time: r.fromDate + ' ' + hhmm(toMin(r.fromTime)) + ':00', type: 'IN' }));
    if (toMin(r.toTime) != null) put('CC', Object.assign({}, base, { id: uid('C'), time: r.fromDate + ' ' + hhmm(toMin(r.toTime)) + ':00', type: 'OUT' }));
  }
  const e = emp(r.empId);
  notify(r.empId, 'Đơn ' + (r.status === 'APPROVED' ? 'đã được DUYỆT' : 'bị TỪ CHỐI'), REQ[r.type] + ' ngày ' + r.fromDate.split('-').reverse().join('/') + ' — ' + u.name + (note ? ': ' + note : ''), u.id);
  if (e && e.email) mail(e.email, 'Đơn ' + REQ[r.type] + ' ngày ' + r.fromDate + ' đã ' + (r.status === 'APPROVED' ? 'được DUYỆT' : 'bị TỪ CHỐI'), 'Người duyệt: ' + r.approver + (note ? '\nGhi chú: ' + note : ''));
  return { ok: true };
}
function notifyApprovers(u, type, date) {
  rows('NV').filter(e => isT(e.active) && e.email && e.id !== u.id && (e.role === 'AD' || (e.role === 'QL' && e.dept === u.dept)))
    .forEach(e => mail(e.email, 'Đơn mới cần duyệt: ' + REQ[type] + ' - ' + u.name, u.id + ' - ' + u.name + ' gửi đơn ' + REQ[type] + ' ngày ' + date + '. Mở ứng dụng Chấm công để duyệt.'));
}
function mail(to, sub, body, html) { try { MailApp.sendEmail(to, '[Chấm công] ' + sub, body, html ? { htmlBody: html } : {}); return true; } catch (e) { return false; } }

/* ============================ BẢNG CÔNG ============================ */
function timesheet(emps, month, c, pay) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) month = today().slice(0, 7);
  const from = month + '-01', to = dFmt(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)), t = today();
  const ids = new Set(emps.map(e => e.id)), hol = {}; rows('LE').forEach(h => hol[h.date] = h.name);
  const L = {}; rows('CC').forEach(l => { if (l.valid === 'TRUE' && ids.has(l.empId) && l.date >= from && l.date <= to) (L[l.empId + l.date] = L[l.empId + l.date] || []).push(l); });
  const R = rows('DON').filter(r => r.status === 'APPROVED' && ids.has(r.empId) && r.fromDate <= to && r.toDate >= from);
  const days = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push({ d, w: dow(d), hol: hol[d] || '' });
  const ratio = +c.fullDayRatio || 0.9, LCm = {}, CAm = {}; rows('LC').forEach(x => { if (ids.has(x.empId) && x.date >= from && x.date <= to) LCm[x.empId + x.date] = x.shiftId; }); rows('CA').forEach(x => CAm[x.id] = x);
  const DGm = {}; rows('DG').forEach(x => { if (ids.has(x.empId) && x.date.slice(0, 7) === month) (DGm[x.empId] = DGm[x.empId] || []).push(x.level); });
  const out = emps.map(e => {
    const s0 = shiftOf(e);
    const wd = String(e.workDays || '1,2,3,4,5,6').split(',');
    const sum = { X: 0, P: 0, O: 0, KL: 0, CT: 0, NDX: 0, NCL: 0, L: 0, V: 0, late: 0, lateMin: 0, early: 0, earlyMin: 0, ot: 0, otWD: 0, otWE: 0, otHol: 0, miss: 0, paid: 0 }, wk = {};
    const cells = days.map(D => {
      if (e.startDate && D.d < e.startDate) return { c: '', i: '', o: '', h: 0, l: 0, e: 0, ot: 0 };
      const ov = LCm[e.id + D.d], s = (ov && CAm[ov]) || s0, st = toMin(s.start), en = toMin(s.end), br = +s.breakMin || 0, gr = +s.graceMin || 0, std = Math.max(60, en - st - br);
      const ls = (L[e.id + D.d] || []).sort((a, b) => a.time < b.time ? -1 : 1);
      let first = null, last = null, open = null, mins = 0;
      ls.forEach(l => { const m = toMin(l.time.slice(11, 16)); if (l.type === 'IN') { if (first == null) first = m; if (open == null) open = m; } else if (open != null) { mins += m - open; open = null; last = m; } });
      if (first != null && last != null && first < 720 && last > 780) mins -= Math.min(br, mins);
      const isWd = ov === 'OFF' ? false : ov ? true : wd.includes(String(D.w));
      let work = mins >= std * ratio ? 1 : mins >= std * 0.45 ? 0.5 : 0;
      const reqs = R.filter(r => r.empId === e.id && r.fromDate <= D.d && r.toDate >= D.d);
      let late = first != null && first > st + gr ? first - st : 0, early = last != null && open == null && last < en ? en - last : 0, ot = 0;
      const parts = [];
      reqs.forEach(r => {
        if (r.type === 'DMVS') { late = 0; early = 0; }
        if (r.type === 'DT') late = 0;
        if (r.type === 'VS') early = 0;
        if (r.type === 'OT') ot += Math.max(0, (toMin(r.toTime) - toMin(r.fromTime)) / 60);
      });
      if (work) parts.push(work === 1 ? 'X' : 'X/2'), sum.X += work;
      let leaveVal = 0;
      if (isWd && !D.hol) reqs.filter(r => LEAVE_TYPES.includes(r.type)).forEach(r => {
        const v = r.half ? 0.5 : 1;
        if (r.type === 'CT') { if (work < 1) { const add = Math.min(v, 1 - work); sum.CT += add; leaveVal += add; parts.push(add === 1 ? 'CT' : 'CT/2'); } return; }
        const add = Math.min(v, Math.max(0, 1 - work - leaveVal)); if (!add) return;
        sum[r.type] += add; leaveVal += add; parts.push(r.type + (add === 1 ? '' : '/2'));
      });
      if (D.hol && isWd) { parts.push('L'); sum.L += 1; }
      if (!parts.length && isWd && D.d < t) { parts.push('V'); sum.V += 1; }
      if (open != null && D.d < t) { sum.miss++; parts.push('!'); }
      if (late) { sum.late++; sum.lateMin += late; } if (early) { sum.early++; sum.earlyMin += early; } sum.ot += ot;
      if (ot) { if (D.hol) sum.otHol += ot; else if (!isWd) sum.otWE += ot; else sum.otWD += ot; const wkey = addDays(D.d, 1 - D.w); wk[wkey] = (wk[wkey] || 0) + ot; }
      return { c: parts.join('+').replace('+!', '!'), i: first != null ? hhmm(first) : '', o: last != null ? hhmm(last) : '', h: Math.round(mins / 6) / 10, l: late, e: early, ot: Math.round(ot * 10) / 10 };
    });
    sum.paid = sum.X + sum.P + sum.CT + sum.L + sum.NCL; ['ot', 'otWD', 'otWE', 'otHol'].forEach(k => sum[k] = Math.round(sum[k] * 10) / 10);
    sum.otWeekMax = Math.round(Math.max(0, ...Object.values(wk)) * 10) / 10; sum.otWarn = sum.ot > +c.otMonthCap || sum.otWeekMax > +c.otWeekCap;
    evaluate(e, sum, month, c, DGm[e.id] || []);
    const slip = pay && +e.salary > 0 ? payslip(e, sum, c, month) : null; if (slip) sum.pay = slip.net;
    return { empId: e.id, name: e.name, dept: e.dept, shift: s0.name, cells, sum, slip };
  });
  return { month, days, rows: out };
}
function exportSheet(u, month, c) {
  const ts = timesheet(scope(u).filter(e => isT(e.active)), month, c), name = 'BangCong_' + ts.month + (u.role === 'QL' ? '_' + u.dept : '');
  let s = book().getSheetByName(name); if (s) s.clear(); else s = book().insertSheet(name);
  const head = ['Mã NV', 'Họ tên', 'Bộ phận'].concat(ts.days.map(d => d.d.slice(8) + '\n' + ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][d.w]))
    .concat(['Công TT', 'Phép', 'Ốm', 'KL', 'CT', 'Lễ', 'Vắng', 'Lần muộn', 'Phút muộn', 'Về sớm', 'OT (giờ)', 'Thiếu chấm', 'TỔNG CÔNG']);
  const data = ts.rows.map(r => [r.empId, r.name, r.dept].concat(r.cells.map(x => x.c)).concat([r.sum.X, r.sum.P, r.sum.O, r.sum.KL, r.sum.CT, r.sum.L, r.sum.V, r.sum.late, r.sum.lateMin, r.sum.early, r.sum.ot, r.sum.miss, r.sum.paid]));
  s.getRange(1, 1, 1, 1).setValue('BẢNG CHẤM CÔNG THÁNG ' + ts.month.slice(5) + '/' + ts.month.slice(0, 4) + ' — ' + c.company).setFontWeight('bold').setFontSize(13);
  s.getRange(3, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#dbeafe').setWrap(true);
  if (data.length) s.getRange(4, 1, data.length, head.length).setValues(data);
  s.setFrozenRows(3); s.setFrozenColumns(2); s.setColumnWidths(4, ts.days.length, 38);
  s.getRange(5 + data.length, 1).setValue('Ký hiệu: X đủ công · X/2 nửa công · P phép · O ốm · KL không lương · CT công tác · L lễ · V vắng · ! thiếu check-out');
  return { ok: true, url: book().getUrl() + '#gid=' + s.getSheetId() };
}

/* ============================ TỔNG QUAN ============================ */
function dashboard(u, date, c) {
  const emps = scope(u).filter(e => isT(e.active)), ids = new Set(emps.map(e => e.id));
  const logs = (date === today() ? tailLogs(3000) : rows('CC')).filter(l => l.date === date && ids.has(l.empId));
  const reqs = rows('DON').filter(r => r.status === 'APPROVED' && LEAVE_TYPES.includes(r.type) && r.fromDate <= date && r.toDate >= date);
  const hol = rows('LE').find(h => h.date === date);
  const list = emps.map(e => {
    const ls = logs.filter(l => l.empId === e.id && l.valid === 'TRUE').sort((a, b) => a.time < b.time ? -1 : 1), s = shiftOf(e);
    const ins = ls.filter(l => l.type === 'IN'), outs = ls.filter(l => l.type === 'OUT'), lv = reqs.find(r => r.empId === e.id);
    const first = ins[0] ? ins[0].time.slice(11, 16) : '', late = first && toMin(first) > toMin(s.start) + (+s.graceMin || 0) ? toMin(first) - toMin(s.start) : 0;
    const isWd = String(e.workDays || '1,2,3,4,5,6').split(',').includes(String(dow(date)));
    let st = 'Chưa chấm công';
    if (ls.length) st = ls[ls.length - 1].type === 'IN' ? 'Đang làm việc' : 'Đã về';
    else if (lv) st = REQ[lv.type]; else if (hol) st = 'Nghỉ lễ'; else if (!isWd) st = 'Ngày nghỉ';
    return { id: e.id, name: e.name, dept: e.dept, status: st, in: first, out: outs.length ? outs[outs.length - 1].time.slice(11, 16) : '', late, site: ins[0] ? ins[0].siteName : '', photoId: ins[0] ? ins[0].photoId : '' };
  });
  const count = k => list.filter(x => x.status === k).length;
  return { ok: true, date, list, stats: { total: list.length, working: count('Đang làm việc'), left: count('Đã về'), notYet: count('Chưa chấm công'),
    leave: list.filter(x => Object.values(REQ).includes(x.status)).length, late: list.filter(x => x.late).length },
    hr: hrAlerts(emps, date),
    alerts: logs.filter(l => l.valid === 'FALSE').map(l => ({ time: l.time.slice(11, 16), empId: l.empId, name: l.empName, note: l.note, lat: l.lat, lng: l.lng })) };
}
function saveEmployee(x) {
  x = x || {}; const id = String(x.id || '').trim().toUpperCase() || nextId(cfg());
  if (!/^[A-Z0-9_.-]{2,20}$/.test(id) || !String(x.name || '').trim()) return { ok: false, error: 'Mã NV (2-20 ký tự chữ/số) và họ tên là bắt buộc' };
  if (!['NV', 'QL', 'AD'].includes(x.role)) x.role = 'NV';
  const e = emp(id), base = e || { id, password: hash(id, '123456'), mustChange: 'TRUE', deviceId: '' };
  ['name', 'role', 'dept', 'shiftId', 'workDays', 'email', 'phone', 'leaveQuota', 'siteIds', 'startDate', 'title', 'empType', 'birthday', 'contractType', 'contractEnd', 'managerId', 'salary', 'note', 'address', 'emergency', 'allowance', 'insSalary', 'dependents'].forEach(k => { if (x[k] != null) base[k] = String(x[k]).trim(); });
  base.active = x.active === false || x.active === 'FALSE' ? 'FALSE' : 'TRUE';
  if (!base.workDays) base.workDays = '1,2,3,4,5,6';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base.startDate || '')) base.startDate = today();
  e ? upd('NV', base) : put('NV', base); return { ok: true, created: !e, id };
}
function saveSimple(k, item, prefix) {
  item = item || {}; if (!String(item.name || '').trim()) return { ok: false, error: 'Nhập tên' };
  if (k === 'DD' && (isNaN(parseFloat(item.lat)) || isNaN(parseFloat(item.lng)))) return { ok: false, error: 'Tọa độ không hợp lệ' };
  if (k === 'CA' && (toMin(item.start) == null || toMin(item.end) == null)) return { ok: false, error: 'Giờ ca không hợp lệ' };
  const r = item.id && rows(k).find(x => x.id === item.id);
  const o = Object.assign(r || { id: item.id || uid(prefix) }, item);
  r ? upd(k, o) : put(k, o); return { ok: true, list: rows(k) };
}
function delSimple(k, id) { const r = rows(k).find(x => x.id === id); if (r) del(k, r._r); return { ok: true, list: rows(k) }; }

/* ============================ NHẮC VIỆC & CÀI ĐẶT ============================ */
function setup() { ['CFG', 'CA', 'DD', 'NV', 'CC', 'DON', 'LE', 'TB', 'LC', 'DG'].forEach(sh); secret(); photoFolder(cfg()); return 'OK - đã khởi tạo';}
/** Chạy 1 lần để bật nhắc check-in qua email (mỗi 15 phút kiểm tra). */
function installReminder() { ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t)); ScriptApp.newTrigger('remindJob').timeBased().everyMinutes(15).create(); setCfg('remindEnabled', 'TRUE'); }
function remindJob() {
  MEMO = {}; const c = cfg(); if (!isT(c.remindEnabled)) return;
  const d = today(), now = toMin(nowStr().slice(11, 16)), p = PropertiesService.getScriptProperties(), key = 'REM_' + d;
  const done = JSON.parse(p.getProperty(key) || '[]'); if (rows('LE').some(h => h.date === d)) return;
  const logs = tailLogs(3000).filter(l => l.date === d && l.valid === 'TRUE');
  const lv = rows('DON').filter(r => r.status === 'APPROVED' && LEAVE_TYPES.includes(r.type) && r.fromDate <= d && r.toDate >= d).map(r => r.empId);
  rows('NV').filter(e => isT(e.active) && !done.includes(e.id) && !lv.includes(e.id) && String(e.workDays || '1,2,3,4,5,6').split(',').includes(String(dow(d)))).forEach(e => {
    const s = shiftOf(e); if (now < toMin(s.start) + (+c.remindAfterMin) || now > toMin(s.end)) return;
    if (logs.some(l => l.empId === e.id)) return;
    notify(e.id, 'Bạn chưa check-in hôm nay', 'Ca ' + s.name + ' bắt đầu lúc ' + s.start + '. Mở ứng dụng để chấm công.');
    mail(e.email, 'Bạn chưa check-in hôm nay', 'Chào ' + e.name + ', hệ thống chưa ghi nhận check-in ca ' + s.name + ' (' + s.start + ') ngày ' + d + '.'); done.push(e.id);
  });
  p.setProperty(key, JSON.stringify(done));
}

/* ============================ THÔNG BÁO & LƯU TRỮ ============================ */
function notify(to, title, body, by) { put('TB', { id: uid('N'), time: nowStr(), to, title, body, by: by || 'HT' }); }
function notifyManagers(u, title, body) {
  rows('NV').filter(e => isT(e.active) && e.id !== u.id && (e.role === 'AD' || (e.role === 'QL' && e.dept === u.dept))).forEach(e => notify(e.id, title, body));
}
function notifs(u, since) {
  const s = sh('TB'), last = s.getLastRow(); if (last < 2) return { ok: true, list: [], now: nowStr() };
  const st = Math.max(2, last - 150), v = s.getRange(st, 1, last - st + 1, T.TB.length).getDisplayValues();
  const mine = to => to === u.id || to === '*' || to === 'DEPT:' + u.dept;
  const list = v.map(r => Object.fromEntries(T.TB.map((h, i) => [h, r[i]]))).filter(n => mine(n.to) && (!since || n.time >= since)).reverse().slice(0, 50);
  return { ok: true, list, now: nowStr() };
}
function archive(before) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before || '')) return { ok: false, error: 'Chọn ngày' };
  const s = sh('CC'), v = s.getDataRange().getDisplayValues(), head = v.shift();
  const old = v.filter(r => r[2] < before), keep = v.filter(r => r[2] >= before);
  if (!old.length) return { ok: false, error: 'Không có dữ liệu trước ngày ' + before };
  const f = SpreadsheetApp.create('ChamCong_LuuTru_den_' + before), t = f.getSheets()[0];
  t.getRange(1, 1, 1, head.length).setValues([head]); t.getRange(2, 1, old.length, head.length).setNumberFormat('@').setValues(old);
  s.getRange(2, 1, Math.max(1, v.length), head.length).clearContent();
  if (keep.length) s.getRange(2, 1, keep.length, head.length).setNumberFormat('@').setValues(keep);
  delete MEMO.CC; return { ok: true, moved: old.length, url: f.getUrl() };
}

/* ============================ DUYỆT CHẤM CÔNG, XẾP CA, NHÂN SỰ ============================ */
function pendingPunches(u) {
  const ids = new Set(scope(u).filter(e => e.id !== u.id || u.role === 'AD').map(e => e.id));
  return rows('CC').filter(l => l.valid === 'PENDING' && ids.has(l.empId)).map(l => { const o = Object.assign({}, l); delete o._r; delete o.device; return o; });
}
function approvePunch(u, id, decision, note) {
  const l = rows('CC').find(x => x.id === id && x.valid === 'PENDING');
  if (!l || !pendingPunches(u).some(x => x.id === id)) return { ok: false, error: 'Không tìm thấy lượt chấm công chờ duyệt' };
  l.valid = decision === 'APPROVE' ? 'TRUE' : 'FALSE'; l.note = (l.note + ' | ' + (l.valid === 'TRUE' ? 'Duyệt' : 'Từ chối') + ': ' + u.name + (note ? ' - ' + note : '')).slice(0, 500); upd('CC', l);
  notify(l.empId, 'Chấm công ' + l.time.slice(11, 16) + ' ' + l.date.split('-').reverse().join('/') + (l.valid === 'TRUE' ? ' đã được DUYỆT' : ' bị TỪ CHỐI'), (note || '') + ' — ' + u.name, u.id);
  return { ok: true };
}
function saveSchedule(u, p) {
  const ids = (p.empIds || []).map(String), allowed = new Set(scope(u).map(e => e.id));
  if (!ids.length || ids.some(i => !allowed.has(i))) return { ok: false, error: 'Chọn nhân viên trong phạm vi quản lý' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(p.to || p.from) || (p.to || p.from) < p.from) return { ok: false, error: 'Khoảng ngày không hợp lệ' };
  const sid = String(p.shiftId || ''); if (sid && sid !== 'OFF' && sid !== 'DEFAULT' && !rows('CA').some(x => x.id === sid)) return { ok: false, error: 'Ca không tồn tại' };
  const to = p.to || p.from, days = []; for (let d = p.from; d <= to; d = addDays(d, 1)) { days.push(d); if (days.length > 93) return { ok: false, error: 'Tối đa 3 tháng mỗi lần' }; }
  const s = sh('LC'), v = s.getDataRange().getDisplayValues(), head = v.shift(), key = r => r[0] + '|' + r[1];
  const drop = new Set(); ids.forEach(i => days.forEach(d => drop.add(d + '|' + i)));
  const keep = v.filter(r => r[0] && !drop.has(key(r)));
  if (sid && sid !== 'DEFAULT') ids.forEach(i => days.forEach(d => keep.push([d, i, sid, u.id])));
  s.getRange(2, 1, Math.max(1, v.length), head.length).clearContent();
  if (keep.length) s.getRange(2, 1, keep.length, head.length).setNumberFormat('@').setValues(keep);
  delete MEMO.LC; cacheDrop('LC'); return { ok: true, count: ids.length * days.length };
}
function hrAlerts(emps, date) {
  const out = [], in30 = addDays(date, 30), mm = date.slice(5, 7);
  emps.forEach(e => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.contractEnd || '') && e.contractEnd <= in30) out.push({ kind: 'HD', id: e.id, name: e.name, text: (e.contractEnd < date ? 'Hợp đồng đã hết hạn ' : 'Hợp đồng hết hạn ') + e.contractEnd.split('-').reverse().join('/') });
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.birthday || '') && e.birthday.slice(5, 7) === mm) out.push({ kind: 'SN', id: e.id, name: e.name, text: 'Sinh nhật ' + e.birthday.slice(8) + '/' + mm });
    if (e.empType === 'Thử việc' && e.startDate && addDays(e.startDate, 60) <= in30) out.push({ kind: 'TV', id: e.id, name: e.name, text: 'Thử việc từ ' + e.startDate.split('-').reverse().join('/') + ' – cần đánh giá' });
  });
  return out;
}

/* ============================ ĐĂNG KÝ, HỒ SƠ, THI ĐUA, LƯƠNG, ĐÁNH GIÁ KH ============================ */
function nextId(c) {
  const pre = String(c.empPrefix || 'NV').toUpperCase().replace(/[^A-Z0-9]/g, ''), re = new RegExp('^' + pre + '(\\d+)$');
  let mx = 0; rows('NV').forEach(e => { const m = String(e.id).match(re); if (m) mx = Math.max(mx, +m[1]); });
  return pre + ('000' + (mx + 1)).slice(-4);
}
function register(p, c) {
  if (!isT(c.selfRegister)) return { ok: false, error: 'Công ty chưa mở đăng ký. Liên hệ Phòng TCHC để được cấp tài khoản.' };
  const name = String(p.name || '').trim(), phone = String(p.phone || '').replace(/[^0-9+]/g, ''), pw = String(p.password || '');
  if (name.length < 4 || phone.length < 9) return { ok: false, error: 'Nhập đủ họ tên và số điện thoại' };
  if (pw.length < 6) return { ok: false, error: 'Mật khẩu tối thiểu 6 ký tự' };
  if (rows('NV').some(e => e.phone && e.phone.replace(/[^0-9+]/g, '') === phone)) return { ok: false, error: 'Số điện thoại đã được đăng ký. Liên hệ Phòng TCHC nếu quên mã nhân viên.' };
  const id = nextId(c), need = isT(c.regApproval);
  put('NV', { id, name, password: hash(id, pw), role: 'NV', dept: String(p.dept || '').trim(), title: String(p.title || '').trim(), email: String(p.email || '').trim(), phone,
    birthday: /^\d{4}-\d{2}-\d{2}$/.test(p.birthday || '') ? p.birthday : '', shiftId: (rows('CA')[0] || {}).id || 'HC', workDays: '1,2,3,4,5,6', active: need ? 'PENDING' : 'TRUE',
    mustChange: 'FALSE', startDate: today(), empType: 'Thử việc', deviceId: '' });
  rows('NV').filter(e => isT(e.active) && e.role === 'AD').forEach(e => notify(e.id, 'Đăng ký tài khoản mới: ' + name, id + ' · ' + phone + ' · ' + (p.dept || '') + (need ? ' — vào Quản lý › Nhân viên để duyệt' : '')));
  return { ok: true, id, pending: need };
}
function updateProfile(u, x) {
  x = x || {}; const e = emp(u.id);
  ['phone', 'email', 'birthday', 'address', 'emergency'].forEach(k => { if (x[k] != null) e[k] = String(x[k]).trim().slice(0, 200); });
  if (e.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(e.birthday)) return { ok: false, error: 'Ngày sinh không hợp lệ' };
  upd('NV', e); return { ok: true, me: pubEmp(e) };
}
function evaluate(e, sum, month, c, ratings) {
  const pts = { XS: +c.rateXS, TOT: +c.rateTOT, BT: +c.rateBT, KEM: +c.rateKEM }, cnt = { XS: 0, TOT: 0, BT: 0, KEM: 0 };
  ratings.forEach(l => { if (l in cnt) cnt[l]++; });
  const rp = Object.keys(cnt).reduce((s, k) => s + cnt[k] * (pts[k] || 0), 0);
  const d = [['Điểm chuẩn', +c.scoreBase || 100], ['Đi trễ ' + sum.late + ' lần', -2 * sum.late], ['Về sớm ' + sum.early + ' lần', -2 * sum.early], ['Vắng ' + sum.V + ' ngày', -5 * sum.V],
    ['Nghỉ đột xuất ' + sum.NDX + ' ngày', -3 * sum.NDX], ['Thiếu chấm công ' + sum.miss + ' lần', -2 * sum.miss],
    ['Chuyên cần (không trễ/sớm/vắng)', !sum.late && !sum.early && !sum.V && !sum.miss && sum.X > 0 ? 5 : 0], ['Khách hàng đánh giá (' + ratings.length + ' lượt)', rp]];
  sum.score = d.reduce((s, x) => s + x[1], 0); sum.scoreDetail = d.filter(x => x[1]).map(x => x[0] + ': ' + (x[1] > 0 ? '+' : '') + x[1]);
  sum.ratings = cnt;
  sum.rank = sum.score >= +c.rankXS ? 'Xuất sắc' : sum.score >= +c.rankTot ? 'Tốt' : sum.score >= +c.rankKha ? 'Khá' : 'Cần cố gắng';
  if (sum.X + sum.P + sum.NCL + sum.CT === 0) sum.rank = 'Chưa xếp loại';
  sum.bonus = sum.rank === 'Xuất sắc' ? +c.bonusXS : sum.rank === 'Tốt' ? +c.bonusTot : sum.rank === 'Khá' ? +c.bonusKha : 0;
}
function pit(x, c) {
  if (x <= 0) return 0; let tax = 0, prev = 0;
  String(c.taxTable || '10:5,30:10,60:20,100:30,0:35').split(',').map(t => t.split(':').map(Number)).forEach(([cap, rate]) => {
    const top = cap ? cap * 1e6 : Infinity; if (x > prev) tax += (Math.min(x, top) - prev) * rate / 100; prev = top; });
  return Math.round(tax);
}
function payslip(e, sum, c, month) {
  const R0 = v => Math.round(v), base = +e.salary || 0, dayPay = base / (+c.standardDays || 26), hour = dayPay / 8;
  const work = R0(dayPay * sum.paid), otNormal = hour * sum.ot;
  const otPay = R0(hour * (sum.otWD * +c.otWeekday + sum.otWE * +c.otWeekend + sum.otHol * +c.otHoliday));
  const allowance = +e.allowance || 0, bonus = sum.bonus || 0, gross = work + otPay + allowance + bonus;
  const ins = R0((+e.insSalary || base) * (+c.insRate || 0) / 100), dep = +e.dependents || 0;
  const taxable = Math.max(0, gross - (otPay - otNormal) - ins - +c.taxPersonal - dep * +c.taxDependent), tax = pit(taxable, c);
  return { month, base, standardDays: +c.standardDays, paidDays: sum.paid, work, otWD: sum.otWD, otWE: sum.otWE, otHol: sum.otHol, otPay, allowance, rank: sum.rank, score: sum.score, bonus,
    gross, ins, dependents: dep, taxable: R0(taxable), tax, net: gross - ins - tax, late: sum.late, V: sum.V, P: sum.P, KL: sum.KL + sum.NDX };
}
function slipHtml(name, id, s, c) {
  const f = v => Number(v || 0).toLocaleString('vi-VN'), row = (a, b, bold) => '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">' + a + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right' + (bold ? ';font-weight:bold' : '') + '">' + b + '</td></tr>';
  return '<div style="font-family:Times New Roman,serif;max-width:560px"><h2 style="color:#0b5cad;margin:0">PHIẾU LƯƠNG THÁNG ' + s.month.slice(5) + '/' + s.month.slice(0, 4) + '</h2><p>' + c.company + '<br><b>' + name + '</b> — Mã NV: ' + id + '</p><table style="border-collapse:collapse;width:100%">' +
    row('Lương cơ bản', f(s.base)) + row('Công chuẩn / Công hưởng lương', s.standardDays + ' / ' + s.paidDays) + row('Lương theo công', f(s.work)) +
    row('Tăng ca: ngày thường ' + s.otWD + 'h · ngày nghỉ ' + s.otWE + 'h · lễ ' + s.otHol + 'h', f(s.otPay)) + row('Phụ cấp', f(s.allowance)) +
    row('Thưởng thi đua (' + s.rank + ', ' + s.score + ' điểm)', f(s.bonus)) + row('TỔNG THU NHẬP', f(s.gross), 1) + row('Trừ BHXH, BHYT, BHTN', '-' + f(s.ins)) +
    row('Thuế TNCN (người phụ thuộc: ' + s.dependents + ')', '-' + f(s.tax)) + row('THỰC LĨNH', f(s.net) + ' đ', 1) + '</table><p style="color:#666;font-size:12px">Đi trễ ' + s.late + ' lần · Vắng ' + s.V + ' ngày · Phép ' + s.P + ' · Không lương ' + s.KL + '. Phiếu lương tính tự động từ dữ liệu chấm công; thắc mắc liên hệ Phòng TCHC.</p></div>';
}
function sendPayslips(u, p, c) {
  const ts = timesheet(scope(u).filter(e => isT(e.active) && (!p.ids || p.ids.includes(e.id))), p.month, c, true); let sent = 0; const miss = [];
  ts.rows.forEach(r => { const e = emp(r.empId); if (!r.slip) return; if (!e.email) { miss.push(e.name); return; }
    if (mail(e.email, 'Phiếu lương tháng ' + ts.month.slice(5) + '/' + ts.month.slice(0, 4), 'Thực lĩnh: ' + r.slip.net, slipHtml(e.name, e.id, r.slip, c))) sent++;
    notify(e.id, 'Phiếu lương tháng ' + ts.month.slice(5) + '/' + ts.month.slice(0, 4), 'Thực lĩnh ' + r.slip.net.toLocaleString('vi-VN') + ' đ. Xem chi tiết ở mục Bảng công › Phiếu lương.', u.id); });
  return { ok: true, sent, miss };
}
function rate(p, c) {
  const e = emp(p.e); if (!e || !isT(e.active)) return { ok: false, error: 'Không tìm thấy nhân viên' };
  if (!RATE[p.level]) return { ok: false, error: 'Chọn mức đánh giá' };
  const d = today(), dev = String(p.deviceId || '').slice(0, 40);
  if (!dev) return { ok: false, error: 'Thiếu mã thiết bị' };
  if (rows('DG').filter(x => x.empId === e.id && x.date === d && x.device === dev).length >= +c.rateLimitPerDay) return { ok: false, error: 'Bạn đã đánh giá nhân viên này hôm nay. Cảm ơn quý khách!' };
  put('DG', { id: uid('G'), time: nowStr(), date: d, empId: e.id, level: p.level, comment: String(p.comment || '').slice(0, 500), customer: String(p.customer || '').slice(0, 100), device: dev });
  notify(e.id, 'Khách hàng đánh giá: ' + RATE[p.level], (p.customer ? p.customer + ': ' : '') + String(p.comment || '').slice(0, 200));
  if (p.level === 'KEM') notifyManagers(e, 'Khách hàng đánh giá KÉM: ' + e.name, (p.customer ? p.customer + ': ' : '') + String(p.comment || '').slice(0, 200));
  return { ok: true };
}

    return { api };
  })(SpreadsheetApp, PropertiesService, DriveApp, Utilities, LockService, MailApp, ContentService, ScriptApp, CacheService);

  root.ChamCongDemo = {
    api(p) { let r; try { r = mod.api(JSON.parse(JSON.stringify(p))); } finally { save(KEY, DB); } return JSON.parse(JSON.stringify(r)); },
    reset() { DB = {}; save(KEY, DB); }
  };
})(self);
