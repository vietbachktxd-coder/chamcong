/* CHẤM CÔNG GPS — PWA client */
'use strict';
const VERSION = self.APP_VERSION || '0';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const LS = {
  get(k, d) { try { const v = localStorage.getItem('cc2_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('cc2_' + k, JSON.stringify(v)); } catch (e) { toast('Bộ nhớ máy đầy, không lưu được dữ liệu tạm', 'er'); } },
  del(k) { try { localStorage.removeItem('cc2_' + k); } catch (e) {} }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const vnDate = s => s ? s.slice(0, 10).split('-').reverse().join('/') : '';
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const ROLE = { NV: 'Nhân viên', QL: 'Quản lý', AD: 'Quản trị' };
const STATUS = { PENDING: 'Chờ duyệt', PENDING2: 'Chờ duyệt cấp 2', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' };
const money = v => Number(v || 0).toLocaleString('vi-VN');
const CRED = { get() { try { const x = LS.get('cred', null); return x ? JSON.parse(decodeURIComponent(escape(atob(x)))) : null; } catch (e) { return null; } },
  set(v) { LS.set('cred', btoa(unescape(encodeURIComponent(JSON.stringify(v))))); }, del() { LS.del('cred'); } };
function dist(a, b, c, d) { const R = 6371000, r = x => x * Math.PI / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 20).toUpperCase(); }

const NATIVE = (() => { try { return window.Native ? JSON.parse(Native.info()) : null; } catch (e) { return null; } })();
const isAndroid = /android/i.test(navigator.userAgent);
const S = { token: LS.get('token', ''), api: LS.get('api', '') || window.API_URL, device: NATIVE ? NATIVE.deviceId : (LS.get('device', '') || (() => { const d = 'D' + uuid(); LS.set('device', d); return d; })()),
  tab: 'home', sub: {}, offset: 0, pos: null, gpsErr: '', data: {}, maps: [] };

/* ---------------- UI helpers ---------------- */
function toast(m, t = '') { const d = document.createElement('div'); d.className = t; d.textContent = m; $('#toast').appendChild(d); setTimeout(() => d.remove(), t === 'er' ? 5500 : 3500); }
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hide'); }
function closeModal() { $('#modal').classList.add('hide'); $('#modalBody').innerHTML = ''; stopCam(); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function confirmBox(msg, ok) { modal(`<h3>Xác nhận</h3><p>${esc(msg)}</p><div class="acts"><button class="btn s" data-x="close">Hủy</button><button class="btn" id="cfOk">Đồng ý</button></div>`); $('#cfOk').onclick = () => { closeModal(); ok(); }; }
const busy = (btn, on) => { if (!btn) return; if (on) { btn.dataset.t = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>'; btn.disabled = true; } else { btn.innerHTML = btn.dataset.t || btn.innerHTML; btn.disabled = false; } };

/* ---------------- API ---------------- */
const isDemo = () => !S.api || /DAN_URL/.test(S.api);
const callV = (a, d) => call(a, d, { view: S.view });
const READ = new Set(['myMonth', 'myRequests', 'dashboard', 'pending', 'employees', 'timesheet', 'logs', 'schedule', 'evaluation', 'ratings', 'payslips', 'getCfg', 'directory', 'myPayslip', 'notifs']);
const RC = {}, INFL = {};
function rcKey(a, d) { return a + '|' + JSON.stringify(d || {}); }
async function call(action, data = {}, opt = {}) {
  if (READ.has(action) && !opt.fresh && !isDemo()) {
    const k = rcKey(action, data), hit = RC[k] || (LS.get('rc', {})[k]);
    const refresh = () => INFL[k] || (INFL[k] = rawCall(action, data, opt).then(j => { delete INFL[k];
      if (j && j.ok) { const changed = JSON.stringify(j) !== JSON.stringify(RC[k] || hit); RC[k] = j; saveRC(k, j); if (hit && changed && opt.view === S.view) { S.rerender = true; rerender(); } }
      return j; }));
    if (hit && hit.ok) { RC[k] = hit; refresh(); return hit; }
    return refresh();
  }
  const j = await rawCall(action, data, opt);
  if (!READ.has(action) && j && j.ok && action !== 'me' && action !== 'login') { for (const k in RC) delete RC[k]; LS.set('rc', {}); }
  return j;
}
function saveRC(k, j) { if (/payslips|myPayslip|timesheet|logs/.test(k)) return; try { const all = LS.get('rc', {}); all[k] = j; const ks = Object.keys(all); if (ks.length > 30) delete all[ks[0]]; LS.set('rc', all); } catch (e) { } }
let RRT = null;
function rerender() { clearTimeout(RRT); RRT = setTimeout(() => { if ($('#modal').classList.contains('hide') && !S.punching && !document.activeElement.matches('input,textarea,select')) render(); }, 300); }
async function rawCall(action, data = {}, opt = {}) {
  if (isDemo()) {
    if (!window.ChamCongDemo) return { ok: false, error: 'Chưa cấu hình địa chỉ máy chủ' };
    await new Promise(r => setTimeout(r, 120));
    const j = ChamCongDemo.api({ action, token: S.token, appVersion: VERSION, ...data });
    if (j.code === 'AUTH' && !opt.noLogout) { toast(j.error, 'er'); logout(true); }
    return j;
  }
  try {
    const r = await fetch(S.api, { method: 'POST', body: JSON.stringify({ action, token: S.token, appVersion: VERSION, ...data }), redirect: 'follow' });
    const j = await r.json();
    if (j.code === 'AUTH' && !opt.noLogout) { if (!opt.retried && await autoRelogin()) return call(action, data, { ...opt, retried: true }); toast(j.error, 'er'); logout(true); }
    if (j.code === 'UPDATE') { checkUpdate(true); }
    return j;
  } catch (e) { return { ok: false, net: true, error: 'Không có kết nối mạng hoặc máy chủ không phản hồi' }; }
}

/* ---------------- Cập nhật tự động (Service Worker) ---------------- */
let REG = null;
async function initSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    REG = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    const watch = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) applyUpdate(w); });
    if (REG.waiting && navigator.serviceWorker.controller) applyUpdate(REG.waiting);
    REG.addEventListener('updatefound', () => watch(REG.installing));
    let reloaded = false; const hadCtrl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || !hadCtrl) return; reloaded = true; LS.set('justUpdated', 1); location.reload(); });
    setInterval(() => REG.update().catch(() => {}), 30 * 60e3);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') REG.update().catch(() => {}); });
  } catch (e) { console.warn(e); }
}
function applyUpdate(w) {
  if (S.punching) { setTimeout(() => applyUpdate(w), 5000); return; }
  toast('Đang cài phiên bản mới…'); setTimeout(() => w.postMessage('SKIP_WAITING'), 800);
}
async function checkUpdate(forced) {
  if (NATIVE && forced === 'manual') Native.checkUpdate(true);
  if (!REG) { if (forced) toast('Hãy tải lại trang để cập nhật', 'er'); return; }
  try { await REG.update(); if (!REG.installing && !REG.waiting && forced === 'manual') toast('Bạn đang dùng bản mới nhất ' + VERSION, 'ok'); } catch (e) { if (forced) toast('Không kiểm tra được bản mới (mất mạng?)', 'er'); }
}

/* ---------------- Cài ứng dụng ---------------- */
let INSTALL = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL = e; render(); });
const isStandalone = () => !!NATIVE || matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
function installApp() {
  if (isAndroid && !NATIVE) { location.href = 'download/'; return; }
  if (INSTALL) { INSTALL.prompt(); INSTALL.userChoice.then(() => { INSTALL = null; render(); }); return; }
  modal(`<h3>Cài ứng dụng lên điện thoại</h3>${isIOS ? '<p><b>iPhone (Safari):</b> bấm nút <b>Chia sẻ ⬆︎</b> ở thanh dưới → <b>Thêm vào MH chính</b> → <b>Thêm</b>.</p>'
    : '<p><b>Android (Chrome):</b> bấm menu <b>⋮</b> góc trên → <b>Cài đặt ứng dụng</b> (hoặc <b>Thêm vào màn hình chính</b>).</p>'}<p class="muted">Sau khi cài, mở app từ biểu tượng "Chấm công" trên màn hình chính. App tự cập nhật khi có bản mới.</p><div class="acts"><button class="btn" data-x="close">Đã hiểu</button></div>`);
}

