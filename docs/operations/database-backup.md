# Sao lưu dữ liệu VMP trên máy vận hành

Phạm vi: bản sao logic nhất quán của schema và dữ liệu `public`, `auth`, `storage`, mã hóa GPG AES-256. Bao gồm metadata của Storage, **không bao gồm nội dung các file Storage**, cấu hình nền tảng, Edge Functions, secret hay role cấp cluster. Không thay thế backup/PITR của Supabase và không phải bản sao ngoài máy.

## Cấu hình riêng tư

Chạy bằng Python 3, Docker có PostgreSQL 17 image `public.ecr.aws/supabase/postgres:17.6.1.158`, GPG. File JSON cấu hình và khóa phải thuộc tài khoản hiện tại, quyền `0600`; thư mục backup `0700` và nằm ngoài mọi Git checkout. Không đưa cấu hình, khóa hoặc archive vào Git.

Tạo khóa mới trong thư mục riêng tư bằng `umask 077` rồi `openssl rand -hex 32 > backup.key`; không ghi đè khóa của bản sao đã có.

Các trường cấu hình: `env_file` (file chứa SUPABASE_DB_URL), `expected_project` (project ref được kiểm tra cùng hostname Supabase trực tiếp hoặc pooler chính thức và tên tài khoản trước khi kết nối), `backup_dir`, `key_file` (khóa ngẫu nhiên dạng một dòng 64–256 ký tự hex (không dùng file nhị phân), lưu tách thư mục backup). URL DB dùng tài khoản có quyền đọc những schema trên; script luôn dùng TLS và chỉ chạy lệnh đọc/dump.

```sh
python3 scripts/backup-database.py --config /đường/dẫn/riêng/backup.json
```

Mỗi lần chạy công bố nguyên tử một thư mục thời điểm gồm `backup.dump.gpg` cùng `backup.json` ghi checksum, phạm vi và kết quả giải mã đối chiếu. Dump tạm nằm trong thư mục riêng tư và được xóa sau mỗi lần chạy thông thường. Khóa file ngăn hai lần sao lưu chạy đồng thời. Lỗi không được báo thành công và không in thông tin nhạy cảm từ công cụ DB. Khi máy bị tắt cưỡng bức, kiểm tra/xóa thư mục `.pending-*` riêng tư còn sót sau khi chắc chắn không có tiến trình sao lưu đang chạy.

## Diễn tập khôi phục

```sh
python3 scripts/restore-backup-drill.py --config /đường/dẫn/riêng/backup.json --archive /đường/dẫn/bản-sao.dump.gpg
```

Script chỉ nhận đích cố định là container Docker lab `supabase_db_vmp-five-role-hardening`, kiểm tra marker fixture PostgreSQL 17, dùng socket nội bộ. Không có tham số đích production. Mỗi lần tạo database `vmp_backup_drill_<ngẫu nhiên>`, khôi phục schema/dữ liệu với `--exit-on-error`, đọc kiểm tra các bảng và xóa database trong `finally`. Khi thành công, receipt `.restore.json` xác nhận database tạm đã được xóa. Nếu container/máy bị dừng đột ngột, quản trị viên cần kiểm tra database có tiền tố trên trong **lab** trước khi dọn.

Diễn tập bỏ qua owner/ACL vì role nền tảng khác nhau. Archive gốc vẫn giữ thông tin owner/ACL; quy trình phục hồi thật cần thử quyền truy cập trên môi trường staging tương đương trước khi chuyển người dùng. Diễn tập này không khẳng định khả năng phục hồi đầy đủ nền tảng Supabase.

## Lịch trên máy hiện tại

Bộ chạy ổn định nằm tại `~/.local/share/vmp-operations/`; cấu hình/khóa tại `~/.config/vmp-operations/`. Timer systemd user chạy hằng ngày lúc 02:20 giờ máy, persistent để chạy bù khi phiên dịch vụ hoạt động trở lại. Xem tình trạng bằng:

```sh
systemctl --user status vmp-database-backup.timer
journalctl --user -u vmp-database-backup.service --since yesterday
```

Máy phải bật, Docker phải chạy và thông tin kết nối phải còn hiệu lực. Lỗi chỉ ghi trạng thái service, chưa có kênh cảnh báo bên ngoài. Chưa tự xóa bản sao: theo dõi dung lượng và chỉ dọn các bản cũ sau khi đã xác minh bản mới. Muốn bảo vệ khi mất máy cần sao chép archive sang nơi lưu trữ ngoài máy và giữ khóa ở nơi an toàn riêng biệt; chưa có đích ngoài máy được cấu hình.

Dừng lịch: `systemctl --user disable --now vmp-database-backup.timer`. Thao tác này giữ nguyên các bản sao đã có.
