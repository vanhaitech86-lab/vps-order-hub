'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, hashPassword, verifyPassword, DATA_DIR } = require('./db');

// Tự động nạp dữ liệu mẫu nếu DB mới khởi tạo trống
try {
  if (db.prepare('SELECT COUNT(*) c FROM orders').get().c === 0) {
    require('../scripts/demo-data');
  }
} catch (e) { console.error('[auto-demo]', e.message); }

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const SESSION_HOURS = 12;
const TOKEN_SECRET = process.env.SESSION_SECRET || 'vps-order-hub-secret-key-2026';

function signSessionToken(userId, exp) {
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function verifySessionToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [uidStr, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!exp || exp < Date.now()) return null;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(`${uidStr}.${expStr}`).digest('hex');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { userId: Number(uidStr), exp };
}

// ================= Cấu hình nghiệp vụ =================
const ROLES = {
  admin: { label: 'Quản trị hệ thống', viewAll: true },
  ceo: { label: 'CEO', viewAll: true },
  gd: { label: 'Tổng Giám đốc', viewAll: true },
  planner: { label: 'Bộ phận Kế hoạch (Đầu mối duyệt)', viewAll: true },
  unit_manager: { label: 'Trưởng bộ phận đơn vị', viewAll: false },
  unit_staff: { label: 'Nhân viên đặt hàng đơn vị', viewAll: false },
};
const STATUSES = {
  draft: 'Nháp',
  pending: 'Chờ Kế hoạch duyệt',
  returned: 'Yêu cầu bổ sung',
  approved: 'Đã duyệt – chờ đặt HP',
  ordered: 'Đã đặt trên HP',
  confirmed: 'HP đã xác nhận',
  shipping: 'Đang vận chuyển',
  received: 'Đã về kho',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
};
const ACTIVE_HP = ['ordered', 'confirmed', 'shipping'];
const CATEGORIES = { machine: 'Máy (thiết bị hoàn chỉnh)', supplies: 'Linh kiện (Supplies / phụ tùng)' };
const DOC_TYPES = {
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

const isViewAll = u => !!(ROLES[u.role] && ROLES[u.role].viewAll);
const isPlanner = u => u.role === 'planner' || u.role === 'admin';
const isUnitRole = u => u.role === 'unit_manager' || u.role === 'unit_staff';

// ================= Tiện ích =================
const today = () => {
  const d = new Date(Date.now() + 7 * 3600e3); // giờ Việt Nam
  return d.toISOString().slice(0, 10);
};
const nowStr = () => new Date(Date.now() + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));
const str = (v, max = 500) => (v == null ? null : String(v).trim().slice(0, max) || null);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'object' && !Buffer.isBuffer(data) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Dữ liệu gửi lên quá lớn')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Dữ liệu JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function getUser(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  let row = db.prepare(`SELECT u.*, s.expires_at, un.name unit_name, un.code unit_code
    FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN units un ON un.id = u.unit_id
    WHERE s.token = ?`).get(token);
  if (row && row.expires_at >= Date.now() && row.active) return row;
  // Fallback cho môi trường Serverless (Vercel) bằng signed token
  const verified = verifySessionToken(token);
  if (!verified) return null;
  row = db.prepare(`SELECT u.*, un.name unit_name, un.code unit_code
    FROM users u LEFT JOIN units un ON un.id = u.unit_id WHERE u.id = ?`).get(verified.userId);
  if (!row || !row.active) return null;
  return row;
}
const publicUser = u => ({
  id: u.id, username: u.username, full_name: u.full_name, email: u.email, phone: u.phone,
  role: u.role, role_label: ROLES[u.role]?.label, unit_id: u.unit_id, unit_name: u.unit_name, unit_code: u.unit_code,
  view_all: isViewAll(u), must_change: !!u.must_change,
});

function notify(userIds, orderId, message, exceptId) {
  const ins = db.prepare('INSERT INTO notifications (user_id, order_id, message) VALUES (?,?,?)');
  [...new Set(userIds)].filter(id => id && id !== exceptId).forEach(id => ins.run(id, orderId, message));
}
const plannerIds = () => db.prepare("SELECT id FROM users WHERE role='planner' AND active=1").all().map(r => r.id);
const unitUserIds = unitId => db.prepare("SELECT id FROM users WHERE unit_id=? AND active=1").all(unitId).map(r => r.id);

function leadTime(category, forecast) {
  return db.prepare('SELECT * FROM lead_times WHERE category=? AND forecast=?').get(category, forecast ? 1 : 0);
}

// Tính toán tiến độ hiển thị
function decorate(o) {
  const t = today();
  o.status_label = STATUSES[o.status];
  o.category_label = CATEGORIES[o.category];
  if (ACTIVE_HP.includes(o.status) && o.hp_order_date && o.eta_max) {
    const target = o.hp_eta || o.eta_max;
    const span = Math.max(1, diffDays(o.eta_max, o.hp_order_date));
    o.progress = Math.min(99, Math.max(2, Math.round(diffDays(t, o.hp_order_date) / span * 100)));
    o.days_left = diffDays(target, t);
    o.overdue = o.days_left < 0;
    o.due_soon = !o.overdue && o.days_left <= 14;
    o.target_date = target;
  } else if (o.status === 'received') {
    o.progress = 100;
    const target = o.hp_eta || o.eta_max;
    o.on_time = target ? o.received_date <= target : null;
    o.target_date = target;
    o.actual_weeks = o.hp_order_date && o.received_date ? +(diffDays(o.received_date, o.hp_order_date) / 7).toFixed(1) : null;
  } else {
    o.progress = ({ draft: 0, pending: 5, returned: 5, approved: 10 })[o.status] ?? 0;
    if (!['rejected', 'cancelled'].includes(o.status)) {
      const lt = leadTime(o.category, o.forecast);
      if (lt) { o.proj_eta_min = addDays(t, lt.min_weeks * 7); o.proj_eta_max = addDays(t, lt.max_weeks * 7); }
    }
    if (o.status === 'pending' && o.submitted_at) o.waiting_days = diffDays(t, o.submitted_at.slice(0, 10));
  }
  if (o.requested_date && !['received', 'rejected', 'cancelled'].includes(o.status)) {
    const eta = o.target_date || o.proj_eta_max;
    o.at_risk = eta ? eta > o.requested_date : false;
  }
  return o;
}

const ORDER_SELECT = `SELECT o.*, u.code unit_code, u.name unit_name, cu.full_name creator_name,
  ap.full_name approver_name,
  (SELECT COUNT(*) FROM order_lines l WHERE l.order_id=o.id) line_count,
  (SELECT COALESCE(SUM(qty),0) FROM order_lines l WHERE l.order_id=o.id) total_qty,
  (SELECT COUNT(*) FROM attachments a WHERE a.order_id=o.id) doc_count
  FROM orders o JOIN units u ON u.id=o.unit_id JOIN users cu ON cu.id=o.created_by LEFT JOIN users ap ON ap.id=o.approved_by`;

function scopedOrders(user, f = {}) {
  const where = []; const params = [];
  if (!isViewAll(user)) { where.push('o.unit_id = ?'); params.push(user.unit_id || -1); }
  else if (f.unit) { where.push('o.unit_id = ?'); params.push(Number(f.unit)); }
  if (f.status) {
    const list = String(f.status).split(',').filter(s => STATUSES[s]);
    if (list.length) { where.push(`o.status IN (${list.map(() => '?').join(',')})`); params.push(...list); }
  }
  if (f.category && CATEGORIES[f.category]) { where.push('o.category = ?'); params.push(f.category); }
  if (f.from && isDate(f.from)) { where.push('date(o.created_at) >= ?'); params.push(f.from); }
  if (f.to && isDate(f.to)) { where.push('date(o.created_at) <= ?'); params.push(f.to); }
  if (f.q) {
    where.push(`(o.code LIKE ? OR o.title LIKE ? OR o.project LIKE ? OR o.hp_po LIKE ? OR o.hp_so LIKE ? OR o.deal_id LIKE ?
      OR EXISTS (SELECT 1 FROM order_lines l WHERE l.order_id=o.id AND (l.sku LIKE ? OR l.description LIKE ?)))`);
    const q = `%${f.q}%`; params.push(q, q, q, q, q, q, q, q);
  }
  const sql = `${ORDER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC`;
  let rows = db.prepare(sql).all(...params).map(r => decorate({ ...r }));
  if (f.flag === 'overdue') rows = rows.filter(r => r.overdue);
  if (f.flag === 'due_soon') rows = rows.filter(r => r.due_soon);
  if (f.flag === 'at_risk') rows = rows.filter(r => r.at_risk);
  return rows;
}

function loadOrder(user, id) {
  const o = db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(Number(id));
  if (!o) fail(404, 'Không tìm thấy đơn hàng');
  if (!isViewAll(user) && o.unit_id !== user.unit_id) fail(403, 'Bạn không có quyền xem đơn hàng của đơn vị khác');
  return decorate({ ...o });
}

function permissionsFor(user, o) {
  const own = isUnitRole(user) && user.unit_id === o.unit_id;
  const plan = isPlanner(user);
  const operate = own || plan;
  const s = o.status;
  return {
    edit: operate && ['draft', 'returned'].includes(s),
    delete: operate && s === 'draft',
    submit: operate && ['draft', 'returned'].includes(s),
    approve: plan && s === 'pending',
    return: plan && s === 'pending',
    reject: plan && s === 'pending',
    place_hp: operate && s === 'approved',
    hp_confirm: operate && s === 'ordered',
    ship: operate && ['ordered', 'confirmed'].includes(s),
    receive: operate && ACTIVE_HP.includes(s),
    update_eta: operate && ACTIVE_HP.includes(s),
    cancel: (operate && ['draft', 'pending', 'returned', 'approved'].includes(s) && (plan || user.role === 'unit_manager' || user.id === o.created_by))
      || (plan && ACTIVE_HP.includes(s)),
    comment: true,
    attach: operate,
  };
}

function validateOrderPayload(b, user) {
  if (!CATEGORIES[b.category]) fail(400, 'Vui lòng chọn loại hàng (Máy / Linh kiện)');
  const lines = Array.isArray(b.lines) ? b.lines : [];
  const clean = lines.map((l, i) => ({
    line_no: i + 1, sku: str(l.sku, 60), description: str(l.description, 300),
    qty: Math.floor(Number(l.qty)), unit_price: Math.max(0, Number(l.unit_price) || 0), note: str(l.note, 300),
  })).filter(l => l.sku || l.description);
  if (!clean.length) fail(400, 'Đơn hàng phải có ít nhất 1 dòng sản phẩm');
  clean.forEach(l => {
    if (!l.sku) fail(400, `Dòng ${l.line_no}: thiếu mã sản phẩm (Part Number / SKU)`);
    if (!(l.qty > 0)) fail(400, `Dòng ${l.line_no}: số lượng phải lớn hơn 0`);
  });
  if (b.requested_date && !isDate(b.requested_date)) fail(400, 'Ngày yêu cầu giao hàng không hợp lệ');
  let unitId = user.unit_id;
  if (isPlanner(user)) unitId = Number(b.unit_id) || null;
  else if (!isUnitRole(user)) fail(403, 'Vai trò của bạn không được tạo đơn hàng');
  if (!unitId || !db.prepare('SELECT 1 FROM units WHERE id=?').get(unitId)) fail(400, 'Vui lòng chọn đơn vị đặt hàng');
  return {
    unitId, lines: clean,
    fields: {
      category: b.category, forecast: b.forecast ? 1 : 0, forecast_ref: str(b.forecast_ref, 100),
      priority: ['normal', 'high', 'urgent'].includes(b.priority) ? b.priority : 'normal',
      title: str(b.title, 200), project: str(b.project, 200), deal_id: str(b.deal_id, 100),
      sold_to: str(b.sold_to, 200), ship_to: str(b.ship_to, 500), receiver: str(b.receiver, 120),
      receiver_phone: str(b.receiver_phone, 40), requested_date: b.requested_date || null,
      currency: ['USD', 'VND'].includes(b.currency) ? b.currency : 'USD', note: str(b.note, 2000),
      total: clean.reduce((s, l) => s + l.qty * l.unit_price, 0),
    },
  };
}

function saveLines(orderId, lines) {
  db.prepare('DELETE FROM order_lines WHERE order_id=?').run(orderId);
  const ins = db.prepare('INSERT INTO order_lines (order_id,line_no,sku,description,qty,unit_price,note) VALUES (?,?,?,?,?,?,?)');
  lines.forEach(l => ins.run(orderId, l.line_no, l.sku, l.description, l.qty, l.unit_price, l.note));
}

function logEvent(orderId, userId, action, from, to, comment) {
  db.prepare('INSERT INTO order_events (order_id,user_id,action,from_status,to_status,comment) VALUES (?,?,?,?,?,?)')
    .run(orderId, userId, action, from, to, comment || null);
}

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ================= Đăng nhập / Đăng ký / Google / Quên mật khẩu =================
const loginAttempts = new Map();
function createSession(res, userId) {
  const exp = Date.now() + SESSION_HOURS * 3600e3;
  const token = signSessionToken(userId, exp);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT OR REPLACE INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, userId, exp);
  send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}` });
}

