# Cập nhật mới nhất về thẩm định — Annex 1, ICH Q9(R1), CSA, GAMP 5 v2

> **Phạm vi.** Đây là NGUYÊN TẮC CHUNG của ngành, cập nhật tới 2026, bổ
> sung cho `docs/gmp-nguyen-tac-chung.md`. KHÔNG phải quy định riêng của
> CPC1 HN. Tài liệu này nói khác quy định nội bộ hoặc khác số liệu trong
> hệ VMP thì **nội bộ thắng**.
>
> Dùng để hiểu ngành đang đòi gì và vì sao, không dùng để kết luận tình
> trạng một thiết bị cụ thể.

## 1. Annex 1 bản mới — trục xoay là Chiến lược kiểm soát nhiễm (CCS)

Bản sửa đổi EU GMP Annex 1 đổi hẳn cách nhìn về vô trùng. Trước đây là
một tập các yêu cầu rời (cấp sạch, chênh áp, giám sát môi trường). Nay
tất cả phải quy về **một tài liệu duy nhất: Contamination Control
Strategy — CCS**, và CCS là **bắt buộc**, không phải khuyến khích.

CCS không phải bản tóm tắt các SOP đã có. Nó phải chứng minh được rằng
cơ sở **hiểu** đường đi của nhiễm và **kiểm soát** được từng đường đó.
Nội dung thường phải bao quát:

- Thiết kế nhà xưởng và thiết bị — dòng người, dòng vật tư, dòng thải.
- Hệ phụ trợ: khí xử lý, nước, khí nén, hơi.
- Kiểm soát quy trình, kể cả nguyên liệu đầu vào và bao bì tiếp xúc.
- Giám sát môi trường và giám sát vi sinh — kèm cơ sở khoa học của điểm
  lấy mẫu, không phải chọn theo thói quen.
- Vệ sinh, tiệt trùng, khử nhiễm.
- Con người: đào tạo, hành vi, trang phục, số lần ra vào.
- Điều tra sai lệch và xu hướng dữ liệu.

Hai điểm hay bị bỏ sót nhất:

1. **CCS phải sống.** Phải rà soát định kỳ và cập nhật khi có thay đổi
   hoặc khi dữ liệu giám sát cho thấy xu hướng xấu. CCS ký một lần rồi
   cất tủ là điểm thanh tra bắt ngay.
2. **CCS phải dựa trên QRM.** Mỗi biện pháp kiểm soát phải truy được về
   một rủi ro đã đánh giá, chứ không phải "vì xưa nay vẫn làm vậy".

Với hệ VMP: các hạng mục thẩm định hệ khí xử lý, nước, tiệt trùng, buồng
LAF/isolator/passbox chính là các mắt xích chống lưng cho CCS. Hạng mục
nào trong nhóm đó bị quá hạn thì không chỉ là trễ tiến độ — nó là một lỗ
hổng trong chiến lược kiểm soát nhiễm.

## 2. PUPSIT — thử nguyên vẹn màng lọc trước khi dùng

**PUPSIT** (Pre-Use Post-Sterilisation Integrity Testing) là phép thử
tính nguyên vẹn của màng lọc vô trùng **sau khi tiệt trùng nhưng trước
khi lọc**. Annex 1 bản mới đưa PUPSIT thành yêu cầu.

Lý do rất cụ thể: một màng lọc có thể bị hỏng trong lúc lắp hoặc lúc
tiệt trùng, mà khuyết tật đó **bị chính dịch lọc bịt lại** trong quá
trình chạy. Thử sau khi lọc xong thì màng vẫn "đạt", trong khi thực tế
đã có đường cho vi sinh đi qua. Chỉ có thử trước mới bắt được ca này.

Annex 1 có mở một lối: nếu cơ sở chứng minh được PUPSIT **không khả thi**
về mặt kỹ thuật, có thể thay bằng **đánh giá rủi ro** kèm các biện pháp
bù. Nhưng đó là ngoại lệ phải biện giải bằng văn bản, không phải quyền
được bỏ qua.

## 3. ICH Q9(R1) — bản sửa 2023 đổi bốn thứ

Bản Q9 gốc bị chính ICH đánh giá là chưa đạt kỳ vọng. Bản R1 nhắm vào
bốn điểm yếu:

**a. Tính chủ quan.** Đánh giá rủi ro cùng một đối tượng nhưng hai nhóm
chấm ra hai kết quả khác nhau. R1 yêu cầu giảm chủ quan bằng dữ liệu,
bằng người đánh giá đa ngành, và bằng cách nói rõ giả định đã dùng.
Không đòi xoá hết chủ quan — điều đó bất khả — mà đòi **nhận diện và
kiểm soát** nó.

**b. Mức độ hình thức (formality) là một DẢI, không phải có/không.**
Đây là thay đổi đáng giá nhất về mặt thực hành. Không phải mọi rủi ro
đều cần FMEA đầy đủ với hội đồng và biên bản. Mức hình thức phải tương
xứng với ba yếu tố: **tầm quan trọng** của quyết định, **độ bất định**
của hiểu biết hiện có, và **độ phức tạp** của vấn đề. Việc quen thuộc,
hiểu rõ, ít hệ quả thì một đánh giá gọn trong quy trình thường ngày là
đủ và hợp lệ.

**c. Ra quyết định dựa trên rủi ro.** R1 nói thẳng rằng ra quyết định
dựa trên rủi ro nằm trong mọi hoạt động QRM, và phải nói rõ ai quyết,
quyết trên căn cứ nào.

