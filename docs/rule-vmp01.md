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

Nói bằng lời cho dễ tra: hạn VMP là ngày cuối tháng đích; báo cáo phải
xong trước hạn VMP 5 ngày; thẩm định kết thúc trước hạn báo cáo 2–16
ngày tuỳ loại; và **đề cương phải hoàn thành trước ngày bắt đầu thẩm
định 60 ngày**.

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

**`Điểm trọng yếu`: workflow sinh timeline luôn ghi rỗng `''`.** Đúng ở thời điểm mô tả luật VMP01 — nguồn 0 dòng có giá trị, timeline 0 dòng có điểm.

> **Đã đổi từ 29/07/2026 — đọc kỹ chỗ này.** Cột điểm trọng yếu nay ĐÃ ĐƯỢC DÙNG. `rpc_recalc_criticality` chấm cho toàn bộ 264 đối tượng nguồn và đồng bộ sang 461 hạng mục timeline (phân bố: 9 điểm → 96 đối tượng, 6 → 133, 3 → 28). Chỉ riêng *workflow sinh timeline* là vẫn không tự ghi điểm — điểm do RPC chấm riêng, không do bước sinh dòng. Câu "chưa bao giờ được dùng" chỉ đúng cho tới 28/07/2026; đừng trích nó để nói về hiện tại.

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


---

## 12. Điểm trọng yếu — công thức, phân loại, và giới hạn của thang điểm

### 12.1 Công thức (từ tab `0.Rule timeline VMP`)

```
Điểm trọng yếu = Điểm mức độ phức tạp × Điểm ảnh hưởng tới chất lượng sản phẩm

  Mức độ phức tạp:              Cao 3 · Trung bình 2 · Thấp 1
  Ảnh hưởng chất lượng SP:      Trực tiếp 3 · Gián tiếp 2 · Không 1
```

Thang 1…9, khớp đúng ràng buộc `vmp_plan_items_criticality_score_check (1..9)` vốn đã có trong DB.

### 12.2 Bản chấm đầu tiên SAI có hệ thống — đã sửa

Bản chấm tự động đầu tiên xếp **khí nén = 4 điểm**. Sai, và sai theo một kiểu nhất quán: tôi hiểu "ảnh hưởng trực tiếp" thành *"chỉ tính khi chạm sản phẩm"*.

Căn cứ sửa:

1. **Khí nén và khí công nghệ là _critical utility_** — tiếp xúc trực tiếp sản phẩm, linh kiện, bề mặt thiết bị và hệ vô trùng; đòi đủ chuỗi `URS → DQ → IQ → OQ → PQ`, không chấp nhận chỉ có chứng chỉ máy nén; chất lượng khí theo `ISO 8573-1`.
2. **Định nghĩa của ISPE Baseline Guide 5**: *Direct Impact = tác động trực tiếp tới CQA của sản phẩm, **hoặc** tới chất lượng sản phẩm do một critical utility cung cấp.*

Các nhóm bị xếp nhầm xuống "gián tiếp", nay đã nâng lên "trực tiếp":

| Nhóm | Vì sao là trực tiếp |
|---|---|
| Khí nén, khí nitơ | Critical utility, chạm sản phẩm |
| Nồi hấp / tủ hấp tiệt trùng dụng cụ | Đảm bảo **vô trùng** — là CQA |
| Máy rửa dụng cụ, tủ sấy dụng cụ | **Tồn dư** sau làm sạch — là CQA |
| Passbox, tủ truyền nguyên liệu | Kiểm soát nhiễm chéo giữa các cấp sạch |
| Tủ hấp tiệt trùng quần áo | Kiểm soát nhiễm trong khu vực vô trùng |

Vẫn giữ "gián tiếp" (có lý do rõ): **kho lưu mẫu QC** (mẫu lưu, không phải lô xuất bán) và **thẩm định vận chuyển** với xe thường — *nếu vận chuyển thuốc lạnh thì phải nâng lên 3, QA cần xác nhận điểm này.*

