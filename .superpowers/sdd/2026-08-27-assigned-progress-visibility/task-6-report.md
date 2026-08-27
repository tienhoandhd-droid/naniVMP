# Task 6 — E2E quyền cập nhật tiến độ

## Phạm vi

- Thêm E2E trình duyệt cho luồng Dữ liệu nguồn gán QA phụ trách tới Cập nhật tiến độ.
- Chuyển matrix quyền cột sang batch-rights `{ ok: true, rights: [...] }`, với dashboard raw luôn có item và UI tự lọc theo quyền server.
- Đăng ký `e2e:progress-rights` trong package, CI mock, README, và contract suite.

Không sửa application/source hay fixture nguồn chung.

## RED/GREEN

- RED acceptance cũ: `quyen-cot-timeline` timeout vì mock không cấp `rpc_my_editable_progress_rights`, nên UpdatePage fail-closed không render item.
- GREEN: matrix được cấp exact batch envelope, raw item giữ nguyên và E2E PASS; forbidden controls được kiểm absent DOM.
- Cross-screen: E2E mới chạy browser UI thật. Đã bắt selector desktop/mobile trùng nhau; selector cuối cùng là `.vmp-chi-desktop … button[title="Cập nhật tiến độ"]`, sau đó PASS luồng owner assignment → batch reload → per-item reload → status-only write.

## Lệnh và kết quả

Node: `v24.18.0` (PATH ép `/home/admin1/.nvm/versions/node/v24.18.0/bin`).

```text
bash scripts/with-preview.sh -- node tests/e2e/phan-cong-cap-nhat-tien-do.mjs
PASS — ✅ Gán QA từ Dữ liệu nguồn cấp đúng quyền status-only ở Tiến độ

bash scripts/with-preview.sh -- node tests/e2e/quyen-cot-timeline.mjs
PASS — ✅ Matrix quyền QA/xưởng ẩn control bị cấm và lọc item chưa phân công

node --import tsx --test tests/unit/e2e-suite-contract.test.mjs
PASS — 8/8
```

## Files

- `tests/e2e/phan-cong-cap-nhat-tien-do.mjs`
- `tests/e2e/quyen-cot-timeline.mjs`
- `tests/e2e/README.md`
- `package.json`
- `.github/workflows/deploy.yml`
- `tests/unit/e2e-suite-contract.test.mjs`

## Self-review / concerns

- Request capture kiểm exact `rpc_save_catalog_object`, batch `{}`, per-item validation code và changed-only `rpc_update_progress`; mọi request ngoài preview/mock bị assert rỗng.
- Không exercise replace/remove Source Data.
- Catalog và revoke-cache regressions đã được chạy lại trong focused block đầy đủ; không có application change trong Task 6.

## Hoàn tất focused regression

- Node `v24.18.0`.
- Focused block theo brief PASS: matrix quyền, cross-screen assignment, Catalog `150 đạt · 0 hỏng`, và revoke-cache race.
- `e2e:progress-rights` PASS cả matrix và cross-screen.
- Contract CI `tests/unit/e2e-suite-contract.test.mjs` PASS `8/8`; `npm run typecheck` PASS.
- Matrix hiện pin đủ Admin, QA Manager, QA được gán, QA chưa được gán và Workshop. `scheduled_at` chỉ render trong case Admin khi server trả field đó trong allowlist; QA Manager/QA/Workshop đều không có schedule.
- Revoke-cache đã bỏ đăng nhập thật bằng phiên Supabase giả, cấp batch-rights mock, và scope modal vào `.vmp-scroll` đang hiển thị. Ba race contract được giữ: batch revoke đóng modal/xóa item; response per-item cũ về muộn không phục hồi item/modal; per-item transport failure khi focus vẫn fail-closed và không làm ứng dụng sập.
- Root cause flake cuối là mock `vmp_performers` bị generic REST handler bắt trước và trả row có `full_name`, trong khi modal cần `performer_name`; handler chuyên biệt nay chạy trước generic route và trả fixture rỗng đúng contract của test.
