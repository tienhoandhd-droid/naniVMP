# Kế hoạch nâng cấp VMP — đối chiếu chuẩn ngành

_Lập 2026-07-29, sau khi chuyển nơi lưu dữ liệu gốc sang Supabase._

Tài liệu này đối chiếu hệ VMP hiện tại với GAMP 5, 21 CFR Part 11, ALCOA+ và các hệ CMMS/quản lý thẩm định mã nguồn mở, rồi xếp thứ tự việc cần làm theo mức độ chặn.

---

## 0. Chặn đường: luật sinh timeline đang mồ côi

**Đây là việc phải làm trước mọi thứ khác.**

Luật sinh timeline nằm ở node `Code in JavaScript1` của workflow n8n `VMP01-Tạo timeline VMP`, và đầu ra của nó **ghi vào Google Sheet** bằng node `Append or update row in sheet1`.

Sau khi chuyển sang Supabase-first:

```
Trước:  5 tab nguồn (Sheet) ──VMP01──▶ 6.Timeline VMP (Sheet) ──WF-04──▶ Supabase
Nay:    vmp_source_objects (Supabase) ──?????──▶ vmp_plan_items (Supabase)
                                          ▲
                                    KHÔNG CÒN GÌ NỐI
```

Hệ quả cụ thể: người dùng thêm một thiết bị mới ở màn "Danh mục nguồn" → **không có hạng mục timeline nào được sinh ra**. Danh mục và timeline trở thành hai đảo rời nhau.

**Việc cần làm:** viết `rpc_generate_timeline(p_year integer)` bằng plpgsql, cài đúng luật VMP01 đã kiểm chứng (xem `docs/HANDOVER.md` mục 9b), đọc `vmp_source_objects` và sinh vào `vmp_plan_items`.

Ba ràng buộc bắt buộc giữ:

1. **Idempotent** — chạy lại không sinh trùng; các loại một-lần (`DQ`, `FAT/SAT`, `IQ`) chỉ sinh khi đối tượng chưa từng có `IQ`, đúng như `daTungIQ()`.
2. **Không đè dữ liệu nhập tay** — `6.Timeline VMP` có nhiều cột người dùng nhập (QA phụ trách, thời gian thực tế, trạng thái từng giai đoạn). Hàm chỉ được `INSERT` hạng mục mới, tuyệt đối không `UPDATE` các cột tiến độ đã có.
3. **Xem trước rồi mới ghi** — trả về danh sách dự kiến sinh để người dùng duyệt, thay vì ghi thẳng.

Sau khi có hàm này, `VMP01` chỉ còn giá trị lịch sử và nên được lưu trữ, không chạy nữa.

---

## 1. Đã đạt chuẩn — không cần làm lại

Đối chiếu cho thấy hệ hiện tại đã mạnh hơn nhiều hệ CMMS mã nguồn mở phổ biến ở đúng phần khó nhất là toàn vẹn dữ liệu:

| Yêu cầu | Chuẩn | Hiện trạng |
|---|---|---|
| Audit trail đầy đủ | Part 11 §11.10(e) | ✅ `audit_logs` 98.689 bản ghi, có `old_data`, `new_data`, `changed_fields`, `change_reason`, `user_email`, `ip_address` |
| Ghi vết độc lập | Part 11 | ✅ Trigger DB (`audit_vmp_plan_items_v2`), người dùng không sửa được vết của chính mình |
| Attributable (ALCOA+) | ALCOA+ | ✅ `updated_by = auth.uid()` trên mọi đường ghi |
| Phân quyền theo vai trò | GAMP 5 | ✅ 4 vai trò, kiểm tra trong RPC `SECURITY DEFINER` |
| Chống ghi đè đồng thời | — | ✅ Khoá lạc quan qua cột `version` |
| Kiểm soát thay đổi schema | GAMP 5 | ✅ Migration forward-only |
| Xoá mềm, giữ lịch sử | ALCOA+ (Enduring) | ✅ `is_active`, `item_state`, `delete_reason` |

---

## 2. Khoảng trống so với chuẩn, xếp theo ưu tiên

### P1 — Chặn nghiệp vụ

| # | Hạng mục | Vì sao cần | Ước lượng |
|---|---|---|---|
| 1 | `rpc_generate_timeline()` | Mục 0 ở trên — không có thì hệ đứt đoạn | Vừa |
| 2 | Màn duyệt & sinh timeline | Người dùng xem trước rồi mới ghi | Nhỏ |
| 3 | Bảng `vmp_calibration` | Hiệu chuẩn khác thẩm định: có chu kỳ riêng, giấy chứng nhận, dung sai, hạn kế tiếp. Hiện gộp chung nên không theo dõi được | Vừa |

### P2 — Tuân thủ

