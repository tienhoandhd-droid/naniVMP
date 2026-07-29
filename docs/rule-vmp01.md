# Luật sinh Timeline VMP — rà từ workflow `VMP01-Tạo timeline VMP`

_Rà 2026-07-29 từ node `Code in JavaScript1`, workflow id `Dr5zFBSIjAvVFTCq`._

> **Đây là luật chuẩn.** Tab `0.Rule timeline VMP` trong Google Sheet **không** phải chuẩn — nó mô tả một số điều mâu thuẫn với code (chi tiết ở mục 8).
>
> Đã kiểm chứng bằng cách dựng lại toàn bộ thuật toán và so với dữ liệu thật: **439/439 ID khớp, 0 thiếu**.

---

## 1. Luồng chạy

```
Schedule 8h  →  HTTP GET Apps Script web app
                (trả JSON: { sheet1..sheet5, "6.Timeline VMP" })
             →  Gộp phẳng, gắn nhãn _sheet
             →  SINH TIMELINE  ← toàn bộ luật nằm ở đây
             →  Google Sheets appendOrUpdate vào tab "6.Timeline VMP",
                khớp theo cột "ID thẩm định"
```

Tab 6 vừa là **đầu vào** (để biết ID nào đã có) vừa là **đầu ra**.

---

## 2. Nguồn: 5 danh mục → một hình dạng chung

Apps Script đổi tên tab thành `sheet1..sheet5` trước khi gửi, nên code không dùng tên tab thật.

| Khoá | Tab thật | Phân loại | Cột mã | Cột tên | Cột khu vực | Cột năm |
|---|---|---|---|---|---|---|
| `sheet1` | 1.DS thiết bị-All | Thiết bị | Mã thiết bị | Tên thiết bị | Mã khu vực | **Năm nhập** |
| `sheet2` | 2. DS quy trình | Quy trình | Mã quy trình | Tên quy trình | **Khu vực áp dụng** | **Năm ban hành** |
| `sheet3` | 3. DS kho | Kho | Mã kho | **Tên Kho** | Mã khu vực | — |
| `sheet4` | 4. DS hệ thống phụ trợ | Hệ thống phụ trợ | Mã hệ thống | **Hệ thống phụ trợ** | Mã khu vực | Năm nhập |
| `sheet5` | 5. Vận chuyển | Vận chuyển | Mã vận chuyển | **Tên chuyển vận chuyển** | Mã khu vực | — |

Ba tab dùng **tên cột khác nhau cho cùng một ý nghĩa** — đây là chỗ dễ vấp nhất khi sửa Sheet.

`sheet4` không có cột `Line`; code viết `d['Line'] || ''` nên tự để trống.

Các cột chung mọi tab: `Bộ phận quản lý`, `Line`, `Tình trạng`, `Show`, `Thẩm định`, `Tần suất thẩm định (tháng)`, `Phân loại báo cáo`, `Số ngày công thẩm định thực tế`, `Tháng thẩm định đầu tiên trong năm`.

---

## 3. Lọc — dòng nào được sinh timeline

Ba bộ lọc, theo đúng thứ tự:

1. Bỏ dòng thuộc tab `6.Timeline VMP` (chỉ dùng để thu thập ID đã có và STT lớn nhất).
2. Bỏ dòng **không có mã đối tượng**.
3. Bỏ dòng có `Thẩm định` ≠ `y`.

**Cách so `Thẩm định`:** `trim` → `lowercase` → chuẩn hoá `NFC`, rồi so **đúng bằng chuỗi `"y"`**.
Nghĩa là `Y` và `y` đều được, nhưng **`yes`, `x`, `có`, `1` đều bị loại**.

> ⚠️ Luật **không** lọc theo `Show` hay `Tình trạng`. Dữ liệu thật hiện có **6 đối tượng `Show = N`** và **3 đối tượng `Tình trạng = "Chưa hoạt động"`** vẫn được sinh timeline vì `Thẩm định = y`.

---

## 4. Loại thẩm định sinh ra

| Phân loại | Loại thẩm định |
|---|---|
| Thiết bị · Hệ thống phụ trợ | **lần đầu:** `DQ`, `FAT/SAT`, `IQ`, `OQ`, `PQ`<br>**về sau:** `OQ`, `PQ` |
| Quy trình | `PV` |
| Kho | `GSP` |
| Vận chuyển | `GDP` |
| _khác_ | **không sinh gì** |

**"Lần đầu" được định nghĩa là:**

```
Năm nhập là số  VÀ  Năm nhập === NĂM THẨM ĐỊNH (2026)
                VÀ  đối tượng CHƯA TỪNG có ID nào kết thúc bằng "-IQ"
```