function login(req, res, b) {
  const ident = String(b.username || '').trim();
  const key = `${req.socket.remoteAddress}|${ident.toLowerCase()}`;
  const a = loginAttempts.get(key) || { n: 0, until: 0 };
  if (a.until > Date.now()) fail(429, 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 5 phút.');
  const u = db.prepare('SELECT * FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?) OR phone=?').get(ident, ident, ident);
  if (!u || !u.active || !verifyPassword(String(b.password || ''), u.pass_hash)) {
    a.n++; if (a.n >= 5) { a.until = Date.now() + 5 * 60e3; a.n = 0; }
    loginAttempts.set(key, a);
    fail(401, 'Tài khoản (Tên đăng nhập / Email / SĐT) hoặc mật khẩu không đúng');
  }
  loginAttempts.delete(key);
  createSession(res, u.id);
}

function registerAccount(res, b) {
  const username = String(b.username || '').trim();
  const fullName = str(b.full_name, 120);
  const email = str(b.email, 150);
  const phone = str(b.phone, 30)?.replace(/\s+/g, '') || null;
  const unitId = Number(b.unit_id) || null;
  const password = String(b.password || '');

  if (!fullName) fail(400, 'Vui lòng nhập họ và tên');
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) fail(400, 'Tên đăng nhập từ 3–40 ký tự (chữ, số, dấu chấm, gạch ngang/dưới)');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Vui lòng nhập địa chỉ Email hợp lệ');
  if (!phone || !/^\+?\d{9,15}$/.test(phone)) fail(400, 'Vui lòng nhập số điện thoại hợp lệ (9–15 chữ số)');
  if (!unitId || !db.prepare('SELECT 1 FROM units WHERE id=? AND active=1').get(unitId)) fail(400, 'Vui lòng chọn đơn vị thành viên');
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) fail(400, 'Mật khẩu tối thiểu 8 ký tự, bao gồm cả chữ và số');

  if (db.prepare('SELECT 1 FROM users WHERE lower(username)=lower(?)').get(username)) fail(400, 'Tên đăng nhập này đã được sử dụng');
  if (db.prepare('SELECT 1 FROM users WHERE lower(email)=lower(?)').get(email)) fail(400, 'Email này đã được đăng ký cho tài khoản khác');
  if (db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone)) fail(400, 'Số điện thoại này đã được đăng ký cho tài khoản khác');

  const r = db.prepare('INSERT INTO users (username,full_name,email,phone,role,unit_id,pass_hash,must_change,active) VALUES (?,?,?,?,?,?,?,0,1)')
    .run(username, fullName, email, phone, 'unit_staff', unitId, hashPassword(password));
  createSession(res, Number(r.lastInsertRowid));
}

