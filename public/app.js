/* VPS Order Hub – Frontend SPA (vanilla JS, không phụ thuộc thư viện ngoài) */
'use strict';
const HP_PORTAL = 'https://partner.hp.com/group/upp-apj/create-purchase-order';
const S = { me: null, meta: null, notif: { unread: 0, items: [] }, ordersCache: null };

// ================= Helpers =================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => v == null ? '' : String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : esc(d); };
const fmtDT = d => d ? `${fmtDate(d)} ${String(d).slice(11, 16)}` : '—';
const fmtNum = n => (Number(n) || 0).toLocaleString('vi-VN');
const fmtMoney = (n, cur = 'USD') => cur === 'VND' ? `${fmtNum(Math.round(n))} ₫` : `$${(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const today = () => S.meta?.today || new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const initials = n => (n || '?').split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase();
const roleIsUnit = () => ['unit_manager', 'unit_staff'].includes(S.me.role);
const canCreate = () => roleIsUnit() || ['planner', 'admin'].includes(S.me.role);
const DOC_TYPES_DEFAULT = {
  email_hp: 'Email xác nhận của Ms. Uyên (HP)',
  quote_deal: 'Báo giá / Deal ID / OPG hãng HP',
  approval_vps: 'Phiếu đề xuất / Phê duyệt nội bộ VPS',
  hp_po: 'Chứng từ PO đặt hàng trên HP Portal',
  hp_so: 'Xác nhận đơn hàng Sales Order (SO) HP',
  invoice_packing: 'Commercial Invoice / Packing List',
  shipping_bl: 'Vận đơn (B/L, AWB) / Tờ khai hải quan',
  co_cq: 'Chứng nhận xuất xứ & chất lượng (CO/CQ)',
  grn_handover: 'Phiếu nhập kho / Biên bản bàn giao',
  other: 'Chứng từ / Tài liệu khác',
};
const docTypes = () => S.meta?.doc_types || DOC_TYPES_DEFAULT;
const docLabel = k => docTypes()[k] || docTypes().other;

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await r.json(); } catch { /* ignore */ }
  const isAuthApi = ['/api/login', '/api/register', '/api/auth/google', '/api/password/forgot', '/api/password/reset'].includes(url);
  if (r.status === 401 && !isAuthApi) { S.me = null; renderLogin(); throw new Error(data?.error || 'Hết phiên'); }
  if (!r.ok) throw new Error(data?.error || `Lỗi ${r.status}`);
  return data;
}
function toast(msg, type = '') {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg;
  $('#toast-root').appendChild(el); setTimeout(() => el.remove(), 4200);
}
const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { return await fn(); } catch (e) { toast(e.message, 'err'); } finally { if (btn) btn.disabled = false; } };

// ================= Icons =================
const I = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;
const ic = {
  dash: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  list: I('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  chart: I('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  users: I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  book: I('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  bell: I('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
  logout: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  key: I('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'),
  clock: I('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  check: I('<path d="M20 6L9 17l-5-5"/>'),
  x: I('<path d="M18 6L6 18M6 6l12 12"/>'),
  truck: I('<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'),
  box: I('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>'),
  alert: I('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>'),
  info: I('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  send: I('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>'),
  edit: I('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  trash: I('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  download: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  clip: I('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'),
  ext: I('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>'),
  search: I('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'),
  cart: I('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'),
  menu: I('<path d="M3 12h18M3 6h18M3 18h18"/>'),
  msg: I('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  print: I('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
  back: I('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  cal: I('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  trend: I('<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>'),
  building: I('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>'),
};

// ================= Modal =================
function modal({ title, body, okText = 'Xác nhận', okClass = 'primary', wide = false, onOpen, onOk, hideCancel = false, noClose = false }) {
  return new Promise(resolve => {
    const root = $('#modal-root');
    const wrap = document.createElement('div'); wrap.className = 'modal-bg';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><div class="modal-h"><h3>${title}</h3><div class="spacer"></div>
      ${noClose ? '' : `<button class="icon-btn" data-x style="width:32px;height:32px">${ic.x}</button>`}</div>
      <form class="modal-b" novalidate>${body}</form>
      <div class="modal-f">${hideCancel ? '' : '<button class="btn" data-x type="button">Hủy</button>'}
      <button class="btn ${okClass}" data-ok type="button">${okText}</button></div></div>`;
    root.appendChild(wrap);
    const close = v => { wrap.remove(); resolve(v); };
    $$('[data-x]', wrap).forEach(b => b.onclick = () => close(null));
    const form = $('form', wrap);
    form.onsubmit = e => { e.preventDefault(); $('[data-ok]', wrap).click(); };
    $('[data-ok]', wrap).onclick = async () => {
      const data = Object.fromEntries(new FormData(form));
      if (!onOk) return close(data);
      const btn = $('[data-ok]', wrap); btn.disabled = true;
      try { const r = await onOk(data, wrap); if (r !== false) close(r ?? data); }
      catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; }
    };
    if (onOpen) onOpen(wrap);
    const first = $('input:not([type=hidden]),textarea,select', wrap); if (first) setTimeout(() => first.focus(), 50);
  });
}
const confirmBox = (title, text, okText = 'Đồng ý', okClass = 'primary') => modal({ title, body: `<p style="margin:0;line-height:1.6">${text}</p>`, okText, okClass });

// ================= Status visuals =================
const stBadge = (s, label) => `<span class="badge st-${s}">${esc(label || S.meta?.statuses[s] || s)}</span>`;
const priBadge = p => p === 'urgent' ? '<span class="badge pri-urgent plain">Khẩn</span>' : p === 'high' ? '<span class="badge pri-high plain">Ưu tiên</span>' : '';
const catTag = c => c === 'machine' ? '<span class="tag blue">Máy · TQ</span>' : '<span class="tag orange">Linh kiện · SG</span>';
function progressCell(o) {
  if (['ordered', 'confirmed', 'shipping'].includes(o.status)) {
    const cls = o.overdue ? 'bad' : o.due_soon ? 'warn' : '';
    const txt = o.overdue ? `<span style="color:var(--danger);font-weight:600">Trễ ${Math.abs(o.days_left)} ngày</span>` : `Còn ${o.days_left} ngày`;
    return `<div class="prog ${cls}"><i style="width:${o.progress}%"></i></div><div class="small muted" style="margin-top:4px">${txt}</div>`;
  }
  if (o.status === 'received') return `<div class="prog ok"><i style="width:100%"></i></div><div class="small" style="margin-top:4px;color:${o.on_time === false ? 'var(--danger)' : 'var(--success)'}">${o.on_time === false ? 'Về trễ' : 'Đúng hạn'}${o.actual_weeks ? ` · ${o.actual_weeks} tuần` : ''}</div>`;
  if (o.status === 'pending') return `<span class="small muted">Chờ duyệt ${o.waiting_days ?? 0} ngày</span>`;
  if (o.status === 'approved') return '<span class="small" style="color:var(--purple)">Cần đặt trên HP</span>';
  return '<span class="small muted">—</span>';
}

// ================= Shell / Layout =================
function navItems() {
  const items = [
    { h: '#/dashboard', t: 'Tổng quan', i: ic.dash },
    { h: '#/orders', t: S.me.view_all ? 'Đơn hàng toàn tập đoàn' : 'Đơn hàng của đơn vị', i: ic.list },
  ];
  if (canCreate()) items.push({ h: '#/orders/new', t: 'Tạo đơn đặt hàng', i: ic.plus });
  items.push({ h: '#/tracking', t: 'Theo dõi tiến độ', i: ic.truck });
  items.push({ h: '#/forecasts', t: 'Dự báo nhu cầu', i: ic.trend });
  const sec2 = [{ h: '#/guide', t: 'Quy trình & hướng dẫn', i: ic.book }];
  const admin = S.me.role === 'admin' ? [{ h: '#/admin/users', t: 'Người dùng & phân quyền', i: ic.users }, { h: '#/admin/settings', t: 'Đơn vị & Lead time', i: ic.gear }] : [];
  return { items, sec2, admin };
}
function shell(title, crumb, content) {
  const { items, sec2, admin } = navItems();
  const cur = location.hash.split('?')[0] || '#/dashboard';
  const link = x => `<a href="${x.h}" class="${cur === x.h ? 'active' : ''}">${x.i}<span>${x.t}</span></a>`;
  $('#app').innerHTML = `<div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-logo">VPS</div><div><div class="brand-name">VPS Order Hub</div><div class="brand-sub">Hệ thống đặt hàng HP</div></div></div>
      <nav class="nav">${items.map(link).join('')}
        <div class="nav-title">Tài liệu</div>${sec2.map(link).join('')}
        ${admin.length ? `<div class="nav-title">Quản trị</div>${admin.map(link).join('')}` : ''}
        <div class="nav-title">Liên kết</div>
        <a href="${HP_PORTAL}" target="_blank" rel="noopener">${ic.ext}<span>HP Partner Portal</span></a>
      </nav>
      <div class="side-foot">Đăng nhập: <b>${esc(S.me.full_name)}</b><br>${esc(S.me.role_label)}${S.me.unit_code ? ` · ${esc(S.me.unit_code)}` : ''}</div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-toggle" id="menuBtn">${ic.menu}</button>
        <div><div class="crumb">${crumb || 'VPS Order Hub'}</div><div class="page-title">${title}</div></div>
        <div class="spacer"></div>
        ${S.me.view_all ? `<span class="scope-chip">${ic.building.replace('<svg', '<svg width="14" height="14"')} Phạm vi: Toàn tập đoàn</span>`
          : `<span class="scope-chip unit">${ic.building.replace('<svg', '<svg width="14" height="14"')} Phạm vi: ${esc(S.me.unit_name || '')}</span>`}
        <div style="position:relative"><button class="icon-btn" id="bellBtn" title="Thông báo">${ic.bell}${S.notif.unread ? `<span class="dot">${S.notif.unread > 99 ? '99+' : S.notif.unread}</span>` : ''}</button></div>
        <div class="user-box" id="userBox"><div class="avatar">${esc(initials(S.me.full_name))}</div>
          <div class="u-meta"><div class="u-name">${esc(S.me.full_name)}</div><div class="u-role">${esc(S.me.role_label)}</div></div></div>
      </header>
      <main class="content" id="content">${content}</main>
    </div></div>`;
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#userBox').onclick = e => toggleDrop(e, $('#userBox'), `<a href="#/profile">${ic.key} Đổi mật khẩu</a><button id="logoutBtn">${ic.logout} Đăng xuất</button>`, d => {
    $('#logoutBtn', d).onclick = async () => { await api('POST', '/api/logout'); S.me = null; location.hash = ''; renderLogin(); };
  });
  $('#bellBtn').onclick = e => openNotif(e);
}
function toggleDrop(e, anchor, html, bind, cls = '') {
  e.stopPropagation();
  const old = $('.dropdown'); if (old) { const same = old.parentElement === anchor || old.parentElement === anchor.parentElement; old.remove(); if (same) return; }
  const d = document.createElement('div'); d.className = `dropdown ${cls}`; d.innerHTML = html; d.onclick = ev => ev.stopPropagation();
  (anchor.parentElement.style.position === 'relative' ? anchor.parentElement : anchor).appendChild(d);
  if (bind) bind(d);
}
document.addEventListener('click', () => { const d = $('.dropdown'); if (d) d.remove(); });

async function loadNotif() {
  try { S.notif = await api('GET', '/api/notifications'); } catch { return; }
  const b = $('#bellBtn'); if (!b) return;
  const dot = $('.dot', b); if (dot) dot.remove();
  if (S.notif.unread) b.insertAdjacentHTML('beforeend', `<span class="dot">${S.notif.unread > 99 ? '99+' : S.notif.unread}</span>`);
}
async function openNotif(e) {
  await loadNotif();
  const items = S.notif.items;
  toggleDrop(e, $('#bellBtn'), `<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center"><b>Thông báo</b><div class="spacer"></div>
    <button class="btn ghost sm" id="readAll" style="width:auto">Đánh dấu đã đọc</button></div>
    ${items.length ? items.map(n => `<div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-o="${n.order_id || ''}">${esc(n.message)}<div class="t">${fmtDT(n.created_at)}</div></div>`).join('')
      : '<div class="empty">Chưa có thông báo</div>'}`, d => {
    $('#readAll', d).onclick = async () => { await api('POST', '/api/notifications/read', {}); d.remove(); loadNotif(); };
    $$('.notif-item', d).forEach(el => el.onclick = async () => {
      await api('POST', '/api/notifications/read', { id: el.dataset.id }); d.remove(); loadNotif();
      location.hash = el.dataset.o ? `#/orders/${el.dataset.o}` : '#/forecasts';
    });
  }, 'notif-panel');
}

// ================= Login / Register / Google / Forgot Password =================
const GOOGLE_SVG = `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>`;

let publicUnitsCache = null;
async function getPublicUnits() {
  if (!publicUnitsCache) {
    try { publicUnitsCache = await api('GET', '/api/public/units'); } catch { publicUnitsCache = []; }
  }
  return publicUnitsCache;
}