### 12.3 Lần rà thứ hai — trục "mức độ phức tạp" cũng sai

Người dùng chỉ tiếp: *"LAF cân sao điểm là 3. Nó không phải chỉ là cái cân, cân nguyên liệu trong đó."*

Đúng. Luật cũ có `^laf → phức tạp 1`, tức là coi mọi thiết bị có chữ LAF như một cái cân bàn. Sai về bản chất thiết bị: **LAF cân là buồng cân / buồng lấy mẫu** (dispensing booth, downflow booth, RLAF) — một tủ xử lý không khí sạch để cân nguyên liệu hở, không phải cái cân.

Nhóm xử lý không khí sạch đòi đủ `DQ → IQ → OQ → PQ` với phép đo chuyên biệt, tái thẩm định định kỳ:

- toàn vẹn màng HEPA bằng khí dung DOP/PAO
- vận tốc gió và độ đồng đều — dung sai ±20% quanh giá trị đích
- đếm tiểu phân theo cấp sạch
- hình ảnh khói (smoke pattern) — hướng dòng khí, không có vùng quẩn
- thời gian phục hồi (recovery)

Đây là mức phức tạp **ngang hệ HVAC**.

Các nhóm đã sửa trong lần rà này:

| Nhóm | Cũ | Mới | Vì sao |
|---|---|---|---|
| LAF, buồng cân, buồng lấy mẫu, tủ ATSH/BSC, isolator, tủ găng tay | 1–2 | **3** | Xử lý không khí sạch, chuỗi phép đo HEPA/gió/tiểu phân/khói/recovery |
| Nồi hấp, tủ hấp tiệt trùng | 2 | **3** | Phân bố nhiệt, xuyên nhiệt tới điểm lạnh nhất, chỉ thị sinh học, F0, thẩm định theo từng kiểu xếp tải |
| Passbox, tủ truyền nguyên liệu | 1 | **2** | Có HEPA và khoá liên động, nhưng không có chu trình để chạy PQ nhiều thông số |
| Chiller | 1 | **2** | Hệ làm lạnh có vòng điều khiển nhiệt độ; trước bị khớp nhầm chuỗi `chile` |
| Quy trình vô khuẩn | 2 | **3** | Mô phỏng vô trùng (media fill) lặp lại, giám sát môi trường, kiểm tra vô khuẩn |

Quy trình nay chấm theo cột **"Phân loại báo cáo"** của sheet gốc (`Vô khuẩn → 3`) thay vì đoán theo tên sản phẩm.

Hai kiểu khớp nhầm cũng đã chặn: **"bán tự động"** khớp chuỗi `tự động` nhưng thực tế ít tự động hơn; **"Tủ sấy 2 cánh cho lên men"** khớp `lên men` nhưng nó là tủ sấy.

Giữ nguyên phức tạp 1: cân check trên dây chuyền, tủ lạnh/tủ mát bảo quản, giá kệ, xe đẩy, kho thường, xe vận chuyển.

### 12.3b Kết quả sau hai lần sửa

| Điểm trọng yếu | Số đối tượng | % |
|---|---|---|
| **9** | 96 | 36,4% |
| **6** | 133 | 50,4% |
| **3** | 28 | 10,6% |
| 2 | 5 | 1,9% |
| 1 | 2 | 0,8% |

### 12.4 ⚠️ Thang điểm CÓ chuẩn về hình thức, nhưng một trục đã mất tác dụng

Đo sức phân biệt của từng trục:

| Trục | Phân bố | Nhận xét |
|---|---|---|
| Mức độ phức tạp | 3 → 36,4% · 2 → 51,1% · 1 → 12,5% | Phân tán tốt |
| **Ảnh hưởng chất lượng** | **3 → 97,3%** · 2 → 1,1% · 1 → 1,5% | ⚠️ **Gần như không phân biệt** |

**Đây không phải lỗi phân loại — đó là bản chất của một nhà máy GMP: gần như mọi thiết bị GMP đều là _direct impact_.**