/* ---------------- Đồng hồ máy chủ & GPS ---------------- */
const now = () => new Date(Date.now() + S.offset);
setInterval(() => { const c = $('#clock'); if (c) { const n = now(); c.textContent = pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds()); } }, 1000);
let WATCH = null;
function startGPS() {
  if (NATIVE) {
    if (WATCH != null) return; WATCH = 'native';
    window.__nativeLoc = l => { if (l.mock) S.mockAt = Date.now(); if (!S.pos || l.t >= S.pos.t - 1000 && (l.acc <= S.pos.acc + 15 || Date.now() - S.pos.t > 8000)) S.pos = { lat: l.lat, lng: l.lng, acc: l.acc, t: l.t, mock: !!l.mock, provider: l.provider }; S.gpsErr = ''; updateGeo(); };
    window.__nativeLocErr = c => { S.gpsErr = c === 'perm' ? 'Chưa cấp quyền Vị trí cho ứng dụng. Bấm vào đây để mở Cài đặt → Quyền → Vị trí → Cho phép.' : 'Vị trí (GPS) của máy đang tắt. Bấm vào đây để bật Vị trí.'; S.gpsErrKind = c; updateGeo(); };
    Native.startLocation(); return;
  }
  if (WATCH != null || !navigator.geolocation) { if (!navigator.geolocation) S.gpsErr = 'Thiết bị không hỗ trợ định vị'; return; }
  WATCH = navigator.geolocation.watchPosition(p => { S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; S.gpsErr = ''; updateGeo(); },
    e => { S.gpsErr = e.code === 1 ? 'Chưa cấp quyền vị trí. Vào Cài đặt > Ứng dụng/Trình duyệt > Quyền > Vị trí > Cho phép, rồi mở lại app.' : 'Không lấy được vị trí: hãy bật GPS (Vị trí) và ra chỗ thoáng.'; updateGeo(); },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 25000 });
}
function freshPos() {
  if (NATIVE) return new Promise(res => { Native.startLocation(); const t0 = Date.now(); const tick = () => { if (S.pos && Date.now() - S.pos.t < 15000) return res(S.pos); if (Date.now() - t0 > 20000) return res(S.pos && Date.now() - S.pos.t < 120000 ? S.pos : null); setTimeout(tick, 500); }; tick(); });
  return new Promise(res => {
    if (S.pos && Date.now() - S.pos.t < 15000) return res(S.pos);
    navigator.geolocation.getCurrentPosition(p => { S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; res(S.pos); },
      () => res(S.pos && Date.now() - S.pos.t < 120000 ? S.pos : null), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
function nearest() {
  const sites = (S.data.me && S.data.me.sites) || []; if (!S.pos || !sites.length) return null;
  const sel = sites.find(x => x.id === LS.get('siteSel', '')); if (sel) return { s: sel, d: dist(S.pos.lat, S.pos.lng, sel.lat, sel.lng) };
  let b = null; sites.forEach(s => { const d = dist(S.pos.lat, S.pos.lng, s.lat, s.lng); if (!b || d < b.d) b = { s, d }; }); return b;
}
let MYMARK = null, MYDOT = null, HMAP = null;
function wifiNow() { if (!NATIVE) return {}; try { return JSON.parse(Native.wifi()); } catch (e) { return {}; } }
function sitesWifi() { return ((S.data.me && S.data.me.sites) || []).flatMap(s => s.wifi || []); }
function updateGeo() {
  const el = $('#geo'); if (!el) return;
  if (S.gpsErr) { el.className = 'st er'; el.textContent = S.gpsErr; if (NATIVE) el.onclick = () => Native.openSettings(S.gpsErrKind === 'off' ? 'location' : 'app'); return; }
  if (S.pos && (S.pos.mock || (S.mockAt && Date.now() - S.mockAt < 120000))) { el.className = 'st er'; el.innerHTML = '🚫 <b>Phát hiện vị trí giả lập (Fake GPS).</b> Tắt ứng dụng giả lập vị trí và tắt "Ứng dụng vị trí mô phỏng" trong Tùy chọn nhà phát triển.'; return; }
  if (!S.pos) { el.className = 'st in'; el.innerHTML = '<span class="spin" style="border-color:#1e3a8a55;border-top-color:#1e3a8a"></span> Đang xác định vị trí…'; return; }
  const n = nearest(), maxAcc = +(S.data.me.cfg.maxAccuracy || 100);
  if (!n) { el.className = 'st wa'; el.textContent = 'Chưa có địa điểm làm việc được khai báo cho bạn.'; return; }
  const inside = n.d <= n.s.radius, accOk = S.pos.acc <= maxAcc;
  el.className = 'st ' + (inside && accOk ? 'ok' : 'wa');
  const w = wifiNow(), wOk = !!w.ssid && sitesWifi().some(x => x === w.ssid.toLowerCase() || x === (w.bssid || '').toLowerCase());
  el.innerHTML = `${inside ? '✅ Bạn đang <b>trong vùng</b>' : '⚠️ Bạn đang <b>ngoài vùng</b>'} ${esc(n.s.name)} · cách ${Math.round(n.d)} m (cho phép ${n.s.radius} m)<br>Độ chính xác GPS: ±${Math.round(S.pos.acc)} m${accOk ? '' : ' — <b>chưa đạt</b> (cần ≤ ' + maxAcc + ' m), hãy ra chỗ thoáng'}${NATIVE ? `<br>📶 Wi-Fi: ${w.ssid ? esc(w.ssid) + (wOk ? ' ✅ của công ty' : '') : 'không kết nối'}` : ''}`;
  if (!inside && wOk && String(S.data.me.cfg.wifiMode) === 'GPS_OR_WIFI') el.className = 'st ok';
  if (MYMARK) { MYMARK.setLatLng([S.pos.lat, S.pos.lng]).setRadius(Math.max(5, S.pos.acc)); MYDOT.setLatLng([S.pos.lat, S.pos.lng]);
    if (!S.mapCentered && HMAP) { HMAP.setView([S.pos.lat, S.pos.lng], 17); S.mapCentered = true; } }
  const co = $('#coord'); if (co) co.innerHTML = `📍 <b>${S.pos.lat.toFixed(6)}, ${S.pos.lng.toFixed(6)}</b> · ±${Math.round(S.pos.acc)} m · <a href="https://maps.google.com/?q=${S.pos.lat},${S.pos.lng}" target="_blank">Google Maps</a>`;
}

/* ---------------- Camera selfie ---------------- */
let STREAM = null;
function stopCam() { if (STREAM) { STREAM.getTracks().forEach(t => t.stop()); STREAM = null; } }
function takeSelfie(label) {
  return new Promise(resolve => {
    let done = false; const finish = v => { if (done) return; done = true; closeModal(); resolve(v); };
    modal(`<h3>Ảnh xác thực — ${esc(label)}</h3><p class="muted">Đưa khuôn mặt vào khung tròn, giữ máy ổn định rồi bấm Chụp.</p>
      <div class="cam" id="cam"><video id="vid" autoplay playsinline muted></video><div class="ring"></div></div>
      <input type="file" id="camFile" accept="image/*" capture="user" class="hide">
      <div class="acts"><button class="btn s" id="camX">Hủy</button><button class="btn g" id="camShot">📸 Chụp</button></div>`);
    $('#camX').onclick = () => finish(null);
    const fromImg = img => {
      const W = 360, H = Math.round(W * 4 / 3), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
      const iw = img.videoWidth || img.naturalWidth, ih = img.videoHeight || img.naturalHeight, sc = Math.max(W / iw, H / ih);
      g.save(); if (img.tagName === 'VIDEO') { g.translate(W, 0); g.scale(-1, 1); } g.drawImage(img, (W - iw * sc) / 2, (H - ih * sc) / 2, iw * sc, ih * sc); g.restore();
      const n = now(), txt = [label + ' · ' + pad(n.getHours()) + ':' + pad(n.getMinutes()) + ' ' + vnDate(ymd(n)), (S.data.me.me.id + ' · ' + S.data.me.me.name).slice(0, 40),
        S.pos ? S.pos.lat.toFixed(5) + ', ' + S.pos.lng.toFixed(5) + ' ±' + Math.round(S.pos.acc) + 'm' : ''];
      g.fillStyle = '#000a'; g.fillRect(0, H - 62, W, 62); g.fillStyle = '#fff'; g.font = '13px sans-serif'; txt.forEach((t, i) => g.fillText(t, 8, H - 44 + i * 17));
      return cv.toDataURL('image/jpeg', 0.62);
    };
    const useFile = () => { $('#camFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const im = new Image(); im.onload = () => finish(fromImg(im)); im.src = URL.createObjectURL(f); }; $('#camFile').click(); };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#camShot').onclick = useFile; $('#cam').innerHTML = '<p class="c" style="color:#fff;padding:40px 10px">Bấm Chụp để mở camera</p>'; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false }).then(st => {
      STREAM = st; const v = $('#vid'); v.srcObject = st;
      $('#camShot').onclick = () => { if (!v.videoWidth) return; const d = fromImg(v); stopCam(); finish(d); };
    }).catch(() => { $('#cam').innerHTML = '<p class="c" style="color:#fff;padding:40px 10px">Không mở được camera trực tiếp. Bấm Chụp để dùng camera của máy.</p>'; $('#camShot').onclick = useFile; });
  });
}

/* ---------------- Hàng đợi ngoại tuyến ---------------- */
const queue = () => LS.get('queue', []);
async function syncQueue() {
  const q = queue(); if (!q.length || S.syncing || !S.token) return; S.syncing = true;
  const left = [];
  for (const p of q) {
    const r = await call('punch', p);
    if (r.net) { left.push(p); continue; }
    toast((r.ok ? '✅ Đã đồng bộ ' : '❌ Đồng bộ bị từ chối: ') + (p.type === 'IN' ? 'check-in ' : 'check-out ') + new Date(p.clientTime).toLocaleTimeString('vi-VN').slice(0, 5) + (r.ok ? '' : ' — ' + r.error), r.ok ? 'ok' : 'er');
  }
  LS.set('queue', left); S.syncing = false; if (q.length !== left.length) loadMe();
}
window.addEventListener('online', () => { syncQueue(); render(); });
window.addEventListener('offline', () => render());
setInterval(syncQueue, 60e3);

/* ---------------- Đăng nhập ---------------- */
function viewLogin(msg) {
  $('#app').innerHTML = `<div class="login"><div class="logo"><img src="icons/icon-192.png" alt=""><h2>Chấm công GPS</h2><div class="muted">Phiên bản ${VERSION}</div></div>
  <div class="card"><label>Mã nhân viên</label><input id="lgId" autocapitalize="characters" autocomplete="username" value="${esc(LS.get('lastId', ''))}">
  <label>Mật khẩu</label><input id="lgPw" type="password" autocomplete="current-password" value="${esc((CRED.get() || {}).pw || '')}">
  <label style="display:flex;gap:8px;align-items:center;color:var(--t);font-size:14px;margin-top:10px"><input type="checkbox" id="lgRm" style="width:auto" ${LS.get('remember', true) ? 'checked' : ''}> Ghi nhớ đăng nhập trên máy này</label>
  <button class="btn full" style="margin-top:12px" id="lgGo">Đăng nhập</button>${msg ? `<div class="st er">${esc(msg)}</div>` : ''}
  <button class="btn o full" style="margin-top:10px" id="lgReg">📝 Đăng ký tài khoản nhân viên mới</button>
  ${isDemo() ? '<div class="st wa">🧪 <b>Chế độ dùng thử</b> (chưa có máy chủ): dữ liệu chỉ lưu trên máy này. Đăng nhập lần đầu: <b>ADMIN</b> / <b>admin123</b></div>' : ''}
  <details style="margin-top:12px"><summary class="muted">Cài đặt máy chủ</summary><label>URL Apps Script (/exec)</label><input id="lgApi" value="${esc(LS.get('api', ''))}" placeholder="Để trống = dùng mặc định trong config.js"></details></div>
  ${!isStandalone() ? '<button class="btn o full" data-x="install">📲 Cài ứng dụng lên điện thoại</button>' : ''}</div>`;
  const go = async () => {
    const api = $('#lgApi').value.trim(); LS.set('api', api); S.api = api || window.API_URL;
    const b = $('#lgGo'); busy(b, 1);
    const r = await call('login', { id: $('#lgId').value.trim(), password: $('#lgPw').value, deviceId: S.device }, { noLogout: true }); busy(b, 0);
    if (!r.ok) return viewLogin(r.error);
    S.token = r.token; LS.set('token', r.token); LS.set('lastId', $('#lgId').value.trim().toUpperCase());
    if (r.me && r.me.ok) { S.data.me = r.me; LS.set('me', r.me); }
    LS.set('remember', $('#lgRm').checked); if ($('#lgRm').checked) CRED.set({ id: $('#lgId').value.trim().toUpperCase(), pw: $('#lgPw').value }); else CRED.del();
    if (r.me && r.me.ok) { if (r.me.notifs) S.notifs = r.me.notifs; render(); } else await loadMe(); if (r.mustChange) changePw(true);
  };
  $('#lgGo').onclick = go; $('#lgPw').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#lgReg').onclick = registerForm;
}
function registerForm() {
  modal(`<h3>📝 Đăng ký tài khoản</h3><p class="muted">Hệ thống tự cấp <b>mã nhân viên</b>. Tài khoản dùng được sau khi Phòng TCHC duyệt.</p>
   <label>Họ và tên *</label><input id="rgN"><div class="row"><div><label>Số điện thoại *</label><input id="rgP" type="tel"></div><div><label>Email</label><input id="rgE" type="email"></div></div>
   <div class="row"><div><label>Bộ phận</label><input id="rgD" placeholder="VD: Khai thác"></div><div><label>Chức danh</label><input id="rgT"></div></div>
   <label>Ngày sinh</label><input id="rgB" type="date"><div class="row"><div><label>Mật khẩu * (≥ 6 ký tự)</label><input id="rgW" type="password"></div><div><label>Nhập lại mật khẩu *</label><input id="rgW2" type="password"></div></div>
   <div id="rgMsg"></div><div class="acts"><button class="btn s" data-x="close">Hủy</button><button class="btn" id="rgGo">Đăng ký</button></div>`);
  $('#rgGo').onclick = async () => {
    if ($('#rgW').value !== $('#rgW2').value) return $('#rgMsg').innerHTML = '<div class="st er">Mật khẩu nhập lại không khớp</div>';
    busy($('#rgGo'), 1);
    const r = await call('register', { name: $('#rgN').value, phone: $('#rgP').value, email: $('#rgE').value, dept: $('#rgD').value, title: $('#rgT').value, birthday: $('#rgB').value, password: $('#rgW').value }, { noLogout: true });
    busy($('#rgGo'), 0); if (!r.ok) return $('#rgMsg').innerHTML = `<div class="st er">${esc(r.error)}</div>`;
    LS.set('lastId', r.id); CRED.set({ id: r.id, pw: $('#rgW').value });
    modal(`<h3>✅ Đăng ký thành công</h3><p>Mã nhân viên của bạn:</p><div style="font-size:30px;font-weight:800;text-align:center;color:var(--p);letter-spacing:2px">${esc(r.id)}</div>
      <p class="muted">${r.pending ? 'Tài khoản đang chờ Phòng TCHC duyệt. Sau khi được duyệt, mở app và bấm Đăng nhập (đã ghi nhớ sẵn mã và mật khẩu).' : 'Bạn có thể đăng nhập ngay.'}</p><div class="acts"><button class="btn" id="rgOk">Đã hiểu</button></div>`);
    $('#rgOk').onclick = () => { closeModal(); viewLogin(); };
  };
}
async function autoRelogin() {
  const c = CRED.get(); if (!c || !LS.get('remember', true)) return false;
  const r = await call('login', { id: c.id, password: c.pw, deviceId: S.device }, { noLogout: true });
  if (!r.ok) return false; S.token = r.token; LS.set('token', r.token); return true;
}
function logout(silent) { if (NATIVE) try { Native.clearSession(); } catch (e) { } S.token = ''; LS.del('token'); LS.del('me'); S.data = {}; if (!silent) toast('Đã đăng xuất'); viewLogin(); }
function changePw(forced) {
  modal(`<h3>${forced ? 'Bạn cần đổi mật khẩu lần đầu' : 'Đổi mật khẩu'}</h3><label>Mật khẩu hiện tại</label><input id="pw0" type="password"><label>Mật khẩu mới (≥ 6 ký tự)</label><input id="pw1" type="password"><label>Nhập lại mật khẩu mới</label><input id="pw2" type="password">
  <div class="acts">${forced ? '' : '<button class="btn s" data-x="close">Hủy</button>'}<button class="btn" id="pwGo">Lưu</button></div><div id="pwMsg"></div>`);
  $('#pwGo').onclick = async () => {
    if ($('#pw1').value !== $('#pw2').value) return $('#pwMsg').innerHTML = '<div class="st er">Mật khẩu nhập lại không khớp</div>';
    const r = await call('changePw', { old: $('#pw0').value, pw: $('#pw1').value });
    if (!r.ok) return $('#pwMsg').innerHTML = `<div class="st er">${esc(r.error)}</div>`;
    closeModal(); toast('Đã đổi mật khẩu', 'ok');
  };
}

/* ---------------- Dữ liệu chính ---------------- */
async function loadMe() {
  const r = await call('me');
  if (r.ok && r.notifs) { S.notifs = r.notifs; const seen = LS.get('nSeen', ''); S.unread = r.notifs.filter(n => n.time > seen).length; }
  const sig = x => JSON.stringify(Object.assign({}, x, { serverTime: 0, notifs: 0 }));
  if (r.ok && S.data.me && sig(r) === sig(S.data.me)) { S.data.me.serverTime = r.serverTime; return; }
  if (r.ok) { S.data.me = r; LS.set('me', r); const st = new Date(r.serverTime.replace(' ', 'T')); if (!isNaN(st)) S.offset = st - Date.now(); nativeSync(); }
  else if (r.net && LS.get('me')) S.data.me = LS.get('me');
  else if (!r.ok && r.code !== 'AUTH') { if (!S.data.me) { viewLogin(r.error); return; } toast(r.error, 'er'); }
  if (S.data.me) render();
}

function nativeSync() {
  if (!NATIVE || !S.data.me) return; const m = S.data.me, sh = m.shift || {};
  const logs = (m.today || []).filter(l => l.valid === 'TRUE').sort((a, b) => a.time < b.time ? -1 : 1);
  try {
    Native.setSession(isDemo() ? '' : S.api, S.token, JSON.stringify({ name: sh.name || '', start: sh.start || '07:30', end: sh.end || '17:00', workDays: m.me.workDays || '1,2,3,4,5,6',
      holidays: (m.holidays || []).map(h => h.date), before: 10, after: 5, enabled: LS.get('remOn', true) }));
    Native.setToday(ymd(now()), logs.length ? logs[logs.length - 1].type : '');
  } catch (e) { console.warn(e); }
}
/* ---------------- Thông báo ---------------- */
async function pollNotifs(open) {
  if (!S.token) return; const r = await call('notifs', { since: '' }); if (!r.ok) return;
  S.notifs = r.list; const seen = LS.get('nSeen', ''); S.unread = r.list.filter(n => n.time > seen).length;
  const b = $('#bell b'); if (b) { b.textContent = S.unread || ''; b.classList.toggle('hide', !S.unread); }
  if (open) showNotifs();
}
function showNotifs() {
  const L = S.notifs || [], seen = LS.get('nSeen', '');
  modal(`<h3>🔔 Thông báo</h3>${L.map(n => `<div class="item"><div class="t"><b>${n.time > seen ? '🔵 ' : ''}${esc(n.title)}</b><span class="muted">${esc(n.time.slice(5, 16))}</span></div><div>${esc(n.body)}</div></div>`).join('') || '<p class="muted">Chưa có thông báo.</p>'}
    <div class="acts"><button class="btn" data-x="close">Đóng</button></div>`);
  if (L.length) LS.set('nSeen', L[0].time); S.unread = 0; const b = $('#bell b'); if (b) b.classList.add('hide');
}
setInterval(() => { if (document.visibilityState === 'visible') pollNotifs(); }, 120e3);
window.__nativeOpen = k => { if (k === 'notifs') pollNotifs(true); };
window.__nativeResume = () => { if (S.token) { loadMe(); syncQueue(); } };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.token) { loadMe(); syncQueue(); } });
setInterval(() => { if (document.visibilityState === 'visible' && S.token && !S.punching) loadMe(); }, 60e3);
window.__nativeBack = () => { if (!$('#modal').classList.contains('hide')) { closeModal(); return 'handled'; } if (S.token && S.tab !== 'home') { S.tab = 'home'; render(); return 'handled'; } return 'exit'; };
window.__nativeUpdating = v => toast('Đang tải và cài bản ' + v + '…');
/* ---------------- Khung ứng dụng ---------------- */
const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = { clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), cal: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'), chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'), bell: svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>') };
const initials = n => String(n || '?').trim().split(/\s+/).slice(-2).map(x => x[0]).join('').toUpperCase();
function tabs() {
  const m = S.data.me.me, mg = m.role === 'QL' || m.role === 'AD';
  return [['home', IC.clock, 'Chấm công'], ['month', IC.cal, 'Bảng công'], ['req', IC.doc, 'Đơn từ'], ...(mg ? [['mgr', IC.chart, 'Quản lý']] : []), ...(m.role === 'AD' ? [['set', IC.gear, 'Cài đặt']] : [['acc', IC.user, 'Tài khoản']])];
}
function render() {
  if (!S.token) { if (!$('#lgId')) viewLogin(); return; } if (!S.data.me) return;
  S.view = S.tab + ':' + (S.tab === 'mgr' ? (S.sub.mgr || 'dash') : S.tab === 'set' ? (S.sub.set || 'org') : '');
  S.maps.forEach(m => { try { m.remove(); } catch (e) {} }); S.maps = []; MYMARK = null;
  const m = S.data.me, q = queue().length;
  $('#app').innerHTML = `<header class="top"><div class="brand"><b>${esc(m.cfg.company || 'Chấm công')}</b><small>${esc(m.cfg.unit || '')}${m.cfg.unit ? ' · ' : ''}${esc(m.me.name)}</small></div>
    ${!isStandalone() ? '<button class="hbtn" data-x="install" title="Cài ứng dụng">⤓</button>' : ''}
    <button class="hbtn" id="bell" data-x="notifs" title="Thông báo">${IC.bell}<b class="badge ${S.unread ? '' : 'hide'}">${S.unread || ''}</b></button>
    <button class="avatar" data-tab="acc" title="Tài khoản">${esc(initials(m.me.name))}</button></header>
    ${isDemo() ? '<div class="banner">🧪 <span><b>Chế độ dùng thử</b>: dữ liệu chỉ lưu trên máy này, chưa dùng chung. Sẽ tự chuyển sang dùng chung khi có máy chủ.</span></div>' : ''}
    ${!navigator.onLine ? '<div class="banner">📴 Đang ngoại tuyến — chấm công sẽ được lưu tạm và tự đồng bộ khi có mạng.</div>' : ''}
    ${q ? `<div class="banner">⏳ ${q} lượt chấm công chờ đồng bộ <button class="btn sm y" data-x="sync">Đồng bộ ngay</button></div>` : ''}
    <main id="view"></main>
    <nav class="bottom">${tabs().map(([k, i, t]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${i}<span>${t}</span>${k === 'mgr' && m.pending ? `<span class="badge">${m.pending}</span>` : ''}</button>`).join('')}</nav>`;
  ({ home: vHome, month: vMonth, req: vReq, mgr: vMgr, set: vSet, acc: vAcc }[S.tab] || vHome)();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]'); if (t) { S.tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const x = e.target.closest('[data-x]'); if (!x) return;
  const a = x.dataset.x;
  if (a === 'close') closeModal(); else if (a === 'notifs') pollNotifs(true); else if (a === 'install') installApp(); else if (a === 'sync') syncQueue();
});
function mkMap(id, lat, lng, z) {
  if (!window.L) { const el = document.getElementById(id); if (el) el.innerHTML = '<p class="muted c" style="padding:30px">Không tải được bản đồ (cần mạng)</p>'; return null; }
  const m = L.map(id, { attributionControl: false, zoomControl: true }).setView([lat, lng], z || 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m); S.maps.push(m); return m;
}

/* ---------------- TAB: CHẤM CÔNG ---------------- */
function vHome() {
  const m = S.data.me, sh = m.shift || {}, n = now(), logs = (m.today || []).filter(l => l.valid === 'TRUE' || l.valid === 'PENDING').sort((a, b) => a.time < b.time ? -1 : 1);
  const pend = queue(), last = pend.length ? pend[pend.length - 1].type : (logs.length ? logs[logs.length - 1].type : '');
  const next = last === 'IN' ? 'OUT' : 'IN', sel = LS.get('siteSel', ''), ad = m.me.role === 'AD';
  const hol = (m.holidays || []).find(h => h.date === ymd(n));
  $('#view').innerHTML = `<div class="hero"><div class="clock" id="clock">--:--:--</div><div class="date">${WD[n.getDay()]}, ${vnDate(ymd(n))}${hol ? ' · 🎉 ' + esc(hol.name) : ''}</div>
    <div class="shift"><span>Ca <b>${esc(sh.name || '')}</b></span><span>${esc(sh.start || '')} – ${esc(sh.end || '')}</span></div></div>
    <div class="card">
      ${m.sites.length > 1 ? `<label>Nơi làm việc hôm nay</label><select id="siteSel"><option value="">📍 Tự chọn nơi gần nhất</option>${m.sites.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
      <div id="geo" class="st in">Đang xác định vị trí…</div>
      <div class="punch"><button class="btn g ${next === 'IN' ? '' : 'dim'}" id="pIn">▶ VÀO CA<small>Check-in</small></button><button class="btn r ${next === 'OUT' ? '' : 'dim'}" id="pOut">■ RA CA<small>Check-out</small></button></div>
      <div id="pMsg"></div>
      <div class="mapbox"><div class="map" id="hmap"></div><button class="mapbtn" id="mMe" title="Về vị trí của tôi">◎</button></div>
      <div class="coord" id="coord">📍 Đang lấy tọa độ…</div>
      ${ad ? '<button class="btn o sm full" id="mAddSite" style="margin-top:8px">＋ Lưu vị trí hiện tại thành nơi làm việc</button>' : ''}
      ${!m.sites.length ? `<div class="st wa">Chưa có nơi làm việc nào. ${ad ? 'Bấm nút trên khi đang đứng tại công ty để tạo.' : 'Liên hệ quản trị để được gắn nơi làm việc.'}</div>` : ''}
    </div>
    <div class="card"><h3>Hôm nay</h3>${logs.length || pend.length ? `<ul class="tl">${logs.map(l => `<li><span class="dot ${l.type === 'IN' ? 'in' : 'out'}"></span><b>${l.time.slice(11, 16)}</b><span>${l.type === 'IN' ? 'Vào ca' : 'Ra ca'} · ${esc(l.siteName)}${l.source === 'CT' ? ' · Công tác' : ''}${l.offline === 'TRUE' ? ' · ngoại tuyến' : ''}${l.valid === 'PENDING' ? ' · <b style="color:var(--y)">⏳ chờ duyệt</b>' : ''}</span></li>`).join('')}
      ${pend.map(p => `<li><span class="dot ${p.type === 'IN' ? 'in' : 'out'}"></span><b>${new Date(p.clientTime).toTimeString().slice(0, 5)}</b><span>${p.type === 'IN' ? 'Vào ca' : 'Ra ca'} · ⏳ chờ đồng bộ</span></li>`).join('')}</ul>` : '<p class="muted">Chưa chấm công hôm nay.</p>'}</div>
    <div class="card"><h3>Phép năm ${n.getFullYear()}</h3><div class="kv"><span>Được hưởng</span><b>${m.balance.quota} ngày</b><span>Đã dùng</span><b>${m.balance.used} ngày</b><span>Còn lại</span><b style="color:var(--g)">${m.balance.left} ngày</b></div></div>`;
  $('#pIn').onclick = () => doPunch('IN'); $('#pOut').onclick = () => doPunch('OUT');
  if ($('#siteSel')) $('#siteSel').onchange = e => { LS.set('siteSel', e.target.value); updateGeo(); drawSites(); const x = m.sites.find(z => z.id === e.target.value); if (x && HMAP) HMAP.setView([x.lat, x.lng], 16); };
  if ($('#mAddSite')) $('#mAddSite').onclick = async () => { const p = await freshPos(); if (!p) return toast('Chưa lấy được vị trí', 'er'); siteForm({ lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), radius: 200 }); };
  startGPS(); updateGeo();
  S.mapCentered = !!S.pos;
  setTimeout(() => {
    const ss = m.sites.find(x => x.id === sel) || m.sites[0], c = S.pos || ss || { lat: 10.7626, lng: 106.6602 };
    HMAP = mkMap('hmap', c.lat, c.lng, S.pos || ss ? 16 : 11); if (!HMAP) return;
    drawSites();
    const p0 = S.pos ? [S.pos.lat, S.pos.lng] : [c.lat, c.lng];
    MYMARK = L.circle(p0, { radius: S.pos ? Math.max(5, S.pos.acc) : 5, color: '#16a34a', fillColor: '#16a34a', fillOpacity: .15, weight: 1 }).addTo(HMAP);
    MYDOT = L.circleMarker(p0, { radius: 7, color: '#fff', weight: 3, fillColor: '#16a34a', fillOpacity: 1 }).addTo(HMAP).bindTooltip('Bạn ở đây');
    $('#mMe').onclick = () => { if (S.pos) HMAP.setView([S.pos.lat, S.pos.lng], 17); };
    updateGeo();
  }, 50);
}
let SITELAYER = null;
function drawSites() {
  if (!HMAP || !window.L) return; if (SITELAYER) SITELAYER.remove(); SITELAYER = L.layerGroup().addTo(HMAP);
  const n = nearest(), act = n ? n.s.id : LS.get('siteSel', '');
  (S.data.me.sites || []).forEach(x => { const on = x.id === act;
    L.circle([x.lat, x.lng], { radius: x.radius, color: on ? '#16a34a' : '#0b5cad', weight: on ? 3 : 2, fillOpacity: on ? .15 : .08 }).addTo(SITELAYER);
    L.marker([x.lat, x.lng]).addTo(SITELAYER).bindTooltip(x.name, { permanent: on, direction: 'top' }); });
}
async function doPunch(type) {
  if (S.punching) return; S.punching = true;
  const msg = h => { const e = $('#pMsg'); if (e) e.innerHTML = h; };
  const btn = $(type === 'IN' ? '#pIn' : '#pOut'); busy(btn, 1);
  try {
    msg('<div class="st in">Đang lấy vị trí chính xác…</div>');
    const pos = await freshPos();
    if (!pos) { msg(`<div class="st er">${esc(S.gpsErr || 'Không lấy được vị trí GPS. Bật Vị trí và thử lại.')}</div>`); return; }
    if (S.mockAt && Date.now() - S.mockAt < 120000) pos.mock = true;
    if (pos.mock) { msg('<div class="st er">🚫 Phát hiện vị trí giả lập. Không thể chấm công.</div>'); return; }
    if (String(S.data.me.cfg.requireApp).toUpperCase() === 'TRUE' && !NATIVE) { msg(`<div class="st er">Công ty yêu cầu chấm công bằng ứng dụng Android. ${isAndroid ? '<a href="download/">Tải ứng dụng</a>' : ''}</div>`); return; }
    const m = S.data.me; let photo = '';
    if (String(m.cfg.requireSelfie).toUpperCase() === 'TRUE') {
      busy(btn, 0); photo = await takeSelfie(type === 'IN' ? 'CHECK-IN' : 'CHECK-OUT'); busy(btn, 1);
      if (!photo) { msg('<div class="st wa">Đã hủy chấm công.</div>'); return; }
    }
    const w = wifiNow();
    const p = { type, lat: pos.lat, lng: pos.lng, accuracy: pos.acc, photo, cid: 'C' + uuid(), clientTime: now().toISOString(), ua: NATIVE ? 'App ' + NATIVE.versionName + ' ' + NATIVE.model : navigator.userAgent.slice(0, 80),
      client: NATIVE ? 'android' : 'web', mock: !!pos.mock, ssid: w.ssid || '', bssid: w.bssid || '', siteId: LS.get('siteSel', '') };
    msg('<div class="st in">Đang gửi lên máy chủ…</div>');
    const r = navigator.onLine ? await call('punch', p) : { ok: false, net: true };
    if (r.net) {
      if (String(m.cfg.allowOffline).toUpperCase() !== 'TRUE') { msg('<div class="st er">Không có mạng. Hệ thống không cho phép chấm công ngoại tuyến.</div>'); return; }
      p.offline = true; const q = queue(); q.push(p); LS.set('queue', q);
      toast('📴 Đã lưu tạm, sẽ tự đồng bộ khi có mạng'); render(); return;
    }
    if (r.ok) {
      if (NATIVE) Native.vibrate(); else if (navigator.vibrate) navigator.vibrate(120);
      toast(`✅ ${type === 'IN' ? 'Check-in' : 'Check-out'} thành công lúc ${r.time.slice(11, 16)}`, 'ok');
      if (r.extra) toast('⚠️ ' + r.extra);
      S.data.me.today = (S.data.me.today || []).concat([{ time: r.time, date: r.time.slice(0, 10), type, valid: 'TRUE', siteName: r.site, source: r.source || 'GPS', offline: 'FALSE' }]);
      render(); loadMe();
    } else if (r.canAsk) {
      msg(`<div class="st er">❌ ${esc(r.error)}</div><div class="st wa">Nếu bạn đang làm việc ngoài địa điểm (đi công trình, giao hồ sơ…), có thể gửi lượt chấm công này để quản lý duyệt.
        <textarea id="askR" placeholder="Lý do / nơi làm việc…" style="margin-top:6px"></textarea><button class="btn y full" id="askGo" style="margin-top:6px">📨 Gửi quản lý duyệt</button></div>`);
      $('#askGo').onclick = async () => { const why = $('#askR').value.trim(); if (why.length < 3) return toast('Nhập lý do', 'er');
        busy($('#askGo'), 1); const x = await call('punch', { ...p, cid: 'C' + uuid(), reason: why }); busy($('#askGo'), 0);
        if (x.ok) { toast('📨 Đã gửi quản lý duyệt lượt ' + (type === 'IN' ? 'vào ca' : 'ra ca'), 'ok'); msg(''); await loadMe(); } else toast(x.error, 'er'); };
    } else msg(`<div class="st er">❌ ${esc(r.error)}</div>`);
  } finally { S.punching = false; busy(btn, 0); }
}