async function renderLogin(mode = 'login') {
  const units = await getPublicUnits();
  const unitOptions = units.map(u => `<option value="${u.id}">${esc(u.code)} – ${esc(u.name)}</option>`).join('');

  let formBody = '';
  if (mode === 'login') {
    formBody = `
      <form class="login-box" id="loginForm">
        <h2>Đăng nhập</h2>
        <p class="muted" style="margin:0 0 22px">Sử dụng Tên đăng nhập, Email hoặc Số điện thoại của bạn.</p>
        <div style="margin-bottom:14px">
          <label class="f">Tài khoản (Tên đăng nhập / Email / SĐT)</label>
          <input class="i" name="username" autocomplete="username" placeholder="VD: phuong.kh, email@vpsgroup.vn hoặc SĐT" required autofocus>
        </div>
        <div style="margin-bottom:18px">
          <div class="row" style="margin-bottom:6px">
            <label class="f" style="margin:0">Mật khẩu</label>
            <div class="spacer"></div>
            <a href="#" id="goForgot" class="small" style="font-weight:600">Quên mật khẩu?</a>
          </div>
          <input class="i" name="password" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu" required>
        </div>
        <button class="btn primary lg" style="width:100%" type="submit">Đăng nhập</button>
        <div class="or-sep">hoặc</div>
        <button type="button" class="btn google" id="btnGoogle">${GOOGLE_SVG}<span>Đăng nhập bằng Google</span></button>
        <div id="loginErr" class="alert danger hidden" style="margin-top:16px"></div>
        <div style="text-align:center;margin-top:22px;font-size:13px">
          Chưa có tài khoản? <a href="#" id="goRegister" style="font-weight:650">Đăng ký tài khoản mới</a>
        </div>
      </form>`;
  } else if (mode === 'register') {
    formBody = `
      <form class="login-box" id="regForm">
        <h2>Đăng ký tài khoản</h2>
        <p class="muted" style="margin:0 0 18px">Tạo tài khoản đặt hàng cho đơn vị thành viên thuộc Tập đoàn VPS.</p>
        <div class="grid g2" style="gap:12px;margin-bottom:12px">
          <div class="span-all">
            <label class="f">Họ và tên <span class="req">*</span></label>
            <input class="i" name="full_name" placeholder="VD: Nguyễn Văn A" required autofocus>
          </div>
          <div>
            <label class="f">Tên đăng nhập <span class="req">*</span></label>
            <input class="i mono" name="username" placeholder="VD: anv.thh" required>
          </div>
          <div>
            <label class="f">Số điện thoại <span class="req">*</span></label>
            <input class="i" name="phone" type="tel" placeholder="VD: 0903123456" required>
          </div>
          <div class="span-all">
            <label class="f">Email công việc <span class="req">*</span></label>
            <input class="i" name="email" type="email" placeholder="VD: anv@vpsgroup.vn" required>
          </div>
          <div class="span-all">
            <label class="f">Đơn vị công tác <span class="req">*</span></label>
            <select class="i" name="unit_id" required>
              <option value="">— Chọn đơn vị thành viên —</option>
              ${unitOptions}
            </select>
          </div>
          <div>
            <label class="f">Mật khẩu <span class="req">*</span></label>
            <input class="i" name="password" type="password" placeholder="Tối thiểu 8 ký tự" required>
          </div>
          <div>
            <label class="f">Nhập lại mật khẩu <span class="req">*</span></label>
            <input class="i" name="confirm_password" type="password" placeholder="Nhập lại mật khẩu" required>
          </div>
        </div>
        <button class="btn primary lg" style="width:100%;margin-top:6px" type="submit">Đăng ký &amp; Đăng nhập</button>
        <div class="or-sep">hoặc</div>
        <button type="button" class="btn google" id="btnGoogle">${GOOGLE_SVG}<span>Đăng ký nhanh bằng Google</span></button>
        <div id="loginErr" class="alert danger hidden" style="margin-top:16px"></div>
        <div style="text-align:center;margin-top:18px;font-size:13px">
          Đã có tài khoản? <a href="#" id="goLogin" style="font-weight:650">Quay lại Đăng nhập</a>
        </div>
      </form>`;
  } else if (mode === 'forgot') {
    formBody = `
      <div class="login-box">
        <h2>Khôi phục mật khẩu</h2>
        <p class="muted" style="margin:0 0 18px">Lấy lại mật khẩu qua Email hoặc Số điện thoại đã đăng ký.</p>
        <div class="auth-tabs" id="fpTabs">
          <button type="button" data-m="email" class="on">Qua Email</button>
          <button type="button" data-m="phone">Qua Số điện thoại</button>
        </div>
        <form id="fpStep1">
          <input type="hidden" name="method" value="email">
          <div style="margin-bottom:16px">
            <label class="f" id="fpLabel">Địa chỉ Email đã đăng ký <span class="req">*</span></label>
            <input class="i" name="contact" id="fpInput" type="email" placeholder="Nhập email (VD: phuong.kh@vpsgroup.vn)" required autofocus>
          </div>
          <button class="btn primary lg" style="width:100%" type="submit">Nhận mã xác thực (OTP)</button>
        </form>
        <form id="fpStep2" class="hidden" style="margin-top:14px">
          <div id="otpNotice" class="alert success" style="margin-bottom:14px"></div>
          <div style="margin-bottom:12px">
            <label class="f">Mã xác thực OTP (6 chữ số) <span class="req">*</span></label>
            <input class="i mono" name="otp" maxlength="6" placeholder="Nhập 6 chữ số OTP" required>
          </div>
          <div style="margin-bottom:12px">
            <label class="f">Mật khẩu mới <span class="req">*</span></label>
            <input class="i" name="new_password" type="password" placeholder="Tối thiểu 8 ký tự (gồm chữ & số)" required>
          </div>
          <div style="margin-bottom:16px">
            <label class="f">Nhập lại mật khẩu mới <span class="req">*</span></label>
            <input class="i" name="confirm_password" type="password" placeholder="Nhập lại mật khẩu mới" required>
          </div>
          <button class="btn primary lg" style="width:100%" type="submit">Đặt lại mật khẩu &amp; Đăng nhập</button>
        </form>
        <div id="loginErr" class="alert danger hidden" style="margin-top:16px"></div>
        <div style="text-align:center;margin-top:20px;font-size:13px">
          <a href="#" id="goLogin" style="font-weight:650">← Quay lại màn hình Đăng nhập</a>
        </div>
      </div>`;
  }

  $('#app').innerHTML = `<div class="login-wrap">
    <div class="login-hero">
      <div class="row"><div class="brand-logo">VPS</div><div><div class="brand-name">VPS Order Hub</div><div class="brand-sub" style="color:#9fb0dc">Tập đoàn VPS</div></div></div>
      <div>
        <h1>Hệ thống đặt hàng &amp;<br>theo dõi tiến độ đơn hàng HP</h1>
        <p>Chuẩn hóa quy trình phê duyệt trước khi lên hệ thống hãng, kiểm soát thời gian giao hàng (Lead Time) và minh bạch tiến độ cho Tập đoàn VPS &amp; 5 đơn vị thành viên.</p>
        <div class="hero-steps">
          <div class="hero-step"><div class="n">1</div><div><b>Đơn vị tạo yêu cầu đặt hàng</b><div class="d">Tân Hồng Hà · Việt · Xesco · VPSM · ITSS lập đơn đầy đủ SKU, số lượng, dự báo.</div></div></div>
          <div class="hero-step"><div class="n">2</div><div><b>Rà soát với Ms. Uyên (HP) &amp; Duyệt bởi Ms. Phượng (VPS)</b><div class="d">Chỉ đơn đã duyệt mới được tạo PO chính thức trên HP Partner Portal.</div></div></div>
          <div class="hero-step"><div class="n">3</div><div><b>Theo dõi tiến độ đến khi hàng về kho</b><div class="d">Tự tính ETA theo Lead Time · cảnh báo trễ hạn.</div></div></div>
        </div>
      </div>
      <div class="small" style="color:#7f8fbf">© ${new Date().getFullYear()} Tập đoàn VPS · Phòng Kế hoạch</div>
    </div>
    <div class="login-form">${formBody}</div></div>`;

  const showErr = msg => { const el = $('#loginErr'); if (el) { el.textContent = msg; el.classList.remove('hidden'); } };
  const hideErr = () => { const el = $('#loginErr'); if (el) el.classList.add('hidden'); };

  if ($('#goRegister')) $('#goRegister').onclick = e => { e.preventDefault(); renderLogin('register'); };
  if ($('#goForgot')) $('#goForgot').onclick = e => { e.preventDefault(); renderLogin('forgot'); };
  if ($('#goLogin')) $('#goLogin').onclick = e => { e.preventDefault(); renderLogin('login'); };

  if ($('#btnGoogle')) {
    $('#btnGoogle').onclick = () => openGoogleSignInModal(units);
  }

  if (mode === 'login') {
    $('#loginForm').onsubmit = async e => {
      e.preventDefault(); hideErr();
      const btn = $('button[type=submit]', e.target); btn.disabled = true;
      try {
        await api('POST', '/api/login', Object.fromEntries(new FormData(e.target)));
        await boot();
      } catch (err) { showErr(err.message); }
      finally { btn.disabled = false; }
    };
  } else if (mode === 'register') {
    $('#regForm').onsubmit = async e => {
      e.preventDefault(); hideErr();
      const d = Object.fromEntries(new FormData(e.target));
      if (d.password !== d.confirm_password) return showErr('Mật khẩu nhập lại không khớp');
      const btn = $('button[type=submit]', e.target); btn.disabled = true;
      try {
        await api('POST', '/api/register', d);
        toast('Đăng ký tài khoản thành công!', 'ok');
        await boot();
      } catch (err) { showErr(err.message); }
      finally { btn.disabled = false; }
    };
  } else if (mode === 'forgot') {
    let savedMethod = 'email';
    let savedContact = '';
    $$('#fpTabs button').forEach(b => b.onclick = () => {
      hideErr();
      $$('#fpTabs button').forEach(x => x.classList.toggle('on', x === b));
      savedMethod = b.dataset.m;
      $('[name=method]', $('#fpStep1')).value = savedMethod;
      const inp = $('#fpInput');
      if (savedMethod === 'email') {
        $('#fpLabel').innerHTML = 'Địa chỉ Email đã đăng ký <span class="req">*</span>';
        inp.type = 'email';
        inp.placeholder = 'Nhập email (VD: phuong.kh@vpsgroup.vn)';
      } else {
        $('#fpLabel').innerHTML = 'Số điện thoại đã đăng ký <span class="req">*</span>';
        inp.type = 'tel';
        inp.placeholder = 'Nhập số điện thoại (VD: 0901000004)';
      }
      inp.value = '';
      inp.focus();
    });

    $('#fpStep1').onsubmit = async e => {
      e.preventDefault(); hideErr();
      const fd = Object.fromEntries(new FormData(e.target));
      savedMethod = fd.method;
      savedContact = fd.contact.trim();
      const btn = $('button[type=submit]', e.target); btn.disabled = true;
      try {
        const res = await api('POST', '/api/password/forgot', { method: savedMethod, contact: savedContact });
        $('#fpStep1').classList.add('hidden');
        $('#fpTabs').classList.add('hidden');
        const step2 = $('#fpStep2');
        step2.classList.remove('hidden');
        $('#otpNotice').innerHTML = `${ic.check}<div>Đã gửi mã OTP khôi phục cho tài khoản <b>${esc(res.username)}</b> tới <b>${esc(res.masked)}</b>.<br><span class="small">Mã xác thực OTP của bạn là: <b class="mono" style="font-size:14px">${esc(res.demo_otp)}</b> (hiệu lực ${res.expires_in_minutes} phút).</span></div>`;
        $('[name=otp]', step2).value = res.demo_otp || '';
        $('[name=new_password]', step2).focus();
      } catch (err) { showErr(err.message); }
      finally { btn.disabled = false; }
    };

    $('#fpStep2').onsubmit = async e => {
      e.preventDefault(); hideErr();
      const fd = Object.fromEntries(new FormData(e.target));
      if (fd.new_password !== fd.confirm_password) return showErr('Mật khẩu mới nhập lại không khớp');
      const btn = $('button[type=submit]', e.target); btn.disabled = true;
      try {
        await api('POST', '/api/password/reset', {
          method: savedMethod,
          contact: savedContact,
          otp: fd.otp,
          new_password: fd.new_password,
        });
        toast('Đã đặt lại mật khẩu thành công!', 'ok');
        await boot();
      } catch (err) { showErr(err.message); }
      finally { btn.disabled = false; }
    };
  }
}

function openGoogleSignInModal(units) {
  const unitOptions = units.map(u => `<option value="${u.id}">${esc(u.code)} – ${esc(u.name)}</option>`).join('');
  modal({
    title: 'Đăng nhập bằng Google',
    okText: 'Tiếp tục với Google',
    body: `
      <div class="row" style="gap:10px;padding:10px 14px;background:#f8fafc;border:1px solid var(--border);border-radius:10px;margin-bottom:14px">
        ${GOOGLE_SVG}
        <div class="small">Nhập tài khoản Google công việc của bạn. Nếu email đã có trên hệ thống, bạn sẽ được đăng nhập ngay.</div>
      </div>
      <div class="grid" style="gap:12px">
        <div>
          <label class="f">Email Google <span class="req">*</span></label>
          <input class="i" name="email" type="email" placeholder="VD: ten.ban@gmail.com hoặc @vpsgroup.vn" required>
        </div>
        <div id="gExtraWrap" class="hidden grid" style="gap:12px">
          <div class="alert info">${ic.info}<div>Đây là lần đầu bạn đăng nhập bằng email Google này. Vui lòng nhập Họ tên và chọn Đơn vị công tác để hoàn tất.</div></div>
          <div>
            <label class="f">Họ và tên <span class="req">*</span></label>
            <input class="i" name="full_name" placeholder="Nhập họ và tên của bạn">
          </div>
          <div>
            <label class="f">Đơn vị công tác <span class="req">*</span></label>
            <select class="i" name="unit_id">
              <option value="">— Chọn đơn vị thành viên —</option>
              ${unitOptions}
            </select>
          </div>
        </div>
      </div>`,
    onOk: async (d, wrap) => {
      const r = await api('POST', '/api/auth/google', d);
      if (r && r.need_unit) {
        $('#gExtraWrap', wrap).classList.remove('hidden');
        const fnInput = $('[name=full_name]', wrap);
        if (!fnInput.value) fnInput.value = r.full_name || '';
        fnInput.focus();
        return false; // Giữ modal mở để người dùng chọn đơn vị
      }
      toast('Đã đăng nhập bằng Google', 'ok');
      await boot();
    },
  });
}

