# VPS Order Hub – Hệ thống Đặt hàng & Theo dõi Tiến độ Đơn hàng HP

Hệ thống quản lý tập trung quy trình phê duyệt và theo dõi thời gian giao hàng (Lead Time) cho **Tập đoàn VPS** và **5 đơn vị thành viên**, bám sát quy định đặt hàng thiết bị & linh kiện hãng HP trên cổng **HP Partner Portal** (`https://partner.hp.com/group/upp-apj/create-purchase-order`).

---

## 1. Khởi chạy hệ thống

- **Cách 1 (Nhanh nhất trên Windows):** Nhấp đúp vào file `start.bat`
- **Cách 2 (Dòng lệnh):**
  ```bash
  npm run demo   # (Tùy chọn) Tạo dữ liệu mẫu cho 5 đơn vị để trải nghiệm ngay
  npm start      # Chạy server tại http://localhost:3000
  ```

> **Không cần cài đặt thư viện ngoài (`npm install`)**: Hệ thống sử dụng trực tiếp nhân Node.js và cơ sở dữ liệu SQLite tích hợp sẵn (`node:sqlite`), lưu trữ an toàn tại thư mục `data/vps-order.db`.

---

## 2. Tài khoản mặc định & Phân quyền truy cập

Mật khẩu mặc định cho tất cả tài khoản khi khởi tạo: **`Vps@2026`** *(Hệ thống sẽ yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên, hoặc Quản trị viên có thể đổi trong mục Quản trị).*

### Khối Tập đoàn VPS (Công ty mẹ) – Xem được **toàn bộ các đơn vị**
| Vai trò | Tên đăng nhập | Quyền hạn chính |
|---|---|---|
| **CEO Tập đoàn VPS** | `ceo` | Xem toàn bộ đơn hàng, biểu đồ tiến độ, KPI các đơn vị, trao đổi trực tiếp trên đơn |
| **Tổng Giám đốc Tập đoàn VPS** | `tgd` | Xem toàn bộ đơn hàng, biểu đồ tiến độ, KPI các đơn vị, trao đổi trực tiếp trên đơn |
| **Đầu mối Kế hoạch VPS (Ms. Phượng)** | `phuong.kh` | Xem toàn bộ đơn, kiểm soát xác nhận từ **Ms. Uyên (Đầu mối hãng HP)** và **Phê duyệt / Yêu cầu bổ sung / Từ chối** đơn trước khi lên HP, cập nhật PO/SO/ETA |
| **Bộ phận Kế hoạch Tập đoàn** | `kehoach` | Tương tự đầu mối Kế hoạch |
| **Quản trị hệ thống** | `admin` | Quản lý tài khoản, cập nhật tên/địa chỉ/mã đối tác HP của các đơn vị, cấu hình Lead Time |

### Khối 5 Đơn vị thành viên (Chỉ xem và thao tác trên **đơn hàng của đơn vị mình**)
| Mã | Tên Đơn vị thành viên | Trưởng bộ phận | Chuyên viên đặt hàng |
|---|---|---|---|
| **THH** | **Công ty Tân Hồng Hà** | `thh.tp` | `thh.nv` |
| **VIET** | **Công ty Việt** | `viet.tp` | `viet.nv` |
| **XESCO** | **Công ty Xesco** | `xesco.tp` | `xesco.nv` |
| **VPSM** | **Công ty VPSM** | `vpsm.tp` | `vpsm.nv` |
| **ITSS** | **Công ty ITSS** | `itss.tp` | `itss.nv` |
| **VPS** | **Tập đoàn VPS (Công ty mẹ)** *(đặt hàng trực tiếp)* | `vps.tp` | `vps.nv` |

> **Bảo mật phân quyền ở tầng Server API:** Khi đăng nhập bằng tài khoản của đơn vị nào (ví dụ `dv01.nv`), mọi truy vấn danh sách, thống kê, xuất Excel và xem chi tiết đều bị khóa cứng theo `unit_id` của đơn vị đó; cố tình truy cập ID đơn của đơn vị khác sẽ bị từ chối (`403 Forbidden`).

---

## 3. Quy trình nghiệp vụ chuẩn hóa trên hệ thống

1. **Bước 1 – Gửi yêu cầu phê duyệt sơ bộ (Thay cho gửi email thủ công):**
   - Đơn vị tạo đơn trên **VPS Order Hub** (hỗ trợ dán nhanh danh mục từ Excel, đính kèm báo giá/cấu hình, tích chọn loại hàng Máy/Linh kiện và trạng thái Forecast).
   - Hệ thống yêu cầu tích cam kết **không tự ý đặt đơn trực tiếp trên HP khi chưa được duyệt** và gửi tới đầu mối Kế hoạch (**Ms. Uyên**).
2. **Bước 2 – Rà soát & Phê duyệt (Ms. Uyên / Bộ phận Kế hoạch):**
   - Rà soát mã SKU, số lượng, điều kiện dự báo.
   - Chọn **Phê duyệt**, **Yêu cầu bổ sung** (trả lại kèm ghi chú để đơn vị sửa), hoặc **Từ chối**.
3. **Bước 3 – Đặt hàng chính thức trên HP Partner Portal:**
   - Khi đơn chuyển sang trạng thái **“Đã duyệt – chờ đặt HP”**, hệ thống hiển thị liên kết mở thẳng **HP Partner Portal** (`https://partner.hp.com/group/upp-apj/create-purchase-order`).
   - Sau khi tạo PO trên HP, nhân sự cập nhật **Số PO HP** và **Ngày đặt hàng**.
4. **Bước 4 – Tự động tính Lead Time & Theo dõi tiến độ (ETA):**
   - **Đặt hàng Máy (Kho Trung Quốc - TQ):**
     - Có dự báo trước (*Forecasted*): **08 – 10 tuần**
     - Không có dự báo (*Non-forecasted*): **10 – 12 tuần**
   - **Đặt Linh kiện / Supplies (Kho Singapore - SG):**
     - Có dự báo trước (*Forecasted*): **10 – 12 tuần**
     - Không có dự báo (*Non-forecasted*): **12 – 14 tuần**
   - Hệ thống tự động tính cửa sổ **ETA sớm nhất → ETA muộn nhất**, hiển thị thanh tiến độ, biểu đồ Gantt theo dõi tiến độ về hàng và cảnh báo đỏ đối với đơn quá hạn hoặc có nguy cơ trễ ngày khách hàng cần.
5. **Bước 5 – Xác nhận SO, Vận chuyển & Nhập kho:**
   - Cập nhật số Sales Order (SO) hãng HP xác nhận, ngày xuất hàng, mã vận đơn (Tracking) và ngày nhập kho thực tế để tính tỷ lệ về hàng đúng hạn của từng đơn vị.
