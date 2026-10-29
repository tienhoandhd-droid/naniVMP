# Bàn giao 29/10/2026 — tab Sai lệch và kết nối Google của n8n VMP 8

Ghi để làm tiếp ở thiết bị khác. Trạng thái: **code đã push main (371d201), migration đã áp production, web đã deploy, n8n VMP 8 đã publish**.

## Đã xong

- Tab **Sai lệch** (Danh mục → Sai lệch): lấy dòng trong tab "Sổ quản lý sai lệch (2026)" của sheet
  "Tổng hợp Sai lệch 2026" (`1UHeFxQJdw5bZj0nywdhlgSQop5AWPQcasf9HwgrIJ64`, gid 641830921) khi cột
  "Có cần thông báo team VQ thẩm định thiết bị/nhà xưởng hay không?" ghi **Có**. Không có dòng nào → web ghi "Không có".
  Sheet này CHỈ ĐỌC.
- Migration `supabase/migrations/20261029100000_tham_dinh_do_sai_lech.sql` đã áp production 29/10 11:17 — **không chạy lại**.
  Bảng `vmp_change_records` có thêm cột `record_kind` (`thay_doi` / `sai_lech`). Lỗi của sổ sai lệch chỉ là cảnh báo, không chặn phiếu thay đổi.
- n8n VMP 8 (`fcgMV6OGVgbc8sfs`): thêm node "Đọc sổ sai lệch" (đọc từ A2), đã publish.
  Lượt thật gần nhất: `xong`, 3 tab, 6 phiếu thay đổi không đổi, 0 cảnh báo, 0 sai lệch (sổ chưa dòng nào ghi "Có").
- CI 6/6 đạt (gồm deploy), 127/127 file live khớp artifact.
- Hồ sơ áp migration (chỉ ở máy cũ, không lên GitHub): `/home/admin1/VMP/.backups/ho-so-ap-migration-20261029-sai-lech/`.

## Việc còn dở — kết nối Google bền

Credential n8n "Kết nối drive" (`COdkzMLg68gEcJhZ`, loại `googleOAuth2Api`, ứng dụng OAuth do chủ dự án tự tạo)
hết hạn sáng 29/10, đã Reconnect. Chủ dự án chỉ có quyền **Người xem** trên sheet nên không chia sẻ được cho
service account → chọn giữ OAuth và giảm hết hạn:

1. Google Cloud Console → đúng project chứa Client ID của n8n → APIs & Services → OAuth consent screen
   (hoặc Google Auth Platform → Audience).
2. External + **Testing** → bấm **Publish app** (Testing tự cắt kết nối sau 7 ngày).
   Internal hoặc đã In production → không cần làm, báo lại để tìm nguyên nhân khác.
3. Sau khi Publish: n8n → Credentials → "Kết nối drive" → **Reconnect** lần nữa
   (màn "chưa xác minh" → Advanced → Go to … là ứng dụng của chính mình).
4. Báo "xong" → chạy thử VMP 8, kiểm tra lượt mới báo `xong`, đủ 3 tab, không lỗi.

Phương án dự phòng: nhờ chủ sheet (dainguyen.qa@cpc1hn.vn cho sổ sai lệch; người quản lý sheet "Tổng hợp thay đổi")
chia sẻ quyền Người xem cho email service account "kết nối google" (`uqbMxdAY6BDmg4Ez`), thử đọc bằng SA rồi mới đổi VMP 8.

## Lưu ý

- Hạn của phiếu sai lệch đang lấy "Deadline thực hiện CAPA" (web ghi "Hạn CAPA") — chờ chủ dự án xác nhận.
- Tồn nhỏ đã biết: nếu sheet thay đổi lỗi cứng cùng lúc thì cảnh báo sổ sai lệch không hiện; `rows_with_code` cộng cả dòng tab bị bỏ.