// ================= Dashboard =================
async function viewDashboard(params) {
  const unit = params.get('unit') || '';
  shell('Tổng quan', S.me.view_all ? 'Bảng điều khiển toàn tập đoàn' : `Bảng điều khiển · ${esc(S.me.unit_name)}`, '<div class="empty">Đang tải…</div>');
  const d = await api('GET', `/api/dashboard${unit ? `?unit=${unit}` : ''}`);
  const k = d.kpi;
  const kpi = (icon, cls, v, l, s, href) => `<div class="card kpi" onclick="location.hash='${href}'"><div class="kpi-ic ${cls}">${icon}</div><div><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div></div>`;
  const maxM = Math.max(1, ...d.months.flatMap(m => [m.created, m.received]));
  const totalStatus = Math.max(1, ...d.statusCounts.map(s => s.count));
  const stColor = { draft: '#98a2b3', pending: '#f59e0b', returned: '#f97316', approved: '#7c3aed', ordered: '#0b5cff', confirmed: '#0ea5e9', shipping: '#0369a1', received: '#12a150', rejected: '#e5383b', cancelled: '#e5383b' };
  const miniList = (rows, empty, kind) => rows.length ? `<table class="t"><tbody>${rows.map(o => `<tr class="click" onclick="location.hash='#/orders/${o.id}'">
      <td><div style="font-weight:600">${esc(o.code)}</div><div class="small muted">${esc(o.title || '')}</div></td>
      <td><span class="tag">${esc(o.unit_code)}</span></td>
      <td class="right nowrap">${kind === 'overdue' ? `<span style="color:var(--danger);font-weight:600">Trễ ${Math.abs(o.days_left)} ngày</span><div class="small muted">ETA ${fmtDate(o.target_date)}</div>`
        : kind === 'up' ? `<b>${o.days_left} ngày</b><div class="small muted">ETA ${fmtDate(o.target_date)}</div>`
        : `${stBadge(o.status, o.status_label)}${o.waiting_days != null ? `<div class="small muted">${o.waiting_days} ngày</div>` : ''}`}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty small">${empty}</div>`;

  $('#content').innerHTML = `
    <div class="row wrap" style="margin-bottom:18px">
      <div><h2 style="font-size:20px">Xin chào, ${esc(S.me.full_name)} 👋</h2><div class="muted" style="margin-top:4px">Hôm nay ${fmtDate(today())} · ${S.me.view_all ? 'Bạn đang xem dữ liệu của toàn bộ đơn vị thành viên' : `Dữ liệu của ${esc(S.me.unit_name)}`}</div></div>
      <div class="spacer"></div>
      ${S.me.view_all ? `<select class="i" id="unitSel" style="width:240px"><option value="">Tất cả đơn vị</option>${S.meta.units.map(u => `<option value="${u.id}" ${String(u.id) === unit ? 'selected' : ''}>${esc(u.code)} – ${esc(u.name)}</option>`).join('')}</select>` : ''}
      ${canCreate() ? `<a class="btn primary" href="#/orders/new">${ic.plus} Tạo đơn đặt hàng</a>` : ''}
    </div>
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi(ic.clock, 'c-orange', k.waiting_approval, 'Chờ Kế hoạch duyệt', k.returned ? `<span style="color:#c2410c">${k.returned} đơn cần bổ sung</span>` : '<span class="muted">Không có đơn cần bổ sung</span>', '#/orders?tab=pending')}
      ${kpi(ic.check, 'c-purple', k.approved_not_placed, 'Đã duyệt – chờ đặt HP', '<span class="muted">Cần tạo PO trên HP Portal</span>', '#/orders?tab=approved')}
      ${kpi(ic.truck, 'c-blue', k.in_progress, 'Đang về hàng', `<span class="muted">${k.due_soon} đơn sắp về trong 14 ngày</span>`, '#/tracking')}
      ${kpi(ic.alert, 'c-red', k.overdue, 'Quá hạn ETA', k.at_risk ? `<span style="color:var(--danger)">${k.at_risk} đơn có nguy cơ trễ ngày KH cần</span>` : '<span class="muted">Không có đơn rủi ro</span>', '#/orders?tab=overdue')}
      ${kpi(ic.box, 'c-green', k.received_month, 'Về kho trong tháng', `<span class="muted">Tổng ${k.total} đơn đã gửi</span>`, '#/orders?tab=received')}
      ${kpi(ic.trend, 'c-cyan', k.on_time_rate == null ? '—' : k.on_time_rate + '%', 'Tỷ lệ về đúng hạn', `<span class="muted">Lead time TB thực tế: ${k.avg_weeks ?? '—'} tuần</span>`, '#/orders?tab=received')}
      ${kpi(ic.cart, 'c-blue', fmtMoney(k.value_open), 'Giá trị đơn đang mở (USD)', '<span class="muted">Chờ duyệt → đang về hàng</span>', '#/orders?tab=active')}
      ${kpi(ic.cal, 'c-purple', S.meta.lead_times.map(l => l.min_weeks).sort((a, b) => a - b)[0] + '–' + S.meta.lead_times.map(l => l.max_weeks).sort((a, b) => b - a)[0], 'Tuần lead time chuẩn', '<span class="muted">Xem chi tiết tại Quy trình</span>', '#/guide')}
    </div>
    <div class="grid g3" style="margin-bottom:16px">
      <div class="card span2"><div class="card-h"><h3>Số đơn theo tháng</h3><div class="spacer"></div><div class="legend"><span><i style="background:#0b5cff"></i>Đơn gửi</span><span><i style="background:#12a150"></i>Về kho</span></div></div>
        <div class="card-b"><div class="bars">${d.months.map(m => `<div class="col"><div class="stack">
          <div class="bar" style="height:${m.created / maxM * 100}%;background:#0b5cff"><span>${m.created || ''}</span></div>
          <div class="bar" style="height:${m.received / maxM * 100}%;background:#12a150"><span>${m.received || ''}</span></div></div>
          <div class="m">T${m.month.slice(5)}/${m.month.slice(2, 4)}</div></div>`).join('')}</div></div></div>
      <div class="card"><div class="card-h"><h3>Phân bổ trạng thái</h3></div><div class="card-b">
        ${d.statusCounts.filter(s => s.count || !['rejected', 'cancelled'].includes(s.key)).map(s => `<div class="hbar" style="grid-template-columns:150px 1fr 30px"><span class="small">${esc(s.label)}</span>
          <div class="track"><i style="width:${s.count / totalStatus * 100}%;background:${stColor[s.key]}"></i></div><b class="right small">${s.count}</b></div>`).join('')}
      </div></div>
    </div>
    ${d.perUnit ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Tình hình theo đơn vị thành viên</h3><div class="spacer"></div><span class="small muted">Chỉ hiển thị với Kế hoạch / TGĐ / CEO</span></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Đơn vị</th><th class="right">Tổng đơn</th><th class="right">Chờ duyệt / đặt</th><th class="right">Đang về</th><th class="right">Quá hạn</th><th class="right">Đã về kho</th><th class="right">Đúng hạn</th><th class="right">Giá trị (USD)</th></tr></thead>
      <tbody>${d.perUnit.map(u => `<tr class="click" onclick="location.hash='#/orders?unit=${u.unit_id}'"><td><b>${esc(u.code)}</b> <span class="muted">${esc(u.name)}</span></td>
        <td class="right">${u.total}</td><td class="right">${u.pending}</td><td class="right">${u.active}</td>
        <td class="right">${u.overdue ? `<span class="tag red">${u.overdue}</span>` : '0'}</td><td class="right">${u.received}</td>
        <td class="right">${u.on_time_rate == null ? '—' : u.on_time_rate + '%'}</td><td class="right">${fmtMoney(u.value)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="grid g3">
      <div class="card"><div class="card-h"><span style="color:var(--danger);display:flex">${ic.alert.replace('<svg', '<svg width="18"')}</span><h3>Đơn quá hạn ETA</h3></div><div class="card-b p0">${miniList(d.overdueList, 'Không có đơn quá hạn 🎉', 'overdue')}</div></div>
      <div class="card"><div class="card-h"><span style="color:var(--primary);display:flex">${ic.truck.replace('<svg', '<svg width="18"')}</span><h3>Sắp về hàng</h3></div><div class="card-b p0">${miniList(d.upcoming, 'Chưa có đơn đang về', 'up')}</div></div>
      <div class="card"><div class="card-h"><span style="color:#d97706;display:flex">${ic.clock.replace('<svg', '<svg width="18"')}</span><h3>Cần xử lý</h3></div><div class="card-b p0">${miniList(d.waitingList, 'Không có đơn cần xử lý', 'wait')}</div></div>
    </div>`;
  const us = $('#unitSel'); if (us) us.onchange = () => location.hash = `#/dashboard${us.value ? `?unit=${us.value}` : ''}`;
}

// ================= Orders list =================
const TABS = [
  { k: 'all', t: 'Tất cả', f: o => o.status !== 'draft' || o.created_by === S.me.id || roleIsUnit() },
  { k: 'pending', t: 'Chờ duyệt', f: o => ['pending', 'returned'].includes(o.status) },
  { k: 'approved', t: 'Chờ đặt HP', f: o => o.status === 'approved' },
  { k: 'active', t: 'Đang về hàng', f: o => ['ordered', 'confirmed', 'shipping'].includes(o.status) },
  { k: 'overdue', t: 'Quá hạn', f: o => o.overdue },
  { k: 'received', t: 'Đã về kho', f: o => o.status === 'received' },
  { k: 'draft', t: 'Nháp', f: o => o.status === 'draft' },
  { k: 'closed', t: 'Hủy / Từ chối', f: o => ['cancelled', 'rejected'].includes(o.status) },
];
async function viewOrders(params) {
  const st = { tab: params.get('tab') || 'all', q: params.get('q') || '', unit: params.get('unit') || '', category: params.get('category') || '', from: params.get('from') || '', to: params.get('to') || '' };
  shell(S.me.view_all ? 'Đơn hàng toàn tập đoàn' : 'Đơn hàng của đơn vị', 'Quản lý đơn hàng', `
    <div class="card">
      <div class="filters">
        <div class="search">${ic.search}<input class="i" id="fq" placeholder="Tìm mã đơn, tiêu đề, dự án, PO/SO HP, SKU…" value="${esc(st.q)}"></div>
        ${S.me.view_all ? `<select class="i" id="funit"><option value="">Tất cả đơn vị</option>${S.meta.units.map(u => `<option value="${u.id}" ${String(u.id) === st.unit ? 'selected' : ''}>${esc(u.code)} – ${esc(u.name)}</option>`).join('')}</select>` : ''}
        <select class="i" id="fcat"><option value="">Mọi loại hàng</option><option value="machine" ${st.category === 'machine' ? 'selected' : ''}>Máy (TQ)</option><option value="supplies" ${st.category === 'supplies' ? 'selected' : ''}>Linh kiện (SG)</option></select>
        <input class="i" type="date" id="ffrom" value="${esc(st.from)}" title="Tạo từ ngày" style="min-width:140px">
        <input class="i" type="date" id="fto" value="${esc(st.to)}" title="Đến ngày" style="min-width:140px">
        <button class="btn sm" id="fexp">${ic.download} Xuất Excel</button>
        ${canCreate() ? `<a class="btn primary sm" href="#/orders/new">${ic.plus} Tạo đơn</a>` : ''}
      </div>
      <div class="tabs" id="tabs"></div>
      <div class="tbl-wrap" id="tbl"><div class="empty">Đang tải…</div></div>
    </div>`);
  const qs = () => new URLSearchParams(Object.entries({ q: st.q, unit: st.unit, category: st.category, from: st.from, to: st.to }).filter(([, v]) => v)).toString();
  let rows = [];
  const draw = () => {
    $('#tabs').innerHTML = TABS.map(t => `<button data-k="${t.k}" class="${st.tab === t.k ? 'on' : ''}">${t.t}<span class="n">${rows.filter(t.f).length}</span></button>`).join('');
    $$('#tabs button').forEach(b => b.onclick = () => { st.tab = b.dataset.k; history.replaceState(null, '', `#/orders?${qs()}&tab=${st.tab}`); draw(); });
    const list = rows.filter(TABS.find(t => t.k === st.tab).f);
    $('#tbl').innerHTML = list.length ? `<table class="t"><thead><tr><th>Mã đơn / Nội dung</th>${S.me.view_all ? '<th>Đơn vị</th>' : ''}<th>Loại</th><th class="right">SL</th><th class="right">Giá trị</th>
      <th>Trạng thái</th><th>PO HP</th><th>Ngày đặt HP</th><th>ETA dự kiến</th><th style="min-width:140px">Tiến độ</th><th>Người tạo</th></tr></thead><tbody>
      ${list.map(o => `<tr class="click" data-id="${o.id}">
        <td><div class="row" style="gap:6px"><b>${esc(o.code)}</b>${priBadge(o.priority)}${o.at_risk ? '<span class="tag red" title="ETA muộn hơn ngày khách hàng cần">Rủi ro trễ</span>' : ''}${o.doc_count ? `<span class="tag blue" title="${o.doc_count} chứng từ đã lưu">📎 ${o.doc_count}</span>` : ''}</div>
          <div class="small muted" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.title || o.project || '—')}</div></td>
        ${S.me.view_all ? `<td><span class="tag">${esc(o.unit_code)}</span></td>` : ''}
        <td>${catTag(o.category)}<div class="small muted" style="margin-top:3px">${o.forecast ? 'Có dự báo' : 'Không dự báo'}</div></td>
        <td class="right">${fmtNum(o.total_qty)}</td><td class="right nowrap">${fmtMoney(o.total, o.currency)}</td>
        <td>${stBadge(o.status, o.status_label)}</td>
        <td class="mono small">${esc(o.hp_po || '—')}</td><td class="nowrap">${fmtDate(o.hp_order_date)}</td>
        <td class="nowrap">${o.target_date ? `${fmtDate(o.target_date)}${o.hp_eta ? ' <span class="tag green" title="ETA hãng xác nhận">HP</span>' : ''}` : o.proj_eta_max ? `<span class="muted small">~${fmtDate(o.proj_eta_max)}</span>` : '—'}</td>
        <td>${progressCell(o)}</td>
        <td class="small">${esc(o.creator_name)}<div class="muted">${fmtDate(o.created_at)}</div></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">${ic.box}<div>Không có đơn hàng phù hợp</div></div>`;
    $$('#tbl tr[data-id]').forEach(tr => tr.onclick = () => location.hash = `#/orders/${tr.dataset.id}`);
  };
  const load = async () => { rows = await api('GET', `/api/orders?${qs()}`); draw(); };
  let tmr;
  $('#fq').oninput = e => { clearTimeout(tmr); tmr = setTimeout(() => { st.q = e.target.value.trim(); load(); }, 300); };
  const bindSel = (id, key) => { const el = $(id); if (el) el.onchange = () => { st[key] = el.value; load(); }; };
  bindSel('#funit', 'unit'); bindSel('#fcat', 'category'); bindSel('#ffrom', 'from'); bindSel('#fto', 'to');
  $('#fexp').onclick = () => { window.location.href = `/api/orders/export?${qs()}`; };
  await load();
}

