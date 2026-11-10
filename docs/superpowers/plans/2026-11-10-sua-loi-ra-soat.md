# Sửa lỗi từ đợt rà soát 10/11/2026 — Kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development hoặc superpowers:executing-plans. Mỗi bước có ô `- [ ]`.

**Mục tiêu:** sửa toàn bộ lỗi tìm được khi rà web VMP ngày 10/11/2026 (bản main 65d43ab).

**Cách làm:** chia thành 3 đợt độc lập: A (Danh mục & quyền), B (Tiến độ / Tổng quan), C (Thẩm định thực tế). Mỗi đợt có commit riêng, test RED→GREEN riêng và review độc lập riêng. Đợt nào đụng SQL thì thử trên bản sao production trước, rồi mới áp production theo quy trình có sao lưu.

**Nền tảng:** React 18 + Vite + TypeScript, Supabase (PostgreSQL 17), JS thuần ở `public/tham-dinh-thuc-te`.

## Ràng buộc chung

- Worktree: `naniVMP-repo/.worktrees/ra-loi-20261110`, nhánh `fix/ra-loi-20261110`, tách từ origin/main 65d43ab.
- Không sửa công thức hay tiêu chí chấm, không đổi mẫu in, không ghi đè hồ sơ đã chốt, không tự ký hay duyệt.
- Migration mới chép NGUYÊN VĂN thân hàm production hiện tại rồi chỉ chèn phần sửa. Trước khi áp phải so thân hàm production với bản gốc trong repo.
- Mỗi lỗi phải có test chạy ĐỎ (chứng minh lỗi có thật) trước khi sửa. **Nếu test không đỏ thì lỗi đó không tồn tại → bỏ, không sửa và ghi lại.** Quy tắc này áp dụng cho mọi lỗi do agent báo mà em chưa tự kiểm (đánh dấu ⚠ bên dưới).
- Hiển thị "hôm nay" theo giờ VN, dùng `Asia/Bangkok` như các hàm `vmp_tl_*` / `cpc1_*` đang làm.
- Định nghĩa đã chốt, dùng chung cho mọi màn:
  - **Hoàn thành VMP** = `status_vmp = completed` HOẶC có `actual_vmp_date`.
  - **Quá hạn** = chưa hoàn thành VMP VÀ hạn VMP < hôm nay (giờ VN).
- Quyết định của người dùng ngày 10/11:
  - (1) PDF in thêm chữ số khi số làm tròn chạm ngưỡng, kết luận giữ nguyên.
  - (2) Hết phiên thì lưu nốt bản tạm và giữ cho đúng tài khoản đó.
  - (3) Chặn in bản cũ, giữ nguyên mẫu in.
- Kiểm tra tối thiểu sau mỗi đợt: `npm run typecheck`, `npm run test:unit`, các E2E liên quan, `npm run build`.

---

## Đợt A — Danh mục & phân quyền (có 1 migration)

### A1. Thêm đối tượng trùng mã thì báo lỗi, không ghi đè
**File:**
- `supabase/migrations/20261110150000_danh_muc_chan_trung_ma.sql` (mới): hàm `rpc_save_catalog_object__five_role_impl_20260824`, chép nguyên văn từ `20261016140000_qa_admin_assignable.sql:156`.
- `src/lib/supabaseData.ts` (khoảng dòng 1251): đổi mã lỗi thành câu tiếng Việt.
- Test SQL `tests/sql/danh-muc-chan-trung-ma.sql`.

- [ ] Trước khi sửa, kiểm mọi chỗ gọi `rpc_save_catalog_object` khi SỬA bản ghi đã có (`CatalogWorkspaceShell.tsx:1042`, `src/hooks/index.ts:675` tắt `is_active`) đều có gửi version. Nếu chỗ nào gửi null, phải sửa chỗ đó trước.
- [ ] RED: tạo đối tượng X, rồi gọi lại với cùng mã và `p_expected_version = null` → hiện tại ra `ok = true`, tên bị thay (test phải đỏ).
- [ ] Sửa: ngay sau dòng `v_created := not found;`, chèn:
  ```sql
  if not v_created and p_expected_version is null then
    return jsonb_build_object('ok',false,'error_code','OBJECT_EXISTS',
      'error','Mã '||p_object_code||' đã có trong Danh mục. Mở đối tượng đó để sửa.',
      'current_version',v_source.version);
  end if;
  ```
- [ ] GREEN, thêm ca: sửa có version đúng → đạt; version sai → `VERSION_CONFLICT`; mã mới → tạo được.
- [ ] Frontend: thông báo `OBJECT_EXISTS` hiện ngay trên form.

