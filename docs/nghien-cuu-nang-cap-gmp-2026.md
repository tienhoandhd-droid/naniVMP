# Nghiên cứu nâng cấp web VMP theo yêu cầu GMP

_2026-07-29. Đối chiếu quy định · chẩn đoán dữ liệu thật · đề xuất theo ba nhóm việc của người dùng._

---

## Phần 1 — Chẩn đoán: hệ đang ở đâu

Trước khi bàn thêm chức năng, phải trả lời: **hệ đang được dùng đến đâu?** Số liệu đo trực tiếp trên DB hôm nay:

| Chỉ số | Con số | Ý nghĩa |
|---|---|---|
| Hạng mục đang hoạt động | 461 | Kế hoạch đầy đủ |
| Quá hạn | **162 (35%)** | |
| **Có ngày thực tế đã nhập** | **0 / 461** | ⚠️ Cả 4 giai đoạn, không một dòng nào |
| **Đã gán người phụ trách** | **5 / 461** | ⚠️ 456 hạng mục không ai chịu trách nhiệm |
| Cách viết tên của 5 người đó | `My`, `My2`, `my` | ⚠️ Một người, ba cách viết |
| Bản ghi audit từ dashboard | **0 / 93.871** | ⚠️ Chưa ai từng nhập liệu từ web |
| Vấn đề chất lượng dữ liệu | 609 | |

### Kết luận chẩn đoán

**Hệ này là một bản kế hoạch giàu có nhưng gần như không có hồ sơ thực hiện.**

Trạng thái từng giai đoạn có dữ liệu (93 hạng mục đã động vào đề cương, 73 vào thẩm định) — nhưng đó là chữ gõ trong Google Sheet, không phải bản ghi có ngày tháng, người thực hiện và lý do. Không có ngày thực tế nào. Không có ai chịu trách nhiệm.

Con số "162 quá hạn" vì thế **không đáng tin**: không phân biệt được *quá hạn thật* với *đã làm rồi nhưng chưa ai nhập*.

> **Hệ quả cho đề xuất:** thêm chữ ký điện tử hay module CAPA lúc này là lợp mái khi chưa có tường. Việc đầu tiên phải là **làm cho việc nhập liệu xảy ra được và xảy ra đúng chỗ**.
>
> Đây cũng là điều thanh tra hỏi trước tiên: *"Ai làm? Làm ngày nào? Bằng chứng đâu?"* — hiện hệ chưa trả lời được câu nào.

---

## Phần 2 — Quy định đòi gì

### 2.1 EU GMP Annex 15 — đang sửa đổi, ảnh hưởng trực tiếp

Concept paper công bố **19/01/2026**, lấy ý kiến 09/02–09/04/2026. Hướng sửa đổi:

- **Rà soát định kỳ (periodic review) được nhấn mạnh hơn** — thẩm định là hoạt động theo vòng đời, không phải làm một lần
- `URS`, `FAT/SAT`, đủ bộ `DQ/IQ/OQ/PQ`, thẩm định vận chuyển trở thành **yêu cầu tường minh** thay vì thông lệ tốt tuỳ chọn
- Mở rộng phạm vi sang nhà sản xuất nguyên liệu

Hệ hiện tại **đã sinh đúng** `DQ`/`FAT-SAT`/`IQ`/`OQ`/`PQ`/`PV`/`GSP`/`GDP` — nền tảng khớp hướng sửa đổi. Thiếu: **bản ghi rà soát định kỳ** như một đối tượng riêng (ai rà, kết luận gì, còn hiệu lực đến bao giờ).

### 2.2 EU GMP Annex 11 — hệ thống máy tính

- Audit trail phải ghi **mọi thay đổi và xoá liên quan GMP**, kèm **lý do**
- Audit trail phải ở dạng **người đọc được** và **được rà soát định kỳ** — không chỉ ghi rồi để đó
- Việc có audit trail hay không dựa trên **đánh giá rủi ro có tài liệu**

