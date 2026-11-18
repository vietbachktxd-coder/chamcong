/**
 * CHẤM CÔNG GPS — BACKEND v2 (Google Apps Script + Google Sheets + Google Drive)
 * ------------------------------------------------------------------------------
 * Cài đặt: Google Sheet mới > Tiện ích mở rộng > Apps Script > dán file này > Lưu >
 *   chạy hàm setup() 1 lần (cấp quyền) > Triển khai > Tùy chọn triển khai mới > Ứng dụng web
 *   (Thực thi: Tôi · Quyền truy cập: Bất kỳ ai) > copy URL /exec vào config.js của app.
 * Nâng cấp backend: dán code mới > Triển khai > Quản lý triển khai > Sửa (bút chì) > Phiên bản mới.
 * Tài khoản quản trị đầu tiên: ADMIN / admin123 (bắt buộc đổi khi đăng nhập).
 */
const BACKEND_VERSION = '3.3.0';
const TZ = 'Asia/Ho_Chi_Minh';
const T = {
  NV: ['id', 'name', 'password', 'role', 'dept', 'shiftId', 'workDays', 'email', 'phone', 'deviceId', 'leaveQuota', 'siteIds', 'active', 'mustChange', 'startDate', 'title', 'empType', 'birthday', 'contractType', 'contractEnd', 'managerId', 'salary', 'note'],
  CA: ['id', 'name', 'start', 'end', 'breakMin', 'graceMin'],
  DD: ['id', 'name', 'lat', 'lng', 'radius', 'active', 'wifi'],
  CC: ['id', 'time', 'date', 'clientTime', 'empId', 'empName', 'dept', 'type', 'siteId', 'siteName', 'lat', 'lng', 'accuracy', 'distance', 'valid', 'photoId', 'offline', 'source', 'device', 'note', 'wifi', 'client'],
  DON: ['id', 'createdAt', 'empId', 'empName', 'dept', 'type', 'fromDate', 'toDate', 'fromTime', 'toTime', 'half', 'days', 'reason', 'status', 'approver', 'approvedAt', 'approverNote'],
  LE: ['date', 'name'],
  TB: ['id', 'time', 'to', 'title', 'body', 'by'],
  LC: ['date', 'empId', 'shiftId', 'by'],
  CFG: ['key', 'value']
};
const NAME = { NV: 'NhanVien', CA: 'CaLam', DD: 'DiaDiem', CC: 'ChamCong', DON: 'DonTu', LE: 'NgayLe', CFG: 'CauHinh', TB: 'ThongBao', LC: 'LichCa' };
const DEF = {
  company: 'Công ty CP ĐLGNVT XD Tân Cảng', maxAccuracy: '100', requireSelfie: 'TRUE', bindDevice: 'TRUE',
  allowOffline: 'TRUE', offlineMaxHours: '24', minAppVersion: '3.0.0', wifiMode: 'OFF', requireApp: 'FALSE', notifyRejected: 'TRUE', allowOutsideRequest: 'TRUE', standardDays: '26', otRate: '1.5', defaultLeaveQuota: '12',
  fullDayRatio: '0.9', remindEnabled: 'FALSE', remindAfterMin: '15', photoFolderId: ''
};
const REQ = { P: 'Nghỉ phép năm', O: 'Nghỉ ốm', KL: 'Nghỉ không lương', CT: 'Công tác / làm ngoài', QCC: 'Quên chấm công', DMVS: 'Đi muộn / về sớm', OT: 'Làm thêm giờ' };
const LEAVE_TYPES = ['P', 'O', 'KL', 'CT'];

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
  } else if (!MEMO['_h' + k]) {
    MEMO['_h' + k] = 1; const h = s.getRange(1, 1, 1, T[k].length).getDisplayValues()[0];
    if (h.join('|') !== T[k].join('|')) s.getRange(1, 1, 1, T[k].length).setValues([T[k]]);
  }
  return s;
}
function rows(k) {
  if (MEMO[k]) return MEMO[k];
  const v = sh(k).getDataRange().getDisplayValues(); v.shift();
  return (MEMO[k] = v.map((r, i) => { const o = { _r: i + 2 }; T[k].forEach((h, j) => o[h] = r[j]); return o; }));
}
function put(k, o, s) {
  s = s || sh(k);
  const r = s.getLastRow() + 1, vals = T[k].map(h => o[h] == null ? '' : String(o[h]));
  s.getRange(r, 1, 1, vals.length).setNumberFormat('@').setValues([vals]);
  delete MEMO[k]; return r;
}
function upd(k, o) {
  const vals = T[k].map(h => o[h] == null ? '' : String(o[h]));
  sh(k).getRange(o._r, 1, 1, vals.length).setNumberFormat('@').setValues([vals]);
  delete MEMO[k];
}
function del(k, r) { sh(k).deleteRow(r); delete MEMO[k]; }
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
      case 'directory': return { ok: true, list: rows('NV').filter(e => e.id && isT(e.active)).map(e => ({ id: e.id, name: e.name, title: e.title, dept: e.dept, phone: e.phone, email: e.email })) };
    }
    if (!QL) return { ok: false, error: 'Bạn không có quyền thực hiện chức năng này' };
    switch (a) {
      case 'dashboard': return dashboard(u, p.date || today(), c);
      case 'pending': return { ok: true, list: pendingFor(u), punches: pendingPunches(u) };
      case 'approvePunch': return W(() => approvePunch(u, p.id, p.decision, p.note));
      case 'schedule': return { ok: true, list: rows('LC').filter(x => x.date >= (p.from || '0') && x.date <= (p.to || '9') && scope(u).some(e => e.id === x.empId)), shifts: rows('CA') };
      case 'saveSchedule': return W(() => saveSchedule(u, p));
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
      case 'archive': return W(() => archive(p.before));
      case 'saveCfg': return W(() => { Object.keys(p.cfg || {}).forEach(k => { if (k in DEF && k !== 'photoFolderId') setCfg(k, String(p.cfg[k])); }); return { ok: true, cfg: cfg() }; });
    }
    return { ok: false, error: 'Yêu cầu không hợp lệ: ' + a };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
}