/* ---------------- TAB: BẢNG CÔNG CÁ NHÂN ---------------- */
async function vMonth() {
  const mo = S.sub.month || ymd(now()).slice(0, 7);
  $('#view').innerHTML = `<div class="card"><div class="row"><div><label>Tháng</label><input type="month" id="moPick" value="${mo}"></div></div></div><div id="moBody"><div class="card muted">Đang tải…</div></div>`;
  $('#moPick').onchange = e => { S.sub.month = e.target.value; vMonth(); };
  const r = await callV('myMonth', { month: mo }); if (!r.ok) return $('#moBody').innerHTML = `<div class="card st er">${esc(r.error)}</div>`;
  const row = r.sheet.rows[0], days = r.sheet.days, t = ymd(now()), s = row.sum;
  const first = days[0].w; // 1..7 (T2..CN)
  const cell = (d, c) => `<div class="${d.d === t ? 'today' : ''}" data-d="${d.d}"><b style="color:${d.w === 7 ? 'var(--r)' : ''}">${+d.d.slice(8)}</b><span class="code" style="color:${/V/.test(c.c) ? 'var(--r)' : /X/.test(c.c) ? 'var(--g)' : 'var(--p)'}">${esc(c.c)}</span>${c.i ? `<div class="muted" style="font-size:10px">${c.i}${c.o ? '-' + c.o : ''}</div>` : ''}</div>`;
  $('#moBody').innerHTML = `<div class="stats" style="margin-bottom:12px"><div class="stat"><b>${s.paid}</b><span>Tổng công</span></div><div class="stat"><b>${s.late}</b><span>Lần đi muộn</span></div><div class="stat"><b>${s.ot}</b><span>Giờ làm thêm</span></div></div>
   <div class="card"><div class="cal">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(x => `<div class="h">${x}</div>`).join('')}${'<div class="e"></div>'.repeat(first - 1)}${days.map((d, i) => cell(d, row.cells[i])).join('')}</div>
   <p class="muted" style="margin-top:10px">X: đủ công · X/2: nửa công · P: phép · O: ốm · KL: không lương · CT: công tác · L: lễ · V: vắng · !: thiếu check-out</p></div>
   <div class="card"><h3>🏅 Thi đua tháng<span class="sp"></span><span class="pill ${s.score >= 100 ? 'APPROVED' : s.score >= 75 ? 'PENDING' : 'REJECTED'}">${esc(s.rank || '')}</span></h3><div style="font-size:28px;font-weight:800;color:var(--p)">${s.score ?? ''} điểm</div>
     <div class="muted">${(s.scoreDetail || []).map(esc).join(' · ')}</div><button class="btn s full" id="mySlip" style="margin-top:10px">💵 Xem phiếu lương tháng</button></div>
   <div class="card"><h3>Tổng hợp</h3><div class="kv"><span>Công thực tế</span><b>${s.X}</b><span>Nghỉ có tính công / đột xuất</span><b>${s.NCL || 0} / ${s.NDX || 0}</b><span>Tăng ca (thường / nghỉ / lễ)</span><b>${s.otWD || 0} / ${s.otWE || 0} / ${s.otHol || 0} giờ</b><span>Nghỉ phép / ốm / KL</span><b>${s.P} / ${s.O} / ${s.KL}</b><span>Công tác · Lễ</span><b>${s.CT} · ${s.L}</b><span>Vắng</span><b>${s.V}</b>
   <span>Đi muộn</span><b>${s.late} lần (${s.lateMin} phút)</b><span>Về sớm</span><b>${s.early} lần (${s.earlyMin} phút)</b><span>Thiếu check-out</span><b>${s.miss}</b>${s.pay != null ? `<span>Lương ước tính</span><b style="color:var(--g)">${s.pay.toLocaleString('vi-VN')} đ</b>` : ''}</div></div>`;
  $('#mySlip').onclick = async () => { const x = await call('myPayslip', { month: mo }); if (!x.ok) return toast(x.error, 'er'); if (!x.slip) return toast('Chưa có mức lương để tính phiếu lương — liên hệ Phòng TCHC', 'er'); showSlip(S.data.me.me.name, S.data.me.me.id, x.slip); };
  $$('.cal [data-d]').forEach(el => el.onclick = () => {
    const d = el.dataset.d, ls = r.logs.filter(l => l.date === d).sort((a, b) => a.time < b.time ? -1 : 1), c = row.cells[days.findIndex(x => x.d === d)];
    modal(`<h3>Ngày ${vnDate(d)}</h3><div class="kv"><span>Ký hiệu</span><b>${esc(c.c) || '—'}</b><span>Giờ làm</span><b>${c.h} giờ</b><span>Đi muộn / về sớm</span><b>${c.l} / ${c.e} phút</b><span>Làm thêm</span><b>${c.ot} giờ</b></div>
      <ul class="tl" style="margin-top:10px">${ls.map(l => `<li><span class="dot ${l.type === 'IN' ? 'in' : 'out'}"></span><b>${l.time.slice(11, 16)}</b>${esc(l.siteName)}${l.source === 'DON' ? ' (bổ sung theo đơn)' : ''}</li>`).join('') || '<li class="muted">Không có lượt chấm công</li>'}</ul>
      <div class="acts"><button class="btn s" data-x="close">Đóng</button><button class="btn" id="qcc">Gửi đơn bổ sung</button></div>`);
    $('#qcc').onclick = () => { closeModal(); S.tab = 'req'; render(); setTimeout(() => newReq('QCC', d), 50); };
  });
}

