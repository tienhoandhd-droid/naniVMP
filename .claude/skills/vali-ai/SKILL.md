---
name: vali-ai
description: Vận hành và nâng cấp trợ lý Vali (hỏi đáp VMP). Dùng khi cần sửa định tuyến mô hình, thêm mẫu câu hỏi, kiểm chất lượng trả lời, hoặc điều tra một câu trả lời sai.
---

# Vali — trợ lý hỏi đáp VMP

## Kiến trúc: 4 tầng, chỉ tầng nào cần mới tốn AI

```
câu hỏi
  └─ rpc_ai_tra_loi_nhanh          ① SQL, ~20-250ms, KHÔNG tốn AI
       ├─ rpc_ai_ve_nguoi_hoi        bạn là ai, quyền gì, Vali là ai
       ├─ rpc_ai_ghep_ngu_canh       nối với lượt trước (trí nhớ 30 phút)
       ├─ rpc_ai_kiem_mo_ho          khớp nhiều thiết bị → hỏi lại
       ├─ rpc_ai_hieu_cau_hoi        chỉ số × chiều × bộ lọc
       └─ rpc_ai_dung_cau_tra_loi    dựng câu trả lời động
  └─ rpc_ai_cache_doc              ② đệm, khoá theo dấu vân dữ liệu
  └─ n8n RwSGYBhRasUspZqh          ③ AI: Groq nhanh / Gemini sâu
  └─ bậc không công cụ             ④ lưới cuối, ngữ cảnh nạp sẵn
```

## Nguyên tắc bất di bất dịch

**Mô hình KHÔNG được tự nghĩ ra con số.** Mọi con số do SQL cấp. Đây là
hồ sơ GMP — một câu văn trôi chảy mà số sai còn nguy hiểm hơn một câu
"em không biết".

Ba lớp bảo vệ, mỗi lớp chặn một kiểu hỏng:

| Lớp | Chặn được gì |
|---|---|
| Tầng ① trả lời bằng SQL | Mô hình không có cơ hội chạm vào con số |
| Công cụ Postgres bắt buộc ở tầng ③ | Mô hình phải lấy số từ database |
| `rpc_ai_kiem_chung` sau khi trả lời | Bắt số mô hình vẫn lỡ bịa ra |

`rpc_ai_kiem_chung` rút mọi con số trong câu trả lời rồi đối chiếu với
dữ liệu đã đưa. Đây là kiểm chứng bằng **nguồn ngoài**, không phải cho
mô hình tự soát lại — tự soát thì cái sai được củng cố chứ không bị phát
hiện.

## Trước khi tuyên bố "đã sửa xong"

```sql
select public.rpc_ai_chay_bo_kiem();
```

Bộ 7 câu chuẩn trong `vmp_ai_bo_kiem`, mỗi câu ghi rõ nó từng hỏng thế
nào. Phải 7/7 mới được đẩy lên.

Sửa lời nhắc, định tuyến hay mô hình thì **bắt buộc tăng phiên bản
logic**, nếu không đệm sẽ trả lại câu trả lời sai cũ:

```sql
update system_config set value = to_jsonb((value #>> '{}')::int + 1)
where key = 'ai_phien_ban_logic';
```

## Chẩn đoán

```sql
select public.rpc_ai_suc_khoe();                    -- mô hình nào khoẻ, nghẽn
select public.rpc_ai_chon_mo_hinh('câu hỏi');       -- vì sao chọn mô hình đó
select public.rpc_ai_hieu_cau_hoi('câu hỏi');       -- hiểu được gì, còn từ nào lạ
select * from vmp_ai_chat_log where ty_le_bam < 100 -- câu có số không bám dữ liệu
  order by created_at desc;
```

## Cạm bẫy đã dẫm phải

- `queryReplacement` dạng chuỗi **bị cắt ở dấu phẩy** trong câu hỏi. Luôn
  dùng biểu thức trả về mảng: `={{ [a, b] }}`.
- `$('Node').item` **không truy được nguồn** khi đi qua nhánh IF. Dùng
  `.first()`.
- Vòng `FOR` trong plpgsql **chạy câu lệnh một lần** rồi giữ nguyên kết
  quả — sửa biến trong thân vòng không đổi được danh sách đang duyệt.
- Groq bậc miễn phí **12.000 token/phút**. Bậc nhanh phải dùng
  `rpc_ai_context_gon` (602 ký tự), không dùng bản đầy đủ (9.036).
- Câu **giải thích luôn phải đi bậc sâu** dù ngắn — mô hình nhanh không
  gọi công cụ tra tài liệu mà tự bịa.

## Ba tầng bộ nhớ (từ 29/07/2026)

Theo kiến trúc chuẩn 2026 — episodic / semantic / procedural:

| Tầng | Nội dung | Lấy ở đâu |
|---|---|---|
| **Lõi** | Tên, quyền, khối lượng việc, nhóm việc | Tính tại chỗ, luôn tươi |
| **Gần** | Mấy lượt vừa rồi trong phiên (30 phút) | `vmp_ai_hoi_thoai` |
| **Kho** | Chuyện cũ đã lắng lại (30 ngày) | `vmp_ai_bo_nho` |

Tầng kho chia hai loại: `viec_da_xay_ra` (episodic — "từng nói đang quá
tải") và `dieu_biet_ve` (semantic — "hay hỏi về thiết bị KNTB133").

**Tự lắng đọng** bằng trigger trên `vmp_ai_hoi_thoai`, không gọi mô hình
— chạy mỗi lượt thì quá tốn. Luật rút gọn: câu tâm sự luôn ghi nhớ; chủ
đề hỏi ≥2 lần trong 30 ngày thì thành mối quan tâm.

**Điểm nhớ mờ dần**: mỗi 30 ngày không nhắc tới thì trừ 1 điểm quan
trọng, xuống 0 là thôi lôi ra. Nhớ mãi mọi thứ cũng tệ như quên sạch.

### Giới hạn cố ý

Đây là bộ nhớ về ĐỒNG NGHIỆP, không phải hồ sơ theo dõi:
- Chỉ nhớ điều liên quan công việc và cách làm việc
- KHÔNG suy diễn tâm lý, KHÔNG chấm điểm thái độ
- RLS: người dùng chỉ đọc và **xoá được** bộ nhớ về chính mình
- Nhắc lại phải tự nhiên ("lần trước ngươi than mệt, giờ đỡ chưa"),
  không đọc vanh vách ngày giờ như đọc hồ sơ