### A2. Thu hồi phạm vi xưởng luôn làm được ⚠
**File:** migration `20261110150000` (cùng file A1): hàm `rpc_set_source_workshop_scope_grant`, chép từ `20260828150000_source_qa_workshop_access_enforce.sql:3158`. Test `tests/sql/thu-hoi-pham-vi-xuong.sql`.
- [ ] RED: cấp phạm vi rồi ngừng hết đối tượng của khu vực → thu hồi bị trả `SCOPE_NOT_FOUND`. Cấp phạm vi rồi khoá tài khoản → thu hồi bị trả `PERSON_NOT_ELIGIBLE`.
- [ ] Sửa: hai bước kiểm `SCOPE_NOT_FOUND` / `PERSON_NOT_ELIGIBLE` chỉ chạy khi `p_is_active` là true. Thu hồi vẫn bắt buộc lý do và version.
- [ ] GREEN, kèm ca cấp mới vẫn bị chặn đúng như cũ.

### A3. Lỗi nhỏ phía giao diện
- [ ] `WorkshopScopeCoveragePanel.tsx`: khi lưu lỗi, giữ nguyên lý do đã gõ (bỏ `setReason("")` ở nhánh lỗi). Thêm unit test cho hàm xử lý kết quả nếu tách được; nếu không, kiểm bằng E2E `e2e:source-access`.
- [ ] `src/hooks/index.ts:124` (`usePerformers`) và `useAuth.ts:50`: thay catch rỗng bằng `console.error(...)`, và trả trạng thái lỗi để giao diện báo "Không tải được danh sách người thực hiện".
- [ ] Commit đợt A.

---

## Đợt B — Tiến độ / Tổng quan (có 1 migration)

### B1. QA hỗ trợ thấy hạng mục mình hỗ trợ
**File:**
- migration `20261110160000_dashboard_nguoi_ho_tro.sql`: `rpc_get_vmp_dashboard`, chép từ `20261023120000_quyen_xem_mot_lan.sql`.
- `src/features/today/todayModel.ts:123-132`, `src/features/overview/personProgressScope.ts:56,80`.
- [ ] RED (unit): hạng mục có người chính Lan, hỗ trợ Hoa → `isTodayActivityMine(item, Hoa)` ra false (thiếu id).
- [ ] SQL: thêm vào `_raw` hai trường: `support_person_id` (lấy `item.support_person_id`) và `support_person_ids` (gộp người hỗ trợ chính với QA hỗ trợ thêm trong `vmp_source_supporters` theo đối tượng). Không đổi các trường khác.
- [ ] Frontend: coi là "của tôi" khi id nằm trong `support_person_ids`.
- [ ] GREEN unit + test SQL: đóng vai QA hỗ trợ, đọc dashboard → thấy đúng hạng mục và `_raw` có id.

### B2. "Chưa hoàn thành" ở Tổng quan tính cả mục quá hạn
- [ ] RED (unit, `tally`/mô hình Tổng quan): 5 mục (1 xong, 2 quá hạn, 1 đang làm, 1 chưa làm) → hiện tại Hoàn thành + Chưa hoàn thành = 3.
- [ ] Sửa `Overview.tsx:110`: dùng `e.total - e.done`.
- [ ] GREEN: 1 + 4 = 5. Cập nhật kỳ vọng trong E2E Tổng quan nếu có.

### B3. Thống nhất định nghĩa hoàn thành / quá hạn giữa các màn ⚠
**File:** `src/lib/n8nAdapter.ts` (`deriveSt`, `deriveActivityFields` dòng 246), nơi định nghĩa `classifyVmpDeadline` / `isVmpComplete`, `progressWorkspaceModel`, `Overview.tsx:156`. SQL `rpc_team_overview_summary` (đưa vào migration B).
- [ ] RED (unit): hạng mục có `ngay_vmp = 2026-09-28`, `tt_vmp = in_progress`, hạn 01/10:
  - `deriveSt` hiện ra `over`, còn `isVmpComplete` ra true → hai kết quả khác nhau (test đỏ);
  - `rpc_team_overview_summary` hiện không tính mục này là xong.
- [ ] Sửa: `deriveSt` dùng chung `isVmpComplete`; quá hạn theo định nghĩa chung, ngày hôm nay lấy bằng `vmpToday()` (giờ VN). `rpc_team_overview_summary` thêm điều kiện "hoặc có `actual_vmp_date`".
- [ ] Dòng phụ `Overview.tsx:156` "trong đó N chưa cập nhật trạng thái": đổi thành đếm mục **có ngày hoàn thành nhưng trạng thái chưa là Hoàn thành**. Nếu đếm ra 0 thì ẩn dòng.
- [ ] "Kế hoạch / chưa làm": theo định nghĩa SQL (hạn VMP còn ≤ 30 ngày → chưa làm).
- [ ] GREEN: cùng một hạng mục, mọi màn và trợ lý cho cùng kết quả. Chạy lại `npm run doichieu` (đối chiếu số liệu) và ghi lại số trước/sau để người dùng biết con số trên Tổng quan đổi bao nhiêu.