function slipText(name, id, s) {
  return `PHIẾU LƯƠNG THÁNG ${s.month.slice(5)}/${s.month.slice(0, 4)} - ${S.data.me.cfg.company}\n${name} (${id})\nLương cơ bản: ${money(s.base)}\nCông hưởng lương: ${s.paidDays}/${s.standardDays}\nLương theo công: ${money(s.work)}\nTăng ca (${s.otWD}h thường, ${s.otWE}h nghỉ, ${s.otHol}h lễ): ${money(s.otPay)}\nPhụ cấp: ${money(s.allowance)}\nThưởng thi đua (${s.rank}): ${money(s.bonus)}\nTổng thu nhập: ${money(s.gross)}\nTrừ BH: -${money(s.ins)}\nThuế TNCN: -${money(s.tax)}\nTHỰC LĨNH: ${money(s.net)} đ`;
}
function showSlip(name, id, s) {
  const row = (a, b, st) => `<tr><td>${a}</td><td class="right" style="${st || ''}">${b}</td></tr>`;
  modal(`<h3>💵 Phiếu lương ${s.month.slice(5)}/${s.month.slice(0, 4)}</h3><div class="muted">${esc(name)} · ${esc(id)}</div><table style="margin-top:8px">
    ${row('Lương cơ bản', money(s.base))}${row('Công hưởng lương / công chuẩn', s.paidDays + ' / ' + s.standardDays)}${row('Lương theo công', money(s.work))}
    ${row(`Tăng ca: ${s.otWD}h thường · ${s.otWE}h nghỉ · ${s.otHol}h lễ`, money(s.otPay))}${row('Phụ cấp', money(s.allowance))}${row(`Thưởng thi đua (${esc(s.rank)}, ${s.score} điểm)`, money(s.bonus))}
    ${row('<b>Tổng thu nhập</b>', money(s.gross), 'font-weight:700')}${row('BHXH, BHYT, BHTN', '-' + money(s.ins))}${row(`Thuế TNCN (NPT: ${s.dependents})`, '-' + money(s.tax))}
    ${row('<b>THỰC LĨNH</b>', money(s.net) + ' đ', 'font-weight:800;color:var(--g);font-size:16px')}</table>
    <p class="muted">Tính tự động từ dữ liệu chấm công và quy định đã cài đặt. Thuế TNCN tính theo biểu lũy tiến và mức giảm trừ gia cảnh cài trong Cấu hình.</p>
    <div class="acts"><button class="btn s" data-x="close">Đóng</button><button class="btn" id="slShare">📤 Gửi Zalo / chia sẻ</button></div>`);
  $('#slShare').onclick = () => shareText(slipText(name, id, s));
}
function shareText(t) {
  if (NATIVE && Native.share) Native.share(t); else if (navigator.share) navigator.share({ text: t }).catch(() => {}); else navigator.clipboard.writeText(t).then(() => toast('Đã chép — dán vào Zalo để gửi', 'ok'));
}
/* ---------------- TAB: ĐƠN TỪ ---------------- */
async function vReq() {
  $('#view').innerHTML = `<button class="btn full" style="margin-bottom:12px" id="nReq">＋ Tạo đơn mới</button><div id="rqList"><div class="card muted">Đang tải…</div></div>`;
  $('#nReq').onclick = () => newReq();
  const r = await callV('myRequests', {}); if (!r.ok) return $('#rqList').innerHTML = `<div class="card st er">${esc(r.error)}</div>`;
  const T = S.data.me.reqTypes;
  $('#rqList').innerHTML = `<div class="card"><h3>Đơn của tôi<span class="sp"></span><span class="muted">Phép còn: <b>${r.balance.left}</b> ngày</span></h3>${r.list.map(x => `<div class="item"><div class="t"><b>${esc(T[x.type] || x.type)}</b><span class="pill ${x.status}">${STATUS[x.status]}</span></div>
    <div class="muted">${vnDate(x.fromDate)}${x.toDate && x.toDate !== x.fromDate ? ' → ' + vnDate(x.toDate) : ''}${x.half ? ' (' + (x.half === 'AM' ? 'buổi sáng' : 'buổi chiều') + ')' : ''}${x.fromTime || x.toTime ? ' · ' + esc(x.fromTime) + (x.toTime ? ' - ' + esc(x.toTime) : '') : ''}${x.days ? ' · ' + x.days + ' ngày' : ''}</div>
    <div>${esc(x.reason)}</div>${x.history ? `<div class="muted" style="font-size:12px">🕘 ${esc(x.history)}</div>` : ''}${x.approver ? `<div class="muted">Người duyệt: ${esc(x.approver)}${x.approverNote ? ' — ' + esc(x.approverNote) : ''}</div>` : ''}
    ${/^PENDING/.test(x.status) ? `<button class="btn sm s" data-cancel="${x.id}" style="margin-top:6px">Hủy đơn</button>` : ''}</div>`).join('') || '<p class="muted">Chưa có đơn nào.</p>'}</div>`;
  $$('[data-cancel]').forEach(b => b.onclick = () => confirmBox('Hủy đơn này?', async () => { const x = await call('cancelRequest', { id: b.dataset.cancel }); toast(x.ok ? 'Đã hủy đơn' : x.error, x.ok ? 'ok' : 'er'); vReq(); }));
}
function newReq(type, date) {
  const T = S.data.me.reqTypes, t = date || ymd(now());
  modal(`<h3>Tạo đơn</h3><label>Loại đơn</label><select id="rqT">${Object.keys(T).filter(k => k !== 'DMVS').map(k => `<option value="${k}" ${k === type ? 'selected' : ''}>${T[k]}</option>`).join('')}</select>
   <div class="row"><div><label id="lbF">Từ ngày</label><input type="date" id="rqF" value="${t}"></div><div id="bxTo"><label>Đến ngày</label><input type="date" id="rqTo" value="${t}"></div></div>
   <div id="bxHalf"><label>Nghỉ nửa ngày (chỉ khi 1 ngày)</label><select id="rqH"><option value="">Cả ngày</option><option value="AM">Buổi sáng</option><option value="PM">Buổi chiều</option></select></div>
   <div class="row" id="bxTime"><div><label id="lbT1">Giờ vào</label><input type="time" id="rqT1"></div><div><label id="lbT2">Giờ ra</label><input type="time" id="rqT2"></div></div>
   <div id="rqHint"></div><label>Lý do</label><textarea id="rqR" placeholder="Nhập lý do…"></textarea><div id="rqMsg"></div>
   <div class="acts"><button class="btn s" data-x="close">Hủy</button><button class="btn" id="rqGo">Gửi đơn</button></div>`);
  const sync = () => {
    const k = $('#rqT').value, leave = ['P', 'O', 'KL', 'CT', 'NDX', 'NCL'].includes(k), one = k === 'DT' || k === 'VS';
    $('#bxTo').classList.toggle('hide', !leave); $('#bxHalf').classList.toggle('hide', !leave); $('#bxTime').classList.toggle('hide', !['QCC', 'OT', 'DT', 'VS'].includes(k));
    $('#rqT2').parentElement.classList.toggle('hide', one);
    $('#lbF').textContent = leave ? 'Từ ngày' : 'Ngày'; $('#lbT1').textContent = k === 'OT' ? 'Tăng ca từ giờ' : k === 'DT' ? 'Giờ dự kiến đến' : k === 'VS' ? 'Giờ dự kiến về' : 'Giờ vào (bỏ trống nếu không cần)';
    $('#lbT2').textContent = k === 'OT' ? 'Đến giờ' : 'Giờ ra (bỏ trống nếu không cần)';
    const c = S.data.me.cfg, H = { P: `Nghỉ phép năm: dưới ${c.leaveL2Days || 3} ngày quản lý bộ phận duyệt; từ ${c.leaveL2Days || 3} ngày trở lên phải đăng ký trước ${c.leaveNoticeDays || 3} ngày và qua 2 cấp duyệt (Quản lý → Ban Giám đốc). Còn ${S.data.me.balance.left} ngày phép.`,
      NDX: 'Nghỉ đột xuất (ốm đột ngột, việc gia đình gấp…): không tính công, bị trừ điểm thi đua. Gửi trong ngày hoặc bổ sung sau.', NCL: 'Nghỉ có hưởng lương theo chế độ: kết hôn, con kết hôn, tang gia… (theo quy định Bộ luật Lao động & quy chế công ty).',
      KL: 'Nghỉ không hưởng lương, không trừ phép năm.', OT: 'Tăng ca được tính theo hệ số: ngày thường, ngày nghỉ tuần, ngày lễ. Chỉ tính khi được duyệt.', DT: 'Được duyệt thì không tính đi trễ.', VS: 'Được duyệt thì không tính về sớm.' };
    $('#rqHint').innerHTML = H[k] ? `<div class="st in">${H[k]}</div>` : '';
  };
  $('#rqT').onchange = sync; sync();
  $('#rqGo').onclick = async () => {
    const b = $('#rqGo'); busy(b, 1);
    const r = await call('createRequest', { req: { type: $('#rqT').value, fromDate: $('#rqF').value, toDate: $('#rqTo').value, half: $('#rqH').value, fromTime: $('#rqT1').value, toTime: $('#rqT2').value, reason: $('#rqR').value } });
    busy(b, 0); if (!r.ok) return $('#rqMsg').innerHTML = `<div class="st er">${esc(r.error)}</div>`;
    closeModal(); toast(r.level === '2' ? 'Đã gửi đơn — cần 2 cấp duyệt (Quản lý → Ban Giám đốc)' : 'Đã gửi đơn, chờ quản lý duyệt', 'ok'); if (S.tab === 'req') vReq();
  };
}