// ================= Tracking (Gantt-like) =================
async function viewTracking(params) {
  const unit = params.get('unit') || '';
  shell('Theo dõi tiến độ về hàng', 'Lead time & ETA', '<div class="empty">Đang tải…</div>');
  const rows = (await api('GET', `/api/orders?status=ordered,confirmed,shipping${unit ? `&unit=${unit}` : ''}`))
    .sort((a, b) => a.days_left - b.days_left);
  const t = today();
  const start = rows.length ? rows.map(r => r.hp_order_date).sort()[0] : t;
  const end = rows.length ? rows.map(r => r.hp_eta && r.hp_eta > r.eta_max ? r.hp_eta : r.eta_max).sort().slice(-1)[0] : addDays(t, 90);
  const span = Math.max(1, (new Date(end) - new Date(start)) / 864e5);
  const pos = d => Math.max(0, Math.min(100, (new Date(d) - new Date(start)) / 864e5 / span * 100));
  const months = []; { const d = new Date(start.slice(0, 7) + '-01T00:00:00Z'); while (d.toISOString().slice(0, 10) <= end) { months.push(d.toISOString().slice(0, 10)); d.setUTCMonth(d.getUTCMonth() + 1); } }
  $('#content').innerHTML = `
    <div class="row wrap" style="margin-bottom:16px">
      <div class="alert info" style="flex:1">${ic.info}<div>Biểu đồ thể hiện khoảng thời gian từ <b>ngày đặt trên HP</b> tới <b>ETA muộn nhất</b> theo lead time chuẩn. Vùng đậm là cửa sổ về hàng dự kiến (ETA sớm → muộn). Vạch đỏ là hôm nay, kim cương xanh là ETA hãng xác nhận.</div></div>
      ${S.me.view_all ? `<select class="i" id="unitSel" style="width:240px"><option value="">Tất cả đơn vị</option>${S.meta.units.map(u => `<option value="${u.id}" ${String(u.id) === unit ? 'selected' : ''}>${esc(u.code)} – ${esc(u.name)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="card"><div class="card-h"><h3>${rows.length} đơn đang về hàng</h3><div class="spacer"></div>
      <div class="legend"><span><i style="background:#c7d7fe"></i>Đã qua</span><span><i style="background:#0b5cff"></i>Cửa sổ ETA</span><span><i style="background:#e5383b"></i>Quá hạn</span></div></div>
    ${rows.length ? `<div style="overflow-x:auto"><div style="min-width:900px;padding:8px 20px 20px">
      <div style="display:grid;grid-template-columns:280px 1fr 110px;gap:12px;align-items:end;border-bottom:1px solid var(--border);padding:8px 0">
        <div class="small muted">ĐƠN HÀNG</div><div style="position:relative;height:18px">${months.map(m => `<span class="small muted" style="position:absolute;left:${pos(m)}%">T${m.slice(5, 7)}/${m.slice(2, 4)}</span>`).join('')}</div><div class="small muted right">CÒN LẠI</div></div>
      ${rows.map(o => {
        const color = o.overdue ? '#e5383b' : o.due_soon ? '#f59e0b' : '#0b5cff';
        return `<div style="display:grid;grid-template-columns:280px 1fr 110px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #f0f2f5;cursor:pointer" onclick="location.hash='#/orders/${o.id}'">
          <div><div class="row" style="gap:6px"><b>${esc(o.code)}</b><span class="tag">${esc(o.unit_code)}</span>${catTag(o.category)}</div>
            <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${stBadge(o.status, o.status_label)} PO ${esc(o.hp_po)}</div></div>
          <div style="position:relative;height:26px;background:repeating-linear-gradient(90deg,#fafbfc 0,#fafbfc 1px,transparent 1px,transparent 60px)">
            ${months.map(m => `<div style="position:absolute;left:${pos(m)}%;top:0;bottom:0;width:1px;background:#eef0f3"></div>`).join('')}
            <div style="position:absolute;left:${pos(o.hp_order_date)}%;width:${pos(o.eta_min) - pos(o.hp_order_date)}%;top:8px;height:10px;background:#c7d7fe;border-radius:5px 0 0 5px"></div>
            <div style="position:absolute;left:${pos(o.eta_min)}%;width:${Math.max(.5, pos(o.eta_max) - pos(o.eta_min))}%;top:5px;height:16px;background:${color};border-radius:4px" title="ETA ${fmtDate(o.eta_min)} → ${fmtDate(o.eta_max)}"></div>
            ${o.hp_eta ? `<div title="ETA hãng: ${fmtDate(o.hp_eta)}" style="position:absolute;left:calc(${pos(o.hp_eta)}% - 6px);top:7px;width:12px;height:12px;background:#12a150;transform:rotate(45deg);border:2px solid #fff"></div>` : ''}
            <div style="position:absolute;left:${pos(t)}%;top:-4px;bottom:-4px;width:2px;background:#e5383b"></div>
          </div>
          <div class="right">${o.overdue ? `<b style="color:var(--danger)">Trễ ${Math.abs(o.days_left)} ngày</b>` : `<b>${o.days_left} ngày</b>`}<div class="small muted">${fmtDate(o.target_date)}</div></div></div>`;
      }).join('')}</div></div>` : `<div class="empty">${ic.truck}<div>Hiện không có đơn nào đang về hàng</div></div>`}
    </div>`;
  const us = $('#unitSel'); if (us) us.onchange = () => location.hash = `#/tracking${us.value ? `?unit=${us.value}` : ''}`;
}

// ================= Order form =================
async function viewOrderForm(id) {
  let o = null;
  if (id) {
    o = await api('GET', `/api/orders/${id}`);
    if (!o.permissions.edit) { toast('Đơn này không thể chỉnh sửa ở trạng thái hiện tại', 'err'); location.hash = `#/orders/${id}`; return; }
  }
  if (!canCreate()) { toast('Vai trò của bạn chỉ có quyền xem', 'err'); location.hash = '#/orders'; return; }
  const units = S.meta.units;
  const myUnit = units.find(u => u.id === (o?.unit_id || S.me.unit_id)) || null;
  const f = {
    unit_id: o?.unit_id || S.me.unit_id || '', category: o?.category || 'machine', forecast: o ? !!o.forecast : true,
    lines: o?.lines?.length ? o.lines.map(l => ({ ...l })) : [{ sku: '', description: '', qty: 1, unit_price: 0, note: '' }],
  };
  const pending = [];
  shell(id ? `Chỉnh sửa đơn ${esc(o.code)}` : 'Tạo đơn đặt hàng', 'Đơn hàng › ' + (id ? 'Chỉnh sửa' : 'Tạo mới'), `
    ${o?.status === 'returned' ? `<div class="alert warn" style="margin-bottom:16px">${ic.alert}<div><b>Kế hoạch yêu cầu bổ sung:</b> ${esc([...o.events].reverse().find(e => e.action === 'return')?.comment || '')}</div></div>` : ''}
    <div class="alert info" style="margin-bottom:16px">${ic.info}<div><b>Quy định bắt buộc:</b> Tuyệt đối không tự ý tạo đơn trực tiếp trên hệ thống HP khi chưa có email xác nhận rà soát danh mục từ <b>Ms. Uyên (Đầu mối hãng HP)</b> và được <b>Ms. Phượng (Đầu mối Kế hoạch Tập đoàn VPS)</b> phê duyệt trên VPS Order Hub. Sau khi đơn chuyển sang trạng thái <b>“Đã duyệt – chờ đặt HP”</b>, mới tiến hành tạo PO chính thức trên HP Partner Portal.</div></div>
    <form id="of" novalidate>
    <div class="grid g3">
      <div class="span2 grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><span class="tag blue">1</span><h3>Thông tin chung</h3></div><div class="card-b grid g2">
          <div><label class="f">Đơn vị đặt hàng <span class="req">*</span></label>
            ${['planner', 'admin'].includes(S.me.role) ? `<select class="i" name="unit_id"><option value="">— Chọn đơn vị —</option>${units.map(u => `<option value="${u.id}" ${u.id === f.unit_id ? 'selected' : ''}>${esc(u.code)} – ${esc(u.name)}</option>`).join('')}</select>`
              : `<input class="i" readonly value="${esc(myUnit ? `${myUnit.code} – ${myUnit.name}` : '')}">`}</div>
          <div><label class="f">Mức độ ưu tiên</label><select class="i" name="priority">
            <option value="normal">Bình thường</option><option value="high" ${o?.priority === 'high' ? 'selected' : ''}>Ưu tiên</option><option value="urgent" ${o?.priority === 'urgent' ? 'selected' : ''}>Khẩn cấp</option></select></div>
          <div class="span-all"><label class="f">Tiêu đề / Mục đích đặt hàng <span class="req">*</span></label><input class="i" name="title" maxlength="200" value="${esc(o?.title)}" placeholder="VD: Máy in HP LaserJet cho dự án ABC – đợt 1"></div>
          <div><label class="f">Dự án / Khách hàng cuối</label><input class="i" name="project" value="${esc(o?.project)}" placeholder="Tên dự án hoặc khách hàng"></div>
          <div><label class="f">Ngày khách hàng cần hàng</label><input class="i" type="date" name="requested_date" value="${esc(o?.requested_date)}"><div class="hint" id="reqHint"></div></div>
        </div></div>

        <div class="card"><div class="card-h"><span class="tag blue">2</span><h3>Loại hàng &amp; dự báo (quyết định Lead time)</h3></div><div class="card-b">
          <label class="f">Hạng mục hàng hóa <span class="req">*</span></label>
          <div class="seg" id="segCat" style="margin-bottom:16px">
            <div class="seg-opt" data-v="machine"><div class="radio"></div><div><div class="t">Đặt hàng Máy</div><div class="d">Thiết bị hoàn chỉnh · Kho xuất Trung Quốc (TQ)</div></div></div>
            <div class="seg-opt" data-v="supplies"><div class="radio"></div><div><div class="t">Đặt Linh kiện</div><div class="d">Supplies / phụ tùng · Kho xuất Singapore (SG)</div></div></div>
          </div>
          <label class="f">Điều kiện dự báo (Forecast) <span class="req">*</span></label>
          <div class="seg" id="segFc" style="margin-bottom:12px">
            <div class="seg-opt" data-v="1"><div class="radio"></div><div><div class="t">Có dự báo trước</div><div class="d">Đã nằm trong Forecast gửi Kế hoạch</div></div></div>
            <div class="seg-opt" data-v="0"><div class="radio"></div><div><div class="t">Không có dự báo</div><div class="d">Đơn phát sinh ngoài Forecast</div></div></div>
          </div>
          <div id="fcRefWrap"><label class="f">Tham chiếu dự báo (tháng / mã dự báo)</label><input class="i" name="forecast_ref" value="${esc(o?.forecast_ref)}" placeholder="VD: Forecast T12/2026"></div>
          <div id="ltBox" style="margin-top:16px"></div>
        </div></div>

        <div class="card"><div class="card-h"><span class="tag blue">3</span><h3>Danh sách sản phẩm</h3><div class="spacer"></div>
          <button type="button" class="btn sm" id="pasteBtn">Dán từ Excel</button><button type="button" class="btn sm" id="addLine">${ic.plus} Thêm dòng</button></div>
          <div class="tbl-wrap"><table class="t lines"><thead><tr><th style="width:36px">#</th><th style="width:170px">Part Number / SKU *</th><th>Mô tả sản phẩm</th><th style="width:90px">SL *</th><th style="width:120px">Đơn giá</th><th style="width:120px" class="right">Thành tiền</th><th style="width:150px">Ghi chú</th><th style="width:40px"></th></tr></thead>
          <tbody id="lines"></tbody></table></div>
          <div class="row" style="padding:14px 20px;border-top:1px solid var(--border)"><span class="muted small">Mẹo: copy các cột SKU · Mô tả · SL · Đơn giá từ Excel rồi bấm “Dán từ Excel”.</span><div class="spacer"></div>
            <span class="muted">Tổng SL:</span> <b id="sumQty">0</b><span class="muted" style="margin-left:14px">Tổng giá trị:</span> <b id="sumAmt" style="font-size:16px;color:var(--primary)">0</b></div>
        </div>
      </div>

      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><span class="tag blue">4</span><h3>Thông tin đặt hàng HP</h3></div><div class="card-b grid" style="gap:14px">
          <div><label class="f">Sold-to / Mã đối tác HP</label><input class="i" name="sold_to" value="${esc(o?.sold_to ?? myUnit?.hp_account ?? '')}"></div>
          <div><label class="f">Deal ID / Bid / OPG</label><input class="i" name="deal_id" value="${esc(o?.deal_id)}" placeholder="Mã giá đặc biệt (nếu có)"></div>
          <div><label class="f">Tiền tệ</label><select class="i" name="currency"><option>USD</option><option ${o?.currency === 'VND' ? 'selected' : ''}>VND</option></select></div>
          <div><label class="f">Địa chỉ giao hàng (Ship-to) <span class="req">*</span></label><textarea class="i" name="ship_to" rows="3">${esc(o?.ship_to ?? myUnit?.ship_to ?? '')}</textarea></div>
          <div class="grid g2" style="gap:10px"><div><label class="f">Người nhận</label><input class="i" name="receiver" value="${esc(o?.receiver)}"></div>
            <div><label class="f">Điện thoại</label><input class="i" name="receiver_phone" value="${esc(o?.receiver_phone)}"></div></div>
        </div></div>
        <div class="card"><div class="card-h"><span class="tag blue">5</span><h3>Ghi chú &amp; lưu chứng từ kèm theo</h3></div><div class="card-b grid" style="gap:14px">
          <div><label class="f">Ghi chú / Hướng dẫn đặc biệt</label><textarea class="i" name="note" rows="4" placeholder="Yêu cầu cấu hình, đóng gói, hóa đơn…">${esc(o?.note)}</textarea></div>
          <div><label class="f">Loại chứng từ đính kèm</label>
            <select class="i" id="initDocType">${Object.entries(docTypes()).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          <div><label class="f">Số hiệu chứng từ (nếu có)</label>
            <input class="i" id="initDocNo" placeholder="VD: Email Ms. Uyên, Báo giá OPG-992..."></div>
          <div><label class="f">Chọn tệp chứng từ (Email xác nhận, báo giá, cấu hình…)</label>
            <input type="file" id="files" multiple class="i" style="padding:7px"><div class="hint">Tối đa 15MB/tệp. Sau khi tạo đơn bạn vẫn có thể bổ sung thêm chứng từ theo từng bước.</div><div id="fileList" class="small" style="margin-top:6px"></div></div>
        </div></div>
        <div class="card"><div class="card-b">
          <label class="row" style="align-items:flex-start;gap:10px;cursor:pointer;margin-bottom:16px"><input type="checkbox" id="commit" style="margin-top:3px;width:16px;height:16px">
            <span class="small">Tôi xác nhận thông tin đơn hàng chính xác và cam kết <b>không tạo đơn trên hệ thống HP</b> trước khi được Bộ phận Kế hoạch phê duyệt.</span></label>
          <button type="button" class="btn primary lg" id="btnSubmit" style="width:100%;margin-bottom:10px">${ic.send} Gửi Kế hoạch duyệt</button>
          <button type="button" class="btn" id="btnDraft" style="width:100%">Lưu nháp</button>
          <a class="btn ghost" href="${id ? `#/orders/${id}` : '#/orders'}" style="width:100%;margin-top:6px">Hủy bỏ</a>
        </div></div>
      </div>
    </div></form>`);

  const ltOf = () => S.meta.lead_times.find(l => l.category === f.category && !!l.forecast === !!f.forecast);
  const money = n => fmtMoney(n, $('[name=currency]').value);
  function drawSeg() {
    $$('#segCat .seg-opt').forEach(e => e.classList.toggle('on', e.dataset.v === f.category));
    $$('#segFc .seg-opt').forEach(e => e.classList.toggle('on', e.dataset.v === (f.forecast ? '1' : '0')));
    $('#fcRefWrap').classList.toggle('hidden', !f.forecast);
    const lt = ltOf(); const t = today();
    const etaMin = addDays(t, lt.min_weeks * 7), etaMax = addDays(t, lt.max_weeks * 7);
    $('#ltBox').innerHTML = `<div class="lt-grid">${S.meta.lead_times.map(l => `<div class="lt-card ${l === lt ? 'on' : ''}">
      <div class="small muted">${l.category === 'machine' ? 'Máy' : 'Linh kiện'} · ${l.forecast ? 'Có dự báo' : 'Không dự báo'}</div>
      <div class="w">${l.min_weeks}–${l.max_weeks} <span style="font-size:13px;font-weight:600">tuần</span></div><div class="small muted">${esc(l.origin)}</div></div>`).join('')}</div>
      <div class="alert success" style="margin-top:12px">${ic.clock}<div>Lead time áp dụng: <b>${lt.min_weeks}–${lt.max_weeks} tuần</b>. Nếu đặt trên HP hôm nay, hàng dự kiến về kho từ <b>${fmtDate(etaMin)}</b> đến <b>${fmtDate(etaMax)}</b>.
      ${f.category === 'supplies' ? '<br><span class="small">Linh kiện xuất từ Singapore có thời gian về dài hơn 02 tuần so với đơn máy cùng điều kiện dự báo.</span>' : ''}</div></div>`;
    const rd = $('[name=requested_date]').value; const hint = $('#reqHint');
    if (rd && rd < etaMax) { hint.innerHTML = `<span style="color:var(--danger)">⚠ Sớm hơn ETA muộn nhất (${fmtDate(etaMax)}) – có nguy cơ trễ cam kết với khách hàng.</span>`; }
    else hint.textContent = rd ? 'Phù hợp với lead time dự kiến.' : '';
  }
  function drawLines() {
    $('#lines').innerHTML = f.lines.map((l, i) => `<tr data-i="${i}"><td class="muted">${i + 1}</td>
      <td><input class="i mono" data-k="sku" value="${esc(l.sku)}" placeholder="VD: 7KW64A"></td>
      <td><input class="i" data-k="description" value="${esc(l.description)}" placeholder="Tên / cấu hình sản phẩm"></td>
      <td><input class="i" data-k="qty" type="number" min="1" value="${esc(l.qty)}"></td>
      <td><input class="i" data-k="unit_price" type="number" min="0" step="0.01" value="${esc(l.unit_price)}"></td>
      <td class="right nowrap" data-amt>${money((+l.qty || 0) * (+l.unit_price || 0))}</td>
      <td><input class="i" data-k="note" value="${esc(l.note)}"></td>
      <td><button type="button" class="icon-btn" data-del style="width:32px;height:32px" title="Xóa dòng">${ic.trash}</button></td></tr>`).join('');
    $$('#lines tr').forEach(tr => {
      const i = +tr.dataset.i;
      $$('input', tr).forEach(inp => inp.oninput = () => { f.lines[i][inp.dataset.k] = inp.value; $('[data-amt]', tr).textContent = money((+f.lines[i].qty || 0) * (+f.lines[i].unit_price || 0)); sums(); });
      $('[data-del]', tr).onclick = () => { f.lines.splice(i, 1); if (!f.lines.length) f.lines.push({ sku: '', description: '', qty: 1, unit_price: 0 }); drawLines(); };
    });
    sums();
  }
  function sums() {
    $('#sumQty').textContent = fmtNum(f.lines.reduce((s, l) => s + (+l.qty || 0), 0));
    $('#sumAmt').textContent = money(f.lines.reduce((s, l) => s + (+l.qty || 0) * (+l.unit_price || 0), 0));
  }
  $$('#segCat .seg-opt').forEach(e => e.onclick = () => { f.category = e.dataset.v; drawSeg(); });
  $$('#segFc .seg-opt').forEach(e => e.onclick = () => { f.forecast = e.dataset.v === '1'; drawSeg(); });
  $('[name=requested_date]').onchange = drawSeg;
  $('[name=currency]').onchange = drawLines;
  $('#addLine').onclick = () => { f.lines.push({ sku: '', description: '', qty: 1, unit_price: 0, note: '' }); drawLines(); $$('#lines tr').pop().querySelector('input').focus(); };
  $('#pasteBtn').onclick = async () => {
    const r = await modal({ title: 'Dán dữ liệu từ Excel', wide: true, okText: 'Thêm vào đơn',
      body: `<p class="muted small" style="margin-top:0">Copy các cột theo thứ tự: <b>SKU · Mô tả · Số lượng · Đơn giá</b> (mỗi dòng 1 sản phẩm) rồi dán vào ô dưới.</p><textarea class="i mono" name="txt" rows="10" placeholder="7KW64A	HP LaserJet Pro M404dn	5	320"></textarea>` });
    if (!r?.txt) return;
    const add = r.txt.split(/\r?\n/).map(s => s.split('\t')).filter(c => c[0]?.trim()).map(c => ({
      sku: c[0].trim(), description: (c[1] || '').trim(), qty: parseInt(String(c[2] || '1').replace(/[^\d]/g, '')) || 1,
      unit_price: parseFloat(String(c[3] || '0').replace(/[^\d.]/g, '')) || 0, note: '' }));
    f.lines = f.lines.filter(l => l.sku || l.description).concat(add);
    drawLines(); toast(`Đã thêm ${add.length} dòng`, 'ok');
  };
  $('#files').onchange = e => { pending.length = 0; pending.push(...e.target.files); $('#fileList').innerHTML = pending.map(x => `📎 ${esc(x.name)} <span class="muted">(${(x.size / 1024).toFixed(0)} KB)</span>`).join('<br>'); };

  async function save(submit, btn) {
    const fd = Object.fromEntries(new FormData($('#of')));
    if (submit) {
      if (!fd.title?.trim()) return toast('Vui lòng nhập tiêu đề đơn hàng', 'err');
      if (!fd.ship_to?.trim()) return toast('Vui lòng nhập địa chỉ giao hàng', 'err');
      if (!$('#commit').checked) return toast('Vui lòng tích xác nhận cam kết trước khi gửi duyệt', 'err');
    }
    const body = { ...fd, unit_id: fd.unit_id || f.unit_id, category: f.category, forecast: f.forecast, lines: f.lines, submit };
    await busy(btn, async () => {
      const r = id ? await api('PUT', `/api/orders/${id}`, body) : await api('POST', '/api/orders', body);
      for (const file of pending) {
        if (file.size > 15 * 1024 * 1024) { toast(`${file.name} vượt quá 15MB`, 'err'); continue; }
        const data = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1]); rd.readAsDataURL(file); });
        await api('POST', `/api/orders/${r.id}/attachments`, {
          doc_type: $('#initDocType')?.value || 'other',
          doc_no: $('#initDocNo')?.value || '',
          doc_date: today(),
          file_name: file.name,
          mime: file.type,
          data,
        });
      }
      toast(submit ? `Đã gửi đơn ${r.code} tới Bộ phận Kế hoạch` : `Đã lưu nháp ${r.code}`, 'ok');
      location.hash = `#/orders/${r.id}`;
    });
  }
  $('#btnSubmit').onclick = e => save(true, e.currentTarget);
  $('#btnDraft').onclick = e => save(false, e.currentTarget);
  drawSeg(); drawLines();
}

