# Tài liệu bàn giao hệ thống VMP Monitor

_Cập nhật: 2026-07-29. Dành cho người tiếp nhận nghiên cứu/vận hành tiếp._

## 0. Bàn giao gọn — 3 bước

1. **Quyền:** người bàn giao mời người nhận vào 4 chỗ: GitHub repo này, Supabase project `ivembmikfhtyzhtqebgh`, n8n `n8n.cpc1hn.com`, Google Sheet `6.Timeline VMP` (Editor + xem Apps Script).
2. **Bí mật:** chuyển đúng **1 gói** qua kênh an toàn (password manager / tin nhắn tự hủy): nội dung `.env` + `.env.local` (mẫu: `.env.example`, `.env.local.example`) và token webhook `x-vmp-sync-token` mới (đặt trong n8n Header Auth + Script Properties của Apps Script, khóa `VMP_SYNC_TOKEN`).
3. **Người nhận tự nghiệm thu:** clone repo → điền 2 file env → chạy `bash scripts/handover-check.sh` (kiểm tra npm, env, kết nối Supabase, tải CSV Sheet, n8n sống — in ✅/❌ kèm cách sửa) → `npm install && npm run dev`. 7/7 ✅ là bàn giao xong phần kỹ thuật; còn lại đọc tài liệu này.

Chi tiết từng phần ở các mục dưới.

## 1. Kiến trúc tổng thể

**Từ 2026-07-29 chiều dữ liệu đã ĐẢO:** Supabase là nơi lưu dữ liệu chính, web là nơi nhập liệu, Google Sheet chỉ còn là bản tham chiếu/sao lưu.

```
Web (React/Vite, GitHub Pages)  ── nhập/sửa/xoá qua RPC ──▶  ┌──────────────┐
                                                              │              │
Google Sheet ──(nhập lại khi cần, Vani VMP 3 chạy tay)─────▶  │   SUPABASE   │
                                                              │ dữ liệu chính│
n8n Vani VMP 1 (cảnh báo) ◀── đọc rpc_due_alerts ──────────── │              │
                                                              └──────────────┘
```

Kiến trúc CŨ (Sheet là nguồn chuẩn, sync 5 phút Sheet → Supabase) đã ngừng: nhánh sync của `Vani VMP 3` tắt có chủ đích, vì snapshot-replace sẽ xoá đè dữ liệu nhập từ web.

Chi tiết kiến trúc: `docs/architecture-2026-07.md`, hợp đồng dữ liệu: `docs/data-contract.md`.

## 2. Các thành phần và vị trí trong repo

| Thành phần | Vị trí / định danh |
|---|---|
| Frontend React + Vite | `src/` (chạy: `npm install && npm run dev`) |
| Workflow n8n WF-04 (export đầy đủ) | `n8n/wf-04-canonical-sync/workflow.full.json` (id n8n: `LArr1nhj3jzFjJLs`) |
| Code node chính của WF-04 (bản rời để đọc) | `n8n/wf-04-canonical-sync/parse-sheet-csv.js`, `apply-canonical-snapshot.sql` |
| Apps Script gắn với Sheet | `n8n/apps-script/vmp-sheet-sync.gs` |
| Migration Supabase (forward-only, nguồn chân lý) | `supabase/migrations/*.sql` |
| **Bộ SQL dựng DB từ đầu** (schema + RLS/grant + seed cấu hình) | `supabase/bootstrap/` — cách dùng ở mục 2b ngay dưới |
| Google Sheet nguồn | id `1MPG6YbR6m-YrENqb8u7uS3O8RUYk7GCYuzQRbShtqP8`, tab `6.Timeline VMP` (gid 1252715724) |

### 2b. Dựng lại database từ đầu (`supabase/bootstrap/`)

Dựng toàn bộ DB VMP trên project Supabase mới (hoặc Postgres 17+ bất kỳ), không cần chạy lần lượt migration lịch sử:

```bash
# 1. Schema: 19 bảng, 46 hàm (đủ bộ rpc_*), view, index, trigger, RLS policy + GRANT
psql "$SUPABASE_DB_URL" --single-transaction -f supabase/bootstrap/01_schema_full.sql
# 2. Dữ liệu cấu hình: departments (5), vmp_deadline_rules (4), system_config (12)
psql "$SUPABASE_DB_URL" --single-transaction -f supabase/bootstrap/02_seed_config.sql
```

