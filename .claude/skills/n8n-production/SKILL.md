---
name: n8n-production
description: Chuẩn xây và soát workflow n8n chạy production — ba lớp xử lý lỗi, dead-man's switch, idempotency bằng checksum, thông báo lỗi tự chẩn đoán, bảo mật self-hosted. Dùng khi tạo/sửa/review workflow n8n, hoặc khi điều tra workflow chạy hỏng.
---

# Workflow n8n mức production

## Ba lớp xử lý lỗi — thiếu lớp nào cũng hở

| Lớp | Bắt cái gì | Cách làm |
|---|---|---|
| 1. Node-level retry | Lỗi **tạm thời**: timeout, 429, rớt mạng | `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries` |
| 2. Error Trigger toàn cục | Mọi thứ lọt lưới lớp 1 | Workflow riêng có Error Trigger; gán ở Settings từng workflow |
| 3. Log tập trung | Nhìn xuyên nhiều workflow, nhiều ngày | Ghi bảng Postgres: workflow, node, lỗi, thời điểm |

**Chỉ retry lỗi tạm thời.** Lỗi tất định (validation, guard chặn, sai schema) mà retry thì
chỉ nhân bản thất bại và làm nhiễu cảnh báo. Hỏi "chạy lại y hệt có khả năng thành công
không?" — không thì đừng bật retry.

## Lớp 4 hay bị bỏ quên: dead-man's switch

Ba lớp trên chỉ báo khi **có lỗi**. Chúng mù trước hai ca:

- Workflow bị tắt / trigger không nổ → im lặng hoàn toàn.
- Workflow lỗi đều đặn nhưng mail cảnh báo giống hệt nhau → con người ngừng đọc.

Ca thứ hai nguy hiểm hơn vì trông như hệ thống vẫn sống. Cách chữa: cảnh báo khi **thiếu
thành công**, không chỉ khi có lỗi.

```sql
select
  now() - max(completed_at)                          as do_tre,
  (now() - max(completed_at)) > interval '30 minutes' as can_bao_dong
from <bang_log_run>
where status = 'completed';
```

Cho lịch chạy N phút, đặt ngưỡng khoảng 3–6× N. Và hiển thị độ trễ **ngay trên dashboard**
người dùng nhìn hằng ngày — cảnh báo qua mail luôn có nguy cơ bị bỏ qua.

## Thông báo lỗi phải tự chẩn đoán được

Thông báo tốt chứa đủ dữ kiện để biết **phải làm gì**, không cần mở DB.

```
❌ "source row count 9724 is outside 450..5000"
   → người đọc kết luận sai: "nới ngưỡng lên 10000"

✅ "9724 dòng / 461 ID duy nhất (lặp 21.1x) — ngoài khoảng 450..5000.
    Nguồn bị dán trùng: DỌN NGUỒN, KHÔNG nới ngưỡng."
   → hành động đúng hiện ra ngay trong câu báo lỗi
```

Mẹo: phần tính toán chẩn đoán đặt **bên trong nhánh sắp raise**, nên đường chạy bình thường
không tốn thêm gì.

## Idempotency: checksum trước khi ghi

Với workflow chạy theo lịch dày, so checksum nội dung nguồn với lần chạy trước; giống nhau
thì thoát sớm. Biến "chạy 5 phút/lần" từ tốn kém thành gần như miễn phí, và khiến việc chạy
lại trở nên an toàn.

```
sha256(headers || rows) == checksum lần chạy 'completed' gần nhất  →  skip
```

Kèm theo: **advisory lock** chống hai lần ghi đồng thời, và **backup trước khi ghi đè**.

## Validate ở biên, tin tưởng ở lõi

Kiểm tra hình dạng dữ liệu **trước khi** chạm database: đúng số cột, khoá bắt buộc không rỗng,
số dòng nằm trong ngưỡng hợp lý, tỉ lệ trùng lặp chấp nhận được. Dữ liệu rác bị chặn ở cửa
thì phần lõi không cần phòng thủ nữa.

Ngưỡng nên đặt theo **quan hệ** chứ không chỉ theo số tuyệt đối — `dòng / ID duy nhất > 1.1`
bắt được lỗi dán trùng mà ngưỡng số dòng đơn thuần bỏ lọt.

## Bảo mật self-hosted

- `N8N_ENCRYPTION_KEY` **bắt buộc** đặt ngay từ lần deploy đầu — thiếu nó credential lưu
  plain text.
- Sao lưu key này **tách rời** khỏi backup database. Mất key = mất toàn bộ credential.
- Credential **không** nằm trong file export JSON của workflow — bàn giao phải chuyển riêng.
- Webhook production luôn gắn Header Auth; token đọc từ biến môi trường / Script Properties,
  **không** hard-code vào code hay tài liệu.
- Production dùng **queue mode** + Postgres. SQLite monolithic sẽ sập khi tải cao.

## Đọc execution qua MCP

- `search_executions(status=['error'])` để khoanh vùng.
- ⚠️ Execution `status: 'success'` với `mode: 'error'` **không phải** lần chạy thành công —
  đó là Error Trigger đang chạy để báo lỗi. Nhầm chỗ này dẫn tới kết luận sai hoàn toàn.
- `get_execution(includeData=true)` trả payload rất lớn; MCP sẽ ghi ra file. Trích bằng jq:

```bash
jq -r '.data.resultData.error.message, .data.resultData.lastNodeExecuted' <file>
jq -r '.nodes[] | select(.disabled) | .name' workflow.json   # node nào đang tắt
```

## Kho mẫu tham khảo

[ScraperNode/awesome-n8n-templates](https://github.com/ScraperNode/awesome-n8n-templates) ·
[enescingoz/awesome-n8n-templates](https://github.com/enescingoz/awesome-n8n-templates) ·
[restyler/awesome-n8n](https://github.com/restyler/awesome-n8n)

Tải JSON về đọc bằng `jq` để học cấu trúc — **đừng import thẳng vào instance production**.
