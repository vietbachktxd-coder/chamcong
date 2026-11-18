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
    /*__CODE_GS__*/
    return { api };
  })(SpreadsheetApp, PropertiesService, DriveApp, Utilities, LockService, MailApp, ContentService, ScriptApp, CacheService);

  root.ChamCongDemo = {
    api(p) { let r; try { r = mod.api(JSON.parse(JSON.stringify(p))); } finally { save(KEY, DB); } return JSON.parse(JSON.stringify(r)); },
    reset() { DB = {}; save(KEY, DB); }
  };
})(self);
