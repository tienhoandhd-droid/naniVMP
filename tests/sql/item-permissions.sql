select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '11111111-1111-1111-1111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);

do $test$
begin
  if public.vmp_normalize_person_name('  Đặng   Thị Hồng Ngọc ')
      <> 'đặng thị hồng ngọc' then
    raise exception 'vmp_normalize_person_name không chuẩn hóa đúng';
  end if;

  if (select value #>> '{}'
      from public.system_config
      where key = 'item_permissions_mode') <> 'preview' then
    raise exception 'item_permissions_mode phải khởi tạo ở preview';
  end if;

  if exists (
    select 1
    from public.vmp_active_item_assignments
    where user_id is null and grants_access
  ) then
    raise exception 'Phân công chưa nối user_id không được cấp quyền';
  end if;
end
$test$;