// ================= Order detail =================
const EVENT_TXT = {
  create: ['Tạo đơn', ic.plus, 'c-blue'], edit: ['Cập nhật nội dung đơn', ic.edit, 'c-blue'], submit: ['Gửi Kế hoạch duyệt', ic.send, 'c-orange'],
  approve: ['Kế hoạch phê duyệt', ic.check, 'c-green'], return: ['Yêu cầu bổ sung', ic.back, 'c-orange'], reject: ['Từ chối', ic.x, 'c-red'],
  place_hp: ['Đã đặt trên hệ thống HP', ic.cart, 'c-blue'], hp_confirm: ['HP xác nhận đơn', ic.check, 'c-cyan'], ship: ['Hàng xuất kho / vận chuyển', ic.truck, 'c-cyan'],
  receive: ['Hàng về kho', ic.box, 'c-green'], update_eta: ['Cập nhật ETA', ic.cal, 'c-purple'], cancel: ['Hủy đơn', ic.x, 'c-red'],
  comment: ['Trao đổi', ic.msg, 'c-blue'], attach: ['Đính kèm tệp', ic.clip, 'c-blue'],
};
async function viewOrderDetail(id) {
  shell('Chi tiết đơn hàng', 'Đơn hàng', '<div class="empty">Đang tải…</div>');
  const o = await api('GET', `/api/orders/${id}`);
  const p = o.permissions;
  $('.page-title').textContent = o.code;
  const evAt = a => [...o.events].reverse().find(e => e.action === a)?.created_at;
  const bad = ['rejected', 'cancelled'].includes(o.status);
  const order = ['draft', 'pending', 'approved', 'ordered', 'confirmed', 'shipping', 'received'];
  const curIdx = order.indexOf(o.status === 'returned' ? 'pending' : o.status);
  const steps = [
    ['Tạo đơn', o.created_at, 'draft'], ['Gửi duyệt', o.submitted_at, 'pending'], ['Kế hoạch duyệt', o.approved_at, 'approved'],
    ['Đặt trên HP', o.hp_order_date, 'ordered'], ['HP xác nhận', o.hp_confirm_date, 'confirmed'], ['Vận chuyển', o.ship_date, 'shipping'], ['Về kho', o.received_date, 'received'],
  ];
  const stepper = `<div class="stepper">${steps.map(([lb, dt, key], i) => {
    const idx = order.indexOf(key);
    let cls = idx < curIdx || (idx === curIdx && o.status === 'received') ? 'done' : idx === curIdx ? 'current' : '';
    if (bad && i === steps.findIndex(s => !s[1])) cls = 'bad';
    if (o.status === 'returned' && key === 'pending') cls = 'bad';
    const done = cls === 'done' || (dt && cls !== 'bad');
    return `<div class="step ${cls}"><div class="dot">${cls === 'bad' ? ic.x : done && cls !== 'current' ? ic.check : i + 1}</div><div class="lb">${lb}</div><div class="dt">${dt ? fmtDate(dt) : key === 'received' && o.target_date ? `ETA ${fmtDate(o.target_date)}` : '&nbsp;'}</div></div>`;
  }).join('')}</div>`;

  // Banner theo ngữ cảnh
  let banner = '';
  if (o.status === 'draft') banner = `<div class="alert info">${ic.info}<div>Đơn đang ở trạng thái <b>Nháp</b>. Kiểm tra lại thông tin và bấm <b>Gửi Kế hoạch duyệt</b>.</div></div>`;
  if (o.status === 'pending') banner = `<div class="alert warn">${ic.clock}<div>Đơn đang chờ Bộ phận Kế hoạch rà soát danh mục và phê duyệt (${o.waiting_days ?? 0} ngày). <b>Chưa được phép tạo PO trên HP.</b></div></div>`;
  if (o.status === 'returned') banner = `<div class="alert warn">${ic.back}<div><b>Kế hoạch yêu cầu bổ sung:</b> ${esc([...o.events].reverse().find(e => e.action === 'return')?.comment)}<br>Vui lòng chỉnh sửa và gửi lại.</div></div>`;
  if (o.status === 'approved') banner = `<div class="alert success">${ic.check}<div><b>Đơn đã được phê duyệt${o.approver_name ? ` bởi ${esc(o.approver_name)}` : ''}.</b> Hãy tạo đơn đặt hàng trên <a href="${HP_PORTAL}" target="_blank" rel="noopener"><b>HP Partner Portal</b> ${ic.ext.replace('<svg', '<svg width="12" height="12"')}</a> theo đúng danh mục đã duyệt, sau đó bấm <b>“Cập nhật đã đặt HP”</b> và nhập số PO.</div></div>`;
  if (o.overdue) banner = `<div class="alert danger">${ic.alert}<div><b>Đơn đã quá ETA ${Math.abs(o.days_left)} ngày</b> (ETA ${fmtDate(o.target_date)}). Đề nghị liên hệ HP để cập nhật ETA mới và thông báo khách hàng.</div></div>`;
  if (o.status === 'rejected') banner = `<div class="alert danger">${ic.x}<div><b>Đơn bị từ chối:</b> ${esc([...o.events].reverse().find(e => e.action === 'reject')?.comment)}</div></div>`;
  if (o.status === 'cancelled') banner = `<div class="alert danger">${ic.x}<div><b>Đơn đã hủy:</b> ${esc([...o.events].reverse().find(e => e.action === 'cancel')?.comment)}</div></div>`;
  if (o.status === 'received') banner = `<div class="alert success">${ic.box}<div>Hàng đã về kho ngày <b>${fmtDate(o.received_date)}</b> · Lead time thực tế <b>${o.actual_weeks} tuần</b> · ${o.on_time === false ? '<b style="color:var(--danger)">Về trễ so với ETA</b>' : '<b>Đúng hạn</b>'}.</div></div>`;

  const btn = (k, label, cls, icon) => p[k] ? `<button class="btn ${cls}" data-act="${k}">${icon || ''} ${label}</button>` : '';
  const actions = [
    p.edit ? `<a class="btn" href="#/orders/${o.id}/edit">${ic.edit} Chỉnh sửa</a>` : '',
    btn('delete', 'Xóa nháp', 'danger', ic.trash), btn('cancel', 'Hủy đơn', 'danger', ic.x),
    btn('reject', 'Từ chối', 'danger', ic.x), btn('return', 'Yêu cầu bổ sung', 'warn', ic.back), btn('approve', 'Phê duyệt', 'success', ic.check),
    btn('submit', 'Gửi Kế hoạch duyệt', 'primary', ic.send),
    btn('place_hp', 'Cập nhật đã đặt HP', 'primary', ic.cart), btn('hp_confirm', 'HP xác nhận (SO)', 'primary', ic.check),
    btn('update_eta', 'Cập nhật ETA', '', ic.cal), btn('ship', 'Hàng đã xuất', '', ic.truck), btn('receive', 'Xác nhận về kho', 'success', ic.box),
  ].join('');

  const ltBlock = o.hp_order_date ? (() => {
    const span = Math.max(1, (new Date(o.eta_max) - new Date(o.hp_order_date)) / 864e5);
    const pp = d => Math.max(0, Math.min(100, (new Date(d) - new Date(o.hp_order_date)) / 864e5 / span * 100));
    const endD = o.received_date || today();
    return `<div style="position:relative;height:46px;margin:22px 4px 6px">
      <div style="position:absolute;top:14px;left:0;right:0;height:10px;background:#eef0f4;border-radius:6px"></div>
      <div style="position:absolute;top:14px;left:${pp(o.eta_min)}%;right:0;height:10px;background:#c7f0d6;border-radius:0 6px 6px 0"></div>
      <div style="position:absolute;top:14px;left:0;width:${pp(endD)}%;height:10px;background:${o.overdue ? 'var(--danger)' : o.status === 'received' ? 'var(--success)' : 'var(--primary)'};border-radius:6px"></div>
      ${o.hp_eta ? `<div title="ETA hãng" style="position:absolute;top:12px;left:calc(${pp(o.hp_eta)}% - 7px);width:14px;height:14px;background:#12a150;transform:rotate(45deg);border:2px solid #fff"></div>` : ''}
      <div class="small muted" style="position:absolute;top:30px;left:0">${fmtDate(o.hp_order_date)}<br>Đặt HP</div>
      <div class="small muted" style="position:absolute;top:30px;left:${pp(o.eta_min)}%;transform:translateX(-50%);text-align:center">${fmtDate(o.eta_min)}<br>ETA sớm</div>
      <div class="small muted" style="position:absolute;top:30px;right:0;text-align:right">${fmtDate(o.eta_max)}<br>ETA muộn</div>
    </div><div style="height:30px"></div>
    <dl class="kv"><dt>Lead time chuẩn</dt><dd>${o.lt_min}–${o.lt_max} tuần (${o.category === 'machine' ? 'Máy · TQ' : 'Linh kiện · SG'}, ${o.forecast ? 'có' : 'không'} dự báo)</dd>
    <dt>ETA hãng xác nhận</dt><dd>${fmtDate(o.hp_eta)}</dd>
    ${o.status !== 'received' ? `<dt>Thời gian còn lại</dt><dd>${o.overdue ? `<b style="color:var(--danger)">Trễ ${Math.abs(o.days_left)} ngày</b>` : `<b>${o.days_left} ngày</b> (đến ${fmtDate(o.target_date)})`}</dd>` : `<dt>Lead time thực tế</dt><dd><b>${o.actual_weeks} tuần</b></dd>`}
    ${o.requested_date ? `<dt>Ngày KH cần</dt><dd>${fmtDate(o.requested_date)} ${o.at_risk ? '<span class="tag red">Nguy cơ trễ</span>' : ''}</dd>` : ''}</dl>`;
  })() : `<div class="muted small" style="margin-bottom:10px">Lead time sẽ được tính từ ngày đặt hàng trên hệ thống HP.</div>
    ${o.proj_eta_max ? `<div class="alert info">${ic.clock}<div>Nếu đặt HP hôm nay: dự kiến về <b>${fmtDate(o.proj_eta_min)} → ${fmtDate(o.proj_eta_max)}</b>${o.at_risk ? '<br><b style="color:var(--danger)">⚠ Muộn hơn ngày khách hàng cần (' + fmtDate(o.requested_date) + ')</b>' : ''}</div></div>` : ''}`;

  $('#content').innerHTML = `
    <div class="row wrap no-print" style="margin-bottom:14px">
      <a class="btn ghost sm" href="#/orders">${ic.back} Danh sách đơn</a><div class="spacer"></div>
      <button class="btn sm" onclick="window.print()">${ic.print} In phiếu</button>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-b" style="padding-bottom:6px"><div class="row wrap" style="align-items:flex-start">
        <div><div class="row wrap" style="gap:8px"><h2 style="font-size:22px">${esc(o.code)}</h2>${stBadge(o.status, o.status_label)}${priBadge(o.priority)}${catTag(o.category)}<span class="tag">${o.forecast ? 'Có dự báo' : 'Không dự báo'}</span></div>
          <div style="margin-top:6px;font-size:15px">${esc(o.title || '')}</div>
          <div class="muted small" style="margin-top:4px">${esc(o.unit_code)} – ${esc(o.unit_name)} · Tạo bởi ${esc(o.creator_name)} lúc ${fmtDT(o.created_at)}</div></div>
        <div class="spacer"></div><div class="row wrap no-print" style="gap:8px;justify-content:flex-end">${actions}</div>
      </div></div>
      ${stepper}
      ${banner ? `<div style="padding:0 20px 20px">${banner}</div>` : ''}
    </div>
    <div class="grid g3">
      <div class="span2 grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>Danh sách sản phẩm</h3><div class="spacer"></div><span class="muted small">${o.lines.length} dòng · ${fmtNum(o.total_qty)} sản phẩm</span></div>
          <div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>Part Number / SKU</th><th>Mô tả</th><th class="right">SL</th><th class="right">Đơn giá</th><th class="right">Thành tiền</th><th>Ghi chú</th></tr></thead>
          <tbody>${o.lines.map(l => `<tr><td class="muted">${l.line_no}</td><td class="mono"><b>${esc(l.sku)}</b></td><td>${esc(l.description)}</td><td class="right">${fmtNum(l.qty)}</td>
            <td class="right">${fmtMoney(l.unit_price, o.currency)}</td><td class="right"><b>${fmtMoney(l.qty * l.unit_price, o.currency)}</b></td><td class="small">${esc(l.note)}</td></tr>`).join('')}
          <tr><td colspan="5" class="right"><b>Tổng cộng</b></td><td class="right" style="font-size:16px;color:var(--primary)"><b>${fmtMoney(o.total, o.currency)}</b></td><td></td></tr></tbody></table></div></div>
        <div class="card"><div class="card-h"><h3>Thông tin đơn hàng</h3></div><div class="card-b grid g2">
          <dl class="kv"><dt>Đơn vị</dt><dd>${esc(o.unit_code)} – ${esc(o.unit_name)}</dd><dt>Dự án / KH cuối</dt><dd>${esc(o.project || '—')}</dd>
            <dt>Ngày KH cần</dt><dd>${fmtDate(o.requested_date)}</dd><dt>Tham chiếu dự báo</dt><dd>${esc(o.forecast_ref || '—')}</dd><dt>Ghi chú</dt><dd style="white-space:pre-wrap">${esc(o.note || '—')}</dd></dl>
          <dl class="kv"><dt>Sold-to HP</dt><dd>${esc(o.sold_to || '—')}</dd><dt>Deal / Bid ID</dt><dd>${esc(o.deal_id || '—')}</dd>
            <dt>Ship-to</dt><dd style="white-space:pre-wrap">${esc(o.ship_to || '—')}</dd><dt>Người nhận</dt><dd>${esc(o.receiver || '—')} ${o.receiver_phone ? '· ' + esc(o.receiver_phone) : ''}</dd></dl>
        </div></div>

        <div class="card" id="docsCard">
          <div class="card-h">
            <span style="color:var(--primary);display:flex">${ic.clip.replace('<svg', '<svg width="18"')}</span>
            <h3>Hồ sơ &amp; Chứng từ theo đơn hàng (${o.attachments.length})</h3>
            <div class="spacer"></div>
            ${p.attach ? `<button class="btn primary sm no-print" id="btnAddDoc">${ic.plus} Lưu chứng từ mới</button>` : ''}
          </div>
          <div class="card-b" style="border-bottom:1px solid var(--border);background:#f9fafc">
            <div class="small muted" style="margin-bottom:8px;font-weight:600">DANH MỤC CHỨNG TỪ THEO QUY TRÌNH ĐƠN HÀNG (Bấm vào từng mục để lưu nhanh):</div>
            <div class="row wrap" style="gap:8px">
              ${Object.entries(docTypes()).filter(([k]) => k !== 'other').map(([k, lb]) => {
                const cnt = o.attachments.filter(a => a.doc_type === k).length;
                return `<button type="button" class="btn sm" data-quick-doc="${k}" style="height:30px;font-size:12px;${cnt ? 'border-color:#86efac;background:#f0fdf4;color:#15803d' : 'color:var(--muted)'}">
                  ${cnt ? '✓' : '+'} ${esc(lb)}${cnt ? ` (${cnt})` : ''}
                </button>`;
              }).join('')}
            </div>
          </div>
          <div class="tbl-wrap">
            ${o.attachments.length ? `<table class="t">
              <thead><tr><th>Loại chứng từ</th><th>Số hiệu / Ngày CT</th><th>Tệp đính kèm</th><th>Ghi chú</th><th>Người lưu</th><th class="right no-print">Thao tác</th></tr></thead>
              <tbody>${o.attachments.map(a => {
                const canPreview = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)$/i.test(a.mime || '');
                return `<tr>
                  <td><span class="tag blue">${esc(docLabel(a.doc_type))}</span></td>
                  <td class="small"><b>${esc(a.doc_no || '—')}</b><div class="muted">${fmtDate(a.doc_date)}</div></td>
                  <td>
                    <a href="/api/attachments/${a.id}" style="font-weight:600;word-break:break-all">${esc(a.file_name)}</a>
                    <div class="small muted">${(a.size / 1024).toFixed(1)} KB</div>
                  </td>
                  <td class="small" style="max-width:220px;white-space:pre-wrap">${esc(a.note || '—')}</td>
                  <td class="small">${esc(a.user_name)}<div class="muted">${fmtDT(a.created_at)}</div></td>
                  <td class="right nowrap no-print">
                    ${canPreview ? `<a class="btn sm" href="/api/attachments/${a.id}?inline=1" target="_blank" rel="noopener" title="Xem trực tiếp">Xem</a>` : ''}
                    <a class="btn sm" href="/api/attachments/${a.id}" title="Tải về máy">${ic.download}</a>
                    ${p.attach ? `<button class="btn sm" data-edit-doc="${a.id}" title="Sửa thông tin chứng từ">${ic.edit}</button>
                    <button class="btn danger sm" data-del-doc="${a.id}" title="Xóa chứng từ">${ic.trash}</button>` : ''}
                  </td>
                </tr>`;
              }).join('')}</tbody>
            </table>` : `<div class="empty small" style="padding:28px 16px">${ic.clip}<div>Chưa có chứng từ nào được lưu cho đơn hàng <b>${esc(o.code)}</b>.<br>${p.attach ? 'Bấm <b>“+ Lưu chứng từ mới”</b> hoặc chọn một loại chứng từ ở trên để tải lên.' : ''}</div></div>`}
          </div>
        </div>

        <div class="card"><div class="card-h"><h3>Lịch sử xử lý &amp; trao đổi</h3></div><div class="card-b">
          <ul class="timeline">${o.events.map(e => { const [t, icon, c] = EVENT_TXT[e.action] || [e.action, ic.info, 'c-blue'];
            return `<li><div class="tdot ${c}">${icon}</div><div class="tt">${t}</div><div class="tm">${esc(e.user_name)} · ${fmtDT(e.created_at)}</div>${e.comment ? `<div class="tc">${esc(e.comment)}</div>` : ''}</li>`; }).join('')}</ul>
          <div class="no-print" style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
            <textarea class="i" id="cmt" rows="2" placeholder="Nhập nội dung trao đổi với đơn vị / Kế hoạch…"></textarea>
            <div class="row" style="margin-top:8px"><div class="spacer"></div><button class="btn primary sm" id="cmtBtn">${ic.msg} Gửi trao đổi</button></div></div>
        </div></div>
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>Tiến độ &amp; Lead time</h3></div><div class="card-b">${ltBlock}</div></div>
        <div class="card"><div class="card-h"><h3>Thông tin trên hệ thống HP</h3><div class="spacer"></div><a class="small" href="${HP_PORTAL}" target="_blank" rel="noopener">Mở HP Portal ↗</a></div><div class="card-b">
          <dl class="kv"><dt>Số PO (HP)</dt><dd class="mono">${esc(o.hp_po || '—')}</dd><dt>Ngày đặt HP</dt><dd>${fmtDate(o.hp_order_date)}</dd>
          <dt>Số SO (HP)</dt><dd class="mono">${esc(o.hp_so || '—')}</dd><dt>Ngày HP xác nhận</dt><dd>${fmtDate(o.hp_confirm_date)}</dd>
          <dt>Ngày xuất hàng</dt><dd>${fmtDate(o.ship_date)}</dd><dt>Vận đơn / Tracking</dt><dd class="mono">${esc(o.tracking || '—')}</dd>
          <dt>Ngày về kho</dt><dd>${fmtDate(o.received_date)}</dd><dt>Người duyệt</dt><dd>${esc(o.approver_name || '—')} ${o.approved_at ? `<div class="small muted">${fmtDT(o.approved_at)}</div>` : ''}</dd></dl>
        </div></div>
        <div class="card"><div class="card-h"><h3>Tóm tắt bộ chứng từ</h3><div class="spacer"></div><span class="tag blue">${o.attachments.length} tệp</span></div>
          <div class="card-b small">
            ${Object.entries(docTypes()).map(([k, lb]) => {
              const cnt = o.attachments.filter(a => a.doc_type === k).length;
              return `<div class="row" style="padding:5px 0;border-bottom:1px dashed #eef0f4">
                <span style="color:${cnt ? 'var(--success)' : 'var(--muted)'};font-weight:${cnt ? '600' : '400'}">${cnt ? '✅' : '○'} ${esc(lb)}</span>
                <div class="spacer"></div>
                ${cnt ? `<span class="tag green">${cnt} tệp</span>` : '<span class="muted">Chưa có</span>'}
              </div>`;
            }).join('')}
          </div></div>
      </div>
    </div>`;

  const reload = () => viewOrderDetail(id);
  const run = async (action, extra = {}) => { await api('POST', `/api/orders/${id}/action`, { action, ...extra }); toast('Đã cập nhật đơn hàng', 'ok'); reload(); loadNotif(); };
  const ltCur = S.meta.lead_times.find(l => l.category === o.category && !!l.forecast === !!o.forecast);
  const handlers = {
    submit: async () => { if (await confirmBox('Gửi duyệt', `Gửi đơn <b>${esc(o.code)}</b> tới Bộ phận Kế hoạch để rà soát và phê duyệt?`, 'Gửi duyệt')) await run('submit'); },
    approve: () => modal({ title: `Phê duyệt đơn ${esc(o.code)}`, okText: 'Phê duyệt', okClass: 'success',
      body: `<div class="alert success" style="margin-bottom:14px">${ic.check}<div>Xác nhận đơn hàng đã được <b>Ms. Phượng (Đầu mối VPS)</b> kiểm soát và đã có email xác nhận danh mục từ <b>Ms. Uyên (Đầu mối hãng HP)</b>. Sau khi duyệt, đơn vị được phép tạo PO trên HP Partner Portal.</div></div>
        <label class="f">Ghi chú phê duyệt / Trích yếu email xác nhận của Ms. Uyên (HP)</label><textarea class="i" name="comment" rows="3" placeholder="VD: Đã có email xác nhận danh mục từ Ms. Uyên (HP) ngày hôm nay, đồng ý cho lên PO…"></textarea>`, onOk: d => run('approve', d) }),
    return: () => modal({ title: 'Yêu cầu bổ sung / chỉnh sửa', okText: 'Trả lại đơn', okClass: 'warn',
      body: `<label class="f">Nội dung cần bổ sung <span class="req">*</span></label><textarea class="i" name="comment" rows="4" placeholder="VD: Kiểm tra lại SKU dòng 2, bổ sung báo giá…"></textarea>`, onOk: d => run('return', d) }),
    reject: () => modal({ title: 'Từ chối đơn hàng', okText: 'Từ chối', okClass: 'danger',
      body: `<label class="f">Lý do từ chối <span class="req">*</span></label><textarea class="i" name="comment" rows="4"></textarea>`, onOk: d => run('reject', d) }),
    cancel: () => modal({ title: 'Hủy đơn hàng', okText: 'Hủy đơn', okClass: 'danger',
      body: `${['ordered', 'confirmed', 'shipping'].includes(o.status) ? `<div class="alert warn" style="margin-bottom:12px">${ic.alert}<div>Đơn đã đặt trên HP. Hãy đảm bảo đã làm việc với HP về việc hủy PO.</div></div>` : ''}
        <label class="f">Lý do hủy <span class="req">*</span></label><textarea class="i" name="comment" rows="3"></textarea>`, onOk: d => run('cancel', d) }),
    place_hp: () => modal({ title: 'Cập nhật đơn đã đặt trên hệ thống HP', okText: 'Lưu thông tin',
      body: `<div class="alert info" style="margin-bottom:14px">${ic.info}<div>Nhập số PO đã tạo trên <a href="${HP_PORTAL}" target="_blank" rel="noopener">HP Partner Portal</a>. Lead time ${ltCur.min_weeks}–${ltCur.max_weeks} tuần sẽ được tính từ ngày đặt.</div></div>
        <div class="grid g2"><div><label class="f">Số PO trên HP <span class="req">*</span></label><input class="i mono" name="hp_po" required></div>
        <div><label class="f">Ngày đặt trên HP <span class="req">*</span></label><input class="i" type="date" name="hp_order_date" value="${today()}" max="${today()}"></div></div>
        <div id="etaPrev" class="alert success" style="margin-top:14px"></div>
        <div style="margin-top:12px"><label class="f">Ghi chú</label><textarea class="i" name="comment" rows="2"></textarea></div>`,
      onOpen: w => { const upd = () => { const d = $('[name=hp_order_date]', w).value; $('#etaPrev', w).innerHTML = d ? `${ic.clock}<div>Hàng dự kiến về kho: <b>${fmtDate(addDays(d, ltCur.min_weeks * 7))} → ${fmtDate(addDays(d, ltCur.max_weeks * 7))}</b></div>` : ''; }; $('[name=hp_order_date]', w).oninput = upd; upd(); },
      onOk: d => run('place_hp', d) }),
    hp_confirm: () => modal({ title: 'HP xác nhận đơn hàng', okText: 'Lưu',
      body: `<div class="grid g2"><div><label class="f">Số Sales Order (SO) HP <span class="req">*</span></label><input class="i mono" name="hp_so"></div>
        <div><label class="f">Ngày xác nhận</label><input class="i" type="date" name="hp_confirm_date" value="${today()}"></div>
        <div class="span-all"><label class="f">ETA hãng cung cấp (nếu có)</label><input class="i" type="date" name="hp_eta" value="${esc(o.hp_eta)}"><div class="hint">Nếu nhập, hệ thống ưu tiên dùng ETA hãng để cảnh báo trễ hạn.</div></div></div>
        <div style="margin-top:12px"><label class="f">Ghi chú</label><textarea class="i" name="comment" rows="2"></textarea></div>`, onOk: d => run('hp_confirm', d) }),
    ship: () => modal({ title: 'Hàng đã xuất kho / đang vận chuyển', okText: 'Lưu',
      body: `<div class="grid g2"><div><label class="f">Ngày xuất hàng <span class="req">*</span></label><input class="i" type="date" name="ship_date" value="${today()}"></div>
        <div><label class="f">ETA cập nhật</label><input class="i" type="date" name="hp_eta" value="${esc(o.hp_eta)}"></div>
        <div class="span-all"><label class="f">Số vận đơn / Tracking</label><input class="i mono" name="tracking" value="${esc(o.tracking)}"></div></div>
        <div style="margin-top:12px"><label class="f">Ghi chú</label><textarea class="i" name="comment" rows="2"></textarea></div>`, onOk: d => run('ship', d) }),
    update_eta: () => modal({ title: 'Cập nhật ETA', okText: 'Lưu',
      body: `<div class="grid g2"><div><label class="f">ETA mới <span class="req">*</span></label><input class="i" type="date" name="hp_eta" value="${esc(o.hp_eta || o.eta_max)}"></div>
        <div><label class="f">Tracking</label><input class="i mono" name="tracking" value="${esc(o.tracking)}"></div></div>
        <div style="margin-top:12px"><label class="f">Lý do / ghi chú</label><textarea class="i" name="comment" rows="2"></textarea></div>`, onOk: d => run('update_eta', d) }),
    receive: () => modal({ title: 'Xác nhận hàng về kho', okText: 'Xác nhận', okClass: 'success',
      body: `<label class="f">Ngày hàng về kho thực tế <span class="req">*</span></label><input class="i" type="date" name="received_date" value="${today()}" max="${today()}">
        <div style="margin-top:12px"><label class="f">Ghi chú (tình trạng hàng, thiếu/thừa…)</label><textarea class="i" name="comment" rows="3"></textarea></div>`, onOk: d => run('receive', d) }),
    delete: async () => { if (await confirmBox('Xóa đơn nháp', `Xóa vĩnh viễn đơn nháp <b>${esc(o.code)}</b>?`, 'Xóa', 'danger')) { await api('DELETE', `/api/orders/${id}`); toast('Đã xóa đơn nháp', 'ok'); location.hash = '#/orders'; } },
  };
  $$('[data-act]').forEach(b => b.onclick = () => busy(null, handlers[b.dataset.act]));
  $('#cmtBtn').onclick = e => busy(e.currentTarget, async () => { const c = $('#cmt').value.trim(); if (!c) throw new Error('Nhập nội dung trao đổi'); await run('comment', { comment: c }); });

  const openAddDocModal = (defaultType = 'email_hp') => {
    let selectedFiles = [];
    const autoDocNo = defaultType === 'hp_po' ? (o.hp_po || '') : defaultType === 'hp_so' ? (o.hp_so || '') : defaultType === 'quote_deal' ? (o.deal_id || '') : defaultType === 'shipping_bl' ? (o.tracking || '') : '';
    modal({
      title: `Lưu chứng từ cho đơn ${esc(o.code)}`,
      wide: true,
      okText: 'Lưu chứng từ',
      body: `
        <div class="grid g2" style="gap:12px">
          <div class="span-all">
            <label class="f">Loại chứng từ <span class="req">*</span></label>
            <select class="i" name="doc_type" id="docTypeSel">
              ${Object.entries(docTypes()).map(([k, v]) => `<option value="${k}" ${k === defaultType ? 'selected' : ''}>${esc(v)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="f">Số hiệu / Mã chứng từ</label>
            <input class="i mono" name="doc_no" id="docNoIn" value="${esc(autoDocNo)}" placeholder="VD: PO-HP-883920, INV-2026-01...">
          </div>
          <div>
            <label class="f">Ngày chứng từ</label>
            <input class="i" type="date" name="doc_date" value="${today()}">
          </div>
          <div class="span-all">
            <label class="f">Chọn tệp chứng từ (PDF, Ảnh, Excel, Word, Email...) <span class="req">*</span></label>
            <input type="file" id="docFiles" multiple class="i" style="padding:7px">
            <div class="hint">Có thể chọn nhiều tệp cùng lúc (tối đa 15MB/tệp).</div>
            <div id="docFileNames" class="small" style="margin-top:6px"></div>
          </div>
          <div class="span-all">
            <label class="f">Ghi chú / Trích yếu nội dung chứng từ</label>
            <textarea class="i" name="note" rows="3" placeholder="VD: Email Ms. Uyên xác nhận danh mục đủ điều kiện đặt hàng, hoặc ghi chú CO/CQ bản gốc..."></textarea>
          </div>
        </div>`,
      onOpen: w => {
        $('#docFiles', w).onchange = e => {
          selectedFiles = [...e.target.files];
          $('#docFileNames', w).innerHTML = selectedFiles.map(x => `📎 <b>${esc(x.name)}</b> <span class="muted">(${(x.size / 1024).toFixed(1)} KB)</span>`).join('<br>');
        };
        $('#docTypeSel', w).onchange = e => {
          const v = e.target.value;
          const inp = $('#docNoIn', w);
          if (!inp.value) {
            if (v === 'hp_po' && o.hp_po) inp.value = o.hp_po;
            else if (v === 'hp_so' && o.hp_so) inp.value = o.hp_so;
            else if (v === 'quote_deal' && o.deal_id) inp.value = o.deal_id;
            else if (v === 'shipping_bl' && o.tracking) inp.value = o.tracking;
          }
        };
      },
      onOk: async d => {
        if (!selectedFiles.length) throw new Error('Vui lòng chọn ít nhất 1 tệp chứng từ để lưu');
        for (const file of selectedFiles) {
          if (file.size > 15 * 1024 * 1024) throw new Error(`Tệp ${file.name} vượt quá 15MB`);
          const data = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1]); rd.readAsDataURL(file); });
          await api('POST', `/api/orders/${id}/attachments`, {
            doc_type: d.doc_type,
            doc_no: d.doc_no,
            doc_date: d.doc_date,
            note: d.note,
            file_name: file.name,
            mime: file.type,
            data,
          });
        }
        toast(`Đã lưu ${selectedFiles.length} chứng từ vào đơn ${o.code}`, 'ok');
        reload();
      },
    });
  };

  if ($('#btnAddDoc')) $('#btnAddDoc').onclick = () => openAddDocModal('email_hp');
  $$('[data-quick-doc]').forEach(b => b.onclick = () => {
    if (!p.attach) return toast('Bạn không có quyền thêm chứng từ cho đơn này', 'err');
    openAddDocModal(b.dataset.quickDoc);
  });

  $$('[data-edit-doc]').forEach(b => b.onclick = () => {
    const a = o.attachments.find(x => x.id === +b.dataset.editDoc);
    if (!a) return;
    modal({
      title: `Cập nhật chứng từ: ${esc(a.file_name)}`,
      okText: 'Lưu thay đổi',
      body: `
        <div class="grid g2" style="gap:12px">
          <div class="span-all">
            <label class="f">Loại chứng từ</label>
            <select class="i" name="doc_type">
              ${Object.entries(docTypes()).map(([k, v]) => `<option value="${k}" ${k === a.doc_type ? 'selected' : ''}>${esc(v)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="f">Số hiệu / Mã chứng từ</label>
            <input class="i mono" name="doc_no" value="${esc(a.doc_no)}">
          </div>
          <div>
            <label class="f">Ngày chứng từ</label>
            <input class="i" type="date" name="doc_date" value="${esc(a.doc_date || '')}">
          </div>
          <div class="span-all">
            <label class="f">Ghi chú</label>
            <textarea class="i" name="note" rows="3">${esc(a.note || '')}</textarea>
          </div>
        </div>`,
      onOk: async d => {
        await api('PUT', `/api/attachments/${a.id}`, d);
        toast('Đã cập nhật thông tin chứng từ', 'ok');
        reload();
      },
    });
  });

  $$('[data-del-doc]').forEach(b => b.onclick = () => busy(b, async () => {
    const a = o.attachments.find(x => x.id === +b.dataset.delDoc);
    if (!a) return;
    if (await confirmBox('Xóa chứng từ', `Bạn có chắc muốn xóa chứng từ <b>${esc(a.file_name)}</b> (${esc(docLabel(a.doc_type))}) khỏi đơn hàng <b>${esc(o.code)}</b>?`, 'Xóa chứng từ', 'danger')) {
      await api('DELETE', `/api/attachments/${a.id}`);
      toast('Đã xóa chứng từ', 'ok');
      reload();
    }
  }));
}

// ================= Forecasts =================
async function viewForecasts(params) {
  const unit = params.get('unit') || ''; const period = params.get('period') || '';
  shell('Dự báo nhu cầu (Forecast)', 'Kế hoạch', '<div class="empty">Đang tải…</div>');
  const rows = await api('GET', `/api/forecasts?${new URLSearchParams(Object.entries({ unit, period }).filter(([, v]) => v))}`);
  const canAdd = canCreate();
  const groups = {};
  rows.forEach(r => { const k = `${r.period}|${r.unit_code}|${r.category}`; (groups[k] = groups[k] || []).push(r); });
  $('#content').innerHTML = `
    <div class="alert info" style="margin-bottom:16px">${ic.info}<div><b>Tối ưu tiến độ:</b> Đơn hàng có dự báo trước được hưởng lead time ngắn hơn <b>2 tuần</b>. Các bộ phận kinh doanh và dự án cần chủ động gửi bản dự báo nhu cầu định kỳ đúng hạn cho Bộ phận Kế hoạch. Chu kỳ đặt hàng: đặt tháng T2 cho nhu cầu T1 – lead time tính từ thời điểm đặt hàng chu kỳ đến khi hàng nhập kho thực tế.</div></div>
    <div class="card"><div class="filters">
      ${S.me.view_all ? `<select class="i" id="funit"><option value="">Tất cả đơn vị</option>${S.meta.units.map(u => `<option value="${u.id}" ${String(u.id) === unit ? 'selected' : ''}>${esc(u.code)} – ${esc(u.name)}</option>`).join('')}</select>` : ''}
      <input class="i" type="month" id="fper" value="${esc(period)}" title="Tháng cần hàng">
      <div class="spacer"></div>${canAdd ? `<button class="btn primary sm" id="addFc">${ic.plus} Gửi dự báo</button>` : ''}</div>
    ${Object.keys(groups).length ? Object.entries(groups).map(([k, list]) => { const [per, uc, cat] = k.split('|');
      return `<div style="border-bottom:1px solid var(--border)"><div class="row" style="padding:12px 16px;background:#fafbfc"><b>Tháng ${per.slice(5)}/${per.slice(0, 4)}</b><span class="tag">${esc(uc)}</span>${catTag(cat)}<span class="muted small">${list.length} dòng · ${fmtNum(list.reduce((s, r) => s + r.qty, 0))} sản phẩm</span></div>
      <table class="t"><thead><tr><th>SKU</th><th>Mô tả</th><th class="right">SL dự báo</th><th>Ghi chú</th><th>Người gửi</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td class="mono"><b>${esc(r.sku)}</b></td><td>${esc(r.description)}</td><td class="right">${fmtNum(r.qty)}</td><td class="small">${esc(r.note)}</td>
        <td class="small">${esc(r.creator_name)}<div class="muted">${fmtDate(r.created_at)}</div></td>
        <td class="right">${(['planner', 'admin'].includes(S.me.role) || (roleIsUnit() && r.unit_id === S.me.unit_id)) ? `<button class="icon-btn" data-del="${r.id}" style="width:30px;height:30px">${ic.trash}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`; }).join('')
      : `<div class="empty">${ic.trend}<div>Chưa có dữ liệu dự báo</div></div>`}</div>`;
  const nav = () => location.hash = `#/forecasts?${new URLSearchParams(Object.entries({ unit: $('#funit')?.value || '', period: $('#fper').value }).filter(([, v]) => v))}`;
  if ($('#funit')) $('#funit').onchange = nav; $('#fper').onchange = nav;
  $$('[data-del]').forEach(b => b.onclick = () => busy(b, async () => { if (await confirmBox('Xóa dòng dự báo', 'Xóa dòng dự báo này?', 'Xóa', 'danger')) { await api('DELETE', `/api/forecasts/${b.dataset.del}`); viewForecasts(params); } }));
  const add = $('#addFc');
  if (add) add.onclick = () => {
    const next = new Date(today() + 'T00:00:00Z'); next.setUTCMonth(next.getUTCMonth() + 2);
    modal({ title: 'Gửi dự báo nhu cầu', wide: true, okText: 'Gửi dự báo',
      body: `<div class="grid g3" style="margin-bottom:14px">
        ${['planner', 'admin'].includes(S.me.role) ? `<div><label class="f">Đơn vị *</label><select class="i" name="unit_id">${S.meta.units.map(u => `<option value="${u.id}">${esc(u.code)}</option>`).join('')}</select></div>` : ''}
        <div><label class="f">Tháng cần hàng *</label><input class="i" type="month" name="period" value="${next.toISOString().slice(0, 7)}"></div>
        <div><label class="f">Loại hàng *</label><select class="i" name="category"><option value="machine">Máy (TQ)</option><option value="supplies">Linh kiện (SG)</option></select></div></div>
        <label class="f">Danh sách (mỗi dòng: SKU · Mô tả · Số lượng · Ghi chú – có thể dán từ Excel)</label>
        <textarea class="i mono" name="txt" rows="8" placeholder="7KW64A	HP LaserJet Pro M404dn	20	Dự án ABC"></textarea>`,
      onOk: async d => {
        const lines = (d.txt || '').split(/\r?\n/).map(s => s.includes('\t') ? s.split('\t') : s.split(/\s*[;|]\s*/)).filter(c => c[0]?.trim())
          .map(c => ({ sku: c[0].trim(), description: (c[1] || '').trim(), qty: parseInt(String(c[2] || '').replace(/[^\d]/g, '')), note: (c[3] || '').trim() }));
        await api('POST', '/api/forecasts', { ...d, lines }); toast(`Đã gửi ${lines.length} dòng dự báo`, 'ok'); viewForecasts(params);
      } });
  };
}