Điều kiện `IQ` chính là **cơ chế idempotent**: một khi `IQ` đã tồn tại trong tab 6, các loại một-lần (`DQ`, `FAT/SAT`, `IQ`) **không bao giờ sinh lại**. Đây là lý do mô phỏng luật ra ít ID hơn Sheet đúng ở 3 loại này — **không phải lỗi**.

---

## 5. Số lần thẩm định trong năm

```
số lần = max(1, floor(12 / tần suất))     tần suất rỗng/sai → mặc định 12
```

| Tần suất | Số lần/năm | Đối tượng thật |
|---|---|---|
| 3 tháng | 4 | 3 |
| 6 tháng | 2 | 14 |
| 12 tháng | 1 | 196 |
| **36 tháng** | **1** ⚠️ | 3 |

> ⚠️ **Tần suất 36 tháng vẫn sinh 1 lần MỖI NĂM.** `floor(12/36) = 0`, bị `max(1, …)` nâng lên 1. Ý định "3 năm thẩm định 1 lần" **không được tôn trọng** — 3 đối tượng này đang bị lên lịch hằng năm.

---

## 6. Mã ID thẩm định

```
{Mã đối tượng}/{Năm}.{Lần, 2 chữ số}-{Loại thẩm định}
```

Ví dụ: `KNTB172/2026.01-IQ`, `S9.01/2026.02-GSP`

**ID đã tồn tại trong tab 6 thì bỏ qua**, không sinh lại (so sánh không phân biệt hoa thường).

---

## 7. Năm mốc thời gian — tính LÙI từ đích

Chỉ có **một** mốc được tính trực tiếp; bốn mốc còn lại suy ngược từ nó.

```
   ①  tổng tháng   = Tháng đầu tiên + (lần − 1) × tần suất
      tháng thực   = ((tổng tháng − 1) mod 12) + 1
      năm thực     = 2026 + floor((tổng tháng − 1) / 12)      ← có thể TRÀN sang năm sau

   ②  T (Deadline VMP)      = NGÀY CUỐI CÙNG của tháng thực / năm thực
   ③  Hạn báo cáo           = T − 5 ngày
   ④  Hạn kết thúc thẩm định = Hạn báo cáo − (khoảng cách báo cáo)
   ⑤  Hạn bắt đầu thẩm định  = Hạn kết thúc − Số ngày công thẩm định thực tế
   ⑥  Hạn hoàn thành đề cương = Hạn bắt đầu − 60 ngày
```

**Khoảng cách báo cáo ở bước ④:**

| Điều kiện | Số ngày |
|---|---|
| Loại thẩm định là `IQ` **hoặc** `OQ` | **2** — không tra bảng |
| Còn lại, tra theo `Phân loại báo cáo`: | |
| · không phụ thuộc | 2 |
| · hóa lý | 2 |
| · nhiễm khuẩn | 7 |
| · vô khuẩn | 16 |

Tra bảng cũng chuẩn hoá `trim/lower/NFC`. **Giá trị lạ = coi như thiếu**, không đoán.

Ngày ghi ra dạng chuỗi `dd/mm/yyyy`.

---

## 8. Thiếu dữ liệu — mất mốc theo TẦNG, không mất hết

Đây là phần hay bị hiểu nhầm. Code dừng theo tầng, mốc nào tính được vẫn giữ:

| Thiếu | T | Báo cáo | Kết thúc TĐ | Bắt đầu TĐ | Đề cương |
|---|---|---|---|---|---|
| `Tháng thẩm định đầu tiên` | ✗ | ✗ | ✗ | ✗ | ✗ |
| Tháng ngoài 1..12 | ✗ | ✗ | ✗ | ✗ | ✗ |
| `Phân loại báo cáo` (và không phải IQ/OQ) | ✓ | ✓ | ✗ | ✗ | ✗ |
| `Số ngày công thẩm định thực tế` | ✓ | ✓ | ✓ | ✗ | ✗ |

Ô "✗" **không để trống** mà ghi chuỗi tiếng Việt, ví dụ:
`Không xác định do thiếu "Tháng thẩm định đầu tiên trong năm"`

> Hệ quả quan trọng: **cột ngày trong tab 6 không phải lúc nào cũng là ngày.** Mọi chỗ đọc dữ liệu phải phòng thủ. Đây là lý do tồn tại các migration `dashboard_raw_status_text`.

Dữ liệu thật hiện có **5 đối tượng** rơi vào trường hợp thiếu `Tháng thẩm định đầu tiên`: 4 quy trình `TDSX-X5-*` và 1 vận chuyển `S1`.

---

## 9. Cột đầu ra và cách ghi

