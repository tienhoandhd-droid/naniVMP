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

> ⚠ Node `Bậc nào?` từng **chia theo độ khó** chứ không phải theo lỗi:
> câu "nhanh" đi thẳng xuống Groq, Gemini không được gọi lần nào. Nghĩa là
> phần lớn câu hỏi chỉ có hai lớp thật, và hôm Groq hết token thì rơi
> thẳng xuống OpenAI trả phí dù Gemini vẫn còn lượt. Nay cả hai nhánh đều
> vào Gemini trước; `bac` chỉ còn dùng để chọn giọng.

> ⚠ Đổi tên node trong n8n **không** cập nhật tham chiếu `$('Tên node')`
> nằm trong `options` (ví dụ `queryReplacement` của node Postgres). Đổi
> "Thử trả lời bằng SQL" thành "Dọn sẵn số liệu bằng SQL" làm gãy 5 node,
> webhook trả rỗng ngay lập tức với lỗi *Referenced node doesn't exist*.
> Đổi tên xong phải rà lại toàn bộ biểu thức.

**Thời gian thật đo được** (lúc Gemini 429 và Groq hết token ngày, tức là
đường xấu nhất — cả ba lớp đều chạy):

| Chặng | Mất |
|---|---|
| Nhúng câu hỏi + tra nguồn + dọn số liệu SQL | ~1,0 s |
| Lớp 1 phân tích câu hỏi | ~0,2 s |
| Gemini báo lỗi 429 | 0,08 s |
| Groq báo lỗi hết token | 0,19 s |
| OpenAI lớp 3 (2 lượt gọi + 1 lần tra dữ liệu) | ~5,1 s |
| **Tổng** | **~7,2 s** |

Hai lớp hỏng chỉ tốn **0,3 giây** — người dùng gần như không cảm nhận
được. Thời gian chờ nằm ở chỗ khác: mô hình sinh chữ và lần tra dữ liệu.

### Dự phòng cho hai lớp phụ

Ngoài ba lớp trả lời, còn hai lớp phụ mà trước đây **không có dự phòng** —
hỏng là mất luôn:

- **Lớp phân tích câu hỏi** chỉ chạy Gemini. Gemini 429 là câu hỏi không
  được viết lại, không nối được mạch hội thoại. Nay thêm nhánh `Lớp 1b —
  Phân tích dự phòng` chạy gpt-4o-mini, kích hoạt qua một node IF kiểm
  tra lớp chính có ra `cau_hoi_ro` hay không.
- **Lớp trau chuốt** trước đây chỉ áp cho nhánh Gemini; hai nhánh kia trả
  lời thô. Nay cả ba nhánh gộp về một đường trau chuốt chung, và lớp trau
  chuốt cũng có dự phòng OpenAI. Cả hai lớp trau chuốt cùng hỏng thì vẫn
  trả bản nháp ra chứ không im lặng.

Đồng thời tách quota: lớp phân tích và lớp trau chuốt chạy
`gemini-flash-lite-latest` — **hạn mức riêng**, khác với
`gemini-2.5-flash` của lớp trả lời chính. Đã kiểm chứng: hôm
`gemini-2.5-flash` bị 429 cả ngày, lớp phân tích chạy flash-lite vẫn
thành công trong 1,5 giây.

> ⚠ Bẫy đắt nhất gặp khi làm việc này: node **Code** gọi `$('Tên node')`
> sang một nhánh KHÔNG chạy trong lượt đó thì treo **109 giây** rồi chết
> vì tràn bộ nhớ, và webhook không bao giờ trả lời — nginx cắt ở giây 60
> trả về 404. Trong biểu thức của node thường thì `$()` bọc try/catch vẫn
> an toàn, nhưng trong node Code thì không.
>
> Cách chữa: **đừng gọi chéo nhánh**. Mỗi nhánh gắn một node Set nhỏ ghi
> `{output, lop}`, rồi node `Lấy giọng` echo bản nháp ra lại bằng SQL
> (`select … , $1::text as ban_nhap`). Từ đó về sau mọi thứ đọc từ
> `$json`, không nhánh nào phải hỏi thăm nhánh nào.

