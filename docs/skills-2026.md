# Bộ kỹ năng 2025–2026: n8n · GitHub · CLI · viết code

_Tổng hợp 2026-07-29 từ GitHub Trending và tài liệu thực hành 2026. Ví dụ lấy trực tiếp từ dự án VMP này._

---

## 0. GitHub Trending đang chuộng gì

Quan sát bảng trending tháng/tuần 7-2026: **thư mục "skill" cho coding agent** và **hạ tầng AI agent** chiếm phần lớn top — `mattpocock/skills`, `hallmark` (chống "AI slop"), `orca`, `herdr`, `OmniRoute`, `codebase-memory-mcp`, `DesktopCommanderMCP`.

Về ngôn ngữ CLI: **13/20 tool CLI hiện đại viết bằng Rust, 3 bằng Go**. Đây là xu hướng ổn định chứ không phải nhất thời.

Bài học rút ra cho bạn: kỹ năng đáng đầu tư **không phải** học thuộc tool trending, mà là *đóng gói quy trình của mình thành thứ máy đọc được* — đó chính là việc `docs/HANDOVER.md` đang làm.

---

## 1. n8n — 6 kỹ năng của workflow chạy production

### 1.1 Ba lớp xử lý lỗi

Chuẩn 2026 là **ba lớp**, không phải một:

| Lớp | Làm gì | WF-04 của bạn |
|---|---|---|
| Node-level retry | Bắt lỗi tạm thời: timeout, rate limit | ✅ `1. Download Canonical Sheet CSV`: `retryOnFail: true, maxTries: 3, wait 5s` |
| Error Trigger toàn cục | Bắt mọi thứ lọt lưới | ✅ Đã có (`Error Trigger` → ghi `workflow_runs` + mail admin) |
| Log tập trung | Nhìn xuyên nhiều workflow | ✅ Đã có (`vmp_sheet_sync_runs`) |

WF-04 đã đủ cả ba lớp — không cần sửa gì.

**Lưu ý ngược đời đáng nhớ:** node `3. Apply Canonical Snapshot` (Postgres) cố tình để `retryOnFail: false`. Đúng như vậy. Lỗi của nó là **lỗi tất định** (guard chặn dữ liệu sai) — retry 3 lần chỉ tạo thêm 3 lần thất bại y hệt và 3 mail cảnh báo nhiễu. Nguyên tắc: **retry cho lỗi tạm thời, không retry cho lỗi tất định.**

### 1.2 Bài học đắt nhất: **cảnh báo phải phân biệt "chưa chạy" với "chạy hỏng"**

Sự cố thật của bạn hôm nay minh hoạ chính xác điểm mù này:

```
Error Trigger vẫn nổ đều mỗi 5 phút suốt nhiều ngày
→ nhưng không ai để ý, vì mail lỗi trông giống nhau mỗi lần
→ dữ liệu đứng yên 21 ngày mà dashboard không hề báo
```

Kỹ năng cần thêm: **dead-man's switch** — cảnh báo khi *thiếu* thành công, chứ không chỉ khi *có* lỗi.

```sql
-- Chạy 1 lần/giờ; báo động nếu sync thành công gần nhất quá 30 phút
select
  now() - max(created_at) as do_tre,
  (now() - max(created_at)) > interval '30 minutes' as can_bao_dong
from public.vmp_sheet_sync_runs
where status = 'completed';
```

Nguyên tắc: *một hệ thống im lặng không có nghĩa là khoẻ.*

### 1.3 Guard phải nói được "sai ở đâu", không chỉ "sai"

Guard của bạn hoạt động đúng và đã cứu Supabase khỏi bị ghi đè:

```
VMP_SYNC_ROW_GUARD: source row count 9724 is outside 450..5000
```

Nhưng thông điệp này khiến người đọc tưởng phải **nới ngưỡng**, trong khi nguyên nhân thật là **Sheet bị nhân bản 21 lần** (9.724 dòng nhưng chỉ 461 ID duy nhất). Guard tốt hơn nên in luôn tỉ lệ trùng:

```sql
raise exception
  'VMP_SYNC_ROW_GUARD: % dòng / % ID duy nhất (tỉ lệ lặp %sx) — ngoài khoảng 450..5000',
  v_source_rows, v_unique_ids, round(v_source_rows::numeric / nullif(v_unique_ids,0), 1);
-- → "9724 dòng / 461 ID duy nhất (tỉ lệ lặp 21.1x)" — đọc phát hiểu ngay
```

Kỹ năng: **thông báo lỗi nên chứa đủ dữ kiện để chẩn đoán mà không cần mở DB.**