Chính vì lý do này, **ISPE Baseline Guide 5 bản 2 đã BỎ mức "Indirect Impact"**, chỉ còn Direct / Not-Direct: mức ở giữa không mang thông tin.

Hệ quả với công thức hiện tại: với 97% đối tượng, `điểm = phức tạp × 3`. Trục ảnh hưởng đóng góp gần như bằng không, và thang 1–9 thực chất co lại thành ba mức **3 · 6 · 9** do độ phức tạp quyết định.

**Điều này làm trục "mức độ phức tạp" thành trục quyết định duy nhất — nên một lỗi phân loại ở trục đó (như LAF cân) là lỗi ảnh hưởng thẳng tới thứ tự ưu tiên, không có trục thứ hai nào bù lại được.** Vì vậy mô tả và ví dụ của từng mức nay hiện thẳng trên tab "Luật đang áp dụng" để QA đối chiếu, thay vì chỉ có ba chữ Cao / Trung bình / Thấp.

### 12.5 Đề xuất — giữ hay đổi thang điểm

**Giữ công thức hiện tại.** Nó là luật đã ban hành, đang chạy, và vẫn xếp được thứ tự ưu tiên (23,5% ở mức 9 là nhóm cần làm trước).

Nhưng nếu muốn tiệm cận `ICH Q9`, có hai hướng, chọn một:

**Hướng A — thêm chiều thứ ba: khả năng phát hiện**
FMEA chuẩn dùng `RPN = Mức nghiêm trọng × Khả năng xảy ra × Khả năng phát hiện`. Chiều "phát hiện" tạo khác biệt lớn nhất trong thực tế: HVAC có giám sát chênh áp **liên tục** rủi ro thấp hơn hẳn HVAC chỉ đo **định kỳ**, dù cùng phức tạp và cùng ảnh hưởng. Đây là chiều duy nhất hiện đang thiếu hoàn toàn.

**Hướng B — thay trục "ảnh hưởng" bằng trục có sức phân biệt thật**
Ví dụ *"hậu quả nếu lỗi"*: gây thu hồi lô (3) · gây sai lệch phải điều tra (2) · không ảnh hưởng lô (1). Trục này phân tán tốt hơn nhiều so với direct/indirect.

Lưu ý về tên gọi: **"độ phức tạp" không phải yếu tố rủi ro chuẩn** — nó là đại lượng thay thế cho *khả năng xảy ra lỗi* và *công sức thẩm định*. Dùng được, nhưng nên gọi đúng tên khi giải trình với thanh tra.

### 12.6 Điểm do máy chấm là ĐỀ XUẤT

Chấm rủi ro là phán quyết chuyên môn GMP. Hệ phân loại theo từ khoá — minh bạch, đọc được, tái lập được — rồi đánh dấu `criticality_source = 'auto'`. Khi QA sửa tay, dòng đó chuyển sang `'manual'` và **lần chấm tự động sau không ghi đè**.

Xem và sửa tại màn **Luật đang áp dụng** (nhóm PHÂN TÍCH) và **Danh mục nguồn**.

### Nguồn

- [Khí nén và khí trong dược: yêu cầu thử nghiệm và kỳ vọng GMP](https://www.pharmaceuticalmicrobiology.in/2026/02/compressed-air-gases-in-pharmaceuticals.html) · [GMP Grade Compressed Air — PQE Group](https://blog.pqegroup.com/commissioning-qualification-validation/gmp-grade-compressed-air-regulatory-essentials-testing) · [Nitơ trong sản xuất dược — ECA Academy](https://www.gmp-compliance.org/gmp-news/nitrogen-use-in-pharmaceutical-production)
- [ISPE Baseline Guide 5 bản 2 — ECA Academy](https://www.gmp-compliance.org/gmp-news/ispe-publishes-revised-guideline-on-commissioning-and-qualification) · [Phân loại Direct/Indirect Impact](https://mikewilliamsonvalidation.wordpress.com/2019/07/03/ispes-commissioning-and-qualification-guide-second-edition/)
