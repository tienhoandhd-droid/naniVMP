# Thẩm định thực tế (demo) — chung VMP Auth, database và website

Ngày 23/09/2026. User đã ủy quyền đưa dữ liệu lên cùng Supabase/web VMP và dùng giao diện/form/kiểu chữ VMP. Thay thế toàn bộ các phương án hai Supabase trước đó. Không cần hỏi lại quyền triển khai trong phạm vi này.

## Kiến trúc và tiêu chí
- VMP hiện hành32e12ff, worktree feat/tham-dinh-thuc-te. Supabase đích ivembmikfhtyzhtqebgh; CPC nguồn pgipqbjoxgujohaficuy được giữ để rollback.
- Module ở public/tham-dinh-thuc-te/, link trong menu VMP desktop/mobile. Cùng origin/project/Auth storage với VMP; SDK dùng đúng dependency của VMP. Đăng nhập qua VMP, không tạo/copy mật khẩu hay bộ tài khoản phụ; logout phải ghi rõ thoát VMP. Dùng lại 18 form, API tính/lưu/PDF đã kiểm, thay lớp trình bày bằng token/typography VMP. Fonts PDF/renderer không đổi.
- Namespace cpc1_private và public.cpc1_* riêng; không ghi vào dữ liệu nghiệp vụ VMP. Canonical vmp_is_active_session kiểm mỗi RPC/storage; owner-only write qua grant nhập riêng. Không tự cấp quyền phê duyệt từ admin/QA. QA read scope đang hỏi người dùng; default deny cross-owner đến khi chốt. Không liên kết mã kế hoạch lúc này.
- Chuyển cấu hình 3 hệ thống, bảng tra và 45 private assets theo hash. Recheck số hồ sơ thực trước chuyển, không assume trống. Nếu có hồ sơ mới thì lập mapping owner/history; không bỏ dữ liệu. Reconcile đúng người dùng với Auth VMP, không reset/copy password.

## Trách nhiệm và phụ thuộc
Primary owns DB/preflight/backup/restore/migration/hosted changes; shared Layout.tsx; backend/build/package; tests final. Worker UI chỉ public/tham-dinh-thuc-te/*.html/*.css và fonts/safe static assets; không cloud/backend/runtime-config/app/gas JS. Worker không đổi architecture/Auth/DB. Independent sol review quyền và release; primary đọc mọi diff và chạy kiểm lại.

## Thực hiện và RED/GREEN
1. Read-only preflight VMP credentials/current definitions/history/ACL plus backup DB+roles+Storage inventory; isolated PG17 restore and count/hash compare. Source reread configs/records. No migration until successful rehearsal and reviewer checkpoint.
2. RED test nav/demo absent; DB nonmember/disabled/crossowner/view-only and shared-session fail before integration. Targeted baseline access/nav/typecheck/build. Ghi lỗi có sẵn, không mở rộng scope.
3. Primary tạo migration atomic có preconditions đúng VMP canonical functions, CPC objects chưa tồn tại, isolated namespaces. Reuse math/state/version/idempotency source functions; adapt authorization/advisory prefix and guarded private bucket. Inventory/security-definer allowlist VMP được kiểm actual schema, không replay migration cũ mù. Explicit grants/revokes cho tất cả private/public RPC.
4. GREEN isolated full restore: entry config/evaluate/save/retry/version/load/PDF, nonentry/read-only cannot write, inactive/unresolved/anon deny, direct tables deny, storage write deny, record scope as confirmed. Ensure unrelated VMP counts/hashes/functions/ACL unchanged.
5. UI worker HTML/CSS VMP style, primary shared-session backend and shell nav. Build module from reviewed source with same SDK; no compiled secret. Local headless filled all18forms plus 3systems save/reload/in, responsive375/1440, dirty navigation, login once/return/logout/revoke checks. No desktop windows, no private assets in git.
6. Independent review concrete migration/UI diff + evidence; fix then rerun relevant checks. Remote additive apply + seed/hash45 assets + exact user grant; no delete VMP or CPC source. Hosted targeted E2E synthetic records/accounts tracked and cleaned by exact UUID, no persistent test pollution.
7. Authorized push/deploy VMP after targeted gates and required CI. Verify live HTTPS/main commit/assets/headless filled smoke and no second login. Record source/deployment/migration/evidence in PROJECT-STATE. No fake completion if liveblocked.

## Rollback
Frontend revert removes link/module; additive DB stays to retain new records and audit. Keep source CPC app/project intact through acceptance. Backup recoverable and complete object manifest stored outside Git. Never DROP/RESET VMP or overwrite approved data. No server permission changes via client role metadata.

## Cập nhật quyền và bằng chứng
User bổ sung: chỉ QA/Admin xem module. Đã dùng canonical viewer cho3vai admin/qa_manager/qa_staff, member thêm grantnhập; menu và URL trực tiếp cùng bị chặn với vai xưởng. Hồ sơ vẫn owner-only, không suy quyền xem toàn bộ. Migration đã review độc lập và áp đúngsha e1c3755218071aac4c1bd4a466478b6a33f622277248a9fb4aaebdf8c4d59e76 trên VMP, thư viện45assets hashmatch;64bảng nghiệp vụ VMP và toàn bộ hàm/policy cũ không đổi. Targeted38tests, typecheck/build/drift/budget qua; kiểm trình duyệt headless với Supabase thật đã qua đủ18form có dữ liệu tại375/1440, ba hệ thống lưu/mở/in PDF và không có lỗi browser. Một phiên VMP được dùng xuyên suốt; đăng xuất từ module đã kiểm làm sạch tab VMP và tab module còn lại, không đăng xuất các thiết bị khác. Trạng thái QA chỉ xem và bị từ chối được kiểm UI bằng response giả lập; ma trận vai trò được kiểm độc lập bằng PostgreSQL trên bản phục hồi. Review quyền/phát hành độc lập không còn lỗi chặn. Còn bước phát hành Pages và kiểm URL thật.