/* ============================ TÀI KHOẢN ============================ */
function login(p, c) {
  const e = emp(p.id);
  if (!e || !isT(e.active) || e.password !== hash(e.id, String(p.password || ''))) return { ok: false, error: 'Sai mã nhân viên hoặc mật khẩu' };
  const dev = String(p.deviceId || '');
  if (isT(c.bindDevice)) {
    if (!e.deviceId) { const l = LockService.getScriptLock(); l.waitLock(15000); try { MEMO = {}; const x = emp(e.id); x.deviceId = dev; upd('NV', x); } finally { l.releaseLock(); } }
    else if (e.deviceId !== dev) return { ok: false, error: 'Tài khoản đã gắn với điện thoại khác. Liên hệ quản trị để đổi thiết bị.' };
  }
  return { ok: true, token: makeToken(e.id, dev), mustChange: isT(e.mustChange) };
}
function changePw(u, p) {
  if (u.password !== hash(u.id, String(p.old || ''))) return { ok: false, error: 'Mật khẩu hiện tại không đúng' };
  if (String(p.pw || '').length < 6) return { ok: false, error: 'Mật khẩu mới tối thiểu 6 ký tự' };
  const e = emp(u.id); e.password = hash(e.id, p.pw); e.mustChange = 'FALSE'; upd('NV', e); return { ok: true };
}
function me(u, c) {
  const t = today(), logs = tailLogs(3000).filter(l => l.empId === u.id && l.date === t);
  const pub = {}; ['company', 'maxAccuracy', 'requireSelfie', 'allowOffline', 'offlineMaxHours', 'minAppVersion', 'wifiMode', 'requireApp'].forEach(k => pub[k] = c[k]);
  return { ok: true, me: pubEmp(u), shift: shiftOf(u), sites: sitesOf(u), cfg: pub, today: logs, serverTime: nowStr(), backend: BACKEND_VERSION,
    balance: leaveBalance(u, c), pending: (u.role === 'QL' || u.role === 'AD') ? pendingFor(u).length + pendingPunches(u).length : 0,
    holidays: rows('LE').filter(h => h.date >= t).slice(0, 10), reqTypes: REQ };
}