## 6. Trích dẫn nguồn: chip riêng, không chú giữa câu

Đây là **khung chat**, không phải luận văn. Bắt Vali mở ngoặc chú nguồn
sau từng câu đọc rất thô. Nhưng hồ sơ GMP thì vẫn phải truy được nguồn.

Cách dung hoà: node **Lấy nguồn trích dẫn** chạy `rpc_tim_tri_thuc` một
lần ở đầu luồng, lọc `do_tin >= 0.55` — tức CẢ HAI đường tìm kiếm cùng chỉ vào mảnh đó, trả về mảng `trich_dan`; web hiện
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

## 8. Đưa số đúng, đừng cấm lấy số sai

Mô hình nhỏ (gpt-4o-mini ở lớp 3) liên tục lấy con số toàn nhà máy rồi
đọc thành con số của một nhóm: *"hệ thống tank có 461 hạng mục, quá hạn
162"* — con số đúng, gán sai chỗ, nghe rất trôi chảy. Kiểu sai nguy hiểm
nhất trong hồ sơ GMP.

Dặn bằng lời trong mô tả công cụ **không ăn**, thử hai vòng đều hỏng. Lý
do dễ hiểu: mô hình đang cần một con số cho nhóm, trong tay chỉ có số
tổng, nên nó lấy số tổng. Muốn nó thôi thì phải **đưa cho nó số đúng**,
không phải cấm nó.

Nay node công cụ tự đếm trên đúng các dòng khớp từ khoá rồi trả về ô
`thong_ke_RIENG_CAC_DONG_KHOP`, và đổi tên ô cũ thành
`tong_quan_TOAN_NHA_MAY_khong_duoc_gan_cho_mot_nhom` — cảnh báo nằm ngay
trong tên khoá thì mô hình đọc là thấy, không lướt qua được. Hỏi "tank
thì đến đâu rồi" nay ra 8 hạng mục khớp thay vì 461.

## 9. Mọi câu đều qua AI

Đường tắt SQL (node `Đường tắt SQL (ĐANG TẮT — mọi câu qua AI)`) đã bị tắt
có chủ ý. Trước đây nó tự trả lời các câu chào hỏi và tâm sự bằng câu mẫu,
nên "chào công chúa" nhận về một câu cụt lủn, không dùng được sổ tay giọng.
Nay SQL vẫn chạy nhưng chỉ để **dọn sẵn số liệu** cho AI dùng lại — số vẫn
đúng, giọng vẫn là của Vali.

Muốn bật lại đường tắt (ví dụ khi cần tiết kiệm token gấp): đổi điều kiện
node IF từ `{{ false }}` về `{{ $json.kq.khop }}`.

## 10. Nguồn tham khảo

