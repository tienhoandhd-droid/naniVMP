# Sổ tay giọng của Vali — cách chatbox nói chuyện

Tài liệu này giải thích **vì sao** ô chat được dựng như hiện nay, để người
sau sửa mà không phá mất thứ đang chạy được.

## 1. Vấn đề: prompt phình to thì mô hình nhớ kém đi

Ban đầu mọi luật ăn nói nằm hết trong system prompt của agent. Càng thêm
tình huống — chào hỏi, tâm sự, hỏi ngoài lề, bị mắng — prompt càng dài, và
mô hình càng nhớ mờ từng luật. Thêm nữa, mọi lượt chat đều trả tiền cho
toàn bộ đống chữ đó, kể cả lượt chỉ hỏi "còn mấy cái quá hạn".

## 2. Cách chữa: lorebook, học từ giới làm nhân vật AI

Cộng đồng character-AI (SillyTavern, character card **spec v2**) giải quyết
đúng bài này bằng **lorebook / `character_book`**: cắt nhỏ hiểu biết thành
từng **mảnh có từ khoá kích hoạt**, lượt nào chạm từ khoá thì mới ghép mảnh
đó vào prompt. Một lượt thường chỉ kéo 1–2 mảnh.

Bảng `vmp_chat_giong` là lorebook của Vali:

| Cột | Ý nghĩa |
|---|---|
| `ten` | tên mảnh, để người sau đọc hiểu |
| `tu_khoa` | từ khoá kích hoạt, **viết không dấu**; rỗng = mảnh NỀN, lượt nào cũng ghép |
| `noi_dung` | lời dặn ghép vào prompt |
| `uu_tien` | số nhỏ ghép trước |
| `bat` | tắt/bật mà không phải xoá |

`rpc_lay_giong(cau_hoi, k)` trả **tất cả mảnh nền** cộng tối đa `k` mảnh
trúng từ khoá. Mảnh nền không tính vào `k` — chúng là chất giọng, không
phải gợi ý tình huống.

Khớp theo **từ trọn vẹn** trên bản bỏ dấu: câu hỏi và từ khoá đều được bỏ
dấu rồi đổi mọi ký tự không phải chữ-số thành khoảng trắng. Nhờ vậy `han`
không dính vào `hang`, `va` không dính vào `vao`.

> ⚠ Bẫy đã dính một lần: viết `'{chao, hello, hi , alo}'` thì Postgres
> **cắt trắng** phần tử không có nháy → `' hi '` thành `'hi'`, và "bao
> nhiêu hạng mục" cũng kích hoạt mảnh Chào hỏi. Muốn giữ khoảng trắng thì
> phải nháy kép: `'{" hi "}'`. Migration `20260729700000` chuẩn hoá lại
> toàn bộ nên từ nay cứ viết thường, hàm tự bao khoảng trắng.

## 3. Nguyên tắc viết một mảnh

**Không liệt kê từ vựng suông.** Danh sách tiếng lóng không đổi được hành
vi mô hình, chỉ khiến nó rắc từ lóng vào chỗ vô duyên. Mỗi mảnh phải nói
rõ: *trong tình huống này thì làm gì trước, làm gì sau, và cấm cái gì.*

Bốn nhóm mảnh đang có (76 mảnh):

1. **NỀN** — chất giọng chung: công chúa chiều người hỏi, genz nằm ở nhịp
   chứ không ở tiếng lóng, tinh tế kiểu tiếng Việt, dọn sẵn bước tiếp,
   không sáo, không lộ khung mẫu.
2. **CÔNG VIỆC** — quá hạn, sắp đến hạn, tiến độ, theo bộ phận, theo người,
   thiết bị cụ thể, IQ/OQ/PQ, deadline, điểm trọng yếu, thanh tra, audit
   trail, số vênh, cách dùng web, báo lỗi, xin báo cáo.
3. **TÌNH HUỐNG NGƯỜI VỚI NGƯỜI** — bị trêu, thả thính, hỏi Vali có phải
   AI không, xin lỗi, chúc mừng, chào sáng/tối, xin xếp việc, xin mẹo,
   than về đồng nghiệp.
4. **TÂM TRẠNG & TIẾP SỨC** — kiệt sức, quá tải, mất động lực, deadline
   dồn, tăng ca, sợ sai, bị mắng, tự ti, người mới, bị thanh tra bắt lỗi,
   muốn bỏ việc, chuyện tình cảm, gia đình, ốm, trước ngày chạy lớn, vừa
   xong việc lớn, cả nhóm xuống tinh thần.

Hai ranh giới **không được nới**:

- Mảnh `Nền — biết khi nào dừng, đẩy về người thật` (ưu tiên 1, cao nhất):
  gặp dấu hiệu tuyệt vọng thì dừng chuyện sổ sách, khuyên tìm người thật.
  Vali tiếp sức được, nhưng không phải chuyên gia tâm lý.
- Mảnh `Hỏi chuyện riêng tư của người khác`: nói được tiến độ theo người,
  **không** xếp hạng ai giỏi ai kém, không bàn lương thưởng, không gợi ý
  kỷ luật.

## 4. Nối vào workflow ở đâu

