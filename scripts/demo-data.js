'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, DATA_DIR } = require('../src/db');

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

function seedDemo() {
  const t = today();
  const getUserId = u => db.prepare('SELECT id FROM users WHERE username=?').get(u)?.id || 1;
  const getUnitId = c => db.prepare('SELECT id FROM units WHERE code=?').get(c)?.id || 1;
  const phuongId = getUserId('phuong.kh');

  const demoOrders = [
    {
      code: 'PO-THH-2611-0001',
      unit_id: getUnitId('THH'),
      created_by: getUserId('thh.nv'),
      status: 'shipping',
      category: 'machine',
      forecast: 1,
      forecast_ref: 'Forecast T11/2026 – Tân Hồng Hà',
      priority: 'high',
      title: 'Lô máy in HP LaserJet Enterprise cho Dự án Ngân hàng TMCP',
      project: 'Khối Ngân hàng – Chi nhánh Miền Bắc (Tân Hồng Hà)',
      deal_id: 'OPG-9928412',
      sold_to: 'HP-THH-01',
      ship_to: 'Kho Công ty Tân Hồng Hà – Hà Nội',
      receiver: 'Nguyễn Văn Hùng',
      receiver_phone: '0903123456',
      requested_date: addDays(t, 20),
      currency: 'USD',
      note: 'Giao nguyên kiện pallet, cần CO/CQ bản gốc kèm theo lô hàng.',
      hp_po: 'HP-APJ-883920',
      hp_so: 'SO-5510923',
      hp_order_date: addDays(t, -45),
      hp_confirm_date: addDays(t, -42),
      ship_date: addDays(t, -10),
      tracking: 'DHL-9928371823',
      lt_min: 8,
      lt_max: 10,
      eta_min: addDays(t, 11),
      eta_max: addDays(t, 25),
      hp_eta: addDays(t, 15),
      approved_by: phuongId,
      approved_at: addDays(t, -46) + ' 14:20:00',
      submitted_at: addDays(t, -47) + ' 09:15:00',
      lines: [
        { sku: '7PS84A', description: 'HP LaserJet Enterprise M611dn Printer', qty: 25, unit_price: 980, note: 'Bảo hành 3 năm' },
        { sku: '4Z506A', description: 'HP LaserJet Pro MFP 4103fdw', qty: 40, unit_price: 410, note: '' },
      ],
    },
    {
      code: 'PO-VIET-2611-0001',
      unit_id: getUnitId('VIET'),
      created_by: getUserId('viet.nv'),
      status: 'pending',
      category: 'supplies',
      forecast: 1,
      forecast_ref: 'Forecast Q4/2026 – Công ty Việt',
      priority: 'urgent',
      title: 'Đặt bổ sung mực in chính hãng & cụm trống HP từ kho Singapore',
      project: 'Khách hàng khối Doanh nghiệp FDI (Công ty Việt)',
      deal_id: 'BID-778120',
      sold_to: 'HP-VIET-02',
      ship_to: 'Kho Công ty Việt',
      receiver: 'Trần Thị Mai',
      receiver_phone: '0912987654',
      requested_date: addDays(t, 75),
      currency: 'USD',
      note: 'Đã gửi danh mục cho Ms. Uyên rà soát, nhờ Bộ phận Kế hoạch Tập đoàn VPS ưu tiên duyệt sớm.',
      submitted_at: addDays(t, -1) + ' 10:30:00',
      lines: [
        { sku: 'W1470X', description: 'HP 147X High Yield Black Original LaserJet Toner', qty: 120, unit_price: 245, note: 'Kho SG' },
        { sku: 'W2110X', description: 'HP 206X High Yield Black Original LaserJet Toner', qty: 80, unit_price: 95, note: '' },
      ],
    },
    {
      code: 'PO-XESCO-2611-0001',
      unit_id: getUnitId('XESCO'),
      created_by: getUserId('xesco.tp'),
      status: 'approved',
      category: 'machine',
      forecast: 0,
      forecast_ref: null,
      priority: 'normal',
      title: 'Đặt máy MFP A3 HP LaserJet Managed cho Dự án Xesco',
      project: 'Dự án Khối Cơ quan Nhà nước – Công ty Xesco',
      deal_id: 'OPG-8841205',
      sold_to: 'HP-XESCO-03',
      ship_to: 'Kho Công ty Xesco',
      receiver: 'Lê Hoàng Nam',
      receiver_phone: '0988776655',
      requested_date: addDays(t, 90),
      currency: 'USD',
      note: 'Đơn ngoài dự báo (Non-forecasted), đã được Ms. Uyên xác nhận phê duyệt.',
      approved_by: phuongId,
      approved_at: t + ' 08:45:00',
      submitted_at: addDays(t, -2) + ' 16:00:00',
      lines: [
        { sku: '8EP56A', description: 'HP LaserJet Managed MFP E72530dn', qty: 10, unit_price: 2350, note: 'Kèm khay giấy phụ' },
      ],
    },
    {
      code: 'PO-VPSM-2610-0001',
      unit_id: getUnitId('VPSM'),
      created_by: getUserId('vpsm.nv'),
      status: 'confirmed',
      category: 'supplies',
      forecast: 0,
      forecast_ref: null,
      priority: 'high',
      title: 'Linh kiện Fuser Kit & Roller bảo trì dịch vụ MPS – Công ty VPSM',
      project: 'Khối khách hàng thuê máy dịch vụ MPS (VPSM)',
      deal_id: '',
      sold_to: 'HP-VPSM-04',
      ship_to: 'Kho Công ty VPSM',
      receiver: 'Phạm Quốc Bảo',
      receiver_phone: '0939112233',
      requested_date: addDays(t, -2),
      currency: 'USD',
      note: 'Đơn linh kiện không dự báo từ kho Singapore, cần theo dõi sát ETA.',
      hp_po: 'HP-APJ-771209',
      hp_so: 'SO-4490112',
      hp_order_date: addDays(t, -95),
      hp_confirm_date: addDays(t, -90),
      lt_min: 12,
      lt_max: 14,
      eta_min: addDays(t, -11),
      eta_max: addDays(t, -3),
      hp_eta: addDays(t, -3),
      approved_by: phuongId,
      approved_at: addDays(t, -96) + ' 11:00:00',
      submitted_at: addDays(t, -97) + ' 09:00:00',
      lines: [
        { sku: 'L0H24A', description: 'HP LaserJet 220V Maintenance/Fuser Kit', qty: 35, unit_price: 280, note: '' },
        { sku: 'B5L24A', description: 'HP High-end Roller Kit', qty: 60, unit_price: 65, note: '' },
      ],
    },
    {
      code: 'PO-ITSS-2609-0001',
      unit_id: getUnitId('ITSS'),
      created_by: getUserId('itss.nv'),
      status: 'received',
      category: 'machine',
      forecast: 1,
      forecast_ref: 'Forecast T09/2026 – ITSS',
      priority: 'normal',
      title: 'Máy in màu HP Color LaserJet Enterprise M554dn – Giải pháp ITSS',
      project: 'Dự án Tích hợp Hệ thống CNTT – Công ty ITSS',
      deal_id: 'OPG-665102',
      sold_to: 'HP-ITSS-05',
      ship_to: 'Kho Công ty ITSS',
      receiver: 'Vũ Minh Tuấn',
      receiver_phone: '0977123987',
      requested_date: addDays(t, -10),
      currency: 'USD',
      note: 'Hàng đã nhập kho đủ số lượng, nguyên đai nguyên kiện.',
      hp_po: 'HP-APJ-660192',
      hp_so: 'SO-3381920',
      hp_order_date: addDays(t, -75),
      hp_confirm_date: addDays(t, -72),
      ship_date: addDays(t, -25),
      tracking: 'MAERSK-882190',
      received_date: addDays(t, -12),
      lt_min: 8,
      lt_max: 10,
      eta_min: addDays(t, -19),
      eta_max: addDays(t, -5),
      hp_eta: addDays(t, -10),
      approved_by: phuongId,
      approved_at: addDays(t, -76) + ' 15:00:00',
      submitted_at: addDays(t, -77) + ' 10:00:00',
      lines: [
        { sku: '7ZU81A', description: 'HP Color LaserJet Enterprise M554dn', qty: 18, unit_price: 720, note: '' },
      ],
    },
    {
      code: 'PO-THH-2611-0002',
      unit_id: getUnitId('THH'),
      created_by: getUserId('thh.nv'),
      status: 'returned',
      category: 'supplies',
      forecast: 0,
      forecast_ref: null,
      priority: 'normal',
      title: 'Đặt phụ tùng thay thế cụm kéo giấy HP Tray 2 – Tân Hồng Hà',
      project: 'Bảo hành dịch vụ kỹ thuật Tân Hồng Hà',
      deal_id: '',
      sold_to: 'HP-THH-01',
      ship_to: 'Kho Công ty Tân Hồng Hà – Hà Nội',
      receiver: 'Nguyễn Văn Hùng',
      receiver_phone: '0903123456',
      requested_date: addDays(t, 60),
      currency: 'USD',
      note: '',
      submitted_at: addDays(t, -2) + ' 14:00:00',
      return_comment: 'Vui lòng kiểm tra lại mã Part Number dòng 1 (RM2-5397 hay RM2-5452) và đính kèm xác nhận nhu cầu từ phòng kỹ thuật.',
      lines: [
        { sku: 'RM2-5397-000CN', description: 'Pickup & Separation Roller Assembly', qty: 50, unit_price: 28, note: '' },
      ],
    },
    {
      code: 'PO-VPS-2611-0001',
      unit_id: getUnitId('VPS'),
      created_by: getUserId('vps.tp'),
      status: 'ordered',
      category: 'machine',
      forecast: 1,
      forecast_ref: 'Forecast Tập đoàn T11/2026',
      priority: 'high',
      title: 'Đơn hàng tập trung Tập đoàn VPS (Công ty mẹ) – Thiết bị HP LaserJet',
      project: 'Dự án Khách hàng Chiến lược Tập đoàn VPS',
      deal_id: 'OPG-9001122',
      sold_to: 'HP-VPS-HQ',
      ship_to: 'Kho Trung tâm Tập đoàn VPS',
      receiver: 'Đỗ Quang Minh',
      receiver_phone: '0901888999',
      requested_date: addDays(t, 65),
      currency: 'USD',
      note: 'Đơn đặt hàng trực tiếp từ Công ty mẹ Tập đoàn VPS.',
      hp_po: 'HP-APJ-910234',
      hp_order_date: addDays(t, -14),
      lt_min: 8,
      lt_max: 10,
      eta_min: addDays(t, 42),
      eta_max: addDays(t, 56),
      approved_by: phuongId,
      approved_at: addDays(t, -15) + ' 16:00:00',
      submitted_at: addDays(t, -16) + ' 10:00:00',
      lines: [
        { sku: '7PS84A', description: 'HP LaserJet Enterprise M611dn Printer', qty: 30, unit_price: 965, note: '' },
      ],
    },
  ];

  const insLine = db.prepare('INSERT INTO order_lines (order_id,line_no,sku,description,qty,unit_price,note) VALUES (?,?,?,?,?,?,?)');
  const insEv = db.prepare('INSERT INTO order_events (order_id,user_id,action,from_status,to_status,comment,created_at) VALUES (?,?,?,?,?,?,?)');

  for (const o of demoOrders) {
    const total = o.lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
    const cols = ['code', 'unit_id', 'created_by', 'status', 'category', 'forecast', 'forecast_ref', 'priority',
      'title', 'project', 'deal_id', 'sold_to', 'ship_to', 'receiver', 'receiver_phone', 'requested_date',
      'currency', 'total', 'note', 'hp_po', 'hp_so', 'hp_order_date', 'hp_confirm_date', 'ship_date', 'tracking',
      'received_date', 'lt_min', 'lt_max', 'eta_min', 'eta_max', 'hp_eta', 'approved_by', 'approved_at', 'submitted_at'];
    const vals = cols.map(k => k === 'total' ? total : (o[k] ?? null));
    const r = db.prepare(`INSERT INTO orders (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    const oid = Number(r.lastInsertRowid);
    o.lines.forEach((l, idx) => insLine.run(oid, idx + 1, l.sku, l.description, l.qty, l.unit_price, l.note));
    insEv.run(oid, o.created_by, 'create', null, 'draft', null, o.submitted_at || t);
    if (o.submitted_at) insEv.run(oid, o.created_by, 'submit', 'draft', 'pending', 'Gửi Ms. Phượng (Đầu mối Kế hoạch VPS) kiểm soát & rà soát danh mục với Ms. Uyên (HP)', o.submitted_at);
    if (o.approved_at) insEv.run(oid, phuongId, 'approve', 'pending', 'approved', 'Đã có email xác nhận danh mục từ Ms. Uyên (HP) – Ms. Phượng (VPS) phê duyệt cho phép đặt lên HP Partner Portal', o.approved_at);
    if (o.return_comment) insEv.run(oid, phuongId, 'return', 'pending', 'returned', o.return_comment, addDays(t, -1) + ' 11:00:00');
    if (o.hp_order_date) insEv.run(oid, o.created_by, 'place_hp', 'approved', 'ordered', `Đã tạo PO ${o.hp_po} trên HP Partner Portal`, o.hp_order_date + ' 10:00:00');
    if (o.hp_confirm_date) insEv.run(oid, phuongId, 'hp_confirm', 'ordered', 'confirmed', `HP xác nhận SO ${o.hp_so}`, o.hp_confirm_date + ' 15:00:00');
    if (o.ship_date) insEv.run(oid, phuongId, 'ship', 'confirmed', 'shipping', `Hàng đã xuất kho · Tracking: ${o.tracking}`, o.ship_date + ' 09:00:00');
    if (o.received_date) insEv.run(oid, o.created_by, 'receive', 'shipping', 'received', 'Đã nhận đủ hàng tại kho đơn vị', o.received_date + ' 16:30:00');
  }

  // Thêm chứng từ mẫu lưu theo từng đơn hàng
  const uploadDir = path.join(DATA_DIR, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const insAtt = db.prepare('INSERT INTO attachments (order_id,user_id,doc_type,doc_no,doc_date,note,file_name,mime,size,stored) VALUES (?,?,?,?,?,?,?,?,?,?)');
  function addSampleDoc(orderCode, userId, docType, docNo, docDate, fileName, content, note) {
    const o = db.prepare('SELECT id FROM orders WHERE code=?').get(orderCode);
    if (!o) return;
    const buf = Buffer.from(content, 'utf8');
    const stored = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(path.join(uploadDir, stored), buf);
    insAtt.run(o.id, userId, docType, docNo, docDate, note, fileName, 'text/plain', buf.length, stored);
  }

  addSampleDoc('PO-THH-2611-0001', getUserId('thh.nv'), 'email_hp', 'EMAIL-HP-261001', addDays(t, -47), 'Xac-nhan-danh-muc-Ms-Uyen-HP.txt',
    'Xác nhận từ Ms. Uyên (HP): Danh mục 25 máy M611dn và 40 máy 4103fdw của Công ty Tân Hồng Hà hợp lệ theo Forecast T11/2026.',
    'Email Ms. Uyên (HP) xác nhận danh mục trước khi lên đơn');
  addSampleDoc('PO-THH-2611-0001', phuongId, 'hp_po', 'HP-APJ-883920', addDays(t, -45), 'PO-HP-APJ-883920.txt',
    'Purchase Order: HP-APJ-883920\nUnit: Công ty Tân Hồng Hà\nDeal ID: OPG-9928412',
    'Bản lưu PO đã đặt trên HP Partner Portal');
  addSampleDoc('PO-THH-2611-0001', phuongId, 'shipping_bl', 'DHL-9928371823', addDays(t, -10), 'Bill-of-Lading-DHL-9928371823.txt',
    'Air Waybill / Bill of Lading: DHL-9928371823\nOrigin: China (TQ) -> Kho Công ty Tân Hồng Hà',
    'Vận đơn lô hàng xuất từ kho Trung Quốc');
  addSampleDoc('PO-VIET-2611-0001', getUserId('viet.nv'), 'email_hp', 'EMAIL-HP-261116', addDays(t, -1), 'Email-Ms-Uyen-xac-nhan-muc-in-Viet.txt',
    'Email xác nhận danh mục linh kiện mực in W1470X & W2110X từ Ms. Uyên (HP) cho Công ty Việt.',
    'Đính kèm email xác nhận sơ bộ của Ms. Uyên để Ms. Phượng duyệt');
  addSampleDoc('PO-ITSS-2609-0001', getUserId('itss.nv'), 'co_cq', 'CO-CQ-660192', addDays(t, -15), 'CO-CQ-HP-M554dn-ITSS.txt',
    'Certificate of Origin & Certificate of Quality - Lô 18 máy HP Color LaserJet Enterprise M554dn - Công ty ITSS',
    'Bản scan CO/CQ gốc lưu theo đơn');
  addSampleDoc('PO-ITSS-2609-0001', getUserId('itss.nv'), 'grn_handover', 'PNK-ITSS-261105', addDays(t, -12), 'Phieu-nhap-kho-ITSS-PO-2609-0001.txt',
    'Biên bản kiểm nhận & Phiếu nhập kho đủ 18 máy HP M554dn nguyên đai nguyên kiện.',
    'Phiếu nhập kho thực tế tại kho Công ty ITSS');

  // Thêm Forecast mẫu
  const insFc = db.prepare('INSERT INTO forecasts (unit_id,period,category,sku,description,qty,note,created_by) VALUES (?,?,?,?,?,?,?,?)');
  insFc.run(getUnitId('THH'), '2026-12', 'machine', '7PS84A', 'HP LaserJet Enterprise M611dn', 30, 'Dự án Ngân hàng đợt 2 – Tân Hồng Hà', getUserId('thh.tp'));
  insFc.run(getUnitId('VIET'), '2026-12', 'supplies', 'W1470X', 'HP 147X High Yield Black Toner', 150, 'Nhu cầu định kỳ Q1 – Công ty Việt', getUserId('viet.tp'));
  insFc.run(getUnitId('XESCO'), '2027-01', 'machine', '8EP56A', 'HP LaserJet Managed MFP E72530dn', 15, 'Dự án khối Cơ quan – Công ty Xesco', getUserId('xesco.tp'));
  insFc.run(getUnitId('VPSM'), '2027-01', 'supplies', 'L0H24A', 'HP LaserJet 220V Maintenance Kit', 45, 'Vật tư bảo trì dịch vụ cho thuê VPSM', getUserId('vpsm.tp'));
  insFc.run(getUnitId('ITSS'), '2027-01', 'machine', '7ZU81A', 'HP Color LaserJet Enterprise M554dn', 20, 'Dự án hạ tầng CNTT – ITSS', getUserId('itss.tp'));

  console.log(`[demo] Đã khởi tạo ${demoOrders.length} đơn hàng mẫu và 5 bản dự báo cho Tập đoàn VPS & 5 công ty thành viên.`);
}

seedDemo();