- [character-card-spec-v2](https://github.com/malfoyslastname/character-card-spec-v2) — cấu trúc thẻ nhân vật và `character_book`
- [SillyTavern lorebook / World Info](https://sillycard-web.pages.dev/blog/st-fields-04-character-book) — cách mảnh kích hoạt theo từ khoá
- WHO GMP TRS 1019 Annex 3, EU GMP Annex 15 & 11, ICH Q9 — xem `docs/gmp-nguyen-tac-chung.md`

## 11. Kho lời chờ — 10–30 giây chờ thành 10–30 giây học

Ô chat trước đây chỉ có 5 câu chờ cố định. Ngồi chờ lần thứ ba trong
ngày là đọc lại y hệt câu cũ — vô duyên, và phí một khoảng thời gian mà
người dùng **buộc phải** nhìn màn hình.

Bảng `vmp_chat_loi_cho` (54 mẩu, không mẩu nào trùng) chia ba loại:

| Loại | Số mẩu | Nội dung |
|---|---|---|
| `tho` | 12 | Lục bát về nghề thẩm định — ký đề cương, ghi sổ đúng lúc, ba chặng nước, IQ/OQ/PQ |
| `nguyen_tac` | 34 | Một nguyên tắc GMP gọn trong vài dòng, có ghi nguồn (Annex 1, Annex 15, ICH Q9(R1), CSA, GAMP 5) |
| `meo` | 8 | Mẹo dùng hệ VMP thật |

**Chống trùng ba lớp:**

1. `noi_dung` là `unique` ở DB — không nạp nhầm hai mẩu giống nhau.
2. `daHienRef` giữ mẩu đã hiện trong phiên; chỉ khi hết mẩu mới mới cho lặp.
3. Mỗi mốc thời gian rút một **loại khác nhau** (`NHIP_CHO`): giây 4 ra
   mẹo, giây 9 ra thơ, giây 15 ra nguyên tắc, giây 24 thơ, giây 32
   nguyên tắc. Chờ 20 giây thì đọc được ba mẩu khác thể loại.

Kho tải **một lần lúc mở ô chat**, không phải lúc đang chờ — gọi mạng
lúc đang chờ thì mẩu hiện ra sau khi câu trả lời đã về, thành vô dụng.

Thêm mẩu mới chỉ cần một dòng `INSERT`, không phải build lại web:

```sql
insert into vmp_chat_loi_cho (loai, noi_dung, nguon)
values ('nguyen_tac', 'Nội dung…', 'Annex 15');
```

## 12. Đừng chép nguyên văn câu mà mình muốn cấm

Lỗi mất hai vòng mới sửa xong, và đáng ghi lại vì rất dễ tái phát.

**Hiện tượng.** Câu nhãn cảnh báo nguồn ngoài (câu nói với người đọc rằng
đoạn dưới đây không phải số liệu nhà máy) bị dán vào cả những câu trả lời
chỉ đọc số liệu nội bộ. Dán sai chỗ còn tệ hơn không dán: nó làm người
đọc nghi ngờ chính con số đúng.

**Vòng vá thứ nhất — thất bại.** Thêm hai mảnh sổ tay CẤM chuyện đó. Cả
hai mảnh đều chép nguyên văn câu nhãn để làm ví dụ, và cả hai là mảnh NỀN
nên ghép vào mọi lượt. Kết quả: mô hình đọc thấy một câu tiếng Việt hoàn
chỉnh trong lời dặn rồi chép nó ra — đúng hiệu ứng "đừng nghĩ đến con
voi". Sửa xong còn 1/3 câu vẫn dán sai.

**Vòng vá thứ hai — tìm ra thủ phạm chính.** Prompt của **lớp trau chuốt**
cũng chép nguyên văn, ở chỗ dặn "bỏ câu … nếu bản nháp có". Lớp này áp cho
**cả ba** nhánh trả lời, nên một chỗ chép mẫu là cả ba lớp cùng dính. Cộng
thêm prompt agent Gemini chép ở đoạn "khi dùng nguồn bên ngoài thì mở đầu
bằng đúng câu …".

**Cách sửa đúng.** Câu nhãn chỉ nằm ở **mô tả của công cụ tìm ngoài** —
nơi nó vốn đã có sẵn, và chỉ được đọc khi thực sự gọi công cụ đó. Prompt
chung thì **mô tả** cái nhãn thay vì chép nó:

- lớp trau chuốt: *"bản nháp có thể chứa một câu nhãn cảnh báo — có thì
  giữ nguyên, không có thì tuyệt đối đừng tự viết thêm"*
- agent: *"công cụ tìm ngoài đã dặn sẵn một câu nhãn — làm theo lời dặn
  của công cụ, không tự nghĩ ra câu khác"*

Không còn câu mẫu hoàn chỉnh nào trong prompt thì không còn gì để chép.
Kiểm chứng 6 câu phủ đủ ba lớp: **6/6 sạch**.

**Luật rút ra cho lần sau:** muốn cấm mô hình viết một câu cụ thể thì
đừng viết câu đó ra trong lời dặn. Mô tả nó — "câu nhãn cảnh báo",
"tên trường dữ liệu", "chữ đặt chỗ" — chứ đừng dán mẫu.