// ================= Guide =================
function viewGuide() {
  const lt = S.meta.lead_times;
  const row = (cat, fc) => lt.find(l => l.category === cat && l.forecast === fc);
  shell('Quy trình & hướng dẫn', 'Tài liệu', `
    <div class="grid g3">
      <div class="span2 grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>I. Quy trình phê duyệt trước khi lên hệ thống HP</h3></div><div class="card-b">
          <div class="alert danger" style="margin-bottom:16px">${ic.alert}<div><b>Checklist tiên quyết:</b> Tuyệt đối không tự ý tạo đơn trực tiếp lên hệ thống của hãng khi chưa có email xác nhận rà soát danh mục từ <b>Ms. Uyên (Nhân sự đầu mối hãng HP)</b> và được <b>Ms. Phượng (Đầu mối Kế hoạch Tập đoàn VPS)</b> phê duyệt trên VPS Order Hub.</div></div>
          ${[['Đơn vị tạo đơn đặt hàng trên VPS Order Hub', 'Chuyên viên đặt hàng tại 5 đơn vị (Tân Hồng Hà, Việt, Xesco, VPSM, ITSS) nhập đầy đủ thông tin: loại hàng, dự báo, danh mục SKU, số lượng, đính kèm email/báo giá → bấm “Gửi Kế hoạch duyệt”.'],
             ['Rà soát với Ms. Uyên (Đầu mối HP) & Phê duyệt bởi Ms. Phượng (Đầu mối VPS)', 'Gửi email chi tiết thông tin đơn hàng tới Ms. Uyên (bên HP) để rà soát danh mục. Khi có phản hồi xác nhận qua email từ Ms. Uyên, Ms. Phượng (Đầu mối Kế hoạch VPS) thực hiện Phê duyệt trên hệ thống (hoặc Yêu cầu bổ sung / Từ chối).'],
             ['Tạo đơn chính thức trên HP Partner Portal', `Sau khi đơn chuyển sang trạng thái “Đã duyệt – chờ đặt HP”, tiến hành tạo và gửi đơn đặt hàng chính thức trên <a href="${HP_PORTAL}" target="_blank" rel="noopener">HP Partner Portal</a>, rồi cập nhật Số PO + Ngày đặt vào hệ thống. Hệ thống tự tính ETA theo Lead time.`],
             ['Theo dõi xác nhận & vận chuyển', 'Cập nhật số SO khi HP xác nhận, ETA hãng (nếu có), ngày xuất hàng và tracking. Hệ thống cảnh báo đơn sắp về / quá hạn.'],
             ['Xác nhận hàng về kho', 'Nhập ngày hàng về kho thực tế → hệ thống ghi nhận lead time thực tế và tỷ lệ đúng hạn của từng đơn vị.']]
            .map(([t, d], i) => `<div class="row" style="align-items:flex-start;gap:14px;margin-bottom:16px"><div class="kpi-ic c-blue" style="width:34px;height:34px;font-weight:700">${i + 1}</div><div><b>${t}</b><div class="muted" style="margin-top:3px;line-height:1.55">${d}</div></div></div>`).join('')}
        </div></div>
        <div class="card"><div class="card-h"><h3>II. Thời gian giao hàng dự kiến (Lead Time)</h3></div>
          <table class="t"><thead><tr><th>Hạng mục hàng hóa</th><th>Kho xuất</th><th>Điều kiện dự báo</th><th class="right">Thời gian về hàng</th></tr></thead><tbody>
          <tr><td rowspan="2"><b>1. Đặt hàng Máy</b><div class="small muted">Thiết bị hoàn chỉnh</div></td><td rowspan="2">${esc(row('machine', 1).origin)}</td><td>Có dự báo trước (Forecasted)</td><td class="right"><b>${row('machine', 1).min_weeks} – ${row('machine', 1).max_weeks} tuần</b></td></tr>
          <tr><td>Không có dự báo (Non-forecasted)</td><td class="right"><b>${row('machine', 0).min_weeks} – ${row('machine', 0).max_weeks} tuần</b></td></tr>
          <tr><td rowspan="2"><b>2. Đặt Linh kiện</b><div class="small muted">Supplies / phụ tùng</div></td><td rowspan="2">${esc(row('supplies', 1).origin)}</td><td>Có dự báo trước (Forecasted)</td><td class="right"><b>${row('supplies', 1).min_weeks} – ${row('supplies', 1).max_weeks} tuần</b></td></tr>
          <tr><td>Không có dự báo (Non-forecasted)</td><td class="right"><b>${row('supplies', 0).min_weeks} – ${row('supplies', 0).max_weeks} tuần</b></td></tr></tbody></table></div>
        <div class="card"><div class="card-h"><h3>III. Ghi chú &amp; hướng dẫn nghiệp vụ</h3></div><div class="card-b" style="line-height:1.7">
          <p style="margin-top:0"><b>Chu kỳ đặt hàng:</b> Lead time được tính từ thời điểm đặt hàng chu kỳ (T2 đặt cho T1) cho tới khi hàng về nhập kho thực tế.</p>
          <p><b>Đặc thù linh kiện (Supplies):</b> Do kho xuất phát từ Singapore và quy trình điều phối riêng biệt, thời gian về hàng của linh kiện dài hơn 02 tuần so với đơn đặt máy cùng điều kiện dự báo.</p>
          <p style="margin-bottom:0"><b>Tối ưu tiến độ:</b> Để đảm bảo cam kết tiến độ với khách hàng, các bộ phận kinh doanh và dự án cần chủ động gửi bản dự báo nhu cầu (Forecast) định kỳ đúng hạn – sử dụng mục <a href="#/forecasts">Dự báo nhu cầu</a>.</p>
        </div></div>
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>Phân quyền xem dữ liệu</h3></div><div class="card-b small" style="line-height:1.6">
          ${[['CEO / Tổng Giám đốc', 'Xem toàn bộ đơn & báo cáo của 5 đơn vị, trao đổi ý kiến.', 'c-purple'],
             ['Bộ phận Kế hoạch', 'Xem toàn bộ, phê duyệt / trả lại / từ chối, cập nhật tiến độ, quản lý dự báo.', 'c-blue'],
             ['Trưởng bộ phận đơn vị', 'Chỉ xem đơn của đơn vị mình; tạo, gửi, hủy đơn, cập nhật tiến độ.', 'c-green'],
             ['Nhân viên đơn vị', 'Chỉ xem đơn của đơn vị mình; tạo đơn, gửi duyệt, cập nhật PO/tiến độ.', 'c-green'],
             ['Quản trị hệ thống', 'Quản lý tài khoản, đơn vị, cấu hình lead time.', 'c-orange']]
            .map(([t, d, c]) => `<div style="margin-bottom:12px"><span class="tag ${c === 'c-green' ? 'green' : c === 'c-orange' ? 'orange' : 'blue'}">${t}</span><div class="muted" style="margin-top:4px">${d}</div></div>`).join('')}
        </div></div>
        <div class="card"><div class="card-h"><h3>Trạng thái đơn hàng</h3></div><div class="card-b grid" style="gap:8px">
          ${Object.entries(S.meta.statuses).map(([k, v]) => `<div>${stBadge(k, v)}</div>`).join('')}</div></div>
      </div>
    </div>`);
}