/* ---------------- TAB: QUẢN LÝ ---------------- */
function vMgr() {
  const ad = S.data.me.me.role === 'AD', sub = S.sub.mgr || 'dash';
  const items = [['dash', 'Tổng quan'], ['appr', 'Duyệt đơn' + (S.data.me.pending ? ` (${S.data.me.pending})` : '')], ['ts', 'Bảng công'], ['logs', 'Nhật ký'], ['emp', 'Nhân viên'], ['sched', 'Xếp ca'], ['eval', 'Bình xét'], ...(S.data.me.me.role === 'AD' ? [['pay', 'Phiếu lương']] : []), ['ann', 'Gửi thông báo']];
  $('#view').innerHTML = `<div class="tabs">${items.map(([k, t]) => `<button data-sub="${k}" class="${k === sub ? 'on' : ''}">${t}</button>`).join('')}</div><div id="mg"><div class="card muted">Đang tải…</div></div>`;
  $$('[data-sub]').forEach(b => b.onclick = () => { S.sub.mgr = b.dataset.sub; render(); });
  ({ dash: mDash, appr: mAppr, ts: mTs, logs: mLogs, emp: mEmp, sched: mSched, eval: mEval, pay: mPay, ann: mAnn, site: mSite, shift: mShift, hol: mHol, cfg: mCfg }[sub] || mDash)();
}
const MG = h => { const e = $('#mg'); if (e) e.innerHTML = h; };
function vSet() {
  const sub = S.sub.set || 'org', items = [['org', 'Đơn vị'], ['site', 'Địa điểm'], ['shift', 'Ca làm'], ['hol', 'Ngày lễ'], ['cfg', 'Quy định & hệ thống'], ['me', 'Tài khoản của tôi']];
  $('#view').innerHTML = `<div class="tabs">${items.map(([k, t]) => `<button data-sset="${k}" class="${k === sub ? 'on' : ''}">${t}</button>`).join('')}</div><div id="mg"><div class="card muted">Đang tải…</div></div>`;
  $$('[data-sset]').forEach(b => b.onclick = () => { S.sub.set = b.dataset.sset; render(); });
  if (sub === 'me') { $('#mg').innerHTML = ''; return vAcc('#mg'); }
  ({ org: mOrg, site: mSite, shift: mShift, hol: mHol, cfg: mCfg }[sub] || mOrg)();
}
async function mOrg() {
  const r = await callV('getCfg', {}); if (!r.ok) return MG(`<div class="st er">${esc(r.error)}</div>`); const c = r.cfg;
  MG(`<div class="card"><h3>🏢 Thông tin đơn vị</h3><p class="muted">Hiển thị trên đầu ứng dụng, phiếu lương và trang khách hàng đánh giá của mọi nhân viên.</p>
    <label>Tên công ty</label><input id="oCo" value="${esc(c.company)}"><label>Đơn vị sử dụng (chi nhánh / phòng ban)</label><input id="oUn" value="${esc(c.unit || '')}" placeholder="VD: ICD Tân Cảng Nhơn Trạch">
    <div class="row"><div><label>Mã số thuế</label><input id="oTx" value="${esc(c.taxCode || '')}"></div><div><label>Điện thoại</label><input id="oPh" value="${esc(c.orgPhone || '')}"></div></div>
    <label>Địa chỉ</label><input id="oAd" value="${esc(c.orgAddress || '')}"><button class="btn full" id="oGo" style="margin-top:12px">Lưu thông tin đơn vị</button></div>`);
  $('#oGo').onclick = async e => { busy(e.target, 1); const x = await call('saveCfg', { cfg: { company: $('#oCo').value.trim(), unit: $('#oUn').value.trim(), taxCode: $('#oTx').value.trim(), orgPhone: $('#oPh').value.trim(), orgAddress: $('#oAd').value.trim() } }); busy(e.target, 0);
    toast(x.ok ? 'Đã lưu thông tin đơn vị' : x.error, x.ok ? 'ok' : 'er'); if (x.ok) { await loadMe(); render(); } };
}
async function showPhoto(id) {
  modal('<h3>Ảnh xác thực</h3><p class="muted">Đang tải ảnh…</p>');
  const r = await call('photo', { id }); if ($('#modal').classList.contains('hide')) return;
  modal(`<h3>Ảnh xác thực</h3>${r.ok ? `<div class="cam"><img src="${r.data}" alt=""></div>` : `<div class="st er">${esc(r.error)}</div>`}<div class="acts"><button class="btn" data-x="close">Đóng</button></div>`);
}
async function mDash() {
  const d = S.sub.dDate || ymd(now()), r = await callV('dashboard', { date: d }); if (!r.ok) return MG(`<div class="st er">${esc(r.error)}</div>`);
  const s = r.stats, f = S.sub.dFilter || '';
  const list = r.list.filter(x => !f || (f === 'late' ? x.late : x.status === f));
  MG(`<div class="card"><div class="row"><div><label>Ngày</label><input type="date" id="dDate" value="${d}"></div></div></div>
   <div class="stats" style="margin-bottom:12px">${[['', s.total, 'Nhân sự'], ['Đang làm việc', s.working, 'Đang làm'], ['Đã về', s.left, 'Đã về'], ['Chưa chấm công', s.notYet, 'Chưa chấm'], ['late', s.late, 'Đi muộn'], ['leave', s.leave, 'Nghỉ phép/CT']]
     .map(([k, v, t]) => `<div class="stat" data-f="${k}" style="cursor:pointer;${f === k && k ? 'outline:2px solid var(--p)' : ''}"><b>${v}</b><span>${t}</span></div>`).join('')}</div>
   ${(r.hr || []).length ? `<div class="card"><h3>👥 Nhắc việc nhân sự (${r.hr.length})</h3>${r.hr.map(a => `<div class="item"><div class="t"><b>${a.kind === 'SN' ? '🎂' : a.kind === 'HD' ? '📄' : '🧪'} ${esc(a.name)}</b><span class="muted">${esc(a.id)}</span></div><div class="muted">${esc(a.text)}</div></div>`).join('')}</div>` : ''}
   ${r.alerts.length ? `<div class="card"><h3>🚨 Chấm công bị từ chối hôm nay (${r.alerts.length})</h3>${r.alerts.map(a => `<div class="item"><div class="t"><b>${esc(a.name)}</b><span class="muted">${a.time}</span></div><div class="muted">${esc(a.note)} · <a target="_blank" href="https://maps.google.com/?q=${a.lat},${a.lng}">bản đồ</a></div></div>`).join('')}</div>` : ''}
   <div class="card tw"><table><tr><th>Nhân viên</th><th>Trạng thái</th><th>Vào</th><th>Ra</th><th>Muộn</th><th>Ảnh</th></tr>${list.map(x => `<tr><td><b>${esc(x.name)}</b><div class="muted">${esc(x.id)} · ${esc(x.dept)}</div></td>
     <td>${esc(x.status)}</td><td>${x.in}</td><td>${x.out}</td><td style="color:var(--r)">${x.late ? x.late + "'" : ''}</td><td>${x.photoId ? `<button class="btn sm s" data-ph="${x.photoId}">Xem</button>` : ''}</td></tr>`).join('')}</table></div>`);
  $('#dDate').onchange = e => { S.sub.dDate = e.target.value; mDash(); };
  $$('[data-f]').forEach(b => b.onclick = () => { const k = b.dataset.f === 'leave' ? '' : b.dataset.f; S.sub.dFilter = S.sub.dFilter === k ? '' : k; mDash(); });
  $$('[data-ph]').forEach(b => b.onclick = () => showPhoto(b.dataset.ph));
}
async function mAppr() {
  const r = await callV('pending', {}); if (!r.ok) return MG(`<div class="st er">${esc(r.error)}</div>`);
  const P = r.punches || []; S.data.me.pending = r.list.length + P.length; const T = S.data.me.reqTypes;
  MG(`<div class="card"><h3>Chấm công ngoài vùng chờ duyệt (${P.length})</h3>${P.map(x => `<div class="item"><div class="t"><b>${esc(x.empName)} · ${x.type === 'IN' ? 'Vào ca' : 'Ra ca'} ${esc(x.time.slice(11, 16))}</b><span class="muted">${vnDate(x.date)}</span></div>
    <div class="muted">${esc(x.note)} · <a target="_blank" href="https://maps.google.com/?q=${x.lat},${x.lng}">xem bản đồ</a></div>
    <div class="row" style="margin-top:8px">${x.photoId ? `<button class="btn sm s" data-ph="${x.photoId}">📷 Ảnh</button>` : ''}<button class="btn sm g" data-pa="${x.id}">✔ Duyệt</button><button class="btn sm r" data-pr="${x.id}">✘ Từ chối</button></div></div>`).join('') || '<p class="muted">Không có.</p>'}</div>
   <div class="card"><h3>Đơn chờ duyệt (${r.list.length})</h3>${r.list.map(x => `<div class="item"><div class="t"><b>${esc(x.empName)} · ${esc(T[x.type])}</b><span class="muted">${esc(x.createdAt.slice(5, 16))}</span></div>
    <div class="muted">${esc(x.empId)} · ${esc(x.dept)} · ${vnDate(x.fromDate)}${x.toDate !== x.fromDate ? ' → ' + vnDate(x.toDate) : ''}${x.half ? ' (' + x.half + ')' : ''}${x.fromTime || x.toTime ? ' · ' + esc(x.fromTime) + ' - ' + esc(x.toTime) : ''}${x.days ? ' · ' + x.days + ' ngày' : ''}</div>
    <div>${esc(x.reason)}</div><div class="row" style="margin-top:8px"><button class="btn sm g" data-ap="${x.id}">✔ Duyệt</button><button class="btn sm r" data-rj="${x.id}">✘ Từ chối</button></div></div>`).join('') || '<p class="muted">Không có đơn chờ duyệt.</p>'}</div>`);
  const act = (id, dec) => modal(`<h3>${dec === 'APPROVE' ? 'Duyệt đơn' : 'Từ chối đơn'}</h3><label>Ghi chú (không bắt buộc)</label><textarea id="apN"></textarea><div class="acts"><button class="btn s" data-x="close">Hủy</button><button class="btn ${dec === 'APPROVE' ? 'g' : 'r'}" id="apGo">Xác nhận</button></div>`)
    || ($('#apGo').onclick = async () => { const x = await call('approve', { id, decision: dec, note: $('#apN').value }); closeModal(); toast(x.ok ? 'Đã xử lý đơn' : x.error, x.ok ? 'ok' : 'er'); mAppr(); render(); });
  $$('[data-ap]').forEach(b => b.onclick = () => act(b.dataset.ap, 'APPROVE')); $$('[data-rj]').forEach(b => b.onclick = () => act(b.dataset.rj, 'REJECT'));
  const pAct = async (id, dec) => { const x = await call('approvePunch', { id, decision: dec }); toast(x.ok ? (dec === 'APPROVE' ? 'Đã duyệt' : 'Đã từ chối') : x.error, x.ok ? 'ok' : 'er'); mAppr(); };
  $$('[data-pa]').forEach(b => b.onclick = () => pAct(b.dataset.pa, 'APPROVE')); $$('[data-pr]').forEach(b => b.onclick = () => pAct(b.dataset.pr, 'REJECT'));
  $$('[data-ph]').forEach(b => b.onclick = () => showPhoto(b.dataset.ph));
}
function csvDownload(name, rows) {
  const csv = '﻿' + rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
  if (NATIVE) { const x = Native.saveFile(name, 'text/csv', csv, false); if (x !== 'OK') toast(x, 'er'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
async function mTs() {
  const mo = S.sub.tsMonth || ymd(now()).slice(0, 7), dept = S.sub.tsDept || '';
  MG(`<div class="card"><div class="row"><div><label>Tháng</label><input type="month" id="tsM" value="${mo}"></div><div><label>Bộ phận</label><input id="tsD" value="${esc(dept)}" placeholder="Tất cả"></div></div>
    <div class="row" style="margin-top:10px"><button class="btn s" id="tsCsv">⬇ Tải CSV (Excel)</button><button class="btn s" id="tsGs">📄 Xuất Google Sheet</button></div></div><div class="card muted" id="tsB">Đang tính bảng công…</div>`);
  $('#tsM').onchange = e => { S.sub.tsMonth = e.target.value; mTs(); }; $('#tsD').onchange = e => { S.sub.tsDept = e.target.value.trim(); mTs(); };
  const r = await callV('timesheet', { month: mo, dept }); if (!r.ok) return $('#tsB').innerHTML = `<div class="st er">${esc(r.error)}</div>`;
  const ts = r.sheet, SUM = [['Công TT', 'X'], ['Phép', 'P'], ['Ốm', 'O'], ['KL', 'KL'], ['CT', 'CT'], ['Lễ', 'L'], ['Vắng', 'V'], ['NCL', 'NCL'], ['Đột xuất', 'NDX'], ['Muộn', 'late'], ['Phút muộn', 'lateMin'], ['OT thường', 'otWD'], ['OT nghỉ', 'otWE'], ['OT lễ', 'otHol'], ['Điểm', 'score'], ['Xếp loại', 'rank'], ['Thiếu chấm', 'miss'], ['TỔNG CÔNG', 'paid'], ...(ts.rows.some(x => x.sum.pay != null) ? [['Lương ước tính', 'pay']] : [])];
  $('#tsB').className = 'card tw'; $('#tsB').innerHTML = `<table class="ts"><tr><th class="n">Nhân viên</th>${ts.days.map(d => `<th class="${d.w === 7 ? 'we' : ''}">${d.d.slice(8)}<br>${WD[d.w % 7]}</th>`).join('')}${SUM.map(s => `<th>${s[0]}</th>`).join('')}</tr>
    ${ts.rows.map(x => `<tr><td class="n"><b>${esc(x.name)}</b><div class="muted">${esc(x.empId)}</div></td>${x.cells.map(c => `<td class="c${esc(c.c.split(/[+/!]/)[0])}" title="${c.i}-${c.o}">${esc(c.c)}</td>`).join('')}${SUM.map(s => `<td><b>${s[1] === 'pay' ? (x.sum.pay != null ? x.sum.pay.toLocaleString('vi-VN') : '') : x.sum[s[1]]}</b></td>`).join('')}</tr>`).join('')}</table>
    <p class="muted">X đủ công · X/2 nửa công · P phép · O ốm · KL không lương · CT công tác · L lễ · V vắng · ! thiếu check-out</p>`;
  $('#tsCsv').onclick = () => csvDownload('BangCong_' + mo + '.csv', [['Mã NV', 'Họ tên', 'Bộ phận', ...ts.days.map(d => d.d.slice(8)), ...SUM.map(s => s[0])], ...ts.rows.map(x => [x.empId, x.name, x.dept, ...x.cells.map(c => c.c), ...SUM.map(s => x.sum[s[1]])])]);
  $('#tsGs').onclick = async e => { busy(e.target, 1); const x = await call('exportSheet', { month: mo }); busy(e.target, 0);
    if (x.ok) modal(`<h3>Đã xuất bảng công</h3><p>Bảng công tháng đã được ghi vào Google Sheet.</p><a class="btn full" href="${esc(x.url)}" target="_blank">Mở Google Sheet</a><div class="acts"><button class="btn s" data-x="close">Đóng</button></div>`); else toast(x.error, 'er'); };
}
async function mLogs() {
  const t = ymd(now()), f = S.sub.lF || t, to = S.sub.lT || t, all = S.sub.lAll !== false;
  MG(`<div class="card"><div class="row"><div><label>Từ ngày</label><input type="date" id="lF" value="${f}"></div><div><label>Đến ngày</label><input type="date" id="lT" value="${to}"></div></div>
   <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="lAll" style="width:auto" ${all ? 'checked' : ''}> Gồm cả lượt bị từ chối</label><button class="btn s sm" id="lCsv" style="margin-top:6px">⬇ Tải CSV</button></div><div class="card tw" id="lB">Đang tải…</div>`);
  const re = () => { S.sub.lF = $('#lF').value; S.sub.lT = $('#lT').value; S.sub.lAll = $('#lAll').checked; mLogs(); };
  $('#lF').onchange = re; $('#lT').onchange = re; $('#lAll').onchange = re;
  const r = await callV('logs', { from: f, to, all }); if (!r.ok) return $('#lB').innerHTML = esc(r.error);
  const L = r.logs.sort((a, b) => a.time < b.time ? 1 : -1);
  $('#lB').innerHTML = `<table><tr><th>Thời gian</th><th>Nhân viên</th><th>Loại</th><th>Địa điểm</th><th>Cách</th><th>±GPS</th><th>KQ</th><th>Ảnh</th><th>Ghi chú</th></tr>${L.map(l => `<tr style="${l.valid === 'TRUE' ? '' : 'background:#fff1f2'}"><td>${esc(l.time.slice(5, 16))}</td><td>${esc(l.empName)}<div class="muted">${esc(l.empId)}</div></td>
    <td>${l.type === 'IN' ? '🟢 Vào' : '🔴 Ra'}</td><td>${l.lat ? `<a target="_blank" href="https://maps.google.com/?q=${l.lat},${l.lng}">${esc(l.siteName)}</a>` : esc(l.siteName)}</td><td>${esc(l.distance)}${l.distance ? 'm' : ''}</td><td>${esc(l.accuracy)}</td>
    <td>${l.valid === 'TRUE' ? '✔' : '✘'}${l.offline === 'TRUE' ? ' 📴' : ''}</td><td>${l.photoId ? `<button class="btn sm s" data-ph="${l.photoId}">Xem</button>` : ''}</td><td class="muted">${esc(l.note)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Không có dữ liệu</td></tr>'}</table>`;
  $$('[data-ph]').forEach(b => b.onclick = () => showPhoto(b.dataset.ph));
  $('#lCsv').onclick = () => csvDownload('NhatKy_' + f + '_' + to + '.csv', [['Thời gian', 'Mã NV', 'Họ tên', 'Bộ phận', 'Loại', 'Địa điểm', 'Vĩ độ', 'Kinh độ', 'Cách (m)', 'Sai số (m)', 'Hợp lệ', 'Ngoại tuyến', 'Nguồn', 'Ghi chú'],
    ...L.map(l => [l.time, l.empId, l.empName, l.dept, l.type, l.siteName, l.lat, l.lng, l.distance, l.accuracy, l.valid, l.offline, l.source, l.note])]);
}
async function mEmp() {
  const r = await callV('employees', {}); if (!r.ok) return MG(`<div class="st er">${esc(r.error)}</div>`);
  S.data.emp = r; const ad = S.data.me.me.role === 'AD', q = (S.sub.eq || '').toLowerCase();
  const L = r.list.filter(e => !q || (e.id + ' ' + e.name + ' ' + e.dept).toLowerCase().includes(q)), PEN = r.list.filter(e => e.active === 'PENDING');
  MG(`<div class="card"><div class="row"><input id="eQ" placeholder="🔍 Tìm mã, tên, bộ phận…" value="${esc(S.sub.eq || '')}">${ad ? '<button class="btn" id="eNew" style="flex:0 0 auto">＋ Thêm</button>' : ''}</div></div>
   ${PEN.length && ad ? `<div class="card"><h3>🆕 Đăng ký chờ duyệt (${PEN.length})</h3>${PEN.map(e => `<div class="item"><div class="t"><b>${esc(e.name)}</b><span class="muted">${esc(e.id)}</span></div><div class="muted">${esc(e.phone)} · ${esc(e.email)} · ${esc(e.dept)} · ${esc(e.title || '')}</div>
     <div class="row" style="margin-top:6px"><button class="btn sm g" data-ae="${esc(e.id)}">✔ Duyệt</button><button class="btn sm r" data-re="${esc(e.id)}">✘ Từ chối</button></div></div>`).join('')}</div>` : ''}
   <div class="card">${L.filter(e => e.active !== 'PENDING').map(e => `<div class="item" ${ad ? `data-e="${e.id}" style="cursor:pointer"` : ''}><div class="t"><b>${esc(e.name)}</b><span class="muted">${esc(e.id)}</span></div>
   <div class="muted">${e.title ? esc(e.title) + ' · ' : ''}${ROLE[e.role] || ''} · ${esc(e.dept)} · ${esc(e.empType || '')} · Ca ${esc(e.shiftId)} ${e.active === 'TRUE' ? '' : '· <b style="color:var(--r)">Đã khóa</b>'} ${e.hasDevice ? '· 📱 đã gắn máy' : '· chưa gắn máy'}</div></div>`).join('') || '<p class="muted">Không có nhân viên.</p>'}</div>`);
  $('#eQ').oninput = e => { S.sub.eq = e.target.value; clearTimeout(S.eqT); S.eqT = setTimeout(() => { mEmp().then(() => { const i = $('#eQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 400); };
  $$('[data-ae]').forEach(b => b.onclick = async () => { const x = await call('approveEmployee', { id: b.dataset.ae }); toast(x.ok ? 'Đã duyệt — nhân viên đăng nhập được ngay' : x.error, x.ok ? 'ok' : 'er'); mEmp(); });
  $$('[data-re]').forEach(b => b.onclick = async () => { const x = await call('approveEmployee', { id: b.dataset.re, decision: 'REJECT' }); toast(x.ok ? 'Đã từ chối' : x.error); mEmp(); });
  if (ad) { $('#eNew').onclick = () => empForm({}); $$('[data-e]').forEach(el => el.onclick = () => empForm(r.list.find(x => x.id === el.dataset.e))); }
}
function empForm(e) {
  const r = S.data.emp, isNew = !e.id, wd = String(e.workDays || '1,2,3,4,5,6').split(','), sid = String(e.siteIds || '').split(',');
  modal(`<h3>${isNew ? 'Thêm nhân viên' : 'Sửa: ' + esc(e.name)}</h3>
   <div class="row"><div><label>Mã NV</label><input id="fId" value="${esc(e.id || '')}" ${isNew ? 'placeholder="Để trống = tự cấp mã"' : 'disabled'} autocapitalize="characters"></div><div><label>Họ tên</label><input id="fNm" value="${esc(e.name || '')}"></div></div>
   <div class="row"><div><label>Vai trò</label><select id="fRl">${Object.keys(ROLE).map(k => `<option value="${k}" ${e.role === k ? 'selected' : ''}>${ROLE[k]}</option>`).join('')}</select></div><div><label>Bộ phận</label><input id="fDp" value="${esc(e.dept || '')}"></div></div>
   <div class="row"><div><label>Ca làm</label><select id="fSh">${r.shifts.map(s => `<option value="${esc(s.id)}" ${e.shiftId === s.id ? 'selected' : ''}>${esc(s.name)} (${s.start}-${s.end})</option>`).join('')}</select></div><div><label>Số ngày phép/năm</label><input id="fLq" type="number" value="${esc(e.leaveQuota || '')}" placeholder="Mặc định"></div></div>
   <label>Ngày bắt đầu tính công</label><input id="fSd" type="date" value="${esc(e.startDate || ymd(now()))}">
   <label>Ngày làm việc trong tuần</label><div class="chk">${[1, 2, 3, 4, 5, 6, 7].map(i => `<label><input type="checkbox" class="fWd" value="${i}" ${wd.includes(String(i)) ? 'checked' : ''}>${['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]}</label>`).join('')}</div>
   <label>Địa điểm được chấm (không chọn = tất cả)</label><div class="chk">${r.sites.map(s => `<label><input type="checkbox" class="fSt" value="${esc(s.id)}" ${sid.includes(s.id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('') || '<span class="muted">Chưa có địa điểm</span>'}</div>
   <h3 style="margin:14px 0 0;font-size:14px">Hồ sơ nhân sự</h3>
   <div class="row"><div><label>Chức danh</label><input id="fTi" value="${esc(e.title || '')}" placeholder="VD: Nhân viên giao nhận"></div><div><label>Loại nhân viên</label><select id="fTy">${['Chính thức', 'Thử việc', 'Thời vụ', 'Cộng tác viên', 'Thực tập'].map(x => `<option ${e.empType === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
   <div class="row"><div><label>Ngày sinh</label><input id="fBd" type="date" value="${esc(e.birthday || '')}"></div><div><label>Quản lý trực tiếp</label><select id="fMg"><option value="">—</option>${r.list.filter(x => x.role !== 'NV' && x.id !== e.id).map(x => `<option value="${esc(x.id)}" ${e.managerId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
   <div class="row"><div><label>Loại hợp đồng</label><select id="fCt">${['', 'Thử việc', 'Xác định thời hạn 12 tháng', 'Xác định thời hạn 24 tháng', 'Xác định thời hạn 36 tháng', 'Không xác định thời hạn', 'Thời vụ'].map(x => `<option ${e.contractType === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div><label>Ngày hết hạn HĐ</label><input id="fCe" type="date" value="${esc(e.contractEnd || '')}"></div></div>
   ${S.data.me.me.role === 'AD' ? `<label>Lương cơ bản/tháng (VNĐ, để ước tính lương theo công)</label><input id="fSa" type="number" value="${esc(e.salary || '')}">` : ''}
   <div class="row"><div><label>Địa chỉ</label><input id="fAd" value="${esc(e.address || '')}"></div><div><label>Liên hệ khẩn cấp</label><input id="fEc" value="${esc(e.emergency || '')}"></div></div>
   ${S.data.me.me.role === 'AD' ? `<div class="row"><div><label>Phụ cấp/tháng</label><input id="fAl" type="number" value="${esc(e.allowance || '')}"></div><div><label>Lương đóng BH (trống = lương CB)</label><input id="fIs" type="number" value="${esc(e.insSalary || '')}"></div><div><label>Số người phụ thuộc</label><input id="fDe" type="number" value="${esc(e.dependents || '')}"></div></div>` : ''}
   <label>Ghi chú</label><input id="fNo" value="${esc(e.note || '')}">
   <div class="row"><div><label>Email (nhận nhắc việc, duyệt đơn)</label><input id="fEm" type="email" value="${esc(e.email || '')}"></div><div><label>Điện thoại</label><input id="fPh" value="${esc(e.phone || '')}"></div></div>
   <label style="display:flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" id="fAc" style="width:auto" ${e.active !== 'FALSE' ? 'checked' : ''}> Đang làm việc (bỏ chọn để khóa tài khoản)</label>
   ${isNew ? '<p class="muted">Mật khẩu ban đầu: <b>123456</b> (bắt buộc đổi khi đăng nhập lần đầu).</p>' : `<div class="row" style="margin-top:10px"><button class="btn s sm" id="fRp">🔑 Đặt lại mật khẩu</button><button class="btn s sm" id="fRd" ${e.hasDevice ? '' : 'disabled'}>📱 Gỡ gắn điện thoại</button></div>`}
   <div id="fMsg"></div><div class="acts"><button class="btn s" data-x="close">Hủy</button><button class="btn" id="fGo">Lưu</button></div>`);
  $('#fGo').onclick = async () => {
    const emp = { id: $('#fId').value, name: $('#fNm').value, role: $('#fRl').value, dept: $('#fDp').value, shiftId: $('#fSh').value, leaveQuota: $('#fLq').value, startDate: $('#fSd').value,
      workDays: $$('.fWd').filter(x => x.checked).map(x => x.value).join(','), siteIds: $$('.fSt').filter(x => x.checked).map(x => x.value).join(','), email: $('#fEm').value, phone: $('#fPh').value, active: $('#fAc').checked,
      title: $('#fTi').value, empType: $('#fTy').value, birthday: $('#fBd').value, managerId: $('#fMg').value, contractType: $('#fCt').value, contractEnd: $('#fCe').value, note: $('#fNo').value };
    if ($('#fSa')) emp.salary = $('#fSa').value;
    emp.address = $('#fAd').value; emp.emergency = $('#fEc').value; if ($('#fAl')) { emp.allowance = $('#fAl').value; emp.insSalary = $('#fIs').value; emp.dependents = $('#fDe').value; }
    const x = await call('saveEmployee', { emp }); if (!x.ok) return $('#fMsg').innerHTML = `<div class="st er">${esc(x.error)}</div>`;
    closeModal(); toast(x.created ? 'Đã thêm nhân viên ' + x.id + ' (mật khẩu 123456)' : 'Đã lưu', 'ok'); mEmp();
  };
  if (!isNew) {
    $('#fRp').onclick = async () => { const x = await call('resetPw', { id: e.id }); toast(x.ok ? 'Mật khẩu đã đặt lại: 123456' : x.error, x.ok ? 'ok' : 'er'); };
    $('#fRd').onclick = async () => { const x = await call('resetDevice', { id: e.id }); toast(x.ok ? 'Đã gỡ máy. Nhân viên đăng nhập trên máy mới để gắn lại.' : x.error, x.ok ? 'ok' : 'er'); closeModal(); mEmp(); };
  }
}
async function mSched() {
  const [e, sc] = await Promise.all([callV('employees', {}), callV('schedule', { from: ymd(now()), to: ymd(new Date(now().getTime() + 45 * 864e5)) })]);
  if (!e.ok) return MG(`<div class="st er">${esc(e.error)}</div>`);
  const t = ymd(now()), EM = {}; e.list.forEach(x => EM[x.id] = x.name); const SH = {}; e.shifts.forEach(x => SH[x.id] = x.name);
  MG(`<div class="card"><h3>🗓 Xếp ca / lịch nghỉ</h3><p class="muted">Đổi ca hoặc cho nghỉ theo ngày cho từng nhân viên (ưu tiên hơn ca mặc định). Chọn "Ca mặc định" để xóa lịch đã xếp.</p>
    <div class="row"><div><label>Từ ngày</label><input type="date" id="scF" value="${t}"></div><div><label>Đến ngày</label><input type="date" id="scT" value="${t}"></div></div>
    <label>Ca</label><select id="scS"><option value="DEFAULT">↺ Ca mặc định (xóa lịch)</option><option value="OFF">🏖 Nghỉ (không tính vắng)</option>${e.shifts.map(x => `<option value="${esc(x.id)}">${esc(x.name)} (${x.start}-${x.end})</option>`).join('')}</select>
    <label>Nhân viên <a href="#" id="scAll" style="font-size:12px">(chọn tất cả)</a></label><div class="chk">${e.list.filter(x => x.active !== 'FALSE').map(x => `<label><input type="checkbox" class="scE" value="${esc(x.id)}">${esc(x.name)}</label>`).join('')}</div>
    <button class="btn full" id="scGo" style="margin-top:10px">Lưu lịch</button></div>
   <div class="card"><h3>Lịch đã xếp (45 ngày tới)</h3>${(sc.list || []).sort((a, b) => a.date < b.date ? -1 : 1).map(x => `<div class="item"><div class="t"><span><b>${vnDate(x.date)}</b> · ${esc(EM[x.empId] || x.empId)}</span><span class="pill ${x.shiftId === 'OFF' ? 'CANCELLED' : 'APPROVED'}">${x.shiftId === 'OFF' ? 'Nghỉ' : esc(SH[x.shiftId] || x.shiftId)}</span></div></div>`).join('') || '<p class="muted">Chưa có lịch riêng, mọi người làm theo ca mặc định.</p>'}</div>`);
  $('#scAll').onclick = ev => { ev.preventDefault(); $$('.scE').forEach(x => x.checked = true); };
  $('#scGo').onclick = async ev => { const ids = $$('.scE').filter(x => x.checked).map(x => x.value); if (!ids.length) return toast('Chọn nhân viên', 'er');
    busy(ev.target, 1); const x = await call('saveSchedule', { empIds: ids, from: $('#scF').value, to: $('#scT').value, shiftId: $('#scS').value }); busy(ev.target, 0);
    toast(x.ok ? 'Đã lưu ' + x.count + ' ngày công' : x.error, x.ok ? 'ok' : 'er'); if (x.ok) mSched(); };
}
async function mEval() {
  const mo = S.sub.evM || ymd(now()).slice(0, 7);
  const [r, g] = await Promise.all([callV('evaluation', { month: mo }), callV('ratings', { month: mo })]); if (!r.ok) return MG(`<div class="st er">${esc(r.error)}</div>`);
  const RT = { XS: '🌟 Xuất sắc', TOT: '👍 Tốt', BT: '🙂 Bình thường', KEM: '👎 Kém' };
  MG(`<div class="card"><div class="row"><div><label>Tháng</label><input type="month" id="evM" value="${mo}"></div></div><p class="muted">Điểm = 100 − đi trễ/về sớm (2đ/lần) − vắng (5đ/ngày) − nghỉ đột xuất (3đ/ngày) − thiếu chấm công (2đ/lần) + chuyên cần (+5) + điểm khách hàng đánh giá. Xếp loại và thưởng theo Cấu hình.</p></div>
   <div class="card tw"><h3>🏆 Bảng xếp hạng thi đua</h3><table><tr><th>#</th><th>Nhân viên</th><th>Điểm</th><th>Xếp loại</th><th>KH đánh giá</th></tr>${r.list.map((x, i) => `<tr><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td><b>${esc(x.name)}</b><div class="muted">${esc(x.empId)} · ${esc(x.dept)}</div></td>
     <td><b>${x.score}</b></td><td><span class="pill ${x.score >= 100 ? 'APPROVED' : x.score >= 75 ? 'PENDING' : 'REJECTED'}">${esc(x.rank)}</span></td><td class="muted">🌟${x.ratings.XS} 👍${x.ratings.TOT} 🙂${x.ratings.BT} 👎${x.ratings.KEM}</td></tr>`).join('')}</table></div>
   <div class="card"><h3>💬 Khách hàng đánh giá (${(g.list || []).length})</h3>${(g.list || []).map(x => `<div class="item"><div class="t"><b>${RT[x.level] || x.level} · ${esc(x.empId)}</b><span class="muted">${esc(x.time.slice(5, 16))}</span></div><div>${esc(x.comment)}</div><div class="muted">${esc(x.customer)}</div></div>`).join('') || '<p class="muted">Chưa có đánh giá.</p>'}</div>`);
  $('#evM').onchange = e => { S.sub.evM = e.target.value; mEval(); };
}
async function mPay() {
  const mo = S.sub.pyM || ymd(now()).slice(0, 7), r = await callV('payslips', { month: mo }); if (!r.ok) return MG(`<div class="st er">${esc(r.error)}</div>`);
  const L = r.list.filter(x => x.net != null);
  MG(`<div class="card"><div class="row"><div><label>Tháng</label><input type="month" id="pyM" value="${mo}"></div></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="pySend">📧 Gửi phiếu lương qua email (${L.filter(x => x.email).length})</button><button class="btn s" id="pyCsv">⬇ Tải bảng lương CSV</button></div>
    <p class="muted">Nhân viên chưa có mức lương sẽ không có phiếu lương (nhập ở Quản lý › Nhân viên). Gửi Zalo: mở phiếu từng người › Gửi Zalo.</p></div>
   <div class="card tw"><table><tr><th>Nhân viên</th><th>Công</th><th>Tăng ca</th><th>Thưởng</th><th>Tổng TN</th><th>BH</th><th>Thuế</th><th>Thực lĩnh</th><th></th></tr>${L.map(x => `<tr><td><b>${esc(x.name)}</b><div class="muted">${esc(x.empId)}</div></td><td>${x.paidDays}</td><td>${money(x.otPay)}</td><td>${money(x.bonus)}</td><td>${money(x.gross)}</td><td>${money(x.ins)}</td><td>${money(x.tax)}</td><td><b style="color:var(--g)">${money(x.net)}</b></td><td><button class="btn sm s" data-sl="${esc(x.empId)}">Xem</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Chưa có nhân viên nào được nhập mức lương.</td></tr>'}</table></div>`);
  $('#pyM').onchange = e => { S.sub.pyM = e.target.value; mPay(); };
  $$('[data-sl]').forEach(b => b.onclick = () => { const x = L.find(y => y.empId === b.dataset.sl); showSlip(x.name, x.empId, x); });
  $('#pySend').onclick = () => confirmBox('Gửi phiếu lương tháng ' + mo.slice(5) + '/' + mo.slice(0, 4) + ' qua email cho nhân viên?', async () => { const x = await call('sendPayslips', { month: mo }); toast(x.ok ? `Đã gửi ${x.sent} phiếu lương${x.miss.length ? '; chưa có email: ' + x.miss.join(', ') : ''}` : x.error, x.ok ? 'ok' : 'er'); });
  $('#pyCsv').onclick = () => csvDownload('BangLuong_' + mo + '.csv', [['Mã NV', 'Họ tên', 'Bộ phận', 'Lương CB', 'Công', 'Lương theo công', 'OT thường (h)', 'OT nghỉ (h)', 'OT lễ (h)', 'Tiền tăng ca', 'Phụ cấp', 'Xếp loại', 'Thưởng', 'Tổng thu nhập', 'Bảo hiểm', 'Thuế TNCN', 'Thực lĩnh'],
    ...L.map(x => [x.empId, x.name, x.dept, x.base, x.paidDays, x.work, x.otWD, x.otWE, x.otHol, x.otPay, x.allowance, x.rank, x.bonus, x.gross, x.ins, x.tax, x.net])]);
}
function mAnn() {
  const ad = S.data.me.me.role === 'AD';
  MG(`<div class="card"><h3>📣 Gửi thông báo nội bộ</h3><p class="muted">Thông báo hiện trên điện thoại của nhân viên (ứng dụng Android) và trong mục 🔔.</p>
   ${ad ? '<label>Gửi tới bộ phận (để trống = toàn công ty)</label><input id="anD" placeholder="VD: Khai thác">' : `<p class="muted">Gửi tới bộ phận: <b>${esc(S.data.me.me.dept)}</b></p>`}
   <label>Tiêu đề</label><input id="anT"><label>Nội dung</label><textarea id="anB"></textarea><button class="btn full" id="anGo" style="margin-top:10px">Gửi</button></div>`);
  $('#anGo').onclick = async e => { busy(e.target, 1); const x = await call('announce', { title: $('#anT').value, body: $('#anB').value, dept: ad ? $('#anD').value.trim() : '' }); busy(e.target, 0);
    toast(x.ok ? 'Đã gửi thông báo' : x.error, x.ok ? 'ok' : 'er'); if (x.ok) { $('#anT').value = ''; $('#anB').value = ''; } };
}
async function mSite() {
  const r = await callV('employees', {}); if (!r.ok) return MG(esc(r.error)); S.data.emp = r;
  MG(`<div class="card"><h3>Địa điểm chấm công<span class="sp"></span><button class="btn sm" id="sNew">＋ Thêm</button></h3><div class="map big" id="smap"></div>
   ${r.sites.map(s => `<div class="item" data-s="${s.id}" style="cursor:pointer"><div class="t"><b>${esc(s.name)}</b><span class="muted">bán kính ${s.radius} m</span></div><div class="muted">${(+s.lat).toFixed(6)}, ${(+s.lng).toFixed(6)}${s.wifi ? ' · 📶 ' + esc(s.wifi) : ''}</div></div>`).join('') || '<p class="muted">Chưa có địa điểm. Bấm ＋ Thêm.</p>'}</div>`);
  setTimeout(() => { const c = r.sites[0] || S.pos || { lat: 10.75, lng: 106.92 }; const mp = mkMap('smap', +c.lat, +c.lng, r.sites.length ? 15 : 12); if (!mp) return;
    const g = r.sites.map(s => L.circle([+s.lat, +s.lng], { radius: +s.radius, color: '#0b5cad', weight: 2, fillOpacity: .15 }).addTo(mp).bindTooltip(s.name, { permanent: true }));
    if (g.length > 1) mp.fitBounds(L.featureGroup(g).getBounds().pad(0.3)); }, 50);
  $('#sNew').onclick = () => siteForm({}); $$('[data-s]').forEach(el => el.onclick = () => siteForm(r.sites.find(x => x.id === el.dataset.s)));
}
function siteForm(s) {
  startGPS();
  modal(`<h3>${s.id ? 'Sửa địa điểm' : 'Thêm địa điểm'}</h3><p class="muted">Chạm lên bản đồ để đặt tâm vùng chấm công, hoặc bấm "Vị trí của tôi" khi đang đứng tại nơi làm việc.</p>
   <div class="map" id="fmap" style="height:260px"></div><label>Tên địa điểm</label><input id="sNm" value="${esc(s.name || '')}" placeholder="VD: ICD Tân Cảng Nhơn Trạch - Cổng chính">
   <div class="row"><div><label>Vĩ độ</label><input id="sLa" type="number" step="any" value="${esc(s.lat || '')}"></div><div><label>Kinh độ</label><input id="sLn" type="number" step="any" value="${esc(s.lng || '')}"></div><div><label>Bán kính (m)</label><input id="sRd" type="number" value="${esc(s.radius || 200)}"></div></div>
   <button class="btn s sm" id="sMe" style="margin-top:8px">📍 Vị trí của tôi</button>
   <label>Wi-Fi của địa điểm (tên SSID hoặc địa chỉ BSSID, cách nhau dấu phẩy)</label><input id="sWf" value="${esc(s.wifi || '')}" placeholder="VD: TCNT-VanPhong, a4:2b:b0:12:34:56">
   ${NATIVE ? '<button class="btn s sm" id="sWfNow" style="margin-top:8px">📶 Thêm Wi-Fi đang kết nối</button>' : '<p class="muted">Dùng ứng dụng Android để lấy Wi-Fi tự động.</p>'}<div id="sMsg"></div>
   <div class="acts">${s.id ? '<button class="btn r" id="sDel">Xóa</button>' : ''}<button class="btn s" data-x="close">Hủy</button><button class="btn" id="sGo">Lưu</button></div>`);
  let mk = null, ci = null, mp = null;
  const draw = () => { const la = +$('#sLa').value, ln = +$('#sLn').value; if (!mp || !la || !ln) return; const rd = +$('#sRd').value || 200;
    if (!mk) { mk = L.marker([la, ln]).addTo(mp); ci = L.circle([la, ln], { radius: rd, color: '#0b5cad' }).addTo(mp); } else { mk.setLatLng([la, ln]); ci.setLatLng([la, ln]).setRadius(rd); } };
  setTimeout(() => { const c = s.lat ? s : S.pos || { lat: 10.75, lng: 106.92 }; mp = mkMap('fmap', +c.lat, +c.lng, s.lat || S.pos ? 16 : 11); if (!mp) return;
    mp.on('click', e => { $('#sLa').value = e.latlng.lat.toFixed(6); $('#sLn').value = e.latlng.lng.toFixed(6); draw(); }); draw(); }, 80);
  ['#sLa', '#sLn', '#sRd'].forEach(i => $(i).oninput = draw);
  $('#sMe').onclick = async () => { const p = await freshPos(); if (!p) return toast('Chưa lấy được vị trí', 'er'); $('#sLa').value = p.lat.toFixed(6); $('#sLn').value = p.lng.toFixed(6); draw(); if (mp) mp.setView([p.lat, p.lng], 17); };
  if (NATIVE) $('#sWfNow').onclick = () => { const w = wifiNow(); if (!w.ssid) return toast('Máy chưa kết nối Wi-Fi (hoặc chưa cấp quyền Vị trí)', 'er');
    const cur = $('#sWf').value.split(',').map(x => x.trim()).filter(String); [w.ssid, w.bssid].forEach(x => { if (x && !cur.includes(x)) cur.push(x); }); $('#sWf').value = cur.join(', '); };
  $('#sGo').onclick = async () => { const x = await call('saveSite', { item: { id: s.id, name: $('#sNm').value, lat: $('#sLa').value, lng: $('#sLn').value, radius: $('#sRd').value, wifi: $('#sWf').value.trim() } });
    if (!x.ok) return $('#sMsg').innerHTML = `<div class="st er">${esc(x.error)}</div>`; closeModal(); toast('Đã lưu địa điểm', 'ok'); render(); loadMe(); };
  if (s.id) $('#sDel').onclick = () => confirmBox('Xóa địa điểm ' + s.name + '?', async () => { await call('deleteSite', { id: s.id }); render(); loadMe(); });
}
async function mShift() {
  const r = await callV('employees', {}); if (!r.ok) return MG(esc(r.error));
  MG(`<div class="card"><h3>Ca làm việc<span class="sp"></span><button class="btn sm" id="cNew">＋ Thêm ca</button></h3>${r.shifts.map(s => `<div class="item" data-c="${esc(s.id)}" style="cursor:pointer"><div class="t"><b>${esc(s.name)}</b><span class="muted">${esc(s.id)}</span></div>
   <div class="muted">${s.start} – ${s.end} · nghỉ giữa ca ${s.breakMin} phút · cho phép muộn ${s.graceMin} phút</div></div>`).join('')}</div>`);
  const form = s => { modal(`<h3>${s.id ? 'Sửa ca' : 'Thêm ca'}</h3><div class="row"><div><label>Mã ca</label><input id="cId" value="${esc(s.id || '')}" ${s.id ? 'disabled' : ''} placeholder="VD: CA1"></div><div><label>Tên ca</label><input id="cNm" value="${esc(s.name || '')}"></div></div>
     <div class="row"><div><label>Giờ vào</label><input type="time" id="cSt" value="${esc(s.start || '07:30')}"></div><div><label>Giờ ra</label><input type="time" id="cEn" value="${esc(s.end || '17:00')}"></div></div>
     <div class="row"><div><label>Nghỉ giữa ca (phút)</label><input type="number" id="cBr" value="${esc(s.breakMin || 90)}"></div><div><label>Cho phép muộn (phút)</label><input type="number" id="cGr" value="${esc(s.graceMin || 5)}"></div></div><div id="cMsg"></div>
     <div class="acts">${s.id ? '<button class="btn r" id="cDel">Xóa</button>' : ''}<button class="btn s" data-x="close">Hủy</button><button class="btn" id="cGo">Lưu</button></div>`);
    $('#cGo').onclick = async () => { const x = await call('saveShift', { item: { id: (s.id || $('#cId').value.trim().toUpperCase()) || undefined, name: $('#cNm').value, start: $('#cSt').value, end: $('#cEn').value, breakMin: $('#cBr').value, graceMin: $('#cGr').value } });
      if (!x.ok) return $('#cMsg').innerHTML = `<div class="st er">${esc(x.error)}</div>`; closeModal(); mShift(); };
    if (s.id) $('#cDel').onclick = () => confirmBox('Xóa ca ' + s.name + '? Nhân viên thuộc ca này sẽ dùng ca đầu tiên.', async () => { await call('deleteShift', { id: s.id }); mShift(); }); };
  $('#cNew').onclick = () => form({}); $$('[data-c]').forEach(el => el.onclick = () => form(r.shifts.find(x => x.id === el.dataset.c)));
}
async function mHol() {
  const r = await callV('employees', {}); if (!r.ok) return MG(esc(r.error)); const y = now().getFullYear();
  const L = r.holidays.sort((a, b) => a.date < b.date ? -1 : 1);
  MG(`<div class="card"><h3>Thêm ngày lễ</h3><div class="row"><div><label>Ngày</label><input type="date" id="hD"></div><div><label>Tên</label><input id="hN" placeholder="VD: Tết Nguyên đán"></div></div>
   <div class="row" style="margin-top:10px"><button class="btn" id="hGo">Thêm</button><button class="btn s" id="hFix">Thêm lễ dương lịch ${y}</button></div><p class="muted">Tết Âm lịch và Giỗ Tổ Hùng Vương thay đổi theo năm — vui lòng thêm thủ công theo thông báo của Nhà nước.</p></div>
   <div class="card">${L.map(h => `<div class="item"><div class="t"><span><b>${vnDate(h.date)}</b> · ${WD[new Date(h.date + 'T00:00').getDay()]} — ${esc(h.name)}</span><button class="btn sm s" data-hd="${h.date}">Xóa</button></div></div>`).join('') || '<p class="muted">Chưa có ngày lễ.</p>'}</div>`);
  $('#hGo').onclick = async () => { const x = await call('saveHoliday', { item: { date: $('#hD').value, name: $('#hN').value || 'Nghỉ lễ' } }); if (!x.ok) toast(x.error, 'er'); mHol(); };
  $('#hFix').onclick = async () => { for (const [d, n] of [['01-01', 'Tết Dương lịch'], ['04-30', 'Ngày Giải phóng miền Nam'], ['05-01', 'Quốc tế Lao động'], ['09-02', 'Quốc khánh']]) await call('saveHoliday', { item: { date: y + '-' + d, name: n } }); toast('Đã thêm', 'ok'); mHol(); };
  $$('[data-hd]').forEach(b => b.onclick = async () => { await call('deleteHoliday', { date: b.dataset.hd }); mHol(); });
}
async function mCfg() {
  const r = await callV('getCfg', {}); if (!r.ok) return MG(esc(r.error)); const c = r.cfg;
  const yn = (k, t) => `<label style="display:flex;gap:8px;align-items:center;color:var(--t);font-size:14px"><input type="checkbox" id="k_${k}" style="width:auto" ${String(c[k]).toUpperCase() === 'TRUE' ? 'checked' : ''}> ${t}</label>`;
  const tx = (k, t, ty = 'text') => `<div><label>${t}</label><input id="k_${k}" type="${ty}" value="${esc(c[k])}"></div>`;
  MG(`<div class="card"><h3>Cấu hình hệ thống</h3>${tx('company', 'Tên đơn vị')}
   <div class="row">${tx('maxAccuracy', 'Sai số GPS tối đa (m)', 'number')}${tx('defaultLeaveQuota', 'Phép năm mặc định (ngày)', 'number')}</div>
   <div class="row">${tx('fullDayRatio', 'Tỷ lệ giờ làm tính đủ công (0-1)', 'number')}${tx('offlineMaxHours', 'Hạn đồng bộ ngoại tuyến (giờ)', 'number')}</div>
   <div class="row">${tx('minAppVersion', 'Phiên bản app tối thiểu')}${tx('remindAfterMin', 'Nhắc check-in sau giờ vào ca (phút)', 'number')}</div>
   <label>Kiểm tra Wi-Fi công ty</label><select id="k_wifiMode">${[['OFF', 'Không dùng Wi-Fi (chỉ GPS)'], ['GPS_OR_WIFI', 'GPS HOẶC Wi-Fi công ty'], ['GPS_AND_WIFI', 'GPS VÀ Wi-Fi công ty (chặt nhất)']].map(([v, t]) => `<option value="${v}" ${c.wifiMode === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
   ${yn('requireApp', 'Chỉ cho chấm công bằng ứng dụng Android (chặn trình duyệt, phát hiện Fake GPS)')}${yn('notifyRejected', 'Báo quản lý khi có lượt chấm công bị từ chối')}${yn('allowOutsideRequest', 'Cho nhân viên gửi chấm công ngoài vùng để quản lý duyệt')}
   <h3 style="margin-top:14px">👤 Tài khoản</h3>${yn('selfRegister', 'Cho nhân viên tự đăng ký tài khoản')}${yn('regApproval', 'Tài khoản tự đăng ký phải được quản trị duyệt')}<div class="row">${tx('empPrefix', 'Tiền tố mã nhân viên (VD: TCL → TCL0001)')}</div>
   <h3 style="margin-top:14px">📝 Quy định đơn từ</h3><div class="row">${tx('leaveL2Days', 'Nghỉ từ bao nhiêu ngày cần 2 cấp duyệt', 'number')}${tx('leaveNoticeDays', 'Phải báo trước (ngày) với nghỉ dài', 'number')}</div>
   <h3 style="margin-top:14px">💵 Lương, tăng ca, thuế</h3><div class="row">${tx('standardDays', 'Công chuẩn/tháng', 'number')}${tx('otWeekday', 'Hệ số tăng ca ngày thường', 'number')}${tx('otWeekend', 'Hệ số ngày nghỉ tuần', 'number')}${tx('otHoliday', 'Hệ số ngày lễ', 'number')}</div>
   <div class="row">${tx('otMonthCap', 'Trần tăng ca/tháng (giờ)', 'number')}${tx('otWeekCap', 'Cảnh báo tăng ca/tuần (giờ)', 'number')}${tx('insRate', 'Tỷ lệ BH người lao động đóng (%)', 'number')}</div>
   <div class="row">${tx('taxPersonal', 'Giảm trừ bản thân/tháng', 'number')}${tx('taxDependent', 'Giảm trừ mỗi người phụ thuộc', 'number')}</div>${tx('taxTable', 'Biểu thuế (trần triệu:thuế suất %, 0 = phần còn lại)')}
   <h3 style="margin-top:14px">🏅 Thi đua & thưởng</h3><div class="row">${tx('rankXS', 'Điểm Xuất sắc ≥', 'number')}${tx('rankTot', 'Điểm Tốt ≥', 'number')}${tx('rankKha', 'Điểm Khá ≥', 'number')}</div>
   <div class="row">${tx('bonusXS', 'Thưởng Xuất sắc', 'number')}${tx('bonusTot', 'Thưởng Tốt', 'number')}${tx('bonusKha', 'Thưởng Khá', 'number')}</div>
   <div class="row">${tx('rateXS', 'Điểm KH: Xuất sắc', 'number')}${tx('rateTOT', 'Tốt', 'number')}${tx('rateBT', 'Bình thường', 'number')}${tx('rateKEM', 'Kém', 'number')}</div>
   ${yn('requireSelfie', 'Bắt buộc chụp ảnh khuôn mặt khi chấm công')}${yn('bindDevice', 'Mỗi tài khoản chỉ dùng trên 1 điện thoại')}${yn('allowOffline', 'Cho phép chấm công khi mất mạng (tự đồng bộ sau)')}${yn('remindEnabled', 'Gửi email nhắc nhân viên chưa check-in (cần chạy installReminder 1 lần)')}
   <button class="btn full" id="kGo" style="margin-top:12px">Lưu cấu hình</button></div>
   <div class="card muted">Máy chủ: backend ${esc(S.data.me.backend)} · App ${VERSION}. Dữ liệu lưu tại Google Sheet của tài khoản triển khai Apps Script; ảnh xác thực lưu trong thư mục Drive "ChamCong_AnhXacThuc".</div>`);
  $('#mg').insertAdjacentHTML('beforeend', `<div class="card"><h3>🗄 Lưu trữ dữ liệu cũ</h3><p class="muted">Chuyển nhật ký chấm công trước ngày đã chọn sang file Google Sheet lưu trữ riêng để hệ thống chạy nhanh (khuyến nghị mỗi năm 1 lần, sau khi chốt lương).</p>
    <div class="row"><input type="date" id="arD"><button class="btn y" id="arGo" style="flex:0 0 auto">Lưu trữ</button></div><div id="arMsg"></div></div>`);
  $('#arGo').onclick = () => { const d = $('#arD').value; if (!d) return toast('Chọn ngày', 'er'); confirmBox('Chuyển toàn bộ nhật ký trước ngày ' + vnDate(d) + ' sang file lưu trữ?', async () => {
    const x = await call('archive', { before: d }); $('#arMsg').innerHTML = x.ok ? `<div class="st ok">Đã chuyển ${x.moved} dòng. <a target="_blank" href="${esc(x.url)}">Mở file lưu trữ</a></div>` : `<div class="st er">${esc(x.error)}</div>`; }); };
  $('#kGo').onclick = async () => {
    const o = {}; Object.keys(c).forEach(k => { const el = $('#k_' + k); if (el) o[k] = el.type === 'checkbox' ? (el.checked ? 'TRUE' : 'FALSE') : el.value; });
    const x = await call('saveCfg', { cfg: o }); toast(x.ok ? 'Đã lưu cấu hình' : x.error, x.ok ? 'ok' : 'er'); if (x.ok) loadMe();
  };
}

/* ---------------- TAB: TÀI KHOẢN ---------------- */
function vAcc(target) {
  const m = S.data.me.me;
  $(typeof target === 'string' ? target : '#view').innerHTML = `<div class="card"><h3>Thông tin cá nhân</h3><div class="kv"><span>Mã NV</span><b>${esc(m.id)}</b><span>Họ tên</span><b>${esc(m.name)}</b><span>Vai trò</span><b>${ROLE[m.role]}</b><span>Bộ phận</span><b>${esc(m.dept)}</b>
   <span>Ca làm</span><b>${esc(S.data.me.shift.name)} (${S.data.me.shift.start}-${S.data.me.shift.end})</b><span>Email</span><b>${esc(m.email) || '—'}</b></div></div>
   <div class="card"><button class="btn s full" id="aPw">🔑 Đổi mật khẩu</button>${!isStandalone() ? '<button class="btn o full" data-x="install" style="margin-top:8px">📲 Cài ứng dụng lên điện thoại</button>' : ''}
   ${NATIVE ? `<label style="display:flex;gap:8px;align-items:center;color:var(--t);font-size:14px;margin-top:12px"><input type="checkbox" id="aRem" style="width:auto" ${LS.get('remOn', true) ? 'checked' : ''}> Nhắc giờ vào/ra ca trên điện thoại</label>` : (isAndroid ? '<a class="btn g full" href="download/" style="margin-top:8px;text-decoration:none">⬇ Tải ứng dụng Android (.apk)</a>' : '')}
   <button class="btn s full" id="aProf" style="margin-top:8px">✏️ Cập nhật thông tin cá nhân</button>
   <button class="btn s full" id="aQR" style="margin-top:8px">⭐ Mã QR để khách hàng đánh giá</button>
   <button class="btn s full" id="aDir" style="margin-top:8px">📒 Danh bạ công ty</button>
   <button class="btn s full" id="aShare" style="margin-top:8px">📤 Gửi link cài app cho đồng nghiệp</button>
   <button class="btn s full" id="aUp" style="margin-top:8px">🔄 Kiểm tra bản cập nhật</button><button class="btn r full" id="aOut" style="margin-top:8px">Đăng xuất</button></div>
   <p class="muted c">Chấm công GPS · giao diện ${VERSION}${NATIVE ? ' · ứng dụng ' + esc(NATIVE.versionName) : ''} · máy chủ ${esc(S.data.me.backend)}<br>Mã thiết bị: ${esc(S.device.slice(0, 10))}</p>`;
  $('#aPw').onclick = () => changePw(false);
  $('#aProf').onclick = () => { const m = S.data.me.me;
    modal(`<h3>✏️ Thông tin cá nhân</h3><p class="muted">Mã NV <b>${esc(m.id)}</b> · ${esc(m.dept)}. Họ tên, chức danh, lương do Phòng TCHC cập nhật.</p>
      <div class="row"><div><label>Số điện thoại</label><input id="upP" value="${esc(m.phone || '')}"></div><div><label>Email (nhận phiếu lương)</label><input id="upE" type="email" value="${esc(m.email || '')}"></div></div>
      <label>Ngày sinh</label><input id="upB" type="date" value="${esc(m.birthday || '')}"><label>Địa chỉ</label><input id="upA" value="${esc(m.address || '')}"><label>Người liên hệ khẩn cấp (tên, SĐT)</label><input id="upC" value="${esc(m.emergency || '')}">
      <div id="upMsg"></div><div class="acts"><button class="btn s" data-x="close">Hủy</button><button class="btn" id="upGo">Lưu</button></div>`);
    $('#upGo').onclick = async () => { const x = await call('updateProfile', { profile: { phone: $('#upP').value, email: $('#upE').value, birthday: $('#upB').value, address: $('#upA').value, emergency: $('#upC').value } });
      if (!x.ok) return $('#upMsg').innerHTML = `<div class="st er">${esc(x.error)}</div>`; closeModal(); toast('Đã cập nhật thông tin', 'ok'); loadMe(); }; };
  $('#aQR').onclick = () => { const m = S.data.me.me, link = location.origin + location.pathname.replace(/[^/]*$/, '') + 'rate.html?e=' + encodeURIComponent(m.id);
    modal(`<h3>⭐ Khách hàng đánh giá bạn</h3><p class="muted">Đưa mã QR cho khách hàng quét bằng camera điện thoại để đánh giá thái độ phục vụ. Điểm đánh giá được cộng vào bình xét thi đua tháng.</p>
      <div id="qrBox" style="display:flex;justify-content:center;padding:12px;background:#fff"></div><div class="c b">${esc(m.name)} · ${esc(m.id)}</div><div class="muted c" style="word-break:break-all">${esc(link)}</div>
      <div class="acts"><button class="btn s" data-x="close">Đóng</button><button class="btn" id="qrShare">📤 Gửi link</button></div>`);
    const draw = () => { try { new QRCode($('#qrBox'), { text: link, width: 220, height: 220 }); } catch (e) { $('#qrBox').textContent = 'Không tạo được QR (cần mạng)'; } };
    if (window.QRCode) draw(); else { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; sc.onload = draw; sc.onerror = draw; document.head.appendChild(sc); }
    $('#qrShare').onclick = () => shareText('Mời quý khách đánh giá nhân viên ' + m.name + ': ' + link); };
  $('#aDir').onclick = async () => { const r = await call('directory'); if (!r.ok) return toast(r.error, 'er');
    const draw = q => r.list.filter(x => !q || (x.name + ' ' + x.dept + ' ' + (x.title || '') + ' ' + x.id).toLowerCase().includes(q)).map(x => `<div class="item"><div class="t"><b>${esc(x.name)}</b><span class="muted">${esc(x.id)}</span></div>
      <div class="muted">${esc(x.title || '')}${x.title ? ' · ' : ''}${esc(x.dept)}</div><div>${x.phone ? `📞 <a href="tel:${esc(x.phone)}">${esc(x.phone)}</a> ` : ''}${x.email ? ` ✉️ ${esc(x.email)}` : ''}</div></div>`).join('') || '<p class="muted">Không tìm thấy</p>';
    modal(`<h3>📒 Danh bạ (${r.list.length})</h3><input id="dQ" placeholder="🔍 Tìm tên, bộ phận…"><div id="dL">${draw('')}</div><div class="acts"><button class="btn" data-x="close">Đóng</button></div>`);
    $('#dQ').oninput = e => $('#dL').innerHTML = draw(e.target.value.toLowerCase()); };
  $('#aShare').onclick = () => { const link = location.origin + location.pathname.replace(/[^/]*$/, '') + 'download/', t = 'Cài ứng dụng Chấm công TCL: ' + link;
    if (NATIVE && Native.share) Native.share(t); else if (navigator.share) navigator.share({ text: t }).catch(() => {}); else navigator.clipboard.writeText(t).then(() => toast('Đã chép link: ' + link, 'ok')); };
  if ($('#aRem')) $('#aRem').onchange = e => { LS.set('remOn', e.target.checked); nativeSync(); toast(e.target.checked ? 'Đã bật nhắc giờ ca' : 'Đã tắt nhắc giờ ca'); }; $('#aUp').onclick = () => checkUpdate('manual');
  $('#aOut').onclick = () => confirmBox(queue().length ? 'Còn lượt chấm công chưa đồng bộ, đăng xuất sẽ mất dữ liệu này. Vẫn đăng xuất?' : 'Đăng xuất khỏi ứng dụng?', () => { LS.del('queue'); logout(); });
}

/* ---------------- Khởi động ---------------- */
(async function boot() {
  initSW();
  if (LS.get('justUpdated')) { LS.del('justUpdated'); setTimeout(() => toast('🎉 Đã cập nhật lên phiên bản ' + VERSION, 'ok'), 600); }
  if (!S.token) return viewLogin();
  const cached = LS.get('me'); if (cached) { S.data.me = cached; render(); }
  await loadMe(); startGPS(); syncQueue(); pollNotifs();
})();