- **Dữ liệu nghiệp vụ KHÔNG cần restore** — publish WF-04 (hoặc POST `/webhook/vmp-sheet-changed`) để sync từ Sheet, vì Sheet là nguồn chuẩn.
- Chạy ngoài Supabase (Neon/Postgres thường): tạo trước 3 role `anon`, `authenticated`, `service_role`; bảng `profiles` tham chiếu `auth.users` nên tài khoản phải tạo qua Supabase Auth (không seed được).
- Dump từ DB thật ngày 2026-07-23 (`pg_dump --schema-only --no-owner`). Migrations vẫn là nguồn chân lý khi sửa schema tiếp; migration mới hơn 2026-07-23 áp bình thường sau khi bootstrap.

## 3. Các workflow n8n (đã tách 2026-07-29)

WF-04 trước đây gộp 5 nhánh trong một workflow, rất khó đọc. Nay tách thành:

| Workflow | id n8n | Nội dung | Trạng thái |
|---|---|---|---|
| **Vani VMP 1 — Cảnh báo đến hạn** | `udqyfoWTbpl4amKM` | Schedule + webhook `/vmp-alert-now` → `rpc_due_alerts` → ghép người nhận (Sheet `CanhBao`) → chống trùng → Claude soạn → Gmail | ⏸ inactive, **chờ nghiệm thu** |
| **Vani VMP 2 — Xử lý lỗi tập trung** | `LbAmGv9gGGdQRiEb` | Error Trigger → ghi `workflow_runs` + email admin. Đặt làm Error Workflow cho 2 workflow kia | ⏸ inactive, **chờ nghiệm thu** |
| **Vani VMP 3 — Nhập Sheet (dự phòng)** | `LArr1nhj3jzFjJLs` | Chính là WF-04 đổi tên. Giữ nguyên nhánh sync CSV (2 trigger đã tắt) | 🔵 active nhưng nhánh sync đã tắt |
| **Vani VMP 5 — Nhận xét AI cho báo cáo** | `RWwTaTtzjjfgE5np` | Webhook `/vmp-ai-report` (web bấm nút) + Schedule 7h (đang tắt) → đọc số từ Supabase → OpenAI `gpt-4o-mini` → trả chữ về web **và/hoặc** gửi mail HTML qua SMTP | 🟢 active |

Mã nguồn SDK của 2 workflow mới: `n8n/vani-vmp-1-canh-bao/`, `n8n/vani-vmp-2-xu-ly-loi/`.
Mã các node của VMP 5: `n8n/vani-vmp-5-nhan-xet-bao-cao/`.

### 3d. Vani VMP 5 — nhận xét & phân tích AI, kèm gửi mail (2026-07-30)

**Hai loại phân tích, cùng một workflow** (`loai` trong body):

| `loai` | Gọi từ đâu | Nội dung |
|---|---|---|
| `bao_cao` | Trang **Báo cáo & AI** → nút *Thêm nhận xét AI* | Nhận xét cho báo cáo quản lý: tiến độ, mục tiêu 50%/tháng, kế hoạch tháng tới |
| `canh_bao` | Trang **Cảnh báo & Rủi ro** → nút *Phân tích cảnh báo* | Quá hạn nặng nhất, thứ tự xử lý theo ICH Q9, ai đang ôm nhiều việc trễ |

**Kỳ báo cáo (2026-07-31).** Web gửi kèm `ky: { nam, thang_tu, thang_den, nhan }`;
truy vấn nhận 7 tham số (`$1` phạm vi, `$2` năm, `$3`/`$4` dải tháng của kỳ, `$5`–`$7`
của kỳ sau). Thiếu `ky` → cả năm hiện tại, nên trang Cảnh
báo và đường chạy theo lịch không phải đổi gì.

**BA MỤC MẶC ĐỊNH ở đầu trang Báo cáo** (chốt 2026-07-31) — thẻ *Tổng quan nhanh*, đặt
TRÊN bộ lọc và **cố ý không đổi theo bộ chọn kỳ**; chỉ chịu ảnh hưởng của bộ lọc bộ
phận/khu vực/trọng yếu. Mở trang ra là thấy ngay, không phải bấm gì trước:

| Ô | Nội dung | Số thật 2026-07-31 |
|---|---|---|
| 1 | Năm hiện tại — so mục tiêu 50% | 19% (83/443) |
| 2 | Tháng hiện tại — so mục tiêu 50%, kèm tháng trước | 5% (3/60) · T6: 28% (7/25) |
| 3 | Tháng tiếp theo — kế hoạch phải hoàn thành VMP | 80 hạng mục · xsx 64 · qc 10 · cd 4 |

Cả ô 1 và 2 đều là kỳ ĐANG DIỄN RA nên chỉ được ghi "tạm đạt/tạm dưới · số giữa kỳ" —
không bao giờ chốt "chưa đạt" cho một kỳ chưa kết thúc.