**STT** tiếp tục từ STT lớn nhất đang có trong tab 6, tăng dần.

**`Điểm trọng yếu` luôn ghi rỗng `''`** — dù 5 tab nguồn đều có cột này. Kiểm chứng: nguồn 0 dòng có giá trị, timeline 0 dòng có điểm. Cột này thực tế **chưa bao giờ được dùng**.

Node ghi dùng `appendOrUpdate` khớp theo `ID thẩm định`:

- **Không bao giờ xoá dòng.** Đối tượng bị loại khỏi danh mục vẫn còn hạng mục cũ trong tab 6.
- Chỉ ghi **22 cột** do luật sinh. Các cột nhập tay — `QA phụ trách`, `Email`, `Nhân sự bộ phận khác`, `Thời gian thực tế …`, `Trạng thái …` — **không nằm trong danh sách ghi nên được giữ nguyên**. Đây là điều khiến tab 6 vừa tự sinh vừa có dữ liệu người dùng.

---

## 10. Bốn điểm — đã xử lý 2026-07-29

| # | Vấn đề | Cách xử lý | Vì sao |
|---|---|---|---|
| 1 | `NĂM THẨM ĐỊNH = 2026` viết cứng | **Không cần sửa** — `rpc_generate_timeline(p_year, …)` đã tham số hoá từ đầu. VMP01 đổi tên thành `[NGỪNG DÙNG]` để hết hai nguồn luật | Vấn đề chỉ tồn tại ở bản n8n, mà bản đó nay mồ côi |
| 2 | "Lần đầu" đòi `Năm nhập === năm` | **Giữ nguyên luật**, thêm cảnh báo | Dữ liệu chứng minh luật đúng: cả 7 thiết bị có `IQ` đều `Năm nhập = 2026`. Bỏ điều kiện sẽ sinh **528 hạng mục rác** cho 176 thiết bị cũ |
| 3 | Tần suất 36 tháng vẫn sinh mỗi năm | **ĐÃ SỬA** | Sai lệch nghiệp vụ thật. Nay chỉ sinh khi `năm ≥ năm mốc gần nhất + tần suất÷12` |
| 4 | Không lọc `Show` / `Tình trạng` | **Giữ nguyên luật**, thêm cảnh báo | Lọc theo "Chưa hoạt động" sẽ **sai ngược** — đó chính là thứ cần `DQ`/`IQ`. `Show` là cờ hiển thị, `Thẩm định` mới là cờ nghiệp vụ |

### Kết quả sau khi sửa điểm 3

Ba kho tần suất 36 tháng (`S7.01`, `S7.02`, `S9.01`, mốc gần nhất 2026):

| Năm sinh | Hạng mục tạo mới | Kho bị hoãn |
|---|---|---|
| 2027 | 436 | 3 |
| 2028 | 436 | 3 |
| **2029** | **439** | 0 |

### Ba cảnh báo thay cho việc máy tự quyết

`rpc_source_warnings(p_year)` trả 4 nhóm, hiện ngay trên màn **Danh mục nguồn**:

| Nhóm | Số lượng | Ý nghĩa |
|---|---|---|
| `thieu_thang_dau` | 5 | 🔴 **Chắc chắn sai** — phải điền |
| `chua_tung_iq` | 176 | 🟡 Cần người xem — bình thường nếu là thiết bị cũ |
| `show_tat` | 6 | 🟡 Cần người xem — `Thẩm định = y` nhưng `Show ≠ y` |
| `chua_hoat_dong` | 3 | 🟡 Cần người xem — chỉ rà nếu thật sự đã ngừng dùng |

Giao diện phân biệt rõ **đỏ = chắc chắn sai** với **vàng = cần người xem**, để không ai nhầm cảnh báo bình thường thành lỗi.

---

## 11. Luật này giờ nằm ở đâu

Bản cài đặt trên Supabase: `rpc_generate_timeline(p_year, p_commit)` — migration `20260729050000_generate_timeline_in_db.sql`. Cài đúng luật trên, thêm ba ràng buộc:

1. **Idempotent** — mã đã có thì bỏ qua.
2. **Không đè cột nhập tay** — chỉ `INSERT` hạng mục mới, không `UPDATE` cột tiến độ.
3. **Xem trước rồi mới ghi** — `p_commit` mặc định `false`.

Gọi từ web: màn **Dữ liệu & Nhập liệu** → tab **Danh mục nguồn** → nút **Sinh timeline**.

Ba điểm 1–3 ở mục 10 **được cài y nguyên** trong RPC để kết quả khớp bản n8n. Sửa luật thì sửa ở RPC, và sửa cả `scripts/import-source-catalogs.py` nếu đụng tới ánh xạ cột.