### B4. Tab Hôm nay không báo "chờ Đề cương" cho mục đã xong ⚠
- [ ] RED (unit `todayModel`): `tt_de_cuong = completed` mà không có ngày → hiện ra `blockingStage: 'Đề cương'`.
- [ ] Sửa `todayModel.ts:93-96`: một giai đoạn tính là xong khi có ngày thực tế, hoặc có cờ done, hoặc trạng thái giai đoạn = completed. Mục đã hoàn thành VMP thì không có giai đoạn chặn.
- [ ] GREEN.

### B5. Ngày theo giờ VN ở trình duyệt và SQL
- [ ] `src/hooks/index.ts:176,204`: lấy năm theo giờ Bangkok (dùng hàm có sẵn, không viết hàm mới).
- [ ] `useChangeSummary.ts:33`: không đóng băng `today` trong `useMemo`; tính lại khi qua ngày, bám theo cách các màn khác đang làm.
- [ ] SQL `compute_item_status_v2` và `rpc_due_alerts` (production đang ở múi giờ **UTC**, đã kiểm 10/11): thay `CURRENT_DATE` bằng `(now() at time zone 'Asia/Bangkok')::date`. Đưa vào migration B.
- [ ] Test SQL: đặt `set local timezone='UTC'`, giả lập giờ 23:30 UTC (đã sang ngày mới ở VN) → hạng mục hạn hôm qua (theo giờ VN) phải bị tính quá hạn. Viết test bằng cách truyền ngày vào hàm phụ nếu hàm có tham số; nếu không thì kiểm biểu thức ngày đã đổi.
- [ ] Commit đợt B.

---

## Đợt C — Thẩm định thực tế (JS là chính, có thể có 1 migration)

### C1. Hết phiên / mất quyền: lưu nốt bản tạm, giữ cho đúng tài khoản
**File:** `public/tham-dinh-thuc-te/draft-recovery.js:111-117`.
- [ ] RED (unit hoặc E2E `qualification-*` có giả lập `SIGNED_OUT`): gõ một ô, phát `SIGNED_OUT` → hiện tại bản tạm của người đó trong IndexedDB bị xoá.
- [ ] Sửa `end()`: bỏ `clearTimeout` trước, gọi `await flush()` để lưu nốt, rồi KHÔNG gọi `store.clearActor`. Bản tạm vẫn gắn `scope = [url, userId]` nên tài khoản khác không đọc được. Nút "Xóa bản tạm" vẫn giữ để xoá tay.
- [ ] GREEN: sau `SIGNED_OUT`, đăng nhập lại đúng người → có thông báo "Có bản đang nhập…" kèm số vừa gõ. Đăng nhập người khác → không thấy.

### C2. Mở lại hồ sơ thì ô gõ được ngay; đang tải trạng thái ký thì khoá ⚠
- [ ] RED (E2E hoặc unit `run-entry.js`): `reflect(khoa = false)` sau khi đã khoá → ô vẫn `readOnly`.
- [ ] Sửa `run-entry.js:21`: `readOnly = khoa` cả hai chiều. Khi trạng thái ký đang tải hoặc tải lỗi → coi như khoá (nghiêng về an toàn).
- [ ] GREEN.

### C3. Ngưỡng xu hướng so theo ngày, không theo tháng ⚠
- [ ] RED (`node --test`): `levelFor(..., '2026-10-01')` với ngưỡng hiệu lực từ 2026-10-20 → hiện tại trả ngưỡng mới.
- [ ] Sửa `trend-limits.js:72-77`: so ngày đầy đủ `YYYY-MM-DD`, dùng ngày đo nếu có, nếu không thì ngày bắt đầu đợt.
- [ ] GREEN.