### 1.4 Idempotency + checksum

WF-04 đã làm đúng chuẩn cao: so `sha256` checksum, snapshot không đổi thì bỏ qua. Đây là mẫu nên nhân rộng — nó biến "chạy 5 phút/lần" từ tốn kém thành gần như miễn phí.

### 1.5 Bảo mật self-hosted

- `N8N_ENCRYPTION_KEY` **bắt buộc** đặt từ lần deploy đầu — thiếu nó credential lưu dạng plain text.
- Sao lưu key này **tách rời** khỏi backup database (password manager riêng). Mất key = mất toàn bộ credential.
- SQLite monolithic sẽ sập khi tải cao — production dùng **queue mode** + Postgres.

### 1.6 Kho mẫu để học

- [ScraperNode/awesome-n8n-templates](https://github.com/ScraperNode/awesome-n8n-templates) — 8.697+ workflow, 236 tích hợp
- [enescingoz/awesome-n8n-templates](https://github.com/enescingoz/awesome-n8n-templates) — 280+ mẫu, ~24k sao
- [restyler/awesome-n8n](https://github.com/restyler/awesome-n8n) — community node + tutorial

Cách học hiệu quả: tải JSON về, mở bằng `jq` xem cấu trúc node, **đừng import bừa** vào instance production.

---

## 2. GitHub & `gh` CLI

### 2.1 Những lệnh `gh` đáng thuộc

```bash
gh pr create --fill              # tiêu đề + mô tả tự lấy từ commit
gh pr checkout 123               # fetch + checkout PR, thay 4-5 lệnh git
gh pr list --author @me          # PR của tôi
gh run list --limit 10           # CI gần đây  (bạn đã dùng ở phần kiểm tra deploy)
gh run watch                     # theo dõi CI trực tiếp
gh workflow run deploy.yml       # kích hoạt workflow tay
gh browse                        # mở repo hiện tại trên trình duyệt
```

### 2.2 Sức mạnh thật nằm ở `--json` + `jq`

Đây là kỹ năng tách người dùng `gh` thường với người dùng thành thạo:

```bash
# Deploy nào đang fail?
gh run list --json conclusion,displayTitle,createdAt \
  --jq '.[] | select(.conclusion!="success") | "\(.createdAt) \(.displayTitle)"'

# Repo có đang public không (rất đáng kiểm tra định kỳ)
gh repo view --json visibility,isPrivate

# Gọi thẳng REST/GraphQL khi lệnh dựng sẵn không đủ
gh api repos/tienhoandhd-droid/naniVMP/commits --jq '.[0].commit.message'
```

### 2.3 Kỹ năng git đáng giá nhất cho bạn lúc này: **truy vết bí mật bị lộ**

```bash
# Tìm mọi commit từng chứa một chuỗi (kể cả đã bị xoá khỏi bản hiện tại)
git log --all -S'chuỗi_bí_mật' --oneline

# Xem chuỗi đó xuất hiện ở file nào trong bản hiện tại
git grep -n 'chuỗi_bí_mật' HEAD

# Kiểm tra file nhạy cảm đã từng bị commit chưa
git log --all --oneline -- .env .env.local
```

Đúng 3 lệnh này đã phát hiện token `x-vmp-sync-token` cũ của bạn còn nằm trong `docs/HANDOVER.md` của **repo public**.

Quy tắc vàng: **git history là vĩnh viễn**. Xoá dòng chứa secret ở commit mới **không** gỡ nó khỏi lịch sử — người khác vẫn `git log -S` ra được. Cách xử lý đúng luôn là **thu hồi và đổi secret**, còn viết lại lịch sử (`git filter-repo`) chỉ là dọn dẹp thêm.

### 2.4 Vài lệnh git ít dùng nhưng cứu nguy

```bash
git rev-list --left-right --count main...origin/main   # lệch bao nhiêu commit (0 0 = đồng bộ)
git reflog                                              # tìm lại commit "đã mất" sau reset
git bisect start / bad / good                           # nhị phân tìm commit gây lỗi
git log -S'hàm_nào_đó' --oneline                        # commit nào thêm/xoá đoạn code này
git diff --stat HEAD~5                                  # 5 commit qua đã đụng file nào
```

---

## 3. Bộ CLI hiện đại (Rust/Go) — cài 1 lần, dùng mãi

```bash
brew install ripgrep fd bat eza zoxide fzf git-delta lazygit jq atuin
```

| Tool | Thay cho | Vì sao đáng đổi |
|---|---|---|
| `rg` (ripgrep) | `grep` | Nhanh hơn 2–5×, tự tôn trọng `.gitignore`, bỏ qua file nhị phân |
| `fd` | `find` | Cú pháp người đọc được: `fd '\.sql$'` |
| `bat` | `cat` | Tô màu cú pháp + số dòng |
| `eza` | `ls` | Có cây thư mục, trạng thái git |
| `zoxide` | `cd` | `z vmp` nhảy thẳng tới thư mục hay dùng |
| `fzf` | — | Lọc tương tác **mọi** danh sách qua pipe |
| `delta` | `git diff` | Diff cạnh nhau, dễ đọc gấp bội |
| `lazygit` | git UI | TUI cho git; DHH và CEO Shopify đều tài trợ |
| `jq` | — | Không thể thiếu khi đụng JSON của n8n/`gh` |
| `atuin` | `Ctrl-R` | Lịch sử shell có tìm kiếm, đồng bộ nhiều máy |

**Điểm mấu chốt là compose** — sức mạnh nằm ở chỗ nối chúng lại:

```bash
# Mở nhanh file trong repo VMP
fd -e jsx -e js . src | fzf | xargs $EDITOR

# Xem node nào trong WF-04 đang bị tắt
jq -r '.nodes[] | select(.disabled) | .name' n8n/wf-04-canonical-sync/workflow.full.json

# Tìm mọi guard ngưỡng trong migration
rg -n 'raise exception' supabase/migrations/ | bat -l sql
```

---

## 4. Viết code — 4 nguyên tắc rút từ chính repo này

**1. Hai bản của một luật là một con bug đang chờ.**
`parseDepts()` trong `src/utils/helpers.js` và `public.vmp_parse_depts()` trong SQL phải khớp nhau. `HANDOVER.md` đã cảnh báo — nhưng cách chắc chắn hơn là **test parity**: cùng bộ input, so kết quả JS với kết quả SQL, chạy trong CI.

**2. Validate ở biên, tin tưởng ở lõi.**
WF-04 kiểm 37 cột + khoá bắt buộc + ngưỡng số dòng *trước khi* chạm DB. Nhờ vậy 9.724 dòng rác bị chặn ở cửa. Đây là kiến trúc đúng.

**3. Một chiều dữ liệu dễ suy luận hơn hai chiều.**
Bạn đã tắt nhánh ghi ngược App → Sheet. Đó là quyết định tốt: một chiều Sheet → Supabase nghĩa là *luôn* biết cái gì đúng khi hai bên lệch nhau.

**4. Tài liệu phải ghi cả trạng thái, và trạng thái thì mục rữa.**
`HANDOVER.md` mục 4 ghi WF-04 `active: false`, thực tế là `active: true` và đang lỗi. Chỗ nào tài liệu chép trạng thái hệ thống, hãy để **script sinh ra** thay vì gõ tay — `scripts/handover-check.sh` của bạn đúng hướng, chỉ cần thêm phần kiểm tra độ trễ sync ở mục 1.2.

---

## Nguồn

- [GitHub Trending](https://github.com/trending) — bảng tháng & tuần, 7-2026
- [n8n Best Practices Checklist for Production (2026) — HatchWorks](https://hatchworks.com/blog/ai-agents/n8n-best-practices/)
- [Self-Hosted n8n Best Practices + Setup Checklist 2026 — n8nLab](https://n8nlab.io/blog/self-hosted-n8n-best-practices-setup-checklist)
- [n8n Error Handling: 7 Best Practices — n8nLab](https://n8nlab.io/blog/n8n-error-handling-best-practices)
- [n8n Error Handling: Workflow Resilience and Alerts 2026 — NextGrowth.ai](https://nextgrowth.ai/n8n-workflow-error-alerts-guide/)
- [GitHub CLI Power Tips — Utkarsh Shigihalli](https://onlyutkarsh.com/posts/2026/github-cli-power-tips/)
- [GitHub: top commands in gh — Adam Johnson](https://adamj.eu/tech/2025/11/24/github-top-gh-cli-commands/)
- [GitHub CLI Cheat Sheet: 90+ Tested Commands — ComputingForGeeks](https://computingforgeeks.com/github-cli-cheat-sheet/)
- [awesome-modern-cli — thegdsks](https://github.com/thegdsks/awesome-modern-cli)
- [20 CLI Tools That Made Me Mass-Uninstall Homebrew Defaults (2025–2026) — DEV](https://dev.to/_46ea277e677b888e0cd13/20-cli-tools-that-made-me-mass-uninstall-homebrew-defaults-2025-2026-5g22)