function googleAuth(res, b) {
  const email = str(b.email, 150)?.toLowerCase();
  const fullName = str(b.full_name, 120);
  const unitId = Number(b.unit_id) || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Email Google không hợp lệ');

  let u = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email);
  if (u) {
    if (!u.active) fail(403, 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị hệ thống.');
    return createSession(res, u.id);
  }
  // Nếu chưa có tài khoản với email Google này -> yêu cầu chọn đơn vị để khởi tạo
  if (!unitId || !db.prepare('SELECT 1 FROM units WHERE id=? AND active=1').get(unitId)) {
    return send(res, 200, { need_unit: true, email, full_name: fullName || email.split('@')[0] });
  }
  let baseUser = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 28) || 'google.user';
  if (baseUser.length < 3) baseUser += '.vps';
  let username = baseUser;
  let seq = 1;
  while (db.prepare('SELECT 1 FROM users WHERE lower(username)=lower(?)').get(username)) {
    username = `${baseUser}${seq++}`;
  }
  const randomPw = crypto.randomBytes(16).toString('hex');
  const r = db.prepare('INSERT INTO users (username,full_name,email,phone,role,unit_id,pass_hash,must_change,active) VALUES (?,?,?,?,?,?,?,0,1)')
    .run(username, fullName || username, email, str(b.phone, 30), 'unit_staff', unitId, hashPassword(randomPw));
  createSession(res, Number(r.lastInsertRowid));
}

function maskEmail(e) {
  const [name, dom] = String(e).split('@');
  if (!dom) return e;
  return (name.length <= 2 ? name[0] + '*' : name.slice(0, 2) + '***') + '@' + dom;
}
function maskPhone(p) {
  const s = String(p);
  return s.length > 5 ? s.slice(0, 3) + '****' + s.slice(-3) : s;
}