// ================= Profile =================
function viewProfile() {
  shell('Tài khoản của tôi', 'Cá nhân', `<div class="card" style="max-width:520px"><div class="card-h"><h3>Đổi mật khẩu</h3></div><form class="card-b grid" id="pf" style="gap:14px">
    <dl class="kv"><dt>Tài khoản</dt><dd>${esc(S.me.username)}</dd><dt>Họ tên</dt><dd>${esc(S.me.full_name)}</dd><dt>Vai trò</dt><dd>${esc(S.me.role_label)}</dd><dt>Đơn vị</dt><dd>${esc(S.me.unit_name || 'Khối Tập đoàn')}</dd></dl>
    <div><label class="f">Mật khẩu hiện tại</label><input class="i" type="password" name="old_password"></div>
    <div><label class="f">Mật khẩu mới</label><input class="i" type="password" name="new_password"><div class="hint">Tối thiểu 8 ký tự, gồm cả chữ và số.</div></div>
    <div><label class="f">Nhập lại mật khẩu mới</label><input class="i" type="password" name="confirm"></div>
    <div><button class="btn primary">Cập nhật mật khẩu</button></div></form></div>`);
  $('#pf').onsubmit = e => { e.preventDefault(); busy($('button', e.target), async () => {
    const d = Object.fromEntries(new FormData(e.target));
    if (d.new_password !== d.confirm) throw new Error('Mật khẩu nhập lại không khớp');
    await api('POST', '/api/me/password', d); S.me.must_change = false; toast('Đã đổi mật khẩu', 'ok'); e.target.reset();
  }); };
}
async function forceChangePassword() {
  await modal({ title: 'Đổi mật khẩu lần đầu', okText: 'Cập nhật', hideCancel: true, noClose: true,
    body: `<div class="alert warn" style="margin-bottom:14px">${ic.key}<div>Vì lý do bảo mật, vui lòng đổi mật khẩu mặc định trước khi sử dụng hệ thống.</div></div>
      <div class="grid" style="gap:12px"><div><label class="f">Mật khẩu hiện tại</label><input class="i" type="password" name="old_password"></div>
      <div><label class="f">Mật khẩu mới</label><input class="i" type="password" name="new_password"><div class="hint">Tối thiểu 8 ký tự, gồm cả chữ và số.</div></div>
      <div><label class="f">Nhập lại mật khẩu mới</label><input class="i" type="password" name="confirm"></div></div>`,
    onOk: async d => { if (d.new_password !== d.confirm) throw new Error('Mật khẩu nhập lại không khớp'); await api('POST', '/api/me/password', d); S.me.must_change = false; toast('Đã đổi mật khẩu', 'ok'); } });
}