**d. Rủi ro thiếu thuốc.** Lần đầu tiên đưa **rủi ro đứt nguồn cung do
vấn đề chất lượng sản xuất** vào phạm vi QRM. Nhà máy dừng dây chuyền vì
lỗi chất lượng cũng là rủi ro cho người bệnh, không kém gì thuốc kém
chất lượng.

Với hệ VMP: điểm trọng yếu 1..9 (phức tạp × ảnh hưởng chất lượng) chính
là một công cụ QRM mức hình thức thấp — hợp lệ theo tinh thần R1, miễn
là thang chấm được viết ra và áp dụng nhất quán.

## 4. Thẩm định hệ thống máy tính — từ CSV sang CSA

FDA ban hành hướng dẫn cuối **Computer Software Assurance (CSA)** cho
phần mềm sản xuất và hệ chất lượng vào tháng 9/2025. Đây là bước ngoặt
về cách làm.

**Vấn đề của CSV cũ:** nỗ lực dồn vào việc *sinh ra tài liệu* — kịch bản
thử, ảnh chụp màn hình, chữ ký — thay vì dồn vào việc *tìm lỗi*. Kết quả
là hàng nghìn trang hồ sơ mà phần mềm vẫn hỏng ở chỗ không ai nghĩ tới.

**CSA đổi trọng tâm:** dùng **tư duy phản biện** để phân loại theo rủi
ro, rồi chọn mức thử tương xứng.

- Phần mềm ảnh hưởng trực tiếp tới chất lượng sản phẩm hoặc an toàn
  người bệnh → thử có kịch bản, ghi chép đầy đủ.
- Phần mềm rủi ro thấp → chấp nhận **thử không kịch bản** (unscripted
  testing), thử thăm dò (exploratory), và bằng chứng gọn.
- Bằng chứng ghi vừa đủ để chứng minh đã thử và kết quả ra sao — không
  cần chụp màn hình từng cú bấm.

**GAMP 5 bản 2 (2022)** đi cùng hướng: phân loại phần mềm theo hạng, tận
dụng bằng chứng của nhà cung cấp thay vì thử lại từ đầu, và cài **tính
toàn vẹn dữ liệu xuyên suốt vòng đời** chứ không phải kiểm ở cuối.

Điểm cần nhớ: CSA **không phải là được làm ít hơn**. Nó là chuyển công
sức từ giấy tờ sang chỗ có rủi ro thật. Phần rủi ro cao còn bị soi kỹ
hơn trước.

## 5. Thẩm tra liên tục — thẩm định không kết thúc ở báo cáo

Xu hướng chung của cả Annex 15, ICH Q10 lẫn CSA: **trạng thái thẩm định
phải được duy trì**, không phải đạt một lần rồi thôi.

- **Ongoing Process Verification** — theo dõi thông số trọng yếu trong
  suốt quá trình sản xuất thương mại, đưa vào rà soát chất lượng định kỳ.
- **Rà soát định kỳ trạng thái thẩm định** — kể cả không có thay đổi
  nào, vẫn phải định kỳ khẳng định thiết bị/quy trình còn trong tầm
  kiểm soát.
- **Xu hướng dữ liệu là tín hiệu sớm.** Kết quả vẫn trong giới hạn nhưng
  đang trôi dần về một phía là dấu hiệu phải hành động trước khi vượt
  ngưỡng.

## 6. Tính toàn vẹn dữ liệu — vẫn là chỗ bị phạt nhiều nhất

ALCOA+ không đổi, nhưng cách thanh tra soi thì có:

- **Audit trail phải được RÀ SOÁT**, không chỉ tồn tại. Câu hỏi kinh
  điển: "cho tôi xem bằng chứng ai đã rà soát audit trail của thiết bị
  này, và rà lúc nào".
- **Dữ liệu gốc là bản điện tử**, không phải bản in. In ra rồi ký không
  thay thế được việc kiểm soát bản điện tử.
- **Phân quyền phải có nghĩa.** Tài khoản dùng chung, quyền quản trị cấp
  cho người vận hành — hai lỗi bị bắt thường xuyên nhất.
- **Sửa dữ liệu phải có lý do**, và lý do phải nói được vì sao, không
  phải chép lại thao tác vừa làm.

## 7. Vài câu hỏi thanh tra hay dùng trong lĩnh vực thẩm định

Không phải quy định — là kinh nghiệm chung, dùng để tự soi trước:

- CCS của cơ sở đâu, ai duyệt, lần rà soát gần nhất là khi nào?
- Vì sao chọn đúng số mẻ đó cho thẩm định quy trình? Biện giải đâu?
- Giới hạn tồn dư trong thẩm định vệ sinh dựa trên HBEL/PDE hay còn dùng
  cách cũ?
- Trường hợp xấu nhất trong thẩm định vệ sinh chọn theo tiêu chí gì?
- Thiết bị này thẩm định lần cuối khi nào, chu kỳ tái thẩm định bao lâu,
  và kỳ tới rơi vào lúc nào?
- Sai lệch xảy ra trong lúc thẩm định được đánh giá ảnh hưởng ra sao
  trước khi kết luận đạt?
- Ai rà soát audit trail của hệ thống này, tần suất bao nhiêu?
- Phần mềm này xếp hạng GAMP mấy, và vì sao chọn mức thử đó?