function forgotPassword(res, b) {
  const method = b.method === 'phone' ? 'phone' : 'email';
  const contact = String(b.contact || '').trim();
  if (!contact) fail(400, method === 'email' ? 'Vui lòng nhập địa chỉ Email đã đăng ký' : 'Vui lòng nhập số điện thoại đã đăng ký');

  const u = method === 'email'
    ? db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1').get(contact)
    : db.prepare('SELECT * FROM users WHERE phone=? AND active=1').get(contact.replace(/\s+/g, ''));
  if (!u) {
    fail(404, method === 'email'
      ? 'Không tìm thấy tài khoản nào gắn với địa chỉ Email này'
      : 'Không tìm thấy tài khoản nào gắn với số điện thoại này');
  }
  const otp = String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + 10 * 60e3; // 10 phút
  db.prepare('UPDATE password_resets SET used=1 WHERE user_id=? AND used=0').run(u.id);
  db.prepare('INSERT INTO password_resets (user_id,method,target,otp,expires_at) VALUES (?,?,?,?,?)')
    .run(u.id, method, contact, otp, expiresAt);

  console.log(`[OTP KHÔI PHỤC MẬT KHẨU] User=${u.username} (${method}: ${contact}) -> OTP: ${otp}`);
  send(res, 200, {
    ok: true,
    username: u.username,
    masked: method === 'email' ? maskEmail(u.email) : maskPhone(u.phone),
    demo_otp: otp, // Hiển thị kèm trên thông báo dev/nội bộ khi chưa đấu nối cổng SMTP/SMS bên ngoài
    expires_in_minutes: 10,
  });
}

function resetPassword(res, b) {
  const method = b.method === 'phone' ? 'phone' : 'email';
  const contact = String(b.contact || '').trim();
  const otp = String(b.otp || '').trim();
  const np = String(b.new_password || '');

  if (!/^\d{6}$/.test(otp)) fail(400, 'Mã xác thực OTP gồm 6 chữ số');
  if (np.length < 8 || !/[A-Za-z]/.test(np) || !/\d/.test(np)) fail(400, 'Mật khẩu mới tối thiểu 8 ký tự, gồm cả chữ và số');

  const u = method === 'email'
    ? db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1').get(contact)
    : db.prepare('SELECT * FROM users WHERE phone=? AND active=1').get(contact.replace(/\s+/g, ''));
  if (!u) fail(404, 'Không tìm thấy tài khoản');

  const rec = db.prepare('SELECT * FROM password_resets WHERE user_id=? AND otp=? AND used=0 ORDER BY id DESC LIMIT 1').get(u.id, otp);
  if (!rec || rec.expires_at < Date.now()) fail(400, 'Mã OTP không chính xác hoặc đã hết hạn (10 phút)');

  tx(() => {
    db.prepare('UPDATE password_resets SET used=1 WHERE id=?').run(rec.id);
    db.prepare('UPDATE users SET pass_hash=?, must_change=0 WHERE id=?').run(hashPassword(np), u.id);
  });
  createSession(res, u.id);
}

// ================= Dashboard =================
function dashboard(user, q) {
  const rows = scopedOrders(user, { unit: q.unit });
  const t = today(); const month = t.slice(0, 7);
  const by = s => rows.filter(r => r.status === s).length;
  const active = rows.filter(r => ACTIVE_HP.includes(r.status));
  const received = rows.filter(r => r.status === 'received');
  const onTime = received.filter(r => r.on_time === true).length;
  const statusCounts = Object.keys(STATUSES).map(k => ({ key: k, label: STATUSES[k], count: by(k) }));
  const units = db.prepare('SELECT * FROM units WHERE active=1 ORDER BY code').all();
  const perUnit = isViewAll(user) ? units.map(u => {
    const r = rows.filter(o => o.unit_id === u.id);
    const rec = r.filter(o => o.status === 'received');
    return {
      unit_id: u.id, code: u.code, name: u.name, total: r.length,
      pending: r.filter(o => ['pending', 'returned', 'approved'].includes(o.status)).length,
      active: r.filter(o => ACTIVE_HP.includes(o.status)).length,
      overdue: r.filter(o => o.overdue).length,
      received: rec.length,
      on_time_rate: rec.length ? Math.round(rec.filter(o => o.on_time).length / rec.length * 100) : null,
      value: r.filter(o => !['rejected', 'cancelled', 'draft'].includes(o.status) && o.currency === 'USD').reduce((s, o) => s + o.total, 0),
    };
  }) : null;
  // 6 tháng gần nhất
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
    const m = d.toISOString().slice(0, 7);
    months.push({
      month: m,
      created: rows.filter(r => r.created_at.slice(0, 7) === m && r.status !== 'draft').length,
      received: rows.filter(r => r.received_date && r.received_date.slice(0, 7) === m).length,
    });
  }
  const pick = o => ({ id: o.id, code: o.code, title: o.title, unit_code: o.unit_code, status: o.status, status_label: o.status_label,
    category: o.category, target_date: o.target_date, days_left: o.days_left, progress: o.progress, overdue: o.overdue,
    waiting_days: o.waiting_days, hp_po: o.hp_po, priority: o.priority, created_at: o.created_at });
  return {
    kpi: {
      total: rows.filter(r => r.status !== 'draft').length,
      waiting_approval: by('pending'),
      returned: by('returned'),
      approved_not_placed: by('approved'),
      in_progress: active.length,
      overdue: active.filter(r => r.overdue).length,
      due_soon: active.filter(r => r.due_soon).length,
      at_risk: rows.filter(r => r.at_risk).length,
      received_month: received.filter(r => (r.received_date || '').slice(0, 7) === month).length,
      on_time_rate: received.length ? Math.round(onTime / received.length * 100) : null,
      avg_weeks: received.length ? +(received.reduce((s, r) => s + (r.actual_weeks || 0), 0) / received.length).toFixed(1) : null,
      value_open: rows.filter(r => ['pending', 'approved', ...ACTIVE_HP].includes(r.status) && r.currency === 'USD').reduce((s, r) => s + r.total, 0),
    },
    statusCounts, perUnit, months,
    upcoming: active.filter(r => !r.overdue).sort((a, b) => a.days_left - b.days_left).slice(0, 8).map(pick),
    overdueList: active.filter(r => r.overdue).sort((a, b) => a.days_left - b.days_left).slice(0, 8).map(pick),
    waitingList: rows.filter(r => ['pending', 'approved', 'returned'].includes(r.status)).slice(0, 8).map(pick),
  };
}

