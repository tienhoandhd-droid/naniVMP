-- Isolated restored database only. All fixtures and writes roll back.
begin;
do $test$
declare source public.vmp_source_objects; result jsonb; page2 jsonb; actor uuid; viewer uuid; bad jsonb;
  bounds jsonb := '{"vmp_from":"2026-03-01","vmp_to":"2026-03-31"}';
begin
  assert public.vmp_source_filters_valid(bounds), 'VMP range filter must be supported';
  for bad in select value from jsonb_array_elements('[{"vmp_from":"2026-02-30"},{"vmp_from":"yesterday"},{"vmp_from":null},{"vmp_to":12},{"vmp_from":"2026-04-01","vmp_to":"2026-03-01"},{"vmp_to":"infinity"},[],{"unknown":"x"}]') loop
    assert not public.vmp_source_filters_valid(bad),'Invalid range accepted';
  end loop;
  assert public.vmp_source_filters_valid('{"vmp_from":"2024-02-29"}');
  assert public.vmp_source_filters_valid('{"vmp_to":"2026-03-31"}');
  assert public.vmp_source_filters_valid('{}');
  insert into public.vmp_objects(code,name) values ('__VMP_DATE_A','Synthetic A'),('__VMP_DATE_B','Synthetic B'),('__VMP_DATE_C','Synthetic C');
  insert into public.vmp_source_objects(object_code,object_name,object_kind,source_tab,source_row)
    values ('__VMP_DATE_A','Synthetic A','Thiết bị','synthetic_date_test',1),('__VMP_DATE_B','Synthetic B','Thiết bị','synthetic_date_test',2),('__VMP_DATE_C','Synthetic C','Thiết bị','synthetic_date_test',3);
  insert into public.vmp_plan_items(id,validation_code,object_code,year,deadline_vmp)
    values ('__DATE_1','__DATE_1','__VMP_DATE_A',2026,'2026-03-01'),('__DATE_2','__DATE_2','__VMP_DATE_A',2026,'2026-09-30'),('__DATE_3','__DATE_3','__VMP_DATE_B',2026,'2026-03-31'),('__DATE_4','__DATE_4','__VMP_DATE_C',2026,null);
  select * into source from public.vmp_source_objects where object_code='__VMP_DATE_A';
  assert public.vmp_source_object_matches_filters(source,null,bounds),'Inclusive lower boundary';
  assert not public.vmp_source_object_matches_filters(source,null,'{"vmp_from":"2026-03-02","vmp_to":"2026-03-30"}'),'Date range must apply to the same item';
  assert public.vmp_source_object_matches_filters(source,null,'{"vmp_from":"2026-09-30"}'),'Upper open bound';
  select * into source from public.vmp_source_objects where object_code='__VMP_DATE_B';
  assert public.vmp_source_object_matches_filters(source,null,bounds),'Inclusive upper boundary';
  select * into source from public.vmp_source_objects where object_code='__VMP_DATE_C';
  update public.vmp_plan_items set deadline_report='2026-03-15' where id='__DATE_4';
  assert not public.vmp_source_object_matches_filters(source,null,bounds),'No report fallback or cross-object match';
  assert public.vmp_source_object_matches_filters(source,null,'{}'),'Unfiltered keeps missing dates';
  update public.vmp_plan_items set deadline_vmp='2026-03-15',item_state='cancelled' where id='__DATE_4';
  assert not public.vmp_source_object_matches_filters(source,null,bounds),'Cancelled excluded';
  update public.vmp_plan_items set item_state='active',missing_from_sheet=true where id='__DATE_4';
  assert not public.vmp_source_object_matches_filters(source,null,bounds),'Missing excluded';
  update public.vmp_plan_items set missing_from_sheet=false,is_active=false where id='__DATE_4';
  assert not public.vmp_source_object_matches_filters(source,null,bounds),'Inactive excluded';
  select id into actor from public.profiles where coalesce(is_active,true) and public.vmp_business_role(id)='admin' limit 1;
  assert actor is not null,'Restored test database needs an active admin fixture';
  select payload into result from public.vmp_source_objects_page_path(actor,null,'__VMP_DATE_',bounds,null,1,false,null);
  assert (result->>'ok')::boolean and (result->>'authorized_total')::int=2 and jsonb_array_length(result->'rows')=1,'Filter must run before page/count';
  select payload into page2 from public.vmp_source_objects_page_path(actor,null,'__VMP_DATE_',bounds,result->'next_cursor',1,false,null);
  assert page2->'next_cursor'='null'::jsonb and jsonb_array_length(page2->'rows')=1,'Second page';
  assert result->'rows'->0->>'id'<>page2->'rows'->0->>'id','No duplicates';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  result:=public.rpc_export_source_objects(null,'__VMP_DATE_',bounds,null,500);
  assert (result->>'ok')::boolean and (result->>'authorized_total')::int=2 and jsonb_array_length(result->'rows')=2,'Export must match filtered count';
  select payload into result from public.vmp_source_objects_page_path(null,null,'__VMP_DATE_',bounds,null,10,false,null);
  assert not (result->>'ok')::boolean,'Anonymous still denied';
  select id into viewer from public.profiles where coalesce(is_active,true) and public.vmp_business_role(id)='qa_staff' limit 1;
  if viewer is not null then
    select payload into result from public.vmp_source_objects_page_path(viewer,null,'__VMP_DATE_',bounds,null,10,false,null);
    assert coalesce((result->>'authorized_total')::int,0)=0,'QA must not gain unassigned source visibility';
  end if;
  assert not has_function_privilege('authenticated','public.vmp_source_object_matches_filters(public.vmp_source_objects,text,jsonb)','EXECUTE'),'Private helper ACL unchanged';
  raise notice 'PASS date validity, inclusive/open ranges, same-item matching, missing/cancelled/inactive, page/count/cursor, scope and helper ACL';
end $test$;
rollback;