**CHỈ SỐ CHÍNH LÀ HOÀN THÀNH VMP** (chốt 2026-07-31). Hạng mục thuộc tháng nào là theo
**mốc đích VMP**, và `da_xong` là `status_vmp = 'completed'`. **Không có bộ chọn mốc** —
một báo cáo quản lý chỉ được có MỘT định nghĩa "xong", nếu không thì hai người đọc cùng
một trang sẽ ra hai kết luận khác nhau.

Mức hoàn thành **đề cương / thẩm định thực tế / hồ sơ** vẫn trả về đầy đủ (phễu 4 giai
đoạn ở mục 1, `bat_cap_theo_bo_phan` ở mục 4, và các cột `de_cuong`/`tham_dinh`/`bao_cao`
trong CSV) — nhưng là **dữ liệu bổ sung để xem tình hình**, không phải thước đo mục tiêu.
Giao diện tách hẳn hai hàng: ô "★ Hoàn thành VMP — chỉ số chính" đứng riêng, ba mức giai
đoạn xuống dưới nhãn "DỮ LIỆU BỔ SUNG".

_Đã thử rồi bỏ (cùng ngày):_ bộ chọn mốc chia tháng. Chia theo hạn **đề cương** (T−60)
thì tháng 6 ra **80 hạng mục / 0 hoàn thành / 0%** — mốc đích của chúng còn ở tháng 8,
đọc như trượt thảm hại trong khi thực ra là chưa tới hạn. Chia theo hạn **thẩm định** thì
gần như không khác mốc đích (**442/442 hạng mục có hai hạn này rơi cùng một tháng**), tức
thêm một cái núm chỉ để đổi 28% thành 29%. Đừng dựng lại cái núm đó.

Truy vấn có **hai tập dữ liệu, dùng sai là ra số vô nghĩa**:

| Tập | Nội dung | Dùng cho |
|---|---|---|
| `items_nam` | toàn bộ hạng mục của năm | `theo_thang` (biểu đồ 12 tháng), `sap_toi_han_60_ngay` |
| `items` | `items_nam` ∩ **mốc đích VMP** rơi vào kỳ | mọi thứ còn lại — tương ứng `scopedKy` bên web |
| `items_sau` | kỳ SAU, đọc lại bảng gốc vì kỳ sau có thể sang năm khác | `thang_toi` |

Ba tập đều đo hoàn thành bằng `status_vmp`.

⚠️ `items` đòi `deadline_vmp is not null`, nên tổng toàn năm là **443 chứ không phải
448**: 5 hạng mục chưa có mốc đích không thuộc kỳ nào và được đếm riêng ở
`chua_co_moc_dich`. Web hiển thị đúng con số đó cạnh bộ lọc.

**Mail = dashboard tĩnh + hai tệp đính kèm** (người dùng chốt 2026-07-31):

| Phần | Nội dung |
|---|---|
| Thân mail | số chính · phân tích AI · **3 biểu đồ** · bảng quá hạn · 60 dòng dữ liệu thô đầu · link dashboard sống |
| Đính kèm 1 | `DuLieuTho_VMP_<kỳ>.csv` — toàn bộ dòng, `;` + BOM UTF-8 để Excel tiếng Việt mở đúng |
| Đính kèm 2 | `Dashboard_VMP_<kỳ>.html` — cùng dashboard nhưng **đủ dòng**, mở thẳng bằng trình duyệt |

⚠️ **Biểu đồ trong mail phải dựng bằng bảng HTML lồng nhau + `width` phần trăm +
`bgcolor`.** Hộp thư không chạy JavaScript, và Gmail còn cắt luôn thẻ `<svg>` — nên
KHÔNG dùng lại `reportCharts.ts` (SVG) hay `<canvas>` cho mail, người nhận sẽ thấy ô
trống. Ba biểu đồ hiện có: tỷ lệ 12 tháng so mục tiêu 50% · bộ phận nghẽn ở giai đoạn
nào · khối lượng kỳ sau theo bộ phận.

Phần "động" thật là **link tới dashboard** ở cuối mail (`TRANG_DASHBOARD` trong node
`Đóng gói cho web`) — mail chỉ là ảnh chụp lúc gửi, và nói rõ điều đó với người đọc.

Cả hai tệp gắn vào `binary` ở node `Bung người nhận` (`du_lieu_tho`, `dashboard_html`);
node Send Email khai `options.fileAttachments = "du_lieu_tho,dashboard_html"` — nó chỉ
đính kèm được từ binary property, không nhận chuỗi.

**Hai đường vào:**