Sổ tay được ghép ngay trong node **Chọn mô hình** (Postgres), nối vào
trường `giong` mà cả ba agent vốn đã đọc:

```sql
coalesce(rpc_ai_chon_mo_hinh($1) -> 'do_kho' ->> 'giong', '')
  || E'\n\n[Sổ tay giọng — đọc kỹ và làm theo cho đúng tình huống này]\n'
  || coalesce(rpc_lay_giong($1, 3) ->> 'loi_dan', '')
```

Nhờ vậy không phải thêm node, không phải sửa prompt từng agent, và đổi
giọng chỉ cần `update` một dòng trong bảng.

## 5. Ba lớp AI

Mỗi lượt chat đi qua tối đa ba lớp, tự chuyển khi lớp trước hỏng:

| Lớp | Mô hình | Vì sao |
|---|---|---|
| 1 | Gemini 2.5 Flash | miễn phí, viết tiếng Việt mượt nhất |
| 2 | Groq llama-3.3-70b | miễn phí, rất nhanh, đỡ khi Gemini 429 |
| 3 | OpenAI gpt-4o-mini | **trả tiền**, chỉ chạy khi hai lớp trên hết lượt |

Lớp 3 **phải có công cụ tra dữ liệu**. Trước đây nó là một `chainLlm`
không công cụ, nên đúng hôm cả Gemini lẫn Groq hết quota thì Vali trả lời
"bổn cung lục mãi không ra" cho mọi câu — lưới an toàn có mà không đỡ được
gì. Nay lớp 3 là agent, dùng chung hai công cụ Postgres với lớp 2.

## 6. Trích dẫn nguồn: chip riêng, không chú giữa câu

Đây là **khung chat**, không phải luận văn. Bắt Vali mở ngoặc chú nguồn
sau từng câu đọc rất thô. Nhưng hồ sơ GMP thì vẫn phải truy được nguồn.

Cách dung hoà: node **Lấy nguồn trích dẫn** chạy `rpc_tim_tri_thuc` một
lần ở đầu luồng, lọc `do_tin >= 0.2`, trả về mảng `trich_dan`; web hiện
thành chip nhỏ dưới câu trả lời. Vali chỉ nhắc nguồn nhiều nhất hai lần,
lồng tự nhiên trong câu văn.

> `do_tin` là điểm RRF chia cho điểm tối đa lý thuyết (đứng đầu **cả hai**
> đường tìm kiếm = `2/61`), cắt trần ở 1. Điểm RRF thô rất dễ đặt nhầm
> ngưỡng: khi chỉ một đường khớp thì mảnh tốt nhất cũng chỉ được `0.0164`,
> thấp hơn ngưỡng `0.02` từng dùng — tra đúng tài liệu mà vẫn bị coi là
> không tra được.

## 7. Hiểu từ khoá trong câu hỏi

Người dùng không gõ trọn tên thiết bị. Họ gõ "tank", "nồi hấp", "kcs",
"KNTB1". `rpc_ai_hieu_tu_khoa` khớp **chiều ngược** với từ điển: lấy từng
tiếng trong câu hỏi rồi tìm xem nó nằm trong tên/mã nào, gói lại thành
đoạn tiếng Việt cho AI đọc — "chữ tank trúng 29 thiết bị, ví dụ…".

`vmp_ai_bi_danh` chép tay những cách gọi không suy ra được từ dữ liệu:
`kcs` → `qc`, `buồng cân` → nhóm LAF (và ghi chú rằng LAF cân là buồng cân
khí sạch, không phải cái cân), `nước RO` → hệ nước tinh khiết.

`rpc_ai_phan_tich_cau_hoi` gộp thêm **ba lượt hỏi gần nhất** của phiên rồi
kết luận câu hỏi ở mức nào — `du_y` / `con_rong` / `truot` / `cut_can_mach`
— và dặn thẳng lớp sau phải làm gì: trả lời thẳng, hay trả lời phần chung
rồi hỏi thu hẹp kèm 2–3 lựa chọn thật.

## 8. Mọi câu đều qua AI

Đường tắt SQL (node `Đường tắt SQL (ĐANG TẮT — mọi câu qua AI)`) đã bị tắt
có chủ ý. Trước đây nó tự trả lời các câu chào hỏi và tâm sự bằng câu mẫu,
nên "chào công chúa" nhận về một câu cụt lủn, không dùng được sổ tay giọng.
Nay SQL vẫn chạy nhưng chỉ để **dọn sẵn số liệu** cho AI dùng lại — số vẫn
đúng, giọng vẫn là của Vali.

Muốn bật lại đường tắt (ví dụ khi cần tiết kiệm token gấp): đổi điều kiện
node IF từ `{{ false }}` về `{{ $json.kq.khop }}`.

## 9. Nguồn tham khảo

- [character-card-spec-v2](https://github.com/malfoyslastname/character-card-spec-v2) — cấu trúc thẻ nhân vật và `character_book`
- [SillyTavern lorebook / World Info](https://sillycard-web.pages.dev/blog/st-fields-04-character-book) — cách mảnh kích hoạt theo từ khoá
- WHO GMP TRS 1019 Annex 3, EU GMP Annex 15 & 11, ICH Q9 — xem `docs/gmp-nguyen-tac-chung.md`