### C4. PDF in thêm chữ số khi số làm tròn chạm ngưỡng (theo quyết định 1)
**File:** migration `20261110170000_tham_dinh_in_so.sql`: hàm `row_result` (chép nguyên văn từ `20261110120000_tham_dinh_t3_canh_bao.sql`) và hàm in tương ứng của khí / BM04 nếu cũng dùng `round` cho `print_result` (kiểm `gas_row`).
- [ ] RED (SQL): Vg = 6,4, Vc = 189 → `print_result = '3.50'` trong khi `status = fail`. Độ khô 0,9496 → `'0.95'` kèm fail.
- [ ] Sửa: thêm hàm `cpc1_private.print_num(res numeric, digits int, limit numeric)`. Hàm trả số làm tròn `digits` chữ số. Nếu số đã làm tròn bằng đúng `limit` mà số gốc khác `limit`, thì tăng dần số chữ số (tối đa 6) cho đến khi số in khác `limit`. Không đổi `st`, không đổi công thức.
- [ ] GREEN: in `'3.505'` và `'0.9496'`; các số bình thường vẫn in 2 chữ số như cũ.
- [ ] Kiểm trên production (chỉ đọc): có hồ sơ nào đã lưu với `print_result` bằng đúng ngưỡng mà status khác pass/fail tương ứng không. Nếu **0 hồ sơ** thì không cần chấm lại. Nếu có, DỪNG và báo người dùng, không tự chấm lại.

### C5. PDF lọc kết quả theo phạm vi đợt ⚠
- [ ] RED: đợt khí nén chỉ gồm một phần điểm, mọi điểm trong phạm vi đều Đạt → `report()` dựng PDF với `overall = incomplete`, không tick ô Đạt.
- [ ] Sửa `src/features/qualification/backend.js:246-263`: khi in trong ngữ cảnh đợt, dùng kết quả đã lọc theo phạm vi như `cpc1_run_load` (gọi `cpc1_run_load`, hoặc dùng lại `scoped_evaluation` nếu đã có trên máy). Không đổi `print-layout.json`.
- [ ] GREEN: ô Đạt của BM05 (khí nén) / BM06 (nitơ) được tick.

### C6. Chặn in bản cũ (theo quyết định 3)
- [ ] RED: A mở v4, B lưu v5, A bấm in → hiện tại in ra v4, không có cảnh báo.
- [ ] Sửa `backend.js` `report()`: trước khi dựng PDF, đọc version hiện hành trên máy chủ (`cpc1_load` đã trả version). Nếu khác `current.version` thì không in, báo "Hồ sơ đã có phiên bản N mới hơn. Tải lại rồi in." Không đổi mẫu in.
- [ ] GREEN.

### C7. Ký và PDF không được dùng hai kết quả khác nhau ⚠
- [ ] Kiểm production (chỉ đọc): đếm hồ sơ chưa duyệt có `evaluation` đã lưu khác kết quả tính lại bằng `evaluate()` hiện hành.
- [ ] RED (SQL, bản sao): sửa tay `evaluation` đã lưu của một bản sao cho khác → ký vẫn đi qua.
- [ ] Sửa `record_sign_evaluation` (migration C): nếu kết quả tính lại khác kết quả đã lưu thì chặn ký, báo "Hồ sơ được chấm bằng công thức cũ — cần chấm lại trước khi ký". Không tự chấm lại hồ sơ nào.
- [ ] GREEN, kèm ca hồ sơ khớp vẫn ký được.
- [ ] Commit đợt C.

---

## Kiểm, review, phát hành (lặp lại cho mỗi đợt)

- [ ] Bản sao production: dump mới chỉ gồm schema + dữ liệu, chạy trong container docker cổng riêng. Áp migration, chạy toàn bộ `tests/sql` liên quan cùng các bộ cũ (`tham-dinh-*`, `catalog-*`).
- [ ] `npm run typecheck`, `npm run test:unit`, `npm run build`, các E2E liên quan (catalog, source-access, today-scope, qualification-*, tổng quan).
- [ ] Review độc lập bằng agent mới, chỉ đưa diff, không đưa kết luận của em. Sửa mọi P0/P1.
- [ ] Production, chỉ cho đợt có migration:
  - pg_dump sao lưu trước khi áp;
  - so thân hàm production với bản gốc;
  - áp migration trong một giao dịch;
  - lấy vân tay dữ liệu trước/sau, chứng minh dữ liệu không đổi;
  - `drift:db`;
  - lưu hồ sơ vào `/home/admin1/VMP/.backups/sua-loi-ra-soat-20261110-<đợt>/`.
- [ ] Push main → CI Quality and Deploy đạt 6/6 → file live khớp artifact.
- [ ] Cập nhật `PROJECT-STATE.md` (ghi rõ local / pushed / production applied / deployed) và bộ nhớ dự án.

**Duyệt kế hoạch này = đồng ý áp 3 migration lên production và push/deploy main, sau khi review độc lập đạt.** Nếu một test RED không đỏ, hoặc kiểm production ở C4/C7 ra hồ sơ cần chấm lại, em dừng và hỏi lại.
