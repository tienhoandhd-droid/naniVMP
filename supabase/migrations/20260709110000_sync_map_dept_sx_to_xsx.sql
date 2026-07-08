-- =====================================================================
--  Đồng bộ hàm map bộ phận lúc SYNC với việc đổi tên sx -> xsx
--  ---------------------------------------------------------------------
--  vmp_sheet_department() suy ra vmp_objects.department từ Sheet cột 5.
--  Trước đây trả 'sx'; sau khi departments.id đổi thành 'xsx'
--  (migration 20260709100000), nếu KHÔNG sửa hàm này thì lần n8n sync kế tiếp
--  sẽ set department='sx' -> vi phạm khóa ngoại departments(id) -> sync rollback.
--
--  Chỉ đổi GIÁ TRỊ TRẢ VỀ 'sx' -> 'xsx'. KHÔNG đổi cột nào, không đổi 37 cột
--  canonical, không đổi checksum. Sau migration này: Sheet -> Supabase luôn
--  tạo ra 'xsx', khớp với dữ liệu đã đổi tên.
-- =====================================================================
create or replace function public.vmp_sheet_department(p_value text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  if v ~ '(xsx|sản xuất|san xuat|xưởng|xuong|production|(^|[^a-z])sx([^a-z]|$))' then return 'xsx'; end if;
  if v ~ '(cơ điện|co dien|mep|kỹ thuật|ky thuat|engineering|cđ|(^|[^a-z])cd([^a-z]|$))' then return 'cd'; end if;
  if v ~ '((^|[^a-z])kho([^a-z]|$)|warehouse)' then return 'kho'; end if;
  if v ~ '((^|[^a-z])rd([^a-z]|$)|r&d|nghiên cứu|nghien cuu|research|qc|kiểm nghiệm|kiem nghiem|lab)' then return 'qc'; end if;
  return 'qa';
end;
$$;