1. `POST /webhook/vmp-ai-report`, header `x-vmp-chat`.
   Body: `{ loai, pham_vi, gui_mail, email_nhan[], dung_danh_sach }`.
2. Schedule 7h sáng — **đang `disabled` có chủ đích**. Bật khi đã khai người nhận và
   thử nút gửi tay. `rpc_ai_mail_targets(current_date, false)` lọc ai tới lượt theo cột
   `ai_report_schedule` (*hằng tuần* = thứ Hai, *hằng tháng* = ngày 1), gom **một dòng
   mỗi phạm vi** vì AI phải chạy riêng cho từng bộ phận.

**Người nhận mail** khai ở web: *Danh mục & Nhập liệu → Người nhận mail*. Bảng
`vmp_alert_recipients` phục vụ **hai** loại mail bằng hai cờ độc lập:
`is_enabled` (nhắc từng hạng mục — Vani VMP 1) và `ai_report_enabled` (bản phân tích
tổng hợp — Vani VMP 5).

**Ba quyết định thiết kế, đừng vô tình phá:**

- **Một lần chạy AI dùng cho cả web và mail.** Tách ra thì cùng một phạm vi có hai bản
  chữ khác nhau, người đọc mail và người xem web sẽ cãi nhau về số.
- **Số trong mail do n8n đọc lại từ Supabase**, không nhận từ trình duyệt. Mail là thứ
  gửi ra ngoài, không được phụ thuộc tab đang mở đã cũ tới đâu.
- **Node `Gửi mail phân tích` để `onError: continueRegularOutput`.** Một địa chỉ sai
  không được chặn những địa chỉ còn lại, và web vẫn phải nhận câu trả lời thay vì treo
  tới lúc timeout. `Gom kết quả gửi` đọc trường `error` để báo đúng địa chỉ nào hỏng.

**Chống bịa số — cái gì tính được thì tính sẵn trong Code node, đừng để mô hình chọn.**
Ngày 2026-07-30 `gpt-4o-mini` đã mắc hai lỗi thật với dữ liệu thật:

- *"nhóm trọng yếu cao có 149 hạng mục, trong đó 159 quá hạn"* — 159 là tổng quá hạn
  **toàn nhà máy**. Nguyên nhân: `theo_muc_trong_yeu` từ SQL chỉ có `tong`/`xong`, không
  có `qua_han`, nên nó ghép bừa. Đã tính sẵn `qua_han` từng nhóm trong `Dựng prompt tổng hợp`.
- *"qc nghẽn ở thẩm định thực tế với 64"* — 64 là `qua_han_vmp`, còn giai đoạn nghẽn thật
  là *báo cáo* (71). Đã tính sẵn `giai_doan_nghen_nhat` + `so_cham_o_giai_doan_nghen`.

Tương tự, câu nói về tháng hiện tại được **tính sẵn** thành `cach_noi_ve_thang_hien_tai`:
rào chắn dạng "đừng nói tháng đang diễn ra là chưa đạt" viết chung chung thì mô hình vẫn
vi phạm; đưa hẳn câu phải nói thì nó tuân.

### 3a. ⚠️ Việc phải làm trước khi bật 2 workflow mới

**n8n không phơi credential qua API**, nên bước tách không mang theo được. Mở từng workflow, kiểm tra và gắn lại:

| Node | Credential cần |
|---|---|
| Mọi node Postgres | `VMP Supabase Postgres` |
| `1. Đọc Sheet người nhận`, `10. Gửi Gmail`, `2. Email admin` | `kết nối google` (Service Account) |
| `Trigger: chạy ngay` | `x-vmp-secret` (Header Auth) |
| `8. Soạn cảnh báo (Claude AI)` | **Header Auth riêng**: Name `x-api-key`, Value = Anthropic API key |

Thứ tự an toàn: gắn credential → chạy thử tay → bật Vani VMP 1 + 2 → **rồi mới** gỡ nhánh cảnh báo/lỗi khỏi Vani VMP 3.

### 3b. Ba sai lệch phát hiện khi tách

1. **Đã sửa trong bản mới:** node `2. Lấy hạng mục đến hạn` tham chiếu `$('CONFIG')` — nhưng `CONFIG` là node của nhánh JWT khác và **không có `SOON_DAYS`**. Ngưỡng "sắp đến hạn" đã luôn là `undefined`. Bản mới dùng `$('CONFIG1')`.
2. **Giữ nguyên, cần bạn quyết:** trigger tên "Schedule (hằng ngày 7h)" thực tế cấu hình `{field: "hours"}` = **chạy mỗi giờ**, không phải 7h sáng. Không tự đổi vì đó là thay đổi hành vi.
3. Hai nhánh legacy (Diff Engine cũ, ghi ngược App → Sheet) **không mang sang** — đường ghi ngược đã bị vô hiệu hoá vĩnh viễn trong `rpc_update_progress`.