// ================= Hành động quy trình =================
function doAction(user, id, b) {
  const o = loadOrder(user, id);
  const perm = permissionsFor(user, o);
  const action = b.action;
  const comment = str(b.comment, 2000);
  if (!perm[action]) fail(403, 'Bạn không thể thực hiện thao tác này ở trạng thái hiện tại của đơn hàng');
  const set = {}; let to = o.status; let msg = '';
  switch (action) {
    case 'submit':
      to = 'pending'; set.submitted_at = nowStr();
      msg = `Đơn ${o.code} (${o.unit_code}) được gửi chờ duyệt`;
      break;
    case 'approve':
      to = 'approved'; set.approved_by = user.id; set.approved_at = nowStr();
      msg = `Đơn ${o.code} đã được Kế hoạch duyệt – có thể đặt trên hệ thống HP`;
      break;
    case 'return':
      if (!comment) fail(400, 'Vui lòng ghi rõ nội dung cần bổ sung/chỉnh sửa');
      to = 'returned'; msg = `Đơn ${o.code} bị trả lại yêu cầu bổ sung: ${comment}`;
      break;
    case 'reject':
      if (!comment) fail(400, 'Vui lòng ghi rõ lý do từ chối');
      to = 'rejected'; msg = `Đơn ${o.code} bị từ chối: ${comment}`;
      break;
    case 'place_hp': {
      const po = str(b.hp_po, 60); const d = b.hp_order_date;
      if (!po) fail(400, 'Vui lòng nhập số PO đã tạo trên HP Partner Portal');
      if (!isDate(d)) fail(400, 'Vui lòng nhập ngày đặt hàng trên HP');
      if (d > today()) fail(400, 'Ngày đặt hàng không được ở tương lai');
      const lt = leadTime(o.category, o.forecast);
      Object.assign(set, { hp_po: po, hp_order_date: d, lt_min: lt.min_weeks, lt_max: lt.max_weeks,
        eta_min: addDays(d, lt.min_weeks * 7), eta_max: addDays(d, lt.max_weeks * 7) });
      to = 'ordered'; msg = `Đơn ${o.code} đã đặt trên HP (PO ${po}). Dự kiến về ${set.eta_min} → ${set.eta_max}`;
      break;
    }
    case 'hp_confirm': {
      const so = str(b.hp_so, 60);
      if (!so) fail(400, 'Vui lòng nhập số Sales Order HP xác nhận');
      if (b.hp_eta && !isDate(b.hp_eta)) fail(400, 'Ngày ETA không hợp lệ');
      Object.assign(set, { hp_so: so, hp_confirm_date: isDate(b.hp_confirm_date) ? b.hp_confirm_date : today(), hp_eta: b.hp_eta || o.hp_eta });
      to = 'confirmed'; msg = `HP đã xác nhận đơn ${o.code} (SO ${so})`;
      break;
    }
    case 'ship':
      if (!isDate(b.ship_date)) fail(400, 'Vui lòng nhập ngày hàng xuất kho');
      Object.assign(set, { ship_date: b.ship_date, tracking: str(b.tracking, 200) || o.tracking });
      if (b.hp_eta && isDate(b.hp_eta)) set.hp_eta = b.hp_eta;
      to = 'shipping'; msg = `Đơn ${o.code} đang vận chuyển`;
      break;
    case 'receive':
      if (!isDate(b.received_date)) fail(400, 'Vui lòng nhập ngày hàng về kho thực tế');
      if (b.received_date < o.hp_order_date) fail(400, 'Ngày về kho không thể trước ngày đặt hàng');
      set.received_date = b.received_date;
      to = 'received'; msg = `Đơn ${o.code} đã về kho ngày ${b.received_date}`;
      break;
    case 'update_eta':
      if (!isDate(b.hp_eta)) fail(400, 'Vui lòng nhập ngày ETA mới');
      set.hp_eta = b.hp_eta; if (b.tracking) set.tracking = str(b.tracking, 200);
      msg = `Đơn ${o.code} cập nhật ETA mới: ${b.hp_eta}`;
      break;
    case 'cancel':
      if (!comment) fail(400, 'Vui lòng ghi rõ lý do hủy đơn');
      to = 'cancelled'; msg = `Đơn ${o.code} đã bị hủy: ${comment}`;
      break;
    case 'comment':
      if (!comment) fail(400, 'Nội dung trao đổi trống');
      msg = `${user.full_name} bình luận trên đơn ${o.code}: ${comment.slice(0, 120)}`;
      break;
    default: fail(400, 'Thao tác không hợp lệ');
  }
  tx(() => {
    set.status = to; set.updated_at = nowStr();
    const keys = Object.keys(set);
    db.prepare(`UPDATE orders SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k => set[k]), o.id);
    logEvent(o.id, user.id, action, o.status, to, comment || (action === 'update_eta' ? `ETA mới: ${set.hp_eta}` : null));
    const targets = [o.created_by, ...plannerIds()];
    if (['approve', 'return', 'reject', 'cancel', 'receive'].includes(action)) targets.push(...unitUserIds(o.unit_id).filter(uid => {
      const r = db.prepare('SELECT role FROM users WHERE id=?').get(uid); return r && r.role === 'unit_manager';
    }));
    notify(targets, o.id, msg, user.id);
  });
  return loadOrder(user, o.id);
}

// ================= Router =================
async function api(req, res, url) {
  const p = url.pathname; const m = req.method; const q = Object.fromEntries(url.searchParams);
  if (p === '/api/login' && m === 'POST') return login(req, res, await readBody(req));
  if (p === '/api/register' && m === 'POST') return registerAccount(res, await readBody(req));
  if (p === '/api/auth/google' && m === 'POST') return googleAuth(res, await readBody(req));
  if (p === '/api/password/forgot' && m === 'POST') return forgotPassword(res, await readBody(req));
  if (p === '/api/password/reset' && m === 'POST') return resetPassword(res, await readBody(req));
  if (p === '/api/public/units' && m === 'GET') {
    return send(res, 200, db.prepare('SELECT id, code, name FROM units WHERE active=1 ORDER BY id').all());
  }
  const user = getUser(req);
  if (!user) fail(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');

  if (p === '/api/logout' && m === 'POST') {
    db.prepare('DELETE FROM sessions WHERE token=?').run(parseCookies(req).sid);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
  }
  if (p === '/api/me' && m === 'GET') return send(res, 200, publicUser(user));
  if (p === '/api/me/password' && m === 'POST') {
    const b = await readBody(req);
    if (!verifyPassword(String(b.old_password || ''), user.pass_hash)) fail(400, 'Mật khẩu hiện tại không đúng');
    const np = String(b.new_password || '');
    if (np.length < 8 || !/[A-Za-z]/.test(np) || !/\d/.test(np)) fail(400, 'Mật khẩu mới tối thiểu 8 ký tự, gồm cả chữ và số');
    db.prepare('UPDATE users SET pass_hash=?, must_change=0 WHERE id=?').run(hashPassword(np), user.id);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/meta' && m === 'GET') {
    return send(res, 200, {
      roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.label])),
      statuses: STATUSES, categories: CATEGORIES, doc_types: DOC_TYPES,
      units: db.prepare('SELECT * FROM units WHERE active=1 ORDER BY code').all()
        .filter(u => isViewAll(user) || u.id === user.unit_id),
      lead_times: db.prepare('SELECT * FROM lead_times ORDER BY category, forecast DESC').all(),
      today: today(),
    });
  }
  if (p === '/api/dashboard' && m === 'GET') return send(res, 200, dashboard(user, q));

  // ---- Đơn hàng ----
  if (p === '/api/orders' && m === 'GET') return send(res, 200, scopedOrders(user, q));
  if (p === '/api/orders/export' && m === 'GET') {
    const rows = scopedOrders(user, q);
    const cols = [['code', 'Mã đơn'], ['unit_code', 'Đơn vị'], ['title', 'Tiêu đề'], ['category_label', 'Loại hàng'],
      ['forecast', 'Có dự báo'], ['status_label', 'Trạng thái'], ['project', 'Dự án/KH'], ['deal_id', 'Deal/Bid ID'],
      ['total_qty', 'Tổng SL'], ['total', 'Giá trị'], ['currency', 'Tiền tệ'], ['requested_date', 'Ngày KH cần'],
      ['created_at', 'Ngày tạo'], ['approved_at', 'Ngày duyệt'], ['hp_po', 'PO HP'], ['hp_so', 'SO HP'],
      ['hp_order_date', 'Ngày đặt HP'], ['eta_min', 'ETA sớm nhất'], ['eta_max', 'ETA muộn nhất'], ['hp_eta', 'ETA hãng'],
      ['ship_date', 'Ngày xuất'], ['received_date', 'Ngày về kho'], ['days_left', 'Còn lại (ngày)'], ['creator_name', 'Người tạo']];
    const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const csv = '\uFEFF' + [cols.map(c => c[1]).join(','), ...rows.map(r => cols.map(([k]) =>
      esc(k === 'forecast' ? (r.forecast ? 'Có' : 'Không') : r[k])).join(','))].join('\r\n');
    return send(res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="don-hang-vps-${today()}.csv"` });
  }
  if (p === '/api/orders' && m === 'POST') {
    const b = await readBody(req);
    const { unitId, lines, fields } = validateOrderPayload(b, user);
    const unit = db.prepare('SELECT code FROM units WHERE id=?').get(unitId);
    const prefix = `PO-${unit.code}-${today().slice(2, 4)}${today().slice(5, 7)}-`;
    const id = tx(() => {
      const last = db.prepare('SELECT code FROM orders WHERE code LIKE ? ORDER BY code DESC LIMIT 1').get(prefix + '%');
      const seq = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
      const code = prefix + String(seq).padStart(4, '0');
      const keys = Object.keys(fields);
      const r = db.prepare(`INSERT INTO orders (code,unit_id,created_by,${keys.join(',')}) VALUES (?,?,?,${keys.map(() => '?').join(',')})`)
        .run(code, unitId, user.id, ...keys.map(k => fields[k]));
      const oid = Number(r.lastInsertRowid);
      saveLines(oid, lines);
      logEvent(oid, user.id, 'create', null, 'draft', null);
      return oid;
    });
    let o = loadOrder(user, id);
    if (b.submit) o = doAction(user, id, { action: 'submit' });
    return send(res, 201, o);
  }
  let mm;
  if ((mm = p.match(/^\/api\/orders\/(\d+)$/))) {
    const id = Number(mm[1]);
    if (m === 'GET') {
      const o = loadOrder(user, id);
      o.lines = db.prepare('SELECT * FROM order_lines WHERE order_id=? ORDER BY line_no').all(id);
      o.events = db.prepare(`SELECT e.*, u.full_name user_name, u.role user_role FROM order_events e
        LEFT JOIN users u ON u.id=e.user_id WHERE order_id=? ORDER BY e.id`).all(id);
      o.attachments = db.prepare(`SELECT a.id,a.doc_type,a.doc_no,a.doc_date,a.note,a.file_name,a.mime,a.size,a.created_at,a.user_id,u.full_name user_name FROM attachments a
        LEFT JOIN users u ON u.id=a.user_id WHERE order_id=? ORDER BY a.id DESC`).all(id);
      o.permissions = permissionsFor(user, o);
      return send(res, 200, o);
    }
    if (m === 'PUT') {
      const o = loadOrder(user, id);
      if (!permissionsFor(user, o).edit) fail(403, 'Chỉ chỉnh sửa được đơn ở trạng thái Nháp hoặc Yêu cầu bổ sung');
      const b = await readBody(req);
      const { unitId, lines, fields } = validateOrderPayload({ ...b, unit_id: b.unit_id || o.unit_id }, user);
      tx(() => {
        fields.unit_id = isPlanner(user) ? unitId : o.unit_id; fields.updated_at = nowStr();
        const keys = Object.keys(fields);
        db.prepare(`UPDATE orders SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k => fields[k]), id);
        saveLines(id, lines);
        logEvent(id, user.id, 'edit', o.status, o.status, null);
      });
      let r = loadOrder(user, id);
      if (b.submit) r = doAction(user, id, { action: 'submit' });
      return send(res, 200, r);
    }
    if (m === 'DELETE') {
      const o = loadOrder(user, id);
      if (!permissionsFor(user, o).delete) fail(403, 'Chỉ xóa được đơn nháp');
      db.prepare('SELECT stored FROM attachments WHERE order_id=?').all(id).forEach(a => fs.rm(path.join(UPLOAD_DIR, a.stored), () => {}));
      db.prepare('DELETE FROM orders WHERE id=?').run(id);
      return send(res, 200, { ok: true });
    }
  }
  if ((mm = p.match(/^\/api\/orders\/(\d+)\/action$/)) && m === 'POST') {
    return send(res, 200, doAction(user, mm[1], await readBody(req)));
  }
  if ((mm = p.match(/^\/api\/orders\/(\d+)\/attachments$/)) && m === 'POST') {
    const o = loadOrder(user, mm[1]);
    if (!permissionsFor(user, o).attach) fail(403, 'Không thể lưu chứng từ cho đơn này');
    const b = await readBody(req);
    const name = str(b.file_name, 200); if (!name || !b.data) fail(400, 'Vui lòng chọn tệp chứng từ');
    const docType = DOC_TYPES[b.doc_type] ? b.doc_type : 'other';
    const docNo = str(b.doc_no, 100);
    const docDate = isDate(b.doc_date) ? b.doc_date : null;
    const note = str(b.note, 500);
    const buf = Buffer.from(String(b.data), 'base64');
    if (buf.length > 15 * 1024 * 1024) fail(413, 'Tệp chứng từ tối đa 15MB');
    const stored = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);
    db.prepare('INSERT INTO attachments (order_id,user_id,doc_type,doc_no,doc_date,note,file_name,mime,size,stored) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(o.id, user.id, docType, docNo, docDate, note, name, str(b.mime, 100), buf.length, stored);
    const label = `${DOC_TYPES[docType]}${docNo ? ` (${docNo})` : ''} – ${name}`;
    logEvent(o.id, user.id, 'attach', o.status, o.status, label);
    return send(res, 201, { ok: true });
  }
  if ((mm = p.match(/^\/api\/attachments\/(\d+)$/))) {
    const a = db.prepare('SELECT * FROM attachments WHERE id=?').get(Number(mm[1]));
    if (!a) fail(404, 'Không tìm thấy chứng từ');
    const o = loadOrder(user, a.order_id); // kiểm tra quyền xem theo đơn vị
    if (m === 'GET') {
      const buf = fs.readFileSync(path.join(UPLOAD_DIR, a.stored));
      const inline = q.inline === '1';
      const safeMime = inline && /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)$/i.test(a.mime || '')
        ? a.mime : 'application/octet-stream';
      return send(res, 200, buf, {
        'Content-Type': safeMime,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.file_name)}`,
      });
    }
    if (m === 'PUT') {
      if (!permissionsFor(user, o).attach) fail(403, 'Không có quyền cập nhật chứng từ');
      const b = await readBody(req);
      const docType = DOC_TYPES[b.doc_type] ? b.doc_type : (a.doc_type || 'other');
      const docNo = str(b.doc_no, 100);
      const docDate = isDate(b.doc_date) ? b.doc_date : null;
      const note = str(b.note, 500);
      db.prepare('UPDATE attachments SET doc_type=?, doc_no=?, doc_date=?, note=? WHERE id=?')
        .run(docType, docNo, docDate, note, a.id);
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      if (!permissionsFor(user, o).attach) fail(403, 'Không có quyền xóa chứng từ');
      fs.rm(path.join(UPLOAD_DIR, a.stored), () => {});
      db.prepare('DELETE FROM attachments WHERE id=?').run(a.id);
      logEvent(o.id, user.id, 'attach', o.status, o.status, `Đã xóa chứng từ: ${a.file_name}`);
      return send(res, 200, { ok: true });
    }
  }

  // ---- Dự báo nhu cầu (Forecast) ----
  if (p === '/api/forecasts' && m === 'GET') {
    const where = []; const params = [];
    if (!isViewAll(user)) { where.push('f.unit_id=?'); params.push(user.unit_id || -1); }
    else if (q.unit) { where.push('f.unit_id=?'); params.push(Number(q.unit)); }
    if (q.period) { where.push('f.period=?'); params.push(q.period); }
    return send(res, 200, db.prepare(`SELECT f.*, u.code unit_code, us.full_name creator_name FROM forecasts f
      JOIN units u ON u.id=f.unit_id LEFT JOIN users us ON us.id=f.created_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY f.period DESC, f.id DESC`).all(...params));
  }
  if (p === '/api/forecasts' && m === 'POST') {
    const b = await readBody(req);
    let unitId = user.unit_id;
    if (isPlanner(user)) unitId = Number(b.unit_id);
    else if (!isUnitRole(user)) fail(403, 'Vai trò của bạn không được gửi dự báo');
    if (!unitId) fail(400, 'Vui lòng chọn đơn vị');
    if (!/^\d{4}-\d{2}$/.test(b.period || '')) fail(400, 'Vui lòng chọn tháng cần hàng');
    if (!CATEGORIES[b.category]) fail(400, 'Vui lòng chọn loại hàng');
    const rows = (Array.isArray(b.lines) ? b.lines : []).filter(l => l.sku);
    if (!rows.length) fail(400, 'Cần ít nhất 1 dòng dự báo');
    const ins = db.prepare('INSERT INTO forecasts (unit_id,period,category,sku,description,qty,note,created_by) VALUES (?,?,?,?,?,?,?,?)');
    tx(() => rows.forEach(l => {
      const qty = Math.floor(Number(l.qty)); if (!(qty > 0)) fail(400, `Số lượng dự báo cho ${l.sku} không hợp lệ`);
      ins.run(unitId, b.period, b.category, str(l.sku, 60), str(l.description, 300), qty, str(l.note, 300), user.id);
    }));
    notify(plannerIds(), null, `${user.unit_code || 'Kế hoạch'} gửi dự báo nhu cầu tháng ${b.period} (${rows.length} dòng)`, user.id);
    return send(res, 201, { ok: true });
  }
  if ((mm = p.match(/^\/api\/forecasts\/(\d+)$/)) && m === 'DELETE') {
    const f = db.prepare('SELECT * FROM forecasts WHERE id=?').get(Number(mm[1]));
    if (!f) fail(404, 'Không tìm thấy');
    if (!(isPlanner(user) || (isUnitRole(user) && f.unit_id === user.unit_id))) fail(403, 'Không có quyền');
    db.prepare('DELETE FROM forecasts WHERE id=?').run(f.id);
    return send(res, 200, { ok: true });
  }

  // ---- Thông báo ----
  if (p === '/api/notifications' && m === 'GET') {
    return send(res, 200, {
      unread: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0').get(user.id).c,
      items: db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30').all(user.id),
    });
  }
  if (p === '/api/notifications/read' && m === 'POST') {
    const b = await readBody(req);
    if (b.id) db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(Number(b.id), user.id);
    else db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(user.id);
    return send(res, 200, { ok: true });
  }

  // ---- Quản trị ----
  if (p.startsWith('/api/admin/')) {
    if (user.role !== 'admin') fail(403, 'Chỉ Quản trị hệ thống được truy cập');
    if (p === '/api/admin/users' && m === 'GET') {
      return send(res, 200, db.prepare(`SELECT u.id,u.username,u.full_name,u.email,u.phone,u.role,u.unit_id,u.active,u.created_at,
        un.code unit_code FROM users u LEFT JOIN units un ON un.id=u.unit_id ORDER BY u.role, un.code, u.username`).all());
    }
    if (p === '/api/admin/users' && m === 'POST') {
      const b = await readBody(req); validateUser(b, true);
      const r = db.prepare('INSERT INTO users (username,full_name,email,phone,role,unit_id,pass_hash) VALUES (?,?,?,?,?,?,?)')
        .run(b.username.trim(), b.full_name.trim(), str(b.email), str(b.phone), b.role, unitForRole(b), hashPassword(b.password));
      return send(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if ((mm = p.match(/^\/api\/admin\/users\/(\d+)$/)) && m === 'PUT') {
      const b = await readBody(req); validateUser(b, false);
      const id = Number(mm[1]);
      if (id === user.id && (b.role !== 'admin' || !b.active)) fail(400, 'Không thể tự hạ quyền hoặc khóa tài khoản của chính mình');
      db.prepare('UPDATE users SET full_name=?,email=?,phone=?,role=?,unit_id=?,active=? WHERE id=?')
        .run(b.full_name.trim(), str(b.email), str(b.phone), b.role, unitForRole(b), b.active ? 1 : 0, id);
      if (b.password) db.prepare('UPDATE users SET pass_hash=?, must_change=1 WHERE id=?').run(hashPassword(b.password), id);
      if (!b.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/admin/units' && m === 'GET') return send(res, 200, db.prepare('SELECT * FROM units ORDER BY code').all());
    if ((mm = p.match(/^\/api\/admin\/units\/(\d+)$/)) && m === 'PUT') {
      const b = await readBody(req);
      if (!str(b.name)) fail(400, 'Tên đơn vị không được trống');
      db.prepare('UPDATE units SET name=?,hp_account=?,ship_to=?,contact=? WHERE id=?')
        .run(str(b.name, 200), str(b.hp_account, 100), str(b.ship_to, 500), str(b.contact, 200), Number(mm[1]));
      return send(res, 200, { ok: true });
    }
    if (p === '/api/admin/lead-times' && m === 'PUT') {
      const b = await readBody(req);
      const up = db.prepare('UPDATE lead_times SET origin=?, min_weeks=?, max_weeks=? WHERE category=? AND forecast=?');
      tx(() => (b.items || []).forEach(it => {
        const mn = Number(it.min_weeks), mx = Number(it.max_weeks);
        if (!(mn > 0 && mx >= mn)) fail(400, 'Số tuần không hợp lệ (tối thiểu > 0 và tối đa ≥ tối thiểu)');
        up.run(str(it.origin, 100), mn, mx, it.category, it.forecast ? 1 : 0);
      }));
      return send(res, 200, { ok: true });
    }
  }
  fail(404, 'API không tồn tại');
}

function validateUser(b, isNew) {
  if (isNew && !/^[a-zA-Z0-9._-]{3,40}$/.test(b.username || '')) fail(400, 'Tên đăng nhập 3–40 ký tự, chỉ gồm chữ, số, . _ -');
  if (isNew && db.prepare('SELECT 1 FROM users WHERE lower(username)=lower(?)').get(b.username)) fail(400, 'Tên đăng nhập đã tồn tại');
  if (!str(b.full_name)) fail(400, 'Họ tên không được trống');
  if (!ROLES[b.role]) fail(400, 'Vai trò không hợp lệ');
  if ((b.role === 'unit_manager' || b.role === 'unit_staff') && !Number(b.unit_id)) fail(400, 'Người dùng đơn vị phải gắn với 1 đơn vị');
  if ((isNew || b.password) && String(b.password || '').length < 8) fail(400, 'Mật khẩu tối thiểu 8 ký tự');
}
const unitForRole = b => (b.role === 'unit_manager' || b.role === 'unit_staff') ? Number(b.unit_id) : null;

// ================= Static =================
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.zip': 'application/zip' };
function serveStatic(res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function handleHttp(req, res) {
  const url = new URL(req.url, 'http://localhost');
  Promise.resolve().then(async () => {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(res, url.pathname);
  }).catch(e => {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Lỗi hệ thống, vui lòng thử lại' });
  });
}

if (!process.env.VERCEL && require.main === module) {
  const server = http.createServer(handleHttp);
  server.listen(PORT, '0.0.0.0', () => console.log(`VPS Order Hub đang chạy tại http://localhost:${PORT} (và http://127.0.0.1:${PORT})`));

  if (PORT !== 80) {
    const server80 = http.createServer(handleHttp);
    server80.on('error', () => { /* Cổng 80 đang bận thì bỏ qua, vẫn dùng cổng 3000 */ });
    server80.listen(80, '0.0.0.0', () => console.log('VPS Order Hub cũng đang mở tại http://localhost (cổng 80)'));
  }
}

module.exports = handleHttp;