/* ============================ CHẤM CÔNG ============================ */
function punch(u, p, c, dev) {
  if (p.type !== 'IN' && p.type !== 'OUT') return { ok: false, error: 'Loại chấm công không hợp lệ' };
  const cid = String(p.cid || ''), tail = tailLogs(3000);
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
  const pend = rows('DON').filter(r => r.empId === u.id && r.type === 'P' && r.status === 'PENDING').reduce((s, r) => s + (+r.days || 0), 0);
  return { quota, used, pending: pend, left: quota - used };
}
function createRequest(u, r, c) {
  r = r || {}; const type = r.type;
  if (!REQ[type]) return { ok: false, error: 'Loại đơn không hợp lệ' };
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
  if (type === 'QCC' && toMin(r.fromTime) == null && toMin(r.toTime) == null) return { ok: false, error: 'Nhập giờ vào và/hoặc giờ ra cần bổ sung' };
  if (type === 'OT' && !(toMin(r.toTime) > toMin(r.fromTime))) return { ok: false, error: 'Giờ làm thêm không hợp lệ' };
  const dup = rows('DON').find(x => x.empId === u.id && x.type === type && x.status !== 'REJECTED' && x.status !== 'CANCELLED' && x.fromDate <= toDate && x.toDate >= r.fromDate);
  if (dup && LEAVE_TYPES.includes(type)) return { ok: false, error: 'Đã có đơn trùng thời gian' };
  put('DON', { id: uid('D'), createdAt: nowStr(), empId: u.id, empName: u.name, dept: u.dept, type, fromDate: r.fromDate, toDate, fromTime: r.fromTime || '', toTime: r.toTime || '',
    half: r.half && r.fromDate === toDate ? r.half : '', days, reason: String(r.reason).slice(0, 500), status: 'PENDING' });
  notifyApprovers(u, type, r.fromDate);
  notifyManagers(u, 'Đơn mới: ' + REQ[type], u.name + ' gửi đơn ' + REQ[type] + ' ngày ' + r.fromDate.split('-').reverse().join('/') + '. Vào Quản lý › Duyệt đơn.');
  return { ok: true };
}
function cancelRequest(u, id) {
  const r = rows('DON').find(x => x.id === id && x.empId === u.id); if (!r || r.status !== 'PENDING') return { ok: false, error: 'Chỉ hủy được đơn đang chờ duyệt' };
  r.status = 'CANCELLED'; upd('DON', r); return { ok: true };
}
function pendingFor(u) { const ids = new Set(scope(u).filter(e => e.id !== u.id || u.role === 'AD').map(e => e.id)); return rows('DON').filter(r => r.status === 'PENDING' && ids.has(r.empId)); }
function approve(u, id, decision, note) {
  const r = pendingFor(u).find(x => x.id === id); if (!r) return { ok: false, error: 'Không tìm thấy đơn hoặc không có quyền duyệt' };
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
function mail(to, sub, body) { try { MailApp.sendEmail(to, '[Chấm công] ' + sub, body); } catch (e) {} }

/* ============================ BẢNG CÔNG ============================ */
function timesheet(emps, month, c, pay) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) month = today().slice(0, 7);
  const from = month + '-01', to = dFmt(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)), t = today();
  const ids = new Set(emps.map(e => e.id)), hol = {}; rows('LE').forEach(h => hol[h.date] = h.name);
  const L = {}; rows('CC').forEach(l => { if (l.valid === 'TRUE' && ids.has(l.empId) && l.date >= from && l.date <= to) (L[l.empId + l.date] = L[l.empId + l.date] || []).push(l); });
  const R = rows('DON').filter(r => r.status === 'APPROVED' && ids.has(r.empId) && r.fromDate <= to && r.toDate >= from);
  const days = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push({ d, w: dow(d), hol: hol[d] || '' });
  const ratio = +c.fullDayRatio || 0.9, LCm = {}, CAm = {}; rows('LC').forEach(x => { if (ids.has(x.empId) && x.date >= from && x.date <= to) LCm[x.empId + x.date] = x.shiftId; }); rows('CA').forEach(x => CAm[x.id] = x);
  const out = emps.map(e => {
    const s0 = shiftOf(e);
    const wd = String(e.workDays || '1,2,3,4,5,6').split(',');
    const sum = { X: 0, P: 0, O: 0, KL: 0, CT: 0, L: 0, V: 0, late: 0, lateMin: 0, early: 0, earlyMin: 0, ot: 0, miss: 0, paid: 0 };
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
      return { c: parts.join('+').replace('+!', '!'), i: first != null ? hhmm(first) : '', o: last != null ? hhmm(last) : '', h: Math.round(mins / 6) / 10, l: late, e: early, ot: Math.round(ot * 10) / 10 };
    });
    sum.paid = sum.X + sum.P + sum.CT + sum.L; sum.ot = Math.round(sum.ot * 10) / 10;
    if (pay && +e.salary > 0) { const dayPay = +e.salary / (+c.standardDays || 26); sum.pay = Math.round(dayPay * sum.paid + dayPay / 8 * sum.ot * (+c.otRate || 1.5)); }
    return { empId: e.id, name: e.name, dept: e.dept, shift: s0.name, cells, sum };
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
  x = x || {}; const id = String(x.id || '').trim().toUpperCase();
  if (!/^[A-Z0-9_.-]{2,20}$/.test(id) || !String(x.name || '').trim()) return { ok: false, error: 'Mã NV (2-20 ký tự chữ/số) và họ tên là bắt buộc' };
  if (!['NV', 'QL', 'AD'].includes(x.role)) x.role = 'NV';
  const e = emp(id), base = e || { id, password: hash(id, '123456'), mustChange: 'TRUE', deviceId: '' };
  ['name', 'role', 'dept', 'shiftId', 'workDays', 'email', 'phone', 'leaveQuota', 'siteIds', 'startDate', 'title', 'empType', 'birthday', 'contractType', 'contractEnd', 'managerId', 'salary', 'note'].forEach(k => { if (x[k] != null) base[k] = String(x[k]).trim(); });
  base.active = x.active === false || x.active === 'FALSE' ? 'FALSE' : 'TRUE';
  if (!base.workDays) base.workDays = '1,2,3,4,5,6';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base.startDate || '')) base.startDate = today();
  e ? upd('NV', base) : put('NV', base); return { ok: true, created: !e };
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
function setup() { ['CFG', 'CA', 'DD', 'NV', 'CC', 'DON', 'LE', 'TB', 'LC'].forEach(sh); secret(); photoFolder(cfg()); return 'OK - đã khởi tạo';}
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
  const st = Math.max(2, last - 1500), v = s.getRange(st, 1, last - st + 1, T.TB.length).getDisplayValues();
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
  delete MEMO.LC; return { ok: true, count: ids.length * days.length };
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
