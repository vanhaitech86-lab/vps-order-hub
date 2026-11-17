'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const os = require('os');
const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), 'vps-order-data') : path.join(__dirname, '..', 'data'));
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'vps-order.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  hp_account TEXT,            -- Sold-to / mã đối tác HP
  ship_to TEXT,               -- Địa chỉ nhận hàng mặc định
  contact TEXT,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL,          -- admin | ceo | gd | planner | unit_manager | unit_staff
  unit_id INTEGER REFERENCES units(id),
  pass_hash TEXT NOT NULL,
  must_change INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lead_times (
  category TEXT NOT NULL,      -- machine | supplies
  forecast INTEGER NOT NULL,   -- 1 | 0
  origin TEXT NOT NULL,
  min_weeks INTEGER NOT NULL,
  max_weeks INTEGER NOT NULL,
  PRIMARY KEY (category, forecast)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  category TEXT NOT NULL,              -- machine | supplies
  forecast INTEGER NOT NULL DEFAULT 0,
  forecast_ref TEXT,
  priority TEXT DEFAULT 'normal',      -- normal | high | urgent
  title TEXT,
  project TEXT,                        -- Dự án / khách hàng cuối
  deal_id TEXT,                        -- HP Deal / Bid / OPG
  sold_to TEXT,
  ship_to TEXT,
  receiver TEXT,
  receiver_phone TEXT,
  requested_date TEXT,                 -- ngày khách cần hàng
  currency TEXT DEFAULT 'USD',
  total REAL DEFAULT 0,
  note TEXT,
  -- Thông tin trên hệ thống HP
  hp_po TEXT,
  hp_so TEXT,
  hp_order_date TEXT,
  hp_confirm_date TEXT,
  ship_date TEXT,
  tracking TEXT,
  received_date TEXT,
  lt_min INTEGER,
  lt_max INTEGER,
  eta_min TEXT,
  eta_max TEXT,
  hp_eta TEXT,                         -- ETA hãng xác nhận (nếu có)
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  submitted_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_orders_unit ON orders(unit_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_no INTEGER,
  sku TEXT NOT NULL,
  description TEXT,
  qty INTEGER NOT NULL,
  unit_price REAL DEFAULT 0,
  note TEXT
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  doc_type TEXT DEFAULT 'other',
  doc_no TEXT,
  doc_date TEXT,
  note TEXT,
  file_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  stored TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  period TEXT NOT NULL,                -- YYYY-MM (tháng cần hàng)
  category TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  qty INTEGER NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL,        -- email | phone
  target TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

// Đảm bảo các cột chứng từ tồn tại trên DB đã khởi tạo trước đó
for (const [col, def] of [['doc_type', "TEXT DEFAULT 'other'"], ['doc_no', 'TEXT'], ['doc_date', 'TEXT'], ['note', 'TEXT']]) {
  try { db.exec(`ALTER TABLE attachments ADD COLUMN ${col} ${def}`); } catch { /* cột đã tồn tại */ }
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function verifyPassword(pw, stored) {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const calc = crypto.scryptSync(pw, salt, 64);
  const buf = Buffer.from(h, 'hex');
  return buf.length === calc.length && crypto.timingSafeEqual(buf, calc);
}

// ---------- Seed dữ liệu ban đầu ----------
function seed() {
  const hasUnits = db.prepare('SELECT COUNT(*) c FROM units').get().c;
  if (hasUnits) return;
  const insUnit = db.prepare('INSERT INTO units (code,name,hp_account,ship_to,contact) VALUES (?,?,?,?,?)');
  const units = [
    ['THH', 'Công ty Tân Hồng Hà', 'HP-THH-01', 'Kho Công ty Tân Hồng Hà', ''],
    ['VIET', 'Công ty Việt', 'HP-VIET-02', 'Kho Công ty Việt', ''],
    ['XESCO', 'Công ty Xesco', 'HP-XESCO-03', 'Kho Công ty Xesco', ''],
    ['VPSM', 'Công ty VPSM', 'HP-VPSM-04', 'Kho Công ty VPSM', ''],
    ['ITSS', 'Công ty ITSS', 'HP-ITSS-05', 'Kho Công ty ITSS', ''],
    ['VPS', 'Tập đoàn VPS (Công ty mẹ)', 'HP-VPS-HQ', 'Kho Trung tâm Tập đoàn VPS', ''],
  ];
  units.forEach(u => insUnit.run(...u));

  const lt = db.prepare('INSERT INTO lead_times VALUES (?,?,?,?,?)');
  lt.run('machine', 1, 'Trung Quốc (TQ)', 8, 10);
  lt.run('machine', 0, 'Trung Quốc (TQ)', 10, 12);
  lt.run('supplies', 1, 'Singapore (SG)', 10, 12);
  lt.run('supplies', 0, 'Singapore (SG)', 12, 14);

  const pw = process.env.DEFAULT_PASSWORD || 'Vps@2026';
  const h = hashPassword(pw);
  const insUser = db.prepare('INSERT INTO users (username,full_name,email,phone,role,unit_id,pass_hash,must_change) VALUES (?,?,?,?,?,?,?,0)');
  insUser.run('admin', 'Quản trị hệ thống (VPS Group)', 'admin@vpsgroup.vn', '0901000001', 'admin', null, h);
  insUser.run('ceo', 'CEO Tập đoàn VPS', 'ceo@vpsgroup.vn', '0901000002', 'ceo', null, h);
  insUser.run('tgd', 'Tổng Giám đốc Tập đoàn VPS', 'tgd@vpsgroup.vn', '0901000003', 'gd', null, h);
  insUser.run('phuong.kh', 'Ms. Phượng (Đầu mối Kế hoạch VPS)', 'phuong.kh@vpsgroup.vn', '0901000004', 'planner', null, h);
  insUser.run('kehoach', 'Bộ phận Kế hoạch Tập đoàn VPS', 'kehoach@vpsgroup.vn', '0901000005', 'planner', null, h);

  const memberAccounts = [
    [1, 'thh', 'Công ty Tân Hồng Hà', '090200001'],
    [2, 'viet', 'Công ty Việt', '090200002'],
    [3, 'xesco', 'Công ty Xesco', '090200003'],
    [4, 'vpsm', 'Công ty VPSM', '090200004'],
    [5, 'itss', 'Công ty ITSS', '090200005'],
    [6, 'vps', 'Tập đoàn VPS (Công ty mẹ)', '090200006'],
  ];
  for (const [uid, prefix, uname, pfx] of memberAccounts) {
    insUser.run(`${prefix}.tp`, `Trưởng BP Đặt hàng – ${uname}`, `${prefix}.tp@vpsgroup.vn`, `${pfx}1`, 'unit_manager', uid, h);
    insUser.run(`${prefix}.nv`, `Chuyên viên Đặt hàng – ${uname}`, `${prefix}.nv@vpsgroup.vn`, `${pfx}2`, 'unit_staff', uid, h);
  }
  console.log(`[seed] Đã tạo dữ liệu ban đầu. Mật khẩu mặc định cho mọi tài khoản: ${pw}`);
}
seed();

module.exports = { db, hashPassword, verifyPassword, DATA_DIR };