Hệ hiện tại: audit trail **rất mạnh** — 93.871 bản ghi có `old_data`, `new_data`, `changed_fields`, `change_reason`, `user_email`, `ip_address`, ghi bằng trigger DB nên người dùng không sửa được vết của mình. Đây là phần làm tốt hơn nhiều hệ thương mại.

Thiếu: **công cụ rà soát**. Có 93.871 dòng nhưng không có màn nào để QA rà định kỳ và ký xác nhận đã rà.

### 2.3 21 CFR Part 11 — chữ ký điện tử

Chữ ký phải gắn liền bản ghi và mang đủ ba thông tin: **tên người ký · thời điểm · Ý NGHĨA của chữ ký** (soạn / rà / phê duyệt). Chữ ký không sinh trắc cần **hai thành phần định danh** riêng biệt.

Hệ hiện tại: chỉ có `qa_approved_by` + `qa_approved_at` — **thiếu ý nghĩa chữ ký** và thiếu bước xác thực lại khi ký.

### 2.4 ALCOA+ — toàn vẹn dữ liệu

Nguyên tắc quan trọng nhất cho hệ này là **Contemporaneous**: ghi tại thời điểm thực hiện. Hướng dẫn WHO/EMA khuyến khích **eSource** — nhập điện tử ngay tại chỗ làm — để loại bỏ bước chép tay.

> Bối cảnh: **hơn 65% phát hiện thanh tra GMP tại châu Âu năm 2024 liên quan trực tiếp tới toàn vẹn dữ liệu và hệ thống máy tính.**

Hệ hiện tại đi ngược nguyên tắc này: thẩm định làm ở xưởng, ghi giấy, rồi ai đó gõ lại vào Sheet sau. Mỗi bước chép tay là một cơ hội sai lệch — và thực tế là **chưa ai gõ lại**, nên 0 ngày thực tế.

---

## Phần 3 — Ba nhóm việc của người dùng

### 3.1 NHẬP dữ liệu — nghẽn nặng nhất

| Ai | Việc | Rào cản hiện tại |
|---|---|---|
| QA phụ trách | Nhập ngày thực tế + trạng thái sau mỗi giai đoạn | Không biết hạng mục nào là của mình (456 chưa gán) |
| Bộ phận thực hiện | Xác nhận đã làm | Không có tài khoản — hệ chỉ có 2 người, cả hai đều admin |
| QA quản lý | Duyệt, ký | Chưa có bước ký |

### 3.2 ĐỌC dữ liệu

| Ai | Cần thấy gì | Hiện tại |
|---|---|---|
| QA phụ trách | Việc của tôi, sắp tới hạn nào | Phải tự lọc trong 461 dòng |
| Trưởng bộ phận | Bộ phận tôi còn nợ gì | Có (lọc theo bộ phận) |
| Ban lãnh đạo | Tỷ lệ hoàn thành, xu hướng | Có (Tổng quan, KPI) |
| **Thanh tra viên** | **Hồ sơ đầy đủ của MỘT thiết bị** | ❌ Không có — phải ghép từ nhiều màn |

### 3.3 TỰ ĐỘNG HOÁ

| Việc | Hiện trạng |
|---|---|
| Sinh timeline theo luật | ✅ `rpc_generate_timeline`, xem trước rồi ghi |
| Cảnh báo đến hạn qua email | ⚠️ Workflow sẵn sàng nhưng **danh sách người nhận rỗng** |
| Phát hiện lệch trạng thái | ⚠️ Phát hiện được 85 bản ghi, nhưng **không có quy trình xử lý** |
| Rà soát định kỳ | ❌ Chưa có |

---

## Phần 4 — Đề xuất, xếp theo thứ tự PHẢI làm

Nguyên tắc xếp thứ tự: **cái gì đang chặn việc nhập liệu thì làm trước**, vì không có dữ liệu thực hiện thì mọi chức năng phía sau đều vô nghĩa.