## 3c. WF-04 cũ — hệ nào dùng, hệ nào không (lịch sử)

WF-04 gộp 5 nhánh trong 1 workflow. Node bị `disabled` là **tắt có chủ đích**, khi import lại đừng bật:

**Đang dùng (khi workflow được publish):**
1. **Sync Sheet → Supabase đường CSV**: webhook `/webhook/vmp-sheet-changed` (Apps Script gọi) + Schedule 5 phút → Download CSV → Parse CSV → `rpc_apply_sheet_sync`. Toàn bộ logic upsert nằm trong SQL.
2. **Email cảnh báo đến hạn**: Schedule 7h sáng + `/webhook/vmp-alert-now` → `rpc_due_alerts` → Claude AI soạn → Gmail.
3. **Error Trigger**: ghi `workflow_runs` + email admin khi lỗi.

**Không dùng (legacy, node disabled):**
4. Đường sync cũ dùng node Google Sheets + Diff Engine (Router → INSERT/UPDATE/MARK MISSING/CONFLICT) — đã thay bằng đường CSV.
5. Chiều ghi ngược App → Sheet (`/webhook/vmp-write` + outbox drain 1 phút) — node ghi Sheet bị tắt; dữ liệu hiện chảy **một chiều** Sheet → Supabase.

## 4. Trạng thái hệ thống (kiểm chứng 2026-07-29)

> ⚠️ Mục này chép trạng thái nên **mục rữa theo thời gian**. Đừng tin số ở đây —
> chạy `bash scripts/handover-check.sh` để lấy trạng thái thật trong ~1 phút.

- **WF-04 `active: true`**, Schedule 5 phút đang chạy.
- Lần sync thành công cuối: **2026-07-29 00:54 UTC** — 464 dòng nguồn → 461 ID duy nhất, 217 đối tượng, 3 ID trùng.
- `vmp_plan_items`: 461; `vmp_objects`: 217; `vmp_sheet_sync_runs`: 204 lần chạy.
- Các workflow BMS/EM/HEPA khác trên cùng n8n **không thuộc** hệ VMP này.

**Khôi phục vận hành:** vào n8n publish WF-04 → sync 5 phút tự bắt kịp, hoặc POST `/webhook/vmp-sheet-changed` với header `x-vmp-sync-token` để sync ngay.

### 4b. Sự cố 2026-07-08 → 2026-07-29: sync đứng 21 ngày trong im lặng

Đáng đọc vì nó chỉ ra một điểm mù còn nguyên trong thiết kế cảnh báo.

**Diễn biến.** Tab `6.Timeline VMP` bị dán trùng nội dung 21 lượt → 9.724 dòng nhưng chỉ 461 ID duy nhất. Guard `VMP_SYNC_ROW_GUARD` chặn snapshot, đúng như thiết kế, nên **Supabase không bị ghi đè** — hàng rào an toàn đã làm tròn việc. Sau khi Sheet được dọn về 464 dòng, sync tự bắt kịp ngay ở lần chạy kế tiếp, không cần can thiệp tay.

**Điểm mù.** Suốt 21 ngày đó, Error Trigger vẫn nổ **mỗi 5 phút** và vẫn gửi mail đều đặn. Nhưng vì mọi mail giống hệt nhau nên không ai đọc, và dashboard vẫn hiển thị bình thường — **không có dấu hiệu nào cho người dùng biết dữ liệu đã cũ 21 ngày**.