| # | Hạng mục | Vì sao cần | Ước lượng |
|---|---|---|---|
| 4 | Chữ ký điện tử | Part 11 §11.50/11.200: ký phải gồm tên, thời điểm, **ý nghĩa** (soạn/duyệt/phê duyệt) và 2 thành phần định danh. Hiện chỉ có `qa_approved_by` — chưa đủ | Vừa |
| 5 | Đính kèm tài liệu | Đề cương và báo cáo thẩm định là bằng chứng chính khi thanh tra. Hiện không lưu file. Dùng Supabase Storage + checksum | Vừa |
| 6 | Lý do thay đổi bắt buộc | ALCOA+: mọi sửa dữ liệu GxP cần lý do. Hiện `p_reason` là tuỳ chọn ở nhiều đường | Nhỏ |
| 7 | Rà soát định kỳ | GAMP 5 yêu cầu duy trì trạng thái đã thẩm định: bản ghi rà soát định kỳ, kết luận, người duyệt | Vừa |

### P3 — Vận hành

| # | Hạng mục | Vì sao cần | Ước lượng |
|---|---|---|---|
| 8 | Banner độ trễ dữ liệu | Sự cố 21 ngày vừa rồi không ai phát hiện vì giao diện không hiển thị độ tươi | Nhỏ |
| 9 | Sai lệch & CAPA | Thẩm định trượt phải mở deviation, gắn CAPA. Hiện chưa có | Lớn |
| 10 | Ma trận rủi ro ICH Q9 | `QrmPage` đang suy diễn từ `criticality`; chưa có bản ghi đánh giá rủi ro chính thức (mức độ nặng × khả năng × khả năng phát hiện) | Vừa |
| 11 | Tách WF-04 | Workflow gộp 5 nhánh, khó đọc và khó bảo trì | Vừa |

---

## 3. Tách WF-04 (hạng mục 11)

Workflow hiện gộp 5 nhánh trong một. Đề xuất tách:

| Workflow mới | Nội dung | Trạng thái |
|---|---|---|
| `VMP-A: Cảnh báo đến hạn` | Schedule 7h + webhook `/vmp-alert-now` → `rpc_due_alerts` → Claude soạn → Gmail | Đang dùng, giữ nguyên |
| `VMP-B: Xử lý lỗi tập trung` | Error Trigger → ghi `workflow_runs` + mail admin. Đặt làm Error Workflow cho mọi workflow VMP | Đang dùng, giữ nguyên |
| `VMP-C: Nhập Sheet (dự phòng)` | Nhánh CSV → `rpc_apply_sheet_sync`, để `active: false`, chỉ chạy tay khi cần nhập lại | Đã tắt trigger |

Hai nhánh legacy **không mang sang**: đường sync cũ dùng node Google Sheets + Diff Engine, và đường ghi ngược App → Sheet (đã vô hiệu hoá vĩnh viễn trong `rpc_update_progress`).

Lưu ý khi tách: credential (Gmail, Postgres, Anthropic) **không** nằm trong export JSON — phải gắn lại thủ công cho từng workflow mới. Đây là lý do nên tách từng cái một và chạy thử trước khi xoá nhánh cũ khỏi WF-04.

---

## 4. Tham khảo

Các hệ mã nguồn mở cùng lĩnh vực để đối chiếu tính năng — chủ yếu mạnh về work order và bảo trì phòng ngừa, **yếu hơn hệ này về audit trail và toàn vẹn dữ liệu**:

- [Grashjs/cmms](https://github.com/grashjs/cmms) — CMMS self-hosted web + mobile
- [Atlas CMMS](https://sourceforge.net/software/product/Atlas-CMMS/) — GPL-3.0, có module hiệu chuẩn thiết bị
- [SuperCMMS/Open-Source-CMMS](https://github.com/SuperCMMS/Open-Source-CMMS) — MIT
- [liberu-maintenance](https://github.com/liberu-maintenance) — Laravel/Filament
- [GitHub topic: cmms](https://github.com/topics/cmms)

Chuẩn tham chiếu:

- [GAMP 5: categories, V-model, validation — Kneat](https://kneat.com/article/what-is-gamp-5/)
- [IQ, OQ, PQ: definitions and deliverables — SimplerQMS](https://simplerqms.com/iq-oq-pq/)
- [21 CFR Part 11 audit trail requirements — SimplerQMS](https://simplerqms.com/21-cfr-part-11-audit-trail/)
- [21 CFR Part 11 compliance guide — IntuitionLabs](https://intuitionlabs.ai/articles/21-cfr-part-11-compliance-guide-pharma)
- [GAMP 5 risk-based validation 2025 update — GxPready](https://gxpready.com/gamp-5-gxp-risk-based-validation-2025/)