### 🔴 Đợt 1 — Gỡ nghẽn nhập liệu

**1. Chuẩn hoá người phụ trách, bỏ nhập tay tự do**
Hiện một người có ba cách viết (`My`, `My2`, `my`). Thay ô chữ tự do bằng **chọn từ `vmp_staff_emails`** đã có sẵn trên web. Gán được **hàng loạt** theo bộ phận / loại thẩm định để xử lý 456 hạng mục trong vài thao tác.
→ *Không có bước này thì không ai biết việc của mình, và mọi cảnh báo email đều không có địa chỉ gửi.*

**2. Màn "Việc của tôi"**
Đăng nhập → thấy ngay hạng mục của mình, sắp theo mốc gần nhất, tách rõ **quá hạn / tuần này / tháng này**. Không phải lọc trong 461 dòng.

**3. Nhập nhanh theo lô**
Chọn nhiều hạng mục → đánh dấu cùng trạng thái + cùng ngày + một lý do chung. Thẩm định thường làm theo đợt (một buổi làm 5 thiết bị), bắt nhập từng cái là lý do người ta bỏ không nhập.

**4. Dùng được trên điện thoại**
Thẩm định làm ở xưởng, không ngồi máy tính. Đây chính là **ALCOA+ Contemporaneous** — ghi tại thời điểm làm, không chép lại sau. Chỉ cần màn "Việc của tôi" + form nhập chạy tốt trên màn hình nhỏ.

### 🟠 Đợt 2 — Bằng chứng và hồ sơ (Annex 15)

**5. Đính kèm tài liệu**
Đề cương và báo cáo thẩm định là **bằng chứng chính khi thanh tra**. Hiện không lưu file nào. Dùng Supabase Storage + checksum + ghi vết ai tải lên lúc nào.

**6. Hồ sơ đối tượng — một trang cho một thiết bị**
Thanh tra hỏi *"cho xem hồ sơ thẩm định của máy X"* → mở ra thấy: thông tin thiết bị, toàn bộ lịch sử thẩm định qua các năm, file đính kèm, nhật ký thay đổi, chữ ký. **In ra được.**
→ *Đây là màn có giá trị cao nhất cho một cuộc thanh tra, và hiện chưa có.*

**7. Bản ghi rà soát định kỳ**
Annex 15 sửa đổi nhấn mạnh điểm này. Cần đối tượng riêng: kỳ rà, người rà, kết luận (còn hiệu lực / cần tái thẩm định), hiệu lực đến bao giờ.

### 🟡 Đợt 3 — Tuân thủ chặt (Annex 11 + Part 11)

**8. Chữ ký điện tử đúng chuẩn**
Ba thông tin bắt buộc: tên · thời điểm · **ý nghĩa** (soạn / rà / phê duyệt). Nhập lại mật khẩu khi ký (thành phần định danh thứ hai). Bảng `vmp_signatures` gắn với hạng mục, không sửa được.

**9. Màn rà soát audit trail**
Annex 11 đòi audit trail **được rà soát**, không chỉ được ghi. Cần: lọc theo kỳ, đánh dấu đã rà, ký xác nhận, xuất báo cáo rà soát.
→ *Đã có 93.871 bản ghi — nguyên liệu sẵn, chỉ thiếu công cụ.*

**10. Quy trình xử lý lệch trạng thái**
85 bản ghi đang lệch. Cần đường đi: phát hiện → gán người xử lý → ghi kết luận → đóng. Đây là mầm mống của module deviation, chưa cần làm đầy đủ CAPA.

### ⚪ Đợt 4 — Khi đã ổn định

11. Phân quyền theo bộ phận thực tế (hiện 2 tài khoản đều admin — chưa kiểm chứng được RLS theo bộ phận)
12. Ma trận rủi ro ICH Q9 chính thức (thay vì suy từ `Phân loại báo cáo`)
13. Sao lưu Supabase → Sheet

