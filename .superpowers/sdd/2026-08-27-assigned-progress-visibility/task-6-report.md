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
- Catalog và revoke-cache regressions cần được runner parent chạy lại trong focused block đầy đủ nếu thời gian CI cục bộ không đủ; không có application change trong Task 6.