**Bài học.** Cảnh báo khi *có lỗi* là chưa đủ; phải cảnh báo khi *thiếu thành công*. Mục 3b của `scripts/handover-check.sh` nay làm việc này (dead-man's switch, ngưỡng mặc định 30 phút, chỉnh bằng `VMP_SYNC_MAX_LAG_MIN`). Câu truy vấn cốt lõi:

```sql
select now() - max(created_at) as do_tre
from public.vmp_sheet_sync_runs where status = 'completed';
```

Nên gắn thêm vào dashboard một banner "dữ liệu cập nhật lúc …" để độ trễ luôn hiển thị trước mắt người dùng — hiện **chưa có**.

**Việc còn để ngỏ:** ngưỡng guard `450..5000` giữ nguyên (đúng); migration `20260729020000_row_guard_diagnostic_message.sql` chỉ làm thông báo lỗi tự chẩn đoán hơn — xem mục 8.

## 5. Quyền truy cập cần bàn giao kèm

| Tài nguyên | Ghi chú |
|---|---|
| GitHub repo | `tienhoandhd-droid/naniVMP` |
| n8n instance | `https://n8n.cpc1hn.com` (kèm credential Gmail, Postgres, Anthropic trong n8n — **không** nằm trong export JSON) |
| Supabase project VMP | `ivembmikfhtyzhtqebgh` — kết nối bằng `SUPABASE_DB_URL` trong `.env.local` (gitignored, phải chuyển riêng qua kênh an toàn) |
| Google Sheet + Apps Script | Sheet id ở mục 2; Apps Script gắn trong Sheet (Extensions → Apps Script) |
| Frontend env | Xem `src/lib/config.js` / `src/lib/supabaseClient.js`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON`, `VITE_VMP_READ_URL`, `VITE_VMP_WRITE_URL` |

## 6. Ràng buộc kỹ thuật quan trọng (dễ vấp)

1. **Luật tách bộ phận có 2 bản phải đồng bộ**: `parseDepts()` trong `src/utils/helpers.js` (JS) và `public.vmp_parse_depts(text)` (SQL trong migration). Sửa một nơi phải sửa nơi kia. Mã bộ phận Xưởng sản xuất là `xsx` (không phải `sx`).
2. **Sheet rộng hơn 37 cột canonical** — 2 chiều bộ phận khác nhau: `bo_phan_goc` (cột 5 trong 37, → `depts`) và `bo_phan_thuc_hien_goc` (cột phụ ngoài 37, lưu `source_sheet_data`, → `exec_depts`). `values_json` luôn đúng 37 phần tử (có guard).
3. **Supabase là read model**: chỉ n8n/Postgres service được ghi snapshot (migration `enforce_sheet_canonical_read_only`). Đổi schema chỉ qua migration mới trong `supabase/migrations/`, áp bằng `psql --single-transaction -f`.
4. **Parse CSV thô, không dùng node Google Sheets** trong n8n cho đường sync — node Sheets làm sai kiểu dữ liệu ngày/số.

## 7. ⚠️ Bảo mật — việc cần làm ngay khi tiếp nhận

- Token webhook `x-vmp-sync-token` cũ (`tienhoan2025`) **đã lộ trong lịch sử git** — dù code hiện tại đã đọc token từ Script Properties (khóa `VMP_SYNC_TOKEN`), vẫn **bắt buộc đặt token MỚI** khi tiếp nhận: đổi trong n8n (Header Auth của WF-04) + đặt Script Property trong Apps Script. Không ghi token vào code nữa.
- `.env.local` chứa chuỗi kết nối role postgres (bypass RLS) — tuyệt đối không commit, chuyển giao qua kênh riêng.
- Anon key Supabase xuất hiện trong workflow JSON là key công khai (by design), không phải rò rỉ.
- ⚠️ **Repo `tienhoandhd-droid/naniVMP` đang ở chế độ PUBLIC.** Cân nhắc chuyển sang private, hoặc ít nhất đừng ghi chuỗi token thật vào tài liệu — viết "token cũ đã lộ, tra bằng `git log --all -S`" là đủ.

## 8. Migration chờ áp (chưa chạy trên production)

| File | Nội dung | Trạng thái |
|---|---|---|
| `supabase/migrations/20260729020000_row_guard_diagnostic_message.sql` | `VMP_SYNC_ROW_GUARD` in thêm số ID duy nhất + tỉ lệ lặp + hướng xử lý | ✅ Đã kiểm thử trong transaction rollback; ❌ **chưa áp** |

Thông báo cũ → mới:

```
cũ:  VMP_SYNC_ROW_GUARD: source row count 9724 is outside 450..5000
mới: VMP_SYNC_ROW_GUARD: 9724 dong / 461 ID duy nhat (ti le lap 21.1x)
     - ngoai khoang 450..5000. Sheet bi dan trung: DON SHEET, KHONG noi nguong guard.
```

Chỉ đổi phần thông báo lỗi — ngưỡng và logic giữ nguyên; phần chẩn đoán chỉ chạy khi sắp raise nên đường chạy bình thường không tốn thêm. Áp bằng:

```bash
psql "$SUPABASE_DB_URL" --single-transaction -f supabase/migrations/20260729020000_row_guard_diagnostic_message.sql
```

## 8b. ⚠️ Bảo mật đã sửa: RPC ghi từng mở cho `anon`

Supabase đặt sẵn `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon`, nên **mọi function mới tạo đều tự động có `anon=X`**.

Hệ quả: cách thường dùng `REVOKE EXECUTE ... FROM PUBLIC` — và cũng là cách các migration trước của dự án này dùng — **không gỡ được**, vì quyền cấp đích danh cho `anon` chứ không kế thừa qua `PUBLIC`. Rà ngày 2026-07-29 thấy **10 RPC ghi** đang mở cho `anon`, trong đó có `rpc_generate_timeline` mà migration trước tưởng đã đóng.

Vì sao đáng lo: dashboard chạy trên GitHub Pages công khai và anon key là key công khai. Chưa khai thác được vì mọi RPC đều tự kiểm quyền bên trong (`auth.uid()` → `profiles`), nhưng đó là lớp phòng thủ cuối.

Đã xử lý bằng `supabase/migrations/20260729070000_revoke_write_rpc_from_anon.sql`: gỡ cả hai đường (`FROM anon` và `FROM public`), đổi default privilege để không tái diễn, kèm hậu kiểm tự chặn migration nếu còn sót. Kết quả: **0 RPC ghi mở cho anon**, 15 RPC vẫn dùng được cho người đăng nhập, RPC đọc giữ nguyên.

**Khi thêm RPC ghi mới:** luôn `revoke execute ... from anon, public` rồi `grant ... to authenticated, service_role`, và kiểm lại bằng `has_function_privilege('anon', ...)`.

## 9. Danh mục nguồn trên Supabase (2026-07-29)

Trước đây chỉ tab `6.Timeline VMP` có mặt trên Supabase. Nay 5 tab danh mục nguồn + tab sản phẩm GMP đã được đưa lên, phục vụ việc chuyển Supabase thành nơi lưu dữ liệu gốc.

| Bảng | Số dòng | Nội dung |
|---|---|---|
| `vmp_source_objects` | 264 | Đối tượng thẩm định gộp từ 5 tab, đã khử trùng (dòng xuất hiện sau thắng — cùng quy tắc timeline dùng) |
| `vmp_source_rows` | 310 | Bản thô mọi dòng mọi tab, giữ cả dòng thiếu mã để đối chiếu |
| `vmp_products_gmp` | 31 | Danh mục sản phẩm/cỡ lô từ tab `DM TDQTSX show GMP` |

Migration: `supabase/migrations/20260729030000_source_catalogs.sql` (đã áp).
Nạp dữ liệu: `python3 scripts/import-source-catalogs.py` — chạy lại được, thay toàn bộ trong một transaction; `--dry-run` chỉ sinh SQL.

**Nghiệm thu:** 217 đối tượng có `validate_flag='y'` — **khớp chính xác** 217 dòng của `vmp_objects` sinh từ timeline. Chuỗi Sheet → luật → timeline → Supabase nhất quán đầu-cuối.

### 9b. Luật sinh timeline — nguồn chân lý

**Tab `0.Rule timeline VMP` KHÔNG phải luật chuẩn.** Bản rà đầy đủ: [`docs/rule-vmp01.md`](rule-vmp01.md). Luật chuẩn là node `Code in JavaScript1` của workflow n8n `VMP01-Tạo timeline VMP` (id `Dr5zFBSIjAvVFTCq`). Đã kiểm chứng 2026-07-29 bằng cách dựng lại thuật toán và so với dữ liệu thật: **439/439 ID khớp, 0 thiếu**. 22 dòng chênh là `DQ`/`FAT-SAT`/`IQ` — loại một-lần mà cơ chế `daTungIQ()` cố ý không sinh lại; đúng thiết kế.

**Dữ liệu nguồn còn thiếu (5 đối tượng, gây chuỗi `"Không xác định do thiếu…"` trong cột ngày của timeline):**

| Loại | Mã | Tên | Thiếu |
|---|---|---|---|
| Quy trình | `TDSX-X5-R011` | Ketofen-Drop | Tháng thẩm định đầu tiên |
| Quy trình | `TDSX-X5-024` | Cafein | Tháng thẩm định đầu tiên |
| Quy trình | `TDSX-X5-R007` | Moxieye | Tháng thẩm định đầu tiên |
| Quy trình | `TDSX-X5-123` | Sugam | Tháng thẩm định đầu tiên |
| Vận chuyển | `S1` | Thẩm định phương tiện vận chuyển: xe ô tô | Tháng thẩm định đầu tiên |

Điền cột này trong Sheet nguồn là 5 dòng đó tự tính được đầy đủ mốc thời gian.

## 10. Nhập liệu trên web — màn "Dữ liệu & Nhập liệu"

Từ 2026-07-29 toàn bộ việc nhập liệu làm trên dashboard, Google Sheet chỉ còn là bản sao lưu. Màn này gộp 4 bộ dữ liệu, mỗi bộ đều xem / thêm / sửa / xoá được:

| Bộ | Bảng | Số dòng | Thay cho tab Sheet |
|---|---|---|---|
| Danh mục nguồn (5 loại) | `vmp_source_objects` | 264 | 1→5 |
| Người nhận cảnh báo | `vmp_alert_recipients` | 0 | `CanhBao` |
| Danh bạ nhân sự | `vmp_staff_emails` | 4 | `Danh_sach_Email` |
| Sản phẩm GMP | `vmp_products_gmp` | 31 | `DM TDQTSX show GMP` |

Thêm nút **Sinh timeline** ở tab Danh mục nguồn: xem trước rồi mới ghi, idempotent, không đè cột nhập tay.

**Quyền:** chỉ `admin` / `qa_manager` ghi được. Kiểm tra nằm phía server trong RPC (`SECURITY DEFINER` đọc `profiles` theo `auth.uid()`), giao diện chỉ ẩn nút cho gọn — không phải lớp bảo mật.

### 10a. Việc còn để ngỏ

1. **`vmp_alert_recipients` đang rỗng.** Vani VMP 1 dù bật cũng không gửi cho ai — nhập danh sách ở màn này trước khi nghiệm thu workflow.
2. **Vani VMP 1 vẫn đọc người nhận TỪ SHEET** (node `1. Đọc Sheet người nhận`). Sau khi nhập xong trên web, đổi node đó sang đọc `vmp_alert_recipients` để cắt hẳn phụ thuộc Sheet.
3. Các tab chỉ mang tính lịch sử (`Mail_Log`, `Mail_Log_Index`, `Giao việc`, `Rule VMP state`, `0.Rule timeline VMP`) đã nằm trong `vmp_source_rows` dạng thô, chưa dựng màn riêng vì chưa có nhu cầu sửa.

## 11. Màn "Kiểm tra máy chủ" — đưa năng lực Supabase lên web

Rà 2026-07-29: Supabase có **32 RPC** mà web chỉ gọi 21. Phần còn lại là các hàm server đã viết sẵn nhưng bỏ không dùng, trong khi web tự tính lại ở client — dẫn tới số trên dashboard có thể lệch số mà workflow và báo cáo dùng.

Màn `Kiểm tra máy chủ` (nhóm PHÂN TÍCH) gọi thẳng các hàm đó:

| RPC | Hiển thị | Vì sao đáng xem |
|---|---|---|
| `rpc_dashboard_kpi` | KPI hạng mục / hồ sơ / số lệch | Số **đối chiếu** — nếu lệch dashboard thì có vấn đề ở đường tính client |
| `rpc_due_alerts` | Bảng cảnh báo, chỉnh ngưỡng 3/7/14/30 ngày | **Đúng danh sách** workflow `Vani VMP 1` dùng để gửi mail — xem trước trước khi bật workflow |
| `rpc_check_data_quality` | Lỗi dữ liệu server phát hiện, lọc theo mức | Rà thẳng trên DB, không phụ thuộc dữ liệu đã tải về trình duyệt |
| `rpc_refresh_computed_status` | Nút "Tính lại trạng thái" (chỉ admin) | `computed_status` tính lúc GHI nên hạng mục quá hạn *theo thời gian* không tự đổi |

Số liệu thực tế lúc dựng: 461 hạng mục · 609 vấn đề chất lượng dữ liệu · 304 cảnh báo ở ngưỡng 7 ngày (339 ở ngưỡng 30).

### 11a. ⚠️ Bảo mật: cách rà RPC ghi đã sai, đã sửa

Migration `...070000` rà "hàm nào là hàm ghi" bằng **tiền tố tên hàm**. Cách đó **bỏ sót `rpc_refresh_computed_status`** — hàm này `UPDATE` cột `computed_status` của toàn bộ `vmp_plan_items` nhưng tên bắt đầu bằng `refresh`, không nằm trong danh sách tiền tố, nên vẫn mở cho `anon`.

Migration `...090000` sửa tiêu chí: dùng **`provolatile = 'v'` (VOLATILE)** của Postgres — thông tin chính xác về việc hàm có thể ghi hay không — thay vì suy đoán theo tên.

**Khi thêm RPC mới, kiểm bằng câu này:**

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'rpc\_%'
  and p.provolatile = 'v'
  and has_function_privilege('anon', p.oid, 'execute');
-- Phải trả về 0 dòng.
```

Hiện trạng: **0 hàm VOLATILE mở cho anon**, 9 hàm chỉ-đọc vẫn mở để dashboard công khai chạy được.