---

## Phần 5 — Đề xuất BỎ BỚT

Thêm chức năng dễ hơn bỏ, nhưng bỏ đúng chỗ làm hệ nhẹ và dễ hiểu hơn:

| Bỏ / gộp | Lý do |
|---|---|
| Cột `Điểm trọng yếu` | **0 dòng có giá trị** trong toàn bộ nguồn. Hoặc dùng thật (nuôi QRM) hoặc bỏ khỏi form để người nhập không phân tâm |
| `InventoryPage.tsx` | Mồ côi, trùng chức năng với `CatalogPage` |
| `sheet_sync_outbox`, `vmp_sheet_row_extras` | Di sản kiến trúc ghi ngược Sheet — đã vô hiệu hoá vĩnh viễn |
| Màn "Mã mất khỏi Sheet" | Chỉ có nghĩa khi Sheet là nguồn chuẩn. Nay Sheet là bản sao lưu |
| Tab thô `Mail_Log`, `Mail_Log_Index` | Nhật ký email cũ của Apps Script. Giữ trong DB để tra cứu, bỏ khỏi giao diện |

---

## Phần 6 — Một điều cần nói thẳng

Hệ này có **nền tảng kỹ thuật tốt hơn nhiều phần mềm thương mại cùng loại**: audit trail cấp Part 11, khoá lạc quan chống ghi đè, phân quyền phía server, hàng rào an toàn dữ liệu đã từng cứu hệ khỏi một sự cố thật.

Nhưng **chưa ai dùng nó để nhập liệu** — 0/461 ngày thực tế, 0 bản ghi audit từ dashboard.

Nếu chỉ được chọn **một** việc, hãy chọn **mục 1 và 2** của Đợt 1: gán người phụ trách và làm màn "Việc của tôi". Không có hai cái đó, chín mục còn lại đều không có ai để phục vụ.

---

## Nguồn tham khảo

- [Concept Paper sửa đổi Annex 15 — EMA](https://www.ema.europa.eu/system/files/documents/scientific-guideline/concept-paper-revision-annex-15-guidelines-good-manufacturing-practice-qualification-validation-en_0.pdf) · [Phân tích của ECA Academy](https://www.gmp-compliance.org/gmp-news/what-does-the-concept-paper-on-annex-15-revision-say-a-detailed-analysis) · [GMP Insiders](https://gmpinsiders.com/eu-gmp-annex-15-revision-02-2026/)
- [EU Annex 11 — yêu cầu và cập nhật](https://simplerqms.com/eu-annex-11/) · [Audit trail trong Annex 11 — GMP Journal](https://www.gmp-journal.com/current-articles/details/audit-trail-in-eu-gmp-annex-11-and-ema-concept-paper-on-annex-11.html) · [Annex 11 và toàn vẹn dữ liệu 2026 — Zamann Pharma](https://zamann-pharma.com/2026/05/07/eu-annex-11-in-year-gmp-inspection-requirements-for-data-integrity-and-computerized-systems/)
- [21 CFR Part 11 — yêu cầu chữ ký điện tử](https://simplerqms.com/21-cfr-part-11-requirements/) · [Hướng dẫn tuân thủ — IntuitionLabs](https://intuitionlabs.ai/articles/21-cfr-part-11-compliance-guide-pharma)
- [ALCOA+ và toàn vẹn dữ liệu — PharmOut](https://www.pharmout.net/data-integrity-alcoa/) · [ALCOA trong pharma 2026 — Pharmuni](https://pharmuni.com/2025/01/22/alcoa-insights-for-effective-data-management-in-pharma/)
- [Validation Lifecycle Management 2026 — GoValidation](https://govalidation.com/blog/validation-lifecycle-management-system/) · [So sánh 7 công cụ VLM 2026](https://aitechinpharma.com/7-validation-lifecycle-management-tools-compared-in-2026/)