// ================= Admin =================
async function viewAdminUsers() {
  shell('Người dùng & phân quyền', 'Quản trị', '<div class="empty">Đang tải…</div>');
  const users = await api('GET', '/api/admin/users');
  const units = await api('GET', '/api/admin/units');
  $('#content').innerHTML = `<div class="card"><div class="filters"><b>${users.length} tài khoản</b><div class="spacer"></div><button class="btn primary sm" id="addU">${ic.plus} Thêm người dùng</button></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Đơn vị</th><th>Email / ĐT</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr><td class="mono"><b>${esc(u.username)}</b></td><td>${esc(u.full_name)}</td><td>${esc(S.meta.roles[u.role])}</td>
      <td>${u.unit_code ? `<span class="tag">${esc(u.unit_code)}</span>` : '<span class="muted small">Toàn tập đoàn</span>'}</td>
      <td class="small">${esc(u.email || '')}<div class="muted">${esc(u.phone || '')}</div></td>
      <td>${u.active ? '<span class="tag green">Hoạt động</span>' : '<span class="tag red">Đã khóa</span>'}</td>
      <td class="right"><button class="btn sm" data-ed="${u.id}">${ic.edit} Sửa</button></td></tr>`).join('')}</tbody></table></div></div>`;
  const form = u => `<div class="grid g2">
    <div><label class="f">Tên đăng nhập *</label><input class="i mono" name="username" value="${esc(u?.username)}" ${u ? 'readonly' : ''}></div>
    <div><label class="f">Họ tên *</label><input class="i" name="full_name" value="${esc(u?.full_name)}"></div>
    <div><label class="f">Vai trò *</label><select class="i" name="role" id="roleSel">${Object.entries(S.meta.roles).map(([k, v]) => `<option value="${k}" ${u?.role === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <div id="unitWrap"><label class="f">Đơn vị *</label><select class="i" name="unit_id"><option value="">—</option>${units.map(x => `<option value="${x.id}" ${u?.unit_id === x.id ? 'selected' : ''}>${esc(x.code)} – ${esc(x.name)}</option>`).join('')}</select></div>
    <div><label class="f">Email</label><input class="i" name="email" value="${esc(u?.email)}"></div>
    <div><label class="f">Điện thoại</label><input class="i" name="phone" value="${esc(u?.phone)}"></div>
    <div><label class="f">${u ? 'Đặt lại mật khẩu (để trống nếu không đổi)' : 'Mật khẩu ban đầu *'}</label><input class="i" name="password" type="text" placeholder="Tối thiểu 8 ký tự"></div>
    ${u ? `<div><label class="f">Trạng thái</label><select class="i" name="active"><option value="1" ${u.active ? 'selected' : ''}>Hoạt động</option><option value="" ${!u.active ? 'selected' : ''}>Khóa tài khoản</option></select></div>` : ''}
    </div><div class="hint" style="margin-top:12px">Người dùng thuộc đơn vị chỉ xem được đơn hàng của đơn vị mình. CEO, Tổng Giám đốc, Bộ phận Kế hoạch và Quản trị xem được toàn bộ.</div>`;
  const toggleUnit = w => { const s = $('#roleSel', w); const f = () => $('#unitWrap', w).classList.toggle('hidden', !['unit_manager', 'unit_staff'].includes(s.value)); s.onchange = f; f(); };
  $('#addU').onclick = () => modal({ title: 'Thêm người dùng', wide: true, okText: 'Tạo tài khoản', body: form(null), onOpen: toggleUnit,
    onOk: async d => { await api('POST', '/api/admin/users', d); toast('Đã tạo tài khoản', 'ok'); viewAdminUsers(); } });
  $$('[data-ed]').forEach(b => b.onclick = () => { const u = users.find(x => x.id === +b.dataset.ed);
    modal({ title: `Sửa tài khoản ${esc(u.username)}`, wide: true, okText: 'Lưu', body: form(u), onOpen: toggleUnit,
      onOk: async d => { await api('PUT', `/api/admin/users/${u.id}`, { ...d, active: !!d.active }); toast('Đã cập nhật', 'ok'); viewAdminUsers(); } }); });
}
async function viewAdminSettings() {
  shell('Đơn vị & Lead time', 'Quản trị', '<div class="empty">Đang tải…</div>');
  const units = await api('GET', '/api/admin/units');
  $('#content').innerHTML = `<div class="grid" style="gap:16px">
    <div class="card"><div class="card-h"><h3>Đơn vị thành viên</h3><div class="spacer"></div><span class="small muted">Thông tin mặc định sẽ tự điền vào đơn hàng</span></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Mã</th><th>Tên đơn vị</th><th>Sold-to / Mã đối tác HP</th><th>Địa chỉ giao hàng mặc định</th><th>Liên hệ</th><th></th></tr></thead><tbody>
      ${units.map(u => `<tr data-u="${u.id}"><td><b>${esc(u.code)}</b></td><td><input class="i" data-k="name" value="${esc(u.name)}"></td><td><input class="i" data-k="hp_account" value="${esc(u.hp_account)}"></td>
        <td><input class="i" data-k="ship_to" value="${esc(u.ship_to)}"></td><td><input class="i" data-k="contact" value="${esc(u.contact)}"></td><td><button class="btn sm" data-save>Lưu</button></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-h"><h3>Cấu hình Lead time</h3><div class="spacer"></div><span class="small muted">Áp dụng cho đơn đặt HP mới (đơn đã đặt giữ nguyên lead time tại thời điểm đặt)</span></div>
      <div class="tbl-wrap"><table class="t" id="ltT"><thead><tr><th>Hạng mục</th><th>Dự báo</th><th>Kho xuất</th><th>Tối thiểu (tuần)</th><th>Tối đa (tuần)</th></tr></thead><tbody>
      ${S.meta.lead_times.map(l => `<tr data-c="${l.category}" data-f="${l.forecast}"><td><b>${l.category === 'machine' ? 'Máy' : 'Linh kiện'}</b></td><td>${l.forecast ? 'Có dự báo' : 'Không dự báo'}</td>
        <td><input class="i" data-k="origin" value="${esc(l.origin)}"></td><td><input class="i" type="number" min="1" data-k="min_weeks" value="${l.min_weeks}" style="width:100px"></td>
        <td><input class="i" type="number" min="1" data-k="max_weeks" value="${l.max_weeks}" style="width:100px"></td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="padding:14px 20px"><div class="spacer"></div><button class="btn primary" id="saveLt">Lưu cấu hình Lead time</button></div></div></div>`;
  $$('[data-save]').forEach(b => b.onclick = () => busy(b, async () => {
    const tr = b.closest('tr'); const d = Object.fromEntries($$('input', tr).map(i => [i.dataset.k, i.value]));
    await api('PUT', `/api/admin/units/${tr.dataset.u}`, d); S.meta = await api('GET', '/api/meta'); toast('Đã lưu đơn vị', 'ok');
  }));
  $('#saveLt').onclick = e => busy(e.currentTarget, async () => {
    const items = $$('#ltT tbody tr').map(tr => ({ category: tr.dataset.c, forecast: tr.dataset.f === '1', ...Object.fromEntries($$('input', tr).map(i => [i.dataset.k, i.value])) }));
    await api('PUT', '/api/admin/lead-times', { items }); S.meta = await api('GET', '/api/meta'); toast('Đã lưu cấu hình lead time', 'ok');
  });
}

// ================= Router =================
async function route() {
  if (!S.me) return;
  const [path, qs] = (location.hash.slice(1) || '/dashboard').split('?');
  const params = new URLSearchParams(qs || '');
  const seg = path.split('/').filter(Boolean);
  try {
    if (seg[0] === 'orders' && seg[1] === 'new') return await viewOrderForm(null);
    if (seg[0] === 'orders' && seg[1] && seg[2] === 'edit') return await viewOrderForm(seg[1]);
    if (seg[0] === 'orders' && seg[1]) return await viewOrderDetail(seg[1]);
    if (seg[0] === 'orders') return await viewOrders(params);
    if (seg[0] === 'tracking') return await viewTracking(params);
    if (seg[0] === 'forecasts') return await viewForecasts(params);
    if (seg[0] === 'guide') return viewGuide();
    if (seg[0] === 'profile') return viewProfile();
    if (seg[0] === 'admin' && seg[1] === 'users' && S.me.role === 'admin') return await viewAdminUsers();
    if (seg[0] === 'admin' && seg[1] === 'settings' && S.me.role === 'admin') return await viewAdminSettings();
    return await viewDashboard(params);
  } catch (e) {
    if (!S.me) return;
    const c = $('#content');
    if (c) c.innerHTML = `<div class="card"><div class="empty">${ic.alert}<div style="font-weight:600;margin:6px 0">${esc(e.message)}</div><a class="btn" href="#/dashboard">Về trang tổng quan</a></div></div>`;
    else toast(e.message, 'err');
  }
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); route(); });

async function boot() {
  try { S.me = await api('GET', '/api/me'); } catch { S.me = null; }
  if (!S.me) return renderLogin();
  S.meta = await api('GET', '/api/meta');
  await loadNotif();
  await route();
  if (S.me.must_change) forceChangePassword();
}
setInterval(() => { if (S.me) loadNotif(); }, 60000);
boot();
