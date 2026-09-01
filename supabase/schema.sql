--
-- PostgreSQL database dump
--

\restrict XtEfKugoHXfdIolg4QKRIAXYp08woNz50A9TosO3sYosuhp0dxifUhFSZy228W9

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."audit_action" AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'LOGIN',
    'LOGOUT',
    'EXPORT',
    'STATUS_CHANGE',
    'DEADLINE_CHANGE',
    'APPROVAL',
    'AI_GENERATE',
    'CONFIG_CHANGE'
);


--
-- Name: criticality; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."criticality" AS ENUM (
    'high',
    'medium',
    'low'
);


--
-- Name: item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."item_status" AS ENUM (
    'plan',
    'todo',
    'prog',
    'done',
    'over'
);


--
-- Name: notification_ch; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."notification_ch" AS ENUM (
    'email',
    'dashboard',
    'both'
);


--
-- Name: phase_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."phase_status" AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'overdue'
);


--
-- Name: quality_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."quality_severity" AS ENUM (
    'error',
    'warning',
    'info'
);


--
-- Name: report_period; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."report_period" AS ENUM (
    'weekly',
    'monthly',
    'quarterly',
    'annual',
    'custom'
);


--
-- Name: report_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."report_status" AS ENUM (
    'draft',
    'ai_generated',
    'qa_reviewing',
    'approved',
    'archived'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'qa_manager',
    'department_user',
    'viewer'
);


--
-- Name: workflow_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."workflow_status" AS ENUM (
    'running',
    'success',
    'failed',
    'partial'
);


--
-- Name: audit_object_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."audit_object_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_action  text;
  v_cu      jsonb;
  v_moi     jsonb;
  v_changed text[];
begin
  if TG_OP = 'INSERT' then
    v_action := 'INSERT';
  elsif TG_OP = 'UPDATE' then
    -- Cột do máy đặt mỗi lần chạm vào dòng — không phải thay đổi nghiệp vụ.
    v_cu  := to_jsonb(OLD) - 'updated_at' - 'source_sync_run_id' - 'source_sheet_row' - 'last_synced';
    v_moi := to_jsonb(NEW) - 'updated_at' - 'source_sync_run_id' - 'source_sheet_row' - 'last_synced';
    if v_cu = v_moi then return NEW; end if;

    select array_agg(key order by key) into v_changed
    from jsonb_each(v_moi) m
    where m.value is distinct from (v_cu -> m.key);

    v_action := 'UPDATE';
  elsif TG_OP = 'DELETE' then
    v_action := 'DELETE';
  end if;

  insert into audit_logs (action, table_name, record_id, changed_fields, old_data, new_data, source)
  values (
    v_action::audit_action, 'vmp_objects', coalesce(NEW.code, OLD.code), v_changed,
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end,
    coalesce(current_setting('app.audit_source', true), 'trigger')
  );
  return coalesce(NEW, OLD);
end;
$$;


--
-- Name: FUNCTION "audit_object_changes"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."audit_object_changes"() IS 'Ghi nhật ký thay đổi vmp_objects. Bỏ qua khi chỉ có cột kỹ thuật đổi — nếu không, mỗi lần đồng bộ đẻ ra 217 dòng nhật ký rỗng.';


--
-- Name: audit_plan_item_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."audit_plan_item_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_action audit_action;
    v_user_id UUID;
BEGIN
    -- Determine action
    IF TG_OP = 'INSERT' THEN
        v_action := 'INSERT';
        v_user_id := NEW.created_by;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check if this is a status change or deadline change
        IF (OLD.status_protocol IS DISTINCT FROM NEW.status_protocol
            OR OLD.status_validation IS DISTINCT FROM NEW.status_validation
            OR OLD.status_report IS DISTINCT FROM NEW.status_report
            OR OLD.status_vmp IS DISTINCT FROM NEW.status_vmp
            OR OLD.computed_status IS DISTINCT FROM NEW.computed_status) THEN
            v_action := 'STATUS_CHANGE';
        ELSIF (OLD.deadline_protocol IS DISTINCT FROM NEW.deadline_protocol
            OR OLD.deadline_validation IS DISTINCT FROM NEW.deadline_validation
            OR OLD.deadline_report IS DISTINCT FROM NEW.deadline_report
            OR OLD.deadline_vmp IS DISTINCT FROM NEW.deadline_vmp) THEN
            v_action := 'DEADLINE_CHANGE';
        ELSE
            v_action := 'UPDATE';
        END IF;
        v_user_id := NEW.updated_by;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'DELETE';
        v_user_id := OLD.updated_by;
    END IF;

    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, source)
    VALUES (
        v_user_id,
        v_action,
        'vmp_plan_items',
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END,
        'trigger'
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: audit_plan_item_changes_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."audit_plan_item_changes_v2"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_action text;
  v_changed text[] := '{}';
  v_validation_code text;
  v_reason text;
  v_business_role text;
begin
  v_reason := nullif(current_setting('app.audit_reason',true),'');
  if tg_op='INSERT' then
    v_action := 'INSERT'; v_user_id := new.created_by; v_validation_code := new.validation_code;
  elsif tg_op='UPDATE' then
    v_user_id := coalesce(new.updated_by,old.updated_by);
    v_validation_code := coalesce(new.validation_code,old.validation_code);
    if old.status_protocol is distinct from new.status_protocol then v_changed:=array_append(v_changed,'status_protocol'); end if;
    if old.status_validation is distinct from new.status_validation then v_changed:=array_append(v_changed,'status_validation'); end if;
    if old.status_report is distinct from new.status_report then v_changed:=array_append(v_changed,'status_report'); end if;
    if old.status_vmp is distinct from new.status_vmp then v_changed:=array_append(v_changed,'status_vmp'); end if;
    if old.deadline_vmp is distinct from new.deadline_vmp then v_changed:=array_append(v_changed,'deadline_vmp'); end if;
    if old.deadline_protocol is distinct from new.deadline_protocol then v_changed:=array_append(v_changed,'deadline_protocol'); end if;
    if old.deadline_validation is distinct from new.deadline_validation then v_changed:=array_append(v_changed,'deadline_validation'); end if;
    if old.deadline_report is distinct from new.deadline_report then v_changed:=array_append(v_changed,'deadline_report'); end if;
    if old.owner_name is distinct from new.owner_name then v_changed:=array_append(v_changed,'owner_name'); end if;
    if old.is_active is distinct from new.is_active then v_changed:=array_append(v_changed,'is_active'); end if;
    if old.missing_from_sheet is distinct from new.missing_from_sheet then v_changed:=array_append(v_changed,'missing_from_sheet'); end if;
    if old.actual_vmp_date is distinct from new.actual_vmp_date then v_changed:=array_append(v_changed,'actual_vmp_date'); end if;
    if old.actual_protocol_date is distinct from new.actual_protocol_date then v_changed:=array_append(v_changed,'actual_protocol_date'); end if;
    if old.actual_validation_date is distinct from new.actual_validation_date then v_changed:=array_append(v_changed,'actual_validation_date'); end if;
    if old.actual_report_date is distinct from new.actual_report_date then v_changed:=array_append(v_changed,'actual_report_date'); end if;
    if old.item_state is distinct from new.item_state then v_changed:=array_append(v_changed,'item_state'); end if;
    if old.scheduled_date is distinct from new.scheduled_date then v_changed:=array_append(v_changed,'scheduled_date'); end if;
    if old.secondary_owner is distinct from new.secondary_owner then v_changed:=array_append(v_changed,'secondary_owner'); end if;
    if old.criticality_score is distinct from new.criticality_score then v_changed:=array_append(v_changed,'criticality_score'); end if;
    if array_length(v_changed,1) is null then return new; end if;
    if old.is_active and not new.is_active then v_action:='DELETE';
    elsif v_changed && array['status_protocol','status_validation','status_report','status_vmp'] then v_action:='STATUS_CHANGE';
    elsif v_changed && array['deadline_vmp','deadline_protocol','deadline_validation','deadline_report'] then v_action:='DEADLINE_CHANGE';
    else v_action:='UPDATE'; end if;
  elsif tg_op='DELETE' then
    v_action:='DELETE'; v_user_id:=old.updated_by; v_validation_code:=old.validation_code;
  end if;
  begin
    v_business_role:=public.vmp_business_role(coalesce(auth.uid(),v_user_id));
  exception when others then v_business_role:=null;
  end;
  insert into public.audit_logs (
    user_id,action,table_name,record_id,validation_code,changed_fields,
    change_reason,old_data,new_data,source,effective_business_role
  ) values (
    v_user_id,v_action::audit_action,'vmp_plan_items',coalesce(new.id,old.id),
    v_validation_code,v_changed,v_reason,
    case when tg_op<>'INSERT' then to_jsonb(old) else null end,
    case when tg_op<>'DELETE' then to_jsonb(new) else null end,
    coalesce(current_setting('app.audit_source',true),'trigger'),v_business_role
  );
  return coalesce(new,old);
end
$$;


--
-- Name: auth_user_dept(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."auth_user_dept"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
    SELECT COALESCE(
        (SELECT department FROM profiles WHERE id = auth.uid()),
        ''
    );
$$;


--
-- Name: auth_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."auth_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when public.vmp_is_active_session(auth.uid()) then (
      select p.role from public.profiles p where p.id = auth.uid()
    )
    else null
  end
$$;


--
-- Name: calculate_deadlines("date", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."calculate_deadlines"("target_date" "date", "p_report_class" "text" DEFAULT 'Không phụ thuộc'::"text") RETURNS TABLE("dl_protocol" "date", "dl_validation" "date", "dl_report" "date")
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    v_report_days INT;
    v_protocol_offset INT;
    v_report_offset INT;
BEGIN
    SELECT dr.report_days, dr.protocol_offset, dr.report_offset
    INTO v_report_days, v_protocol_offset, v_report_offset
    FROM vmp_deadline_rules dr
    WHERE dr.report_class = p_report_class AND dr.is_active = TRUE
    LIMIT 1;

    -- Fallback defaults
    v_report_days     := COALESCE(v_report_days, 2);
    v_protocol_offset := COALESCE(v_protocol_offset, 60);
    v_report_offset   := COALESCE(v_report_offset, 5);

    dl_protocol   := target_date - v_protocol_offset;
    dl_report     := target_date - v_report_offset;
    dl_validation := target_date - v_report_offset - v_report_days;

    RETURN NEXT;
END;
$$;


--
-- Name: chan_dang_ky_la(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."chan_dang_ky_la"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.email is null or btrim(new.email) = '' then
    raise exception 'Tài khoản phải có email';
  end if;
  if not exists (
    select 1 from public.vmp_email_cho_phep
     where email = lower(btrim(new.email)) and is_active
  ) then
    /* Câu này người đăng ký ngoài sẽ đọc được, nên KHÔNG tiết lộ gì về hệ
       thống: không nói có bao nhiêu người, không gợi ý định dạng email
       đúng, không xác nhận email nào đã tồn tại. */
    raise exception 'Email này chưa được duyệt để tạo tài khoản. Liên hệ quản trị hệ thống.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


--
-- Name: chan_overload_rpc(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."chan_overload_rpc"() RETURNS "event_trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  r        RECORD;
  v_ten    TEXT;
  v_so     INT;
  v_chu_ky TEXT;
BEGIN
  FOR r IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE FUNCTION', 'ALTER FUNCTION')
  LOOP
    -- Chỉ soi hàm rpc_* trong schema public — đó là bề mặt PostgREST phơi
    -- ra ngoài, cũng là chỗ duy nhất overload gây hại kiểu này.
    SELECT p.proname INTO v_ten
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.oid = r.objid
      AND n.nspname = 'public'
      AND p.proname LIKE 'rpc\_%';

    CONTINUE WHEN v_ten IS NULL;

    SELECT count(*),
           string_agg('  · ' || p.proname || '(' ||
                      pg_get_function_identity_arguments(p.oid) || ')',
                      E'\n' ORDER BY p.pronargs)
      INTO v_so, v_chu_ky
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_ten;

    IF v_so > 1 THEN
      RAISE EXCEPTION
        'Có % bản của public.%() — PostgREST sẽ trả PGRST203 và đường gọi từ web chết câm.',
        v_so, v_ten
        USING DETAIL = 'Các bản đang tồn tại:' || E'\n' || v_chu_ky,
              HINT   = 'Thêm tham số thì SỬA hàm cũ (CREATE OR REPLACE giữ nguyên chữ ký) '
                    || 'hoặc DROP FUNCTION bản cũ ngay trong migration này. '
                    || 'Đừng để hai bản cùng tồn tại: tham số có DEFAULT khiến một yêu cầu '
                    || 'thiếu tham số khớp cả hai, PostgREST từ chối chọn. '
                    || 'Thật sự cần overload thì gỡ chốt: DROP EVENT TRIGGER chan_overload_rpc_tg.';
    END IF;
  END LOOP;
END;
$$;


--
-- Name: FUNCTION "chan_overload_rpc"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."chan_overload_rpc"() IS 'Chặn tạo hàm public.rpc_* trùng tên (overload) — nguồn của PGRST203. Xem migration 20260803050000.';


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: vmp_plan_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_plan_items" (
    "id" "text" NOT NULL,
    "object_code" "text" NOT NULL,
    "validation_type" "text" DEFAULT 'PQ'::"text" NOT NULL,
    "report_class" "text" DEFAULT 'Không phụ thuộc'::"text",
    "owner_id" "uuid",
    "owner_name" "text",
    "secondary_owner" "text",
    "effort_days" numeric(4,1),
    "criticality_score" integer,
    "criticality" "public"."criticality" DEFAULT 'medium'::"public"."criticality" NOT NULL,
    "year" integer DEFAULT EXTRACT(year FROM "now"()) NOT NULL,
    "deadline_protocol" "date",
    "deadline_validation" "date",
    "deadline_report" "date",
    "deadline_vmp" "date",
    "actual_protocol_date" "date",
    "actual_validation_date" "date",
    "actual_report_date" "date",
    "actual_vmp_date" "date",
    "scheduled_date" "date",
    "status_protocol" "public"."phase_status" DEFAULT 'not_started'::"public"."phase_status",
    "status_validation" "public"."phase_status" DEFAULT 'not_started'::"public"."phase_status",
    "status_report" "public"."phase_status" DEFAULT 'not_started'::"public"."phase_status",
    "status_vmp" "public"."phase_status" DEFAULT 'not_started'::"public"."phase_status",
    "computed_status" "public"."item_status" DEFAULT 'plan'::"public"."item_status",
    "is_doc_complete" boolean DEFAULT false,
    "has_mismatch" "text",
    "is_active" boolean DEFAULT true,
    "requires_qa_approval" boolean DEFAULT false,
    "qa_approved_by" "uuid",
    "qa_approved_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sheet_row_id" "text",
    "last_synced" timestamp with time zone,
    "deleted_from_sheet" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "delete_reason" "text",
    "validation_code" "text" NOT NULL,
    "missing_from_sheet" boolean DEFAULT false,
    "missing_since" timestamp with time zone,
    "item_state" "text" DEFAULT 'active'::"text" NOT NULL,
    "version" integer DEFAULT 0 NOT NULL,
    "source_sync_run_id" "uuid",
    "source_sheet_row" integer,
    "source_sheet_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "departments" "text"[],
    "execution_departments" "text"[],
    "status_protocol_text" "text",
    "status_validation_text" "text",
    "status_report_text" "text",
    "status_vmp_text" "text",
    "department_text" "text",
    "work_group" "text",
    "scheduled_at" timestamp with time zone,
    "owner_person_id" "uuid",
    "support_person_id" "uuid",
    CONSTRAINT "chk_item_state" CHECK (("item_state" = ANY (ARRAY['active'::"text", 'not_applicable'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "vmp_plan_items_criticality_score_check" CHECK ((("criticality_score" >= 1) AND ("criticality_score" <= 9)))
);


--
-- Name: TABLE "vmp_plan_items"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_plan_items" IS 'Read-only projection of canonical Google Sheet VMP rows for browser roles. Mutated only by the n8n snapshot service.';


--
-- Name: COLUMN "vmp_plan_items"."id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."id" IS 'ID kỹ thuật (PK), có thể tự sinh hoặc = validation_code';


--
-- Name: COLUMN "vmp_plan_items"."object_code"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."object_code" IS 'Mã thiết bị/hệ thống (FK → vmp_objects). Ví dụ: TB001, HT005';


--
-- Name: COLUMN "vmp_plan_items"."validation_type"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."validation_type" IS 'Loại thẩm định: IQ, OQ, PQ, CSV, RE';


--
-- Name: COLUMN "vmp_plan_items"."is_active"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."is_active" IS 'TRUE = đang hiệu lực. Chỉ QA/admin được đổi. KHÔNG tự động đổi khi mất khỏi Sheet.';


--
-- Name: COLUMN "vmp_plan_items"."validation_code"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."validation_code" IS 'Mã thẩm định duy nhất — neo chính cho sync Sheet↔DB. Ví dụ: VD-TB001-PQ-2026';


--
-- Name: COLUMN "vmp_plan_items"."missing_from_sheet"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."missing_from_sheet" IS 'TRUE nếu mã không còn trong Google Sheet. Dashboard ẩn đi nhưng giữ trong DB để truy vết.';


--
-- Name: COLUMN "vmp_plan_items"."item_state"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."item_state" IS 'Vòng đời nghiệp vụ: active | not_applicable (Không áp dụng) | cancelled (Đã hủy). Khác missing_from_sheet và is_active.';


--
-- Name: COLUMN "vmp_plan_items"."version"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."version" IS 'Whole-row optimistic revision. Every UPDATE statement increments exactly once.';


--
-- Name: COLUMN "vmp_plan_items"."departments"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."departments" IS 'Tập bộ phận (sx/cd/kho/rd/qc/qa) suy ra từ Sheet "bộ phận quản lý" (cột 5 canonical) bằng vmp_parse_depts(), precompute lúc sync. Nguồn chân lý cho bộ lọc Bộ phận quản lý.';


--
-- Name: COLUMN "vmp_plan_items"."execution_departments"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."execution_departments" IS 'Tập bộ phận suy ra từ cột PHỤ "Bộ phận thực hiện thẩm định" (bo_phan_thuc_hien_goc, ngoài 37 canonical). Nguồn chân lý cho chiều "Bộ phận thực hiện". Rỗng nếu Sheet không ghi.';


--
-- Name: COLUMN "vmp_plan_items"."status_vmp_text"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."status_vmp_text" IS 'Chữ trạng thái tiếng Việt đang hiệu lực. Giàu hơn enum phase_status (có "Bổ sung đề cương", "Tạm ngưng", "Chờ báo cáo"…). Web ghi thẳng vào đây; KHÔNG còn đọc từ ảnh chụp Google Sheet.';


--
-- Name: COLUMN "vmp_plan_items"."scheduled_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_plan_items"."scheduled_at" IS 'Thời điểm bộ phận quản lý thiết bị xếp lịch thẩm định, theo giờ Asia/Bangkok.';


--
-- Name: check_doc_mismatch("public"."vmp_plan_items"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."check_doc_mismatch"("item" "public"."vmp_plan_items") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    IF item.status_validation = 'completed' AND item.status_report != 'completed' THEN
        RETURN 'val_done_doc_pending';
    ELSIF item.status_validation != 'completed' AND item.status_report = 'completed' THEN
        RETURN 'doc_done_val_pending';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: compute_doc_flags(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."compute_doc_flags"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- computed_status (dùng item_status enum)
  NEW.computed_status := compute_item_status_v2(NEW)::item_status;

  -- is_doc_complete: báo cáo đã hoàn thành
  NEW.is_doc_complete := (NEW.status_report = 'completed');

  -- has_mismatch: TEXT — lệch pha hồ sơ
  IF NEW.status_validation = 'completed' AND NEW.status_report != 'completed' THEN
    NEW.has_mismatch := 'val_done_doc_pending';
  ELSIF NEW.status_report = 'completed' AND NEW.status_validation != 'completed' THEN
    NEW.has_mismatch := 'doc_done_val_pending';
  ELSE
    NEW.has_mismatch := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: compute_item_status("public"."vmp_plan_items"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."compute_item_status"("item" "public"."vmp_plan_items") RETURNS "public"."item_status"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    -- VMP completed
    IF item.status_vmp = 'completed' THEN RETURN 'done'; END IF;
    -- Overdue
    IF item.deadline_vmp IS NOT NULL AND item.deadline_vmp < CURRENT_DATE
       AND item.status_vmp != 'completed' THEN RETURN 'over'; END IF;
    -- In progress
    IF item.status_validation IN ('in_progress', 'completed')
       OR item.status_protocol = 'completed' THEN RETURN 'prog'; END IF;
    -- Planned (far future)
    IF item.deadline_protocol IS NOT NULL
       AND item.deadline_protocol - CURRENT_DATE > 30 THEN RETURN 'plan'; END IF;
    -- Default todo
    RETURN 'todo';
END;
$$;


--
-- Name: compute_item_status_v2("public"."vmp_plan_items"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."compute_item_status_v2"("item" "public"."vmp_plan_items") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_deadline DATE := item.deadline_vmp;
BEGIN
  IF item.status_vmp = 'completed' THEN
    RETURN 'done';
  END IF;
  IF v_deadline IS NOT NULL AND v_deadline < v_today THEN
    RETURN 'over';
  END IF;
  IF item.status_protocol IN ('in_progress','completed')
     OR item.status_validation IN ('in_progress','completed')
     OR item.status_report IN ('in_progress','completed') THEN
    RETURN 'prog';
  END IF;
  IF v_deadline IS NOT NULL AND v_deadline <= v_today + 30 THEN
    RETURN 'todo';
  END IF;
  RETURN 'plan';
END;
$$;


--
-- Name: duoc_phep("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."duoc_phep"("p_hanh_dong" "text", "p_vai_tro" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.muc_quyen(p_hanh_dong, p_vai_tro) <> 'khong';
$$;


--
-- Name: enforce_plan_item_validation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."enforce_plan_item_validation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_source text;
  v_problem text := null;
begin
  if to_regclass('pg_temp.tmp_vmp_source') is not null then
    v_source := 'sheet_sync';
  else
    v_source := coalesce(current_setting('app.audit_source', true), 'unknown');
  end if;

  if new.validation_code is null or new.validation_code = '' then
    raise exception 'Thiếu mã thẩm định (validation_code)';
  end if;

  if new.status_vmp = 'completed' and new.actual_vmp_date is null then
    v_problem := 'Trạng thái VMP=hoàn thành nhưng thiếu ngày hoàn thành thực tế';
  elsif new.actual_vmp_date is not null
        and new.deadline_protocol is not null
        and new.actual_vmp_date < new.deadline_protocol then
    v_problem := 'Ngày hoàn thành VMP trước ngày bắt đầu đề cương';
  end if;

  if v_problem is not null then
    if v_source in ('dashboard_rpc', 'dashboard_inventory') then
      raise exception 'Mã %: %', new.validation_code, v_problem;
    elsif v_source <> 'sheet_sync_rollback' then
      insert into public.data_quality_issues (
        plan_item_id, issue_type, severity, message, detected_at
      ) values (
        new.id,
        'validation_conflict',
        'error',
        'Mã ' || new.validation_code || ': ' || v_problem || ' (nguồn: ' || v_source || ')',
        now()
      )
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.vmp_current_session_is_active()
     and public.vmp_business_role(auth.uid()) = 'admin'
$$;


--
-- Name: is_admin_or_qa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_admin_or_qa"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.vmp_current_session_is_active()
     and public.vmp_business_role(auth.uid()) in ('admin', 'qa_manager')
$$;


--
-- Name: item_permissions_mode(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."item_permissions_mode"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    raise exception using errcode = '42501',
      message = public.vmp_session_denial() ->> 'error_code';
  end if;

  return coalesce((
    select value #>> '{}'
    from public.system_config
    where key = 'item_permissions_mode'
  ), 'preview');
end
$$;


--
-- Name: ly_do_khong_sua_duoc("text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ly_do_khong_sua_duoc"("p_validation_code" "text", "p_uid" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text; v_dept text; v_ten text; v_rieng text;
  v_muc text; v_ql text; v_th text[]; v_loai text; v_line text;
begin
  select p.role::text, p.department, p.full_name, p.pham_vi
    into v_role, v_dept, v_ten, v_rieng
  from profiles p where p.id = p_uid;
  if v_role is null then return 'Không xác định được người dùng'; end if;

  /* Phạm vi riêng của người thắng mức chung của vai. Đặt riêng cho một
     người là việc có chủ đích, còn mức của vai chỉ là mặc định. */
  v_muc := coalesce(v_rieng, public.muc_quyen('update_progress', v_role));
  if v_muc = 'khong' then
    return 'Tài khoản của bạn không có quyền cập nhật tiến độ';
  end if;
  if v_muc = 'co' then return ''; end if;

  select o.department, o.line, i.execution_departments, i.validation_type
    into v_ql, v_line, v_th, v_loai
  from vmp_plan_items i join vmp_objects o on o.code = i.object_code
  where i.validation_code = p_validation_code;
  if not found then return 'Không tìm thấy mã thẩm định: ' || p_validation_code; end if;

  if v_muc = 'bo_phan' then
    if v_dept is null then
      return 'Tài khoản của bạn chưa được gán bộ phận — chưa sửa được hạng mục nào.';
    end if;
    if v_dept = v_ql or v_dept = any(coalesce(v_th, array[]::text[])) then return ''; end if;
    return 'Hạng mục này do bộ phận ' || coalesce(v_ql, '?')
      || ' quản lý, bộ phận ' || coalesce(array_to_string(v_th, ', '), '?')
      || ' thực hiện — bạn thuộc ' || v_dept || ' nên không sửa được.';
  end if;

  if v_muc = 'phan_cong' then
    /* Nối qua user_id trước (chắc chắn), rớt về khớp tên sau (cho người
       chưa được nối). Khớp tên là đường dự phòng, không phải đường chính
       — đó chính là chỗ hệ thống cũ sai. */
    if exists (
      select 1 from vmp_assignment_matrix m
      left join vmp_performers f on f.user_id = p_uid
      where m.is_active
        and (lower(btrim(m.staff_name)) = lower(btrim(coalesce(f.performer_name, v_ten, '')))
             and coalesce(btrim(coalesce(f.performer_name, v_ten, '')), '') <> '')
        and m.validation_type = v_loai
        and (m.line = '*' or m.line = coalesce(nullif(btrim(v_line), ''), '*'))
    ) then return ''; end if;
    return 'Bạn chưa được phân công loại ' || coalesce(v_loai, '?')
      || ' ở line ' || coalesce(nullif(btrim(v_line), ''), '(không chia line)') || '.';
  end if;

  return 'Mức quyền không hiểu được: ' || v_muc;
end;
$$;


--
-- Name: match_vmp_kb("extensions"."vector", integer, "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."match_vmp_kb"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 6, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" bigint, "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select d.id, d.content, d.metadata,
         1 - (d.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.vmp_kb_documents d
  where d.embedding is not null
    and d.metadata @> coalesce(filter, '{}'::jsonb)
  order by d.embedding operator(extensions.<=>) query_embedding
  limit greatest(1, least(coalesce(match_count, 6), 30));
$$;


--
-- Name: muc_quyen("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."muc_quyen"("p_hanh_dong" "text", "p_vai_tro" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with vai as (
    select coalesce(
      public.vmp_business_role(auth.uid()),
      case p_vai_tro
        when 'admin'      then 'admin'
        when 'qa_manager' then 'qa_manager'
        when 'viewer'     then 'viewer'
        else null
      end
    ) as business_role
  ),
  anh_xa as (
    select m.screen_id, m.hanh_dong_moi
    from public.vmp_legacy_action_map m
    where m.hanh_dong_cu = p_hanh_dong
  )
  select case
    /* (b) chưa ánh xạ, hoặc không giải được vai → luật cũ, y như trước */
    when not exists (select 1 from anh_xa)
      or (select business_role from vai) is null
    then coalesce(
      (select muc from public.vmp_role_permissions
        where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro),
      'khong')
    /* (a) đã ánh xạ → hệ 6 vai trả lời */
    when exists (
      select 1
      from anh_xa a
      join public.vmp_screen_permissions sp
        on sp.screen_id = a.screen_id
       and sp.business_role = (select business_role from vai)
      where a.hanh_dong_moi = any(sp.actions)
    ) then 'co'
    else 'khong'
  end;
$$;


--
-- Name: muc_xem("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."muc_xem"("p_bieu_thuc" "text", "p_vai" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  with d as (
    select
      coalesce(btrim(p_bieu_thuc), 'true') = 'true'          as mo_het,
      coalesce(p_bieu_thuc, '') ~ 'auth\.uid|auth_uid'       as co_minh,
      coalesce(p_bieu_thuc, '') ~ 'is_admin_or_qa|qa_manager' as co_qa,
      coalesce(p_bieu_thuc, '') ~ 'is_admin_or_qa|''admin''' as co_admin,
      coalesce(p_bieu_thuc, '') ~ 'is_sensitive'             as co_nhay_cam
  )
  select case
    /* Không có điều kiện = mọi tài khoản đã đăng nhập đều đọc được. */
    when d.mo_het then 'tat_ca'
    /* "của mình HOẶC người phụ trách" — dạng của profiles, vmp_ai_chat_log */
    when d.co_minh and d.co_qa then
      case when p_vai in ('admin', 'qa_manager') then 'tat_ca' else 'cua_minh' end
    when d.co_minh and d.co_admin then
      case when p_vai = 'admin' then 'tat_ca' else 'cua_minh' end
    /* Chỉ người phụ trách — dạng của audit_logs, data_quality_issues */
    when d.co_qa then
      case when p_vai in ('admin', 'qa_manager') then 'tat_ca' else 'khong' end
    /* "phần không nhạy cảm thì ai cũng xem" — dạng của system_config */
    when d.co_admin and d.co_nhay_cam then
      case when p_vai = 'admin' then 'tat_ca' else 'mot_phan' end
    when d.co_admin then
      case when p_vai = 'admin' then 'tat_ca' else 'khong' end
    else 'khong_ro'
  end
  from d;
$$;


--
-- Name: FUNCTION "muc_xem"("p_bieu_thuc" "text", "p_vai" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."muc_xem"("p_bieu_thuc" "text", "p_vai" "text") IS 'Phân loại một biểu thức RLS thành mức xem của một vai. Trả khong_ro nếu không nhận diện được dạng biểu thức — cố ý, để giao diện hiện nguyên văn thay vì đoán.';


--
-- Name: rpc_active_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_active_rules"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_active_rules__five_role_impl_20260824(); end $$;


--
-- Name: rpc_active_rules__five_role_impl_20260824(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_active_rules__five_role_impl_20260824"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'cap_nhat', now(),

    'diem_trong_yeu', jsonb_build_object(
      'cong_thuc', 'Điểm trọng yếu = Điểm mức độ phức tạp × Điểm ảnh hưởng tới chất lượng sản phẩm',
      'thang', '1 … 9',
      'phuc_tap', jsonb_build_array(
        jsonb_build_object('muc','Cao','diem',3,
          'mo_ta','Hệ nhiều thành phần liên động, có chu trình vận hành hoặc xử lý không khí sạch. Đòi đủ DQ→IQ→OQ→PQ và tái thẩm định định kỳ có phép đo chuyên biệt.',
          'vi_du','LAF / buồng cân / tủ ATSH / isolator (HEPA DOP-PAO, vận tốc gió ±20%, đếm tiểu phân, smoke pattern, recovery) · nồi hấp & tủ hấp tiệt trùng (phân bố nhiệt, xuyên nhiệt, chỉ thị sinh học, F0) · HVAC · nước tinh khiết / nước cất / hơi tinh khiết · khí nén / khí nitơ · sắc ký, quang phổ, FTIR, TOC, nội độc tố · BFS, lên men, CIP, lọc vô trùng · kho thông minh · quy trình vô khuẩn'),
        jsonb_build_object('muc','Trung bình','diem',2,
          'mo_ta','Thiết bị độc lập có thông số vận hành cần OQ/PQ, nhưng không có chuỗi phép đo chuyên biệt như nhóm Cao.',
          'vi_du','Tank pha chế · máy đóng / rót / ép vỉ · máy rửa, tủ sấy, tủ ấm · passbox, tủ truyền nguyên liệu (có HEPA và khoá liên động nhưng không có chu trình để chạy PQ nhiều thông số) · chiller · kho lạnh / kho mát · quy trình không vô khuẩn · hệ xử lý nước thải'),
        jsonb_build_object('muc','Thấp','diem',1,
          'mo_ta','Chủ yếu chỉ cần hiệu chuẩn hoặc xác nhận lắp đặt.',
          'vi_du','Cân check trên dây chuyền · tủ lạnh / tủ mát bảo quản · giá kệ, xe đẩy · kho thường · xe vận chuyển')),
      'anh_huong', jsonb_build_array(
        jsonb_build_object('muc','Ảnh hưởng trực tiếp tới chất lượng sản phẩm','diem',3,
          'mo_ta','Theo ISPE Baseline Guide 5: tác động trực tiếp tới thuộc tính chất lượng trọng yếu (CQA), HOẶC là hệ phụ trợ trọng yếu cấp cho sản phẩm.',
          'vi_du','Thiết bị chạm sản phẩm · khí nén, khí nitơ, nước tinh khiết (critical utility) · tiệt trùng / rửa / sấy dụng cụ tiếp xúc sản phẩm · passbox, tủ truyền (kiểm soát nhiễm chéo giữa các cấp sạch)'),
        jsonb_build_object('muc','Ảnh hưởng gián tiếp tới chất lượng sản phẩm','diem',2,
          'mo_ta','Không quyết định CQA của lô xuất bán, nhưng hỏng thì ảnh hưởng tới quyết định chất lượng.',
          'vi_du','Kho lưu mẫu QC (mẫu lưu phục vụ điều tra và độ ổn định) · thẩm định vận chuyển bằng xe thường — nếu chuyển thuốc lạnh thì QA phải nâng lên 3'),
        jsonb_build_object('muc','Không ảnh hưởng tới chất lượng sản phẩm','diem',1,
          'mo_ta','Không nằm trên đường ảnh hưởng tới chất lượng sản phẩm.',
          'vi_du','Hệ xử lý nước thải · kho lưu hồ sơ lô · kho lưu mẫu nghiên cứu')),
      'phan_bo', (
        select coalesce(jsonb_agg(jsonb_build_object('diem', criticality_score, 'so_luong', n)
                                  order by criticality_score desc), '[]'::jsonb)
        from (select criticality_score, count(*) n from public.vmp_source_objects
              where criticality_score is not null group by 1) d),
      'phan_bo_truc', jsonb_build_object(
        'phuc_tap', (select coalesce(jsonb_agg(jsonb_build_object('diem',complexity_score,'so_luong',n) order by complexity_score desc),'[]'::jsonb)
                     from (select complexity_score, count(*) n from public.vmp_source_objects
                           where complexity_score is not null group by 1) a),
        'anh_huong', (select coalesce(jsonb_agg(jsonb_build_object('diem',quality_impact_score,'so_luong',n) order by quality_impact_score desc),'[]'::jsonb)
                      from (select quality_impact_score, count(*) n from public.vmp_source_objects
                            where quality_impact_score is not null group by 1) b)),
      'da_duyet', (select count(*) from public.vmp_source_objects where criticality_source = 'manual'),
      'cho_duyet', (select count(*) from public.vmp_source_objects where criticality_source = 'auto')
    ),

    'sinh_timeline', jsonb_build_object(
      'loc', 'Chỉ sinh cho đối tượng có Thẩm định = y (so sánh sau trim/lower/NFC)',
      'loai_tham_dinh', jsonb_build_array(
        jsonb_build_object('phan_loai','Thiết bị · Hệ thống phụ trợ',
          'loai','Lần đầu: DQ, FAT/SAT, IQ, OQ, PQ — về sau: OQ, PQ'),
        jsonb_build_object('phan_loai','Quy trình', 'loai','PV'),
        jsonb_build_object('phan_loai','Kho', 'loai','GSP'),
        jsonb_build_object('phan_loai','Vận chuyển', 'loai','GDP')),
      'lan_dau', 'Năm nhập = năm thẩm định VÀ đối tượng chưa từng có IQ',
      'so_lan_trong_nam', 'max(1, 12 ÷ tần suất). Tần suất trên 12 tháng chỉ sinh khi đủ chu kỳ kể từ mốc gần nhất',
      'ma_id', '{Mã đối tượng}/{Năm}.{Lần 2 chữ số}-{Loại thẩm định}',
      'moc_thoi_gian', jsonb_build_array(
        'T (Deadline VMP) = ngày cuối tháng của (tháng đầu tiên + (lần−1) × tần suất)',
        'Hạn báo cáo = T − 5 ngày',
        'Hạn kết thúc thẩm định = Hạn báo cáo − khoảng cách báo cáo',
        'Hạn bắt đầu thẩm định = Hạn kết thúc − Số ngày công thẩm định thực tế',
        'Hạn hoàn thành đề cương = Hạn bắt đầu − 60 ngày'),
      'khoang_cach_bao_cao', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dieu_kien', 'Phân loại báo cáo: ' || report_class,
               'ngay', report_days,
               'so_doi_tuong', (select count(*) from public.vmp_source_objects s
                                where s.report_class = d.report_class)
             ) order by report_days), '[]'::jsonb)
      from public.vmp_deadline_rules d where is_active),
      'khoang_cach_bao_cao_nguon',
        'Đọc từ bảng vmp_deadline_rules. LƯU Ý: rpc_generate_timeline hiện '
        'gắn cứng các số này trong thân hàm, nên sửa bảng CHƯA đổi được '
        'timeline — cần chuyển hàm sinh timeline sang đọc bảng.'),

    -- SÁU vai nghiệp vụ, tổng hợp thẳng từ bảng quyền màn hình — QA sửa
    -- ma trận là trang luật đổi theo, không còn bản chép tay trong hàm.
    'phan_quyen', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'vai_tro', r.nhan,
               'quyen', r.tom_tat) order by r.thu_tu), '[]'::jsonb)
      from (
        select
          case sp.business_role
            when 'admin'            then 'Quản trị (admin)'
            when 'qa_manager'       then 'Quản lý QA (qa_manager)'
            when 'qa_staff'         then 'QA (qa_staff)'
            when 'workshop_manager' then 'Quản lý xưởng (workshop_manager)'
            when 'workshop_staff'   then 'Nhân viên xưởng (workshop_staff)'
            else 'Chỉ xem (viewer)'
          end as nhan,
          case sp.business_role
            when 'admin' then 1 when 'qa_manager' then 2 when 'qa_staff' then 3
            when 'workshop_manager' then 4 when 'workshop_staff' then 5 else 6
          end as thu_tu,
          'Thấy ' || count(*) filter (where sp.can_view) || '/'
            || count(*) || ' màn · '
            || count(*) filter (where sp.can_view
                 and exists (select 1 from unnest(sp.actions) a where a <> 'view'))
            || ' màn có thao tác ghi · phạm vi dữ liệu: '
            || coalesce(nullif(string_agg(distinct
                 case sp.data_scope
                   when 'all' then 'toàn hệ thống'
                   when 'workshop' then 'theo xưởng'
                   when 'assigned' then 'được phân công'
                   when 'own' then 'của mình' end, ' · '), ''), 'không có')
          as tom_tat
        from public.vmp_screen_permissions sp
        group by sp.business_role
      ) r),
    'phan_quyen_che_do', (
      select case coalesce(value #>> '{}', 'preview')
               when 'enforced' then 'ĐANG ÁP DỤNG (enforced) — quyền màn hình có hiệu lực thật'
               else 'Đang đối chiếu (preview) — chưa khoá ai, chỉ ghi nhận lệch'
             end
      from public.system_config where key = 'screen_access_mode'),
    'phan_quyen_ghi_chu',
      'Ma trận đầy đủ (từng màn, từng hành động, từng vai) xem và sửa ở màn '
      'Phân quyền & trách nhiệm — luật nằm trong bảng vmp_screen_permissions '
      'và vmp_role_permissions, mọi RPC kiểm quyền phía server.',

    'toan_ven_du_lieu', jsonb_build_array(
      'Mọi thao tác ghi đi qua RPC kiểm quyền phía server; trình duyệt không ghi thẳng bảng',
      'Đánh dấu hoàn thành hoặc nhập ngày hoàn thành BẮT BUỘC có lý do (yêu cầu GMP)',
      'Khoá lạc quan theo version: hai người sửa cùng lúc thì người sau bị chặn, không ghi đè',
      'Audit trail ghi bằng trigger DB: giá trị cũ, giá trị mới, trường đã đổi, lý do, người, IP',
      'Xoá là xoá mềm — giữ bản ghi để truy vết'),

    'so_lieu_hien_tai', jsonb_build_object(
      'doi_tuong_nguon',  (select count(*) from public.vmp_source_objects where is_active),
      'co_tham_dinh',     (select count(*) from public.vmp_source_objects where is_active and validate_flag='y'),
      'hang_muc',         (select count(*) from public.vmp_plan_items where is_active),
      'ban_ghi_audit',    (select count(*) from public.audit_logs))
  );

$$;


--
-- Name: rpc_ai_cache_doc("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_cache_doc"("p_question" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_khoa text := public.vmp_ai_khoa_cau_hoi(p_question);
  v_van  text := public.vmp_ai_dau_van();
  v_row  public.vmp_ai_cache;
begin
  update public.vmp_ai_cache
     set so_lan_dung = so_lan_dung + 1, dung_gan_nhat = now()
   where khoa_cau_hoi = v_khoa and dau_van = v_van and het_han_luc > now()
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('trung', false);
  end if;

  return jsonb_build_object(
    'trung', true, 'tra_loi', v_row.tra_loi, 'nguon', v_row.nguon,
    'tao_luc', v_row.tao_luc, 'so_lan_dung', v_row.so_lan_dung);
end;
$$;


--
-- Name: rpc_ai_cache_nn_luu("text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_cache_nn_luu"("p_cau_hoi" "text", "p_vector" "text", "p_phan_hoi" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_khoa text := btrim(regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi,'')), '[^a-z0-9]+', ' ', 'g'));
  v_tho  text := ' ' || lower(regexp_replace(coalesce(p_cau_hoi,''), '[^[:alnum:]]+', ' ', 'g')) || ' ';
begin
  -- Không có vector / không có nội dung thì thôi
  if p_vector is null or btrim(p_vector) = ''
     or coalesce(btrim(p_phan_hoi ->> 'tra_loi'), '') = '' then
    return jsonb_build_object('luu', false, 'ly_do', 'thieu vector hoac noi dung');
  end if;

  -- Câu cá nhân: trả cho người khác là lộ chuyện riêng — không lưu
  if (' ' || v_khoa || ' ') ~ ' (toi|ta|minh|em|cua toi|cua ta|cua minh|la ai) ' then
    return jsonb_build_object('luu', false, 'ly_do', 'cau ca nhan');
  end if;

  -- Câu quá ngắn: gần chắc là câu nói tiếp mạch cũ, nghĩa nằm ở lượt trước
  if coalesce(array_length(string_to_array(btrim(v_khoa), ' '), 1), 0) < 3 then
    return jsonb_build_object('luu', false, 'ly_do', 'cau qua ngan, de la cau noi tiep');
  end if;

  -- Câu trỏ về lượt trước: câu trả lời chỉ đúng trong đúng mạch chuyện đó
  if exists (
    select 1 from unnest(array[
      ' cái đó ',' cái kia ',' cái này ',' cái ấy ',' con đó ',' máy đó ',' máy này ',' máy kia ',
      ' nó ',' còn lại ',' thế còn ',' vậy còn ',' như trên ',' ở trên ',
      ' vừa rồi ',' vừa nãy ',' ban nãy ',' hồi nãy ',' lượt trước ',' câu trước ',' vừa nói '
    ]) cum where v_tho like '%' || cum || '%'
  ) then
    return jsonb_build_object('luu', false, 'ly_do', 'cau noi tiep mach hoi thoai');
  end if;

  -- Một khoá chỉ giữ bản mới nhất
  update public.vmp_ai_cache_ngu_nghia
  set is_valid = false, invalidated_at = now(), invalidated_reason = 'co ban moi hon'
  where is_valid and cau_hoi_khoa = v_khoa;

  insert into public.vmp_ai_cache_ngu_nghia (cau_hoi, cau_hoi_khoa, vector, phan_hoi)
  values (p_cau_hoi, v_khoa, p_vector::vector, p_phan_hoi);

  return jsonb_build_object('luu', true);
end;
$$;


--
-- Name: rpc_ai_cache_nn_tim("text", "text", "text", double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_cache_nn_tim"("p_cau_hoi" "text", "p_vector" "text" DEFAULT NULL::"text", "p_phien" "text" DEFAULT NULL::"text", "p_nguong" double precision DEFAULT 0.93) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_khoa text := btrim(regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi,'')), '[^a-z0-9]+', ' ', 'g'));
  v_r    record;
begin
  -- Ưu tiên trùng tuyệt đối theo khoá chuẩn hoá (rẻ nhất, chắc nhất)
  select id, phan_hoi, 1.0::float as giong into v_r
  from public.vmp_ai_cache_ngu_nghia
  where is_valid and created_at::date = current_date
    and created_at > now() - interval '6 hours'   -- van phụ: người dùng dặn cẩn thận, câu trả lời đổi theo thời gian
    and cau_hoi_khoa = v_khoa
  order by id desc limit 1;

  -- Không trùng khít thì so vector — chỉ khi có vector
  if v_r.id is null and p_vector is not null and btrim(p_vector) <> '' then
    select id, phan_hoi, (1 - (vector <=> p_vector::vector))::float as giong into v_r
    from public.vmp_ai_cache_ngu_nghia
    where is_valid and created_at::date = current_date
      and created_at > now() - interval '6 hours'
      and (1 - (vector <=> p_vector::vector)) >= p_nguong
    order by vector <=> p_vector::vector
    limit 1;
  end if;

  if v_r.id is null then
    return jsonb_build_object('trung', false);
  end if;

  update public.vmp_ai_cache_ngu_nghia set hit_count = hit_count + 1 where id = v_r.id;

  -- Ghi vào mạch hội thoại để "câu tiếp theo" vẫn nối được ngữ cảnh
  if p_phien is not null and btrim(p_phien) <> '' then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh, cho_lam_ro)
    values (p_phien, p_cau_hoi, 'cache', false);
  end if;

  return jsonb_build_object('trung', true, 'do_giong', round(v_r.giong::numeric, 3), 'phan_hoi', v_r.phan_hoi);
end;
$$;


--
-- Name: rpc_ai_cham_tra_cuu("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_cham_tra_cuu"("p_ghi_chu" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  r        record;
  v_kq     jsonb;
  v_dat    boolean;
  v_tong   integer := 0;
  v_diem   integer := 0;
  v_truot  jsonb := '[]'::jsonb;
begin
  for r in select * from public.vmp_ai_cau_hoi_vang where bat order by id loop
    v_tong := v_tong + 1;
    v_kq := public.rpc_ai_thong_ke_loc(r.cau_hoi, 3);

    if (r.mong_doi ->> 'khong_khoanh')::boolean is true then
      v_dat := coalesce((v_kq ->> 'so_nhom')::int, 0) = 0;
    else
      -- So trên bản BỎ DẤU: tránh bẫy hai chuỗi Unicode trông giống nhau
      select exists (
        select 1 from jsonb_array_elements(v_kq -> 'thong_ke') t
        where t ->> 'loai' = r.mong_doi ->> 'loai'
          and exists (
            select 1 from jsonb_array_elements_text(t -> 'danh_sach_gia_tri') g
            where public.vmp_khong_dau(g) = public.vmp_khong_dau(r.mong_doi ->> 'gia_tri'))
      ) into v_dat;
    end if;

    if v_dat then
      v_diem := v_diem + 1;
    else
      v_truot := v_truot || jsonb_build_array(jsonb_build_object(
        'cau_hoi', r.cau_hoi, 'nhom', r.nhom, 'mong_doi', r.mong_doi,
        'thuc_te', coalesce((
          select jsonb_agg(jsonb_build_object('loai', t ->> 'loai', 'gia_tri', t ->> 'gia_tri'))
          from jsonb_array_elements(v_kq -> 'thong_ke') t), '[]'::jsonb)));
    end if;
  end loop;

  insert into public.vmp_ai_cham_diem_log (tong, dat, truot, ghi_chu)
  values (v_tong, v_diem, v_truot, p_ghi_chu);

  return jsonb_build_object('ok', true, 'tong', v_tong, 'dat', v_diem,
    'ty_le', case when v_tong > 0 then round(100.0 * v_diem / v_tong, 1) else 0 end,
    'truot', v_truot);
end;
$$;


--
-- Name: FUNCTION "rpc_ai_cham_tra_cuu"("p_ghi_chu" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_ai_cham_tra_cuu"("p_ghi_chu" "text") IS 'Chạy cả bộ câu hỏi vàng qua tầng nhận diện rồi chấm. Gọi SAU MỖI LẦN sửa rpc_ai_hieu_tu_khoa / rpc_ai_thong_ke_loc / từ điển / bí danh.';


--
-- Name: rpc_ai_chay_bo_kiem("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_chay_bo_kiem"("p_nguoi" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r      record;
  v_kq   jsonb;
  v_tl   text;
  v_dat  boolean;
  v_ly   text[];
  v_ds   jsonb := '[]'::jsonb;
  s      text;
begin
  for r in select * from public.vmp_ai_bo_kiem order by ma loop
    v_ly := '{}';

    -- Đường "thong_ke": không đi qua tra_loi_nhanh, soi thẳng tầng đếm.
    if (r.mong_doi->>'duong') = 'thong_ke' then
      v_tl := public.rpc_ai_thong_ke_loc(r.cau_hoi, 3)::text;
      for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'chua_chuoi','[]'::jsonb)) loop
        if v_tl not like '%' || s || '%' then
          v_ly := array_append(v_ly, 'thiếu chuỗi "' || s || '"');
        end if;
      end loop;
      for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'khong_chua','[]'::jsonb)) loop
        if v_tl like '%' || s || '%' then
          v_ly := array_append(v_ly, 'chứa chuỗi cấm "' || s || '"');
        end if;
      end loop;
      v_ds := v_ds || jsonb_build_object(
        'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', array_length(v_ly,1) is null,
        'duong', 'thong_ke', 'ly_do', to_jsonb(v_ly), 'ghi_chu', r.ghi_chu);
      continue;
    end if;

    v_kq := public.rpc_ai_tra_loi_nhanh(
              r.cau_hoi, null,
              coalesce(p_nguoi, '{"ten":"Tào Tiến Hoàn","quyen":"admin","bo_phan":"QA"}'::jsonb),
              'bo-kiem');
    v_tl := coalesce(v_kq->>'tra_loi', '');

    if (r.mong_doi->>'duong') = 'sql' and not (v_kq->>'khop')::boolean then
      v_ly := array_append(v_ly, 'đáng lẽ SQL trả lời được nhưng lại đẩy sang AI');
    end if;
    -- Câu đi đường AI mà lần này trúng ĐỆM thì vẫn đúng: đệm chỉ chứa câu
    -- trả lời do AI soạn trước đó, dữ liệu chưa đổi nên dùng lại là hợp lệ.
    -- Coi 'dem' là hỏng thì cứ chạy bộ kiểm lần thứ hai là báo động giả.
    if (r.mong_doi->>'duong') = 'ai' and (v_kq->>'khop')::boolean
       and coalesce(v_kq->>'nguon','') <> 'dem' then
      v_ly := array_append(v_ly, 'đáng lẽ phải nhờ AI nhưng SQL lại tự trả lời');
    end if;
    if (r.mong_doi->>'duong') = 'ai' and coalesce(v_kq->>'nguon','') = 'dem' then
      v_ds := v_ds || jsonb_build_object(
        'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', true, 'duong', 'dem',
        'ly_do', '[]'::jsonb,
        'ghi_chu', 'Trúng đệm — câu trả lời do AI soạn trước đó, dữ liệu chưa đổi.');
      continue;
    end if;
    if r.mong_doi ? 'y_dinh' and coalesce(v_kq->>'y_dinh','') <> (r.mong_doi->>'y_dinh') then
      v_ly := array_append(v_ly, 'ý định ra "' || coalesce(v_kq->>'y_dinh','(rỗng)')
                                 || '" thay vì "' || (r.mong_doi->>'y_dinh') || '"');
    end if;
    -- Câu đi đường AI: bộ kiểm chạy trong SQL nên KHÔNG gọi được mô hình,
    -- không có nội dung để soi. Chỉ kiểm định tuyến; nội dung phải kiểm
    -- qua webhook thật. Nói rõ giới hạn còn hơn báo "đạt" giả.
    if (r.mong_doi->>'duong') = 'ai' and not (v_kq->>'khop')::boolean then
      v_ds := v_ds || jsonb_build_object(
        'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', array_length(v_ly,1) is null,
        'duong', 'ai', 'ly_do', to_jsonb(v_ly),
        'ghi_chu', 'Định tuyến đúng. Nội dung phải kiểm qua webhook thật — '
                   || 'bộ kiểm SQL không gọi được mô hình.');
      continue;
    end if;

    for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'chua_chuoi','[]'::jsonb)) loop
      if v_tl not like '%' || s || '%' then
        v_ly := array_append(v_ly, 'thiếu chuỗi "' || s || '"');
      end if;
    end loop;
    for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'khong_chua','[]'::jsonb)) loop
      if v_tl like '%' || s || '%' then
        v_ly := array_append(v_ly, 'chứa chuỗi cấm "' || s || '"');
      end if;
    end loop;

    v_dat := array_length(v_ly, 1) is null;
    v_ds := v_ds || jsonb_build_object(
      'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', v_dat,
      'duong', case when (v_kq->>'khop')::boolean then coalesce(v_kq->>'nguon','sql') else 'ai' end,
      'ly_do', to_jsonb(v_ly), 'ghi_chu', r.ghi_chu);
  end loop;

  delete from public.vmp_ai_hoi_thoai where phien = 'bo-kiem';

  return jsonb_build_object(
    'tong', jsonb_array_length(v_ds),
    'dat', (select count(*) from jsonb_array_elements(v_ds) e where (e->>'dat')::boolean),
    'chi_tiet', v_ds);
end;
$$;


--
-- Name: rpc_ai_chon_mo_hinh("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_chon_mo_hinh"("p_question" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_kho jsonb := public.rpc_ai_do_kho(p_question);
  v_bac text  := v_kho->>'bac';
  v_ds  jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'ma', ma, 'ten', ten, 'nha_cung_cap', nha_cung_cap, 'bac', bac,
           'mien_phi', mien_phi,
           'dang_nghi', (nghi_den is not null and nghi_den > now()),
           'ty_le_loi', case when so_lan_goi = 0 then null
                             else round(100.0 * so_lan_loi / so_lan_goi) end,
           'tre_tb_ms', tre_tb_ms)
         order by
           (bac = 'luoi_cuoi'),                            -- lưới cuối xuống sau cùng
           (nghi_den is not null and nghi_den > now()),    -- đang nghỉ thì xuống
           (bac <> v_bac and bac <> 'luoi_cuoi'),          -- đúng bậc lên trước
           (not mien_phi),                                 -- trả phí xếp sau miễn phí
           thu_tu), '[]'::jsonb)
  into v_ds
  from public.vmp_ai_mo_hinh where bat;

  return jsonb_build_object(
    'do_kho', v_kho,
    'thu_tu_thu', v_ds,
    'chon', v_ds->0->>'ma',
    'vi_sao', 'Độ khó ' || (v_kho->>'diem') || '/8 → bậc "' || v_bac || '" ('
              || (v_kho->>'vi_sao') || '). Chọn '
              || coalesce(v_ds->0->>'ten', 'không có mô hình nào khả dụng') || '.');
end;
$$;


--
-- Name: rpc_ai_context("text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_context"("p_question" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer, "p_row_limit" integer DEFAULT 25) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_c jsonb;
begin
  v_c := public.rpc_ai_context_goc(p_question, p_year, p_row_limit);
  return v_c || jsonb_build_object(
    'TRONG_DIEM_CAU_HOI', public.rpc_ai_trong_diem(public.rpc_ai_hieu_cau_hoi(p_question)),
    'luu_y', 'Trả lời ĐÚNG phần TRONG_DIEM_CAU_HOI chỉ ra. Nếu nó nêu một '
             || 'đối tượng cụ thể thì chỉ nói về đối tượng đó và bỏ qua '
             || 'tong_quan — đổ ra tổng quan toàn nhà máy khi người ta hỏi '
             || 'một thiết bị là trả lời sai câu hỏi.');
end;
$$;


--
-- Name: FUNCTION "rpc_ai_context"("p_question" "text", "p_year" integer, "p_row_limit" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_ai_context"("p_question" "text", "p_year" integer, "p_row_limit" integer) IS 'Số liệu timeline cho trợ lý hỏi đáp. Tính trên TOÀN BỘ bảng nên con số luôn đúng — mô hình chỉ diễn đạt lại, không tự đếm. Chỉ đọc.';


--
-- Name: rpc_ai_context_goc("text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_context_goc"("p_question" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer, "p_row_limit" integer DEFAULT 25) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year  integer := coalesce(p_year, extract(year from now())::integer);
  v_toks  text[];
  v_limit integer := greatest(1, least(coalesce(p_row_limit, 25), 60));
  v_res   jsonb;
begin
  -- Tách từ khoá: bỏ dấu câu, giữ token ≥ 3 ký tự, bỏ hư từ hay gặp
  select array_agg(t) into v_toks
  from (
    select distinct lower(t) t
    from regexp_split_to_table(coalesce(p_question, ''), '[^[:alnum:]À-ỹ\-\.]+') t
    where length(t) >= 3
      and lower(t) not in ('cho','các','những','nào','bao','nhiêu','thế','này',
                           'của','một','hai','với','trong','ngoài','đang','đã',
                           'chưa','hãy','tôi','bạn','list','danh','sách','hạng',
                           'mục','thiết','bị','xem','biết','hỏi','giúp','được')
  ) s;

  select jsonb_build_object(
    'nam', v_year,
    'tinh_luc', now(),

    -- Tổng quan: đếm trên toàn bộ, không lấy mẫu
    'tong_quan', (
      select jsonb_build_object(
        'tong_hang_muc', count(*),
        'hoan_thanh',    count(*) filter (where computed_status = 'done'),
        'qua_han',       count(*) filter (where computed_status = 'over'),
        'dang_lam',      count(*) filter (where computed_status = 'prog'),
        'chua_bat_dau',  count(*) filter (where computed_status in ('todo','plan')),
        'ty_le_hoan_thanh_pct',
          round(100.0 * count(*) filter (where computed_status = 'done')
                / nullif(count(*), 0)),
        'thieu_ngay_hoan_thanh',
          count(*) filter (where status_vmp = 'completed' and actual_vmp_date is null),
        'thieu_deadline', count(*) filter (where deadline_vmp is null),
        'chua_co_qa',     count(*) filter (where owner_name is null))
      from public.vmp_visible_plan_items() where year = v_year and is_active),

    'theo_muc_trong_yeu', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'muc', muc, 'tong', tong,
               'hoan_thanh', xong, 'qua_han', tre) order by muc desc), '[]'::jsonb)
      from (
        select case when criticality_score >= 7 then '7-9 (cao)'
                    when criticality_score >= 4 then '4-6 (trung bình)'
                    else '1-3 (thấp)' end as muc,
               count(*) tong,
               count(*) filter (where computed_status = 'done') xong,
               count(*) filter (where computed_status = 'over') tre
        from public.vmp_visible_plan_items()
        where year = v_year and is_active and criticality_score is not null
        group by 1) t),

    'theo_nguoi_phu_trach', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nguoi', nguoi, 'nhom', nhom, 'tong', tong,
               'hoan_thanh', xong, 'qua_han', tre) order by tong desc), '[]'::jsonb)
      from (
        select coalesce(owner_name, '(chưa phân công)') nguoi,
               min(work_group) nhom,
               count(*) tong,
               count(*) filter (where computed_status = 'done') xong,
               count(*) filter (where computed_status = 'over') tre
        from public.vmp_visible_plan_items() where year = v_year and is_active
        group by 1) t),

    'theo_loai_tham_dinh', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'loai', loai, 'tong', tong, 'hoan_thanh', xong)
             order by tong desc), '[]'::jsonb)
      from (
        select validation_type loai, count(*) tong,
               count(*) filter (where computed_status = 'done') xong
        from public.vmp_visible_plan_items() where year = v_year and is_active
        group by 1) t),

    -- Quá hạn lâu nhất — thứ tự ưu tiên xử lý
    'qua_han_nang_nhat', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
          'ma', p.validation_code, 'ten', o.name, 'loai', p.validation_type,
          'qa', p.owner_name, 'diem', p.criticality_score,
          'han', p.deadline_vmp,
          'tre_ngay', (current_date - p.deadline_vmp)) x
        from public.vmp_visible_plan_items() p join vmp_objects o on o.code = p.object_code
        where p.year = v_year and p.is_active and p.computed_status = 'over'
        order by p.criticality_score desc nulls last, p.deadline_vmp
        limit v_limit) t),

    'sap_den_han_30_ngay', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
          'ma', p.validation_code, 'ten', o.name, 'loai', p.validation_type,
          'qa', p.owner_name, 'diem', p.criticality_score, 'han', p.deadline_vmp,
          'con_ngay', (p.deadline_vmp - current_date)) x
        from public.vmp_visible_plan_items() p join vmp_objects o on o.code = p.object_code
        where p.year = v_year and p.is_active
          and p.computed_status <> 'done'
          and p.deadline_vmp between current_date and current_date + 30
        order by p.deadline_vmp
        limit v_limit) t),

    -- Dòng khớp từ khoá trong câu hỏi — phần quan trọng nhất khi người
    -- dùng hỏi về một thiết bị / một người cụ thể
    'dong_khop_cau_hoi', case when v_toks is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(x order by (x->>'so_tu_khop')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'ma', p.validation_code, 'ma_doi_tuong', p.object_code, 'ten', o.name,
          'loai', p.validation_type, 'qa', p.owner_name, 'ho_tro', p.secondary_owner,
          'nhom', p.work_group, 'diem_trong_yeu', p.criticality_score,
          'bo_phan', o.department, 'khu_vuc', o.area, 'line', o.line,
          'tan_suat_thang', o.frequency_months,
          'han_de_cuong', p.deadline_protocol, 'han_bao_cao', p.deadline_report,
          'han_vmp', p.deadline_vmp,
          'trang_thai', p.status_vmp_text,
          'trang_thai_tinh', p.computed_status::text,
          'ngay_hoan_thanh', p.actual_vmp_date,
          'so_tu_khop', (
            select count(*) from unnest(v_toks) tk
            where lower(coalesce(o.name,'')) like '%'||tk||'%'
               or lower(coalesce(p.object_code,'')) like '%'||tk||'%'
               or lower(coalesce(p.validation_code,'')) like '%'||tk||'%'
               or lower(coalesce(p.owner_name,'')) like '%'||tk||'%'
               or lower(coalesce(p.work_group,'')) like '%'||tk||'%'
               or lower(coalesce(o.area,'')) like '%'||tk||'%'
               or lower(coalesce(o.department,'')) like '%'||tk||'%'
               or lower(coalesce(o.line,'')) like '%'||tk||'%')) x
        from public.vmp_visible_plan_items() p join vmp_objects o on o.code = p.object_code
        where p.year = v_year and p.is_active
          and exists (
            select 1 from unnest(v_toks) tk
            where lower(coalesce(o.name,'')) like '%'||tk||'%'
               or lower(coalesce(p.object_code,'')) like '%'||tk||'%'
               or lower(coalesce(p.validation_code,'')) like '%'||tk||'%'
               or lower(coalesce(p.owner_name,'')) like '%'||tk||'%'
               or lower(coalesce(p.work_group,'')) like '%'||tk||'%'
               or lower(coalesce(o.area,'')) like '%'||tk||'%'
               or lower(coalesce(o.department,'')) like '%'||tk||'%'
               or lower(coalesce(o.line,'')) like '%'||tk||'%')
        limit v_limit) t) end,

    'tu_khoa_da_dung', to_jsonb(coalesce(v_toks, '{}'::text[]))
  ) into v_res;

  return v_res;
end;
$$;


--
-- Name: rpc_ai_context_gon("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_context_gon"("p_question" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'TRONG_DIEM_CAU_HOI', public.rpc_ai_trong_diem(public.rpc_ai_hieu_cau_hoi(p_question)),
    'nam',        c->'nam',
    'tong_quan',  c->'tong_quan',
    'theo_muc_trong_yeu', c->'theo_muc_trong_yeu',
    'dong_khop_cau_hoi',  (
      select coalesce(jsonb_agg(e), '[]'::jsonb)
      from (select e from jsonb_array_elements(c->'dong_khop_cau_hoi') e limit 8) t),
    'luu_y', 'Trả lời ĐÚNG phần TRONG_DIEM_CAU_HOI chỉ ra. Nếu nó nêu một '
             || 'đối tượng cụ thể thì chỉ nói về đối tượng đó, KHÔNG đọc lại '
             || 'tong_quan — tong_quan chỉ để tham chiếu khi câu hỏi thật sự '
             || 'hỏi về toàn bộ kế hoạch.')
  from (select public.rpc_ai_context(p_question, p_year, 8) c) x;
$$;


--
-- Name: rpc_ai_do_kho("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_do_kho"("p_question" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  q     text    := public.vmp_khong_dau(coalesce(p_question, ''));
  diem  integer := 0;
  vi    text[]  := '{}';
  ke    boolean := false;   -- true = câu giải thích, dùng giọng kể
begin
  if (length(q) - length(replace(q, '?', ''))) > 1 then
    diem := diem + 2; vi := array_append(vi, 'nhiều câu hỏi trong một lượt');
  end if;
  if q ~ '( va | cung nhu | dong thoi | ngoai ra | ben canh )' then
    diem := diem + 1; vi := array_append(vi, 'nhiều ý nối nhau');
  end if;
  if q ~ '(vi sao|tai sao|quy tac|luat|cach tinh|the nao|yeu cau|tieu chuan|annex|gmp|alcoa|ich q9)' then
    diem := diem + 2; vi := array_append(vi, 'phải tra tài liệu luật'); ke := true;
  end if;
  if q ~ '(so sanh|danh gia|nhan xet|de xuat|goi y|nen |khuyen|phan tich|tai sao lai)' then
    diem := diem + 2; vi := array_append(vi, 'đòi lập luận, không chỉ tra số'); ke := true;
  end if;
  if length(q) > 120 then
    diem := diem + 1; vi := array_append(vi, 'câu dài');
  end if;

  return jsonb_build_object(
    'diem', diem,
    -- Câu GIẢI THÍCH luôn đi bậc sâu, dù ngắn.
    --
    -- Đo được bằng thử nghiệm: hỏi "laf cân tại sao 9 điểm trọng yếu" mà
    -- để mô hình bậc nhanh trả lời thì nó KHÔNG gọi công cụ tra tài liệu
    -- và tự bịa ra "laf cân là thiết bị đo lường trọng lượng" — đúng cái
    -- hiểu sai mà cả tài liệu rule-vmp01 sinh ra để đính chính (LAF cân
    -- là BUỒNG CÂN xử lý không khí sạch, không phải cái cân).
    --
    -- Câu văn trôi chảy mà nội dung sai là kiểu hỏng nguy hiểm nhất. Nên
    -- độ dài không quyết định được ở đây: hễ phải tra tài liệu hoặc phải
    -- lập luận thì bắt buộc bậc sâu.
    'bac', case when ke or diem >= 3 then 'sau' else 'nhanh' end,
    'kieu', case when ke then 'giai_thich' else 'so_lieu' end,
    'giong', case when ke then
        'CÂU GIẢI THÍCH — BẮT BUỘC gọi công cụ tra tài liệu luật TRƯỚC khi '
        || 'viết, và nói rõ lấy từ mục nào. Không được giải thích bằng kiến '
        || 'thức chung: tên thiết bị ở đây rất dễ gây hiểu nhầm (ví dụ "LAF cân" '
        || 'là BUỒNG CÂN xử lý không khí sạch, KHÔNG phải cái cân). '
        || 'Viết thành VĂN KỂ LIỀN MẠCH, không gạch đầu dòng. '
        || 'Dẫn dắt như đang kể cho người ngồi cạnh nghe: nói cái kết luận '
        || 'trước bằng một câu tròn, rồi giải thích vì sao, rồi mới tới chi '
        || 'tiết kỹ thuật. Câu nọ nối câu kia bằng "bởi vì", "cho nên", "thành '
        || 'ra", "chính vì thế". Con số vẫn phải chính xác nhưng cài vào giữa '
        || 'câu văn chứ đừng dựng thành bảng. Được dùng ví von cho dễ hình '
        || 'dung, miễn là không làm sai nghĩa kỹ thuật. Dài 3–6 đoạn ngắn.'
      else
        'CÂU TRA SỐ — trả lời gọn, số liệu để gạch đầu dòng cho thẳng hàng, '
        || 'dễ quét mắt. Kết luận một câu ở đầu, rồi tới danh sách. Không kể '
        || 'lể dài dòng.' end,
    'vi_sao', case when array_length(vi, 1) is null
                   then 'câu ngắn, một ý — mô hình nhanh là đủ'
                   else array_to_string(vi, '; ') end);
end;
$$;


--
-- Name: rpc_ai_do_thuc_the("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_do_thuc_the"("p_question" "text", "p_loai" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  q     text := ' ' || public.vmp_khong_dau(coalesce(p_question, '')) || ' ';
  v_ds  jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'loai', loai, 'gia_tri', gia_tri, 'muc', muc, 'diem', round(diem::numeric, 3))
         order by muc, diem desc), '[]'::jsonb)
  into v_ds
  from (
    select distinct on (loai, gia_tri) loai, gia_tri, muc, diem
    from (
      -- Mức 1: nguyên cụm
      select loai, gia_tri, 1 muc, 1.0 diem
      from public.vmp_ai_tu_dien
      where (p_loai is null or loai = p_loai)
        and length(khoa) >= 3 and q like '%' || khoa || '%'

      union all

      -- Mức 2: ≥2 tiếng liên tiếp của tên nằm trong câu hỏi.
      -- Đòi 2 tiếng vì 1 tiếng ("Nhi", "My") quét trúng quá nhiều.
      select d.loai, d.gia_tri, 2 muc,
             0.9 - (0.05 * (array_length(string_to_array(d.khoa, ' '), 1) - n)) diem
      from public.vmp_ai_tu_dien d
      cross join lateral (
        select n, array_to_string((string_to_array(d.khoa, ' '))[i : i + n - 1], ' ') cum
        from generate_series(2, greatest(2, array_length(string_to_array(d.khoa, ' '), 1))) n,
             generate_series(1, greatest(1, array_length(string_to_array(d.khoa, ' '), 1))) i
        where i + n - 1 <= array_length(string_to_array(d.khoa, ' '), 1)
      ) c
      where (p_loai is null or d.loai = p_loai)
        and d.loai in ('nguoi', 'nhom_viec', 'ten_doi_tuong')
        and length(c.cum) >= 5
        and q like '%' || c.cum || '%'

      union all

      -- Mức 3: gần giống, bắt gõ sai dấu / thiếu dấu
      select loai, gia_tri, 3 muc, extensions.similarity(khoa, trim(q)) diem
      from public.vmp_ai_tu_dien
      where (p_loai is null or loai = p_loai)
        and loai in ('nguoi', 'nhom_viec')
        and extensions.similarity(khoa, trim(q)) >= 0.45
    ) t
    order by loai, gia_tri, muc, diem desc
  ) u;

  return jsonb_build_object(
    'so_khop', jsonb_array_length(v_ds),
    'ket_qua', v_ds,
    'chac_chan', case when jsonb_array_length(v_ds) = 1 then v_ds->0 else null end);
end;
$$;


--
-- Name: rpc_ai_doc_trang_thai("text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_doc_trang_thai"("p_question" "text", "p_ten" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  q      text    := public.vmp_khong_dau(coalesce(p_question, ''));
  v_tong integer := 0; v_tre integer := 0;
  v_ty   integer := 0;
  v_tt   text;
  v_manh text;   -- cường độ lời nói: nhe | vua | manh
  v_lech text;
begin
  if p_ten is not null then
    select count(*), count(*) filter (where computed_status = 'over')
      into v_tong, v_tre
    from public.vmp_visible_plan_items() where year = v_year and is_active and owner_name = p_ten;
    v_ty := case when v_tong > 0 then round(100.0 * v_tre / v_tong)::int else 0 end;
  end if;

  -- Cường độ lời nói
  v_manh := case
    when q ~ '(chet mat|kiet suc|khong chiu noi|bo cuoc|het chiu|suy sup|bo tay roi)' then 'manh'
    when q ~ '(met qua|ap luc qua|qua tai|khong xue|nhieu qua|choang|stress)'         then 'vua'
    when q ~ '(hoi met|hoi nhieu|cung met|met chut|khong sao|van on)'                 then 'nhe'
    else null end;

  -- Trạng thái
  v_tt := case
    when q ~ '(khong biet bat dau|bat dau tu dau|roi tung beng|lam gi truoc|khong biet lam sao)' then 'be_tac'
    when q ~ '(buc|tuc|chan qua|sao lai the|vo ly|ai lam the nay|do loi)'                        then 'buc_boi'
    when q ~ '(lo|so|hoi hop|sap thanh tra|kiem tra toi|co kip khong|lieu co)'                   then 'lo_lang'
    when v_manh in ('vua','manh')                                                                then 'qua_tai'
    when v_manh = 'nhe'                                                                          then 'qua_tai'
    else null end;

  if v_tt is null then
    return jsonb_build_object('co', false);
  end if;

  -- Kiểm chéo: lời nói nhẹ mà số liệu nặng = đang giảm nhẹ
  if v_manh = 'nhe' and v_ty >= 50 then
    v_tt := 'giam_nhe';
    v_lech := 'Nói nhẹ nhưng đang có ' || v_tre || '/' || v_tong
              || ' mục quá hạn (' || v_ty || '%). Đang giảm nhẹ tình hình.';
  elsif v_manh = 'manh' and v_tong > 0 and v_ty < 20 then
    v_lech := 'Nói nặng nhưng thực tế chỉ ' || v_tre || '/' || v_tong
              || ' mục quá hạn (' || v_ty || '%). Áp lực có thể đến từ nơi khác, '
              || 'hoặc đang lo xa. Trấn an bằng con số thật.';
  end if;

  return jsonb_build_object(
    'co', true,
    'trang_thai', v_tt,
    'cuong_do', coalesce(v_manh, 'vua'),
    'so_lieu', jsonb_build_object('tong', v_tong, 'qua_han', v_tre, 'ty_le_qua_han', v_ty),
    'lech_loi_va_so', v_lech,
    'cach_doi', case v_tt
      when 'qua_tai' then
        'CHIA NHỎ. Người quá tải không cần động viên, họ cần bớt số thứ phải '
        || 'nghĩ. Đưa ĐÚNG BA việc ưu tiên, tuyệt đối không đổ cả danh sách ra. '
        || 'Nói rõ vì sao ba cái đó trước (trọng yếu cao nhất, trễ lâu nhất). '
        || 'Kết bằng một câu cho họ thấy có đường ra.'
      when 'be_tac' then
        'CHO MỘT BƯỚC DUY NHẤT. Không biết bắt đầu ở đâu là tê liệt vì quá '
        || 'nhiều lựa chọn, không phải vì lười. Đừng đưa ba việc — đưa MỘT, '
        || 'cụ thể tới mức làm được ngay hôm nay. Xong cái đó rồi tính tiếp.'
      when 'lo_lang' then
        'CỤ THỂ HOÁ. Lo mơ hồ luôn nặng hơn sự thật. Đưa con số chính xác, '
        || 'nói rõ cái gì đã an toàn và cái gì thật sự cần lo. Tách "việc cần '
        || 'làm" khỏi "việc đáng sợ".'
      when 'buc_boi' then
        'CÔNG NHẬN TRƯỚC, GIẢI THÍCH SAU. Phản bác lúc người ta đang bực chỉ '
        || 'làm họ bực thêm. Thừa nhận cái khó là có thật, rồi mới đưa số. '
        || 'TUYỆT ĐỐI không đổ lỗi cho ai, kể cả người vắng mặt.'
      when 'giam_nhe' then
        'SOI GƯƠNG NHẸ NHÀNG. Họ đang nói nhẹ hơn thực tế. Nói thẳng con số '
        || 'nhưng bằng giọng người quan tâm, không phải giọng bắt lỗi. Kiểu: '
        || '"ngươi bảo hơi mệt thôi, mà bổn cung nhìn sổ thấy hơn thế đấy".'
      else 'Nghe trước, rồi đưa số liệu của chính họ.' end,
    'tranh' ,
      'KHÔNG dán nhãn tâm lý cho người ta ("ngươi bị stress", "ngươi hay lo '
      || 'âu"). KHÔNG hứa hão ("rồi sẽ ổn thôi"). KHÔNG so sánh với người '
      || 'khác. KHÔNG giục. Nói về VIỆC, đừng nói về TÍNH CÁCH.');
end;
$$;


--
-- Name: rpc_ai_dung_cau_tra_loi("text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_dung_cau_tra_loi"("p_question" "text", "p_hieu" "jsonb", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_hs jsonb;
begin
  if (p_hieu->>'chi_so') = 'ho_so_nguoi' then
    v_hs := public.rpc_ai_ho_so_nguoi(p_hieu->'loc'->>'nguoi', p_year);
    if (v_hs->>'co')::boolean then
      return jsonb_build_object('khop', true, 'y_dinh', 'ho_so_nguoi',
        'nguon', 'sql', 'tra_loi', v_hs->>'tra_loi', 'goi_y', v_hs->'goi_y');
    end if;
  end if;
  return public.rpc_ai_dung_cau_tra_loi_goc(p_question, p_hieu, p_year);
end;
$$;


--
-- Name: rpc_ai_dung_cau_tra_loi_goc("text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_dung_cau_tra_loi_goc"("p_question" "text", "p_hieu" "jsonb", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_year   integer := coalesce(p_year, extract(year from now())::integer);
  v_loc    jsonb   := coalesce(p_hieu->'loc', '{}'::jsonb);
  v_chi_so text    := p_hieu->>'chi_so';
  v_chieu  text    := p_hieu->>'chieu';
  v_where  text    := 'p.year = ' || v_year || ' and p.is_active';
  v_mo_ta  text    := '';
  v_cot    text;
  v_sql    text;
  v_tl     text;
  v_n      integer;
  v_xong   integer;
begin
  -- ---- Dựng mệnh đề lọc từ những gì đã nhận diện ----
  if v_loc ? 'trang_thai' then
    v_where := v_where || format(' and p.computed_status = %L', v_loc->>'trang_thai');
    v_mo_ta := v_mo_ta || case v_loc->>'trang_thai'
                            when 'over' then ' đang quá hạn'
                            when 'done' then ' đã hoàn thành'
                            when 'prog' then ' đang làm'
                            else ' chưa bắt đầu' end;
  end if;
  if v_loc ? 'han_ngay' then
    v_where := v_where || format(
      ' and p.computed_status <> ''done'' and p.deadline_vmp between current_date and current_date + %s',
      (v_loc->>'han_ngay')::integer);
    v_mo_ta := v_mo_ta || ' đến hạn trong ' || (v_loc->>'han_ngay') || ' ngày tới';
  end if;
  if v_loc ? 'chua_co_qa' then
    v_where := v_where || ' and p.owner_name is null';
    v_mo_ta := v_mo_ta || ' chưa có QA phụ trách';
  end if;
  if v_loc ? 'nguoi' then
    v_where := v_where || format(' and p.owner_name = %L', v_loc->>'nguoi');
    v_mo_ta := v_mo_ta || ' của ' || (v_loc->>'nguoi');
  end if;
  if v_loc ? 'nhom_viec' then
    v_where := v_where || format(' and p.work_group = %L', v_loc->>'nhom_viec');
    v_mo_ta := v_mo_ta || ' thuộc nhóm ' || (v_loc->>'nhom_viec');
  end if;
  if v_loc ? 'loai_td' then
    v_where := v_where || format(' and p.validation_type = %L', v_loc->>'loai_td');
    v_mo_ta := v_mo_ta || ' loại ' || (v_loc->>'loai_td');
  end if;
  if v_loc ? 'bo_phan' then
    v_where := v_where || format(' and o.department = %L', v_loc->>'bo_phan');
    v_mo_ta := v_mo_ta || ' ở bộ phận ' || (v_loc->>'bo_phan');
  end if;
  if v_loc ? 'khu_vuc' then
    v_where := v_where || format(' and o.area = %L', v_loc->>'khu_vuc');
    v_mo_ta := v_mo_ta || ' ở khu ' || (v_loc->>'khu_vuc');
  end if;
  if v_loc ? 'line' then
    v_where := v_where || format(' and o.line = %L', v_loc->>'line');
    v_mo_ta := v_mo_ta || ' trên dây chuyền ' || (v_loc->>'line');
  end if;
  if v_loc ? 'ma' then
    v_where := v_where || format(' and p.object_code = %L', v_loc->>'ma');
  end if;
  if v_loc ? 'ten_doi_tuong' and not (v_loc ? 'ma') then
    v_where := v_where || format(' and o.name = %L', v_loc->>'ten_doi_tuong');
  end if;

  -- ---- CHI TIẾT một đối tượng ----
  if v_chi_so = 'chi_tiet' then
    execute format($q$
      select 'Bổn cung tra rồi. %1$s đây 💕' || E'\n\n'
          || '· Bộ phận: ' || coalesce(max(o.department), '—')
          || ' · Khu vực: ' || coalesce(max(o.area), '—')
          || ' · Tần suất: ' || coalesce(max(o.frequency_months)::text, '—') || ' tháng' || E'\n'
          || '· QA phụ trách: ' || coalesce(max(p.owner_name), 'chưa ai nhận')
          || ' · Điểm trọng yếu: ' || coalesce(max(p.criticality_score)::text, '—') || E'\n\n'
          || 'Các hạng mục thẩm định năm %2$s:' || E'\n'
          || coalesce(string_agg('· ' || p.validation_type || ' — hạn '
                 || to_char(p.deadline_vmp, 'DD/MM/YYYY') || ', '
                 || coalesce(p.status_vmp_text, '—')
                 || case when p.computed_status = 'over'
                         then ' (quá hạn ' || (current_date - p.deadline_vmp) || ' ngày rồi 😢)'
                         else '' end, E'\n' order by p.deadline_vmp),
             'chưa có hạng mục nào')
      from public.vmp_visible_plan_items() p join vmp_objects o on o.code = p.object_code
      where %3$s
    $q$,
      -- Hiện TÊN kèm mã. "HT-01 đây ạ" bắt người đọc tự nhớ HT-01 là
      -- cái gì; "HVAC-C1 (HT-01)" thì đọc phát hiểu ngay.
      coalesce(v_loc->>'ten_doi_tuong',
               (select o.name || ' (' || o.code || ')' from vmp_objects o
                where o.code = v_loc->>'ma' limit 1),
               v_loc->>'ma'),
      v_year, v_where) into v_tl;
    return jsonb_build_object('khop', true, 'y_dinh', 'chi_tiet', 'nguon', 'sql', 'tra_loi', v_tl);
  end if;

  -- ---- CHIA THEO CHIỀU ----
  if v_chieu is not null then
    v_cot := case v_chieu
      when 'nguoi'     then 'coalesce(p.owner_name, ''(chưa phân công)'')'
      when 'bo_phan'   then 'coalesce(o.department, ''(chưa rõ)'')'
      when 'khu_vuc'   then 'coalesce(o.area, ''(chưa rõ)'')'
      when 'loai_td'   then 'p.validation_type'
      when 'nhom_viec' then 'coalesce(p.work_group, ''(chưa phân nhóm)'')'
      else 'case when p.criticality_score >= 7 then ''7–9 (cao)''
                 when p.criticality_score >= 4 then ''4–6 (trung bình)''
                 else ''1–3 (thấp)'' end' end;

    v_sql := format($q$
      select coalesce(string_agg('· **' || nhan || '** — ' || tong || ' hạng mục'
               || case when %2$L = 'ty_le'
                       then ', xong ' || xong || ' (' || round(100.0*xong/nullif(tong,0)) || '%%)'
                       else '' end
               || case when tre > 0 then ', quá hạn ' || tre else '' end,
               E'\n' order by tong desc), 'chưa có dữ liệu')
      from (
        select %1$s as nhan, count(*) tong,
               count(*) filter (where p.computed_status = 'done') xong,
               count(*) filter (where p.computed_status = 'over') tre
        from public.vmp_visible_plan_items() p join vmp_objects o on o.code = p.object_code
        where %3$s group by 1) t
    $q$, v_cot, v_chi_so, v_where);
    execute v_sql into v_tl;

    return jsonb_build_object('khop', true, 'y_dinh', 'nhom_theo_' || v_chieu,
      'nguon', 'sql',
      'tra_loi', 'Bổn cung xem qua rồi, hạng mục' || v_mo_ta || ' chia theo '
                 || case v_chieu when 'nguoi' then 'người phụ trách'
                                 when 'bo_phan' then 'bộ phận'
                                 when 'khu_vuc' then 'khu vực'
                                 when 'loai_td' then 'loại thẩm định'
                                 when 'nhom_viec' then 'nhóm việc'
                                 else 'mức trọng yếu' end
                 || ' như sau 🌸' || E'\n\n' || v_tl);
  end if;

  -- ---- LIỆT KÊ ----
  if v_chi_so = 'liet_ke' then
    -- Đếm và liệt kê phải tách làm hai: gộp count(*) over () với
    -- string_agg trong cùng một select rồi limit thì con số và danh sách
    -- không còn khớp nhau.
    execute format($q$
      select count(*) from public.vmp_visible_plan_items() p
      join vmp_objects o on o.code = p.object_code where %s
    $q$, v_where) into v_n;

    execute format($q$
      select string_agg('· ' || validation_code || ' — ' || ten
             || ' (' || qa || ', hạn ' || han || ')', E'\n')
      from (
        select p.validation_code, o.name ten,
               coalesce(p.owner_name, 'chưa có QA') qa,
               to_char(p.deadline_vmp, 'DD/MM') han, p.deadline_vmp
        from public.vmp_visible_plan_items() p join vmp_objects o on o.code = p.object_code
        where %s order by p.deadline_vmp limit 15) t
    $q$, v_where) into v_tl;

    return jsonb_build_object('khop', true, 'y_dinh', 'liet_ke', 'nguon', 'sql',
      'tra_loi', 'Bổn cung móc ra được **' || coalesce(v_n, 0) || ' hạng mục'
                 || v_mo_ta || '** 🌸' || E'\n\n' || coalesce(v_tl, '(không có mục nào ạ)')
                 || case when coalesce(v_n, 0) > 15
                         then E'\n\n…và ' || (v_n - 15) || ' mục nữa, bổn cung hiển thị 15 mục đầu thôi nhé.'
                         else '' end);
  end if;

  -- ---- ĐẾM / TỶ LỆ, không chia chiều ----
  execute format($q$
    select count(*), count(*) filter (where p.computed_status = 'done')
    from public.vmp_visible_plan_items() p join vmp_objects o on o.code = p.object_code
    where %s
  $q$, v_where) into v_n, v_xong;

  if v_chi_so = 'ty_le' then
    v_tl := 'Bổn cung tính rồi, hạng mục' || v_mo_ta || ' đã hoàn thành **'
         || coalesce(round(100.0 * v_xong / nullif(v_n, 0))::text, '0')
         || '%** — ' || v_xong || '/' || v_n || ' mục 🌸';
  else
    v_tl := 'Bổn cung soi sổ rồi nha, hiện có **' || v_n || ' hạng mục' || v_mo_ta || '** '
         || case when v_n = 0 then '— sạch bong luôn, đỉnh 🎉'
                 when v_loc->>'trang_thai' = 'over' then '😢' else '🌸' end;
  end if;

  return jsonb_build_object('khop', true, 'y_dinh', coalesce(v_chi_so, 'dem'),
    'nguon', 'sql', 'tra_loi', v_tl);
end;
$_$;


--
-- Name: rpc_ai_ghep_ngu_canh("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_ghep_ngu_canh"("p_question" "text", "p_phien" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_truoc  record;
  q        text := public.vmp_khong_dau(coalesce(p_question, ''));
  v_ma     text;
  v_ghep   text;
begin
  if p_phien is null or trim(p_phien) = '' then
    return jsonb_build_object('ghep', false, 'cau_hoi', p_question);
  end if;

  select cau_hoi, cho_lam_ro into v_truoc
  from public.vmp_ai_hoi_thoai
  where phien = p_phien and tao_luc > now() - interval '30 minutes'
  order by tao_luc desc limit 1;

  if not found or not v_truoc.cho_lam_ro then
    return jsonb_build_object('ghep', false, 'cau_hoi', p_question);
  end if;

  -- Lượt trước là câu hỏi lại. Lượt này có nhắc tới mã thiết bị nào không?
  select o.code into v_ma
  from public.vmp_objects o
  where o.is_active and length(o.code) >= 4
    and q like '%' || public.vmp_khong_dau(o.code) || '%'
  order by length(o.code) desc limit 1;

  if v_ma is null then
    return jsonb_build_object('ghep', false, 'cau_hoi', p_question);
  end if;

  -- GHÉP: giữ nguyên ý hỏi gốc, chỉ nói rõ là hỏi về mã nào.
  -- Không cắt ghép chuỗi cầu kỳ — thêm mã vào đầu là đủ để bước nhận
  -- diện khoá đúng đối tượng mà vẫn giữ toàn bộ ý ban đầu.
  v_ghep := v_ma || ' — ' || v_truoc.cau_hoi;

  return jsonb_build_object(
    'ghep', true, 'cau_hoi', v_ghep, 'ma', v_ma,
    'cau_hoi_goc', v_truoc.cau_hoi,
    'loi_dan', 'Được, ngươi chọn **' || v_ma || '**. Bổn cung quay lại câu hỏi '
               || 'lúc nãy nhé 🌸' || E'\n\n');
end;
$$;


--
-- Name: rpc_ai_ghi_ket_qua("text", boolean, integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_ghi_ket_qua"("p_ma" "text", "p_ok" boolean, "p_tre_ms" integer DEFAULT NULL::integer, "p_loi" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_lien integer;
begin
  update public.vmp_ai_mo_hinh set
    so_lan_goi    = so_lan_goi + 1,
    so_lan_loi    = so_lan_loi + case when p_ok then 0 else 1 end,
    loi_lien_tiep = case when p_ok then 0 else loi_lien_tiep + 1 end,
    -- Trung bình trượt, nghiêng về số đo mới để phản ứng kịp lúc nghẽn
    tre_tb_ms     = case when p_tre_ms is null then tre_tb_ms
                         when tre_tb_ms is null then p_tre_ms
                         else (tre_tb_ms * 3 + p_tre_ms) / 4 end,
    loi_gan_nhat  = case when p_ok then loi_gan_nhat else left(p_loi, 300) end,
    luc_loi       = case when p_ok then luc_loi else now() end,
    -- Hỏng 2 lần liên tiếp → nghỉ 10 phút; 4 lần → nghỉ 1 giờ.
    -- Đủ để vượt qua đợt nghẽn hoặc hết hạn mức theo phút, mà không
    -- loại mô hình vĩnh viễn vì một sự cố thoáng qua.
    nghi_den      = case when p_ok then null
                         when loi_lien_tiep + 1 >= 4 then now() + interval '1 hour'
                         when loi_lien_tiep + 1 >= 2 then now() + interval '10 minutes'
                         else nghi_den end
  where ma = p_ma
  returning loi_lien_tiep into v_lien;

  return jsonb_build_object('ok', true, 'loi_lien_tiep', coalesce(v_lien, 0));
end;
$$;


--
-- Name: rpc_ai_ghi_nho("text", "text", "text", "text"[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_ghi_nho"("p_nguoi" "text", "p_loai" "text", "p_noi_dung" "text", "p_tu_khoa" "text"[] DEFAULT '{}'::"text"[], "p_quan_trong" integer DEFAULT 5) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_nguoi is null or trim(p_nguoi) = '' or length(trim(p_noi_dung)) < 8 then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.vmp_ai_bo_nho (nguoi, tang, loai, noi_dung, tu_khoa, quan_trong)
  values (trim(p_nguoi), 'kho', p_loai, trim(p_noi_dung),
          coalesce(p_tu_khoa, '{}'), least(greatest(coalesce(p_quan_trong,5),1),10))
  on conflict (nguoi, noi_dung) do update
    set so_lan_nhac = public.vmp_ai_bo_nho.so_lan_nhac + 1,
        nhac_cuoi   = now(),
        quan_trong  = least(public.vmp_ai_bo_nho.quan_trong + 1, 10);
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: rpc_ai_goi_y_chip("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_goi_y_chip"("p_cau_hoi" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_tk    jsonb := public.rpc_ai_thong_ke_loc(p_cau_hoi, 3) -> 'thong_ke';
  v_chips text[] := '{}';
  e       jsonb;
  v_ten   text;
  v_loai  text;
  v_ds    jsonb;
begin
  -- 1. Ca HỎI LẠI: chip là ĐÚNG các lựa chọn — bấm một phát là xong,
  --    không bắt người hỏi gõ lại tên dài.
  -- Nhiều phần tử hỏi-lại thì lấy phần tử ÍT lựa chọn nhất — đó là cách
  -- hiểu cụ thể nhất; trộn lẫn các phần tử làm chip loãng và lạc đề.
  for e in select t from jsonb_array_elements(coalesce(v_tk, '[]'::jsonb)) t
           where t ->> 'tong' is null and t -> 'danh_sach_gia_tri' is not null
           order by coalesce((t ->> 'so_gia_tri_da_gop')::int, 99)
  loop
    v_chips := v_chips || (
      select array_agg(x || ' đến đâu rồi?')
      from (select jsonb_array_elements_text(e -> 'danh_sach_gia_tri') x limit 4) s);
    exit;
  end loop;
  if array_length(v_chips, 1) is not null then
    return to_jsonb(v_chips[1:4]);
  end if;

  -- 2. Chạm được MỘT đối tượng có số: gợi ý đi SÂU theo phân loại của nó
  select t into e from jsonb_array_elements(coalesce(v_tk, '[]'::jsonb)) t
  where (t ->> 'tong')::int > 0 and t ->> 'loai' <> 'muc_luc'
  order by (t ->> 'tong')::int desc limit 1;

  if e is not null then
    v_loai := e ->> 'loai';
    v_ds   := e -> 'danh_sach_gia_tri';
    v_ten  := v_ds ->> 0;
    if v_loai in ('khu_vuc', 'bo_phan', 'line') then
      -- chip = các NHÓM VIỆC nằm trong khu / bộ phận / line đó — lần theo
      -- quan hệ giữa hai chiều phân loại
      v_chips := coalesce((
        select array_agg(nm || ' đến đâu rồi?')
        from (
          select coalesce(nullif(btrim(i.work_group), ''), '(chưa phân nhóm)') as nm
          from public.vmp_visible_plan_items() i
          left join public.vmp_objects o on o.code = i.object_code
          where i.is_active and coalesce(nullif(btrim(i.work_group), ''), '') <> ''
            and case v_loai
              when 'khu_vuc' then o.area = v_ten
              when 'bo_phan' then o.department = v_ten
              when 'line' then o.line = v_ten
              else false end
          group by 1 order by count(*) desc, 1 limit 3
        ) s), '{}');
      v_chips := v_chips || (v_ten || ' 30 ngày tới có gì đến hạn?');
    elsif v_loai in ('nhom_viec', 'loai_td') then
      -- chip = thành viên thật của nhóm/khu đó
      v_chips := coalesce((
        select array_agg(nm || ' đến đâu rồi?')
        from (
          select coalesce(o.name, i.object_code) as nm
          from public.vmp_visible_plan_items() i
          left join public.vmp_objects o on o.code = i.object_code
          where i.is_active and case v_loai
              when 'nhom_viec' then i.work_group = v_ten
              when 'khu_vuc' then o.area = v_ten
              when 'line' then o.line = v_ten
              when 'bo_phan' then o.department = v_ten
              when 'loai_td' then i.validation_type = v_ten
              else false end
          group by 1 order by count(*) desc, 1 limit 3
        ) s), '{}');
      v_chips := v_chips || (v_ten || ' 30 ngày tới có gì đến hạn?');
    elsif v_loai = 'nguoi' then
      v_chips := array[
        v_ten || ' 30 ngày tới có gì gấp?',
        'Việc quá hạn của ' || v_ten || ' là những cái nào?',
        v_ten || ' tháng này có bao nhiêu việc?'];
    else
      -- một thiết bị / mã cụ thể: đi ngang trong cùng nhóm và hỏi lý lẽ
      v_chips := array[
        'Vì sao ' || v_ten || ' được chấm điểm trọng yếu như vậy?',
        'Lịch tái thẩm định của ' || v_ten || ' thế nào?',
        v_ten || ' còn mốc nào chưa xong?'];
    end if;
    return to_jsonb(v_chips[1:4]);
  end if;

  -- 3. Chưa khoanh được gì: mở MỤC LỤC — chip là các nhóm lớn nhất,
  --    người dùng bấm để duyệt dần thay vì phải đoán từ khoá.
  return coalesce((
    select jsonb_agg(x.ten || ' (' || x.tong || ' hạng mục) đến đâu rồi?')
    from (
      select g ->> 'ten' as ten, g ->> 'tong' as tong
      from jsonb_array_elements(public.rpc_ai_muc_luc() -> 'nhom_viec') g
      where g ->> 'ten' <> '(chưa phân nhóm)'
      order by (g ->> 'tong')::int desc limit 3
    ) x), '[]'::jsonb);
end;
$$;


--
-- Name: rpc_ai_goi_y_tiep("jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_goi_y_tiep"("p_hieu" "jsonb", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  v_loc  jsonb   := coalesce(p_hieu->'loc', '{}'::jsonb);
  v_chi  text    := p_hieu->>'chi_so';
  v_gy   text[]  := '{}';
  v_ma   text;
  v_qa   text;
  v_kv   text;
begin
  if v_loc ? 'ma' or v_loc ? 'ten_doi_tuong' then
    select p.object_code, p.owner_name, o.area into v_ma, v_qa, v_kv
    from public.vmp_visible_plan_items() p join vmp_objects o on o.code = p.object_code
    where p.year = v_year and p.is_active
      and (p.object_code = v_loc->>'ma' or o.name = v_loc->>'ten_doi_tuong')
    limit 1;
    if v_kv is not null then
      v_gy := array_append(v_gy, 'Khu ' || v_kv || ' còn hạng mục nào quá hạn?');
    end if;
    if v_qa is not null then
      v_gy := array_append(v_gy, 'Tỷ lệ hoàn thành của ' || v_qa || ' là bao nhiêu?');
    else
      v_gy := array_append(v_gy, 'Còn bao nhiêu hạng mục chưa có QA phụ trách?');
    end if;
    v_gy := array_append(v_gy, 'Vì sao ' || coalesce(v_loc->>'ten_doi_tuong', v_ma)
                               || ' được chấm điểm trọng yếu như vậy?');
  elsif v_loc->>'trang_thai' = 'over' then
    v_gy := array_append(v_gy, 'Quá hạn chia theo người phụ trách thế nào?');
    v_gy := array_append(v_gy, 'Nhóm trọng yếu 7–9 quá hạn bao nhiêu?');
    v_gy := array_append(v_gy, 'Liệt kê hạng mục sắp đến hạn 30 ngày');
  elsif p_hieu->>'chieu' = 'nguoi' or (v_loc ? 'nguoi') then
    v_gy := array_append(v_gy, 'Tỷ lệ hoàn thành theo nhóm việc');
    v_gy := array_append(v_gy, 'Liệt kê hạng mục sắp đến hạn 30 ngày');
    v_gy := array_append(v_gy, 'Còn bao nhiêu hạng mục chưa có QA phụ trách?');
  elsif v_chi in ('dem', 'ty_le') then
    v_gy := array_append(v_gy, 'Chia theo người phụ trách xem thế nào?');
    v_gy := array_append(v_gy, 'Nhóm trọng yếu 7–9 đang tới đâu?');
    v_gy := array_append(v_gy, 'Còn bao nhiêu hạng mục quá hạn?');
  else
    -- Không hiểu câu hỏi -> mở mục lục: gợi các nhóm lớn thật để duyệt dần
    v_gy := coalesce((
      select array_agg(g ->> 'ten' || ' (' || (g ->> 'tong') || ' hạng mục) đến đâu rồi?')
      from (
        select g from jsonb_array_elements(public.rpc_ai_muc_luc() -> 'nhom_viec') g
        where g ->> 'ten' <> '(chưa phân nhóm)'
        order by (g ->> 'tong')::int desc limit 2
      ) s(g)), '{}');
    v_gy := array_append(v_gy, 'Còn bao nhiêu hạng mục quá hạn?');
  end if;
  return to_jsonb(v_gy);
end;
$$;


--
-- Name: rpc_ai_hieu_cau_hoi("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_hieu_cau_hoi"("p_question" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  q        text := ' ' || public.vmp_khong_dau(coalesce(p_question, '')) || ' ';
  v_chi_so text;
  v_chieu  text;
  v_tt     text;
  v_han    integer;
  v_loc    jsonb := '{}'::jsonb;
  v_hieu   text[] := '{}';
  v_la     text[] := '{}';
  v_neo    boolean := false;
  r        record;
  tk       text;
begin
  if q ~ '(vi sao|tai sao|vi the nao|nen |co nen|danh gia|nhan xet|de xuat|goi y|khuyen|so sanh|khac nhau|giai thich|the nao la|co dung|hop ly|rui ro gi|anh huong gi|lam sao de|cach nao)' then
    for r in
      select loai, gia_tri, khoa from public.vmp_ai_tu_dien
      where length(khoa) >= 3 and q like '%' || khoa || '%'
      order by length(khoa) desc
    loop
      continue when v_loc ? r.loai;
      v_loc := v_loc || jsonb_build_object(r.loai, r.gia_tri);
    end loop;
    return jsonb_build_object('can_ai', true, 'chi_so', null, 'loc', v_loc,
      'vi_sao', 'Câu hỏi đòi giải thích hoặc đánh giá, không phải tra số — cần mô hình.');
  end if;

  if    q ~ '(bao nhieu|may cai|so luong|dem |tong so|co may)' then v_chi_so := 'dem';
  elsif q ~ '(ty le|phan tram|bao nhieu %|tien do)'            then v_chi_so := 'ty_le';
  elsif q ~ '(liet ke|danh sach|nhung cai nao|cai nao|gom nhung|cho xem|nao dang|co nhung|co gi|gom gi|co cai gi|nao roi)' then v_chi_so := 'liet_ke';
  end if;

  if    q ~ '(theo nguoi|tung nguoi|moi nguoi|nguoi nao|qa nao)' then v_chieu := 'nguoi';
  elsif q ~ '(theo bo phan|tung bo phan|bo phan nao)'            then v_chieu := 'bo_phan';
  elsif q ~ '(theo khu|tung khu|khu vuc nao)'                    then v_chieu := 'khu_vuc';
  elsif q ~ '(theo loai|tung loai|loai nao)'                     then v_chieu := 'loai_td';
  elsif q ~ '(theo nhom|tung nhom|nhom nao)'                     then v_chieu := 'nhom_viec';
  elsif q ~ '(trong yeu|muc do rui ro|theo diem)'                then v_chieu := 'trong_yeu';
  end if;

  if    q ~ '(qua han|tre han|bi tre)'                 then v_tt := 'over';
  elsif q ~ '(hoan thanh|da xong|xong roi|da lam)'     then v_tt := 'done';
  elsif q ~ '(dang lam|dang tien hanh|dang thuc hien)' then v_tt := 'prog';
  elsif q ~ '(chua lam|chua bat dau|chua thuc hien)'   then v_tt := 'todo';
  end if;
  if v_chi_so = 'ty_le' and v_tt = 'done' then v_tt := null; end if;
  if v_tt is not null then
    v_loc  := v_loc || jsonb_build_object('trang_thai', v_tt);
    v_hieu := array_append(v_hieu, 'trạng thái = ' || v_tt);
  end if;

  if    q ~ '(30 ngay|mot thang|thang toi|sap den han|sap toi han|gan den han)' then v_han := 30;
  elsif q ~ '(7 ngay|mot tuan|tuan toi)'  then v_han := 7;
  elsif q ~ '(90 ngay|ba thang|quy toi)'  then v_han := 90;
  end if;
  if v_han is not null then
    v_loc  := v_loc || jsonb_build_object('han_ngay', v_han);
    v_hieu := array_append(v_hieu, 'đến hạn trong ' || v_han || ' ngày');
  end if;

  if q ~ '(chua co qa|chua phan cong|thieu qa|khong co nguoi phu trach|chua co nguoi)' then
    v_loc  := v_loc || jsonb_build_object('chua_co_qa', true);
    v_hieu := array_append(v_hieu, 'chưa có QA phụ trách');
    if v_chi_so is null then v_chi_so := 'dem'; end if;
  end if;

  for r in
    select loai, gia_tri, khoa from public.vmp_ai_tu_dien
    where length(khoa) >= 2
      and (case when length(khoa) >= 4 then q like '%' || khoa || '%'
                else q ~ ('(^|[^a-z0-9])' || khoa || '($|[^a-z0-9])') end)
    order by length(khoa) desc
  loop
    continue when not (case when length(r.khoa) >= 4
                            then q like '%' || r.khoa || '%'
                            else q ~ ('(^|[^a-z0-9])' || r.khoa || '($|[^a-z0-9])') end);
    continue when v_loc ? r.loai;
    v_loc  := v_loc || jsonb_build_object(r.loai, r.gia_tri);
    v_hieu := array_append(v_hieu, r.loai || ' = ' || r.gia_tri);
    -- NEO CHẮC: mã, tên thiết bị, tên người, nhóm việc. Tên riêng đầy đủ
    -- không trùng ngẫu nhiên — gọi ra tên ai LÀ đã hỏi về người đó.
    if r.loai in ('ma', 'ten_doi_tuong', 'nguoi', 'nhom_viec') then v_neo := true; end if;
    q := replace(q, r.khoa, ' ');
  end loop;

  for tk in
    select t from regexp_split_to_table(q, '[^a-z0-9]+') t
    where length(t) >= 3
      and t !~ ('^(bao|nhieu|may|cai|nao|dem|tong|luong|le|phan|tram|tien|liet'
             || '|ke|danh|sach|nhung|gom|cho|xem|theo|tung|moi|nguoi|khu|vuc'
             || '|loai|nhom|diem|trong|yeu|muc|rui|qua|han|tre|hoan|thanh'
             || '|xong|roi|lam|dang|thuc|hien|chua|bat|dau|ngay|thang|toi|tuan'
             || '|quy|sap|den|gan|phai|cong|thieu|khong|hang|the|cua|voi|ngoai'
             || '|tai|nay|con|hoac|cac|nhat|thi|duoc|can|vmp|nam|hoach|phu'
             || '|trach|viec|doi|tuong|tren|duoi|tat|gio|khi|dau|nua|luon'
             || '|tinh|trang|thai|thoi|gian|lich|hop|dung|deu|hay|ma|day'
             || '|bay|it|sau|truoc|xa|het|van|cung|neu'
             || '|tham|dinh|cuong|bao|cao|hoso|giai|doan|moc|ket|qua'
             || '|hen|trinh|thong|tin|kiem|tra|giup|hoi|noi|biet|xin|vui|long'
             || '|minh|em|anh|chi|toi|ban|gium|ho|nhe|nha|kia|ay)$')
  loop
    v_la := array_append(v_la, tk);
  end loop;

  -- "ai làm", "ai phụ trách" → chia theo người
  if v_chieu is null and q ~ '(^| )ai (lam|phu|dang|se|chiu)' then v_chieu := 'nguoi'; end if;

  -- Gọi ra một thực thể mà không nói muốn biết gì thì tự chọn kiểu trả
  -- lời hợp với LOẠI thực thể đó:
  --   người              → hồ sơ người
  --   mã / tên thiết bị  → chi tiết thiết bị
  --   nhóm việc, khu vực → liệt kê (không có "chi tiết" cho một nhóm)
  -- Có CHIỀU hoặc có BỘ LỌC mà không có chỉ số thì mặc định là ĐẾM.
  -- "ai làm nhiều nhất" và "cái nào chưa làm" đều là câu đếm, chỉ là
  -- người ta không gõ chữ "bao nhiêu" ra. Thiếu luật này thì mọi cách
  -- hỏi tự nhiên đều rơi xuống nhánh AI.
  if v_chi_so is null and (v_chieu is not null or v_loc ? 'trang_thai') then
    v_chi_so := 'dem';
  end if;

  if v_chi_so is null then
    if    v_loc ? 'nguoi'                              then v_chi_so := 'ho_so_nguoi';
    elsif v_loc ? 'ma' or v_loc ? 'ten_doi_tuong'      then v_chi_so := 'chi_tiet';
    elsif v_neo or v_loc ? 'khu_vuc' or v_loc ? 'line' then v_chi_so := 'liet_ke';
    end if;
  end if;

  -- Chốt chặn: 'chi_tiet' chỉ có nghĩa khi biết ĐÚNG một thiết bị. Không
  -- có mã lẫn tên mà vẫn để chi_tiet thì câu trả lời sẽ trống tên.
  if v_chi_so = 'chi_tiet' and not (v_loc ? 'ma' or v_loc ? 'ten_doi_tuong') then
    v_chi_so := 'liet_ke';
  end if;

  if v_chi_so is null then
    return jsonb_build_object('can_ai', true, 'chi_so', null, 'loc', v_loc,
      'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la),
      'vi_sao', 'Không xác định được câu hỏi muốn đếm, tính tỷ lệ hay liệt kê.');
  end if;

  if array_length(v_la, 1) > 0 and not v_neo then
    return jsonb_build_object('can_ai', true, 'chi_so', v_chi_so, 'loc', v_loc,
      'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la),
      'vi_sao', 'Còn từ chưa có trong dữ liệu: ' || array_to_string(v_la, ', ')
                || ', mà câu hỏi không nhắc tới đối tượng cụ thể nào.');
  end if;

  return jsonb_build_object(
    'can_ai', false, 'chi_so', v_chi_so, 'chieu', v_chieu, 'loc', v_loc,
    'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la), 'neo', v_neo,
    'vi_sao', case when v_neo and array_length(v_la, 1) > 0
      then 'Đã khoá đúng thực thể trong câu hỏi nên trả lời thẳng; mấy chữ "'
           || array_to_string(v_la, ', ') || '" chỉ là cách nói.'
      else 'Hiểu đủ câu hỏi từ dữ liệu — trả lời thẳng bằng SQL, không tốn AI.' end);
end;
$_$;


--
-- Name: FUNCTION "rpc_ai_hieu_cau_hoi"("p_question" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_ai_hieu_cau_hoi"("p_question" "text") IS 'Phân tích câu hỏi thành chỉ số × chiều × bộ lọc, dùng từ điển sinh từ chính dữ liệu. Trả can_ai=true khi còn từ chưa hiểu hoặc câu đòi suy luận.';


--
-- Name: rpc_ai_hieu_tu_khoa("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_hieu_tu_khoa"("p_cau_hoi" "text", "p_k" integer DEFAULT 6) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_q        text := regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi, '')), '[^a-z0-9]+', ' ', 'g');
  v_nhom     jsonb;
  v_bi_danh  jsonb;
  v_gan      jsonb := '[]'::jsonb;
  v_giai     text := '';
  v_du_dai   integer;
  v_bo_qua   text[] := array[
    'bao','nhieu','cua','cho','cac','nhung','mot','hai','ba','the','nao','gi','la','co','khong',
    'va','hay','thi','ma','o','tai','tu','den','ve','voi','trong','ngoai','tren','duoi','con',
    'da','dang','se','bi','duoc','cai','nay','do','kia','ay','anh','chi','em','toi','ban','minh',
    'xem','giup','cho','biet','hoi','tra','loi','can','muon','phai','nen','lam','sao','tai','vi',
    'hang','muc','tien','do','tham','dinh','thiet','bi','danh','sach','tinh','hinh','tat','ca',
    'ngay','thang','nam','tuan','hom','nay','qua','han','xong','chua','roi','moi','tong','so'
  ];
begin
  with tieng as (
    select distinct t from unnest(string_to_array(btrim(v_q), ' ')) t
    where length(t) >= 3 and not (t = any(v_bo_qua))
  ),
  cum as (
    select distinct btrim(a.t || ' ' || b.t) as t
    from unnest(string_to_array(btrim(v_q), ' ')) with ordinality a(t, i)
    join unnest(string_to_array(btrim(v_q), ' ')) with ordinality b(t, i) on b.i = a.i + 1
    where length(a.t) >= 2 and length(b.t) >= 2
      and not (a.t = any(v_bo_qua)) and not (b.t = any(v_bo_qua))
  ),
  can_do as (select t from tieng union select t from cum),
  khop as (
    select c.t, d.loai, d.gia_tri
    from can_do c join public.vmp_ai_tu_dien d on d.khoa like '%' || c.t || '%'
    union all
    select t.t, d.loai, d.gia_tri
    from (select distinct t from unnest(string_to_array(btrim(v_q), ' ')) t where length(t) = 2) t
    join public.vmp_ai_tu_dien d on d.loai = 'loai_td' and d.khoa = t.t
  ),
  gom as (
    select t, loai, count(distinct gia_tri) as so_khop,
           (array_agg(distinct gia_tri))[1:4] as vi_du
    from khop group by t, loai
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tu', t, 'loai', loai, 'so_khop', so_khop, 'vi_du', to_jsonb(vi_du))
         order by so_khop, t), '[]'::jsonb)
  into v_nhom
  from (select * from gom order by so_khop, t limit greatest(1, least(p_k, 12))) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'goi_la', b.bi_danh, 'loai', b.loai, 'that_ra_la', b.gia_tri, 'ghi_chu', b.ghi_chu)), '[]'::jsonb)
  into v_bi_danh
  from public.vmp_ai_bi_danh b
  where (' ' || v_q || ' ') like '%' || b.bi_danh || '%';

  -- Đủ chất liệu để đoán chưa: cần ít nhất hai tiếng dài từ 4 ký tự
  select count(*) into v_du_dai
  from unnest(string_to_array(btrim(v_q), ' ')) t
  where length(t) >= 4 and not (t = any(v_bo_qua));

  if jsonb_array_length(v_nhom) = 0 and jsonb_array_length(v_bi_danh) = 0 and coalesce(v_du_dai, 0) >= 2 then
    select coalesce(jsonb_agg(jsonb_build_object('loai', loai, 'gia_tri', gia_tri, 'diem', round(diem::numeric, 3))
             order by diem desc), '[]'::jsonb)
    into v_gan
    from (
      select distinct on (d.gia_tri) d.loai, d.gia_tri, word_similarity(btrim(v_q), d.khoa) as diem
      from public.vmp_ai_tu_dien d
      where word_similarity(btrim(v_q), d.khoa) > 0.45
      order by d.gia_tri, diem desc
    ) g0
    where true
    limit 5;
  end if;

  if jsonb_array_length(v_nhom) > 0 then
    select v_giai || string_agg(
             format('Chữ "%s" trúng %s mục loại %s (ví dụ: %s).', x ->> 'tu', x ->> 'so_khop', x ->> 'loai',
                    (select string_agg(v, ', ') from jsonb_array_elements_text(x -> 'vi_du') v)), ' ')
    into v_giai from jsonb_array_elements(v_nhom) x;
  end if;

  if jsonb_array_length(v_bi_danh) > 0 then
    select v_giai || ' ' || string_agg(
             case when x ->> 'that_ra_la' is not null
                  then format('Người hỏi gọi "%s" — trong dữ liệu là "%s".', x ->> 'goi_la', x ->> 'that_ra_la')
                  else format('Người hỏi gọi "%s" — là một nhóm %s, chưa rõ cái nào.', x ->> 'goi_la', x ->> 'loai') end
             || coalesce(' (' || (x ->> 'ghi_chu') || ')', ''), ' ')
    into v_giai from jsonb_array_elements(v_bi_danh) x;
  end if;

  if jsonb_array_length(v_gan) > 0 then
    select v_giai || ' Không khớp thẳng được cái nào; gần đúng nhất có: ' || string_agg(x ->> 'gia_tri', ', ') || '. Nên hỏi lại cho chắc.'
    into v_giai from jsonb_array_elements(v_gan) x;
  end if;

  if btrim(coalesce(v_giai, '')) = '' then
    v_giai := 'Câu hỏi không nhắc tới thiết bị, khu vực hay bộ phận cụ thể nào.';
  end if;

  return jsonb_build_object('ok', true, 'nhom', v_nhom, 'bi_danh', v_bi_danh,
                            'gan_dung', v_gan, 'giai_thich', btrim(v_giai));
end;
$$;


--
-- Name: FUNCTION "rpc_ai_hieu_tu_khoa"("p_cau_hoi" "text", "p_k" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_ai_hieu_tu_khoa"("p_cau_hoi" "text", "p_k" integer) IS 'Dò từ khoá trong câu hỏi theo CHIỀU NGƯỢC (tiếng trong câu hỏi nằm trong tên/mã nào), kèm bí danh và gợi ý gần đúng. Trả sẵn đoạn giải thích tiếng Việt để ghép vào prompt.';


--
-- Name: rpc_ai_ho_so_nguoi("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_ho_so_nguoi"("p_ten" "text", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  v_tong integer; v_xong integer; v_tre integer; v_sap integer;
  v_nhom text; v_kv text; v_ho_tro integer;
begin
  select count(*), count(*) filter (where p.computed_status = 'done'),
         count(*) filter (where p.computed_status = 'over'),
         count(*) filter (where p.computed_status <> 'done'
                            and p.deadline_vmp between current_date and current_date + 30)
    into v_tong, v_xong, v_tre, v_sap
  from public.vmp_visible_plan_items() p
  where p.year = v_year and p.is_active and p.owner_name = p_ten;

  select count(*) into v_ho_tro from public.vmp_visible_plan_items()
  where year = v_year and is_active and secondary_owner = p_ten;

  select string_agg(distinct work_group, ' · ') into v_nhom
  from public.vmp_visible_plan_items()
  where year = v_year and is_active and owner_name = p_ten and work_group is not null;

  select string_agg(distinct o.area, ', ') into v_kv
  from public.vmp_visible_plan_items() p join vmp_objects o on o.code = p.object_code
  where p.year = v_year and p.is_active and p.owner_name = p_ten and o.area is not null;

  if v_tong = 0 and v_ho_tro = 0 then
    return jsonb_build_object('co', false);
  end if;

  return jsonb_build_object('co', true, 'tra_loi',
    'Có chứ 🌸 **' || p_ten || '** là một QA trong kế hoạch thẩm định '
    || v_year || ' đây.' || E'\n\n'
    || '· Đang phụ trách chính: **' || v_tong || ' hạng mục**'
    || case when v_ho_tro > 0 then ', hỗ trợ thêm ' || v_ho_tro || ' hạng mục' else '' end
    || E'\n'
    || '· Đã xong: ' || v_xong
    || case when v_tong > 0 then ' (' || round(100.0 * v_xong / v_tong) || '%)' else '' end
    || case when v_tre > 0 then ' · **quá hạn ' || v_tre || '** 😢'
            else ' · không có mục nào quá hạn 🎉' end || E'\n'
    || case when v_sap > 0 then '· Sắp đến hạn 30 ngày tới: ' || v_sap || ' mục' || E'\n' else '' end
    || case when v_nhom is not null then '· Nhóm việc: ' || v_nhom || E'\n' else '' end
    || case when v_kv is not null then '· Khu vực: ' || v_kv else '' end,
    'goi_y', jsonb_build_array(
      'Liệt kê hạng mục quá hạn của ' || p_ten,
      p_ten || ' còn bao nhiêu việc sắp đến hạn?',
      'Tỷ lệ hoàn thành theo người phụ trách'));
end;
$$;


--
-- Name: rpc_ai_khong_hieu("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_khong_hieu"("p_question" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select 'Bổn cung đọc mà chưa nắm được ' || quote_literal(p_question)
      || ' muốn hỏi gì 🌸' || E'\n\n'
      || 'Nói theo mấy kiểu này thì bổn cung tra được ngay:' || E'\n'
      || '· Kèm **mã thiết bị** — "KNTB133 tới hạn khi nào"' || E'\n'
      || '· Kèm **tên người** — "Phạm Huệ Nhi còn bao nhiêu việc"' || E'\n'
      || '· Kèm **khu vực** — "khu C1 có gì quá hạn"' || E'\n'
      || '· Hỏi **vì sao** — "vì sao LAF cân được 9 điểm trọng yếu"' || E'\n\n'
      || 'Hoặc cứ nói ý ra, bổn cung sẽ hỏi lại cho rõ.';
$$;


--
-- Name: rpc_ai_kiem_chung("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_kiem_chung"("p_tra_loi" "text", "p_du_lieu" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    AS $_$
declare
  v_so      text;
  v_lac     text[] := '{}';
  v_tong    integer := 0;
  v_bam     integer := 0;
  v_tl_sach text;
  v_m       text[];
  v_ngay_la text[] := '{}';
  v_ten_la  text[] := '{}';
  v_da_xet  text[] := '{}';
  v_cum     text;
  v_t       text;
  v_du      text;
  v_canh    text[] := '{}';
  v_words   text[];
  v_keep    integer;
  v_dau     integer;
  v_biet    boolean;
  v_c       text;
  v_hien    text;
  -- Nhãn trình bày quen thuộc, không phải tên
  v_nhan_bg text[] := array[
    'tong so hang muc','tong so viec','da hoan thanh','dang lam','qua han','chua bat dau',
    'hoan thanh','dang mo','nguoi phu trach','han som nhat','han muon nhat','tong cong',
    'sap den han','den han','con lai','chu tri','ho tro','trong yeu','toan nha may'];
  -- Thuật ngữ chuẩn ngành trích từ tài liệu GMP — không nằm trong từ điển
  -- tên của DB nhưng cũng không phải bịa. Không có nó thì mọi câu giải
  -- thích luật (Annex 15, ALCOA...) đều bị báo oan.
  v_chuan   text[] := array[
    'annex','alcoa','ich','iso','ispe','cfr','part 11','gmp','gsp','glp','gdp','who',
    'eu','fda','capa','oos','oot','urs','ccs','fat','sat','dq','iq','oq','pq','pv',
    'haccp','vmp','sop','qrm','eudralex','pic s','pics'];
  -- Hư từ cắt đuôi cụm tên: "Nồi hơi thực hiện ngày..." chỉ giữ "Nồi hơi"
  v_hu      text[] := array[
    'cua','va','den','toi','la','nay','nao','da','dang','se','vua','o','trong','ngoai',
    'cho','voi','duoc','sap','can','phai','hien','chi','thi','ma','nhu','deu','cung',
    'rat','kha','hon','nhat','moi','tung','cac','nhung','mot','hai','ba','thuc',
    'khi','neu','co','khong','van','lai','roi','xong','qua','han','truoc','sau',
    'ngay','thang','nam','tuan','gio','hom','ay','do','kia','se','bi','ve',
    'lam','nua','xu','gap','xong','chua','phan','viec','nguoi','nho','nhe','nha',
    'hay','bao','nhieu','hang','muc','tong'];
begin
  if p_tra_loi is null or p_du_lieu is null then
    return jsonb_build_object('kiem_duoc', false);
  end if;

  v_du := ' ' || regexp_replace(public.vmp_khong_dau(p_du_lieu), '[^a-z0-9]+', ' ', 'g') || ' ';

  -- 1. NGÀY dd/mm — thứ mô hình bịa nhiều nhất khi tự chế lịch
  for v_m in
    select distinct m from regexp_matches(p_tra_loi, '(\d{1,2})/(\d{1,2})(?:/\d{2,4})?', 'g') m
  loop
    continue when v_m[2]::int not between 1 and 12 or v_m[1]::int not between 1 and 31;
    if p_du_lieu not like '%-' || lpad(v_m[2],2,'0') || '-' || lpad(v_m[1],2,'0') || '%'
       and p_du_lieu not like '%' || lpad(v_m[1],2,'0') || '/' || lpad(v_m[2],2,'0') || '%' then
      v_ngay_la := array_append(v_ngay_la, v_m[1] || '/' || v_m[2]);
    end if;
  end loop;

  -- 2. CON SỐ — che ngày trước, kẻo 05/08 vỡ thành "05"/"08" trùng bừa
  v_tl_sach := regexp_replace(p_tra_loi, '\d{1,2}/\d{1,2}(/\d{2,4})?', ' ', 'g');
  for v_so in
    select distinct m[1] from regexp_matches(v_tl_sach, '(\d[\d\.]*)', 'g') m
  loop
    v_so := replace(v_so, '.', '');
    continue when v_so = '' or length(v_so) > 9;
    continue when v_so::bigint between 1 and 3;
    continue when v_so::bigint between 2024 and 2030;
    v_tong := v_tong + 1;
    -- So có BIÊN: "80" không được tính là khớp chỉ vì nằm trong "180"
    if replace(p_du_lieu, '.', '') ~ ('(^|[^0-9])' || v_so || '($|[^0-9])') then
      v_bam := v_bam + 1;
    else
      v_lac := array_append(v_lac, v_so);
    end if;
  end loop;

  -- 3a. TÊN IN ĐẬM
  for v_cum in
    select distinct m[1] from regexp_matches(p_tra_loi, '\*\*([^*\n]{3,60})\*\*', 'g') m
  loop
    v_t := btrim(regexp_replace(public.vmp_khong_dau(v_cum), '[^a-z0-9]+', ' ', 'g'));
    continue when v_t = '' or v_t !~ '[a-z]';
    continue when array_length(string_to_array(v_t, ' '), 1) < 2 and v_t !~ '[0-9]';
    -- Markdown lệch dấu ** làm đoạn VĂN XUÔI giữa hai chỗ in đậm bị bắt
    -- như tên. Tên thật không viết bằng hư từ: cụm dài mà quá nửa là hư từ
    -- thì là văn xuôi — bỏ qua, kẻo báo oan rồi cổng chặn nuốt cả câu đúng.
    continue when array_length(string_to_array(v_t, ' '), 1) >= 2
      and 2 * (select count(*) from unnest(string_to_array(v_t, ' ')) w where w = any(v_hu))
          >= array_length(string_to_array(v_t, ' '), 1);
    continue when v_t = any(v_da_xet);
    v_da_xet := array_append(v_da_xet, v_t);
    continue when v_t = any(v_nhan_bg);
    continue when exists (select 1 from unnest(v_chuan) w where (' '||v_t||' ') like '% '||w||' %');
    if position(' ' || v_t || ' ' in v_du) > 0 then continue; end if;
    if exists (select 1 from public.vmp_ai_tu_dien d
               where d.khoa like '%' || v_t || '%'
                  -- chiều ngược phải là TIỀN TỐ: "Máy BFS W (OQ)" bắt đầu bằng
                  -- tên thật thì quen; còn "Hệ thống nước cất Pure Steam" chỉ
                  -- CHỨA "nước cất" ở giữa — đó là tên bịa quấn quanh tên thật.
                  or (length(d.khoa) >= 4 and (v_t = d.khoa or v_t like d.khoa || ' %'))) then
      continue;
    end if;
    v_ten_la := array_append(v_ten_la, v_cum);
  end loop;

  -- 3b. TÊN KHÔNG IN ĐẬM — cụm bắt đầu bằng đầu tên thiết bị viết hoa.
  -- Chỉ soi các đầu tên quen của nhà máy để không báo oan văn xuôi thường.
  for v_m in
    select m from regexp_matches(p_tra_loi,
      '(Hệ thống|Hệ|Máy|Tủ|Nồi|Tank|Cân|Kho|Buồng|Xe|LAF|Isolator|Thiết bị|Đường ống|HVAC)[[:space:]]+([^[:space:]*.,;:!?·()\n]+(?:[[:space:]]+[^[:space:]*.,;:!?·()\n]+){0,3})', 'g') m
  loop
    v_cum := v_m[1] || ' ' || v_m[2];
    v_t := btrim(regexp_replace(public.vmp_khong_dau(v_cum), '[^a-z0-9]+', ' ', 'g'));
    v_words := string_to_array(v_t, ' ');
    v_dau := case when v_m[1] in ('Hệ thống','Thiết bị','Đường ống') then 2 else 1 end;
    -- cắt đuôi ở hư từ đầu tiên sau đầu tên
    v_keep := v_dau;
    for i in v_dau + 1 .. coalesce(array_length(v_words, 1), 0) loop
      exit when v_words[i] = any(v_hu);
      v_keep := i;
    end loop;
    continue when v_keep <= v_dau;  -- chỉ còn trơ đầu tên ("Hệ thống này...")
    v_t := array_to_string(v_words[1:v_keep], ' ');
    continue when v_t = any(v_da_xet);
    v_da_xet := array_append(v_da_xet, v_t);
    continue when v_t = any(v_nhan_bg);
    continue when exists (select 1 from unnest(v_chuan) w where (' '||v_t||' ') like '% '||w||' %');
    -- quen nếu BẤT KỲ tiền tố nào (dài trước, ngắn sau) khớp dữ liệu/từ điển
    v_biet := false;
    for i in reverse v_keep .. greatest(v_dau + 1, v_keep - 1) loop
      v_c := array_to_string(v_words[1:i], ' ');
      if position(' ' || v_c || ' ' in v_du) > 0 then v_biet := true; exit; end if;
      if exists (select 1 from public.vmp_ai_tu_dien d
                 where d.khoa like '%' || v_c || '%'
                    or (length(d.khoa) >= 4 and (v_c = d.khoa or v_c like d.khoa || ' %'))) then
        v_biet := true; exit;
      end if;
    end loop;
    if not v_biet then
      v_hien := v_m[1] || ' ' || array_to_string((regexp_split_to_array(v_m[2], '[[:space:]]+'))[1:v_keep - v_dau], ' ');
      v_ten_la := array_append(v_ten_la, v_hien);
    end if;
  end loop;

  if array_length(v_lac, 1) is not null then
    v_canh := array_append(v_canh, array_length(v_lac, 1) || ' con số không có trong dữ liệu: ' || array_to_string(v_lac, ', '));
  end if;
  if array_length(v_ngay_la, 1) is not null then
    v_canh := array_append(v_canh, array_length(v_ngay_la, 1) || ' ngày không có trong dữ liệu: ' || array_to_string(v_ngay_la, ', '));
  end if;
  if array_length(v_ten_la, 1) is not null then
    v_canh := array_append(v_canh, array_length(v_ten_la, 1) || ' tên không có trong hệ VMP: ' || array_to_string(v_ten_la, ', '));
  end if;

  return jsonb_build_object(
    'kiem_duoc', true,
    'so_da_kiem', v_tong,
    'so_bam_du_lieu', v_bam,
    'so_lac', to_jsonb(v_lac),
    'ngay_la', to_jsonb(v_ngay_la),
    'ten_la', to_jsonb(v_ten_la),
    'ty_le_bam', case when v_tong + coalesce(array_length(v_ngay_la,1),0) + coalesce(array_length(v_ten_la,1),0) = 0 then null
                      else round(100.0 * v_bam / (v_tong + coalesce(array_length(v_ngay_la,1),0) + coalesce(array_length(v_ten_la,1),0))) end,
    'dat', (array_length(v_canh, 1) is null),
    'canh_bao', case when array_length(v_canh, 1) is null then null
      else 'Câu trả lời có ' || array_to_string(v_canh, '; ')
           || '. Nhiều khả năng mô hình tự nghĩ ra — kiểm lại trước khi tin.' end);
end;
$_$;


--
-- Name: FUNCTION "rpc_ai_kiem_chung"("p_tra_loi" "text", "p_du_lieu" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_ai_kiem_chung"("p_tra_loi" "text", "p_du_lieu" "text") IS 'Đối chiếu mọi con số trong câu trả lời với khối dữ liệu đã đưa cho mô hình. Kiểm chứng bằng NGUỒN NGOÀI, không phải mô hình tự chấm — vì tự chấm thì cái sai được củng cố chứ không bị phát hiện.';


--
-- Name: rpc_ai_kiem_mo_ho("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_kiem_mo_ho"("p_question" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  q      text := ' ' || public.vmp_khong_dau(coalesce(p_question, '')) || ' ';
  v_cum  text;
  v_ds   jsonb;
  v_n    integer;
begin
  -- Tìm cụm dài nhất trong câu hỏi có khớp tên đối tượng
  select khoa into v_cum
  from public.vmp_ai_tu_dien
  where loai = 'ten_doi_tuong' and length(khoa) >= 4 and q like '%' || khoa || '%'
  order by length(khoa) desc limit 1;

  if v_cum is null then
    return jsonb_build_object('mo_ho', false);
  end if;

  -- Bao nhiêu đối tượng cùng chứa cụm đó?
  select count(*) into v_n
  from public.vmp_objects o
  where o.is_active and public.vmp_khong_dau(o.name) like '%' || v_cum || '%';

  if v_n <= 1 then
    return jsonb_build_object('mo_ho', false);
  end if;

  select jsonb_agg(jsonb_build_object(
           'ma', o.code, 'ten', o.name,
           'khu_vuc', coalesce(o.area, '—'), 'line', coalesce(o.line, '—'))
         order by o.code)
  into v_ds
  from public.vmp_objects o
  where o.is_active and public.vmp_khong_dau(o.name) like '%' || v_cum || '%';

  return jsonb_build_object(
    'mo_ho', true, 'cum', v_cum, 'so_khop', v_n, 'lua_chon', v_ds,
    'cau_hoi_lai',
      'Ơ, bổn cung thấy tới **' || v_n || ' thiết bị** khớp với ý ngươi 🌸 '
      || 'Ngươi muốn hỏi cái nào?' || E'\n\n'
      || (select string_agg('· **' || (e->>'ma') || '** — ' || (e->>'ten')
                            || ' (khu ' || (e->>'khu_vuc') || ', ' || (e->>'line') || ')', E'\n')
          from jsonb_array_elements(v_ds) e)
      || E'\n\nNgươi báo lại mã cho bổn cung, ví dụ "'
      || (v_ds->0->>'ma') || ' tới hạn khi nào".');
end;
$$;


--
-- Name: rpc_ai_lay_giong(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_lay_giong"("p_tin_xau" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_object_agg(ngu_canh, cau_list)
  from (
    select ngu_canh, jsonb_agg(cau) cau_list
    from (
      select ngu_canh, cau,
             row_number() over (partition by ngu_canh order by random()) rn
      from public.vmp_ai_giong
      where bat
        -- Tin tốt và tin xấu loại trừ nhau: đưa cả hai vào lời nhắc thì
        -- mô hình dễ khen ngợi giữa lúc đang báo 45 mục quá hạn.
        and (p_tin_xau is null
             or (p_tin_xau and ngu_canh <> 'tin_tot')
             or (not p_tin_xau and ngu_canh <> 'tin_xau'))
    ) t
    where rn <= 3
    group by ngu_canh) g;
$$;


--
-- Name: rpc_ai_mail_targets("date", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_mail_targets"("p_ngay" "date" DEFAULT CURRENT_DATE, "p_bo_qua_lich" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with den_luot as (
    select
      -- Phạm vi 'bộ phận' có mã thì chạy AI riêng cho bộ phận đó; mọi loại
      -- phạm vi khác gộp về 'all'. Phạm vi 'đối tượng' không có nghĩa với
      -- bản phân tích tổng hợp nên cũng về 'all'.
      case
        when scope_type = 'bộ phận' and coalesce(btrim(scope), '') <> ''
          then lower(btrim(scope))
        else 'all'
      end as pham_vi,
      email,
      coalesce(nullif(btrim(recipient_name), ''), email) as ten,
      ai_report_schedule as lich
    from public.vmp_alert_recipients
    where ai_report_enabled
      and (
        p_bo_qua_lich
        or (ai_report_schedule = 'hằng tuần'  and extract(isodow from p_ngay) = 1)
        or (ai_report_schedule = 'hằng tháng' and extract(day    from p_ngay) = 1)
      )
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'pham_vi', pham_vi,
      'nguoi_nhan', nguoi_nhan
    ) order by pham_vi),
    '[]'::jsonb
  )
  from (
    select pham_vi,
           jsonb_agg(jsonb_build_object('email', email, 'ten', ten, 'lich', lich) order by email) as nguoi_nhan
    from den_luot
    group by pham_vi
  ) g;
$$;


--
-- Name: FUNCTION "rpc_ai_mail_targets"("p_ngay" "date", "p_bo_qua_lich" boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_ai_mail_targets"("p_ngay" "date", "p_bo_qua_lich" boolean) IS 'Danh sách phạm vi cần chạy bản phân tích AI hôm nay, kèm người nhận từng phạm vi. Dùng bởi workflow Vani VMP 5.';


--
-- Name: rpc_ai_mo_rong_cau_hoi("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_mo_rong_cau_hoi"("p_question" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  q      text := ' ' || public.vmp_khong_dau(coalesce(p_question, '')) || ' ';
  v_them text[] := '{}';
  v_go   text[] := '{}';   -- cụm đã hiểu, gỡ khỏi câu để khỏi bị tính là từ lạ
  r      record;
begin
  for r in
    select distinct tu_chuan, cach_goi
    from public.vmp_ai_dong_nghia
    where bat and q like '%' || cach_goi || '%'
    order by tu_chuan
  loop
    -- Từ chuẩn đã có sẵn trong câu thì khỏi thêm
    continue when q like '%' || r.tu_chuan || '%';
    continue when r.tu_chuan = any(v_them);
    v_them := array_append(v_them, r.tu_chuan);
    v_go   := array_append(v_go, r.cach_goi);
  end loop;

  if array_length(v_them, 1) is null then
    return jsonb_build_object('co_mo_rong', false, 'cau_hoi', p_question, 'them', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'co_mo_rong', true,
    -- Nối vào CUỐI, giữ nguyên chữ gốc: bước dò thực thể vẫn chạy đúng
    -- trên tên riêng, mà bước dò ý định lại bắt được từ chuẩn.
    -- Gỡ cụm đồng nghĩa đã hiểu rồi mới nối từ chuẩn vào. Nếu để nguyên,
    -- bước dò từ lạ sẽ thấy "động" trong "chưa động gì" và tưởng chưa
    -- hiểu, dù ý đã bắt được. Chỉ gỡ cụm trong BẢNG ĐỒNG NGHĨA — toàn
    -- cách nói thông dụng, không bao giờ là tên riêng.
    'cau_hoi', (select trim(coalesce(
        (select string_agg(x, ' ') from (
           select trim(regexp_replace(public.vmp_khong_dau(p_question),
                  '(' || array_to_string(v_go, '|') || ')', ' ', 'g')) x) t), ''))
      || ' ' || array_to_string(v_them, ' ')),
    'them', to_jsonb(v_them),
    'vi_sao', 'Nhận ra cách gọi khác, thêm từ chuẩn: '
              || array_to_string(v_them, ', '));
end;
$$;


--
-- Name: rpc_ai_muc_luc(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_muc_luc"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with nv as (
    select coalesce(nullif(btrim(i.work_group), ''), '(chưa phân nhóm)') as ten,
           count(*) as tong,
           count(*) filter (where i.computed_status = 'over') as qua_han,
           count(distinct nullif(btrim(o.area), '')) as so_khu,
           string_agg(distinct nullif(btrim(o.area), ''), ', ') as khu,
           string_agg(distinct nullif(btrim(o.department), ''), ', ') as bo_phan,
           (array_agg(i.owner_name order by i.owner_name) filter (where i.owner_name is not null))[1] as nguoi
    from public.vmp_visible_plan_items() i
    left join public.vmp_objects o on o.code = i.object_code
    where i.is_active group by 1 order by 2 desc),
  kv as (
    select coalesce(nullif(btrim(o.area), ''), '—') as ten, count(*) as tong
    from public.vmp_visible_plan_items() i join public.vmp_objects o on o.code = i.object_code
    where i.is_active group by 1 order by 2 desc),
  ltd as (
    select validation_type as ten, count(*) as tong
    from public.vmp_visible_plan_items() where is_active group by 1 order by 2 desc)
  select jsonb_build_object(
    'tong', (select count(*) from public.vmp_visible_plan_items() where is_active),
    'nhom_viec', (select jsonb_agg(jsonb_build_object(
                    'ten', ten, 'tong', tong, 'qua_han', qua_han,
                    'khu', khu, 'bo_phan', bo_phan, 'nguoi', nguoi)) from nv),
    'khu_vuc',   (select jsonb_agg(jsonb_build_object('ten', ten, 'tong', tong)) from kv),
    'loai_td',   (select jsonb_agg(jsonb_build_object('ten', ten, 'tong', tong)) from ltd),
    -- Mục lục QUAN HỆ: mỗi nhóm kể luôn nó nằm đâu, thuộc bộ phận nào,
    -- ai giữ — các nhóm không đứng rời nhau nữa.
    'mo_ta', format(
      'MỤC LỤC KẾ HOẠCH — tổng %s hạng mục. Các NHÓM VIỆC kèm nơi chứa và người giữ: %s. KHU VỰC: %s. LOẠI THẨM ĐỊNH: %s. Kể đúng nguyên văn các tên này — không đổi tên, không thêm nhóm không có trong danh sách.',
      (select count(*) from public.vmp_visible_plan_items() where is_active),
      (select string_agg(format('%s (%s hạng mục%s; khu %s; bộ phận %s%s)',
                ten, tong,
                case when qua_han > 0 then ', ' || qua_han || ' quá hạn' else '' end,
                case when so_khu > 6 then 'rải ' || so_khu || ' khu' else coalesce(khu, '—') end,
                coalesce(bo_phan, '—'),
                coalesce('; phụ trách ' || nguoi, '')), ' · ') from nv),
      (select string_agg(ten || ' (' || tong || ')', ', ') from kv),
      (select string_agg(ten || ' (' || tong || ')', ', ') from ltd)))
$$;


--
-- Name: rpc_ai_ngu_canh_nap_san("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_ngu_canh_nap_san"("p_question" "text", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'trong_diem', public.rpc_ai_trong_diem(public.rpc_ai_hieu_cau_hoi(p_question)),
    'so_lieu',    public.rpc_ai_context_gon(p_question, p_year),
    'tai_lieu',   public.rpc_kb_search_text(p_question, 3),
    'huong_dan',
      'TRẢ LỜI ĐÚNG TRỌNG ĐIỂM. Nếu trong_diem chỉ ra một đối tượng cụ '
      || 'thể, chỉ nói về đối tượng đó — TUYỆT ĐỐI không đọc lại phần tổng '
      || 'quan toàn nhà máy, vì người hỏi không hỏi cái đó. '
      || 'Đây là TOÀN BỘ dữ liệu được phép dùng; không có số nào ngoài đây '
      || 'thì nói "không có trong dữ liệu", không tự tính thêm.');
$$;


--
-- Name: rpc_ai_ngu_canh_phan_tich("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_ngu_canh_phan_tich"("p_question" "text", "p_phien" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'cau_hoi', p_question,
    'lich_su', coalesce((
      select jsonb_agg(jsonb_build_object('hoi', cau_hoi, 'y_dinh', y_dinh)
                       order by tao_luc)
      from (select cau_hoi, y_dinh, tao_luc from public.vmp_ai_hoi_thoai
            where phien = p_phien and tao_luc > now() - interval '30 minutes'
            order by tao_luc desc limit 4) t), '[]'::jsonb),
    'bo_nho', public.rpc_ai_nho_lai(p_phien, p_question),
    'phan_tich_so_bo', public.rpc_ai_hieu_cau_hoi(p_question),
    'trong_diem_so_bo', public.rpc_ai_trong_diem(public.rpc_ai_hieu_cau_hoi(p_question)),
    'thuc_the_co_that', jsonb_build_object(
      'nguoi',   (select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'nguoi'),
      'nhom_viec',(select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'nhom_viec'),
      'khu_vuc', (select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'khu_vuc'),
      'loai_td', (select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'loai_td'),
      'bo_phan', (select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'bo_phan')));
$$;


--
-- Name: FUNCTION "rpc_ai_ngu_canh_phan_tich"("p_question" "text", "p_phien" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_ai_ngu_canh_phan_tich"("p_question" "text", "p_phien" "text") IS 'Gói ngữ cảnh cho LỚP AI PHÂN TÍCH: lịch sử hội thoại + thực thể có thật + bản phân tích SQL sơ bộ. Không đưa 217 tên thiết bị — nhồi cả danh mục vào lời nhắc chỉ làm loãng.';


--
-- Name: rpc_ai_ngu_canh_tam_ly("text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_ngu_canh_tam_ly"("p_question" "text", "p_ten" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.rpc_ai_doc_trang_thai(p_question, p_ten, p_year);
$$;


--
-- Name: rpc_ai_nho_lai("text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_nho_lai"("p_nguoi" "text", "p_cau_hoi" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  q      text    := public.vmp_khong_dau(coalesce(p_cau_hoi, ''));
  -- Khoá bộ nhớ là email, nhưng owner_name trong timeline là TÊN. Không
  -- quy đổi thì tầng lõi luôn ra 0 hạng mục — nhớ được chuyện cũ mà
  -- không biết người đó đang ôm bao nhiêu việc thì vô dụng.
  v_ten  text;
  v_loi  jsonb;
  v_kho  jsonb;
  v_lan  jsonb;
begin
  if p_nguoi is null or trim(p_nguoi) = '' then
    return jsonb_build_object('co', false);
  end if;

  select coalesce(
           (select staff_name from public.vmp_staff_emails
            where lower(email) = lower(p_nguoi) limit 1),
           (select owner_name from public.vmp_visible_plan_items()
            where owner_name = p_nguoi limit 1),
           p_nguoi)
    into v_ten;

  -- TẦNG LÕI: tính tại chỗ từ dữ liệu, luôn tươi, không cần lưu
  select jsonb_build_object(
    'ten', v_ten,
    'so_hang_muc', count(*),
    'qua_han', count(*) filter (where computed_status = 'over'),
    'sap_den_han_30', count(*) filter (where computed_status <> 'done'
                        and deadline_vmp between current_date and current_date + 30),
    'nhom_viec', (select string_agg(distinct work_group, ' · ')
                  from public.vmp_visible_plan_items()
                  where year = v_year and is_active and owner_name = v_ten
                    and work_group is not null))
  into v_loi
  from public.vmp_visible_plan_items()
  where year = v_year and is_active and owner_name = v_ten;

  -- TẦNG KHO: lôi ra điều liên quan tới câu hỏi, hoặc điều quan trọng nhất
  select coalesce(jsonb_agg(jsonb_build_object(
           'loai', loai, 'noi_dung', noi_dung,
           'khi_nao', to_char(tao_luc, 'DD/MM/YYYY')) order by diem desc), '[]'::jsonb)
  into v_kho
  from (
    select loai, noi_dung, tao_luc,
           quan_trong
           + (select count(*) * 3 from unnest(tu_khoa) k where q like '%' || k || '%')
           -- Điều lâu không nhắc thì mờ dần: mỗi 30 ngày trừ 1 điểm
           - (extract(day from now() - coalesce(nhac_cuoi, tao_luc)) / 30)::int as diem
    from public.vmp_ai_bo_nho
    where nguoi = p_nguoi
    order by diem desc limit 5) t
  where diem > 0;

  -- Lần trò chuyện gần nhất, để mở lời cho tự nhiên
  select jsonb_build_object('lan_cuoi', to_char(max(tao_luc), 'DD/MM HH24:MI'),
                            'so_luot', count(*))
  into v_lan
  from public.vmp_ai_hoi_thoai
  where phien = p_nguoi and tao_luc > now() - interval '30 days';

  return jsonb_build_object(
    'co', true, 'tang_loi', v_loi, 'tang_kho', v_kho, 'lan_truoc', v_lan,
    'huong_dan',
      'tang_loi là điều LUÔN đúng về người này, dùng thoải mái. '
      || 'tang_kho là chuyện cũ — nhắc lại được nhưng phải tự nhiên, đừng '
      || 'liệt kê ra như đọc hồ sơ. Ví dụ đúng: "lần trước ngươi than mệt, '
      || 'giờ đỡ chưa". Ví dụ SAI: "theo ghi nhận ngày 29/07 ngươi đã than mệt".');
end;
$$;


--
-- Name: rpc_ai_phan_tich_cau_hoi("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_phan_tich_cau_hoi"("p_cau_hoi" "text", "p_phien" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_tk       jsonb := public.rpc_ai_hieu_tu_khoa(p_cau_hoi, 6);
  v_mach     text;
  v_so_luot  integer := 0;
  v_rong_nhat integer := 0;
  v_ten_rong text;
  v_vi_du    text;
  v_so_tieng integer;
  v_muc      text;          -- du_y | con_rong | truot | cut_can_mach
  v_dan      text;
begin
  -- --- Bộ nhớ tạm: ba lượt hỏi gần nhất của cùng phiên ---
  if p_phien is not null and btrim(p_phien) <> '' then
    select count(*), string_agg(cau_hoi, ' | ' order by id)
    into v_so_luot, v_mach
    from (
      select id, cau_hoi
      from public.vmp_ai_hoi_thoai
      where phien = p_phien
      order by id desc
      limit 3
    ) t;
  end if;

  -- --- Chỗ rộng nhất: từ khoá nào trúng nhiều mục nhất ---
  select (x ->> 'so_khop')::int, x ->> 'tu',
         (select string_agg(v, ', ') from jsonb_array_elements_text(x -> 'vi_du') v)
  into v_rong_nhat, v_ten_rong, v_vi_du
  from jsonb_array_elements(v_tk -> 'nhom') x
  order by (x ->> 'so_khop')::int desc
  limit 1;

  v_rong_nhat := coalesce(v_rong_nhat, 0);

  -- Đếm tiếng có nghĩa, thô thôi: đủ để biết câu dài hay câu cụt
  v_so_tieng := coalesce(array_length(
    string_to_array(btrim(regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi, '')), '[^a-z0-9]+', ' ', 'g')), ' '), 1), 0);

  -- --- Kết luận ---
  if v_so_tieng <= 3 and coalesce(v_so_luot, 0) > 0 then
    v_muc := 'cut_can_mach';
  elsif jsonb_array_length(v_tk -> 'nhom') = 0 and jsonb_array_length(v_tk -> 'bi_danh') = 0 then
    v_muc := 'truot';
  elsif v_rong_nhat >= 5 then
    v_muc := 'con_rong';
  else
    v_muc := 'du_y';
  end if;

  -- --- Lời dặn cho AI ---
  v_dan := coalesce(v_tk ->> 'giai_thich', '');

  if v_muc = 'cut_can_mach' then
    v_dan := v_dan || format(
      ' CÂU HỎI RẤT NGẮN, phải hiểu theo mạch. Ba lượt gần nhất người này đã hỏi: %s. Nối vào đó mà hiểu, TRẢ LỜI LUÔN theo cách hiểu hợp lý nhất, nói rõ mình đang hiểu theo hướng nào, rồi mới mời chỉnh lại nếu lệch. Tuyệt đối đừng hỏi trống không kiểu "ngươi muốn hỏi gì".',
      coalesce(v_mach, 'chưa có'));

  elsif v_muc = 'con_rong' then
    v_dan := v_dan || format(
      ' CÂU HỎI CÒN RỘNG: chữ "%s" trúng tới %s mục. Làm hai bước trong CÙNG một câu trả lời: (1) trả lời ngay phần chung — tổng số, tình hình chung của cả nhóm đó, để người hỏi có cái cầm về; (2) rồi mới hỏi đúng MỘT câu để thu hẹp, kèm 2–3 lựa chọn cụ thể lấy từ danh sách này: %s. Đừng hỏi lại rồi đứng im chờ — như vậy là đẩy việc cho người hỏi.',
      v_ten_rong, v_rong_nhat, coalesce(v_vi_du, 'chưa có'));

  elsif v_muc = 'truot' then
    v_dan := v_dan || format(
      ' KHÔNG DÒ RA thiết bị, khu vực hay bộ phận nào trong câu hỏi. Trước khi kết luận là không có, hãy xét: có phải người hỏi đang nói tiếp chuyện của lượt trước không (ba lượt gần nhất: %s), hay đang hỏi chuyện ngoài số liệu. Nếu đúng là chưa dò ra thì nói thật một cách có duyên, đưa cái gần nhất mình có, rồi gợi 2–3 câu hỏi cụ thể — đừng trả lời cụt.',
      coalesce(v_mach, 'chưa có'));

  else
    v_dan := v_dan || ' Câu hỏi đủ rõ để trả lời thẳng. Trả lời đúng trọng điểm, đừng hỏi lại lấy lệ.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'muc', v_muc,
    'so_luot_nho', coalesce(v_so_luot, 0),
    'mach_gan_nhat', v_mach,
    'rong_nhat', v_rong_nhat,
    'tu_khoa', v_tk,
    'loi_dan', v_dan
  );
end;
$$;


--
-- Name: FUNCTION "rpc_ai_phan_tich_cau_hoi"("p_cau_hoi" "text", "p_phien" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_ai_phan_tich_cau_hoi"("p_cau_hoi" "text", "p_phien" "text") IS 'Gộp từ khoá dò được + ba lượt hỏi gần nhất của phiên để kết luận câu hỏi đã đủ ý chưa, và dặn AI phải làm gì tiếp (trả lời thẳng / trả lời chung rồi thu hẹp / hỏi lại kèm lựa chọn).';


--
-- Name: rpc_ai_suc_khoe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_suc_khoe"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'mo_hinh', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ma', ma, 'ten', ten, 'nha', nha_cung_cap, 'bac', bac, 'bat', bat,
        'so_lan_goi', so_lan_goi, 'so_lan_loi', so_lan_loi,
        'ty_le_loi', case when so_lan_goi = 0 then null
                          else round(100.0 * so_lan_loi / so_lan_goi) end,
        'tre_tb_ms', tre_tb_ms, 'loi_lien_tiep', loi_lien_tiep,
        'dang_nghi', (nghi_den is not null and nghi_den > now()),
        'nghi_den', nghi_den, 'loi_gan_nhat', loi_gan_nhat, 'ghi_chu', ghi_chu)
        order by bac, thu_tu), '[]'::jsonb)
      from public.vmp_ai_mo_hinh),
    'theo_duong', (
      select coalesce(jsonb_agg(jsonb_build_object('duong', d, 'so_cau', n,
               'tre_tb_ms', tb) order by n desc), '[]'::jsonb)
      from (select coalesce(duong_tra_loi, 'chua_ro') d, count(*) n,
                   round(avg(latency_ms))::int tb
            from public.vmp_ai_chat_log group by 1) t),
    'tong_cau_hoi', (select count(*) from public.vmp_ai_chat_log),
    'ty_le_khong_dung_ai', (
      select case when count(*) = 0 then null
             else round(100.0 * count(*) filter (where duong_tra_loi in ('sql','dem')) / count(*))
             end from public.vmp_ai_chat_log)
  );
$$;


--
-- Name: rpc_ai_tam_su("text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_tam_su"("p_question" "text", "p_nguoi" "jsonb" DEFAULT '{}'::"jsonb", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  q      text    := public.vmp_khong_dau(coalesce(p_question, ''));
  ten    text    := nullif(trim(coalesce(p_nguoi->>'ten', '')), '');
  v_tong integer; v_tre integer; v_sap integer;
  v_lan_truoc integer;
  v_ts jsonb;
  v_uu   text;
  v_than text;
begin
  -- Bắt cả lời than NHẸ: người đang gồng thường nói giảm đi, mà đó chính
  -- là lúc cần để ý nhất.
  if q !~ ('(met qua|met roi|met lam|hoi met|cung met|met chut|ap luc|qua tai|khong xue|lam khong kip'
        || '|nhieu viec qua|nhieu qua|choang|stress|nan qua|chan qua|buon qua'
        || '|khong biet bat dau|roi tung beng|bo tay|cuu toi|lam sao bay gio'
        || '|deo noi|khong kham noi|kiet suc)') then
    return jsonb_build_object('khop', false);
  end if;

  if ten is null then
    return jsonb_build_object('khop', true, 'y_dinh', 'tam_su', 'nguon', 'sql',
      'tra_loi', 'Bổn cung nghe đây, ngươi cứ nói 🌸' || E'\n\n'
        || 'Mà bổn cung chưa biết ngươi là ai nên chưa lôi được phần việc '
        || 'riêng của ngươi ra xem. Ngươi tải lại trang rồi hỏi bổn cung lần '
        || 'nữa, bổn cung sẽ bày cho nên làm cái gì trước.',
      'goi_y', jsonb_build_array('Còn bao nhiêu hạng mục quá hạn?',
                                 'Nhóm trọng yếu 7-9 đang tới đâu?'));
  end if;

  select count(*), count(*) filter (where computed_status = 'over'),
         count(*) filter (where computed_status <> 'done'
                            and deadline_vmp between current_date and current_date + 30)
    into v_tong, v_tre, v_sap
  from public.vmp_visible_plan_items()
  where year = v_year and is_active and owner_name = ten;

  -- Việc nên làm trước: trọng yếu cao nhất, trễ lâu nhất
  select string_agg('· ' || p.validation_code || ' — ' || o.name
                    || ' (điểm ' || coalesce(p.criticality_score::text, '—')
                    || ', trễ ' || (current_date - p.deadline_vmp) || ' ngày)', E'\n')
  into v_uu
  from (select * from public.vmp_visible_plan_items()
        where year = v_year and is_active and owner_name = ten
          and computed_status = 'over'
        order by criticality_score desc nulls last, deadline_vmp
        limit 3) p
  join vmp_objects o on o.code = p.object_code;

  v_than := case
    when v_tre = 0 then 'Mà bổn cung xem rồi, phần của ngươi **không có mục nào quá hạn** đâu — '
                        || 'ngươi lo hơi quá đó nha 🌸'
    when v_tre >= 20 then 'Bổn cung xem sổ rồi, ngươi đang ôm **' || v_tre
                        || ' mục quá hạn** trên tổng **' || v_tong || '**. Nhiều thật, '
                        || 'không phải ngươi kém đâu.'
    else 'Bổn cung xem sổ rồi, ngươi có **' || v_tre || ' mục quá hạn** trên tổng **'
         || v_tong || '**. Chưa tới mức không cứu được đâu.' end;

  -- Đã từng than trước đây chưa? Nhắc lại cho ra dáng người quen, nhưng
  -- nhắc nhẹ thôi — đọc vanh vách ngày giờ thì thành hồ sơ theo dõi.
  v_ts := public.rpc_ai_doc_trang_thai(p_question, ten, v_year);

  select count(*) into v_lan_truoc
  from public.vmp_ai_bo_nho
  where nguoi = coalesce(p_nguoi->>'email', ten)
    and loai = 'viec_da_xay_ra' and noi_dung like '%quá tải%';

  return jsonb_build_object('khop', true, 'y_dinh', 'tam_su', 'nguon', 'sql',
    'tra_loi',
    case when v_lan_truoc > 0
      then 'Lại nữa rồi sao. Bổn cung nhớ đợt trước ngươi cũng than thế này 🌸' || E'\n\n'
      else 'Ừm, bổn cung hiểu mà. Đợt này căng thật 🌸' || E'\n\n' end
    || v_than || E'\n\n'
    || case when v_ts->>'lech_loi_va_so' is not null and (v_ts->>'trang_thai') = 'giam_nhe'
            then 'Mà ngươi bảo "hơi mệt thôi" chứ bổn cung nhìn sổ thấy hơn thế đấy nha. '
                 || 'Đừng gồng, nói thật ra bổn cung mới liệu được.' || E'\n\n'
            else '' end
    || case when (v_ts->>'trang_thai') = 'be_tac'
            then 'Bổn cung biết cảm giác nhìn cả đống rồi không biết cầm cái nào lên trước. '
                 || 'Vậy thì đừng nhìn cả đống nữa — chỉ nhìn MỘT cái thôi:' || E'\n\n'
            else '' end
    || case when v_uu is not null then
         'Nếu chưa biết bắt đầu từ đâu thì ngươi cứ nhặt ba cái này trước, '
         || 'trọng yếu cao nhất và trễ lâu nhất:' || E'\n' || v_uu || E'\n\n'
       else '' end
    || case when v_sap > 0 then 'Còn **' || v_sap || ' mục** sắp tới hạn trong 30 ngày nữa, '
                                || 'ngươi ngó qua sớm cho đỡ dồn.' || E'\n\n' else '' end
    || 'Cứ nhặt từng cái một, rồi cũng hết thôi. Bổn cung ngồi đây, cần gì cứ gọi.',
    'goi_y', jsonb_build_array(
      'Liệt kê hạng mục quá hạn của ' || ten,
      ten || ' còn bao nhiêu việc sắp đến hạn?',
      'Còn bao nhiêu hạng mục chưa có QA phụ trách?'));
end;
$$;


--
-- Name: rpc_ai_thong_ke_loc("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_thong_ke_loc"("p_cau_hoi" "text", "p_k" integer DEFAULT 3) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_q       text := regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi,'')), '[^a-z0-9]+', ' ', 'g');
  v_q_dau   text := lower(regexp_replace(coalesce(p_cau_hoi,''), '[^[:alnum:]]+', ' ', 'g'));
  v_p       text;
  v_ds      jsonb := '[]'::jsonb;
  v_tb_mo   numeric;
  r         record; v_r record;
  v_ho_tro  integer; v_ty numeric; v_muc text; v_nhan text; v_ten text; v_ai text;
  v_nguoi   jsonb; v_nguoi_mo text; v_han_som date; v_han_muon date;
  v_tu date; v_den date; v_nhan_tg text; v_m text[]; v_gom text; v_them integer; v_nam integer;
  v_liet_ke boolean := false;
  v_bo_qua  text[] := array[
    'bao','nhieu','cua','cho','cac','nhung','mot','hai','ba','the','nao','gi','la','co','khong',
    'va','hay','thi','ma','o','tai','tu','den','ve','voi','trong','ngoai','tren','duoi','con',
    'da','dang','se','bi','duoc','cai','nay','do','kia','ay','anh','chi','em','toi','ban','minh',
    'xem','giup','biet','hoi','tra','loi','can','muon','phai','nen','lam','sao','vi',
    'hang','muc','tien','thiet','danh','sach','tinh','hinh','tat','ca','hien','suat',
    'ngay','thang','nam','tuan','hom','qua','han','xong','chua','roi','moi','tong','so',
    'phong','sach','thanh','pham','tinh','hop','cuoc','tiet','nhat','kem','nhiet',
    'toan','le','bo','phan','doi','lech','nha','may','viec','cong','tom','tat','hoan',
    'lieu','chuyen','luot','truoc','nho','lay','cap','lan','cuoi','line','duyet',
    'status','system','show','department','progress','items','overdue',
    'thong','tin','thong tin','cho','ve','cua','xin',
    'quan','lien','lien quan','tim','tim kiem','ra sao','nhu the nao',
    'noi','ha','muon','it','deu','deo','luong','muc do','trung binh',
    -- "quý 3" bỏ dấu thành "quy" — đừng để nó vơ nhóm "Quy trình";
    -- hỏi thật về quy trình vẫn khớp bằng cụm hai tiếng 'quy trinh'.
    'quy'];
begin
  -- ── Chiều THỜI GIAN: khoanh khoảng hạn VMP nếu câu hỏi có nhắc ──
  v_p := ' ' || btrim(v_q) || ' ';
  v_nam := extract(year from current_date)::int;
  if v_p like '% thang nay %' then
    v_tu := date_trunc('month', current_date)::date;
    v_den := (v_tu + interval '1 month' - interval '1 day')::date;
    v_nhan_tg := format('tháng %s/%s', extract(month from v_tu)::int, extract(year from v_tu)::int);
  elsif v_p like '% thang sau %' or v_p like '% thang toi %' then
    v_tu := date_trunc('month', current_date + interval '1 month')::date;
    v_den := (v_tu + interval '1 month' - interval '1 day')::date;
    v_nhan_tg := format('tháng %s/%s', extract(month from v_tu)::int, extract(year from v_tu)::int);
  elsif v_p like '% tuan nay %' then
    v_tu := date_trunc('week', current_date)::date; v_den := v_tu + 6;
    v_nhan_tg := format('tuần này (%s–%s)', to_char(v_tu,'DD/MM'), to_char(v_den,'DD/MM'));
  elsif v_p like '% tuan sau %' or v_p like '% tuan toi %' then
    v_tu := date_trunc('week', current_date)::date + 7; v_den := v_tu + 6;
    v_nhan_tg := format('tuần sau (%s–%s)', to_char(v_tu,'DD/MM'), to_char(v_den,'DD/MM'));
  elsif v_p like '% quy nay %' then
    v_tu := date_trunc('quarter', current_date)::date;
    v_den := (v_tu + interval '3 months' - interval '1 day')::date;
    v_nhan_tg := format('quý %s/%s', extract(quarter from v_tu)::int, extract(year from v_tu)::int);
  elsif v_p like '% quy sau %' or v_p like '% quy toi %' then
    v_tu := (date_trunc('quarter', current_date) + interval '3 months')::date;
    v_den := (v_tu + interval '3 months' - interval '1 day')::date;
    v_nhan_tg := format('quý %s/%s', extract(quarter from v_tu)::int, extract(year from v_tu)::int);
  elsif v_p like '% nua dau nam %' then
    v_tu := make_date(v_nam, 1, 1); v_den := make_date(v_nam, 6, 30);
    v_nhan_tg := format('nửa đầu năm %s', v_nam);
  elsif v_p like '% nua cuoi nam %' then
    v_tu := make_date(v_nam, 7, 1); v_den := make_date(v_nam, 12, 31);
    v_nhan_tg := format('nửa cuối năm %s', v_nam);
  elsif v_p like '% nam sau %' or v_p like '% nam toi %' then
    v_tu := make_date(v_nam + 1, 1, 1); v_den := make_date(v_nam + 1, 12, 31);
    v_nhan_tg := format('năm %s', v_nam + 1);
  elsif v_p like '% nam nay %' then
    v_tu := make_date(v_nam, 1, 1); v_den := make_date(v_nam, 12, 31);
    v_nhan_tg := format('năm %s', v_nam);
  else
    v_m := regexp_match(v_p, ' quy (\d) ');
    if v_m is not null and v_m[1]::int between 1 and 4 then
      v_nam := coalesce((regexp_match(v_p, ' (20\d{2}) '))[1]::int, v_nam);
      v_tu := make_date(v_nam, (v_m[1]::int - 1) * 3 + 1, 1);
      v_den := (v_tu + interval '3 months' - interval '1 day')::date;
      v_nhan_tg := format('quý %s/%s', v_m[1]::int, v_nam);
    else
      -- "từ tháng X đến tháng Y" phải bắt TRƯỚC "tháng N" đơn lẻ,
      -- kẻo tháng đầu tiên nuốt mất cả khoảng.
      v_m := regexp_match(v_p, ' tu thang (\d{1,2}) (?:den|toi) thang (\d{1,2}) ');
      if v_m is not null and v_m[1]::int between 1 and 12 and v_m[2]::int between 1 and 12 then
        v_nam := coalesce((regexp_match(v_p, ' (20\d{2}) '))[1]::int, v_nam);
        v_tu := make_date(v_nam, v_m[1]::int, 1);
        v_den := (make_date(v_nam + case when v_m[2]::int < v_m[1]::int then 1 else 0 end, v_m[2]::int, 1)
                  + interval '1 month' - interval '1 day')::date;
        v_nhan_tg := format('từ tháng %s đến tháng %s/%s', v_m[1]::int, v_m[2]::int, extract(year from v_den)::int);
      else
        v_m := regexp_match(v_p, ' (\d{1,3}) ngay toi ');
        if v_m is not null then
          v_tu := current_date; v_den := current_date + least(v_m[1]::int, 366);
          v_nhan_tg := format('%s ngày tới', v_m[1]);
        else
          v_m := regexp_match(v_p, ' thang (\d{1,2}) ');
          if v_m is not null and v_m[1]::int between 1 and 12 then
            v_nam := coalesce((regexp_match(v_p, ' (20\d{2}) '))[1]::int, v_nam);
            v_tu := make_date(v_nam, v_m[1]::int, 1);
            v_den := (v_tu + interval '1 month' - interval '1 day')::date;
            v_nhan_tg := format('tháng %s/%s', v_m[1]::int, v_nam);
          end if;
        end if;
      end if;
    end if;
  end if;

  -- Câu LIỆT KÊ ("có những thiết bị nào", "gồm gì", "danh sách...") thì
  -- phải kể tên thật ra — không kể là mô hình tự chế danh sách.
  v_liet_ke := v_p ~ ' (liet ke|danh sach|bao gom|gom nhung|gom gi|co nhung|nhung gi|gom cai) '
            or (v_p like '% nao %' and (v_p like '% nhung %' or v_p like '% cac %'
                or v_p like '% thiet bi %' or v_p like '% may %' or v_p like '% muc %'));

  select round(avg(mo), 1) into v_tb_mo
  from (select count(*) filter (where computed_status <> 'done') as mo
        from public.vmp_visible_plan_items() where is_active and owner_name is not null
        group by owner_name) t;

  for r in
    with tu_dien as (
      select d.loai, d.gia_tri,
             ' ' || regexp_replace(d.khoa, '[^a-z0-9]+', ' ', 'g') || ' ' as kh,
             d.khoa
      from public.vmp_ai_tu_dien d
    ),
    tieng as (
      select distinct t from unnest(string_to_array(btrim(v_q),' ')) t
      where length(t) >= 3 and not (t = any(v_bo_qua))),
    cum as (
      select distinct btrim(a.t||' '||b.t) as t
      from unnest(string_to_array(btrim(v_q),' ')) with ordinality a(t,i)
      join unnest(string_to_array(btrim(v_q),' ')) with ordinality b(t,i) on b.i = a.i+1
      where length(a.t) >= 2 and length(b.t) >= 2
        and not (a.t = any(v_bo_qua) and b.t = any(v_bo_qua))),
    khop as (
      select d.loai, d.gia_tri, c.t as tu
      from tieng c join tu_dien d on d.kh like '% '||c.t||' %'
      where (d.loai not in ('ten_doi_tuong','line')
         or length(c.t) >= 4
         or coalesce(p_cau_hoi,'') ~ ('\m' || upper(c.t) || '\M')
         or btrim(d.kh) = c.t)
        and not (c.t = 'chung' and (' '||v_q||' ') not like '% can chung %')
      union all
      select d.loai, d.gia_tri, c.t
      from cum c join tu_dien d on d.kh like '% '||c.t||' %'
      union all
      select d.loai, d.gia_tri, c.t
      from (select distinct t from unnest(string_to_array(btrim(v_q),' ')) t
            where length(t) >= 4 and t ~ '[a-z]') c
      join tu_dien d on d.loai = 'ma' and d.khoa like '%'||c.t||'%'
      union all
      select d.loai, d.gia_tri, c.t
      from (select distinct t from unnest(string_to_array(btrim(v_q_dau),' ')) t
            where length(t) >= 2
              and not exists (select 1 from unnest(array[
                    'hoàn thành','hoàn tất','hoàn chỉnh','hoàn thiện','my thuật','mỹ thuật',
                    'đức tính','hương vị','nhi đồng','hằng ngày','hằng năm',
                    'tiến độ','tiến hành','tiến trình','tiến triển'
                  ]) cum where lower(coalesce(p_cau_hoi,'')) like '%'||cum||'%'
                    and cum like '%'||t||'%')) c
      join public.vmp_ai_tu_dien d on d.loai = 'nguoi'
        and (' ' || lower(regexp_replace(d.gia_tri, '[^[:alnum:]]+', ' ', 'g')) || ' ') like '% '||c.t||' %'
      union all
      select d.loai, d.gia_tri, c.t
      from tieng c
      join tu_dien d on d.loai = 'nguoi' and d.kh like '% '||c.t||' %'
      union all
      select d.loai, d.gia_tri, c.t
      from (select distinct t from unnest(string_to_array(btrim(v_q),' ')) t where length(t) = 2) c
      join tu_dien d on d.loai in ('loai_td','bo_phan','khu_vuc') and btrim(d.kh) = c.t
      union all
      select b.loai, b.gia_tri, b.bi_danh from public.vmp_ai_bi_danh b
      where b.gia_tri is not null and (' '||v_q||' ') like '%'||b.bi_danh||'%'),
    xep as (select loai, gia_tri, max(length(tu)) as do_dai,
                   count(distinct tu) as so_cum
            from khop group by loai, gia_tri),
    dai_nhat as (select loai, max(so_cum) as mc, max(do_dai) as md from xep group by loai)
    select x.loai, array_agg(distinct x.gia_tri) as ds,
           count(distinct x.gia_tri) as sl, max(x.do_dai) as do_dai
    from xep x join dai_nhat d on d.loai = x.loai
    where x.so_cum = d.mc
       or x.loai = 'nguoi'
       or exists (
            select 1 from khop k
            where k.loai = x.loai and k.gia_tri = x.gia_tri
              and k.tu not in (
                select k2.tu from khop k2
                join xep x2 on x2.loai = k2.loai and x2.gia_tri = k2.gia_tri
                where x2.loai = x.loai and x2.so_cum = d.mc))
    group by x.loai
    having count(distinct x.gia_tri) <= 25
    order by count(distinct x.gia_tri), max(x.so_cum) desc, max(x.do_dai) desc
    limit greatest(1, least(p_k, 5))
  loop
    if r.loai in ('nguoi', 'ten_doi_tuong', 'ma', 'nhom_viec', 'khu_vuc', 'line') and r.sl > 1 then
      v_ds := v_ds || jsonb_build_array(jsonb_build_object(
        'loai', r.loai,
        'gia_tri', array_to_string(r.ds[1:4], ', '),
        'so_gia_tri_da_gop', r.sl,
        'danh_sach_gia_tri', to_jsonb(r.ds),
        'cau_tra_loi_goi_y', case when r.loai = 'nguoi' then format(
            'Câu hỏi chạm tới %s người khác nhau (%s) — CHƯA RÕ đang hỏi ai, nên KHÔNG có con số nào để đưa cả. Hỏi lại cho rõ đang nói về ai trong số đó, tuyệt đối đừng tự chọn một người rồi gán số.',
            r.sl, array_to_string(r.ds[1:4], ', '))
          else format(
            'Câu hỏi chạm tới %s đối tượng khác nhau (%s) — CHƯA RÕ đang hỏi cái nào, nên KHÔNG có con số nào để đưa cả. Kể tên các đối tượng đó ra rồi HỎI LẠI xem ngươi muốn soi cái nào; tuyệt đối đừng cộng gộp chúng thành một con số, cũng đừng tự chọn một cái rồi gán số.',
            r.sl, array_to_string(r.ds[1:4], ', ')) end));
      continue;
    end if;

    v_ten := case when r.sl = 1 then r.ds[1]
                  else array_to_string(r.ds[1:4], ', ')
                       || case when r.sl > 4 then format(' và %s cái nữa', r.sl-4) else '' end end;

    select count(*) as tong,
      count(*) filter (where i.computed_status='done') as hoan_thanh,
      count(*) filter (where i.computed_status='prog') as dang_lam,
      count(*) filter (where i.computed_status in ('plan','todo')) as chua_bat_dau,
      count(*) filter (where i.computed_status='over') as qua_han,
      count(*) filter (where i.computed_status<>'done' and i.deadline_vmp <= current_date+30) as den_han_30_ngay,
      count(*) filter (where i.computed_status<>'done' and i.criticality_score >= 7) as dang_mo_trong_yeu_cao,
      round(sum(coalesce(i.effort_days,0)) filter (where i.computed_status<>'done'),1) as cong_ngay_con_lai
    into v_r
    from public.vmp_visible_plan_items() i
    left join public.vmp_objects o on o.code = i.object_code
    where i.is_active
      and (v_tu is null or i.deadline_vmp between v_tu and v_den)
      and case r.loai
        when 'nguoi' then i.owner_name = any(r.ds)
        when 'nhom_viec' then i.work_group = any(r.ds)
        when 'loai_td' then i.validation_type = any(r.ds)
        when 'bo_phan' then o.department = any(r.ds)
        when 'khu_vuc' then o.area = any(r.ds)
        when 'line' then o.line = any(r.ds)
        when 'ten_doi_tuong' then o.name = any(r.ds)
        when 'ma' then i.object_code = any(r.ds)
        else false end;

    v_nguoi := null; v_nguoi_mo := null; v_han_som := null; v_han_muon := null;
    if r.loai <> 'nguoi' then
      select jsonb_agg(jsonb_build_object('ten', ten, 'so_hang_muc', sl) order by sl desc),
             string_agg(ten || ' (' || sl || ' hạng mục)', ', ' order by sl desc)
      into v_nguoi, v_nguoi_mo
      from (
        select coalesce(i.owner_name, '(chưa gán)') as ten, count(*) as sl
        from public.vmp_visible_plan_items() i
        left join public.vmp_objects o on o.code = i.object_code
        where i.is_active
          and (v_tu is null or i.deadline_vmp between v_tu and v_den)
          and case r.loai
            when 'nhom_viec' then i.work_group = any(r.ds)
            when 'loai_td' then i.validation_type = any(r.ds)
            when 'bo_phan' then o.department = any(r.ds)
            when 'khu_vuc' then o.area = any(r.ds)
            when 'line' then o.line = any(r.ds)
            when 'ten_doi_tuong' then o.name = any(r.ds)
            when 'ma' then i.object_code = any(r.ds)
            else false end
        group by 1 order by 2 desc limit 3
      ) t;
    end if;

    select min(i.deadline_vmp), max(i.deadline_vmp)
    into v_han_som, v_han_muon
    from public.vmp_visible_plan_items() i
    left join public.vmp_objects o on o.code = i.object_code
    where i.is_active
      and (v_tu is null or i.deadline_vmp between v_tu and v_den)
      and case r.loai
        when 'nguoi' then i.owner_name = any(r.ds)
        when 'nhom_viec' then i.work_group = any(r.ds)
        when 'loai_td' then i.validation_type = any(r.ds)
        when 'bo_phan' then o.department = any(r.ds)
        when 'khu_vuc' then o.area = any(r.ds)
        when 'line' then o.line = any(r.ds)
        when 'ten_doi_tuong' then o.name = any(r.ds)
        when 'ma' then i.object_code = any(r.ds)
        else false end;

    v_ho_tro := null;
    if r.loai = 'nguoi' then
      select count(*) into v_ho_tro from public.vmp_visible_plan_items()
      where is_active and secondary_owner = any(r.ds) and computed_status <> 'done'
        and (v_tu is null or deadline_vmp between v_tu and v_den);
    end if;

    if v_r.tong = 0 and coalesce(v_ho_tro,0) = 0 then
      if v_tu is not null then
        v_ds := v_ds || jsonb_build_array(jsonb_build_object(
          'loai', r.loai, 'gia_tri', v_ten, 'loc_thoi_gian', v_nhan_tg, 'tong', 0,
          'cau_tra_loi_goi_y', format('%s KHÔNG có hạng mục nào có hạn VMP trong %s — nói thẳng là không có, đừng suy đoán.', v_ten, v_nhan_tg)));
      end if;
      continue;
    end if;

    v_muc := null; v_nhan := null; v_ty := null;
    if r.loai = 'nguoi' and v_tu is not null then
      v_ai := r.ds[1];
      v_nhan := format('%s trong %s: chủ trì %s hạng mục — xong %s, đang làm %s, quá hạn %s, chưa bắt đầu %s.',
                       v_ai, v_nhan_tg, v_r.tong, v_r.hoan_thanh, v_r.dang_lam, v_r.qua_han, v_r.chua_bat_dau);
      if coalesce(v_ho_tro,0) > 0 then
        v_nhan := v_nhan || format(' Kèm vai hỗ trợ ở %s việc chưa xong trong cùng khoảng đó.', v_ho_tro);
      end if;
    elsif r.loai = 'nguoi' and coalesce(v_tb_mo,0) > 0 then
      v_ai := r.ds[1];
      v_ty := round(((v_r.tong - v_r.hoan_thanh)/v_tb_mo)::numeric, 2);
      v_muc := case when v_ty >= 1.5 then 'QUÁ TẢI RÕ RỆT'
                    when v_ty >= 1.2 then 'nặng hơn mặt bằng'
                    when v_ty >= 0.8 then 'ngang mặt bằng'
                    else 'NHẸ HƠN MẶT BẰNG — không quá tải' end;
      v_nhan := format('%s CHỦ TRÌ %s việc chưa xong, trong khi trung bình mỗi người chủ trì %s việc. Vậy về tải việc, %s là %s.',
                       v_ai, v_r.tong - v_r.hoan_thanh, v_tb_mo, v_ai, lower(v_muc));
      if coalesce(v_ho_tro,0) > 0 then
        v_nhan := v_nhan || format(' Ngoài ra %s còn đứng tên HỖ TRỢ ở %s việc chưa xong — vai hỗ trợ nhẹ hơn chủ trì nên không cộng vào tải chính.', v_ai, v_ho_tro);
      end if;
      v_nhan := v_nhan || case when v_r.qua_han > 0
        then format(' Còn chuyện trễ hạn thì tách biệt: %s đang có %s hạng mục quá hạn.', v_ai, v_r.qua_han)
        else format(' Và %s không có hạng mục nào quá hạn.', v_ai) end;
    else
      v_nhan := format('%s%s%s: tổng %s hạng mục, xong %s, đang làm %s, quá hạn %s, chưa bắt đầu %s.',
                       case when v_tu is not null then format('Trong %s, ', v_nhan_tg) else '' end,
                       case when r.sl > 1 then format('đã GỘP %s giá trị (', r.sl) else '' end,
                       v_ten || case when r.sl > 1 then ')' else '' end,
                       v_r.tong, v_r.hoan_thanh, v_r.dang_lam, v_r.qua_han, v_r.chua_bat_dau);
      if v_nguoi_mo is not null then
        v_nhan := v_nhan || format(' Người phụ trách: %s.', v_nguoi_mo);
      end if;
    end if;

    if v_han_som is not null then
      v_nhan := v_nhan || format(' Mốc thời gian theo kế hoạch: hạn sớm nhất %s, hạn muộn nhất %s.',
                                 to_char(v_han_som, 'DD/MM/YYYY'), to_char(v_han_muon, 'DD/MM/YYYY'));
    end if;

    -- MỐI LIÊN QUAN giữa các nhóm phân loại: nhóm việc nói rõ nó nằm ở
    -- khu nào / thuộc bộ phận nào; khu vực / bộ phận / line kể các nhóm
    -- việc bên trong — người hỏi lần theo quan hệ mà duyệt, khỏi đoán.
    if r.sl = 1 and r.loai = 'nhom_viec' and v_r.tong > 0 then
      select ' Nằm ở khu: '
             || coalesce(string_agg(distinct nullif(btrim(o.area), ''), ', '), '—')
             || '; bộ phận: '
             || coalesce((select string_agg(distinct nullif(btrim(o2.department), ''), ', ')
                          from public.vmp_visible_plan_items() i2
                          join public.vmp_objects o2 on o2.code = i2.object_code
                          where i2.is_active and i2.work_group = r.ds[1]), '—') || '.'
      into v_gom
      from public.vmp_visible_plan_items() i
      join public.vmp_objects o on o.code = i.object_code
      where i.is_active and i.work_group = r.ds[1];
      v_nhan := v_nhan || coalesce(v_gom, '');
      v_gom := null;
    elsif r.sl = 1 and r.loai in ('khu_vuc', 'bo_phan', 'line') and v_r.tong > 0 then
      select ' Các nhóm việc ở đây: ' || string_agg(nm || ' (' || c || ')', ', ' order by c desc) || '.'
      into v_gom
      from (
        select coalesce(nullif(btrim(i.work_group), ''), '(chưa phân nhóm)') as nm, count(*) as c
        from public.vmp_visible_plan_items() i
        join public.vmp_objects o on o.code = i.object_code
        where i.is_active and case r.loai
            when 'khu_vuc' then o.area = r.ds[1]
            when 'bo_phan' then o.department = r.ds[1]
            when 'line' then o.line = r.ds[1]
            else false end
        group by 1 order by 2 desc limit 6) x;
      v_nhan := v_nhan || coalesce(v_gom, '');
      v_gom := null;
    end if;

    if (v_tu is not null or v_liet_ke) and v_r.tong > 0 then
      select string_agg(x.nm || case when x.c > 1 then ' ×' || x.c else '' end, ', ' order by x.c desc, x.nm)
      into v_gom
      from (
        select coalesce(o.name, i.object_code) as nm, count(*) as c
        from public.vmp_visible_plan_items() i
        left join public.vmp_objects o on o.code = i.object_code
        where i.is_active
          and (v_tu is null or i.deadline_vmp between v_tu and v_den)
          and case r.loai
            when 'nguoi' then i.owner_name = any(r.ds)
            when 'nhom_viec' then i.work_group = any(r.ds)
            when 'loai_td' then i.validation_type = any(r.ds)
            when 'bo_phan' then o.department = any(r.ds)
            when 'khu_vuc' then o.area = any(r.ds)
            when 'line' then o.line = any(r.ds)
            when 'ten_doi_tuong' then o.name = any(r.ds)
            when 'ma' then i.object_code = any(r.ds)
            else false end
        group by 1 order by 2 desc, 1 limit 8
      ) x;
      select count(distinct coalesce(o.name, i.object_code)) into v_them
      from public.vmp_visible_plan_items() i
      left join public.vmp_objects o on o.code = i.object_code
      where i.is_active and (v_tu is null or i.deadline_vmp between v_tu and v_den)
        and case r.loai
          when 'nguoi' then i.owner_name = any(r.ds)
          when 'nhom_viec' then i.work_group = any(r.ds)
          when 'loai_td' then i.validation_type = any(r.ds)
          when 'bo_phan' then o.department = any(r.ds)
          when 'khu_vuc' then o.area = any(r.ds)
          when 'line' then o.line = any(r.ds)
          when 'ten_doi_tuong' then o.name = any(r.ds)
          when 'ma' then i.object_code = any(r.ds)
          else false end;
      if v_gom is not null then
        v_nhan := v_nhan || format(' Gồm: %s.', v_gom)
                || case when v_them > 8 then ' (danh sách đã cắt còn 8 tên nhiều việc nhất)' else '' end;
      end if;
    end if;

    -- Khoanh được MỘT thiết bị / mã cụ thể, ít dòng: kể CHI TIẾT từng hạng
    -- mục (loại — hạn — trạng thái) để "đã IQ chưa", "hạn OQ khi nào" trả
    -- lời được thẳng từ khối chốt. Đây là điều kiện để bỏ hẳn công cụ danh
    -- sách mẫu (nguồn của mọi vụ đếm-trên-mẫu-ra-số-sai).
    if r.sl = 1 and r.loai in ('ma', 'ten_doi_tuong') and v_r.tong between 1 and 12 then
      select string_agg(format('%s — hạn %s — %s', x.vt, x.hn, x.tt), '; ' order by x.vt, x.hn)
      into v_gom
      from (
        select i.validation_type as vt, to_char(i.deadline_vmp, 'DD/MM/YYYY') as hn,
               case i.computed_status when 'done' then 'đã xong' when 'over' then 'QUÁ HẠN'
                    when 'prog' then 'đang làm' else 'chưa bắt đầu' end as tt
        from public.vmp_visible_plan_items() i
        left join public.vmp_objects o on o.code = i.object_code
        where i.is_active
          and (v_tu is null or i.deadline_vmp between v_tu and v_den)
          and case r.loai when 'ma' then i.object_code = any(r.ds)
                          when 'ten_doi_tuong' then o.name = any(r.ds) else false end
      ) x;
      if v_gom is not null then
        v_nhan := v_nhan || format(' Chi tiết từng hạng mục: %s.', v_gom);
        v_gom := null;
      end if;
    end if;

    v_ds := v_ds || jsonb_build_array(jsonb_build_object(
      'loai', r.loai, 'gia_tri', v_ten, 'so_gia_tri_da_gop', r.sl,
      'danh_sach_gia_tri', to_jsonb(r.ds),
      'loc_thoi_gian', v_nhan_tg,
      'vai', case when r.loai='nguoi' then 'chủ trì' end,
      'tong', v_r.tong, 'hoan_thanh', v_r.hoan_thanh, 'dang_lam', v_r.dang_lam,
      'chua_bat_dau', v_r.chua_bat_dau, 'qua_han', v_r.qua_han,
      'dang_mo', v_r.tong - v_r.hoan_thanh, 'den_han_30_ngay', v_r.den_han_30_ngay,
      'dang_mo_trong_yeu_cao', v_r.dang_mo_trong_yeu_cao,
      'cong_ngay_con_lai', v_r.cong_ngay_con_lai,
      'dang_ho_tro_chua_xong', v_ho_tro,
      'trung_binh_moi_nguoi_chu_tri_dang_mo', case when r.loai='nguoi' and v_tu is null then v_tb_mo end,
      'so_lan_so_voi_trung_binh', v_ty, 'muc_tai_viec', v_muc,
      'nguoi_phu_trach', v_nguoi,
      'han_som_nhat', v_han_som, 'han_muon_nhat', v_han_muon,
      'cau_tra_loi_goi_y', v_nhan));
  end loop;

  -- Câu DANH MỤC không khoanh về đối tượng nào ("có những nhóm nào",
  -- "dữ liệu chia thành phần nào") -> đưa mục lục thật, đừng để trống
  -- rồi mô hình tự kể tên nhóm theo trí nhớ.
  if v_p ~ ' (nhom nao|nhom viec nao|nhung nhom|cac nhom|co nhung nhom|khu vuc nao|bo phan nao|chia thanh|muc luc|danh muc|loai nao|phan nao) '
     and not exists (select 1 from jsonb_array_elements(v_ds) t where t ->> 'tong' is not null) then
    -- GHÉP THÊM chứ không thay: câu viết lại hay khớp lơ lửng vài thực thể
    -- (toàn ca hỏi-lại) — mục lục vẫn phải có mặt để kể đủ danh sách thật.
    v_ds := v_ds || jsonb_build_array(jsonb_build_object(
      'loai', 'muc_luc', 'gia_tri', 'toàn bộ kế hoạch',
      'cau_tra_loi_goi_y', public.rpc_ai_muc_luc() ->> 'mo_ta'));
  end if;

  return jsonb_build_object('ok', true, 'so_nhom', jsonb_array_length(v_ds), 'thong_ke', v_ds,
    'luu_y', 'Số liệu ĐẾM THẬT trên toàn bảng — dùng thẳng, đừng cộng trừ lại. '
      || 'Phần tử KHÔNG có ô số (chỉ có cau_tra_loi_goi_y) nghĩa là chưa khoanh được — làm đúng theo câu đó, thường là hỏi lại. '
      || 'Phần tử có ô loc_thoi_gian nghĩa là đã đếm ĐÚNG trong khoảng thời gian đó. '
      || 'Với NGƯỜI: số chính là vai CHỦ TRÌ, vai hỗ trợ để riêng và KHÔNG cộng vào tải chính. '
      || 'Ô "muc_tai_viec" và "cau_tra_loi_goi_y" là KẾT LUẬN ĐÃ CHỐT bằng SQL — theo đó mà nói, không tự phán ngược. '
      || 'QUÁ HẠN là việc đã trôi qua hạn (quá khứ); QUÁ TẢI là ôm nhiều việc hơn sức (tương lai).');
end;
$$;


--
-- Name: FUNCTION "rpc_ai_thong_ke_loc"("p_cau_hoi" "text", "p_k" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_ai_thong_ke_loc"("p_cau_hoi" "text", "p_k" integer) IS 'Nhận câu hỏi, tự nhận ra người/nhóm/khu vực đang được hỏi rồi ĐẾM THẬT trên toàn bảng. Kèm mức trung bình để phân biệt quá tải với quá hạn.';


--
-- Name: rpc_ai_tim_nguoi_mo("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_tim_nguoi_mo"("p_question" "text", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_do  jsonb := public.rpc_ai_do_thuc_the(p_question, 'nguoi');
  v_n   integer := (v_do->>'so_khop')::int;
  v_ds  text;
begin
  if v_n = 0 then return jsonb_build_object('khop', false); end if;

  -- Đúng một người → trả hồ sơ luôn
  if v_n = 1 then
    return public.rpc_ai_ho_so_nguoi(v_do->'ket_qua'->0->>'gia_tri', p_year)
           || jsonb_build_object('khop', true, 'ten', v_do->'ket_qua'->0->>'gia_tri');
  end if;

  -- Nhiều người → hỏi lại, đừng đoán
  select string_agg('· **' || (e->>'gia_tri') || '**', E'\n')
  into v_ds from jsonb_array_elements(v_do->'ket_qua') e;

  return jsonb_build_object('khop', true, 'nhieu', true,
    'tra_loi', 'Bổn cung thấy có **' || v_n || ' người** hợp với cái tên ngươi nói 🌸'
      || E'\n\n' || v_ds || E'\n\n' || 'Ngươi nói rõ là ai để bổn cung soi cho đúng.');
end;
$$;


--
-- Name: rpc_ai_tra_loi_nhanh("text", integer, "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_tra_loi_nhanh"("p_question" "text", "p_year" integer DEFAULT NULL::integer, "p_nguoi" "jsonb" DEFAULT '{}'::"jsonb", "p_phien" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_gh   jsonb;
  v_hoi  text;
  v_dan  text := '';
  v_r    jsonb;
  v_hieu jsonb;
  v_dem  jsonb;
  v_kq   jsonb;
  v_mr   jsonb;
  v_rong text;
  v_ke   boolean;
begin
  v_gh  := public.rpc_ai_ghep_ngu_canh(p_question, p_phien);
  v_hoi := v_gh->>'cau_hoi';
  if (v_gh->>'ghep')::boolean then v_dan := v_gh->>'loi_dan'; end if;

  -- Xã giao / ngoài phạm vi — đặt trước mọi thứ, vì đây là câu đầu tiên
  -- người mới gõ và cũng là chỗ dễ làm cuộc trò chuyện chết nhất.
  -- Tâm sự đặt TRƯỚC xã giao: "mệt quá" không phải lời chào, mà cũng
  -- không phải câu tra số. Đặt sau thì nó rơi xuống nhánh AI và nhận về
  -- một bảng số liệu — đúng lúc người ta cần được nghe.
  v_r := public.rpc_ai_tam_su(v_hoi, coalesce(p_nguoi, '{}'::jsonb), p_year);
  if (v_r->>'khop')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), p_question, 'tam_su');
    return v_r || jsonb_build_object('vi_sao', 'Câu tâm sự — đồng cảm bằng lời, giúp bằng dữ liệu.');
  end if;

  v_r := public.rpc_ai_xa_giao(v_hoi, coalesce(p_nguoi, '{}'::jsonb));
  if (v_r->>'khop')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), p_question, v_r->>'y_dinh');
    return v_r || jsonb_build_object('vi_sao', 'Câu xã giao hoặc ngoài phạm vi.');
  end if;

  v_r := public.rpc_ai_ve_nguoi_hoi(v_hoi, coalesce(p_nguoi, '{}'::jsonb), p_year);
  if (v_r->>'khop')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), p_question, v_r->>'y_dinh');
    return v_r || jsonb_build_object('vi_sao', 'Câu về người dùng hoặc về trợ lý.');
  end if;

  -- Câu giải thích thì KHÔNG hỏi lại: lý lẽ chấm điểm giống nhau cho cả
  -- nhóm, hỏi lại chỉ tốn thêm một lượt bấm mà không đổi câu trả lời.
  v_ke := (public.rpc_ai_do_kho(v_hoi)->>'kieu') = 'giai_thich';

  v_r := case when (v_gh->>'ghep')::boolean or v_ke
              then jsonb_build_object('mo_ho', false)
              else public.rpc_ai_kiem_mo_ho(v_hoi) end;
  if (v_r->>'mo_ho')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh, cho_lam_ro)
      values (coalesce(p_phien, 'khach'), v_hoi, 'hoi_lai', true);
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'hoi_lai', 'nguon', 'sql',
      'tra_loi', v_r->>'cau_hoi_lai',
      'goi_y', (select jsonb_agg(e->>'ma') from jsonb_array_elements(v_r->'lua_chon') e),
      'vi_sao', 'Cụm "' || (v_r->>'cum') || '" khớp ' || (v_r->>'so_khop')
                || ' thiết bị mà câu hỏi về số liệu riêng của từng cái — hỏi lại cho chắc.');
  end if;

  -- MỞ RỘNG trước khi dò ý định: một ý có năm bảy cách nói, mà luật chỉ
  -- dò đúng một cách. Thêm từ chuẩn vào cuối, giữ nguyên chữ gốc để bước
  -- dò tên riêng không bị đụng vào.
  v_mr   := public.rpc_ai_mo_rong_cau_hoi(v_hoi);
  v_rong := coalesce(v_mr->>'cau_hoi', v_hoi);

  v_hieu := public.rpc_ai_hieu_cau_hoi(v_rong);

  -- Dò khớp NGUYÊN CỤM trượt thì thử dò MỘT PHẦN trước khi bỏ cuộc.
  -- "Huệ Nhi" phải ra "Phạm Huệ Nhi" — ngoài đời không ai gọi đủ họ tên.
  if (v_hieu->>'can_ai')::boolean and not (coalesce(v_hieu->'loc','{}'::jsonb) ? 'nguoi') then
    v_r := public.rpc_ai_tim_nguoi_mo(v_hoi, p_year);
    if (v_r->>'khop')::boolean then
      insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh, cho_lam_ro)
        values (coalesce(p_phien, 'khach'), v_hoi, 'ho_so_nguoi',
                coalesce((v_r->>'nhieu')::boolean, false));
      return jsonb_build_object(
        'khop', true, 'nguon', 'sql',
        'y_dinh', case when coalesce((v_r->>'nhieu')::boolean,false)
                       then 'hoi_lai' else 'ho_so_nguoi' end,
        'tra_loi', v_r->>'tra_loi',
        'goi_y', coalesce(v_r->'goi_y', '[]'::jsonb),
        'vi_sao', 'Gọi tên một phần — khớp được người trong danh mục.');
    end if;
  end if;

  if not (v_hieu->>'can_ai')::boolean then
    v_kq := public.rpc_ai_dung_cau_tra_loi(v_rong, v_hieu, p_year);
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), v_hoi, v_kq->>'y_dinh');
    return v_kq
      || jsonb_build_object('tra_loi', v_dan || (v_kq->>'tra_loi'))
      || jsonb_build_object('vi_sao', v_hieu->>'vi_sao')
      || jsonb_build_object('goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year));
  end if;

  v_dem := public.rpc_ai_cache_doc(v_hoi);
  if (v_dem->>'trung')::boolean then
    insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
      values (coalesce(p_phien, 'khach'), v_hoi, 'dem');
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'dem', 'nguon', 'dem',
      'tra_loi', v_dan || (v_dem->>'tra_loi'),
      'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
      'vi_sao', 'Đã hỏi trước đó, dữ liệu chưa đổi — dùng lại.');
  end if;

  insert into public.vmp_ai_hoi_thoai (phien, cau_hoi, y_dinh)
    values (coalesce(p_phien, 'khach'), v_hoi, 'chuyen_ai');
  return jsonb_build_object('khop', false, 'y_dinh', null, 'tra_loi', null,
    'cau_hoi_day_du', v_hoi,
    'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
    'vi_sao', v_hieu->>'vi_sao');
end;
$$;


--
-- Name: rpc_ai_trong_diem("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_trong_diem"("p_hieu" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  with loc as (select coalesce(p_hieu->'loc', '{}'::jsonb) l)
  select case
    when (select l ? 'ma' from loc) then jsonb_build_object(
      'bac', 1, 'loai', 'ma',
      'gia_tri', (select l->>'ma' from loc),
      'mo_ta', 'Câu hỏi xoay quanh đối tượng có mã '
               || (select l->>'ma' from loc)
               || '. Mọi chữ khác chỉ là cách nói.')
    when (select l ? 'ten_doi_tuong' from loc) then jsonb_build_object(
      'bac', 2, 'loai', 'ten_doi_tuong',
      'gia_tri', (select l->>'ten_doi_tuong' from loc),
      'mo_ta', 'Câu hỏi xoay quanh thiết bị "'
               || (select l->>'ten_doi_tuong' from loc) || '".')
    when (select l ? 'nguoi' from loc) then jsonb_build_object(
      'bac', 3, 'loai', 'nguoi',
      'gia_tri', (select l->>'nguoi' from loc),
      'mo_ta', 'Câu hỏi xoay quanh phần việc của '
               || (select l->>'nguoi' from loc) || '.')
    when (select l ? 'nhom_viec' from loc) then jsonb_build_object(
      'bac', 3, 'loai', 'nhom_viec',
      'gia_tri', (select l->>'nhom_viec' from loc),
      'mo_ta', 'Câu hỏi xoay quanh nhóm việc "'
               || (select l->>'nhom_viec' from loc) || '".')
    when (select l ? 'khu_vuc' from loc) then jsonb_build_object(
      'bac', 4, 'loai', 'khu_vuc',
      'gia_tri', (select l->>'khu_vuc' from loc),
      'mo_ta', 'Câu hỏi xoay quanh khu vực '
               || (select l->>'khu_vuc' from loc) || '.')
    when (select l ? 'bo_phan' from loc) then jsonb_build_object(
      'bac', 4, 'loai', 'bo_phan',
      'gia_tri', (select l->>'bo_phan' from loc),
      'mo_ta', 'Câu hỏi xoay quanh bộ phận '
               || (select l->>'bo_phan' from loc) || '.')
    else jsonb_build_object(
      'bac', 5, 'loai', 'toan_bo', 'gia_tri', null,
      'mo_ta', 'Câu hỏi không nhắm vào đối tượng nào cụ thể — hỏi trên toàn bộ kế hoạch.')
  end;
$$;


--
-- Name: rpc_ai_ve_nguoi_hoi("text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_ve_nguoi_hoi"("p_question" "text", "p_nguoi" "jsonb", "p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  q      text    := public.vmp_khong_dau(coalesce(p_question, ''));
  ten    text    := nullif(trim(coalesce(p_nguoi->>'ten', '')), '');
  email  text    := nullif(trim(coalesce(p_nguoi->>'email', '')), '');
  quyen  text    := coalesce(p_nguoi->>'quyen', '');
  bophan text    := nullif(trim(coalesce(p_nguoi->>'bo_phan', '')), '');
  v_tong integer; v_xong integer; v_tre integer;
  v_tl   text;
begin
  -- ---- VỀ CHÍNH VALI ----
  if q ~ '(ban la ai|em la ai|nguoi la ai|gioi thieu|ban lam duoc gi|em lam duoc gi|giup duoc gi|co the lam gi|chuc nang|lam duoc nhung gi)' then
    return jsonb_build_object('khop', true, 'y_dinh', 've_vali', 'nguon', 'sql',
      'tra_loi',
      'Bổn cung là **Vali** — trợ lý của hệ giám sát thẩm định VMP ở CPC1 Hà Nội 🌸' || E'\n\n'
      || 'Bổn cung lo cho ngươi được mấy việc này:' || E'\n'
      || '· Tra tiến độ — bao nhiêu hạng mục quá hạn, xong bao nhiêu phần trăm, sắp tới có gì đến hạn' || E'\n'
      || '· Tra theo người, theo bộ phận, theo khu vực, theo nhóm việc' || E'\n'
      || '· Tra một thiết bị cụ thể — ai phụ trách, hạn khi nào, điểm trọng yếu bao nhiêu' || E'\n'
      || '· Giải thích luật — cách tính hạn đề cương, cách chấm điểm trọng yếu, các yêu cầu GMP' || E'\n\n'
      || 'Có một điều bổn cung xin thưa trước: **bổn cung không bao giờ tự nghĩ ra con số**. '
      || 'Mọi con số bổn cung đọc thẳng từ database, câu nào không có dữ liệu thì bổn cung '
      || 'nói thật là không có, chứ bổn cung không đoán. Đây là hồ sơ GMP, một con '
      || 'số sai là thành sai lệch hồ sơ.',
      'goi_y', jsonb_build_array(
        'Tôi đang có quyền gì?',
        'Còn bao nhiêu hạng mục quá hạn?',
        'Deadline đề cương được tính thế nào?'));
  end if;

  if q ~ '(lay so o dau|so lieu tu dau|co chinh xac|tin duoc khong|co dung khong)' then
    return jsonb_build_object('khop', true, 'y_dinh', 've_nguon_so', 'nguon', 'sql',
      'tra_loi',
      'mọi con số bổn cung nói đều tính bằng SQL trên **toàn bộ bảng** trong '
      || 'Supabase, ngay lúc ngươi hỏi 🌸' || E'\n\n'
      || 'Bổn cung không lấy mẫu, không nhớ số cũ, và không tự cộng trừ. Nếu có câu '
      || 'nào bổn cung phải nhờ mô hình AI diễn đạt, thì con số trong đó vẫn do '
      || 'database đưa sang chứ mô hình không được tự tính.' || E'\n\n'
      || 'Ngươi cứ đối chiếu lại trên bảng bất cứ lúc nào — nếu lệch thì làm '
      || 'ơn báo em, vì lúc đó là dữ liệu có vấn đề chứ không phải bổn cung nói sai.');
  end if;

  -- ---- VỀ NGƯỜI HỎI ----
  if q ~ '(toi la ai|minh la ai|ta la ai|ten toi|toi ten gi|ta ten gi|biet toi la ai|toi ten la gi)' then
    if ten is null and email is null then
      return jsonb_build_object('khop', true, 'y_dinh', 've_toi', 'nguon', 'sql',
        'tra_loi', 'Bổn cung chưa nhận được thông tin đăng nhập của ngươi 🌸 '
                || 'Ngươi thử tải lại trang rồi hỏi bổn cung lần nữa cho bổn cung nhé.');
    end if;

    select count(*), count(*) filter (where computed_status = 'done'),
           count(*) filter (where computed_status = 'over')
      into v_tong, v_xong, v_tre
    from public.vmp_visible_plan_items()
    where year = v_year and is_active
      and (owner_name = ten or secondary_owner = ten);

    v_tl := 'Ngươi là **' || coalesce(ten, email) || '**'
         || case when bophan is not null then ', bộ phận ' || bophan else '' end
         || ' 🌸' || E'\n\n'
         || '· Quyền trên hệ thống: **'
         || case quyen when 'admin' then 'Quản trị — toàn quyền đọc, nhập, sửa, xoá, sinh timeline, chấm điểm'
                       when 'edit'  then 'Nhập liệu — cập nhật tiến độ và sửa danh mục'
                       when 'view'  then 'Chỉ đọc — xem được mọi màn nhưng không sửa'
                       else coalesce(nullif(quyen, ''), 'chưa rõ') end || '**';

    if v_tong > 0 then
      v_tl := v_tl || E'\n· Đang phụ trách **' || v_tong || ' hạng mục** trong kế hoạch '
                   || v_year || ' — xong ' || v_xong
                   || ' (' || round(100.0 * v_xong / nullif(v_tong, 0)) || '%)'
                   || case when v_tre > 0 then ', còn **' || v_tre || ' mục quá hạn** 😢'
                           else ', không có mục nào quá hạn 🎉' end;
    else
      v_tl := v_tl || E'\n· Hiện chưa có hạng mục nào ghi tên ngươi làm người phụ trách.';
    end if;

    return jsonb_build_object('khop', true, 'y_dinh', 've_toi', 'nguon', 'sql',
      'tra_loi', v_tl,
      'goi_y', case when v_tong > 0
        then jsonb_build_array(
               'Liệt kê hạng mục quá hạn của ' || ten,
               'Tỷ lệ hoàn thành theo người phụ trách',
               'Liệt kê hạng mục sắp đến hạn 30 ngày')
        else jsonb_build_array(
               'Còn bao nhiêu hạng mục chưa có QA phụ trách?',
               'Còn bao nhiêu hạng mục quá hạn?',
               'Tỷ lệ hoàn thành theo người phụ trách') end);
  end if;

  if q ~ '(quyen gi|co quyen|phan quyen|duoc lam gi|duoc phep|vai tro cua toi|toi lam duoc gi|ta lam duoc gi|ta co quyen)' then
    return jsonb_build_object('khop', true, 'y_dinh', 've_quyen', 'nguon', 'sql',
      'tra_loi',
      'Ngươi đang ở mức **'
      || case quyen when 'admin' then 'Quản trị'
                    when 'edit'  then 'Nhập liệu'
                    when 'view'  then 'Chỉ đọc'
                    else coalesce(nullif(quyen, ''), 'chưa xác định') end
      || '** 🌸' || E'\n\n'
      || case quyen
           when 'admin' then
             '· Xbổn cung toàn bộ, không giới hạn bộ phận' || E'\n'
             || '· Cập nhật tiến độ, sửa ngày và trạng thái' || E'\n'
             || '· Thêm / sửa / ngừng dùng đối tượng trong danh mục' || E'\n'
             || '· Sinh timeline cho năm mới, chấm lại điểm trọng yếu' || E'\n'
             || '· Xbổn cung nhật ký thao tác và màn sức khoẻ dữ liệu'
           when 'edit' then
             '· Xbổn cung toàn bộ' || E'\n'
             || '· Cập nhật tiến độ, sửa ngày và trạng thái' || E'\n'
             || '· Thêm / sửa đối tượng trong danh mục' || E'\n'
             || '· Không sinh timeline và không chấm lại điểm — hai việc đó cần quyền quản trị'
           else
             '· Xbổn cung được mọi màn hình và mọi báo cáo' || E'\n'
             || '· Không sửa được dữ liệu — nút cập nhật sẽ mờ đi' || E'\n'
             || '· Cần sửa thì nhờ người có quyền Nhập liệu hoặc Quản trị giúp'
         end
      || E'\n\nMọi thao tác ghi đều đi qua kiểm quyền ở phía máy chủ, nên trình '
      || 'duyệt không ghi thẳng vào bảng được đâu — kể cả khi ai đó sửa giao diện.',
      'goi_y', jsonb_build_array(
        'Tôi là ai?',
        'Còn bao nhiêu hạng mục quá hạn?',
        'Deadline đề cương được tính thế nào?'));
  end if;

  return jsonb_build_object('khop', false);
end;
$$;


--
-- Name: rpc_ai_xa_giao("text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_ai_xa_giao"("p_question" "text", "p_nguoi" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  q   text := public.vmp_khong_dau(coalesce(p_question, ''));
  ten text := nullif(trim(coalesce(p_nguoi->>'ten', '')), '');
  goi text := coalesce(ten, 'ngươi');
begin
  -- Chào hỏi
  if q ~ '^\s*(chao|hi|hello|xin chao|alo|halo|hey)\M' or q ~ '^\s*(chao|hi|hello)\s*$' then
    return jsonb_build_object('khop', true, 'y_dinh', 'xa_giao', 'nguon', 'sql',
      'tra_loi', 'Bổn cung nghe nè 🌸 ' || goi
        || ' hôm nay muốn hỏi chuyện gì trong kế hoạch thẩm định?' || E'\n\n'
        || 'Bổn cung nắm rõ tiến độ, người phụ trách, điểm trọng yếu và cả '
        || 'quy tắc tính hạn — cứ hỏi thẳng, không cần vòng vo.',
      'goi_y', jsonb_build_array('Còn bao nhiêu hạng mục quá hạn?',
                                 'Ta là ai?', 'Liệt kê hạng mục sắp đến hạn 30 ngày'));
  end if;

  -- Cảm ơn / khen
  if q ~ '(cam on|cam ơn|thanks|thank you|cuoi cung cung|gioi qua|hay qua|tuyet voi|tot lam)' then
    return jsonb_build_object('khop', true, 'y_dinh', 'xa_giao', 'nguon', 'sql',
      'tra_loi', 'Ừm, bổn cung nhận lời khen của ' || goi || ' 💕 '
        || 'Có gì cần tra nữa cứ gọi, bổn cung luôn ở đây.',
      'goi_y', jsonb_build_array('Còn bao nhiêu hạng mục quá hạn?',
                                 'Tỷ lệ hoàn thành theo người phụ trách'));
  end if;

  -- Hỏi thăm
  if q ~ '(khoe khong|co khoe|dao nay the nao|ban the nao|met khong|ban on khong)' then
    return jsonb_build_object('khop', true, 'y_dinh', 'xa_giao', 'nguon', 'sql',
      'tra_loi', 'Bổn cung vẫn ổn áp, cảm ơn ' || goi || ' đã hỏi 🌸 '
        || 'Chỉ hơi bận vì trong kế hoạch còn kha khá hạng mục quá hạn — '
        || goi || ' có muốn xem qua không?',
      'goi_y', jsonb_build_array('Còn bao nhiêu hạng mục quá hạn?',
                                 'Nhóm trọng yếu 7-9 đang tới đâu?'));
  end if;

  -- Xin lỗi / than phiền
  if q ~ '(xin loi|sorry|khong hieu y|ban tra loi sai|sai roi|nham roi)' then
    return jsonb_build_object('khop', true, 'y_dinh', 'xa_giao', 'nguon', 'sql',
      'tra_loi', 'Không sao. Nếu bổn cung trả lời chưa trúng ý thì ' || goi
        || ' nói rõ hơn giúp — ví dụ kèm mã thiết bị, tên người phụ trách, '
        || 'hoặc khu vực. Có mã là bổn cung tra ra ngay, không đoán mò.',
      'goi_y', jsonb_build_array('Thông tin thẩm định KNTB133',
                                 'Liệt kê hạng mục quá hạn của Tào Tiến Hoàn'));
  end if;

  -- Ngoài phạm vi rõ ràng
  if q ~ '(thoi tiet|bong da|nau an|chung khoan|bitcoin|phim|nhac|ca si|tinh yeu|dich benh|gia vang|xo so|tho tinh|ke chuyen cuoi)' then
    return jsonb_build_object('khop', true, 'y_dinh', 'ngoai_pham_vi', 'nguon', 'sql',
      'tra_loi', 'Ơ cái này ngoài cung bổn cung rồi nha 🌸 '
        || 'Bổn cung chỉ trông coi kế hoạch thẩm định VMP của CPC1 Hà Nội thôi.'
        || E'\n\n' || 'Nhưng trong phạm vi ấy thì bổn cung nắm khá chắc: tiến độ '
        || 'từng hạng mục, ai phụ trách cái gì, thiết bị nào sắp đến hạn, điểm '
        || 'trọng yếu chấm ra sao, và cả lý do đằng sau mỗi quy tắc.',
      'goi_y', jsonb_build_array('Bổn cung làm được những gì?',
                                 'Còn bao nhiêu hạng mục quá hạn?',
                                 'Deadline đề cương tính thế nào?'));
  end if;

  return jsonb_build_object('khop', false);
end;
$_$;


--
-- Name: rpc_alert_context("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_alert_context"("p_validation_code" "text", "p_limit" integer DEFAULT 5) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_item    vmp_plan_items;
  v_history JSONB;
  v_alerts  JSONB;
  v_dl_changes INT := 0;
  v_overdue_alerts INT := 0;
BEGIN
  SELECT * INTO v_item FROM public.vmp_visible_plan_items() WHERE validation_code = p_validation_code;
  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không tìm thấy hạng mục');
  END IF;

  -- Lịch sử thay đổi gần nhất (từ audit_logs) — trạng thái & deadline
  SELECT COALESCE(jsonb_agg(h ORDER BY h->>'at' DESC), '[]'::jsonb) INTO v_history
  FROM (
    SELECT jsonb_build_object(
      'at',      created_at,
      'action',  action::TEXT,
      'fields',  changed_fields,
      'reason',  change_reason,
      'by',      user_email
    ) AS h
    FROM audit_logs
    WHERE validation_code = p_validation_code
      AND action IN ('STATUS_CHANGE','DEADLINE_CHANGE','UPDATE','INSERT')
    ORDER BY created_at DESC
    LIMIT p_limit
  ) t;

  -- Số lần dời deadline (xu hướng trượt)
  SELECT COUNT(*) INTO v_dl_changes
  FROM audit_logs
  WHERE validation_code = p_validation_code AND action = 'DEADLINE_CHANGE';

  -- Cảnh báo đã gửi trước đây cho mã này
  SELECT COALESCE(jsonb_agg(a ORDER BY a->>'at' DESC), '[]'::jsonb) INTO v_alerts
  FROM (
    SELECT jsonb_build_object(
      'at',   COALESCE(sent_at, created_at),
      'type', notification_type,
      'to',   recipient_email,
      'status', status
    ) AS a
    FROM vmp_notifications
    WHERE plan_item_id = v_item.id
    ORDER BY COALESCE(sent_at, created_at) DESC
    LIMIT p_limit
  ) t;

  SELECT COUNT(*) INTO v_overdue_alerts
  FROM vmp_notifications
  WHERE plan_item_id = v_item.id AND notification_type = 'overdue';

  RETURN jsonb_build_object(
    'ok', true,
    'validation_code', p_validation_code,
    'now', jsonb_build_object(
      'object_code',  v_item.object_code,
      'type',         v_item.validation_type,
      'owner',        COALESCE(v_item.owner_name,'—'),
      'computed_status', v_item.computed_status::TEXT,
      'status_protocol', v_item.status_protocol::TEXT,
      'status_validation', v_item.status_validation::TEXT,
      'status_report', v_item.status_report::TEXT,
      'status_vmp',    v_item.status_vmp::TEXT,
      'deadline_protocol', v_item.deadline_protocol,
      'deadline_validation', v_item.deadline_validation,
      'deadline_report', v_item.deadline_report,
      'deadline_vmp',  v_item.deadline_vmp
    ),
    'history', v_history,
    'past_alerts', v_alerts,
    'trend', jsonb_build_object(
      'deadline_changes',  v_dl_changes,
      'overdue_alerts_sent', v_overdue_alerts,
      'slipping', (v_dl_changes >= 2 OR v_overdue_alerts >= 1)  -- gợi ý xu hướng trượt
    )
  );
END;
$$;


--
-- Name: rpc_apply_assignments(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_apply_assignments"("p_overwrite" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_hit  integer := 0;
  v_miss integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được phân công');
  end if;

  update public.vmp_source_objects s
     set owner_name   = r.owner_name,
         support_name = r.support_name,
         work_group   = r.work_group
  from (
    select distinct on (o.id) o.id as obj_id, ru.owner_name, ru.support_name, ru.work_group
    from public.vmp_source_objects o
    join public.vmp_assignment_rules ru on ru.is_active
      and (ru.match_kind    is null or o.object_kind = ru.match_kind)
      and (ru.match_name_re is null or o.object_name ~* ru.match_name_re)
      and (ru.match_areas   is null or o.area_code = any(ru.match_areas))
      and (ru.match_dept    is null or o.department = ru.match_dept)
    order by o.id, ru.priority
  ) r
  where s.id = r.obj_id
    and (p_overwrite or s.owner_name is null);
  get diagnostics v_hit = row_count;

  select count(*) into v_miss
  from public.vmp_source_objects where is_active and owner_name is null;

  -- Đưa người phụ trách xuống hạng mục timeline
  update public.vmp_plan_items p
     set owner_name = s.owner_name
  from public.vmp_source_objects s
  where s.object_code = p.object_code and s.owner_name is not null;

  return jsonb_build_object('ok', true, 'da_gan', v_hit, 'chua_gan', v_miss,
    'msg', 'Đã gán ' || v_hit || ' đối tượng · còn ' || v_miss || ' chưa có luật phù hợp');
end;
$$;


--
-- Name: rpc_apply_catalog_change("uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_apply_catalog_change"("p_change_id" "uuid", "p_reason" "text", "p_expected_timeline_revision" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_kind text;
  v_code text;
  v_old jsonb;
  v_new jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  select object_kind,object_code into v_kind,v_code
  from public.vmp_catalog_changes where id=p_change_id;
  if v_kind is not null then
    perform public.vmp_lock_catalog_object_v2(v_kind,v_code);
    perform public.vmp_lock_source_plan_relations(array[v_code]);
  end if;
  select old_data,new_data into v_old,v_new
  from public.vmp_catalog_changes where id=p_change_id for update;
  if found and (
       v_old?|array[
         'owner_person_id','support_person_id','owner_name','support_name'
       ] or v_new?|array[
         'owner_person_id','support_person_id','owner_name','support_name'
       ]
     ) then
    return jsonb_build_object('ok',false,
      'error_code','ACCESS_FIELDS_NOT_APPLICABLE',
      'error','Thay đổi timeline không được chứa quan hệ QA Source');
  end if;
  return public.rpc_apply_catalog_change__five_role_impl_20260824(
    p_change_id,p_reason,p_expected_timeline_revision);
end
$$;


--
-- Name: rpc_apply_catalog_change__five_role_impl_20260824("uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_apply_catalog_change__five_role_impl_20260824"("p_change_id" "uuid", "p_reason" "text", "p_expected_timeline_revision" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role  text := public.vmp_business_role(auth.uid());
  v_ch    public.vmp_catalog_changes%rowtype;
  v_obj   public.vmp_source_objects%rowtype;
  v_imp   jsonb;
  v_item  jsonb;
  v_year  integer := extract(year from now())::integer;
  v_freq  integer;
  v_moc   record;
  v_type  text;
  v_n     integer;
  v_tao   integer := 0;
  v_sua   integer := 0;
  v_dung  integer := 0;
  v_kq    jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
      and v_role is distinct from 'admin' and v_role is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được áp thay đổi vào timeline');
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Phải nhập lý do trước khi áp vào timeline');
  end if;

  -- Khoá dòng thay đổi: hai người bấm Áp cùng lúc thì người sau phải đợi,
  -- rồi thấy trạng thái 'applied' và nhận lại kết quả cũ.
  select * into v_ch from public.vmp_catalog_changes where id = p_change_id for update;
  if v_ch.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'CHANGE_NOT_FOUND',
      'error', 'Không tìm thấy thay đổi này');
  end if;

  -- Nguyên tắc 3: áp lần hai trả lại kết quả lần đầu, KHÔNG chạy lại.
  if v_ch.status = 'applied' then
    return coalesce(v_ch.apply_result, jsonb_build_object('ok', true, 'da_ap_truoc_do', true));
  end if;
  if v_ch.status = 'superseded' then
    return jsonb_build_object('ok', false, 'error_code', 'SUPERSEDED',
      'error', 'Thay đổi này đã bị một thay đổi mới hơn thay thế');
  end if;

  select * into v_obj from public.vmp_source_objects
  where object_kind = v_ch.object_kind and object_code = v_ch.object_code for update;
  if v_obj.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'OBJECT_NOT_FOUND',
      'error', 'Đối tượng đã bị xoá khỏi danh mục');
  end if;

  if p_expected_timeline_revision is not null
      and v_obj.timeline_revision is distinct from p_expected_timeline_revision then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Danh mục đã đổi tiếp sau khi bạn xem trước. Xem lại rồi áp.',
      'timeline_revision_hien_tai', v_obj.timeline_revision);
  end if;

  -- Tính lại ngay lúc áp thay vì tin bản preview đã lưu: giữa hai lần bấm
  -- có thể có người sửa tiếp, và áp theo số liệu cũ là áp sai.
  v_imp := public.rpc_preview_catalog_change(p_change_id);
  if coalesce((v_imp ->> 'ok')::boolean, false) is not true then
    return v_imp;
  end if;

  v_freq := coalesce(nullif(v_obj.frequency_months, 0), 12);

  -- ---- TẠO hạng mục còn thiếu ----
  /* Read model trước đã: vmp_plan_items.object_code có khoá ngoại tới
     vmp_objects.code, nên thiếu bước này thì insert hạng mục sẽ vỡ. Luật
     gốc trong rpc_generate_timeline cũng làm đúng thứ tự đó. */
  if jsonb_array_length(v_imp -> 'tao') > 0 then
    insert into public.vmp_objects (
      code, name, classification, department, area, line,
      criticality, frequency_months, is_active, created_by, updated_by)
    values (
      v_obj.object_code,
      coalesce(v_obj.object_name, v_obj.object_code),
      coalesce('{"Thiết bị":"tb","Quy trình":"qt","Kho":"kho",
                 "Hệ thống phụ trợ":"ht","Vận chuyển":"vc"}'::jsonb ->> v_obj.object_kind, 'tb'),
      v_obj.department,
      coalesce(v_obj.area_code, '—'),
      coalesce(v_obj.line, '—'),
      'medium', v_freq, true, auth.uid(), auth.uid())
    on conflict (code) do nothing;
  end if;

  for v_item in select * from jsonb_array_elements(v_imp -> 'tao') loop
    v_type := v_item ->> 'validation_type';
    v_n := (regexp_match(v_item ->> 'validation_code', '\.(\d+)-'))[1]::integer;
    select * into v_moc from public.vmp_tinh_moc_thoi_gian(
      v_year, v_obj.first_month, v_freq, v_n, v_obj.report_class, v_obj.workdays, v_type);

    insert into public.vmp_plan_items (
      id, validation_code, object_code, validation_type, year,
      report_class, effort_days,
      deadline_protocol, deadline_validation, deadline_report, deadline_vmp,
      departments, created_by, updated_by)
    values (
      v_item ->> 'validation_code', v_item ->> 'validation_code', v_obj.object_code,
      v_type, v_year, coalesce(v_obj.report_class, 'Không phụ thuộc'), v_obj.workdays,
      v_moc.deadline_protocol, v_moc.deadline_validation, v_moc.deadline_report, v_moc.deadline_vmp,
      public.vmp_parse_depts(coalesce(v_obj.department, '')), auth.uid(), auth.uid())
    on conflict (id) do nothing;   -- áp lại không nhân đôi
    v_tao := v_tao + 1;
  end loop;

  -- ---- SỬA deadline của hạng mục CHƯA ai đụng ----
  for v_item in select * from jsonb_array_elements(v_imp -> 'sua') loop
    v_type := split_part(v_item ->> 'validation_code', '-', 2);
    v_n := (regexp_match(v_item ->> 'validation_code', '\.(\d+)-'))[1]::integer;
    select * into v_moc from public.vmp_tinh_moc_thoi_gian(
      v_year, v_obj.first_month, v_freq, v_n, v_obj.report_class, v_obj.workdays, v_type);

    -- Điều kiện lặp lại ở đây KHÔNG thừa: giữa preview và update có thể có
    -- người vừa nhập ngày thực tế. Nguyên tắc 2 phải đúng tại thời điểm ghi.
    update public.vmp_plan_items
    set deadline_protocol   = v_moc.deadline_protocol,
        deadline_validation = v_moc.deadline_validation,
        deadline_report     = v_moc.deadline_report,
        deadline_vmp        = v_moc.deadline_vmp,
        report_class        = coalesce(v_obj.report_class, report_class),
        effort_days         = coalesce(v_obj.workdays, effort_days),
        updated_by = auth.uid(), updated_at = now()
    where validation_code = v_item ->> 'validation_code'
      and not public.vmp_hang_muc_da_co_tien_do(validation_code);
    if found then v_sua := v_sua + 1; end if;
  end loop;

  -- ---- DỪNG hạng mục tương lai khi đối tượng thôi thẩm định ----
  for v_item in select * from jsonb_array_elements(v_imp -> 'dung') loop
    update public.vmp_plan_items
    /* `not_applicable`, không phải `cancelled`: đối tượng thôi thuộc diện
       thẩm định là "không còn áp dụng", khác với một hạng mục bị huỷ vì lý
       do nghiệp vụ. Hai trạng thái đọc ra hai câu chuyện khác nhau khi tra
       ngược. Giá trị hợp lệ do chk_item_state quy định. */
    set is_active = false, item_state = 'not_applicable',
        updated_by = auth.uid(), updated_at = now()
    where validation_code = v_item ->> 'validation_code'
      and not public.vmp_hang_muc_da_co_tien_do(validation_code);
    if found then v_dung := v_dung + 1; end if;
  end loop;

  v_kq := jsonb_build_object(
    'ok', true, 'change_id', p_change_id, 'object_code', v_obj.object_code,
    'so_tao', v_tao, 'so_sua', v_sua, 'so_dung', v_dung,
    'so_giu_nguyen', jsonb_array_length(v_imp -> 'giu_nguyen'),
    'timeline_revision', v_obj.timeline_revision);

  update public.vmp_catalog_changes
  set status = 'applied', impact = v_imp, apply_result = v_kq,
      applied_by = auth.uid(), applied_at = now(), apply_reason = btrim(p_reason)
  where id = p_change_id;

  -- Đánh dấu đã đồng bộ. Từ đây banner "chờ áp" tắt.
  update public.vmp_source_objects
  set timeline_applied_revision = timeline_revision, updated_at = now()
  where id = v_obj.id;

  return v_kq;
end
$$;


--
-- Name: rpc_apply_catalog_change_v2("uuid", "text", integer, "jsonb", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_apply_catalog_change_v2"("p_change_id" "uuid", "p_reason" "text", "p_expected_timeline_revision" integer, "p_deadline_overrides" "jsonb", "p_override_confirmed" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_kind text;
  v_code text;
  v_old jsonb;
  v_new jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if coalesce(auth.role(),'')<>'service_role'
     and coalesce(public.vmp_business_role(auth.uid()),'')
         not in ('admin','qa_manager') then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ');
  end if;
  select object_kind,object_code into v_kind,v_code
  from public.vmp_catalog_changes where id=p_change_id;
  if v_kind is not null then
    perform public.vmp_lock_catalog_object_v2(v_kind,v_code);
    perform public.vmp_lock_source_plan_relations(array[v_code]);
  end if;
  select old_data,new_data into v_old,v_new
  from public.vmp_catalog_changes where id=p_change_id for update;
  if found and (
       v_old?|array[
         'owner_person_id','support_person_id','owner_name','support_name'
       ] or v_new?|array[
         'owner_person_id','support_person_id','owner_name','support_name'
       ]
     ) then
    return jsonb_build_object('ok',false,
      'error_code','ACCESS_FIELDS_NOT_APPLICABLE',
      'error','Thay đổi timeline không được chứa quan hệ QA Source');
  end if;
  return public.vmp_apply_catalog_change_v2_impl(
    p_change_id,p_reason,p_expected_timeline_revision,
    p_deadline_overrides,p_override_confirmed);
end
$$;


--
-- Name: rpc_apply_sheet_sync("text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_apply_sheet_sync"("p_op" "text", "p_validation_code" "text", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_current_code text;
  v_target_code text;
begin
  if p_op in ('update','soft_delete') then
    select item.object_code into v_current_code
    from public.vmp_plan_items item
    where item.validation_code=p_validation_code;
  end if;
  if p_op='insert' or (p_op='update' and coalesce(p_patch,'{}'::jsonb)?'object_code') then
    v_target_code:=nullif(p_patch->>'object_code','');
  end if;
  if p_op in ('insert','update') then
    perform public.vmp_lock_source_plan_relations(
      array[v_current_code,v_target_code]);
  end if;
  return public.rpc_apply_sheet_sync__source_impl_20260828(
    p_op,p_validation_code,p_patch);
end
$$;


--
-- Name: rpc_apply_sheet_sync__source_impl_20260828("text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_apply_sheet_sync__source_impl_20260828"("p_op" "text", "p_validation_code" "text", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count INT := 0;
BEGIN
  PERFORM set_config('app.audit_source', 'wf01_sheet_sync', true);
  PERFORM set_config('app.audit_reason', 'Đồng bộ tự động từ Google Sheet', true);

  IF p_op = 'insert' THEN
    INSERT INTO vmp_plan_items (
      id, validation_code, object_code, validation_type, report_class,
      owner_name, effort_days, criticality_score,
      deadline_vmp, deadline_protocol, deadline_report,
      actual_protocol_date, actual_validation_date, actual_report_date, actual_vmp_date,
      scheduled_date,
      status_protocol, status_validation, status_report, status_vmp,
      is_active, year
    )
    SELECT
      p_validation_code,
      p_validation_code,
      p_patch->>'object_code',
      COALESCE(p_patch->>'validation_type', 'PQ'),
      COALESCE(p_patch->>'report_class', 'Không phụ thuộc'),
      NULLIF(p_patch->>'owner_name', ''),
      NULLIF(p_patch->>'effort_days', '')::NUMERIC,
      NULLIF(p_patch->>'criticality_score', '')::INT,
      NULLIF(p_patch->>'deadline_vmp', '')::DATE,
      NULLIF(p_patch->>'deadline_protocol', '')::DATE,
      NULLIF(p_patch->>'deadline_report', '')::DATE,
      NULLIF(p_patch->>'actual_protocol_date', '')::DATE,
      NULLIF(p_patch->>'actual_validation_date', '')::DATE,
      NULLIF(p_patch->>'actual_report_date', '')::DATE,
      NULLIF(p_patch->>'actual_vmp_date', '')::DATE,
      NULLIF(p_patch->>'scheduled_date', '')::DATE,
      COALESCE((p_patch->>'status_protocol')::phase_status, 'not_started'),
      COALESCE((p_patch->>'status_validation')::phase_status, 'not_started'),
      COALESCE((p_patch->>'status_report')::phase_status, 'not_started'),
      COALESCE((p_patch->>'status_vmp')::phase_status, 'not_started'),
      TRUE,
      COALESCE((p_patch->>'year')::INT, EXTRACT(YEAR FROM NOW())::INT)
    ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'op', 'insert', 'affected', v_count);

  ELSIF p_op = 'update' THEN
    UPDATE vmp_plan_items SET
      object_code = CASE WHEN p_patch ? 'object_code' THEN p_patch->>'object_code' ELSE object_code END,
      validation_type = CASE WHEN p_patch ? 'validation_type' THEN p_patch->>'validation_type' ELSE validation_type END,
      report_class = CASE WHEN p_patch ? 'report_class' THEN p_patch->>'report_class' ELSE report_class END,
      owner_name = CASE WHEN p_patch ? 'owner_name' THEN NULLIF(p_patch->>'owner_name','') ELSE owner_name END,
      effort_days = CASE WHEN p_patch ? 'effort_days' THEN NULLIF(p_patch->>'effort_days','')::NUMERIC ELSE effort_days END,
      criticality_score = CASE WHEN p_patch ? 'criticality_score' THEN NULLIF(p_patch->>'criticality_score','')::INT ELSE criticality_score END,
      deadline_vmp = CASE WHEN p_patch ? 'deadline_vmp' THEN NULLIF(p_patch->>'deadline_vmp','')::DATE ELSE deadline_vmp END,
      deadline_protocol = CASE WHEN p_patch ? 'deadline_protocol' THEN NULLIF(p_patch->>'deadline_protocol','')::DATE ELSE deadline_protocol END,
      deadline_report = CASE WHEN p_patch ? 'deadline_report' THEN NULLIF(p_patch->>'deadline_report','')::DATE ELSE deadline_report END,
      actual_protocol_date = CASE WHEN p_patch ? 'actual_protocol_date' THEN NULLIF(p_patch->>'actual_protocol_date','')::DATE ELSE actual_protocol_date END,
      actual_validation_date = CASE WHEN p_patch ? 'actual_validation_date' THEN NULLIF(p_patch->>'actual_validation_date','')::DATE ELSE actual_validation_date END,
      actual_report_date = CASE WHEN p_patch ? 'actual_report_date' THEN NULLIF(p_patch->>'actual_report_date','')::DATE ELSE actual_report_date END,
      actual_vmp_date = CASE WHEN p_patch ? 'actual_vmp_date' THEN NULLIF(p_patch->>'actual_vmp_date','')::DATE ELSE actual_vmp_date END,
      scheduled_date = CASE WHEN p_patch ? 'scheduled_date' THEN NULLIF(p_patch->>'scheduled_date','')::DATE ELSE scheduled_date END,
      status_protocol = CASE WHEN p_patch ? 'status_protocol' THEN (p_patch->>'status_protocol')::phase_status ELSE status_protocol END,
      status_validation = CASE WHEN p_patch ? 'status_validation' THEN (p_patch->>'status_validation')::phase_status ELSE status_validation END,
      status_report = CASE WHEN p_patch ? 'status_report' THEN (p_patch->>'status_report')::phase_status ELSE status_report END,
      status_vmp = CASE WHEN p_patch ? 'status_vmp' THEN (p_patch->>'status_vmp')::phase_status ELSE status_vmp END,
      missing_from_sheet = CASE WHEN p_patch ? 'missing_from_sheet' THEN (p_patch->>'missing_from_sheet')::BOOLEAN ELSE missing_from_sheet END,
      missing_since = CASE WHEN p_patch ? 'missing_since' THEN
                       CASE WHEN p_patch->>'missing_since' IS NULL THEN NULL
                            ELSE (p_patch->>'missing_since')::TIMESTAMPTZ END
                       ELSE missing_since END,
      updated_at = NOW()
    WHERE validation_code = p_validation_code;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'op', 'update', 'affected', v_count);

  ELSIF p_op = 'soft_delete' THEN
    UPDATE vmp_plan_items
    SET missing_from_sheet = TRUE,
        missing_since = COALESCE(missing_since, NOW()),
        updated_at = NOW()
    WHERE validation_code = p_validation_code
      AND COALESCE(missing_from_sheet, FALSE) = FALSE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'op', 'soft_delete', 'affected', v_count);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'p_op không hợp lệ: ' || p_op);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'rpc_apply_sheet_sync lỗi (op=%, code=%): %', p_op, p_validation_code, SQLERRM;
    BEGIN
      INSERT INTO data_quality_issues (
        plan_item_id, object_code, issue_type, severity, message, detected_at
      ) VALUES (
        p_validation_code, NULL, 'sync_error', 'error',
        'rpc_apply_sheet_sync(' || p_op || ',' || p_validation_code || '): ' || SQLERRM,
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object('ok', false, 'op', p_op, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;


--
-- Name: rpc_business_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_business_roles"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_business_roles__five_role_impl_20260824(); end $$;


--
-- Name: rpc_business_roles__five_role_impl_20260824(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_business_roles__five_role_impl_20260824"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_my_role text;
begin
  select role::text into v_my_role
  from public.profiles
  where id = auth.uid() and coalesce(is_active, true);

  if v_my_role is null or not public.duoc_phep('admin_users', v_my_role) then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ admin đọc được bảng vai nghiệp vụ');
  end if;

  return jsonb_build_object(
    'ok', true,
    'nguoi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.id,
        'email', p.email,
        'business_role', public.vmp_business_role(p.id),
        -- Có lý do vì sao KHÔNG giải được: màn quản trị hiện thẳng lý do
        -- thay vì để ô vai trống không giải thích.
        'unresolved_reason', public.vmp_business_role_unresolved_reason(p.id)
      ) order by p.full_name)
      from public.profiles p
    ), '[]'::jsonb)
  );
end;
$$;


--
-- Name: FUNCTION "rpc_business_roles__five_role_impl_20260824"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_business_roles__five_role_impl_20260824"() IS 'Vai nghiệp vụ (vmp_business_role) của mọi tài khoản + lý do khi không giải được. Chỉ admin. Dùng cho ô chọn vai ở màn Cấu hình hệ thống.';


--
-- Name: rpc_catalog_history("jsonb", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_catalog_history"("p_filters" "jsonb" DEFAULT '{}'::"jsonb", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role text;
  v_lim integer;
  v_off integer;
  v_table text;
  v_record text;
  v_action text;
  v_from timestamptz;
  v_to timestamptz;
  v_bad text[];
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;

  v_role := public.vmp_business_role(auth.uid());
  if v_role not in ('admin', 'qa_manager') or v_role is null then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Không có quyền xem lịch sử danh mục');
  end if;

  v_lim := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off := greatest(coalesce(p_offset, 0), 0);
  v_table := nullif(btrim(coalesce(p_filters ->> 'table_name', '')), '');
  v_record := nullif(btrim(coalesce(p_filters ->> 'record_id', '')), '');
  v_action := nullif(btrim(coalesce(p_filters ->> 'action', '')), '');
  v_from := nullif(btrim(coalesce(p_filters ->> 'from', '')), '')::timestamptz;
  v_to := nullif(btrim(coalesce(p_filters ->> 'to', '')), '')::timestamptz;

  select array_agg(key order by key) into v_bad
  from jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) key
  where key <> all(array['table_name','record_id','action','from','to']::text[]);
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error_code', 'FILTER_NOT_ALLOWED',
      'error', 'Bộ lọc không được phép: ' || array_to_string(v_bad, ', '));
  end if;

  select count(*) into v_total
  from public.audit_logs a
  where a.table_name = any(array[
      'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep'
    ]::text[])
    and (v_table is null or a.table_name = v_table)
    and (v_record is null or a.record_id = v_record)
    and (v_action is null or a.action::text = v_action)
    and (v_from is null or a.created_at >= v_from)
    and (v_to is null or a.created_at <= v_to);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id),
                  '[]'::jsonb)
    into v_rows
  from (
    select a.id, a.created_at,
           coalesce(a.user_name, a.user_email, '(không rõ)') as actor,
           coalesce(a.effective_business_role,
             'Không xác định (dữ liệu cũ)') as effective_business_role,
           a.action::text as action, a.table_name, a.record_id,
           a.changed_fields, a.change_reason as reason, a.source,
           (a.old_data is not null or a.new_data is not null) as has_detail
    from public.audit_logs a
    where a.table_name = any(array[
        'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep'
      ]::text[])
      and (v_table is null or a.table_name = v_table)
      and (v_record is null or a.record_id = v_record)
      and (v_action is null or a.action::text = v_action)
      and (v_from is null or a.created_at >= v_from)
      and (v_to is null or a.created_at <= v_to)
    order by a.created_at desc, a.id
    limit v_lim offset v_off
  ) x;

  return jsonb_build_object('ok', true, 'total', v_total,
    'limit', v_lim, 'offset', v_off, 'history', v_rows);
end
$$;


--
-- Name: rpc_catalog_history_detail("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_catalog_history_detail"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role text;
  v_row public.audit_logs%rowtype;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;

  v_role := public.vmp_business_role(auth.uid());
  if v_role not in ('admin', 'qa_manager') or v_role is null then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Không có quyền xem chi tiết lịch sử danh mục');
  end if;

  if p_id is not null then
    select * into v_row
    from public.audit_logs a
    where a.id = p_id
      and a.table_name = any(array[
        'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep'
      ]::text[]);
  end if;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND',
      'error', 'Không tìm thấy dòng lịch sử này');
  end if;

  return jsonb_build_object('ok', true, 'history', jsonb_build_object(
    'id', v_row.id,
    'created_at', v_row.created_at,
    'actor', coalesce(v_row.user_name, v_row.user_email, '(không rõ)'),
    'effective_business_role', coalesce(v_row.effective_business_role,
      'Không xác định (dữ liệu cũ)'),
    'action', v_row.action::text,
    'table_name', v_row.table_name,
    'record_id', v_row.record_id,
    'changed_fields', v_row.changed_fields,
    'reason', v_row.change_reason,
    'source', v_row.source,
    'old_data', v_row.old_data,
    'new_data', v_row.new_data));
end
$$;


--
-- Name: rpc_check_data_quality(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_check_data_quality"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_check_data_quality__five_role_impl_20260824(p_year); end $$;


--
-- Name: rpc_check_data_quality__five_role_impl_20260824(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_check_data_quality__five_role_impl_20260824"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  issues JSONB := '[]'::jsonb;
BEGIN
  -- 1. Thiếu deadline VMP
  SELECT issues || COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'type', 'missing_deadline', 'severity', 'error',
    'msg', 'Thiếu deadline VMP cho hạng mục ' || id
  )), '[]'::jsonb) INTO issues
  FROM public.vmp_visible_plan_items() WHERE year = p_year AND deadline_vmp IS NULL AND is_active = TRUE;

  -- 2. Hoàn thành nhưng thiếu ngày
  SELECT issues || COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'type', 'done_no_date', 'severity', 'error',
    'msg', 'Trạng thái hoàn thành nhưng thiếu ngày: ' || id
  )), '[]'::jsonb) INTO issues
  FROM public.vmp_visible_plan_items()
  WHERE year = p_year AND status_vmp = 'completed' AND actual_vmp_date IS NULL AND is_active = TRUE;

  -- 3. Thiếu owner
  SELECT issues || COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'type', 'missing_owner', 'severity', 'warning',
    'msg', 'Thiếu người phụ trách QA: ' || id
  )), '[]'::jsonb) INTO issues
  FROM public.vmp_visible_plan_items()
  WHERE year = p_year AND (owner_name IS NULL OR owner_name = '' OR owner_name = '—') AND is_active = TRUE;

  -- 4. Lệch pha: thẩm định xong nhưng hồ sơ chưa
  SELECT issues || COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'type', 'mismatch_val_doc', 'severity', 'warning',
    'msg', 'Thẩm định xong nhưng hồ sơ chưa hoàn thành: ' || id
  )), '[]'::jsonb) INTO issues
  FROM public.vmp_visible_plan_items()
  WHERE year = p_year AND status_validation = 'completed'
    AND status_report != 'completed' AND is_active = TRUE;

  RETURN issues;
END;
$$;


--
-- Name: rpc_cleanup_orphan_source_assignment_resolutions("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_cleanup_orphan_source_assignment_resolutions"("p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_cleaned integer := 0;
  v_deleted jsonb := '[]'::jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chỉ Admin hoặc service được dọn mapping nguồn đã hết'
    );
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do dọn mapping');
  end if;

  with deleted as (
    delete from public.vmp_source_assignment_resolutions resolution
    where not exists (
      select 1
      from public.vmp_item_assignments assignment
      where assignment.is_active
        and assignment.validation_code = resolution.validation_code
        and assignment.assignment_kind = resolution.assignment_kind
        and assignment.source = resolution.source
        and public.vmp_normalize_person_name(
          coalesce(assignment.source_text, assignment.staff_name)
        ) = resolution.normalized_source_name
    )
    returning jsonb_build_object(
      'validation_code', resolution.validation_code,
      'assignment_kind', resolution.assignment_kind,
      'source', resolution.source,
      'normalized_source_name', resolution.normalized_source_name,
      'performer_id', resolution.performer_id
    ) as mapping
  )
  select count(*)::integer, coalesce(jsonb_agg(mapping), '[]'::jsonb)
  into v_cleaned, v_deleted
  from deleted;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor,
    'CONFIG_CHANGE',
    'vmp_source_assignment_resolutions',
    'orphan_cleanup',
    jsonb_build_object('mappings', v_deleted),
    jsonb_build_object('cleaned', v_cleaned),
    btrim(p_reason),
    'source_resolution_cleanup',
    array['orphan_mappings']
  );

  return jsonb_build_object(
    'ok', true,
    'cleaned', v_cleaned,
    'deleted', v_deleted
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$$;


--
-- Name: rpc_commit_catalog_import("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_commit_catalog_import"("p_batch_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  perform public.vmp_lock_source_plan_relations(null);
  return public.rpc_commit_catalog_import__five_role_impl_20260824(
    p_batch_id,p_reason);
end
$$;


--
-- Name: rpc_commit_catalog_import__five_role_impl_20260824("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_commit_catalog_import__five_role_impl_20260824"("p_batch_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor   uuid := auth.uid();
  v_role    text := public.vmp_business_role(auth.uid());
  v_batch   public.vmp_catalog_import_batches%rowtype;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  r         record;
  v_ket     jsonb;
  v_tao     integer := 0;
  v_sua     integer := 0;
  v_cho     text[] := array[]::text[];
  v_result  jsonb;
begin
  select * into v_batch from public.vmp_catalog_import_batches
  where id = p_batch_id
  for update;

  if v_batch.id is null or v_batch.uploaded_by is distinct from v_actor then
    return jsonb_build_object('ok', false, 'error_code', 'BATCH_NOT_FOUND',
      'error', 'Không có lô nhập nào của bạn mang mã này');
  end if;

  -- Idempotent: lô đã ghi trả NGUYÊN kết quả cũ, không ghi thêm lần nào.
  if v_batch.status = 'committed' then
    return v_batch.committed_result;
  end if;
  if v_batch.status <> 'validated' then
    return jsonb_build_object('ok', false, 'error_code', 'BATCH_NOT_COMMITTABLE',
      'error', 'Lô đang ở trạng thái ' || v_batch.status || ' — không ghi được');
  end if;
  if v_batch.so_loi > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'BATCH_HAS_ERRORS',
      'error', 'Lô còn ' || v_batch.so_loi || ' dòng lỗi — sửa hết rồi staging lại');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Ghi cả lô thì phải có lý do của lô');
  end if;

  for r in
    select * from public.vmp_catalog_import_rows
    where batch_id = p_batch_id and classification in ('moi', 'sua')
    order by row_number
  loop
    if v_batch.dataset = 'source_objects' then
      -- Dòng "mới" mà nay đã có người tạo trước: dữ liệu nền đã đổi so với
      -- lúc xem trước. Không ghi đè mù — hỏng CẢ LÔ để người dùng staging
      -- lại trên nền mới. (Với dòng "sua", khoá lạc quan của writer lo.)
      if r.classification = 'moi' and exists (
        select 1 from public.vmp_source_objects
        where object_kind = r.object_kind and object_code = r.business_key
      ) then
        raise exception 'IMPORT_STALE: % đã được tạo sau khi staging — staging lại lô',
          r.business_key;
      end if;
      v_ket := public.rpc_save_catalog_object(
        r.object_kind, r.business_key, r.patch,
        coalesce(r.row_reason, v_reason),
        case when r.classification = 'sua' then r.expected_version else null end);
    else
      if r.classification = 'moi' and exists (
        select 1 from public.vmp_products_gmp where bfo_code = r.business_key
      ) then
        raise exception 'IMPORT_STALE: % đã được tạo sau khi staging — staging lại lô',
          r.business_key;
      end if;
      v_ket := public.rpc_save_product_gmp(
        r.business_key, r.patch,
        coalesce(r.row_reason, v_reason),
        case when r.classification = 'sua' then r.expected_version else null end);
    end if;

    if coalesce((v_ket ->> 'ok')::boolean, false) is not true then
      -- RAISE để mọi dòng đã ghi trong lô này lùi lại — tất cả hoặc không gì.
      raise exception 'IMPORT_ROW_FAILED: dòng % (%): %',
        r.row_number, r.business_key,
        coalesce(v_ket ->> 'error', v_ket ->> 'error_code', 'không rõ');
    end if;

    if r.classification = 'moi' then v_tao := v_tao + 1; else v_sua := v_sua + 1; end if;
    if nullif(v_ket ->> 'change_id', '') is not null then
      v_cho := v_cho || (v_ket ->> 'change_id');
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok', true, 'batch_id', p_batch_id,
    'created', v_tao, 'updated', v_sua, 'unchanged', v_batch.so_khong_doi,
    'pending_change_ids', to_jsonb(v_cho));

  update public.vmp_catalog_import_batches
  set status = 'committed', batch_reason = v_reason,
      committed_result = v_result, committed_at = now()
  where id = p_batch_id;

  insert into public.audit_logs (
    id, user_id, action, table_name, record_id,
    new_data, change_reason, source, effective_business_role)
  values (
    gen_random_uuid(), v_actor, 'UPDATE'::audit_action,
    'vmp_catalog_import_batches', p_batch_id::text,
    v_result, v_reason, 'rpc_commit_catalog_import', v_role);

  return v_result;
end
$$;


--
-- Name: rpc_create_plan_item("text", "text", integer, integer, "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_create_plan_item"("p_object_code" "text", "p_validation_type" "text", "p_year" integer DEFAULT NULL::integer, "p_occurrence" integer DEFAULT 1, "p_patch" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  perform public.vmp_lock_source_plan_relations(array[p_object_code]);
  return public.rpc_create_plan_item__five_role_impl_20260824(
    p_object_code,p_validation_type,p_year,p_occurrence,p_patch);
end
$$;


--
-- Name: rpc_create_plan_item__five_role_impl_20260824("text", "text", integer, integer, "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_create_plan_item__five_role_impl_20260824"("p_object_code" "text", "p_validation_type" "text", "p_year" integer DEFAULT NULL::integer, "p_occurrence" integer DEFAULT 1, "p_patch" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  v_code text;
  v_res  jsonb;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được thêm hạng mục');
  end if;
  if nullif(btrim(coalesce(p_object_code,'')),'') is null
     or nullif(btrim(coalesce(p_validation_type,'')),'') is null then
    return jsonb_build_object('ok', false, 'error', 'Thiếu mã đối tượng hoặc loại thẩm định');
  end if;
  if p_occurrence < 1 or p_occurrence > 99 then
    return jsonb_build_object('ok', false, 'error', 'Lần thẩm định phải trong khoảng 1..99');
  end if;
  if not exists (select 1 from public.vmp_objects where code = btrim(p_object_code)) then
    return jsonb_build_object('ok', false, 'error',
      'Chưa có đối tượng "' || btrim(p_object_code) || '" trong danh mục');
  end if;

  v_code := btrim(p_object_code) || '/' || v_year::text || '.'
            || lpad(p_occurrence::text, 2, '0') || '-' || btrim(p_validation_type);

  if exists (select 1 from public.vmp_plan_items where validation_code = v_code) then
    return jsonb_build_object('ok', false, 'error', 'Mã thẩm định đã tồn tại: ' || v_code);
  end if;

  insert into public.vmp_plan_items (
    id, validation_code, object_code, validation_type, year, created_by, updated_by)
  values (v_code, v_code, btrim(p_object_code), btrim(p_validation_type), v_year,
          auth.uid(), auth.uid());

  if p_patch is not null and p_patch <> '{}'::jsonb then
    v_res := public.rpc_update_progress(v_code, p_patch, 'Tạo hạng mục mới từ dashboard');
    if (v_res ->> 'ok')::boolean is not true then
      raise exception 'Tạo được hạng mục nhưng cập nhật chi tiết thất bại: %', v_res ->> 'error';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'validation_code', v_code, 'msg', 'Đã tạo hạng mục');
end;
$$;


--
-- Name: rpc_dashboard_kpi(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_dashboard_kpi"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_dashboard_kpi__five_role_impl_20260824(p_year); end $$;


--
-- Name: rpc_dashboard_kpi__five_role_impl_20260824(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_dashboard_kpi__five_role_impl_20260824"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    result JSONB;
BEGIN
    WITH items AS (
        SELECT * FROM public.vmp_visible_plan_items() WHERE year = p_year AND is_active = TRUE
    ),
    val_stats AS (
        SELECT
            COUNT(*) FILTER (WHERE computed_status = 'done') AS done,
            COUNT(*) FILTER (WHERE computed_status = 'over') AS over,
            COUNT(*) FILTER (WHERE computed_status NOT IN ('done', 'over')) AS todo,
            COUNT(*) AS total
        FROM items
    ),
    doc_stats AS (
        SELECT
            COUNT(*) FILTER (WHERE is_doc_complete = TRUE) AS done,
            COUNT(*) FILTER (WHERE NOT is_doc_complete AND deadline_report < CURRENT_DATE) AS over,
            COUNT(*) - COUNT(*) FILTER (WHERE is_doc_complete = TRUE)
                     - COUNT(*) FILTER (WHERE NOT is_doc_complete AND deadline_report < CURRENT_DATE) AS todo,
            COUNT(*) AS total
        FROM items
    )
    SELECT jsonb_build_object(
        'validation', (SELECT row_to_json(val_stats.*) FROM val_stats),
        'documentation', (SELECT row_to_json(doc_stats.*) FROM doc_stats),
        'mismatch_count', (SELECT COUNT(*) FROM items WHERE has_mismatch IS NOT NULL),
        'updated_at', NOW()
    ) INTO result;

    RETURN result;
END;
$$;


--
-- Name: rpc_deactivate_object("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_deactivate_object"("p_code" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF not public.duoc_phep('edit_catalog', v_role::text) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Chỉ admin/QA manager được ẩn danh mục');
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cần nhập lý do khi ẩn đối tượng');
  END IF;

  PERFORM set_config('app.audit_source', 'dashboard_inventory', true);
  PERFORM set_config('app.audit_reason', p_reason, true);

  UPDATE vmp_objects
  SET is_active = FALSE, updated_by = auth.uid(), updated_at = NOW()
  WHERE code = p_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không tìm thấy đối tượng: ' || p_code);
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', p_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;


--
-- Name: rpc_delete_alert_recipient("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_delete_alert_recipient"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_role text; v_n integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Không có quyền xoá');
  end if;
  delete from public.vmp_alert_recipients where id = p_id;
  get diagnostics v_n = row_count;
  return case when v_n > 0
    then jsonb_build_object('ok', true, 'msg', 'Đã xoá người nhận')
    else jsonb_build_object('ok', false, 'error', 'Không tìm thấy bản ghi') end;
end;
$$;


--
-- Name: rpc_delete_performer("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_delete_performer"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when coalesce(auth.role(), '') = 'service_role'
      or public.vmp_current_session_is_active() then jsonb_build_object(
        'ok', false,
        'error_code', 'LEGACY_RPC_DISABLED',
        'error', 'Đường xóa người thực hiện cũ đã ngừng; hãy ngừng hoạt động hồ sơ qua danh bạ phân quyền'
      )
    else public.vmp_session_denial()
  end
$$;


--
-- Name: rpc_delete_plan_item("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_delete_plan_item"("p_validation_code" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_object_code text;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  select item.object_code into v_object_code
  from public.vmp_plan_items item
  where item.validation_code=p_validation_code;
  if v_object_code is not null then
    perform public.vmp_lock_source_plan_relations(array[v_object_code]);
  end if;
  return public.rpc_delete_plan_item__five_role_impl_20260824(
    p_validation_code,p_reason);
end
$$;


--
-- Name: rpc_delete_plan_item__five_role_impl_20260824("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_delete_plan_item__five_role_impl_20260824"("p_validation_code" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_n    integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được xoá hạng mục');
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập lý do xoá');
  end if;

  update public.vmp_plan_items
     set is_active = false, item_state = 'cancelled', deleted_at = now(),
         delete_reason = btrim(p_reason), updated_by = auth.uid()
   where validation_code = p_validation_code and is_active = true;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error',
      'Không tìm thấy hạng mục đang hoạt động: ' || p_validation_code);
  end if;
  return jsonb_build_object('ok', true, 'msg', 'Đã huỷ hạng mục');
end;
$$;


--
-- Name: rpc_delete_product_gmp("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_delete_product_gmp"("p_bfo_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_role text; v_n integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Không có quyền xoá');
  end if;
  delete from public.vmp_products_gmp where bfo_code = p_bfo_code;
  get diagnostics v_n = row_count;
  return case when v_n > 0
    then jsonb_build_object('ok', true, 'msg', 'Đã xoá sản phẩm')
    else jsonb_build_object('ok', false, 'error', 'Không tìm thấy sản phẩm') end;
end;
$$;


--
-- Name: rpc_delete_source_object("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_delete_source_object"("p_object_kind" "text", "p_object_code" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_n    integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được ngừng dùng danh mục');
  end if;
  if nullif(btrim(coalesce(p_reason,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập lý do');
  end if;

  -- ngừng sử dụng (mềm), KHÔNG xoá vật lý: hạng mục timeline vẫn tham chiếu mã này
  update public.vmp_source_objects
     set is_active = false, edited_on_web = true, updated_by = auth.uid(),
         note = coalesce(note || ' | ', '') || 'Ngừng dùng: ' || btrim(p_reason)
   where object_kind = p_object_kind and object_code = p_object_code;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy đối tượng');
  end if;
  return jsonb_build_object('ok', true, 'msg', 'Đã ngừng sử dụng đối tượng');
end;
$$;


--
-- Name: rpc_delete_source_row("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_delete_source_row"("p_source_tab" "text", "p_row_number" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_delete_source_row__five_role_impl_20260824(p_source_tab, p_row_number); end $$;


--
-- Name: rpc_delete_source_row__five_role_impl_20260824("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_delete_source_row__five_role_impl_20260824"("p_source_tab" "text", "p_row_number" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_role text; v_n integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Không có quyền xoá');
  end if;
  delete from public.vmp_source_rows
   where source_tab = p_source_tab and row_number = p_row_number;
  get diagnostics v_n = row_count;
  return case when v_n > 0
    then jsonb_build_object('ok', true, 'msg', 'Đã xoá dòng')
    else jsonb_build_object('ok', false, 'error', 'Không tìm thấy dòng') end;
end;
$$;


--
-- Name: rpc_delete_staff_email("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_delete_staff_email"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_role text; v_n integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Không có quyền xoá');
  end if;
  delete from public.vmp_staff_emails where id = p_id;
  get diagnostics v_n = row_count;
  return case when v_n > 0
    then jsonb_build_object('ok', true, 'msg', 'Đã xoá nhân sự')
    else jsonb_build_object('ok', false, 'error', 'Không tìm thấy bản ghi') end;
end;
$$;


--
-- Name: rpc_due_alerts(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_due_alerts"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer, "p_soon_days" integer DEFAULT 7) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_due_alerts__five_role_impl_20260824(p_year, p_soon_days); end $$;


--
-- Name: rpc_due_alerts__five_role_impl_20260824(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_due_alerts__five_role_impl_20260824"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer, "p_soon_days" integer DEFAULT 7) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'due_date')
    FROM (
      SELECT jsonb_build_object(
        'validation_code', pi.validation_code,
        'object_code',     pi.object_code,
        'object_name',     o.name,
        'validation_type', pi.validation_type,
        'department',      o.department,
        'owner_name',      COALESCE(pi.owner_name, '—'),
        'stage',           st.stage,
        'due_date',        st.due_date,
        'days_left',       (st.due_date - v_today),
        'alert_type',      CASE WHEN st.due_date < v_today THEN 'overdue'
                                ELSE 'due_soon' END
      ) AS x
      FROM public.vmp_visible_plan_items() pi
      JOIN vmp_objects o ON o.code = pi.object_code
      CROSS JOIN LATERAL (
        SELECT s.stage, s.due_date
        FROM (
          VALUES
            ('Đề cương',  pi.deadline_protocol,  pi.status_protocol),
            ('Thẩm định', pi.deadline_validation, pi.status_validation),
            ('Báo cáo',   pi.deadline_report,    pi.status_report),
            ('VMP',       pi.deadline_vmp,       pi.status_vmp)
        ) AS s(stage, due_date, st)
        WHERE s.due_date IS NOT NULL
          AND s.st <> 'completed'
        ORDER BY s.due_date ASC
        LIMIT 1
      ) st
      WHERE pi.is_active = TRUE
        AND COALESCE(pi.missing_from_sheet, FALSE) = FALSE
        AND o.is_active = TRUE
        AND pi.status_vmp <> 'completed'
        -- S1-F FIX: không gửi cảnh báo cho mã Không áp dụng / Đã hủy
        AND COALESCE(pi.item_state, 'active') = 'active'
        -- S2-H FIX: chấp nhận hạng mục năm hiện tại HOẶC deadline cross-year
        AND (pi.year = p_year OR st.due_date BETWEEN v_today - 30 AND v_today + p_soon_days + 30)
        AND st.due_date <= v_today + p_soon_days
    ) q
  ), '[]'::jsonb);
END;
$$;


--
-- Name: rpc_export_source_objects("text", "text", "jsonb", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_export_source_objects"("p_object_kind" "text", "p_search" "text", "p_filters" "jsonb", "p_cursor" "jsonb", "p_limit" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_cursor_code text;
  v_cursor_id uuid;
  v_rows jsonb;
  v_total integer;
  v_has_more boolean;
  v_next jsonb;
begin
  if not public.vmp_is_active_session(v_actor) then
    return jsonb_build_object('ok',false,'error_code','ACCOUNT_DISABLED',
      'error','Tài khoản không hoạt động');
  end if;
  if v_role is null then
    return jsonb_build_object('ok',false,'error_code','ROLE_UNRESOLVED',
      'error','Không xác định được vai trò nghiệp vụ');
  end if;
  if p_limit is null or p_limit<1 or p_limit>500 then
    return jsonb_build_object('ok',false,'error_code','INVALID_LIMIT',
      'error','Giới hạn xuất phải từ 1 đến 500');
  end if;
  if not public.vmp_source_filters_valid(p_filters) then
    return jsonb_build_object('ok',false,'error_code','INVALID_FILTERS',
      'error','Bộ lọc phải là JSON object');
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object'
       or jsonb_typeof(p_cursor->'object_code')<>'string'
       or jsonb_typeof(p_cursor->'id')<>'string'
       or (p_cursor->>'id') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok',false,'error_code','INVALID_CURSOR',
        'error','Con trỏ không hợp lệ');
    end if;
    v_cursor_code:=p_cursor->>'object_code';
    v_cursor_id:=(p_cursor->>'id')::uuid;
  end if;

  if p_cursor is not null and not exists (
    select 1
    from public.vmp_source_objects source_object
    where source_object.id=v_cursor_id
      and source_object.object_code=v_cursor_code
      and source_object.is_active
      and public.vmp_can_view_source_object(v_actor,source_object.id)
      and (p_object_kind is null or source_object.object_kind=p_object_kind)
      and public.vmp_source_object_matches_filters(
            source_object,p_search,p_filters)
  ) then
    return jsonb_build_object('ok',false,'error_code','CURSOR_EXPIRED',
      'error','Con trỏ không còn hiệu lực');
  end if;

  with filtered as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and public.vmp_can_view_source_object(v_actor,source_object.id)
      and (p_object_kind is null or source_object.object_kind=p_object_kind)
      and public.vmp_source_object_matches_filters(
            source_object,p_search,p_filters)
  ), page_plus_one as (
    select filtered.* from filtered
    where p_cursor is null
       or (filtered.object_code,filtered.id)>(v_cursor_code,v_cursor_id)
    order by object_code,id limit p_limit+1
  ), returned as (
    select page_plus_one.* from page_plus_one
    order by object_code,id limit p_limit
  )
  select
    coalesce((select jsonb_agg(to_jsonb(returned) order by object_code,id)
              from returned),'[]'::jsonb),
    (select count(*) from filtered),
    (select count(*) from page_plus_one)>p_limit,
    case when (select count(*) from page_plus_one)>p_limit then (
      select jsonb_build_object('object_code',object_code,'id',id)
      from returned order by object_code desc,id desc limit 1
    ) else null end
  into v_rows,v_total,v_has_more,v_next;

  insert into public.audit_logs(
    user_id,action,table_name,record_id,new_data,change_reason,source,
    effective_business_role
  ) values (
    v_actor,'EXPORT','vmp_source_objects',coalesce(p_object_kind,'*'),
    jsonb_build_object('returned',jsonb_array_length(v_rows),
      'authorized_total',v_total,'has_more',v_has_more),
    'Xuất danh mục Source theo phạm vi được phép','source_access_export',v_role
  );

  return jsonb_build_object('ok',true,'rows',v_rows,
    'authorized_total',v_total,'next_cursor',v_next);
end
$_$;


--
-- Name: rpc_generate_timeline(integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_generate_timeline"("p_year" integer DEFAULT NULL::integer, "p_commit" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if coalesce(p_commit,false) then
    perform public.vmp_lock_source_plan_relations(null);
  end if;
  return public.rpc_generate_timeline__five_role_impl_20260824(
    p_year,p_commit);
end
$$;


--
-- Name: rpc_generate_timeline__five_role_impl_20260824(integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_generate_timeline__five_role_impl_20260824"("p_year" integer DEFAULT NULL::integer, "p_commit" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  K_CLASS   constant jsonb := '{"Thiết bị":"tb","Quy trình":"qt","Kho":"kho",
                                "Hệ thống phụ trợ":"ht","Vận chuyển":"vc"}'::jsonb;
  K_REPORT  constant jsonb := '{"không phụ thuộc":2,"hóa lý":2,
                                "nhiễm khuẩn":7,"vô khuẩn":16}'::jsonb;

  v_role      text;
  v_year      integer := coalesce(p_year, extract(year from now())::integer);
  o           record;
  v_types     text[];
  v_type      text;
  v_freq      integer;
  v_times     integer;
  v_n         integer;
  v_code      text;
  v_tm        integer;
  v_month     integer;
  v_yr        integer;
  v_t         date;
  v_report    date;
  v_end       date;
  v_start     date;
  v_proto     date;
  v_nbc       integer;
  v_created   integer := 0;
  v_skipped   integer := 0;
  v_partial   integer := 0;
  v_notyet    integer := 0;     -- chưa tới chu kỳ (tần suất > 12 tháng)
  v_last_year integer;
  v_rows      jsonb := '[]'::jsonb;
  v_chuaday   jsonb := '[]'::jsonb;
  v_missing   text[];
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('generate_timeline', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sinh timeline');
  end if;

  for o in
    select * from public.vmp_source_objects
     where validate_flag = 'y' and is_active
     order by object_kind, object_code
  loop
    v_freq := coalesce(nullif(o.frequency_months, 0), 12);

    -- ---- MỚI: tần suất > 12 tháng thì phải đủ chu kỳ mới sinh lại ----
    if v_freq > 12 then
      select max(extract(year from pi.deadline_vmp))::integer
        into v_last_year
      from public.vmp_plan_items pi
      where pi.object_code = o.object_code
        and pi.deadline_vmp is not null;

      if v_last_year is not null and v_year < v_last_year + (v_freq / 12) then
        v_notyet := v_notyet + 1;
        v_chuaday := v_chuaday || jsonb_build_object(
          'object_code', o.object_code,
          'object_name', o.object_name,
          'tan_suat_thang', v_freq,
          'moc_gan_nhat', v_last_year,
          'ky_ke_tiep', v_last_year + (v_freq / 12));
        continue;                       -- chưa tới chu kỳ, bỏ qua đối tượng
      end if;
    end if;

    if o.object_kind in ('Thiết bị', 'Hệ thống phụ trợ') then
      if o.year_ref = v_year
         and not exists (select 1 from public.vmp_plan_items pi
                          where pi.object_code = o.object_code
                            and pi.validation_type = 'IQ')
      then v_types := array['DQ','FAT/SAT','IQ','OQ','PQ'];
      else v_types := array['OQ','PQ'];
      end if;
    elsif o.object_kind = 'Quy trình' then v_types := array['PV'];
    elsif o.object_kind = 'Kho'       then v_types := array['GSP'];
    else                                   v_types := array['GDP'];
    end if;

    -- Tần suất ≤ 12 tháng: nhiều lần trong năm. Trên 12 tháng: 1 lần, và đã
    -- được cổng chu kỳ ở trên quyết định có sinh năm nay hay không.
    v_times := greatest(1, 12 / v_freq);

    foreach v_type in array v_types loop
      for v_n in 1 .. v_times loop
        v_code := o.object_code || '/' || v_year::text || '.'
                  || lpad(v_n::text, 2, '0') || '-' || v_type;

        if exists (select 1 from public.vmp_plan_items where validation_code = v_code) then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        v_t := null; v_report := null; v_end := null; v_start := null; v_proto := null;
        v_missing := '{}';

        if o.first_month is null then
          v_missing := array_append(v_missing, 'Tháng thẩm định đầu tiên');
        else
          v_tm    := o.first_month + (v_n - 1) * v_freq;
          v_month := ((v_tm - 1) % 12) + 1;
          v_yr    := v_year + ((v_tm - 1) / 12);
          v_t      := (make_date(v_yr, v_month, 1) + interval '1 month' - interval '1 day')::date;
          v_report := v_t - 5;

          if v_type in ('IQ','OQ') then
            v_nbc := 2;
          else
            v_nbc := (K_REPORT ->> lower(coalesce(o.report_class, '')))::integer;
          end if;

          if v_nbc is null then
            v_missing := array_append(v_missing, 'Phân loại báo cáo');
          else
            v_end := v_report - v_nbc;
            if o.workdays is null then
              v_missing := array_append(v_missing, 'Số ngày công thẩm định thực tế');
            else
              v_start := v_end - o.workdays;
              v_proto := v_start - 60;
            end if;
          end if;
        end if;

        if array_length(v_missing, 1) is not null then
          v_partial := v_partial + 1;
        end if;

        v_rows := v_rows || jsonb_build_object(
          'validation_code',     v_code,
          'object_code',         o.object_code,
          'object_kind',         o.object_kind,
          'validation_type',     v_type,
          'lan',                 v_n,
          'deadline_vmp',        v_t,
          'deadline_report',     v_report,
          'deadline_validation', v_end,
          'deadline_protocol',   v_proto,
          'thieu_du_lieu',       to_jsonb(v_missing));

        if p_commit then
          insert into public.vmp_objects (
            code, name, classification, department, area, line,
            criticality, frequency_months, is_active, created_by, updated_by)
          values (
            o.object_code,
            coalesce(o.object_name, o.object_code),
            coalesce(K_CLASS ->> o.object_kind, 'tb'),
            o.department,
            coalesce(o.area_code, '—'),
            coalesce(o.line, '—'),
            'medium',
            v_freq,
            true, auth.uid(), auth.uid())
          on conflict (code) do nothing;

          insert into public.vmp_plan_items (
            id, validation_code, object_code, validation_type, year,
            report_class, effort_days,
            deadline_protocol, deadline_validation, deadline_report, deadline_vmp,
            departments, created_by, updated_by)
          values (
            v_code, v_code, o.object_code, v_type, v_year,
            coalesce(o.report_class, 'Không phụ thuộc'), o.workdays,
            v_proto, v_end, v_report, v_t,
            public.vmp_parse_depts(coalesce(o.department, '')),
            auth.uid(), auth.uid());

          v_created := v_created + 1;
        end if;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok',              true,
    'nam',             v_year,
    'da_ghi',          p_commit,
    'so_tao_moi',      case when p_commit then v_created else jsonb_array_length(v_rows) end,
    'so_bo_qua',       v_skipped,
    'so_thieu_moc',    v_partial,
    'so_chua_toi_chu_ky', v_notyet,
    'chua_toi_chu_ky', v_chuaday,
    'danh_sach',       v_rows,
    'msg', case when p_commit
                then 'Đã sinh ' || v_created || ' hạng mục'
                else 'Xem trước ' || jsonb_array_length(v_rows)
                     || ' hạng mục sẽ được tạo. Gọi lại với p_commit := true để ghi.' end);
end;
$$;


--
-- Name: rpc_get_audit_logs(integer, integer, "text", "text", "text", "text", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_get_audit_logs"("p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0, "p_table_name" "text" DEFAULT NULL::"text", "p_action" "text" DEFAULT NULL::"text", "p_user_email" "text" DEFAULT NULL::"text", "p_record_id" "text" DEFAULT NULL::"text", "p_from_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to_date" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  result jsonb;
  v_role text;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;

  v_role := public.vmp_business_role(auth.uid());
  if v_role is null or v_role not in ('admin', 'qa_manager') then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'FORBIDDEN',
      'error', 'Không có quyền xem nhật ký kiểm toán'
    );
  end if;

  select jsonb_build_object(
    'total', case
      when p_table_name is null and p_action is null
       and p_user_email is null and p_record_id is null
       and p_from_date is null and p_to_date is null
      then greatest((select reltuples::bigint from pg_class
                     where oid = 'public.audit_logs'::regclass), 0)
      else (
        select count(*) from public.audit_logs
        where (p_table_name is null or table_name = p_table_name)
          and (p_action is null or action::text = p_action)
          and (p_user_email is null
            or user_email ilike '%' || p_user_email || '%')
          and (p_record_id is null or record_id = p_record_id)
          and (p_from_date is null or created_at >= p_from_date)
          and (p_to_date is null or created_at <= p_to_date)
      )
    end,
    'total_uoc_luong',
      p_table_name is null and p_action is null and p_user_email is null
      and p_record_id is null and p_from_date is null and p_to_date is null,
    'logs', (
      select coalesce(jsonb_agg(row_to_json(l.*) order by l.created_at desc),
                      '[]'::jsonb)
      from (
        select id, user_email, action::text, table_name, record_id,
               old_data, new_data, change_reason, source, created_at
        from public.audit_logs
        where (p_table_name is null or table_name = p_table_name)
          and (p_action is null or action::text = p_action)
          and (p_user_email is null
            or user_email ilike '%' || p_user_email || '%')
          and (p_record_id is null or record_id = p_record_id)
          and (p_from_date is null or created_at >= p_from_date)
          and (p_to_date is null or created_at <= p_to_date)
        order by created_at desc
        limit p_limit offset p_offset
      ) l
    )
  ) into result;

  return result;
end
$$;


--
-- Name: rpc_get_item_version("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_get_item_version"("p_validation_code" "text") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT version FROM public.vmp_visible_plan_items() WHERE validation_code = p_validation_code LIMIT 1;
$$;


--
-- Name: rpc_get_missing_items(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_get_missing_items"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_get_missing_items__five_role_impl_20260824(p_year); end $$;


--
-- Name: rpc_get_missing_items__five_role_impl_20260824(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_get_missing_items__five_role_impl_20260824"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'validation_code', validation_code,
      'object_code', object_code,
      'validation_type', validation_type,
      'owner_name', owner_name,
      'missing_since', missing_since,
      'is_active', is_active
    ) ORDER BY missing_since DESC), '[]'::jsonb)
    FROM public.vmp_visible_plan_items()
    WHERE year = p_year AND missing_from_sheet = TRUE
  );
END;
$$;


--
-- Name: rpc_get_vmp_dashboard(integer, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_get_vmp_dashboard"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer, "p_include_missing" boolean DEFAULT false, "p_include_cancelled" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;

  with visible_source as materialized (
    select source_object.*,master_object.name master_name,
           master_object.classification master_classification,
           master_object.department master_department
    from public.vmp_source_objects source_object
    left join public.vmp_objects master_object
      on master_object.code=source_object.object_code
     and master_object.is_active
    where source_object.is_active
      and (auth.role()='service_role'
        or public.vmp_can_view_source_object(auth.uid(),source_object.id))
  ), visible_items as materialized (
    select item.*,source_object.master_name object_name,
           source_object.master_classification classification,
           source_object.master_department obj_dept,
           source_object.area_code area,source_object.line,
           source_object.frequency_months
    from public.vmp_plan_items item
    join visible_source source_object
      on source_object.object_code=item.object_code
    where item.year=p_year and item.is_active
      and (p_include_missing or not item.missing_from_sheet)
      and (p_include_cancelled
        or coalesce(item.item_state,'active')<>'cancelled')
  )
  select jsonb_build_object(
    'objects',coalesce((select jsonb_agg(jsonb_build_object(
      'code',source_object.object_code,
      'name',source_object.object_name,
      'cls',coalesce(source_object.master_classification,
                     public.vmp_ma_phan_loai(source_object.object_kind)),
      'cls_ten',source_object.object_kind,
      'dept',coalesce(source_object.master_department,
                      (public.vmp_parse_depts(source_object.department))[1],
                      'qa'),
      'dept_ten',source_object.department,
      'area',source_object.area_code,'line',source_object.line,
      'crit',case when source_object.criticality_score>=7 then 'Cao'
                  when source_object.criticality_score>=4 then 'TB'
                  when source_object.criticality_score is not null then 'Thấp'
                  else 'TB' end,
      'score',source_object.criticality_score,
      'owner',source_object.owner_name,
      'freq',source_object.frequency_months,
      'need',source_object.validate_flag='y'
    ) order by source_object.object_code) from visible_source source_object),
      '[]'::jsonb),
    'activities',coalesce((select jsonb_agg(jsonb_build_object(
      'id',item.validation_code,
      'validation_code',item.validation_code,
      'code',item.object_code,
      'name',item.object_name,
      'vtype',item.validation_type,
      'dept',item.obj_dept,
      'cls',coalesce(item.classification,public.vmp_ma_phan_loai(
        (select source.object_kind from visible_source source
         where source.object_code=item.object_code limit 1))),
      'depts',to_jsonb(coalesce(
        nullif(item.departments,array[]::text[]),
        nullif(public.vmp_parse_depts(item.department_text),array[]::text[]),
        array[coalesce(item.obj_dept,'qa')])),
      'exec_depts',to_jsonb(coalesce(
        item.execution_departments,
        public.vmp_parse_depts(nullif(trim(
          item.source_sheet_data->>'bo_phan_thuc_hien_goc'),'')),
        '{}'::text[])),
      'owner',coalesce(nullif(trim(item.owner_name),''),'—'),
      'support',nullif(trim(item.secondary_owner),''),
      'group',item.work_group,'effort',item.effort_days,
      'score',item.criticality_score,
      'crit',case when item.criticality_score>=7 then 'Cao'
                  when item.criticality_score>=4 then 'TB'
                  when item.criticality_score is not null then 'Thấp'
                  else 'TB' end,
      'target',item.deadline_vmp,'st',item.computed_status::text,
      'state',coalesce(item.item_state,'active'),'version',item.version,
      'dep',item.report_class,'docDone',item.is_doc_complete,
      'mismatch',item.has_mismatch,
      '_raw',jsonb_build_object(
        'version',item.version,'ma',item.object_code,
        'loai_td',item.validation_type,'qa',item.owner_name,
        'owner_person_id',item.owner_person_id,
        'email_qa',(select performer.email
          from public.vmp_performers performer
          where performer.id=item.owner_person_id and performer.is_active
            and performer.email is not null
            and performer.email not like '%.local'),
        'ho_tro',item.secondary_owner,'nhom_viec',item.work_group,
        'diem_trong_yeu',item.criticality_score,'bo_phan',item.obj_dept,
        'bo_phan_goc',item.department_text,
        'bo_phan_thuc_hien_goc',nullif(trim(
          item.source_sheet_data->>'bo_phan_thuc_hien_goc'),''),
        'phan_loai',item.classification,'khu_vuc',item.area,
        'line',item.line,'tan_suat',item.frequency_months,
        'dl_vmp',item.deadline_vmp,'dl_de_cuong',item.deadline_protocol,
        'dl_tham_dinh',item.deadline_validation,
        'dl_bao_cao',item.deadline_report,
        'tt_de_cuong',item.status_protocol::text,
        'tt_tham_dinh',item.status_validation::text,
        'tt_bao_cao',item.status_report::text,'tt_vmp',item.status_vmp::text,
        'tt_de_cuong_goc',item.status_protocol_text,
        'tt_tham_dinh_goc',item.status_validation_text,
        'tt_bao_cao_goc',item.status_report_text,
        'tt_vmp_goc',item.status_vmp_text,
        'ngay_de_cuong',item.actual_protocol_date,
        'ngay_tham_dinh',item.actual_validation_date,
        'ngay_bao_cao',item.actual_report_date,
        'ngay_vmp',item.actual_vmp_date,'lich_td',item.scheduled_date,
        'scheduled_at',item.scheduled_at,
        'state',coalesce(item.item_state,'active'))
    ) order by item.validation_code) from visible_items item),'[]'::jsonb),
    'source','supabase',
    'updated_at',greatest(
      coalesce((select max(updated_at) from visible_source),'epoch'::timestamptz),
      coalesce((select max(updated_at) from visible_items),'epoch'::timestamptz)),
    'authorization_revision',coalesce((select revision
      from public.vmp_authorization_revision where singleton),0),
    'year',p_year
  ) into v_result;
  return v_result;
end
$$;


--
-- Name: rpc_get_vmp_dashboard__five_role_impl_20260824(integer, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_get_vmp_dashboard__five_role_impl_20260824"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer, "p_include_missing" boolean DEFAULT false, "p_include_cancelled" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  result jsonb;
begin
  with visible_items as (
    select pi.*, o.name as object_name, o.classification, o.department as obj_dept,
           o.area, o.line, o.frequency_months
    from public.vmp_visible_plan_items() pi
    join public.vmp_objects o on pi.object_code = o.code
    where pi.year = p_year
      and pi.is_active = true
      and o.is_active = true
      and (p_include_missing or pi.missing_from_sheet = false)
      and (p_include_cancelled or coalesce(pi.item_state, 'active') <> 'cancelled')
  )
  select jsonb_build_object(
    'objects', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', s.object_code, 'name', s.object_name,
        -- Mã ngắn, KHÔNG phải tên dài — frontend tra bảng CLS bằng mã.
        'cls', coalesce(o.classification, public.vmp_ma_phan_loai(s.object_kind)),
        'cls_ten', s.object_kind,
        -- Mã ngắn, KHÔNG phải tên dài — frontend lọc theo mã.
        'dept', coalesce(o.department,
                         (public.vmp_parse_depts(s.department))[1], 'qa'),
        'dept_ten', s.department,
        'area', s.area_code, 'line', s.line,
        'crit', case when s.criticality_score >= 7 then 'Cao'
                     when s.criticality_score >= 4 then 'TB'
                     when s.criticality_score is not null then 'Thấp'
                     else 'TB' end,
        'score', s.criticality_score,
        'owner', s.owner_name,
        'freq', s.frequency_months,
        'need', s.validate_flag = 'y'
      ) order by s.object_code), '[]'::jsonb)
      from public.vmp_source_objects s
      left join public.vmp_objects o
        on o.code = s.object_code and o.is_active
      where s.is_active
        and (
          public.item_permissions_mode() = 'preview'
          or auth.role() = 'service_role'
          or public.is_admin()
          or exists (
            select 1
            from public.vmp_visible_plan_items() visible_object_item
            where visible_object_item.object_code = s.object_code
              and visible_object_item.year = p_year
              and visible_object_item.is_active
              and (p_include_missing or not visible_object_item.missing_from_sheet)
              and (
                p_include_cancelled
                or coalesce(visible_object_item.item_state, 'active') <> 'cancelled'
              )
          )
        )
    ),
    'activities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.validation_code,
        'validation_code', i.validation_code,
        'code', i.object_code,
        'name', i.object_name,
        'vtype', i.validation_type,
        'dept', i.obj_dept,
        -- Mang thẳng phân loại theo hạng mục, KHÔNG để frontend phải tra
        -- ngược qua bảng objects. Một chỗ nối ít đi là một kiểu hỏng ít đi:
        -- trước đây objects hỏng định dạng thì mọi bộ lọc chết theo mà
        -- không có dấu hiệu gì.
        'cls', coalesce(i.classification,
                        public.vmp_ma_phan_loai(
                          (select s.object_kind from public.vmp_source_objects s
                           where s.object_code = i.object_code limit 1))),
        'depts', to_jsonb(coalesce(
          nullif(i.departments, array[]::text[]),
          nullif(public.vmp_parse_depts(i.department_text), array[]::text[]),
          array[coalesce(i.obj_dept, 'qa')]
        )),
        'exec_depts', to_jsonb(coalesce(
          i.execution_departments,
          public.vmp_parse_depts(nullif(trim(i.source_sheet_data ->> 'bo_phan_thuc_hien_goc'), '')),
          '{}'::text[]
        )),
        'owner', coalesce(nullif(trim(i.owner_name), ''), '—'),
        'support', nullif(trim(i.secondary_owner), ''),
        'group', i.work_group,
        'effort', i.effort_days,
        'score', i.criticality_score,
        'crit', case when i.criticality_score >= 7 then 'Cao'
                     when i.criticality_score >= 4 then 'TB'
                     when i.criticality_score is not null then 'Thấp'
                     else 'TB' end,
        'target', i.deadline_vmp,
        'st', i.computed_status::text,
        'state', coalesce(i.item_state, 'active'),
        'version', i.version,
        'dep', i.report_class,
        'docDone', i.is_doc_complete,
        'mismatch', i.has_mismatch,
        '_raw', jsonb_build_object(
          'version', i.version,
          'ma', i.object_code,
          'loai_td', i.validation_type,
          'qa', i.owner_name,
          'owner_person_id', i.owner_person_id,
          -- Email của người thực hiện: lấy từ tab "Người thực hiện", không có
          -- thì lùi về danh bạ nhân sự. Bỏ qua địa chỉ '.local' vì đó là chỗ
          -- giữ tạm lúc dựng bảng phân công, không gửi được thư thật.
          'email_qa', coalesce(
            (select pf.email from public.vmp_performers pf
              where pf.is_active and pf.email is not null and pf.email not like '%.local'
                and lower(btrim(pf.performer_name)) = lower(btrim(i.owner_name)) limit 1),
            (select se.email from public.vmp_staff_emails se
              where se.email is not null and se.email not like '%.local'
                and lower(btrim(se.staff_name)) = lower(btrim(i.owner_name)) limit 1)),
          'ho_tro', i.secondary_owner,
          'nhom_viec', i.work_group,
          'diem_trong_yeu', i.criticality_score,
          'bo_phan', i.obj_dept,
          'bo_phan_goc', i.department_text,
          'bo_phan_thuc_hien_goc', nullif(trim(i.source_sheet_data ->> 'bo_phan_thuc_hien_goc'), ''),
          'phan_loai', i.classification,
          'khu_vuc', i.area,
          'line', i.line,
          'tan_suat', i.frequency_months,
          'dl_vmp', i.deadline_vmp,
          'dl_de_cuong', i.deadline_protocol,
          'dl_tham_dinh', i.deadline_validation,
          'dl_bao_cao', i.deadline_report,
          'tt_de_cuong', i.status_protocol::text,
          'tt_tham_dinh', i.status_validation::text,
          'tt_bao_cao', i.status_report::text,
          'tt_vmp', i.status_vmp::text,
          'tt_de_cuong_goc', i.status_protocol_text,
          'tt_tham_dinh_goc', i.status_validation_text,
          'tt_bao_cao_goc', i.status_report_text,
          'tt_vmp_goc', i.status_vmp_text,
          'ngay_de_cuong', i.actual_protocol_date,
          'ngay_tham_dinh', i.actual_validation_date,
          'ngay_bao_cao', i.actual_report_date,
          'ngay_vmp', i.actual_vmp_date,
          'lich_td', i.scheduled_date,
          'scheduled_at', i.scheduled_at,
          'state', coalesce(i.item_state, 'active')
        )
      )), '[]'::jsonb)
      from visible_items i
    ),
    'source', 'supabase',
    'updated_at', now(),
    'year', p_year
  ) into result;

  return result;
end;
$$;


--
-- Name: FUNCTION "rpc_get_vmp_dashboard__five_role_impl_20260824"("p_year" integer, "p_include_missing" boolean, "p_include_cancelled" boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_get_vmp_dashboard__five_role_impl_20260824"("p_year" integer, "p_include_missing" boolean, "p_include_cancelled" boolean) IS 'Dữ liệu dashboard. Từ 2026-07-29 KHÔNG còn đọc vmp_sheet_rows — chữ trạng thái lấy từ cột *_text của vmp_plan_items, điểm trọng yếu và người phụ trách lấy từ vmp_plan_items (đã đồng bộ từ vmp_source_objects).';


--
-- Name: rpc_get_vmp_watermark(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_get_vmp_watermark"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  with visible_source as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and (auth.role()='service_role'
        or public.vmp_can_view_source_object(auth.uid(),source_object.id))
  ), visible_items as materialized (
    select item.* from public.vmp_plan_items item
    join visible_source source_object
      on source_object.object_code=item.object_code
    where item.year=p_year and item.is_active
  )
  select jsonb_build_object(
    'year',p_year,'plan_items',(select count(*) from visible_items),
    'objects',(select count(*) from visible_source),
    'updated_at',greatest(
      coalesce((select max(updated_at) from visible_source),'epoch'::timestamptz),
      coalesce((select max(updated_at) from visible_items),'epoch'::timestamptz)),
    'authorization_revision',coalesce((select revision
      from public.vmp_authorization_revision where singleton),0)
  ) into v_result;
  return v_result;
end
$$;


--
-- Name: rpc_get_vmp_watermark__five_role_impl_20260824(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_get_vmp_watermark__five_role_impl_20260824"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object(
    'year', p_year,
    'plan_items', (
      select count(*) from public.vmp_visible_plan_items()
      where year = p_year and is_active = true
    ),
    'objects', (
      select count(*) from public.vmp_objects where is_active = true
    ),
    'updated_at', greatest(
      coalesce((select max(updated_at) from public.vmp_visible_plan_items() where year = p_year), 'epoch'::timestamptz),
      coalesce((select max(updated_at) from public.vmp_objects), 'epoch'::timestamptz)
    )
  );
$$;


--
-- Name: FUNCTION "rpc_get_vmp_watermark__five_role_impl_20260824"("p_year" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_get_vmp_watermark__five_role_impl_20260824"("p_year" integer) IS 'Watermark nhẹ (count + max updated_at) cho web poll — chỉ refetch dashboard khi giá trị đổi.';


--
-- Name: rpc_import_item_permission_staff("jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_import_item_permission_staff"("p_rows" "jsonb", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_import_item_permission_staff__five_role_impl_20260824(p_rows, p_reason); end $$;


--
-- Name: rpc_import_item_permission_staff__five_role_impl_20260824("jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_import_item_permission_staff__five_role_impl_20260824"("p_rows" "jsonb", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_row jsonb;
  v_result jsonb;
  v_imported integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'IMPORT_ROW_FAILED: dữ liệu nhập phải là mảng'
      using errcode = 'VMP01';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'IMPORT_ROW_FAILED: thiếu lý do nhập file'
      using errcode = 'VMP01';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_result := public.rpc_upsert_item_permission_staff(
      null, v_row - 'row_number', p_reason, 0
    );
    if coalesce((v_result->>'ok')::boolean, false) is not true then
      raise exception 'IMPORT_ROW_FAILED: dòng %, %',
        coalesce(v_row->>'row_number', '?'),
        coalesce(v_result->>'error', 'không hợp lệ')
        using errcode = 'VMP01';
    end if;
    v_imported := v_imported + 1;
  end loop;
  return jsonb_build_object(
    'ok', true, 'imported', v_imported, 'errors', '[]'::jsonb
  );
end
$$;


--
-- Name: rpc_item_assignments("text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_assignments"("p_validation_code" "text" DEFAULT NULL::"text", "p_person_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_item_assignments__five_role_impl_20260824(p_validation_code, p_person_id); end $$;


--
-- Name: rpc_item_assignments__five_role_impl_20260824("text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_assignments__five_role_impl_20260824"("p_validation_code" "text" DEFAULT NULL::"text", "p_person_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_principal record;
  v_assignments jsonb;
begin
  select * into v_principal from public.vmp_manager_principal(auth.uid());
  if v_principal.principal_kind is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Principal quản lý không hợp lệ hoặc không nhất quán'
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'assignment_id', assignment.id,
    'validation_code', assignment.validation_code,
    'person_id', assignment.performer_id,
    'user_id', assignment.user_id,
    'staff_name', assignment.staff_name,
    'employee_code', assignment.employee_code,
    'assignment_kind', assignment.assignment_kind,
    'assignment_role', assignment.assignment_role,
    'source', assignment.source,
    'source_text', assignment.source_text,
    'unresolved_reason', assignment.unresolved_reason,
    'expires_at', assignment.expires_at,
    'is_active', assignment.is_active,
    'grants_access', active.grants_access,
    'object_department', object.department,
    'area', object.area,
    'line', object.line
  ) order by assignment.validation_code, assignment.assignment_kind,
             assignment.assignment_role, assignment.staff_name)
  into v_assignments
  from public.vmp_item_assignments assignment
  join public.vmp_plan_items item on item.validation_code = assignment.validation_code
  join public.vmp_objects object on object.code = item.object_code
  join public.vmp_active_item_assignments active on active.id = assignment.id
  left join public.vmp_performers target on target.id = assignment.performer_id
  where (p_validation_code is null or assignment.validation_code = p_validation_code)
    and (p_person_id is null or assignment.performer_id = p_person_id)
    and (
      v_principal.principal_kind = 'admin'
      or (
        v_principal.principal_kind = 'qa_manager'
        and assignment.assignment_kind = 'qa'
      )
      or (
        v_principal.principal_kind = 'equipment_manager'
        and target.department = v_principal.profile_department
        and object.department = v_principal.profile_department
        and (
          '*' = any(v_principal.scope_departments)
          or object.department = any(v_principal.scope_departments)
        )
        and (
          '*' = any(v_principal.access_areas)
          or object.area = any(v_principal.access_areas)
          or object.line = any(v_principal.access_areas)
        )
      )
    );

  return jsonb_build_object(
    'ok', true,
    'assignments', coalesce(v_assignments, '[]'::jsonb)
  );
end
$$;


--
-- Name: rpc_item_permission_account_candidates("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_permission_account_candidates"("p_query" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_item_permission_account_candidates__five_role_impl_20260824(p_query); end $$;


--
-- Name: rpc_item_permission_account_candidates__five_role_impl_20260824("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_permission_account_candidates__five_role_impl_20260824"("p_query" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor_role text;
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_accounts jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin được xem danh sách tài khoản để nối'
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'user_id', profile.id,
    'email', profile.email,
    'full_name', profile.full_name,
    'role', profile.role::text,
    'department', profile.department,
    'is_active', coalesce(profile.is_active, true),
    'linked_person_id', person.id
  ) order by profile.full_name, profile.email, profile.id)
  into v_accounts
  from public.profiles profile
  left join public.vmp_performers person on person.user_id = profile.id
  where v_query = ''
    or lower(coalesce(profile.email, '')) like '%' || v_query || '%'
    or lower(coalesce(profile.full_name, '')) like '%' || v_query || '%';

  return jsonb_build_object(
    'ok', true, 'accounts', coalesce(v_accounts, '[]'::jsonb)
  );
end
$$;


--
-- Name: rpc_item_permission_directory("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_permission_directory"("p_query" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_item_permission_directory__five_role_impl_20260824(p_query); end $$;


--
-- Name: rpc_item_permission_directory__five_role_impl_20260824("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_permission_directory__five_role_impl_20260824"("p_query" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_principal record;
  v_query text := public.vmp_normalize_person_name(p_query);
  v_people jsonb;
begin
  select * into v_principal from public.vmp_manager_principal(auth.uid());
  if coalesce(auth.role(), '') <> 'service_role'
      and v_principal.principal_kind is null then
    return jsonb_build_object('ok', false, 'error',
      'Principal quản lý không hợp lệ hoặc không nhất quán');
  end if;
  with candidates as (
    select person.*,
      count(*) over (partition by person.normalized_full_name) same_name_count,
      profile.is_active account_is_active
    from public.vmp_performers person
    left join public.profiles profile on profile.id = person.user_id
    where person.is_active
      and (coalesce(auth.role(), '') = 'service_role'
        or v_principal.principal_kind = 'admin'
        or (v_principal.principal_kind = 'qa_manager' and person.department = 'qa')
        or (v_principal.principal_kind = 'equipment_manager'
          and person.department = v_principal.profile_department))
      and (v_query = ''
        or person.normalized_full_name like '%' || v_query || '%'
        or lower(coalesce(person.email, '')) like '%'
          || lower(btrim(coalesce(p_query, ''))) || '%'
        or lower(coalesce(person.employee_code, '')) like '%'
          || lower(btrim(coalesce(p_query, ''))) || '%')
  )
  select jsonb_agg(jsonb_build_object(
    'person_id', id, 'user_id', user_id, 'employee_code', employee_code,
    'full_name', performer_name, 'department', department, 'email', email,
    'account_status', case when user_id is null then 'unlinked'
      when coalesce(account_is_active, false) is false then 'inactive' else 'linked' end,
    'access_class', access_class, 'scope_departments', scope_departments,
    'access_areas', access_areas, 'scope_factory_ids', scope_factory_ids,
    'scope_area_ids', scope_area_ids, 'scope_line_ids', scope_line_ids,
    'version', version, 'email_sent_confirmed', email_sent_confirmed,
    'is_active', is_active,
    'match_status', case when same_name_count > 1 then 'ambiguous' else 'unique' end
  ) order by performer_name, department, email, id) into v_people
  from candidates;
  return jsonb_build_object(
    'ok', true, 'people', coalesce(v_people, '[]'::jsonb)
  );
end
$$;


--
-- Name: rpc_item_permission_preflight(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_permission_preflight"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_item_permission_preflight__five_role_impl_20260824(); end $$;


--
-- Name: rpc_item_permission_preflight__five_role_impl_20260824(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_permission_preflight__five_role_impl_20260824"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor_role text;
  v_blocking jsonb;
  v_warnings jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Chỉ Admin chạy được tiền kiểm');
  end if;

  with errors as (
    select jsonb_build_object(
      'code', 'INCOMPLETE_ACTIVE_PERSON', 'record_id', person.id,
      'message', 'Nhân viên hoạt động thiếu bộ phận, phân loại hoặc phạm vi bắt buộc'
    ) as error
    from public.vmp_performers person
    where person.is_active and (
      nullif(btrim(person.performer_name), '') is null
      or nullif(btrim(coalesce(person.department, '')), '') is null
      or person.access_class is null
      or (
        person.access_class not in ('qa_progress_editor', 'qa_manager')
        and (
          cardinality(person.scope_departments) = 0
          or cardinality(person.access_areas) = 0
        )
      )
    )

    union all
    select jsonb_build_object(
      'code', 'INVALID_PERSON_DEPARTMENT', 'record_id', person.id,
      'message', 'department của nhân viên không có trong catalog departments'
    )
    from public.vmp_performers person
    where person.is_active
      and not public.vmp_valid_person_department(person.department)

    union all
    select jsonb_build_object(
      'code', 'UNRESOLVED_ASSIGNMENT', 'record_id', assignment.id,
      'message', 'Phân công chưa nối duy nhất với tài khoản'
    )
    from public.vmp_item_assignments assignment
    where assignment.is_active and assignment.unresolved_reason is not null

    union all
    select jsonb_build_object(
      'code', 'ASSIGNMENT_USER_MISMATCH', 'record_id', assignment.id,
      'message', 'user_id denormalized của phân công không khớp performer'
    )
    from public.vmp_item_assignments assignment
    join public.vmp_performers person on person.id = assignment.performer_id
    where assignment.is_active
      and assignment.user_id is distinct from person.user_id

    union all
    select jsonb_build_object(
      'code', 'ASSIGNMENT_PERSON_INACTIVE', 'record_id', assignment.id,
      'message', 'Phân công đang trỏ tới nhân viên đã ngừng hoạt động'
    )
    from public.vmp_item_assignments assignment
    join public.vmp_performers person on person.id = assignment.performer_id
    where assignment.is_active and not person.is_active

    union all
    select jsonb_build_object(
      'code', 'ASSIGNMENT_DENORMALIZED_MISMATCH', 'record_id', assignment.id,
      'message', 'Mã, tên hoặc trạng thái liên kết phân công không khớp performer'
    )
    from public.vmp_item_assignments assignment
    join public.vmp_performers person on person.id = assignment.performer_id
    where assignment.is_active and (
      assignment.employee_code is distinct from person.employee_code
      or assignment.staff_name is distinct from person.performer_name
      or assignment.unresolved_reason is distinct from case
        when person.user_id is null then 'account_unlinked' else null end
    )

    union all
    select jsonb_build_object(
      'code', 'STALE_SOURCE_RESOLUTION',
      'record_id', resolution.validation_code || '×' || resolution.source
        || '×' || resolution.normalized_source_name,
      'message', 'Quyết định resolve đang trỏ tới performer không còn hoạt động'
    )
    from public.vmp_source_assignment_resolutions resolution
    left join public.vmp_performers person
      on person.id = resolution.performer_id and person.is_active
    where person.id is null
      and exists (
        select 1 from public.vmp_item_assignments assignment
        where assignment.is_active
          and assignment.validation_code = resolution.validation_code
          and assignment.assignment_kind = resolution.assignment_kind
          and assignment.source = resolution.source
          and public.vmp_normalize_person_name(
            coalesce(assignment.source_text, assignment.staff_name)
          ) = resolution.normalized_source_name
      )

    union all
    select jsonb_build_object(
      'code', 'INVALID_QA_CLASS_DEPARTMENT', 'record_id', person.id,
      'message', 'Phân loại QA đang cấp cho người ngoài QA'
    )
    from public.vmp_performers person
    where person.is_active
      and person.access_class in ('qa_progress_editor', 'qa_manager')
      and person.department is distinct from 'qa'

    union all
    select jsonb_build_object(
      'code', 'INVALID_MANAGER_PRINCIPAL',
      'record_id', coalesce(person.id, profile.id),
      'message', 'Role, access_class hoặc department của principal quản lý không nhất quán'
    )
    from public.profiles profile
    left join public.vmp_performers person
      on person.user_id = profile.id and person.is_active
    where coalesce(profile.is_active, true)
      and profile.role::text <> 'admin'
      and (
        profile.role::text = 'qa_manager'
        or person.access_class in ('qa_manager', 'equipment_manager')
      )
      and not (
        (
          profile.role::text = 'qa_manager'
          and profile.department = 'qa'
          and person.access_class = 'qa_manager'
          and person.department = 'qa'
        )
        or (
          profile.role::text = 'department_user'
          and nullif(btrim(coalesce(profile.department, '')), '') is not null
          and person.access_class = 'equipment_manager'
          and person.department = profile.department
        )
      )

    union all
    select jsonb_build_object(
      'code', 'INVALID_SCOPE_DEPARTMENT', 'record_id', person.id,
      'message', 'scope_departments chứa mã không có trong departments'
    )
    from public.vmp_performers person
    where person.is_active
      and cardinality(person.scope_departments) > 0
      and not public.vmp_valid_scope_departments(person.scope_departments)

    union all
    select jsonb_build_object(
      'code', 'INVALID_ACCESS_AREA', 'record_id', person.id,
      'message', 'access_areas chứa area/line không tồn tại'
    )
    from public.vmp_performers person
    where person.is_active
      and cardinality(person.access_areas) > 0
      and not public.vmp_valid_access_areas(person.access_areas)

    union all
    select jsonb_build_object(
      'code', 'ITEM_MISSING_PERMISSION_DIMENSION', 'record_id', item.validation_code,
      'message', 'Hạng mục thiếu bộ phận quản lý hoặc khu vực/line'
    )
    from public.vmp_plan_items item
    join public.vmp_objects object on object.code = item.object_code
    where item.is_active and (
      nullif(btrim(coalesce(object.department, '')), '') is null
      or (
        nullif(btrim(coalesce(object.area, '')), '') is null
        and nullif(btrim(coalesce(object.line, '')), '') is null
      )
    )

    union all
    select jsonb_build_object(
      'code', 'UNFILTERED_SECURITY_DEFINER_RPC', 'record_id', audit.signature,
      'message', 'SECURITY DEFINER đọc hạng mục chưa dùng lõi quyền/allowlist'
    )
    from public.vmp_unfiltered_security_definer_item_readers() audit

    union all
    select jsonb_build_object(
      'code', 'INCOMPLETE_SCOPE_HIERARCHY', 'record_id', person.id,
      'message', 'Nhân viên hoạt động chưa chọn đủ xưởng, khu vực và line'
    )
    from public.vmp_performers person
    where person.is_active
      and person.access_class not in ('qa_progress_editor', 'qa_manager')
      and (
        cardinality(person.scope_departments) = 0
        or cardinality(person.scope_factory_ids) = 0
        or cardinality(person.scope_area_ids) = 0
        or cardinality(person.scope_line_ids) = 0
      )

    union all
    select jsonb_build_object(
      'code', 'INVALID_SCOPE_HIERARCHY', 'record_id', person.id,
      'message', 'Phạm vi xưởng, khu vực và line không nối đủ quan hệ cha'
    )
    from public.vmp_performers person
    where person.is_active
      and cardinality(person.scope_departments) > 0
      and cardinality(person.scope_factory_ids) > 0
      and cardinality(person.scope_area_ids) > 0
      and cardinality(person.scope_line_ids) > 0
      and not public.vmp_valid_permission_scope(
        person.scope_departments, person.scope_factory_ids,
        person.scope_area_ids, person.scope_line_ids
      )

    union all
    select jsonb_build_object(
      'code', 'UNRESOLVED_OWNER_PERSON_ID', 'record_id', source.id,
      'message', 'Tên QA phụ trách chưa nối duy nhất với person_id hoạt động'
    )
    from public.vmp_source_objects source
    where source.is_active and nullif(btrim(source.owner_name), '') is not null
      and source.owner_person_id is null

    union all
    select jsonb_build_object(
      'code', 'UNRESOLVED_SUPPORT_PERSON_ID', 'record_id', source.id,
      'message', 'Tên người hỗ trợ chưa nối duy nhất với person_id hoạt động'
    )
    from public.vmp_source_objects source
    where source.is_active and nullif(btrim(source.support_name), '') is not null
      and source.support_person_id is null

    union all
    select jsonb_build_object(
      'code', case when public.vmp_item_scope_path_count(item.validation_code) = 0
        then 'ITEM_SCOPE_HIERARCHY_UNRESOLVED'
        else 'ITEM_SCOPE_HIERARCHY_AMBIGUOUS' end,
      'record_id', item.validation_code,
      'message', 'Hạng mục không ánh xạ duy nhất vào hierarchy canonical'
    )
    from public.vmp_plan_items item
    where item.is_active
      and public.vmp_item_scope_path_count(item.validation_code) <> 1

    union all
    select jsonb_build_object(
      'code', 'INVALID_SOURCE_OWNER_PERSON_LINK', 'record_id', source.id,
      'message', 'owner_person_id thiếu/inactive hoặc không khớp owner_name canonical'
    )
    from public.vmp_source_objects source
    left join public.vmp_performers person on person.id = source.owner_person_id
    where source.is_active and (
      (nullif(btrim(source.owner_name), '') is not null and source.owner_person_id is null)
      or (source.owner_person_id is not null and (
        person.id is null or not person.is_active
        or public.vmp_normalize_person_name(source.owner_name)
          is distinct from person.normalized_full_name
      ))
    )

    union all
    select jsonb_build_object(
      'code', 'INVALID_SOURCE_SUPPORT_PERSON_LINK', 'record_id', source.id,
      'message', 'support_person_id thiếu/inactive hoặc không khớp support_name canonical'
    )
    from public.vmp_source_objects source
    left join public.vmp_performers person on person.id = source.support_person_id
    where source.is_active and (
      (nullif(btrim(source.support_name), '') is not null and source.support_person_id is null)
      or (source.support_person_id is not null and (
        person.id is null or not person.is_active
        or public.vmp_normalize_person_name(source.support_name)
          is distinct from person.normalized_full_name
      ))
    )

    union all
    select jsonb_build_object(
      'code', 'INVALID_PLAN_OWNER_PERSON_LINK', 'record_id', item.validation_code,
      'message', 'plan owner_person_id thiếu/inactive hoặc không khớp owner_name canonical'
    )
    from public.vmp_plan_items item
    left join public.vmp_performers person on person.id = item.owner_person_id
    where item.is_active and (
      (nullif(btrim(item.owner_name), '') is not null and item.owner_person_id is null)
      or (item.owner_person_id is not null and (
        person.id is null or not person.is_active
        or public.vmp_normalize_person_name(item.owner_name)
          is distinct from person.normalized_full_name
      ))
    )

    union all
    select jsonb_build_object(
      'code', 'INVALID_PLAN_SUPPORT_PERSON_LINK', 'record_id', item.validation_code,
      'message', 'plan support_person_id thiếu/inactive hoặc không khớp secondary_owner canonical'
    )
    from public.vmp_plan_items item
    left join public.vmp_performers person on person.id = item.support_person_id
    where item.is_active and (
      (nullif(btrim(item.secondary_owner), '') is not null and item.support_person_id is null)
      or (item.support_person_id is not null and (
        person.id is null or not person.is_active
        or public.vmp_normalize_person_name(item.secondary_owner)
          is distinct from person.normalized_full_name
      ))
    )

    union all
    select jsonb_build_object(
      'code', 'DUPLICATE_ACTIVE_QA_PRIMARY',
      'record_id', duplicate.validation_code,
      'message', 'Hạng mục có nhiều hơn một QA phụ trách chính đang hoạt động'
    )
    from (
      select assignment.validation_code
      from public.vmp_item_assignments assignment
      where assignment.assignment_kind = 'qa'
        and assignment.assignment_role = 'primary'
        and assignment.is_active
      group by assignment.validation_code
      having count(*) > 1
    ) duplicate

    union all
    select jsonb_build_object(
      'code', 'DUPLICATE_ACTIVE_QA_PERSON',
      'record_id', duplicate.validation_code || '×' || duplicate.performer_id::text,
      'message', 'Một nhân viên có nhiều nguồn phân công QA active trên cùng hạng mục'
    )
    from (
      select assignment.validation_code, assignment.performer_id
      from public.vmp_item_assignments assignment
      where assignment.performer_id is not null
        and assignment.assignment_kind = 'qa'
        and assignment.is_active
      group by assignment.validation_code, assignment.performer_id,
               assignment.assignment_kind
      having count(*) > 1
    ) duplicate
  )
  select jsonb_agg(error) into v_blocking from errors;

  with warnings as (
    select jsonb_build_object(
      'code', 'EMPLOYEE_CODE_MISSING', 'record_id', person.id,
      'message', 'Mã nhân viên chưa có; được phép bổ sung sau'
    ) as warning
    from public.vmp_performers person
    where person.is_active
      and nullif(btrim(coalesce(person.employee_code, '')), '') is null
  )
  select jsonb_agg(warning) into v_warnings from warnings;

  return jsonb_build_object(
    'ok', true,
    'mode', public.item_permissions_mode(),
    'blocking_errors', coalesce(v_blocking, '[]'::jsonb),
    'warnings', coalesce(v_warnings, '[]'::jsonb)
  );
end
$$;


--
-- Name: rpc_item_permission_scope_catalog(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_permission_scope_catalog"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_item_permission_scope_catalog__five_role_impl_20260824(); end $$;


--
-- Name: rpc_item_permission_scope_catalog__five_role_impl_20260824(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_permission_scope_catalog__five_role_impl_20260824"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor_role text;
  v_departments jsonb;
  v_factories jsonb;
  v_areas jsonb;
  v_lines jsonb;
begin
  select role::text into v_actor_role from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role' and v_actor_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;

  select jsonb_agg(jsonb_build_object(
    'id', id, 'code', id, 'label', name
  ) order by sort_order, name, id) into v_departments
  from public.departments where coalesce(is_active, true);
  select jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'label', name, 'department_id', department_id
  ) order by name, code, id) into v_factories
  from public.vmp_scope_factories where is_active;
  select jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'label', name, 'factory_id', factory_id
  ) order by name, code, id) into v_areas
  from public.vmp_scope_areas where is_active;
  select jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'label', name, 'area_id', area_id
  ) order by name, code, id) into v_lines
  from public.vmp_scope_lines where is_active;
  return jsonb_build_object(
    'ok', true,
    'departments', coalesce(v_departments, '[]'::jsonb),
    'factories', coalesce(v_factories, '[]'::jsonb),
    'areas', coalesce(v_areas, '[]'::jsonb),
    'lines', coalesce(v_lines, '[]'::jsonb)
  );
end
$$;


--
-- Name: rpc_item_progress_history("text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_progress_history"("p_validation_code" "text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_item_progress_history__five_role_impl_20260824(p_validation_code, p_limit, p_offset); end $$;


--
-- Name: rpc_item_progress_history__five_role_impl_20260824("text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_item_progress_history__five_role_impl_20260824"("p_validation_code" "text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_lim    integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off    integer := greatest(coalesce(p_offset, 0), 0);
  v_ma     text := nullif(btrim(coalesce(p_validation_code, '')), '');
  v_xem    boolean := false;
  v_tong   integer := 0;
  v_rows   jsonb := '[]'::jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHENTICATED',
      'error', 'Cần đăng nhập để xem lịch sử hạng mục');
  end if;

  if v_ma is null then
    return jsonb_build_object('ok', false, 'error_code', 'CODE_REQUIRED',
      'error', 'Thiếu mã hạng mục');
  end if;

  -- service_role (tự động hoá) xem được tất cả; người dùng thì hỏi quyền.
  if coalesce(auth.role(), '') = 'service_role' then
    v_xem := true;
  else
    begin
      /* `vmp_item_rights` trả về TABLE(can_view, editable_fields, …), KHÔNG
         phải jsonb. Đọc nó như jsonb thì lời gọi ném lỗi, rơi vào nhánh
         bắt lỗi bên dưới, và MỌI người đều bị từ chối — kể cả admin. */
      select r.can_view into v_xem
      from public.vmp_item_rights(auth.uid(), v_ma) r;
      v_xem := coalesce(v_xem, false);
    exception when others then
      v_xem := false;   -- tra quyền hỏng thì TỪ CHỐI, không mở cửa
    end;
  end if;

  if not v_xem then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Bạn không có quyền xem lịch sử của hạng mục này');
  end if;

  select count(*) into v_tong
  from public.audit_logs a
  where a.validation_code = v_ma;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id), '[]'::jsonb)
  into v_rows
  from (
    select a.id, a.created_at,
           coalesce(a.user_name, a.user_email, '(không rõ)') as actor,
           coalesce(a.effective_business_role, 'Không xác định (dữ liệu cũ)')
             as effective_business_role,
           a.action::text as action,
           a.changed_fields, a.change_reason as reason, a.source,
           (a.old_data is not null or a.new_data is not null) as has_detail
    from public.audit_logs a
    where a.validation_code = v_ma
    order by a.created_at desc, a.id
    limit v_lim offset v_off
  ) x;

  return jsonb_build_object('ok', true, 'validation_code', v_ma,
    'total', v_tong, 'limit', v_lim, 'offset', v_off, 'history', v_rows);
end
$$;


--
-- Name: rpc_kb_search("extensions"."vector", integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_kb_search"("p_embedding" "extensions"."vector", "p_k" integer DEFAULT 6, "p_min_score" numeric DEFAULT 0.30) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'source', source, 'heading', heading, 'content', content,
           'score', round(score::numeric, 4)) order by score desc), '[]'::jsonb)
  from (
    select source, heading, content,
           1 - (embedding operator(extensions.<=>) p_embedding) as score
    from public.vmp_kb_chunks
    where embedding is not null
    order by embedding operator(extensions.<=>) p_embedding
    limit greatest(1, least(p_k, 20))
  ) t
  where score >= p_min_score;
$$;


--
-- Name: rpc_kb_search_text("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_kb_search_text"("p_query" "text", "p_k" integer DEFAULT 6) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_toks text[];
  v_q    text := public.vmp_khong_dau(p_query);
  v_res  jsonb;
begin
  select array_agg(t) into v_toks
  from (
    select distinct t from regexp_split_to_table(v_q, '[^a-z0-9]+') t
    where length(t) >= 3
      and t not in ('cho','cac','nhung','nao','bao','nhieu','the','nay','cua',
                    'mot','hai','voi','trong','ngoai','dang','chua','hay','toi',
                    'ban','lam','sao','gi','khi','duoc','phai','can','tai','va')
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nguon', source, 'muc', heading, 'noi_dung', content,
           'diem', round(diem::numeric, 3)) order by diem desc), '[]'::jsonb)
  into v_res
  from (
    select d.metadata->>'source' as source,
           d.metadata->>'heading' as heading,
           d.content,
           -- Số từ khoá khớp là tín hiệu chính; độ giống trigram phá thế hoà
           (select count(*) from unnest(coalesce(v_toks, '{}')) tk
            where public.vmp_khong_dau(d.content) like '%'||tk||'%')
           + extensions.similarity(public.vmp_khong_dau(d.content), v_q) as diem
    from public.vmp_kb_documents d
    where v_toks is null
       or exists (select 1 from unnest(v_toks) tk
                  where public.vmp_khong_dau(d.content) like '%'||tk||'%')
    order by diem desc
    limit greatest(1, least(coalesce(p_k, 6), 20))
  ) t
  where diem > 0;

  return coalesce(v_res, '[]'::jsonb);
end;
$$;


--
-- Name: FUNCTION "rpc_kb_search_text"("p_query" "text", "p_k" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_kb_search_text"("p_query" "text", "p_k" integer) IS 'Tra cứu tài liệu luật/GMP cho trợ lý hỏi đáp. Tìm theo từ khoá đã bỏ dấu + trigram — không cần API nhúng. Chỉ đọc.';


--
-- Name: rpc_lay_giong("text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_lay_giong"("p_cau_hoi" "text", "p_k" integer DEFAULT 3) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  with cau as (
    -- Bỏ dấu, rồi đổi dấu câu thành khoảng trắng: "quá hạn?" -> " qua han "
    select ' ' || regexp_replace(
             public.vmp_khong_dau(coalesce(p_cau_hoi, '')), '[^a-z0-9]+', ' ', 'g'
           ) || ' ' as v
  ),
  nen as (
    select g.ten, g.noi_dung, g.uu_tien, true as la_nen
    from public.vmp_chat_giong g
    where g.bat and g.tu_khoa = '{}'
  ),
  trung as (
    select g.ten, g.noi_dung, g.uu_tien, false as la_nen
    from public.vmp_chat_giong g, cau c
    where g.bat
      and g.tu_khoa <> '{}'
      and exists (
        select 1 from unnest(g.tu_khoa) k
        where c.v like '%' || k || '%'
      )
    order by g.uu_tien
    limit greatest(1, least(p_k, 8))
  ),
  gop as (
    select * from nen
    union all
    select * from trung
  )
  select jsonb_build_object(
    'ok', true,
    'so_manh', count(*) filter (where not la_nen),
    'loi_dan', coalesce(string_agg(noi_dung, E'\n' order by la_nen desc, uu_tien), ''),
    'ten_manh', coalesce(jsonb_agg(ten order by la_nen desc, uu_tien), '[]'::jsonb)
  )
  from gop;
$$;


--
-- Name: FUNCTION "rpc_lay_giong"("p_cau_hoi" "text", "p_k" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_lay_giong"("p_cau_hoi" "text", "p_k" integer) IS 'Trả lời dặn về giọng: TẤT CẢ mảnh nền + tối đa p_k mảnh trúng từ khoá. Khớp theo TỪ trọn vẹn trên bản bỏ dấu.';


--
-- Name: rpc_lien_ket_tai_khoan("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_lien_ket_tai_khoan"("p_performer_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_vai text;
begin
  select role::text into v_vai from profiles where id = auth.uid();
  if v_vai is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('admin_users', v_vai) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin được nối người với tài khoản');
  end if;
  if p_user_id is not null and exists (
    select 1 from vmp_performers where user_id = p_user_id and id <> p_performer_id
  ) then
    return jsonb_build_object('ok', false, 'error',
      'Tài khoản này đã nối với một người khác. Gỡ nối bên đó trước.');
  end if;
  update vmp_performers set user_id = p_user_id where id = p_performer_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy người này');
  end if;
  insert into audit_logs (user_id, action, table_name, record_id, new_data, change_reason, source)
  values (auth.uid(), 'UPDATE', 'vmp_performers', p_performer_id::text,
          jsonb_build_object('user_id', p_user_id),
          case when p_user_id is null then 'Gỡ nối người khỏi tài khoản'
               else 'Nối người với tài khoản' end, 'dashboard_rpc');
  return jsonb_build_object('ok', true,
    'msg', case when p_user_id is null then 'Đã gỡ nối' else 'Đã nối với tài khoản' end);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


--
-- Name: rpc_link_item_permission_account("uuid", "uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_link_item_permission_account"("p_person_id" "uuid", "p_user_id" "uuid", "p_reason" "text", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_link_item_permission_account__five_role_impl_20260824(p_person_id, p_user_id, p_reason, p_expected_version); end $$;


--
-- Name: rpc_link_item_permission_account__five_role_impl_20260824("uuid", "uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_link_item_permission_account__five_role_impl_20260824"("p_person_id" "uuid", "p_user_id" "uuid", "p_reason" "text", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_person public.vmp_performers%rowtype;
  v_new_person public.vmp_performers%rowtype;
  v_old_profile public.profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_new_profile public.profiles%rowtype;
  v_version integer;
  v_lock_user_id uuid;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin được nối hoặc gỡ tài khoản'
    );
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do nối hoặc gỡ tài khoản'
    );
  end if;

  /* Serialize mọi mutation của cùng account trước khi lấy row lock.
   * Unlink lấy account hiện tại bằng snapshot; optimistic version bên dưới
   * từ chối nếu một link vừa thay snapshot trong lúc chờ performer. */
  v_lock_user_id := p_user_id;
  if v_lock_user_id is null then
    select user_id into v_lock_user_id
    from public.vmp_performers
    where id = p_person_id;
  end if;
  if v_lock_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'vmp:item-permission-account:' || v_lock_user_id::text, 0
      )
    );
  end if;

  select * into v_person
  from public.vmp_performers
  where id = p_person_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PERSON_NOT_FOUND',
      'error', 'Không tìm thấy hồ sơ cần nối tài khoản'
    );
  end if;
  if p_expected_version is distinct from v_person.version then
    return jsonb_build_object(
      'ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Hồ sơ đã được cập nhật ở phiên khác',
      'current_version', v_person.version
    );
  end if;
  if p_user_id is null
      and v_lock_user_id is distinct from v_person.user_id then
    return jsonb_build_object(
      'ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Liên kết tài khoản đã đổi trong lúc chờ khóa hồ sơ',
      'current_version', v_person.version
    );
  end if;
  if p_user_id is not null and not v_person.is_active then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PERSON_INACTIVE',
      'error', 'Không được nối tài khoản vào hồ sơ đã ngừng hoạt động'
    );
  end if;

  /* Performer được khóa trước, sau đó profile được khóa theo UUID ổn định. */
  perform profile.id
  from public.profiles profile
  where profile.id = v_person.user_id or profile.id = p_user_id
  order by profile.id
  for update;
  if v_person.user_id is not null then
    select * into v_old_profile
    from public.profiles where id = v_person.user_id;
  end if;

  if p_user_id is not null then
    if v_person.user_id is not null and v_person.user_id <> p_user_id then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_RELINK_REQUIRED',
        'error', 'Phải gỡ tài khoản hiện tại trước khi nối tài khoản khác'
      );
    end if;
    select * into v_profile from public.profiles where id = p_user_id;
    if not found then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_NOT_FOUND',
        'error', 'Không tìm thấy tài khoản cần nối'
      );
    end if;
    /* Snapshot trước update phải là chính profile đích của lần link đầu. */
    v_old_profile := v_profile;
    if not coalesce(v_profile.is_active, true) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_INACTIVE',
        'error', 'Tài khoản đã ngừng hoạt động'
      );
    end if;
    if exists (
      select 1 from public.vmp_performers person
      where person.user_id = p_user_id and person.id <> p_person_id
    ) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_ALREADY_LINKED',
        'error', 'Tài khoản này đã nối với một nhân viên khác'
      );
    end if;
    if v_person.access_class in ('qa_progress_editor', 'qa_manager')
        and v_profile.department is not null
        and v_profile.department <> 'qa' then
      return jsonb_build_object(
        'ok', false, 'error_code', 'INVALID_QA_PRINCIPAL',
        'error', 'Tài khoản QA phải thuộc bộ phận QA'
      );
    end if;
    if v_person.access_class = 'equipment_manager'
        and v_profile.role::text <> 'admin'
        and (
          v_profile.role::text <> 'department_user'
          or v_profile.department is distinct from v_person.department
        ) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'INVALID_MANAGER_PRINCIPAL',
        'error', 'Quản lý thiết bị phải có role và department khớp hồ sơ'
      );
    end if;

    if v_person.access_class in ('qa_progress_editor', 'qa_manager')
        and v_profile.role::text <> 'admin' then
      update public.profiles
      set role = case when v_person.access_class = 'qa_manager'
            then 'qa_manager'::public.user_role
            else 'viewer'::public.user_role end,
          department = 'qa',
          updated_at = now()
      where id = p_user_id;
    end if;
  elsif v_person.user_id is not null
      and v_old_profile.role::text <> 'admin'
      and v_old_profile.role::text = 'qa_manager'
      and v_person.access_class in ('qa_progress_editor', 'qa_manager') then
    update public.profiles
    set role = 'viewer'::public.user_role, updated_at = now()
    where id = v_person.user_id;
  end if;

  v_version := v_person.version + 1;
  update public.vmp_performers
  set user_id = p_user_id, version = v_version, updated_by = v_actor
  where id = p_person_id
  returning * into v_new_person;

  update public.vmp_item_assignments assignment
  set user_id = p_user_id,
      employee_code = v_new_person.employee_code,
      staff_name = v_new_person.performer_name,
      unresolved_reason = case
        when p_user_id is null then 'account_unlinked'
        else null
      end,
      updated_by = v_actor
  where assignment.performer_id = p_person_id;

  if p_user_id is not null then
    select * into v_new_profile
    from public.profiles where id = p_user_id;
  elsif v_person.user_id is not null then
    select * into v_new_profile
    from public.profiles where id = v_person.user_id;
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor, 'UPDATE', 'vmp_performers', p_person_id::text,
    jsonb_build_object(
      'performer', to_jsonb(v_person),
      'profile', to_jsonb(v_old_profile)
    ),
    jsonb_build_object(
      'performer', to_jsonb(v_new_person),
      'profile', to_jsonb(v_new_profile)
    ),
    btrim(p_reason), 'dashboard_rpc',
    array['user_id', 'version', 'profile.role', 'profile.department']
  );

  return jsonb_build_object(
    'ok', true,
    'person_id', p_person_id,
    'user_id', p_user_id,
    'version', v_version,
    'account_status', case when p_user_id is null then 'unlinked' else 'linked' end
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_ALREADY_LINKED',
      'error', 'Tài khoản này đã nối với một nhân viên khác'
    );
  when others then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_LINK_FAILED', 'error', sqlerrm
    );
end
$$;


--
-- Name: rpc_list_catalog_changes("text", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_list_catalog_changes"("p_object_kind" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(),'')<>'service_role'
     and (not public.vmp_is_active_session(auth.uid())
          or not public.vmp_can_manage_source_qa_assignment(auth.uid())) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được xem thay đổi Source đang chờ');
  end if;
  return public.rpc_list_catalog_changes__five_role_impl_20260824(
    p_object_kind,p_status,p_limit,p_offset);
end
$$;


--
-- Name: rpc_list_catalog_changes__five_role_impl_20260824("text", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_list_catalog_changes__five_role_impl_20260824"("p_object_kind" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_lim   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_kind  text := nullif(btrim(coalesce(p_object_kind, '')), '');
  v_st    text := nullif(btrim(coalesce(p_status, '')), '');
  v_tong  integer := 0;
  v_rows  jsonb := '[]'::jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHENTICATED',
      'error', 'Cần đăng nhập để xem thay đổi đang chờ');
  end if;

  -- Mặc định chỉ lấy thứ CÒN chờ. Trộn cả `applied` và `superseded` vào
  -- danh sách "đang chờ" là làm người dùng tưởng còn việc phải xử lý.
  select count(*) into v_tong
  from public.vmp_catalog_changes c
  where (v_kind is null or c.object_kind = v_kind)
    and (case when v_st is null then c.status in ('pending', 'previewed')
              else c.status = v_st end);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id), '[]'::jsonb)
  into v_rows
  from (
    select c.id, c.object_kind, c.object_code, c.status,
           c.source_version, c.timeline_revision,
           c.created_at, c.created_by, c.applied_at, c.applied_by,
           c.apply_reason, c.last_error,
           -- Chỉ nói CÓ hay KHÔNG có tác động đã tính; bản thân JSON tác
           -- động có thể rất lớn nên để màn chi tiết tải riêng.
           (c.impact is not null) as has_impact,
           coalesce(p.full_name, p.email, '(không rõ)') as created_by_name
    from public.vmp_catalog_changes c
    left join public.profiles p on p.id = c.created_by
    where (v_kind is null or c.object_kind = v_kind)
      and (case when v_st is null then c.status in ('pending', 'previewed')
                else c.status = v_st end)
    order by c.created_at desc, c.id
    limit v_lim offset v_off
  ) x;

  return jsonb_build_object('ok', true, 'total', v_tong,
    'limit', v_lim, 'offset', v_off, 'changes', v_rows);
end
$$;


--
-- Name: rpc_list_catalog_dataset("text", "text", "jsonb", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_list_catalog_dataset"("p_dataset" "text", "p_search" "text" DEFAULT NULL::"text", "p_filters" "jsonb" DEFAULT '{}'::"jsonb", "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(),'')<>'service_role'
     and (not public.vmp_is_active_session(auth.uid())
          or not public.vmp_can_manage_source_qa_assignment(auth.uid())) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được xem dữ liệu Source quản trị');
  end if;
  return public.rpc_list_catalog_dataset__five_role_impl_20260824(
    p_dataset,p_search,p_filters,p_limit,p_offset);
end
$$;


--
-- Name: rpc_list_catalog_dataset__five_role_impl_20260824("text", "text", "jsonb", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_list_catalog_dataset__five_role_impl_20260824"("p_dataset" "text", "p_search" "text" DEFAULT NULL::"text", "p_filters" "jsonb" DEFAULT '{}'::"jsonb", "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role   text := public.vmp_business_role(auth.uid());
  v_q      text := nullif(btrim(coalesce(p_search, '')), '');
  v_lim    integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_off    integer := greatest(coalesce(p_offset, 0), 0);
  v_hoat   boolean := coalesce((p_filters ->> 'only_active')::boolean, false);
  v_tong   integer := 0;
  v_rows   jsonb := '[]'::jsonb;
begin
  -- Đọc thì mọi vai đã đăng nhập đều được; RLS của từng bảng vẫn là biên
  -- thật. Chỉ chặn phiên chưa đăng nhập.
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHENTICATED',
      'error', 'Cần đăng nhập để đọc danh mục');
  end if;

  if p_dataset = 'products_gmp' then
    select count(*) into v_tong
    from public.vmp_products_gmp t
    where (not v_hoat or t.is_active)
      and (v_q is null
           or t.bfo_code ilike '%' || v_q || '%'
           or coalesce(t.product_name, '') ilike '%' || v_q || '%');

    select coalesce(jsonb_agg(to_jsonb(x) order by x.bfo_code, x.id), '[]'::jsonb)
    into v_rows
    from (
      select t.* from public.vmp_products_gmp t
      where (not v_hoat or t.is_active)
        and (v_q is null
             or t.bfo_code ilike '%' || v_q || '%'
             or coalesce(t.product_name, '') ilike '%' || v_q || '%')
      order by t.bfo_code, t.id
      limit v_lim offset v_off
    ) x;

  elsif p_dataset = 'alert_recipients' then
    select count(*) into v_tong
    from public.vmp_alert_recipients t
    where (not v_hoat or t.is_enabled)
      and (v_q is null
           or t.email ilike '%' || v_q || '%'
           or coalesce(t.recipient_name, '') ilike '%' || v_q || '%');

    select coalesce(jsonb_agg(to_jsonb(x) order by x.email, x.id), '[]'::jsonb)
    into v_rows
    from (
      select t.* from public.vmp_alert_recipients t
      where (not v_hoat or t.is_enabled)
        and (v_q is null
             or t.email ilike '%' || v_q || '%'
             or coalesce(t.recipient_name, '') ilike '%' || v_q || '%')
      order by t.email, t.id
      limit v_lim offset v_off
    ) x;

  else
    -- Tên dataset lạ trả lỗi rõ ràng, không trả mảng rỗng: rỗng thì client
    -- tưởng "không có dữ liệu" và không ai phát hiện gọi sai tên.
    return jsonb_build_object('ok', false, 'error_code', 'DATASET_UNKNOWN',
      'error', 'Không có dataset tên "' || coalesce(p_dataset, '') || '"');
  end if;

  return jsonb_build_object(
    'ok', true, 'dataset', p_dataset,
    'total', v_tong, 'limit', v_lim, 'offset', v_off,
    'rows', v_rows,
    'effective_business_role', v_role);
end
$$;


--
-- Name: rpc_list_source_objects("text", "text", "jsonb", "jsonb", integer, boolean, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_list_source_objects"("p_object_kind" "text", "p_search" "text", "p_filters" "jsonb", "p_cursor" "jsonb", "p_limit" integer, "p_include_inactive" boolean, "p_object_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select query_path.payload
  from public.vmp_source_objects_page_path(
    auth.uid(),p_object_kind,p_search,p_filters,p_cursor,p_limit,
    p_include_inactive,p_object_id
  ) query_path
$$;


--
-- Name: rpc_list_source_tabs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_list_source_tabs"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_list_source_tabs__five_role_impl_20260824(); end $$;


--
-- Name: rpc_list_source_tabs__five_role_impl_20260824(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_list_source_tabs__five_role_impl_20260824"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(jsonb_agg(t order by t ->> 'source_tab'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'source_tab', source_tab,
             'rows', count(*),
             'columns', (
               select count(distinct k)
               from public.vmp_source_rows r2, jsonb_object_keys(r2.payload) k
               where r2.source_tab = r.source_tab
             )
           ) as t
    from public.vmp_source_rows r
    group by source_tab
  ) s;
$$;


--
-- Name: rpc_list_source_workshop_coverage("text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_list_source_workshop_coverage"("p_search" "text", "p_cursor" "jsonb", "p_limit" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_rows jsonb;
  v_total bigint;
  v_next jsonb;
begin
  if not public.vmp_can_manage_source_workshop_scope(auth.uid()) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Không có quyền quản lý phạm vi xưởng Source');
  end if;
  if p_limit is null or p_limit<1 or p_limit>50 then
    return jsonb_build_object('ok',false,'error_code','INVALID_LIMIT',
      'error','Giới hạn phải từ 1 đến 50');
  end if;
  if p_cursor is not null and (
       jsonb_typeof(p_cursor) is distinct from 'object'
       or nullif(p_cursor->>'normalized_full_name','') is null
       or coalesce(p_cursor->>'person_id','')!~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     ) then
    return jsonb_build_object('ok',false,'error_code','INVALID_CURSOR',
      'error','Con trỏ không hợp lệ');
  end if;

  with candidate as materialized (
    select performer.id person_id,performer.performer_name,
           performer.normalized_full_name,performer.email,
           performer.department,public.vmp_business_role(performer.user_id)
             role_name
    from public.vmp_performers performer
    join public.profiles profile on profile.id=performer.user_id
    where performer.is_active and performer.user_id is not null
      and profile.is_active
      and public.vmp_business_role(performer.user_id) in (
        'workshop_manager','workshop_staff'
      )
      and (coalesce(btrim(p_search),'')=''
           or performer.normalized_full_name like
                '%'||public.vmp_source_scope_key(p_search)||'%')
  ), paged as (
    select candidate.*,
           row_number() over (
             order by candidate.normalized_full_name,candidate.person_id
           ) page_ordinal
    from candidate
    where p_cursor is null or (
      candidate.normalized_full_name,candidate.person_id
    )>(p_cursor->>'normalized_full_name',(p_cursor->>'person_id')::uuid)
    order by candidate.normalized_full_name,candidate.person_id
    limit p_limit+1
  ), returned as (
    select paged.*,
      coalesce((select jsonb_agg(to_jsonb(grant_row)
                 order by grant_row.is_active desc,
                          grant_row.department_key,grant_row.area_key,
                          grant_row.line_key nulls first,grant_row.id)
                from public.vmp_source_workshop_scope_grants grant_row
                where grant_row.performer_id=paged.person_id),'[]'::jsonb)
        grants
    from paged
  )
  select coalesce(jsonb_agg(to_jsonb(returned)-'page_ordinal'
           order by normalized_full_name,person_id)
           filter(where page_ordinal<=p_limit),'[]'::jsonb),
         (select count(*) from candidate),
         case when count(*)>p_limit then (
           select jsonb_build_object(
             'normalized_full_name',cursor_row.normalized_full_name,
             'person_id',cursor_row.person_id)
           from returned cursor_row where cursor_row.page_ordinal=p_limit
         ) else null end
    into v_rows,v_total,v_next from returned;
  return jsonb_build_object('ok',true,'rows',v_rows,
    'authorized_total',v_total,'next_cursor',v_next);
end
$_$;


--
-- Name: rpc_luat_xem(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_luat_xem"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_luat_xem__five_role_impl_20260824(); end $$;


--
-- Name: rpc_luat_xem__five_role_impl_20260824(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_luat_xem__five_role_impl_20260824"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ket jsonb;
begin
  if not public.is_admin_or_qa() then
    return jsonb_build_object('ok', false, 'error',
      'Chỉ admin và phụ trách QA xem được bảng luật đọc');
  end if;

  with muc_can_xem(bang, nhan, thu_tu) as (
    values
      ('vmp_plan_items',        'Số liệu thẩm định — hạng mục, tiến độ, ngày tháng', 1),
      ('vmp_objects',           'Danh mục đối tượng được thẩm định',                 2),
      ('vmp_performers',        'Danh bạ người thực hiện',                           3),
      ('vmp_assignment_matrix', 'Ma trận phân công người × loại × line',             4),
      ('profiles',              'Danh sách người dùng — họ tên, email, vai trò',     5),
      ('audit_logs',            'Nhật ký thay đổi — ai sửa gì, lúc nào, vì sao',     6),
      ('data_quality_issues',   'Cảnh báo chất lượng dữ liệu',                       7),
      ('system_config',         'Cấu hình hệ thống',                                 8),
      ('vmp_ai_chat_log',       'Hội thoại với trợ lý Vali',                         9)
  ),
  luat as (
    select m.bang, m.nhan, m.thu_tu,
           /* Nhiều policy đọc trên một bảng là hợp OR với nhau. Lấy cái
              rộng nhất — 'true' nếu có, không thì nối lại để người đọc
              thấy đủ. */
           (select case when bool_or(coalesce(btrim(pg_get_expr(p.polqual, p.polrelid)), 'true') = 'true')
                        then 'true'
                        else string_agg(pg_get_expr(p.polqual, p.polrelid), ' OR ') end
              from pg_policy p
              join pg_class c on c.oid = p.polrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = m.bang
               and p.polcmd in ('r', '*')) as bieu_thuc,
           (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = m.bang) as co_bang
    from muc_can_xem m
  )
  select jsonb_agg(jsonb_build_object(
    'bang', l.bang,
    'nhan', l.nhan,
    'bieu_thuc', l.bieu_thuc,
    'muc', jsonb_build_object(
      'admin',           case when l.bieu_thuc is null then 'khong' else public.muc_xem(l.bieu_thuc, 'admin') end,
      'qa_manager',      case when l.bieu_thuc is null then 'khong' else public.muc_xem(l.bieu_thuc, 'qa_manager') end,
      'department_user', case when l.bieu_thuc is null then 'khong' else public.muc_xem(l.bieu_thuc, 'department_user') end,
      'viewer',          case when l.bieu_thuc is null then 'khong' else public.muc_xem(l.bieu_thuc, 'viewer') end)
  ) order by l.thu_tu)
  into v_ket
  from luat l where l.co_bang > 0;

  return jsonb_build_object('ok', true, 'noi_dung', coalesce(v_ket, '[]'::jsonb));
end;
$$;


--
-- Name: rpc_mark_alert_sent("text", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_mark_alert_sent"("p_idempotency_key" "text", "p_ok" boolean, "p_error" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE vmp_notifications
  SET status        = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
      sent_at       = CASE WHEN p_ok THEN NOW() ELSE sent_at END,
      error_message = p_error,
      retry_count   = retry_count + CASE WHEN p_ok THEN 0 ELSE 1 END
  WHERE idempotency_key = p_idempotency_key;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;


--
-- Name: rpc_my_editable_progress_rights(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_my_editable_progress_rights"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select query_path.payload
  from public.vmp_editable_progress_rights_path(auth.uid()) query_path
$$;


--
-- Name: rpc_my_ui_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_my_ui_access"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_payload jsonb;
  v_role text;
  v_screen record;
begin
  v_payload := public.rpc_my_ui_access__admin_visibility_delegate_20260828();
  if coalesce((v_payload ->> 'ok')::boolean, false) is not true then
    return v_payload;
  end if;

  v_role := public.vmp_business_role(auth.uid());
  for v_screen in
    select sensitive.screen_id,
           coalesce(p.can_view, false) as can_view,
           coalesce(p.data_scope, 'none') as data_scope,
           coalesce(p.actions, '{}'::text[]) as actions
    from (values
      ('accounts'::text), ('phanquyen'::text), ('health'::text),
      ('audit'::text), ('admin'::text)
    ) sensitive(screen_id)
    left join public.vmp_screen_permissions p
      on p.business_role = v_role and p.screen_id = sensitive.screen_id
  loop
    v_payload := jsonb_set(
      v_payload,
      array['screens', v_screen.screen_id],
      jsonb_build_object(
        'can_view', v_screen.can_view,
        'data_scope', v_screen.data_scope,
        'actions', to_jsonb(v_screen.actions)
      ),
      true
    );
  end loop;
  return v_payload;
end
$$;


--
-- Name: rpc_my_ui_access__admin_visibility_delegate_20260828(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_my_ui_access__admin_visibility_delegate_20260828"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid;
  v_mode text;
  v_role text;
  v_reason text;
  v_login text;
  v_class text;
  v_screens jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial() || jsonb_build_object(
      'mode', 'enforced', 'business_role', null,
      'unresolved_reason', coalesce(
        public.vmp_business_role_unresolved_reason(auth.uid()),
        'role_unresolved'),
      'screens', '{}'::jsonb);
  end if;

  v_uid := auth.uid();
  v_mode := public.screen_access_mode();
  if v_uid is null then
    return jsonb_build_object(
      'ok', false, 'mode', 'enforced', 'business_role', null,
      'unresolved_reason', 'no_session', 'screens', '{}'::jsonb);
  end if;

  v_role := public.vmp_business_role(v_uid);
  v_reason := public.vmp_business_role_unresolved_reason(v_uid);

  if not public.vmp_is_active_session(v_uid) then
    return public.vmp_session_denial() || jsonb_build_object(
      'mode', 'enforced', 'business_role', null,
      'unresolved_reason', coalesce(v_reason, 'role_unresolved'),
      'screens', '{}'::jsonb);
  end if;

  if v_mode <> 'enforced' then
    select p.role::text into v_login
    from public.profiles p where p.id = v_uid;
    select f.access_class into v_class
    from public.vmp_performers f
    where f.user_id = v_uid and f.is_active
    limit 1;

    select jsonb_object_agg(s.screen_id, jsonb_build_object(
             'can_view', s.can_view,
             'data_scope', case when s.can_view then 'all' else 'none' end,
             'actions', case when s.can_view
               then '["view"]'::jsonb else '[]'::jsonb end))
      into v_screens
    from (
      select x.screen_id,
             case
               when v_login = 'admin' then true
               when x.screen_id in ('health','audit','admin','people','accounts')
                 then false
               when x.screen_id = 'phanquyen' then
                 v_login = 'qa_manager'
                 or v_class in ('qa_manager','equipment_manager')
               else true
             end as can_view
      from (select distinct screen_id from public.vmp_screen_permissions) x
    ) s;

    return jsonb_build_object(
      'ok', true, 'mode', 'preview', 'business_role', v_role,
      'unresolved_reason', null,
      'screens', coalesce(v_screens, '{}'::jsonb));
  end if;

  select jsonb_object_agg(p.screen_id, jsonb_build_object(
           'can_view', p.can_view,
           'data_scope', p.data_scope,
           'actions', to_jsonb(p.actions)))
    into v_screens
  from public.vmp_screen_permissions p
  where p.business_role = v_role;

  return jsonb_build_object(
    'ok', true, 'mode', 'enforced', 'business_role', v_role,
    'unresolved_reason', null,
    'screens', coalesce(v_screens, '{}'::jsonb));
end
$$;


--
-- Name: rpc_nguoi_va_quyen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_nguoi_va_quyen"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return public.rpc_nguoi_va_quyen__admin_visibility_delegate_20260828();
  end if;
  if not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if public.vmp_business_role(auth.uid()) is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin xem được dữ liệu quản trị tài khoản');
  end if;
  return public.rpc_nguoi_va_quyen__admin_visibility_delegate_20260828();
end
$$;


--
-- Name: rpc_nguoi_va_quyen__admin_visibility_delegate_20260828(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_nguoi_va_quyen__admin_visibility_delegate_20260828"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_nguoi_va_quyen__five_role_impl_20260824(); end $$;


--
-- Name: rpc_nguoi_va_quyen__five_role_impl_20260824(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_nguoi_va_quyen__five_role_impl_20260824"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_vai text;
  v_ket jsonb;
  v_tong int;
begin
  select role::text into v_vai from profiles where id = auth.uid();
  if v_vai is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;

  /* Cùng một vế với policy profiles_select. Hàm này gộp cả bảng profiles
     nên không được nhìn rộng hơn chỗ nó lấy dữ liệu. */
  if not public.is_admin_or_qa() then
    return jsonb_build_object('ok', false, 'error',
      'Chỉ admin và phụ trách QA xem được danh sách người dùng');
  end if;

  select count(*) into v_tong from public.vmp_visible_plan_items()
   where is_active and coalesce(item_state, 'active') = 'active';

  with nguoi as (
    /* Nguồn 1: người thực hiện (bản ghi NGƯỜI chuẩn) */
    select f.id::text as pid, f.user_id, f.performer_name as ten,
           f.email, f.department as bo_phan
    from vmp_performers f where f.is_active
    union all
    /* Nguồn 2: tài khoản CHƯA nối được với người nào — vẫn phải hiện,
       vì đó chính là những dòng cần người quản trị đi nối. */
    select null, p.id, p.full_name, p.email, p.department
    from profiles p
    where not exists (select 1 from vmp_performers f where f.user_id = p.id)
  ),
  day_du as (
    select n.*, pr.role::text as vai, pr.department as bo_phan_tk,
           pr.pham_vi, pr.is_active as tk_hoat_dong,
           coalesce(pr.pham_vi, public.muc_quyen('update_progress', pr.role::text)) as muc
    from nguoi n left join profiles pr on pr.id = n.user_id
  ),
  dem as (
    select d.pid, d.user_id,
      case
        when d.vai is null then 0
        when d.muc = 'co' then v_tong
        when d.muc = 'khong' then 0
        when d.muc = 'bo_phan' then (
          select count(*) from public.vmp_visible_plan_items() i join vmp_objects o on o.code = i.object_code
          where i.is_active and coalesce(i.item_state,'active') = 'active'
            and d.bo_phan_tk is not null
            and (o.department = d.bo_phan_tk
                 or d.bo_phan_tk = any(coalesce(i.execution_departments, array[]::text[]))))
        when d.muc = 'phan_cong' then (
          select count(*) from public.vmp_visible_plan_items() i join vmp_objects o on o.code = i.object_code
          where i.is_active and coalesce(i.item_state,'active') = 'active'
            and exists (select 1 from vmp_assignment_matrix m
                        where m.is_active
                          and lower(btrim(m.staff_name)) = lower(btrim(coalesce(d.ten,'')))
                          and m.validation_type = i.validation_type
                          and (m.line = '*' or m.line = coalesce(nullif(btrim(o.line),''),'*'))))
        else 0 end as so_sua_duoc,
      (select count(*) from public.vmp_visible_plan_items() i
        where i.is_active and coalesce(i.item_state,'active') = 'active'
          and lower(btrim(coalesce(i.owner_name,''))) = lower(btrim(coalesce(d.ten,'')))
          and coalesce(btrim(d.ten),'') <> '') as so_dung_ten,
      (select count(*) from vmp_assignment_matrix m
        where m.is_active and lower(btrim(m.staff_name)) = lower(btrim(coalesce(d.ten,'')))
          and coalesce(btrim(d.ten),'') <> '') as so_phan_cong
    from day_du d
  )
  select jsonb_agg(jsonb_build_object(
    'pid', d.pid, 'user_id', d.user_id, 'ten', d.ten, 'email', d.email,
    'bo_phan', coalesce(d.bo_phan_tk, d.bo_phan),
    'bo_phan_nguoi', d.bo_phan, 'bo_phan_tai_khoan', d.bo_phan_tk,
    'vai', d.vai, 'pham_vi_rieng', d.pham_vi, 'muc', case when d.vai is null then null else d.muc end,
    'co_tai_khoan', (d.user_id is not null),
    'tk_hoat_dong', coalesce(d.tk_hoat_dong, true),
    'so_sua_duoc', c.so_sua_duoc, 'so_dung_ten', c.so_dung_ten, 'so_phan_cong', c.so_phan_cong
  ) order by c.so_dung_ten desc, d.ten)
  into v_ket
  from day_du d join dem c on c.pid is not distinct from d.pid and c.user_id is not distinct from d.user_id;

  return jsonb_build_object('ok', true, 'tong_hang_muc', v_tong,
                            'nguoi', coalesce(v_ket, '[]'::jsonb));
end;
$$;


--
-- Name: rpc_preview_catalog_change("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_preview_catalog_change"("p_change_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if exists (
    select 1 from public.vmp_catalog_changes change
    where change.id=p_change_id and (
      change.old_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ] or change.new_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ]
    )
  ) then
    return jsonb_build_object('ok',false,
      'error_code','ACCESS_FIELDS_NOT_APPLICABLE',
      'error','Thay đổi timeline không được chứa quan hệ QA Source');
  end if;
  return public.rpc_preview_catalog_change__five_role_impl_20260824(
    p_change_id);
end
$$;


--
-- Name: rpc_preview_catalog_change__five_role_impl_20260824("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_preview_catalog_change__five_role_impl_20260824"("p_change_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role     text := public.vmp_business_role(auth.uid());
  v_ch       public.vmp_catalog_changes%rowtype;
  v_obj      public.vmp_source_objects%rowtype;
  v_year     integer := extract(year from now())::integer;
  v_freq     integer;
  v_times    integer;
  v_types    text[];
  v_type     text;
  v_n        integer;
  v_code     text;
  v_moc      record;
  v_cu       public.vmp_plan_items%rowtype;
  v_tao      jsonb := '[]'::jsonb;
  v_sua      jsonb := '[]'::jsonb;
  v_giu      jsonb := '[]'::jsonb;
  v_dung     jsonb := '[]'::jsonb;
  v_canh     text[] := '{}';
begin
  if coalesce(auth.role(), '') <> 'service_role'
      and v_role is distinct from 'admin' and v_role is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được xem trước thay đổi timeline');
  end if;

  select * into v_ch from public.vmp_catalog_changes where id = p_change_id;
  if v_ch.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'CHANGE_NOT_FOUND',
      'error', 'Không tìm thấy thay đổi này');
  end if;

  select * into v_obj from public.vmp_source_objects
  where object_kind = v_ch.object_kind and object_code = v_ch.object_code;
  if v_obj.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'OBJECT_NOT_FOUND',
      'error', 'Đối tượng đã bị xoá khỏi danh mục');
  end if;

  -- Đối tượng không thẩm định hoặc đã ngừng dùng: chỉ đề xuất DỪNG các
  -- hạng mục tương lai. Không xoá vật lý — timeline vẫn tham chiếu mã.
  if coalesce(lower(v_obj.validate_flag), 'n') <> 'y' or not coalesce(v_obj.is_active, true) then
    for v_cu in
      select * from public.vmp_plan_items
      where object_code = v_obj.object_code and coalesce(is_active, true)
        and not public.vmp_hang_muc_da_co_tien_do(validation_code)
    loop
      v_dung := v_dung || jsonb_build_object(
        'validation_code', v_cu.validation_code, 'ly_do', 'đối tượng không còn thẩm định');
    end loop;
    for v_cu in
      select * from public.vmp_plan_items
      where object_code = v_obj.object_code and coalesce(is_active, true)
        and public.vmp_hang_muc_da_co_tien_do(validation_code)
    loop
      v_giu := v_giu || jsonb_build_object(
        'validation_code', v_cu.validation_code, 'ly_do', 'đã có tiến độ, không tự động dừng');
    end loop;

    return jsonb_build_object('ok', true, 'change_id', p_change_id,
      'object_code', v_obj.object_code,
      'source_version', v_ch.source_version, 'timeline_revision', v_ch.timeline_revision,
      'tao', '[]'::jsonb, 'sua', '[]'::jsonb, 'dung', v_dung, 'giu_nguyen', v_giu,
      'canh_bao', to_jsonb('{}'::text[]));
  end if;

  v_freq  := coalesce(nullif(v_obj.frequency_months, 0), 12);
  v_times := greatest(1, 12 / v_freq);
  v_types := public.vmp_loai_tham_dinh(v_obj.object_kind, v_obj.object_code, v_obj.year_ref, v_year);

  foreach v_type in array v_types loop
    for v_n in 1 .. v_times loop
      v_code := v_obj.object_code || '/' || v_year::text || '.'
                || lpad(v_n::text, 2, '0') || '-' || v_type;

      select * into v_moc from public.vmp_tinh_moc_thoi_gian(
        v_year, v_obj.first_month, v_freq, v_n,
        v_obj.report_class, v_obj.workdays, v_type);

      if array_length(v_moc.thieu, 1) is not null then
        v_canh := array(select distinct unnest(v_canh || v_moc.thieu));
      end if;

      select * into v_cu from public.vmp_plan_items where validation_code = v_code;

      if v_cu.id is null then
        v_tao := v_tao || jsonb_build_object(
          'validation_code', v_code, 'validation_type', v_type,
          'deadline_vmp', v_moc.deadline_vmp,
          'deadline_validation', v_moc.deadline_validation,
          'thieu', to_jsonb(v_moc.thieu));
      elsif public.vmp_hang_muc_da_co_tien_do(v_code) then
        -- Nguyên tắc 2: đã có tiến độ thì không đụng, chỉ liệt kê.
        v_giu := v_giu || jsonb_build_object(
          'validation_code', v_code,
          'deadline_vmp_hien_tai', v_cu.deadline_vmp,
          'ly_do', 'đã có ngày thực tế hoặc trạng thái khác chưa bắt đầu');
      elsif v_cu.deadline_vmp is distinct from v_moc.deadline_vmp
         or v_cu.deadline_validation is distinct from v_moc.deadline_validation
         or v_cu.deadline_report is distinct from v_moc.deadline_report
         or v_cu.deadline_protocol is distinct from v_moc.deadline_protocol then
        v_sua := v_sua || jsonb_build_object(
          'validation_code', v_code,
          'deadline_vmp_cu', v_cu.deadline_vmp, 'deadline_vmp_moi', v_moc.deadline_vmp,
          'deadline_validation_cu', v_cu.deadline_validation,
          'deadline_validation_moi', v_moc.deadline_validation);
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true, 'change_id', p_change_id, 'object_code', v_obj.object_code,
    'source_version', v_ch.source_version, 'timeline_revision', v_ch.timeline_revision,
    'tao', v_tao, 'sua', v_sua, 'dung', '[]'::jsonb, 'giu_nguyen', v_giu,
    'canh_bao', to_jsonb(v_canh));
end
$$;


--
-- Name: rpc_preview_catalog_change_v2("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_preview_catalog_change_v2"("p_change_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if coalesce(auth.role(),'')<>'service_role'
     and coalesce(public.vmp_business_role(auth.uid()),'')
         not in ('admin','qa_manager') then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được xem thay đổi timeline');
  end if;
  if exists (
    select 1 from public.vmp_catalog_changes change
    where change.id=p_change_id and (
      change.old_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ] or change.new_data?|array[
        'owner_person_id','support_person_id','owner_name','support_name'
      ]
    )
  ) then
    return jsonb_build_object('ok',false,
      'error_code','ACCESS_FIELDS_NOT_APPLICABLE',
      'error','Thay đổi timeline không được chứa quan hệ QA Source');
  end if;
  return public.vmp_preview_catalog_change_v2_impl(p_change_id);
end
$$;


--
-- Name: rpc_preview_item_rights("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_preview_item_rights"("p_person_id" "uuid" DEFAULT NULL::"uuid", "p_validation_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return public.rpc_preview_item_rights__admin_visibility_delegate_20260828(
      p_person_id, p_validation_code);
  end if;
  if not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  if public.vmp_business_role(auth.uid()) is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin xem được quyền hiệu lực của người khác');
  end if;
  return public.rpc_preview_item_rights__admin_visibility_delegate_20260828(
    p_person_id, p_validation_code);
end
$$;


--
-- Name: rpc_preview_item_rights__admin_visibility_delegate_20260828("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_preview_item_rights__admin_visibility_delegate_20260828"("p_person_id" "uuid" DEFAULT NULL::"uuid", "p_validation_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_preview_item_rights__five_role_impl_20260824(p_person_id, p_validation_code); end $$;


--
-- Name: rpc_preview_item_rights__five_role_impl_20260824("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_preview_item_rights__five_role_impl_20260824"("p_person_id" "uuid" DEFAULT NULL::"uuid", "p_validation_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_principal record;
  v_rows jsonb;
begin
  select * into v_principal from public.vmp_manager_principal(auth.uid());
  if v_principal.principal_kind is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Principal quản lý không hợp lệ hoặc không nhất quán'
    );
  end if;
  if p_person_id is null and p_validation_code is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chọn một nhân viên hoặc một hạng mục để xem quyền dự kiến'
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'person_id', person.id,
    'user_id', person.user_id,
    'full_name', person.performer_name,
    'validation_code', item.validation_code,
    'rights_basis', case
      when person.access_class = 'qa_progress_editor' then 'qa_assignment'
      when person.access_class = 'qa_manager' then 'qa_management'
      else 'hierarchy_scope'
    end,
    'assignment_role', active_assignment.assignment_role,
    'can_view', rights.can_view,
    'editable_fields', rights.editable_fields,
    'view_reason', rights.view_reason,
    'assignment_sources', rights.assignment_sources,
    'scope_match', case when person.access_class in (
        'qa_progress_editor', 'qa_manager'
      ) then rights.scope_match else scope.scope_match end,
    'factory_match', case when person.access_class in (
        'qa_progress_editor', 'qa_manager'
      ) then rights.scope_match else scope.factory_match end,
    'area_match', case when person.access_class in (
        'qa_progress_editor', 'qa_manager'
      ) then rights.area_match else scope.area_match end,
    'line_match', case when person.access_class in (
        'qa_progress_editor', 'qa_manager'
      ) then rights.area_match else scope.line_match end
  ) order by person.performer_name, item.validation_code)
  into v_rows
  from public.vmp_performers person
  cross join public.vmp_visible_plan_items() item
  join public.vmp_objects object on object.code = item.object_code
  cross join lateral public.vmp_item_rights(person.user_id, item.validation_code) rights
  cross join lateral public.vmp_item_scope_matches(person.id, item.validation_code) scope
  left join lateral (
    select assignment.assignment_role
    from public.vmp_item_assignments assignment
    where assignment.validation_code = item.validation_code
      and assignment.performer_id = person.id
      and assignment.is_active
      and (assignment.expires_at is null or assignment.expires_at > now())
    order by (assignment.assignment_kind = 'qa') desc,
             (assignment.assignment_role = 'primary') desc,
             assignment.created_at,
             assignment.id
    limit 1
  ) active_assignment on true
  where person.is_active and item.is_active
    and (p_person_id is null or person.id = p_person_id)
    and (p_validation_code is null or item.validation_code = p_validation_code)
    and (
      v_principal.principal_kind = 'admin'
      or (
        v_principal.principal_kind = 'qa_manager'
        and person.department = 'qa'
      )
      or (
        v_principal.principal_kind = 'equipment_manager'
        and person.department = v_principal.profile_department
        and object.department = v_principal.profile_department
      )
    );

  return jsonb_build_object(
    'ok', true,
    'mode', public.item_permissions_mode(),
    'rights', coalesce(v_rows, '[]'::jsonb)
  );
end
$$;


--
-- Name: rpc_recalc_criticality(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_recalc_criticality"("p_only_auto" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_recalc_criticality__five_role_impl_20260824(p_only_auto); end $$;


--
-- Name: rpc_recalc_criticality__five_role_impl_20260824(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_recalc_criticality__five_role_impl_20260824"("p_only_auto" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_n    integer;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được chấm lại điểm trọng yếu');
  end if;

  update public.vmp_source_objects s set
    complexity_score     = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class),
    quality_impact_score = public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
    criticality_score    = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class)
                         * public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
    criticality_source   = 'auto'
  where (not p_only_auto or s.criticality_source = 'auto');
  get diagnostics v_n = row_count;

  update public.vmp_plan_items p set criticality_score = s.criticality_score
  from public.vmp_source_objects s
  where s.object_code = p.object_code and s.criticality_score is not null;

  return jsonb_build_object('ok', true, 'so_dong', v_n,
    'msg', 'Đã chấm lại ' || v_n || ' đối tượng (đề xuất tự động, chờ QA duyệt)');
end;
$$;


--
-- Name: rpc_reconcile_orphan_objects("text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_reconcile_orphan_objects"("p_codes_in_sheet" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count INT := 0;
BEGIN
  -- CHỐT AN TOÀN: mảng rỗng/null -> KHÔNG làm gì (tránh vô hiệu hóa nhầm toàn bộ
  -- nếu lần đọc Sheet bị lỗi và trả về 0 mã).
  IF p_codes_in_sheet IS NULL OR array_length(p_codes_in_sheet, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deactivated', 0, 'skipped', 'mảng mã rỗng');
  END IF;

  PERFORM set_config('app.audit_source', 'wf01_reconcile', true);
  PERFORM set_config('app.audit_reason', 'Đối tượng không còn trong Google Sheet và không còn hạng mục hiệu lực', true);

  WITH orphan AS (
    UPDATE vmp_objects o
    SET is_active = FALSE, updated_at = NOW()
    WHERE o.is_active = TRUE
      AND NOT (o.code = ANY(COALESCE(p_codes_in_sheet, ARRAY[]::TEXT[])))
      AND NOT EXISTS (
        SELECT 1 FROM vmp_plan_items pi
        WHERE pi.object_code = o.code
          AND pi.is_active = TRUE
          AND COALESCE(pi.missing_from_sheet, FALSE) = FALSE
      )
    RETURNING o.code
  )
  SELECT COUNT(*) INTO v_count FROM orphan;

  RETURN jsonb_build_object('ok', true, 'deactivated', v_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;


--
-- Name: rpc_refresh_computed_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_refresh_computed_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_refresh_computed_status__five_role_impl_20260824(); end $$;


--
-- Name: rpc_refresh_computed_status__five_role_impl_20260824(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_refresh_computed_status__five_role_impl_20260824"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count INT := 0;
BEGIN
  PERFORM set_config('app.audit_source', 'cron_status_refresh', true);
  PERFORM set_config('app.audit_reason', 'Refresh computed_status theo CURRENT_DATE', true);

  -- "Touch" các dòng để kích lại trigger compute_doc_flags BEFORE UPDATE
  UPDATE vmp_plan_items
  SET updated_at = NOW()
  WHERE is_active = TRUE
    AND COALESCE(missing_from_sheet, FALSE) = FALSE
    AND COALESCE(item_state, 'active') = 'active'
    AND status_vmp <> 'completed'
    AND (
      (deadline_vmp IS NOT NULL AND deadline_vmp < CURRENT_DATE AND computed_status <> 'over')
      OR (deadline_vmp = CURRENT_DATE)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'refreshed', v_count, 'at', NOW());
END;
$$;


--
-- Name: rpc_refresh_source_item_assignments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_refresh_source_item_assignments"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_source record;
  v_result jsonb;
  v_sources integer:=0;
  v_items integer:=0;
  v_plan_updated integer:=0;
  v_inserted integer:=0;
  v_reactivated integer:=0;
  v_revoked integer:=0;
  v_demoted integer:=0;
begin
  for v_source in
    select source_object.id
    from public.vmp_source_objects source_object
    where source_object.is_active is true
    order by source_object.object_code,source_object.id
  loop
    v_result:=public.vmp_reconcile_source_qa_projection(v_source.id);
    v_sources:=v_sources+1;
    v_items:=v_items+coalesce((v_result->>'items')::integer,0);
    v_plan_updated:=v_plan_updated+
      coalesce((v_result->>'plan_updated')::integer,0);
    v_inserted:=v_inserted+coalesce((v_result->>'inserted')::integer,0);
    v_reactivated:=v_reactivated+
      coalesce((v_result->>'reactivated')::integer,0);
    v_revoked:=v_revoked+coalesce((v_result->>'revoked')::integer,0);
    v_demoted:=v_demoted+coalesce((v_result->>'demoted')::integer,0);
  end loop;
  return jsonb_build_object(
    'ok',true,'sources',v_sources,'items',v_items,
    'plan_updated',v_plan_updated,'inserted',v_inserted,
    'reactivated',v_reactivated,'revoked',v_revoked,'demoted',v_demoted
  );
end
$$;


--
-- Name: rpc_register_alert("text", "text", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_register_alert"("p_idempotency_key" "text", "p_type" "text", "p_validation_code" "text", "p_recipient_email" "text", "p_recipient_name" "text" DEFAULT NULL::"text", "p_subject" "text" DEFAULT NULL::"text", "p_body_preview" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_id      UUID;
  v_is_new  BOOLEAN := FALSE;
  v_plan_id TEXT;
BEGIN
  SELECT id INTO v_plan_id FROM vmp_plan_items
  WHERE validation_code = p_validation_code LIMIT 1;

  -- S2-C FIX: KHÔNG cho phép cảnh báo mồ côi
  IF v_plan_id IS NULL THEN
    RAISE LOG 'rpc_register_alert: mã thẩm định không tồn tại: %', p_validation_code;
    RETURN jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định trong DB: ' || p_validation_code);
  END IF;

  INSERT INTO vmp_notifications (
    idempotency_key, notification_type, plan_item_id,
    recipient_email, recipient_name, channel, subject, body_preview, status
  ) VALUES (
    p_idempotency_key, p_type, v_plan_id,
    p_recipient_email, p_recipient_name, 'email', p_subject, p_body_preview, 'pending'
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  v_is_new := (v_id IS NOT NULL);
  RETURN jsonb_build_object('ok', true, 'is_new', v_is_new, 'id', v_id, 'key', p_idempotency_key);
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'rpc_register_alert lỗi (key=%, code=%): %',
      p_idempotency_key, p_validation_code, SQLERRM;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;


--
-- Name: rpc_resolve_missing("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_resolve_missing"("p_validation_code" "text", "p_decision" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_object_code text;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  select item.object_code into v_object_code
  from public.vmp_plan_items item
  where item.validation_code=p_validation_code;
  if v_object_code is not null then
    perform public.vmp_lock_source_plan_relations(array[v_object_code]);
  end if;
  return public.rpc_resolve_missing__five_role_impl_20260824(
    p_validation_code,p_decision,p_reason);
end
$$;


--
-- Name: rpc_resolve_missing__five_role_impl_20260824("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_resolve_missing__five_role_impl_20260824"("p_validation_code" "text", "p_decision" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF not public.duoc_phep('edit_catalog', v_role::text) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Chỉ admin/QA manager được xử lý mã mất');
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cần nhập lý do quyết định');
  END IF;

  PERFORM set_config('app.audit_source', 'admin_resolve_missing', true);
  PERFORM set_config('app.audit_reason', p_reason, true);

  IF p_decision = 'deactivate' THEN
    -- QA xác nhận hủy hạng mục
    UPDATE vmp_plan_items
    SET is_active = FALSE, updated_by = auth.uid(), updated_at = NOW()
    WHERE validation_code = p_validation_code;
  ELSIF p_decision = 'keep_active' THEN
    -- Giữ active, chỉ xóa cờ missing (chờ thêm lại vào Sheet)
    UPDATE vmp_plan_items
    SET missing_from_sheet = FALSE, missing_since = NULL, updated_by = auth.uid(), updated_at = NOW()
    WHERE validation_code = p_validation_code;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Decision phải là keep_active hoặc deactivate');
  END IF;

  RETURN jsonb_build_object('ok', true, 'validation_code', p_validation_code, 'decision', p_decision);
END;
$$;


--
-- Name: rpc_resolve_outbox(bigint, boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_resolve_outbox"("p_id" bigint, "p_ok" boolean, "p_error" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  IF p_ok THEN
    UPDATE sheet_sync_outbox
    SET status = 'done', last_error = NULL, updated_at = NOW()
    WHERE id = p_id;
  ELSE
    UPDATE sheet_sync_outbox
    SET status = 'error',
        attempts = attempts + 1,
        last_error = COALESCE(p_error, 'mirror lỗi'),
        next_attempt_at = NOW() + (LEAST(power(2, attempts) * 30, 600) || ' seconds')::interval,
        updated_at = NOW()
    WHERE id = p_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;


--
-- Name: rpc_resolve_source_item_assignment("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_resolve_source_item_assignment"("p_assignment_id" "uuid", "p_person_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_assignment public.vmp_item_assignments%rowtype;
  v_person public.vmp_performers%rowtype;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Chỉ Admin resolve được tên nguồn');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do resolve');
  end if;

  select * into v_assignment
  from public.vmp_item_assignments
  where id = p_assignment_id
    and source in ('sheet_qa', 'sheet_other_staff');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy phân công nguồn');
  end if;
  select * into v_person
  from public.vmp_performers
  where id = p_person_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy nhân viên hoạt động');
  end if;

  insert into public.vmp_source_assignment_resolutions (
    validation_code, assignment_kind, source, normalized_source_name,
    performer_id, change_reason, created_by, updated_by
  ) values (
    v_assignment.validation_code,
    v_assignment.assignment_kind,
    v_assignment.source,
    public.vmp_normalize_person_name(coalesce(v_assignment.source_text, v_assignment.staff_name)),
    v_person.id,
    btrim(p_reason),
    v_actor,
    v_actor
  )
  on conflict (validation_code, assignment_kind, source, normalized_source_name)
  do update set performer_id = excluded.performer_id,
                change_reason = excluded.change_reason,
                updated_by = excluded.updated_by;

  update public.vmp_item_assignments
  set performer_id = v_person.id,
      user_id = v_person.user_id,
      staff_name = v_person.performer_name,
      employee_code = v_person.employee_code,
      unresolved_reason = case
        when v_person.user_id is null then 'account_unlinked'
        else null
      end,
      change_reason = btrim(p_reason),
      updated_by = v_actor
  where id = p_assignment_id;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, new_data,
    change_reason, source, changed_fields, validation_code
  ) values (
    v_actor, 'UPDATE', 'vmp_item_assignments', p_assignment_id::text,
    jsonb_build_object('person_id', v_person.id, 'source', v_assignment.source),
    btrim(p_reason), 'dashboard_rpc',
    array['performer_id', 'user_id', 'unresolved_reason'],
    v_assignment.validation_code
  );

  return jsonb_build_object('ok', true, 'person_id', v_person.id);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$$;


--
-- Name: rpc_rollback_vmp_sheet_sync("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_rollback_vmp_sheet_sync"("p_sync_run_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.vmp_lock_source_plan_relations(null);
  return public.rpc_rollback_vmp_sheet_sync__source_impl_20260828(
    p_sync_run_id);
end
$$;


--
-- Name: rpc_rollback_vmp_sheet_sync__source_impl_20260828("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_rollback_vmp_sheet_sync__source_impl_20260828"("p_sync_run_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_plan_restored integer := 0;
  v_objects_restored integer := 0;
  v_quality_restored integer := 0;
  v_notifications_restored integer := 0;
  v_progress_restored integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('public.rpc_sync_vmp_sheet_snapshot'));

  if not exists (
    select 1
    from public.vmp_sheet_sync_backups
    where sync_run_id = p_sync_run_id
      and dataset = 'vmp_plan_items'
  ) then
    raise exception 'VMP_SYNC_BACKUP_NOT_FOUND: %', p_sync_run_id;
  end if;

  delete from public.data_quality_issues;
  delete from public.vmp_notifications;
  delete from public.vmp_progress_events;
  delete from public.vmp_plan_items;
  delete from public.vmp_objects;

  insert into public.vmp_objects
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_objects, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_objects';
  get diagnostics v_objects_restored = row_count;

  insert into public.vmp_plan_items
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_plan_items, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_plan_items';
  get diagnostics v_plan_restored = row_count;

  -- BEFORE INSERT validation can synthesize issues for restored legacy rows.
  -- Remove those transient issues, then restore the exact backed-up set.
  delete from public.data_quality_issues;

  insert into public.data_quality_issues
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.data_quality_issues, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'data_quality_issues';
  get diagnostics v_quality_restored = row_count;

  insert into public.vmp_notifications
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_notifications, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_notifications';
  get diagnostics v_notifications_restored = row_count;

  insert into public.vmp_progress_events
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_progress_events, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_progress_events';
  get diagnostics v_progress_restored = row_count;

  update public.vmp_sheet_sync_runs
  set status = 'rolled_back', completed_at = now()
  where id = p_sync_run_id;

  return jsonb_build_object(
    'ok', true,
    'sync_run_id', p_sync_run_id,
    'plan_restored', v_plan_restored,
    'objects_restored', v_objects_restored,
    'data_quality_restored', v_quality_restored,
    'notifications_restored', v_notifications_restored,
    'progress_restored', v_progress_restored
  );
end;
$$;


--
-- Name: FUNCTION "rpc_rollback_vmp_sheet_sync__source_impl_20260828"("p_sync_run_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_rollback_vmp_sheet_sync__source_impl_20260828"("p_sync_run_id" "uuid") IS 'Exactly restores VMP domain and dependent data captured before a canonical Sheet sync run.';


--
-- Name: rpc_save_alert_recipient("uuid", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_save_alert_recipient"("p_id" "uuid", "p_patch" "jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_expected_version" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_save_alert_recipient__five_role_impl_20260824(p_id, p_patch, p_reason, p_expected_version); end $$;


--
-- Name: rpc_save_alert_recipient__five_role_impl_20260824("uuid", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_save_alert_recipient__five_role_impl_20260824"("p_id" "uuid", "p_patch" "jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_expected_version" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_role  text := public.vmp_business_role(auth.uid());
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_bad   text[];
  v_hien  public.vmp_alert_recipients%rowtype;
  v_ket   jsonb;
  v_ver   integer;
  v_id    uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and v_role is distinct from 'admin'
     and v_role is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được sửa danh sách nhận cảnh báo');
  end if;

  select array_agg(key order by key) into v_bad
  from jsonb_object_keys(v_patch) key
  where key <> all(array[
    'is_enabled', 'scope_type', 'scope', 'email', 'recipient_name',
    'alert_kind', 'threshold_days', 'note',
    'ai_report_enabled', 'ai_report_schedule'
  ]::text[]);
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PATCH_FIELD_NOT_ALLOWED',
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad, ', '));
  end if;

  if p_id is not null then
    select * into v_hien from public.vmp_alert_recipients where id = p_id;
  end if;

  if v_hien.id is not null and p_expected_version is not null
     and v_hien.version is distinct from p_expected_version then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Bản ghi đã được người khác sửa. Tải lại để xem thay đổi rồi lưu lại.',
      'current_version', v_hien.version);
  end if;

  -- Tắt một người nhận nghĩa là từ nay họ không nhận cảnh báo quá hạn
  -- nữa. Đó là thứ cần giải thích được về sau.
  if v_hien.id is not null
     and (v_patch ? 'is_enabled')
     and coalesce((v_patch ->> 'is_enabled')::boolean, true) is false
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Tắt một người nhận cảnh báo thì phải nhập lý do');
  end if;

  v_ket := public.rpc_upsert_alert_recipient(p_id, v_patch);
  if coalesce((v_ket ->> 'ok')::boolean, false) is not true then
    return v_ket;
  end if;

  v_id := coalesce(p_id, nullif(v_ket ->> 'id', '')::uuid);

  update public.vmp_alert_recipients
  set version = coalesce(version, 1) + 1
  where id = v_id
  returning version into v_ver;

  insert into public.audit_logs (
    id, user_id, action, table_name, record_id,
    old_data, new_data, change_reason, source, effective_business_role)
  values (
    gen_random_uuid(), v_actor,
    (case when v_hien.id is null then 'INSERT' else 'UPDATE' end)::audit_action,
    'vmp_alert_recipients', v_id::text,
    to_jsonb(v_hien), v_patch,
    nullif(btrim(coalesce(p_reason, '')), ''), 'rpc_save_alert_recipient', v_role);

  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver);
end
$$;


--
-- Name: rpc_save_catalog_object("text", "text", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_save_catalog_object"("p_object_kind" "text", "p_object_code" "text", "p_patch" "jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_expected_version" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  perform public.vmp_lock_catalog_object_v2(p_object_kind,p_object_code);
  return public.rpc_save_catalog_object__five_role_impl_20260824(
    p_object_kind,p_object_code,p_patch,p_reason,p_expected_version);
end
$$;


--
-- Name: rpc_save_catalog_object__five_role_impl_20260824("text", "text", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_save_catalog_object__five_role_impl_20260824"("p_object_kind" "text", "p_object_code" "text", "p_patch" "jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_expected_version" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
  v_bad text[];
  v_source public.vmp_source_objects%rowtype;
  v_after public.vmp_source_objects%rowtype;
  v_owner public.vmp_performers%rowtype;
  v_support public.vmp_performers%rowtype;
  v_owner_id uuid;
  v_support_id uuid;
  v_master_patch jsonb;
  v_timeline_patch jsonb:='{}'::jsonb;
  v_timeline_old jsonb:='{}'::jsonb;
  v_result jsonb;
  v_access_change boolean;
  v_owner_change boolean;
  v_support_change boolean;
  v_timeline_change boolean;
  v_change_id uuid;
  v_changed_fields text[];
begin
  if coalesce(auth.role(),'')<>'service_role' then
    if not public.vmp_is_active_session(v_actor)
       or not public.vmp_can_manage_source_qa_assignment(v_actor) then
      return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
        'error','Chỉ Admin và Quản lý QA được sửa danh mục Source');
    end if;
  end if;

  if jsonb_typeof(v_patch)<>'object' then
    return jsonb_build_object('ok',false,'error_code','PATCH_INVALID',
      'error','Patch phải là JSON object');
  end if;
  select array_agg(key order by key) into v_bad
  from jsonb_object_keys(v_patch) key
  where key<>all(array[
    'object_name','department','area_code','line','status','show_flag',
    'validate_flag','validate_reason','frequency_months','report_class',
    'workdays','first_month','year_ref','note','critical_point','work_group',
    'complexity_score','quality_impact_score','criticality_score',
    'owner_person_id','support_person_id','owner_name','support_name',
    'is_active'
  ]::text[]);
  if v_bad is not null then
    return jsonb_build_object('ok',false,
      'error_code','PATCH_FIELD_NOT_ALLOWED',
      'error','Trường không được phép sửa: '||array_to_string(v_bad,', '));
  end if;
  if (v_patch?'owner_name' and not (v_patch?'owner_person_id'))
     or (v_patch?'support_name' and not (v_patch?'support_person_id')) then
    return jsonb_build_object('ok',false,'error_code','PERSON_ID_REQUIRED',
      'error','QA phụ trách/hỗ trợ phải được chọn bằng person_id');
  end if;

  -- Acquire the final table mode before the first Source tuple. The public
  -- wrapper already holds the per-object advisory drained by deployments.
  lock table public.vmp_source_objects in row exclusive mode;

  select source_object.* into v_source
  from public.vmp_source_objects source_object
  where source_object.object_kind=p_object_kind
    and source_object.object_code=p_object_code
  for update;

  if found and p_expected_version is not null
     and v_source.version is distinct from p_expected_version then
    return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
      'error','Bản ghi đã được người khác sửa','current_version',v_source.version);
  end if;

  select coalesce(jsonb_object_agg(entry.key,entry.value),'{}'::jsonb)
    into v_timeline_patch
  from jsonb_each(v_patch) entry
  where entry.key=any(public.vmp_catalog_timeline_fields());
  v_timeline_change:=v_timeline_patch<>'{}'::jsonb;

  begin
    if v_patch?'owner_person_id'
       and nullif(v_patch->>'owner_person_id','') is not null then
      v_owner_id:=(v_patch->>'owner_person_id')::uuid;
    elsif v_patch?'owner_person_id' then
      v_owner_id:=null;
    else
      v_owner_id:=v_source.owner_person_id;
    end if;
    if v_patch?'support_person_id'
       and nullif(v_patch->>'support_person_id','') is not null then
      v_support_id:=(v_patch->>'support_person_id')::uuid;
    elsif v_patch?'support_person_id' then
      v_support_id:=null;
    else
      v_support_id:=v_source.support_person_id;
    end if;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'error_code','INVALID_PERSON_ID',
      'error','person_id không đúng định dạng UUID');
  end;

  v_owner_change:=(v_patch?'owner_person_id')
    and v_owner_id is distinct from v_source.owner_person_id;
  v_support_change:=(v_patch?'support_person_id')
    and v_support_id is distinct from v_source.support_person_id;
  v_access_change:=v_owner_change or v_support_change;

  if (v_access_change or v_timeline_change)
     and nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'error_code','REASON_REQUIRED',
      'error','Sửa quyền hoặc timeline phải nhập lý do');
  end if;

  -- Retained now-ineligible selections do not block unrelated master saves.
  -- Any actual access change validates the complete resulting relationship.
  if v_access_change then
    perform 1 from public.profiles profile
    where profile.id in (
      select performer.user_id from public.vmp_performers performer
      where performer.id=any(array[v_owner_id,v_support_id]::uuid[])
    ) order by profile.id for share;
    perform 1 from public.vmp_performers performer
    where performer.id=any(array[v_owner_id,v_support_id]::uuid[])
    order by performer.id for share;

    if v_owner_id is not null then
      select performer.* into v_owner
      from public.vmp_performers performer
      join public.profiles profile on profile.id=performer.user_id
      where performer.id=v_owner_id and performer.is_active
        and performer.user_id is not null and profile.is_active
        and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager');
      if not found or (select count(*) from public.vmp_performers performer
                       where performer.user_id=v_owner.user_id
                         and performer.is_active)<>1 then
        return jsonb_build_object('ok',false,
          'error_code','PERSON_NOT_ELIGIBLE',
          'error','QA phụ trách không phải principal QA hoạt động duy nhất');
      end if;
    end if;
    if v_support_id is not null then
      select performer.* into v_support
      from public.vmp_performers performer
      join public.profiles profile on profile.id=performer.user_id
      where performer.id=v_support_id and performer.is_active
        and performer.user_id is not null and profile.is_active
        and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager');
      if not found or (select count(*) from public.vmp_performers performer
                       where performer.user_id=v_support.user_id
                         and performer.is_active)<>1 then
        return jsonb_build_object('ok',false,
          'error_code','PERSON_NOT_ELIGIBLE',
          'error','QA hỗ trợ không phải principal QA hoạt động duy nhất');
      end if;
    end if;
  end if;

  -- The legacy master upsert applies every key it receives immediately. Keep
  -- planned-timeline keys out of that call so mixed saves commit access/master
  -- now while the timeline subset remains pending until preview/apply.
  v_master_patch:=v_patch-array[
    'owner_person_id','support_person_id','owner_name','support_name',
    'frequency_months','first_month','report_class','workdays',
    'validate_flag','is_active'
  ]::text[];
  v_result:=public.vmp_upsert_source_object_before_person_id(
    p_object_kind,p_object_code,v_master_patch);
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    return v_result;
  end if;

  select source_object.* into strict v_after
  from public.vmp_source_objects source_object
  where source_object.id=(v_result->>'id')::uuid
  for update;
  if v_source.id is null then
    v_source:=v_after;
  end if;

  select coalesce(jsonb_object_agg(field,to_jsonb(v_source)->field),
                  '{}'::jsonb)
    into v_timeline_old
  from unnest(public.vmp_catalog_timeline_fields()) field
  where v_timeline_patch?field;

  update public.vmp_source_objects source_object
  set owner_person_id=case when v_owner_change
        then v_owner_id else source_object.owner_person_id end,
      owner_name=case when v_owner_change
        then case when v_owner_id is null then null
                  else v_owner.performer_name end
        else source_object.owner_name end,
      support_person_id=case when v_support_change
        then v_support_id else source_object.support_person_id end,
      support_name=case when v_support_change
        then case when v_support_id is null then null
                  else v_support.performer_name end
        else source_object.support_name end,
      version=coalesce(source_object.version,1)+1,
      timeline_revision=coalesce(source_object.timeline_revision,0)+
        case when v_timeline_change then 1 else 0 end,
      updated_by=coalesce(v_actor,source_object.updated_by),updated_at=now()
  where source_object.id=v_after.id
  returning source_object.* into strict v_after;

  if v_access_change then
    perform public.vmp_reconcile_source_qa_projection(v_after.id);
  end if;

  -- Disposable-clone failpoint for the required runtime atomicity proof. It is
  -- inert unless the reviewed test fixture marker exists, and fires only after
  -- Source and every related item/assignment projection has been written in
  -- this function's subtransaction.
  if current_setting('vmp.source_access_save_failpoint',true)=
       'after_projection_before_audit'
     and exists (
       select 1 from public.system_config
       where key='five_role_test_fixture' and value='true'::jsonb
     ) then
    raise exception using errcode='check_violation',
      message='SACCESS_RUNTIME_SAVE_FAILURE_AFTER_PROJECTION';
  end if;

  select array_agg(key order by key) into v_changed_fields
  from jsonb_object_keys(v_patch) key;
  insert into public.audit_logs(
    user_id,action,table_name,record_id,changed_fields,change_reason,
    old_data,new_data,source,effective_business_role
  ) values (
    v_actor,'UPDATE'::public.audit_action,'vmp_source_objects',
    v_after.id::text,coalesce(v_changed_fields,'{}'::text[]),
    nullif(btrim(coalesce(p_reason,'')),''),to_jsonb(v_source),to_jsonb(v_after),
    'source_catalog_access_save',v_role
  );

  if v_timeline_change then
    update public.vmp_catalog_changes
    set status='superseded'
    where object_kind=p_object_kind and object_code=p_object_code
      and status in ('pending','previewed');
    insert into public.vmp_catalog_changes(
      object_kind,object_code,source_version,timeline_revision,
      old_data,new_data,created_by
    ) values (
      p_object_kind,p_object_code,v_after.version,v_after.timeline_revision,
      v_timeline_old,v_timeline_patch,v_actor
    ) returning id into v_change_id;
  end if;

  return jsonb_build_object(
    'ok',true,'object_code',p_object_code,'change_id',v_change_id,
    'version',v_after.version,'timeline_revision',v_after.timeline_revision,
    'timeline_applied_revision',v_after.timeline_applied_revision,
    'pending_timeline',coalesce(v_after.timeline_revision,0)>
                       coalesce(v_after.timeline_applied_revision,0),
    'reason',nullif(btrim(coalesce(p_reason,'')),'')
  );
exception when others then
  raise log 'SOURCE_ACCESS_SAVE_ERROR code=% sqlstate=% error=%',
    p_object_code,sqlstate,sqlerrm;
  return jsonb_build_object('ok',false,'error_code','SAVE_FAILED',
    'error',sqlerrm,'sqlstate',sqlstate);
end
$$;


--
-- Name: rpc_save_product_gmp("text", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_save_product_gmp"("p_bfo_code" "text", "p_patch" "jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_expected_version" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_save_product_gmp__five_role_impl_20260824(p_bfo_code, p_patch, p_reason, p_expected_version); end $$;


--
-- Name: rpc_save_product_gmp__five_role_impl_20260824("text", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_save_product_gmp__five_role_impl_20260824"("p_bfo_code" "text", "p_patch" "jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_expected_version" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_role  text := public.vmp_business_role(auth.uid());
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_bad   text[];
  v_hien  public.vmp_products_gmp%rowtype;
  v_ket   jsonb;
  v_ver   integer;
begin
  -- Quyền hỏi resolver, không đọc bảng ma trận màn hình: bảng đó sửa
  -- được lúc chạy nên không thể là nguồn chân lý của quyền ghi.
  if coalesce(auth.role(), '') <> 'service_role'
     and v_role is distinct from 'admin'
     and v_role is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được sửa danh mục sản phẩm GMP');
  end if;

  -- Khoá lạ là dấu hiệu client gửi sai, không phải thứ nên bỏ qua im lặng.
  select array_agg(key order by key) into v_bad
  from jsonb_object_keys(v_patch) key
  where key <> all(array[
    'product_name', 'ingredients', 'strength', 'production_line',
    'dosage_form', 'primary_pack', 'batch_size', 'note',
    'mixing_tank', 'final_batch_size', 'is_active'
  ]::text[]);
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PATCH_FIELD_NOT_ALLOWED',
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad, ', '));
  end if;

  select * into v_hien from public.vmp_products_gmp where bfo_code = p_bfo_code;

  if v_hien.id is not null and p_expected_version is not null
     and v_hien.version is distinct from p_expected_version then
    return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Bản ghi đã được người khác sửa. Tải lại để xem thay đổi rồi lưu lại.',
      'current_version', v_hien.version);
  end if;

  -- Ngừng hoạt động một sản phẩm là quyết định có hệ quả: mọi báo cáo sau
  -- đó sẽ không còn nó. Phải nói vì sao.
  if v_hien.id is not null
     and (v_patch ? 'is_active')
     and coalesce((v_patch ->> 'is_active')::boolean, true) is false
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Ngừng hoạt động một sản phẩm thì phải nhập lý do');
  end if;

  -- Dùng lại đường ghi đã có: giữ nguyên chuẩn hoá và ràng buộc sẵn có,
  -- không chép luật sang đây.
  v_ket := public.rpc_upsert_product_gmp(p_bfo_code, v_patch);
  if coalesce((v_ket ->> 'ok')::boolean, false) is not true then
    return v_ket;
  end if;

  update public.vmp_products_gmp
  set version = coalesce(version, 1) + 1
  where bfo_code = p_bfo_code
  returning version into v_ver;

  insert into public.audit_logs (
    id, user_id, action, table_name, record_id,
    old_data, new_data, change_reason, source, effective_business_role)
  values (
    gen_random_uuid(), v_actor,
    (case when v_hien.id is null then 'INSERT' else 'UPDATE' end)::audit_action,
    'vmp_products_gmp', p_bfo_code,
    to_jsonb(v_hien), v_patch,
    nullif(btrim(coalesce(p_reason, '')), ''), 'rpc_save_product_gmp', v_role);

  return jsonb_build_object('ok', true, 'bfo_code', p_bfo_code, 'version', v_ver);
end
$$;


--
-- Name: rpc_set_assignment("text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_assignment"("p_staff_name" "text", "p_department" "text", "p_validation_type" "text", "p_line" "text", "p_vai_tro" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_set_assignment__five_role_impl_20260824(p_staff_name, p_department, p_validation_type, p_line, p_vai_tro); end $$;


--
-- Name: rpc_set_assignment__five_role_impl_20260824("text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_assignment__five_role_impl_20260824"("p_staff_name" "text", "p_department" "text", "p_validation_type" "text", "p_line" "text", "p_vai_tro" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_ten  text := nullif(btrim(p_staff_name), '');
  v_bp   text := nullif(btrim(p_department), '');
  v_loai text := nullif(btrim(p_validation_type), '');
  v_line text := coalesce(nullif(btrim(p_line), ''), '*');
  v_vai  text := nullif(btrim(coalesce(p_vai_tro, '')), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa ma trận phân công');
  end if;
  if v_ten is null or v_bp is null or v_loai is null then
    return jsonb_build_object('ok', false, 'error', 'Thiếu tên nhân viên, bộ phận hoặc loại thẩm định');
  end if;
  if v_vai is not null and v_vai not in ('thuc_hien', 'ho_tro') then
    return jsonb_build_object('ok', false, 'error', 'Vai trò chỉ nhận thuc_hien hoặc ho_tro');
  end if;

  if v_vai is null then
    delete from public.vmp_assignment_matrix
     where staff_name = v_ten and validation_type = v_loai and line = v_line;
    insert into audit_logs (user_id, action, table_name, record_id,
                            new_data, change_reason, source, changed_fields)
    values (auth.uid(), 'DELETE', 'vmp_assignment_matrix', v_ten,
            jsonb_build_object('loai', v_loai, 'line', v_line, 'bo_phan', v_bp),
            'Bỏ phân công từ màn Phân quyền', 'dashboard_rpc', array['vai_tro']);
    return jsonb_build_object('ok', true, 'msg', 'Đã bỏ phân công', 'vai_tro', null);
  end if;

  insert into public.vmp_assignment_matrix
    (staff_name, department, validation_type, line, vai_tro, created_by, updated_by)
  values (v_ten, v_bp, v_loai, v_line, v_vai, auth.uid(), auth.uid())
  on conflict (staff_name, validation_type, line) do update
    set vai_tro    = excluded.vai_tro,
        department = excluded.department,
        is_active  = true,
        updated_by = auth.uid();

  insert into audit_logs (user_id, action, table_name, record_id,
                          new_data, change_reason, source, changed_fields)
  values (auth.uid(), 'UPDATE', 'vmp_assignment_matrix', v_ten,
          jsonb_build_object('loai', v_loai, 'line', v_line, 'bo_phan', v_bp, 'vai_tro', v_vai),
          'Phân công từ màn Phân quyền', 'dashboard_rpc', array['vai_tro']);

  return jsonb_build_object('ok', true, 'msg', 'Đã lưu phân công', 'vai_tro', v_vai);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


--
-- Name: rpc_set_business_role("uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_business_role"("p_user_id" "uuid", "p_business_role" "text", "p_department" "text" DEFAULT NULL::"text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_set_business_role__five_role_impl_20260824(p_user_id, p_business_role, p_department, p_reason); end $$;


--
-- Name: rpc_set_business_role__five_role_impl_20260824("uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_business_role__five_role_impl_20260824"("p_user_id" "uuid", "p_business_role" "text", "p_department" "text" DEFAULT NULL::"text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_me         uuid := auth.uid();
  v_my_role    text;
  v_old        public.profiles%rowtype;
  v_person     public.vmp_performers%rowtype;
  v_so_admin   integer;
  v_reason     text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dept       text := nullif(btrim(coalesce(p_department, '')), '');
  v_login_role text;
  v_access     text;
  v_giai_ra    text;
begin
  select role::text into v_my_role
  from public.profiles
  where id = v_me and coalesce(is_active, true);

  if v_my_role is null then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Không xác định được người dùng');
  end if;

  if not public.duoc_phep('admin_users', v_my_role) then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ admin được đổi vai');
  end if;

  if v_reason is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do đổi vai');
  end if;

  /* Vai nghiệp vụ → cặp (login_role, access_class). Đây là chỗ DUY NHẤT
     ánh xạ này được viết ở đường ghi; client chỉ gửi tên vai. */
  case p_business_role
    when 'admin'            then v_login_role := 'admin';           v_access := null;
    when 'viewer'           then v_login_role := 'viewer';          v_access := null;
    when 'qa_manager'       then v_login_role := 'qa_manager';      v_access := 'qa_manager';      v_dept := coalesce(v_dept, 'qa');
    when 'qa_staff'         then v_login_role := 'department_user'; v_access := 'qa_progress_editor'; v_dept := coalesce(v_dept, 'qa');
    when 'workshop_manager' then v_login_role := 'department_user'; v_access := 'equipment_manager';
    when 'workshop_staff'   then v_login_role := 'department_user'; v_access := 'workshop_staff';
    else
      return jsonb_build_object('ok', false, 'error_code', 'INVALID_ROLE',
        'error', 'Vai nghiệp vụ không hợp lệ: ' || coalesce(p_business_role, '(rỗng)'));
  end case;

  if v_login_role = 'department_user' and v_dept is null then
    return jsonb_build_object('ok', false, 'error_code', 'DEPARTMENT_REQUIRED',
      'error', 'Vai này bắt buộc có bộ phận.');
  end if;

  /* Cùng advisory key và thứ tự khoá với rpc_set_user_role / RPC link. */
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vmp:item-permission-account:' || p_user_id::text, 0));

  select * into v_person from public.vmp_performers where user_id = p_user_id for update;
  select * into v_old    from public.profiles       where id      = p_user_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'ACCOUNT_NOT_FOUND',
      'error', 'Không tìm thấy tài khoản');
  end if;

  if p_user_id = v_me and p_business_role <> 'admin' and v_old.role::text = 'admin' then
    return jsonb_build_object('ok', false, 'error_code', 'SELF_DEMOTION_FORBIDDEN',
      'error', 'Không tự hạ vai của chính mình — hạ xong sẽ không vào lại được để sửa.');
  end if;

  if v_old.role::text = 'admin' and v_login_role <> 'admin' then
    select count(*) into v_so_admin
    from public.profiles
    where role::text = 'admin' and coalesce(is_active, true) and id <> p_user_id;
    if v_so_admin = 0 then
      return jsonb_build_object('ok', false, 'error_code', 'LAST_ADMIN_PROTECTED',
        'error', 'Đây là admin đang hoạt động cuối cùng — không thể hạ vai.');
    end if;
  end if;

  /* Vai cần hồ sơ nhân sự mà chưa có hồ sơ thì nói thẳng: tạo hộ một hồ
     sơ ở đây là đoán thay người dùng (tên? mã NV? bộ phận nào?). */
  if v_access is not null and v_person.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'PERSON_REQUIRED',
      'error', 'Vai này cần hồ sơ nhân sự đã nối với tài khoản. Hãy nối tài khoản với người trong Danh bạ nhân sự trước.');
  end if;

  update public.profiles
  set role       = v_login_role::public.user_role,
      department = case when v_login_role in ('admin', 'viewer') then v_old.department else v_dept end,
      updated_at = now()
  where id = p_user_id;

  if v_person.id is not null then
    update public.vmp_performers
    set access_class = v_access,
        department   = coalesce(v_dept, department)
    where id = v_person.id;
  end if;

  /* CHỐT CUỐI: tự đọc lại bằng chính hàm mà cả hệ dùng để quyết quyền.
     Không khớp thì ném lỗi — transaction rollback, không có trạng thái
     lệch nào lọt ra. Đây là điều mà sửa tay trên Supabase không có. */
  v_giai_ra := public.vmp_business_role(p_user_id);
  if v_giai_ra is distinct from p_business_role then
    raise exception
      'Đổi vai xong nhưng hệ giải ra "%" thay vì "%" — đã huỷ thay đổi. Lý do: %',
      coalesce(v_giai_ra, 'không giải được'), p_business_role,
      coalesce(public.vmp_business_role_unresolved_reason(p_user_id), 'không rõ');
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_me, 'UPDATE', 'profiles', p_user_id::text,
    jsonb_build_object('role', v_old.role, 'department', v_old.department,
                       'access_class', v_person.access_class),
    jsonb_build_object('role', v_login_role, 'department', v_dept,
                       'access_class', v_access, 'business_role', p_business_role),
    v_reason, 'dashboard_rpc', array['role', 'department', 'access_class']
  );

  return jsonb_build_object('ok', true, 'business_role', v_giai_ra,
    'role', v_login_role, 'department', v_dept, 'access_class', v_access,
    'email', v_old.email, 'full_name', v_old.full_name);
end;
$$;


--
-- Name: FUNCTION "rpc_set_business_role__five_role_impl_20260824"("p_user_id" "uuid", "p_business_role" "text", "p_department" "text", "p_reason" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_set_business_role__five_role_impl_20260824"("p_user_id" "uuid", "p_business_role" "text", "p_department" "text", "p_reason" "text") IS 'Admin đặt VAI NGHIỆP VỤ từ web: ghi đồng thời profiles.role và vmp_performers.access_class trong một transaction, assert vmp_business_role() khớp trước khi commit. Thay cho việc sửa tay trên Supabase (chỉ đổi một bảng → lệch cặp → mất quyền xem).';


--
-- Name: rpc_set_catalog_import_row_reason("uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_catalog_import_row_reason"("p_batch_id" "uuid", "p_row_number" integer, "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_set_catalog_import_row_reason__five_role_impl_20260824(p_batch_id, p_row_number, p_reason); end $$;


--
-- Name: rpc_set_catalog_import_row_reason__five_role_impl_20260824("uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_catalog_import_row_reason__five_role_impl_20260824"("p_batch_id" "uuid", "p_row_number" integer, "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_batch public.vmp_catalog_import_batches%rowtype;
begin
  select * into v_batch from public.vmp_catalog_import_batches
  where id = p_batch_id
  for update;

  if v_batch.id is null or v_batch.uploaded_by is distinct from v_actor then
    -- Không phân biệt "không tồn tại" với "của người khác": cả hai đều là
    -- "không có lô nào của anh mang id này", và nói rõ hơn là lộ thông tin.
    return jsonb_build_object('ok', false, 'error_code', 'BATCH_NOT_FOUND',
      'error', 'Không có lô nhập nào của bạn mang mã này');
  end if;
  if v_batch.status <> 'validated' then
    return jsonb_build_object('ok', false, 'error_code', 'BATCH_NOT_EDITABLE',
      'error', 'Lô đã ' || v_batch.status || ' — không sửa được nữa');
  end if;

  update public.vmp_catalog_import_rows
  set row_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where batch_id = p_batch_id and row_number = p_row_number;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'ROW_NOT_FOUND',
      'error', 'Lô không có dòng số ' || p_row_number);
  end if;

  return jsonb_build_object('ok', true, 'batch_id', p_batch_id,
    'row_number', p_row_number);
end
$$;


--
-- Name: rpc_set_email_cho_phep("text", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_email_cho_phep"("p_email" "text", "p_cho_phep" boolean, "p_ghi_chu" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_set_email_cho_phep__five_role_impl_20260824(p_email, p_cho_phep, p_ghi_chu); end $$;


--
-- Name: rpc_set_email_cho_phep__five_role_impl_20260824("text", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_email_cho_phep__five_role_impl_20260824"("p_email" "text", "p_cho_phep" boolean, "p_ghi_chu" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_vai   text;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select role::text into v_vai from profiles where id = auth.uid();
  if v_vai is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('admin_users', v_vai) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin được sửa danh sách email');
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'Email không đúng dạng');
  end if;

  /* Không cho bỏ email của tài khoản ĐANG hoạt động: bỏ xong thì lần
     khôi phục mật khẩu hay tạo lại tài khoản của chính người đó sẽ bị
     chặn, mà lúc đó không ai nhớ là do dòng này. */
  if not p_cho_phep and exists (
    select 1 from auth.users u join profiles p on p.id = u.id
     where lower(btrim(u.email)) = v_email and coalesce(p.is_active, true)
  ) then
    return jsonb_build_object('ok', false, 'error',
      'Email này đang gắn với một tài khoản đang hoạt động. Tắt tài khoản đó trước.');
  end if;

  if p_cho_phep then
    insert into public.vmp_email_cho_phep (email, ghi_chu, is_active, created_by)
    values (v_email, nullif(btrim(coalesce(p_ghi_chu, '')), ''), true, auth.uid())
    on conflict (email) do update
      set is_active = true,
          ghi_chu = coalesce(excluded.ghi_chu, public.vmp_email_cho_phep.ghi_chu);
  else
    update public.vmp_email_cho_phep set is_active = false where email = v_email;
  end if;

  insert into audit_logs (user_id, action, table_name, record_id,
                          new_data, change_reason, source, changed_fields)
  values (auth.uid(), 'CONFIG_CHANGE', 'vmp_email_cho_phep', v_email,
          jsonb_build_object('cho_phep', p_cho_phep, 'ghi_chu', p_ghi_chu),
          'Sửa danh sách email được phép tạo tài khoản', 'dashboard_rpc', array['is_active']);

  return jsonb_build_object('ok', true,
    'msg', case when p_cho_phep then 'Đã cho phép email này tạo tài khoản'
                else 'Đã bỏ email khỏi danh sách' end);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$_$;


--
-- Name: rpc_set_item_assignment("uuid", "text", "text", "text", "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_item_assignment"("p_person_id" "uuid", "p_validation_code" "text", "p_assignment_kind" "text", "p_assignment_role" "text", "p_action" "text", "p_reason" "text", "p_expected_primary_assignment_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_set_item_assignment__five_role_impl_20260824(p_person_id, p_validation_code, p_assignment_kind, p_assignment_role, p_action, p_reason, p_expected_primary_assignment_id); end $$;


--
-- Name: rpc_set_item_assignment__five_role_impl_20260824("uuid", "text", "text", "text", "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_item_assignment__five_role_impl_20260824"("p_person_id" "uuid", "p_validation_code" "text", "p_assignment_kind" "text", "p_assignment_role" "text", "p_action" "text", "p_reason" "text", "p_expected_primary_assignment_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_principal record;
  v_target public.vmp_performers%rowtype;
  v_object_department text;
  v_object_area text;
  v_object_line text;
  v_source text;
  v_scope_match boolean;
  v_area_match boolean;
  v_assignment_id uuid;
  v_existing_primary_id uuid;
  v_old_assignments jsonb;
  v_new_assignments jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do phân công'
    );
  end if;
  if p_assignment_kind is null
      or p_assignment_kind not in ('qa', 'equipment_department') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_KIND',
      'error', 'Loại phân công không hợp lệ'
    );
  end if;
  if p_assignment_kind = 'qa'
      and (p_assignment_role is null
        or p_assignment_role not in ('primary', 'collaborator')) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_ROLE',
      'error', 'Phân công QA phải là phụ trách chính hoặc phối hợp'
    );
  end if;
  if p_assignment_kind = 'equipment_department'
      and p_assignment_role is not null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_ROLE',
      'error', 'Phân công thiết bị không nhận vai trò QA'
    );
  end if;
  if p_action is null
      or p_action not in ('assign', 'revoke', 'replace_primary') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_ACTION',
      'error', 'Hành động chỉ nhận assign, revoke hoặc replace_primary'
    );
  end if;
  if p_action = 'replace_primary'
      and (p_assignment_kind <> 'qa' or p_assignment_role <> 'primary') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_ACTION',
      'error', 'replace_primary chỉ dùng để thay QA phụ trách chính'
    );
  end if;

  select * into v_principal from public.vmp_manager_principal(v_actor);
  if v_principal.principal_kind is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Principal quản lý không hợp lệ hoặc không nhất quán'
    );
  end if;

  select * into v_target
  from public.vmp_performers
  where id = p_person_id and is_active
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PERSON_NOT_FOUND',
      'error', 'Không tìm thấy nhân viên hoạt động'
    );
  end if;
  if p_assignment_kind = 'qa' and (
      v_target.department is distinct from 'qa'
      or v_target.access_class is distinct from 'qa_progress_editor'
    ) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'QA_TARGET_NOT_ASSIGNABLE',
      'error', 'Chỉ phân công được nhân viên QA xử lý tiến độ'
    );
  end if;

  select object.department, object.area, object.line
  into v_object_department, v_object_area, v_object_line
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.validation_code = p_validation_code and item.is_active
  for update of item;
  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ITEM_NOT_FOUND',
      'error', 'Không tìm thấy hạng mục thẩm định'
    );
  end if;

  if v_principal.principal_kind = 'qa_manager' then
    if p_assignment_kind <> 'qa' then
      return jsonb_build_object(
        'ok', false, 'error_code', 'FORBIDDEN_ASSIGNMENT_KIND',
        'error', 'Quản lý QA chỉ phân công loại QA'
      );
    end if;
  elsif v_principal.principal_kind = 'equipment_manager' then
    if p_assignment_kind <> 'equipment_department' then
      return jsonb_build_object(
        'ok', false, 'error_code', 'FORBIDDEN_ASSIGNMENT_KIND',
        'error', 'Quản lý bộ phận thiết bị chỉ phân công nhân sự bộ phận'
      );
    end if;
    if v_principal.profile_department is null
        or v_target.department is distinct from v_principal.profile_department
        or v_object_department is distinct from v_principal.profile_department then
      return jsonb_build_object(
        'ok', false, 'error_code', 'OUTSIDE_MANAGER_DEPARTMENT',
        'error', 'Chỉ phân công người cùng bộ phận cho hạng mục do bộ phận mình quản lý'
      );
    end if;
    v_scope_match := coalesce(
      '*' = any(v_principal.scope_departments)
      or v_object_department = any(v_principal.scope_departments),
      false
    );
    v_area_match := coalesce(
      '*' = any(v_principal.access_areas)
      or v_object_area = any(v_principal.access_areas)
      or v_object_line = any(v_principal.access_areas),
      false
    );
    if not v_scope_match or not v_area_match then
      return jsonb_build_object(
        'ok', false, 'error_code', 'OUTSIDE_MANAGER_SCOPE',
        'error', 'Hạng mục ngoài phạm vi/khu vực quản lý'
      );
    end if;
  elsif v_principal.principal_kind <> 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Bạn không có quyền phân công hạng mục'
    );
  end if;

  perform assignment.id
  from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.assignment_kind = p_assignment_kind
  order by assignment.id
  for update;

  select assignment.id into v_existing_primary_id
  from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.assignment_kind = 'qa'
    and assignment.assignment_role = 'primary'
    and assignment.is_active
  order by assignment.id
  limit 1;

  if p_action = 'replace_primary' then
    if p_expected_primary_assignment_id is null then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PRIMARY_EXPECTATION_REQUIRED',
        'error', 'Cần tải lại QA phụ trách chính trước khi xác nhận thay thế',
        'current_primary_assignment_id', v_existing_primary_id
      );
    end if;
    if p_expected_primary_assignment_id is distinct from v_existing_primary_id then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PRIMARY_CONFLICT',
        'error', 'QA phụ trách chính vừa thay đổi; hãy kiểm tra danh sách mới rồi thử lại',
        'expected_primary_assignment_id', p_expected_primary_assignment_id,
        'current_primary_assignment_id', v_existing_primary_id
      );
    end if;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(assignment) order by assignment.id), '[]'::jsonb
  ) into v_old_assignments
  from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.assignment_kind = p_assignment_kind;

  v_source := case when p_assignment_kind = 'qa'
    then 'qa_manager' else 'equipment_manager' end;

  if p_action = 'revoke' then
    update public.vmp_item_assignments
    set is_active = false,
        change_reason = btrim(p_reason),
        updated_by = v_actor
    where validation_code = p_validation_code
      and performer_id = p_person_id
      and assignment_kind = p_assignment_kind
      and is_active;
  else
    if p_assignment_kind = 'qa' and p_assignment_role = 'primary'
        and p_action = 'assign' then
      select assignment.id into v_existing_primary_id
      from public.vmp_item_assignments assignment
      where assignment.validation_code = p_validation_code
        and assignment.assignment_kind = 'qa'
        and assignment.assignment_role = 'primary'
        and assignment.is_active
        and assignment.performer_id is distinct from p_person_id
      order by assignment.id
      limit 1;
      if v_existing_primary_id is not null then
        return jsonb_build_object(
          'ok', false, 'error_code', 'PRIMARY_ALREADY_EXISTS',
          'error', 'Hạng mục đã có QA phụ trách chính'
        );
      end if;
    end if;

    if p_action = 'replace_primary' then
      update public.vmp_item_assignments
      set assignment_role = 'collaborator',
          change_reason = btrim(p_reason),
          updated_by = v_actor
      where validation_code = p_validation_code
        and assignment_kind = 'qa'
        and assignment_role = 'primary'
        and is_active;
    end if;

    select assignment.id into v_assignment_id
    from public.vmp_item_assignments assignment
    where assignment.validation_code = p_validation_code
      and assignment.performer_id = p_person_id
      and assignment.assignment_kind = p_assignment_kind
    order by assignment.is_active desc,
             (assignment.source = v_source) desc,
             assignment.created_at,
             assignment.id
    limit 1;

    if v_assignment_id is null then
      insert into public.vmp_item_assignments (
        validation_code, performer_id, user_id, staff_name, employee_code,
        assignment_kind, assignment_role, source, source_text,
        unresolved_reason, is_active, change_reason, created_by, updated_by
      ) values (
        p_validation_code, v_target.id, v_target.user_id,
        v_target.performer_name, v_target.employee_code,
        p_assignment_kind, p_assignment_role, v_source,
        v_target.performer_name,
        case when v_target.user_id is null then 'account_unlinked' else null end,
        true, btrim(p_reason), v_actor, v_actor
      ) returning id into v_assignment_id;
    else
      update public.vmp_item_assignments
      set user_id = v_target.user_id,
          staff_name = v_target.performer_name,
          employee_code = v_target.employee_code,
          assignment_role = p_assignment_role,
          source_text = v_target.performer_name,
          unresolved_reason = case when v_target.user_id is null
            then 'account_unlinked' else null end,
          is_active = true,
          change_reason = btrim(p_reason),
          updated_by = v_actor
      where id = v_assignment_id;
    end if;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(assignment) order by assignment.id), '[]'::jsonb
  ) into v_new_assignments
  from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.assignment_kind = p_assignment_kind;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields, validation_code
  ) values (
    v_actor,
    case when p_action = 'revoke'
      then 'DELETE'::public.audit_action else 'UPDATE'::public.audit_action end,
    'vmp_item_assignments',
    p_validation_code || '×' || p_person_id::text,
    jsonb_build_object('assignments', v_old_assignments),
    jsonb_build_object(
      'person_id', p_person_id,
      'assignment_kind', p_assignment_kind,
      'assignment_role', p_assignment_role,
      'action', p_action,
      'assignments', v_new_assignments
    ),
    btrim(p_reason), 'dashboard_rpc',
    array['assignment_role', 'is_active'], p_validation_code
  );

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'source', v_source,
    'assignment_role', p_assignment_role,
    'account_status', case when v_target.user_id is null
      then 'unlinked' else 'linked' end
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ASSIGNMENT_CONFLICT',
      'error', 'Phân công vừa được thay đổi ở phiên khác'
    );
  when others then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ASSIGNMENT_MUTATION_FAILED', 'error', sqlerrm
    );
end
$$;


--
-- Name: rpc_set_item_performer("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_item_performer"("p_validation_code" "text", "p_performer_name" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when coalesce(auth.role(), '') = 'service_role'
      or public.vmp_current_session_is_active() then jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_ID_REQUIRED',
        'error', 'Đường gán theo tên đã ngừng hỗ trợ; phải chọn người bằng person_id'
      )
    else public.vmp_session_denial()
  end
$$;


--
-- Name: rpc_set_item_performer_by_id("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_item_performer_by_id"("p_validation_code" "text", "p_person_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_set_item_performer_by_id__five_role_impl_20260824(p_validation_code, p_person_id, p_reason); end $$;


--
-- Name: rpc_set_item_performer_by_id__five_role_impl_20260824("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_item_performer_by_id__five_role_impl_20260824"("p_validation_code" "text", "p_person_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_principal_kind text;
  v_object_code text;
  v_person public.vmp_performers%rowtype;
  v_name text;
  v_items integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    select principal.principal_kind into v_principal_kind
    from public.vmp_manager_principal(auth.uid()) principal;
    if v_principal_kind is null
        or v_principal_kind not in ('admin', 'qa_manager') then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'FORBIDDEN',
        'error', 'Chỉ Admin hoặc QA được phân công người thực hiện'
      );
    end if;
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do phân công'
    );
  end if;
  select item.object_code into v_object_code
  from public.vmp_visible_plan_items() item
  where item.validation_code = p_validation_code and item.is_active;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'ITEM_NOT_FOUND',
      'error', 'Không tìm thấy mã thẩm định'
    );
  end if;
  if p_person_id is not null then
    select * into v_person
    from public.vmp_performers
    where id = p_person_id and is_active;
    if not found then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_NOT_ACTIVE',
        'error', 'Người được chọn không tồn tại hoặc đã ngừng hoạt động'
      );
    end if;
    if v_principal_kind = 'qa_manager'
        and v_person.department is distinct from 'qa' then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_OUT_OF_SCOPE',
        'error', 'QA chỉ được chọn người trong bộ phận QA'
      );
    end if;
    v_name := v_person.performer_name;
  end if;

  perform set_config('app.audit_source', 'dashboard_rpc', true);
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.vmp_source_objects
  set owner_person_id = p_person_id,
      owner_name = v_name,
      updated_by = auth.uid()
  where object_code = v_object_code;
  update public.vmp_plan_items
  set owner_person_id = p_person_id,
      owner_name = v_name,
      updated_by = auth.uid(),
      updated_at = now()
  where object_code = v_object_code and is_active;
  get diagnostics v_items = row_count;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, new_data, change_reason,
    source, changed_fields, validation_code
  ) values (
    auth.uid(), 'UPDATE', 'vmp_source_objects', v_object_code,
    jsonb_build_object('owner_person_id', p_person_id, 'owner_name', v_name),
    btrim(p_reason), 'dashboard_rpc', array['owner_person_id', 'owner_name'],
    p_validation_code
  );
  return jsonb_build_object(
    'ok', true,
    'object_code', v_object_code,
    'person_id', p_person_id,
    'performer_name', v_name,
    'email', v_person.email,
    'items', v_items
  );
exception when others then
  return jsonb_build_object(
    'ok', false,
    'error_code', 'ASSIGNMENT_FAILED',
    'error', sqlerrm
  );
end
$$;


--
-- Name: rpc_set_item_permissions_mode("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_item_permissions_mode"("p_mode" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_set_item_permissions_mode__five_role_impl_20260824(p_mode, p_reason); end $$;


--
-- Name: rpc_set_item_permissions_mode__five_role_impl_20260824("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_item_permissions_mode__five_role_impl_20260824"("p_mode" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_old_mode text := public.item_permissions_mode();
  v_preflight jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if v_actor_role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Chỉ Admin đổi được chế độ phân quyền');
  end if;
  if p_mode not in ('preview', 'enforced') then
    return jsonb_build_object('ok', false, 'error', 'Chế độ chỉ nhận preview hoặc enforced');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do đổi chế độ');
  end if;

  if p_mode = 'enforced' then
    v_preflight := public.rpc_item_permission_preflight();
    if jsonb_array_length(coalesce(v_preflight->'blocking_errors', '[]'::jsonb)) > 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'Chưa thể bật áp dụng vì tiền kiểm còn lỗi bắt buộc',
        'preflight', v_preflight
      );
    end if;
  end if;

  update public.system_config
  set value = to_jsonb(p_mode), updated_by = v_actor, updated_at = now()
  where key = 'item_permissions_mode';

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor, 'CONFIG_CHANGE', 'system_config', 'item_permissions_mode',
    jsonb_build_object('mode', v_old_mode),
    jsonb_build_object('mode', p_mode),
    btrim(p_reason), 'dashboard_rpc', array['value']
  );

  return jsonb_build_object('ok', true, 'mode', p_mode);
end
$$;


--
-- Name: rpc_set_item_state("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_item_state"("p_validation_code" "text", "p_state" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_object_code text;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  select item.object_code into v_object_code
  from public.vmp_plan_items item
  where item.validation_code=p_validation_code;
  if v_object_code is not null then
    perform public.vmp_lock_source_plan_relations(array[v_object_code]);
  end if;
  return public.rpc_set_item_state__five_role_impl_20260824(
    p_validation_code,p_state,p_reason);
end
$$;


--
-- Name: rpc_set_item_state__five_role_impl_20260824("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_item_state__five_role_impl_20260824"("p_validation_code" "text", "p_state" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_state NOT IN ('active','not_applicable','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trạng thái không hợp lệ');
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF not public.duoc_phep('set_item_state', v_role::text) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Chỉ admin/QA manager được đổi trạng thái nghiệp vụ');
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cần nhập lý do (vd: thiết bị ngừng dùng / hủy theo phê duyệt…)');
  END IF;

  PERFORM set_config('app.audit_source', 'dashboard_state', true);
  PERFORM set_config('app.audit_reason', p_reason, true);

  UPDATE vmp_plan_items
  SET item_state = p_state, updated_by = auth.uid(), updated_at = NOW()
  WHERE validation_code = p_validation_code AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không tìm thấy mã: ' || p_validation_code);
  END IF;

  RETURN jsonb_build_object('ok', true, 'validation_code', p_validation_code, 'state', p_state);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;


--
-- Name: rpc_set_role_permission("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_role_permission"("p_hanh_dong" "text", "p_vai_tro" "text", "p_muc" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_toi uuid := auth.uid();
  v_vai text;
  v_cu  text;
  v_so_phan_cong int;
  /* Chỉ hành động nào có vế so bộ phận / phân công trong luật mới nhận
     hai mức mịn này. Hiện chỉ rpc_update_progress đi qua
     ly_do_khong_sua_duoc. */
  v_co_ve_min text[] := array['update_progress'];
begin
  select role::text into v_vai from profiles where id = v_toi;
  if v_vai is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('admin_users', v_vai) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin được sửa luật phân quyền');
  end if;
  if p_muc not in ('co', 'bo_phan', 'phan_cong', 'khong') then
    return jsonb_build_object('ok', false, 'error', 'Mức quyền không hợp lệ');
  end if;
  if not exists (select 1 from public.vmp_role_permissions
                  where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro) then
    return jsonb_build_object('ok', false, 'error',
      'Không có ô này trong ma trận: ' || coalesce(p_hanh_dong, '∅') || ' × ' || coalesce(p_vai_tro, '∅'));
  end if;

  if p_hanh_dong = 'admin_users' and p_vai_tro = 'admin' and p_muc <> 'co' then
    return jsonb_build_object('ok', false, 'error',
      'Không hạ được quyền quản trị của vai admin — hạ xong sẽ không còn ai mở lại được.');
  end if;

  if p_muc in ('bo_phan', 'phan_cong') and not (p_hanh_dong = any(v_co_ve_min)) then
    return jsonb_build_object('ok', false, 'error',
      'Hành động này chưa có vế so bộ phận trong luật, nên chỉ đặt được Được hoặc Không. '
      || 'Đặt mức hạn chế ở đây sẽ thành mở toàn quyền mà màn hình lại ghi là hạn chế.');
  end if;

  /* Bật "theo phân công" khi ma trận còn trống = khoá sạch vai đó mà
     người bật không hề biết. Chặn trước, và nói rõ phải làm gì. */
  if p_muc = 'phan_cong' then
    select count(*) into v_so_phan_cong from public.vmp_assignment_matrix where is_active;
    if v_so_phan_cong = 0 then
      return jsonb_build_object('ok', false, 'error',
        'Ma trận phân công (bảng D) chưa có ô nào được tích. Bật mức này bây giờ thì vai '
        || p_vai_tro || ' sẽ không sửa được hạng mục nào. Tích phân công trước rồi quay lại.');
    end if;
  end if;

  select muc into v_cu from public.vmp_role_permissions
   where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro;

  update public.vmp_role_permissions
     set muc = p_muc, updated_by = v_toi, updated_at = now()
   where hanh_dong = p_hanh_dong and vai_tro::text = p_vai_tro;

  insert into audit_logs (user_id, action, table_name, record_id,
                          old_data, new_data, change_reason, source, changed_fields)
  values (v_toi, 'CONFIG_CHANGE', 'vmp_role_permissions',
          p_hanh_dong || '×' || p_vai_tro,
          jsonb_build_object('muc', v_cu), jsonb_build_object('muc', p_muc),
          'Sửa ma trận vai trò × hành động từ màn Phân quyền',
          'dashboard_rpc', array['muc']);

  return jsonb_build_object('ok', true, 'msg', 'Đã lưu luật phân quyền', 'muc', p_muc);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


--
-- Name: rpc_set_source_workshop_scope_grant("uuid", "uuid", "text", "text", "text", boolean, "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_source_workshop_scope_grant"("p_grant_id" "uuid", "p_performer_id" "uuid", "p_department" "text", "p_area_code" "text", "p_line" "text", "p_is_active" boolean, "p_reason" "text", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_existing public.vmp_source_workshop_scope_grants%rowtype;
  v_changed public.vmp_source_workshop_scope_grants%rowtype;
  v_performer public.vmp_performers%rowtype;
  v_department text:=nullif(btrim(p_department),'');
  v_area text:=nullif(btrim(p_area_code),'');
  v_line text:=nullif(btrim(p_line),'');
  v_old jsonb;
begin
  if not public.vmp_can_manage_source_workshop_scope(v_actor) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Không có quyền quản lý phạm vi xưởng Source');
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'error_code','REASON_REQUIRED',
      'error','Thay đổi phạm vi xưởng phải nhập lý do');
  end if;
  if p_is_active is null then
    return jsonb_build_object('ok',false,'error_code','INVALID_ACTIVE_STATE',
      'error','Thiếu trạng thái phạm vi');
  end if;

  if p_grant_id is not null then
    select grant_row.* into v_existing
    from public.vmp_source_workshop_scope_grants grant_row
    where grant_row.id=p_grant_id;
    if not found then
      return jsonb_build_object('ok',false,'error_code','GRANT_NOT_FOUND',
        'error','Không tìm thấy phạm vi xưởng');
    end if;
    v_department:=coalesce(v_department,v_existing.department);
    v_area:=coalesce(v_area,v_existing.area_code);
    v_line:=case when p_line is null then null else v_line end;
  elsif not p_is_active then
    return jsonb_build_object('ok',false,'error_code','GRANT_NOT_FOUND',
      'error','Không thể thu hồi phạm vi chưa tồn tại');
  end if;

  if v_department is null or v_area is null then
    return jsonb_build_object('ok',false,'error_code','INVALID_SCOPE',
      'error','Phạm vi Source cần bộ phận và khu vực');
  end if;

  -- Lock every active Source row matching the requested tuple before the grant
  -- row. This preserves Source -> grant order for progress/revoke races.
  perform 1 from public.vmp_source_objects source_object
  where source_object.is_active
    and public.vmp_source_scope_key(source_object.department)=
        public.vmp_source_scope_key(v_department)
    and public.vmp_source_scope_key(source_object.area_code)=
        public.vmp_source_scope_key(v_area)
    and (v_line is null or public.vmp_source_scope_key(source_object.line)=
         public.vmp_source_scope_key(v_line))
  order by source_object.id for key share;
  if not found then
    return jsonb_build_object('ok',false,'error_code','SCOPE_NOT_FOUND',
      'error','Phạm vi không tồn tại trên Source hoạt động');
  end if;

  if p_grant_id is not null then
    select grant_row.* into strict v_existing
    from public.vmp_source_workshop_scope_grants grant_row
    where grant_row.id=p_grant_id for update;
    if p_expected_version is null
       or v_existing.version is distinct from p_expected_version then
      return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
        'error','Phạm vi đã được người khác sửa',
        'current_version',v_existing.version);
    end if;
  elsif p_expected_version is not null then
    return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
      'error','Tạo mới không nhận version cũ');
  end if;

  perform 1 from public.profiles profile
  where profile.id=(select performer.user_id
                    from public.vmp_performers performer
                    where performer.id=p_performer_id)
  for share;
  select performer.* into v_performer
  from public.vmp_performers performer
  join public.profiles profile on profile.id=performer.user_id
  where performer.id=p_performer_id and performer.is_active
    and performer.user_id is not null and profile.is_active
    and public.vmp_business_role(performer.user_id) in (
      'workshop_manager','workshop_staff'
    ) for share of performer;
  if not found or (select count(*) from public.vmp_performers performer
                   where performer.user_id=v_performer.user_id
                     and performer.is_active)<>1 then
    return jsonb_build_object('ok',false,
      'error_code','PERSON_NOT_ELIGIBLE',
      'error','Người xưởng không phải principal hoạt động duy nhất');
  end if;

  if p_grant_id is null then
    insert into public.vmp_source_workshop_scope_grants(
      performer_id,department,department_key,area_code,area_key,line,line_key,
      is_active,version,created_by,updated_by,change_reason
    ) values (
      p_performer_id,v_department,public.vmp_source_scope_key(v_department),
      v_area,public.vmp_source_scope_key(v_area),v_line,
      case when v_line is null then null
           else public.vmp_source_scope_key(v_line) end,
      true,1,v_actor,v_actor,btrim(p_reason)
    ) returning * into strict v_changed;
    insert into public.audit_logs(
      user_id,action,table_name,record_id,changed_fields,change_reason,
      old_data,new_data,source,effective_business_role
    ) values (
      v_actor,'INSERT'::public.audit_action,
      'vmp_source_workshop_scope_grants',v_changed.id::text,
      array['performer_id','department','area_code','line','is_active'],
      btrim(p_reason),null,to_jsonb(v_changed),'source_workshop_scope',v_role
    );
  else
    v_old:=to_jsonb(v_existing);
    update public.vmp_source_workshop_scope_grants grant_row
    set performer_id=p_performer_id,department=v_department,
        department_key=public.vmp_source_scope_key(v_department),
        area_code=v_area,area_key=public.vmp_source_scope_key(v_area),
        line=v_line,line_key=case when v_line is null then null
          else public.vmp_source_scope_key(v_line) end,
        is_active=p_is_active,version=grant_row.version+1,
        updated_at=transaction_timestamp(),updated_by=v_actor,
        change_reason=btrim(p_reason)
    where grant_row.id=p_grant_id
    returning * into strict v_changed;
    insert into public.audit_logs(
      user_id,action,table_name,record_id,changed_fields,change_reason,
      old_data,new_data,source,effective_business_role
    ) values (
      v_actor,'UPDATE'::public.audit_action,
      'vmp_source_workshop_scope_grants',v_changed.id::text,
      array['performer_id','department','area_code','line','is_active','version'],
      btrim(p_reason),v_old,to_jsonb(v_changed),'source_workshop_scope',v_role
    );
  end if;
  return jsonb_build_object('ok',true,'grant_id',v_changed.id,
    'version',v_changed.version,'is_active',v_changed.is_active);
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'error_code','DUPLICATE_ACTIVE_SCOPE',
      'error','Phạm vi hoạt động đã tồn tại');
end
$$;


--
-- Name: rpc_set_user_active("uuid", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_user_active"("p_user_id" "uuid", "p_active" boolean, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_set_user_active__five_role_impl_20260824(p_user_id, p_active, p_reason); end $$;


--
-- Name: rpc_set_user_active__five_role_impl_20260824("uuid", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_user_active__five_role_impl_20260824"("p_user_id" "uuid", "p_active" boolean, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_me       uuid := auth.uid();
  v_my_role  text;
  v_old      public.profiles%rowtype;
  v_so_admin integer;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select role::text into v_my_role
  from public.profiles
  where id = v_me and coalesce(is_active, true);

  if v_my_role is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Không xác định được người dùng'
    );
  end if;

  if not public.duoc_phep('admin_users', v_my_role) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ admin được bật/tắt tài khoản'
    );
  end if;

  if v_reason is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do bật/tắt tài khoản'
    );
  end if;

  if p_active is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_STATE',
      'error', 'Thiếu trạng thái bật/tắt'
    );
  end if;

  /* Cùng advisory key và thứ tự khoá với rpc_set_user_role / RPC link —
     hai RPC chạy đồng thời trên cùng tài khoản phải xếp hàng, không đan nhau. */
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'vmp:item-permission-account:' || p_user_id::text, 0
    )
  );

  select * into v_old
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_NOT_FOUND',
      'error', 'Không tìm thấy tài khoản'
    );
  end if;

  if p_user_id = v_me and not p_active then
    return jsonb_build_object(
      'ok', false, 'error_code', 'SELF_DEACTIVATION_FORBIDDEN',
      'error', 'Không tự tắt tài khoản của chính mình — tắt xong sẽ không vào lại được để bật.'
    );
  end if;

  if v_old.role::text = 'admin' and not p_active then
    select count(*) into v_so_admin
    from public.profiles
    where role::text = 'admin' and coalesce(is_active, true) and id <> p_user_id;
    if v_so_admin = 0 then
      return jsonb_build_object(
        'ok', false, 'error_code', 'LAST_ADMIN_PROTECTED',
        'error', 'Đây là admin đang hoạt động cuối cùng — không thể tắt.'
      );
    end if;
  end if;

  /* Không đổi gì thì nói thẳng, và KHÔNG ghi một dòng audit rỗng: nhật ký
     kiểm toán đầy dòng "sửa mà không đổi gì" là nhật ký khó đọc. */
  if coalesce(v_old.is_active, true) = p_active then
    return jsonb_build_object(
      'ok', true, 'unchanged', true,
      'is_active', p_active,
      'message', case when p_active
        then 'Tài khoản vốn đã đang hoạt động.'
        else 'Tài khoản vốn đã bị tắt.' end
    );
  end if;

  update public.profiles
  set is_active = p_active,
      updated_at = now()
  where id = p_user_id;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_me, 'UPDATE', 'profiles', p_user_id::text,
    jsonb_build_object('is_active', coalesce(v_old.is_active, true)),
    jsonb_build_object('is_active', p_active),
    v_reason, 'dashboard_rpc', array['is_active']
  );

  return jsonb_build_object(
    'ok', true,
    'is_active', p_active,
    'email', v_old.email,
    'full_name', v_old.full_name
  );
end;
$$;


--
-- Name: FUNCTION "rpc_set_user_active__five_role_impl_20260824"("p_user_id" "uuid", "p_active" boolean, "p_reason" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_set_user_active__five_role_impl_20260824"("p_user_id" "uuid", "p_active" boolean, "p_reason" "text") IS 'Admin bật/tắt tài khoản (profiles.is_active) từ web. Chặn tự tắt mình và tắt admin cuối cùng; bắt buộc lý do; ghi audit_logs source=dashboard_rpc.';


--
-- Name: rpc_set_user_role("uuid", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_user_role"("p_user_id" "uuid", "p_role" "text", "p_department" "text", "p_reason" "text" DEFAULT NULL::"text", "p_pham_vi" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_set_user_role__five_role_impl_20260824(p_user_id, p_role, p_department, p_reason, p_pham_vi); end $$;


--
-- Name: rpc_set_user_role__five_role_impl_20260824("uuid", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_set_user_role__five_role_impl_20260824"("p_user_id" "uuid", "p_role" "text", "p_department" "text", "p_reason" "text" DEFAULT NULL::"text", "p_pham_vi" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_me uuid := auth.uid();
  v_my_role text;
  v_old public.profiles%rowtype;
  v_linked public.vmp_performers%rowtype;
  v_so_admin integer;
  v_pv text := nullif(btrim(coalesce(p_pham_vi, '')), '');
  v_department text := nullif(btrim(coalesce(p_department, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select role::text into v_my_role
  from public.profiles
  where id = v_me and coalesce(is_active, true);
  if v_my_role is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Không xác định được người dùng'
    );
  end if;
  if not public.duoc_phep('admin_users', v_my_role) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ admin được đổi phân quyền'
    );
  end if;
  if v_reason is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do đổi phân quyền'
    );
  end if;

  /* Cùng advisory key và thứ tự lock với RPC link:
   * account advisory → performer → profile. */
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'vmp:item-permission-account:' || p_user_id::text, 0
    )
  );

  /* Refresh linked performer sau khi đã serialize account; không dùng snapshot
   * đọc trước lúc một RPC link concurrent commit. */
  select * into v_linked
  from public.vmp_performers
  where user_id = p_user_id
  for update;
  select * into v_old
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_NOT_FOUND',
      'error', 'Không tìm thấy tài khoản'
    );
  end if;
  if p_role not in ('admin', 'qa_manager', 'department_user', 'viewer') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ROLE',
      'error', 'Vai trò không hợp lệ'
    );
  end if;
  if v_pv is not null and v_pv not in ('co', 'bo_phan', 'phan_cong', 'khong') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_SCOPE',
      'error', 'Phạm vi không hợp lệ'
    );
  end if;
  if v_linked.id is not null and (
    p_role is distinct from v_old.role::text
    or v_department is distinct from v_old.department
  ) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_RELINK_REQUIRED',
      'error', 'Phải gỡ tài khoản khỏi hồ sơ trước khi đổi role hoặc department'
    );
  end if;
  if p_user_id = v_me and p_role <> 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'SELF_DEMOTION_FORBIDDEN',
      'error', 'Không tự hạ vai của chính mình — hạ xong sẽ không vào lại được để sửa.'
    );
  end if;
  if v_old.role::text = 'admin' and p_role <> 'admin' then
    select count(*) into v_so_admin
    from public.profiles
    where role::text = 'admin' and coalesce(is_active, true) and id <> p_user_id;
    if v_so_admin = 0 then
      return jsonb_build_object(
        'ok', false, 'error_code', 'LAST_ADMIN_PROTECTED',
        'error', 'Đây là admin đang hoạt động cuối cùng — không thể hạ vai.'
      );
    end if;
  end if;
  if p_role = 'department_user' and v_department is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'DEPARTMENT_REQUIRED',
      'error', 'Vai department_user bắt buộc có bộ phận.'
    );
  end if;
  if v_pv = 'phan_cong' and not exists (
    select 1
    from public.vmp_assignment_matrix assignment
    left join public.vmp_performers person on person.user_id = p_user_id
    where assignment.is_active
      and lower(btrim(assignment.staff_name)) = lower(btrim(coalesce(
        person.performer_name, v_old.full_name, ''
      )))
  ) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ASSIGNMENT_REQUIRED',
      'error', 'Người này chưa được tích ô phân công nào; hãy phân công trước.'
    );
  end if;

  update public.profiles
  set role = p_role::public.user_role,
      department = v_department,
      pham_vi = v_pv,
      updated_at = now()
  where id = p_user_id;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_me, 'UPDATE', 'profiles', p_user_id::text,
    jsonb_build_object(
      'role', v_old.role, 'department', v_old.department, 'pham_vi', v_old.pham_vi
    ),
    jsonb_build_object(
      'role', p_role, 'department', v_department, 'pham_vi', v_pv
    ),
    v_reason,
    'dashboard_rpc', array['role', 'department', 'pham_vi']
  );

  return jsonb_build_object(
    'ok', true, 'msg', 'Đã cập nhật phân quyền',
    'role', p_role, 'department', v_department, 'pham_vi', v_pv
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ROLE_UPDATE_FAILED', 'error', sqlerrm
    );
end
$$;


--
-- Name: rpc_source_field_suggestions("text", "text", "text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_source_field_suggestions"("p_object_kind" "text", "p_field" "text", "p_search" "text", "p_cursor" "jsonb", "p_limit" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_actor uuid:=auth.uid();
  v_field text:=lower(btrim(coalesce(p_field,'')));
  v_cursor text;
  v_rows jsonb;
  v_next jsonb;
  v_has_more boolean;
begin
  if not public.vmp_is_active_session(v_actor)
     or not public.vmp_can_manage_source_qa_assignment(v_actor) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được xem gợi ý Source');
  end if;
  if v_field<>all(array[
       'department','area_code','line','object_code','object_name',
       'owner_name','support_name','report_class','status','work_group'
     ]::text[]) then
    return jsonb_build_object('ok',false,'error_code','INVALID_FIELD',
      'error','Trường gợi ý không được hỗ trợ');
  end if;
  if p_limit is null or p_limit<1 or p_limit>50 then
    return jsonb_build_object('ok',false,'error_code','INVALID_LIMIT',
      'error','Giới hạn phải từ 1 đến 50');
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object'
       or jsonb_typeof(p_cursor->'value')<>'string' then
      return jsonb_build_object('ok',false,'error_code','INVALID_CURSOR',
        'error','Con trỏ không hợp lệ');
    end if;
    v_cursor:=p_cursor->>'value';
  end if;

  execute format($query$
    with values_found as (
      select %1$I value,count(*) row_count
      from public.vmp_source_objects
      where is_active and ($1 is null or object_kind=$1)
        and nullif(btrim(%1$I),'') is not null
        and (coalesce(btrim($2),'')='' or %1$I ilike btrim($2)||'%%')
      group by %1$I
    ), page_plus_one as (
      select * from values_found where $3 is null or value>$3
      order by value limit $4+1
    ), returned as (
      select * from page_plus_one order by value limit $4
    )
    select coalesce((select jsonb_agg(jsonb_build_object(
             'value',value,'count',row_count) order by value)
             from returned),'[]'::jsonb),
           (select count(*) from page_plus_one)>$4,
           case when (select count(*) from page_plus_one)>$4 then (
             select jsonb_build_object('value',value)
             from returned order by value desc limit 1
           ) else null end
  $query$,v_field)
  into v_rows,v_has_more,v_next
  using p_object_kind,p_search,v_cursor,p_limit;

  return jsonb_build_object('ok',true,'rows',v_rows,'next_cursor',v_next);
end
$_$;


--
-- Name: rpc_source_object_facets("text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_source_object_facets"("p_object_kind" "text", "p_filters" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_departments jsonb;
  v_areas jsonb;
  v_owners jsonb;
  v_validation jsonb;
  v_first_month jsonb;
  v_ownership jsonb;
  v_frequency jsonb;
begin
  if not public.vmp_is_active_session(v_actor) then
    return jsonb_build_object('ok',false,'error_code','ACCOUNT_DISABLED',
      'error','Tài khoản không hoạt động');
  end if;
  if v_role is null then
    return jsonb_build_object('ok',false,'error_code','ROLE_UNRESOLVED',
      'error','Không xác định được vai trò nghiệp vụ');
  end if;
  if not public.vmp_source_filters_valid(p_filters) then
    return jsonb_build_object('ok',false,'error_code','INVALID_FILTERS',
      'error','Bộ lọc phải là JSON object');
  end if;

  with visible as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and public.vmp_can_view_source_object(v_actor,source_object.id)
      and (p_object_kind is null or source_object.object_kind=p_object_kind)
      and public.vmp_source_object_matches_filters(
            source_object,null,p_filters)
  ), department_rows as (
    select department value,count(*) row_count from visible
    where nullif(btrim(department),'') is not null group by department
  ), area_rows as (
    select area_code value,count(*) row_count from visible
    where nullif(btrim(area_code),'') is not null group by area_code
  ), owner_rows as (
    select owner_person_id person_id,max(owner_name) name,count(*) row_count
    from visible where owner_person_id is not null
      and nullif(btrim(owner_name),'') is not null group by owner_person_id
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'value',value,'count',row_count) order by value)
      from department_rows),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'value',value,'count',row_count) order by value)
      from area_rows),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'value','owner:'||public.vmp_source_scope_key(name),
      'person_id',person_id,'name',name,'count',row_count)
      order by name nulls last,person_id) from owner_rows),'[]'::jsonb)
    ,jsonb_build_array(
      jsonb_build_object('value','outside','count',(select count(*) from visible
        where lower(btrim(coalesce(validate_flag,'')))<>'y')),
      jsonb_build_object('value','validated','count',(select count(*) from visible
        where lower(btrim(coalesce(validate_flag,'')))='y')))
    ,jsonb_build_array(
      jsonb_build_object('value','missing','count',(select count(*) from visible
        where first_month is null)),
      jsonb_build_object('value','present','count',(select count(*) from visible
        where first_month is not null)))
    ,jsonb_build_array(
      jsonb_build_object('value','assigned','count',(select count(*) from visible
        where nullif(btrim(owner_name),'') is not null)),
      jsonb_build_object('value','unassigned','count',(select count(*) from visible
        where nullif(btrim(owner_name),'') is null)))
    ,jsonb_build_array(
      jsonb_build_object('value','gt12','count',(select count(*) from visible
        where frequency_months>12)),
      jsonb_build_object('value','lte12','count',(select count(*) from visible
        where frequency_months is not null and frequency_months<=12)))
  into v_departments,v_areas,v_owners,v_validation,v_first_month,
       v_ownership,v_frequency;

  return jsonb_build_object('ok',true,'departments',v_departments,
    'areas',v_areas,'owners',v_owners,'validation',v_validation,
    'first_month',v_first_month,'ownership',v_ownership,
    'frequency',v_frequency);
end
$$;


--
-- Name: rpc_source_qa_candidates("text", "jsonb", integer, "uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_source_qa_candidates"("p_search" "text", "p_cursor" "jsonb", "p_limit" integer, "p_include_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select query_path.payload
  from public.vmp_source_qa_candidates_page_path(
    auth.uid(),p_search,p_cursor,p_limit,p_include_ids
  ) query_path
$$;


--
-- Name: rpc_source_warnings(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_source_warnings"("p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_year integer:=coalesce(p_year,extract(year from now())::integer);
  v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  with visible_source as materialized (
    select source_object.*
    from public.vmp_source_objects source_object
    where source_object.is_active
      and (auth.role()='service_role'
        or public.vmp_can_view_source_object(auth.uid(),source_object.id))
  )
  select jsonb_build_object(
    'nam',v_year,
    'thieu_thang_dau',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name) order by object_code)
      from visible_source where validate_flag='y' and first_month is null),
      '[]'::jsonb),
    'chua_tung_iq',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',source_object.object_kind,
      'object_code',source_object.object_code,
      'object_name',source_object.object_name,'nam_nhap',source_object.year_ref)
      order by source_object.object_code)
      from visible_source source_object
      where source_object.validate_flag='y'
        and source_object.object_kind in ('Thiết bị','Hệ thống phụ trợ')
        and source_object.year_ref is not null
        and source_object.year_ref<>v_year
        and not exists (select 1 from public.vmp_plan_items item
          where item.object_code=source_object.object_code
            and item.validation_type='IQ' and item.is_active)),
      '[]'::jsonb),
    'show_tat',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name,'show_flag',show_flag) order by object_code)
      from visible_source where validate_flag='y' and show_flag is not null
        and lower(show_flag)<>'y'),'[]'::jsonb),
    'chua_hoat_dong',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name,'tinh_trang',status) order by object_code)
      from visible_source where validate_flag='y' and status is not null
        and lower(status) like '%chưa%'),'[]'::jsonb),
    'ma_tam',coalesce((select jsonb_agg(jsonb_build_object(
      'object_kind',object_kind,'object_code',object_code,
      'object_name',object_name,'note',note) order by object_code)
      from visible_source where object_code like 'TAM-%'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$$;


--
-- Name: rpc_source_warnings__five_role_impl_20260824(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_source_warnings__five_role_impl_20260824"("p_year" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
begin
  return jsonb_build_object(
    'nam', v_year,

    -- Chắc chắn sai: không có tháng đầu tiên thì mọi mốc thời gian đều hỏng
    'thieu_thang_dau', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name) order by object_code)
      from public.vmp_source_objects
      where validate_flag = 'y' and is_active and first_month is null), '[]'::jsonb),

    -- Cần người xem: thiết bị/hệ thống có năm nhập KHÔNG PHẢI năm nay và
    -- chưa từng có IQ. Có thể là thiết bị cũ (bình thường), cũng có thể là
    -- năm nhập đó đã bị bỏ lỡ không sinh timeline.
    'chua_tung_iq', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', s.object_kind, 'object_code', s.object_code,
               'object_name', s.object_name, 'nam_nhap', s.year_ref) order by s.object_code)
      from public.vmp_source_objects s
      where s.validate_flag = 'y' and s.is_active
        and s.object_kind in ('Thiết bị','Hệ thống phụ trợ')
        and s.year_ref is not null
        and s.year_ref <> v_year
        and not exists (select 1 from public.vmp_visible_plan_items() p
                         where p.object_code = s.object_code and p.validation_type = 'IQ')
    ), '[]'::jsonb),

    -- Cần người xem: có thẩm định nhưng cờ hiển thị tắt
    'show_tat', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name, 'show_flag', show_flag) order by object_code)
      from public.vmp_source_objects
      where validate_flag = 'y' and is_active
        and show_flag is not null and lower(show_flag) <> 'y'), '[]'::jsonb),

    -- Cần người xem: có thẩm định nhưng tình trạng chưa hoạt động
    'chua_hoat_dong', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name, 'tinh_trang', status) order by object_code)
      from public.vmp_source_objects
      where validate_flag = 'y' and is_active
        and status is not null and lower(status) like '%chưa%'), '[]'::jsonb),

    -- Chắc chắn cần xử lý: dòng Sheet không vào được bản nhập (trùng mã
    -- hoặc không có mã) đã được cứu vào với mã TẠM. Phải gán mã thật rồi
    -- bật lại Thẩm định — để nguyên thì chúng không bao giờ có timeline.
    'ma_tam', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name, 'note', note) order by object_code)
      from public.vmp_source_objects
      where is_active and object_code like 'TAM-%'), '[]'::jsonb)
  );
end;
$$;


--
-- Name: rpc_source_workshop_scope_choices("text", "text", "text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_source_workshop_scope_choices"("p_department" "text", "p_area_code" "text", "p_search" "text", "p_cursor" "jsonb", "p_limit" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_rows jsonb;
  v_next jsonb;
begin
  if not public.vmp_can_manage_source_workshop_scope(auth.uid()) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Không có quyền quản lý phạm vi xưởng Source');
  end if;
  if p_limit is null or p_limit<1 or p_limit>50 then
    return jsonb_build_object('ok',false,'error_code','INVALID_LIMIT',
      'error','Giới hạn phải từ 1 đến 50');
  end if;
  if p_cursor is not null and (
       jsonb_typeof(p_cursor) is distinct from 'object'
       or jsonb_typeof(p_cursor->'department') is distinct from 'string'
       or nullif(btrim(p_cursor->>'department'),'') is null
       or jsonb_typeof(p_cursor->'area_code') is distinct from 'string'
       or nullif(btrim(p_cursor->>'area_code'),'') is null
       or not (p_cursor?'line')
       or jsonb_typeof(p_cursor->'line') not in ('null','string')
     ) then
    return jsonb_build_object('ok',false,'error_code','INVALID_CURSOR',
      'error','Con trỏ không hợp lệ');
  end if;

  with canonical as materialized (
    select btrim(source_object.department) department,
           btrim(source_object.area_code) area_code,
           nullif(btrim(source_object.line),'') line
    from public.vmp_source_objects source_object
    where source_object.is_active
      and nullif(btrim(source_object.department),'') is not null
      and nullif(btrim(source_object.area_code),'') is not null
      and (nullif(btrim(p_department),'') is null
           or public.vmp_source_scope_key(source_object.department)=
              public.vmp_source_scope_key(p_department))
      and (nullif(btrim(p_area_code),'') is null
           or public.vmp_source_scope_key(source_object.area_code)=
              public.vmp_source_scope_key(p_area_code))
      and (coalesce(btrim(p_search),'')=''
           or coalesce(nullif(btrim(source_object.line),''),'') ilike
              '%'||btrim(p_search)||'%')
  ), choice as materialized (
    select distinct canonical.department,canonical.area_code,canonical.line
    from canonical
  ), returned as (
    select choice.*,
           row_number() over (
             order by choice.department,choice.area_code,
                      choice.line nulls first
           ) page_ordinal
    from choice
    where p_cursor is null or (
      choice.department,choice.area_code,coalesce(choice.line,'')
    )>(btrim(p_cursor->>'department'),btrim(p_cursor->>'area_code'),
       coalesce(nullif(btrim(p_cursor->>'line'),''),''))
    order by choice.department,choice.area_code,choice.line nulls first
    limit p_limit+1
  )
  select coalesce(jsonb_agg(to_jsonb(returned)-'page_ordinal'
           order by department,area_code,line nulls first)
           filter(where page_ordinal<=p_limit),'[]'::jsonb),
         case when count(*)>p_limit then (
           select jsonb_build_object(
             'department',cursor_row.department,
             'area_code',cursor_row.area_code,'line',cursor_row.line)
           from returned cursor_row where cursor_row.page_ordinal=p_limit
         ) else null end
    into v_rows,v_next from returned;
  return jsonb_build_object('ok',true,'rows',v_rows,'next_cursor',v_next);
end
$$;


--
-- Name: rpc_stage_catalog_import("text", "text", "text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_stage_catalog_import"("p_dataset" "text", "p_template_version" "text", "p_fingerprint" "text", "p_file_hash" "text" DEFAULT NULL::"text", "p_rows" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_stage_catalog_import__five_role_impl_20260824(p_dataset, p_template_version, p_fingerprint, p_file_hash, p_rows); end $$;


--
-- Name: rpc_stage_catalog_import__five_role_impl_20260824("text", "text", "text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_stage_catalog_import__five_role_impl_20260824"("p_dataset" "text", "p_template_version" "text", "p_fingerprint" "text", "p_file_hash" "text" DEFAULT NULL::"text", "p_rows" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor    uuid := auth.uid();
  v_role     text := public.vmp_business_role(auth.uid());
  v_batch_id uuid;
  v_dong     jsonb;
  v_so       integer := 0;
  v_dem_moi  integer := 0;
  v_dem_sua  integer := 0;
  v_dem_giu  integer := 0;
  v_dem_loi  integer := 0;
  v_da_thay  text[] := array[]::text[];
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and v_role is distinct from 'admin'
     and v_role is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được nhập Excel danh mục');
  end if;

  -- Hợp đồng mẫu là LITERAL — khớp TEMPLATE_CONTRACTS phía client.
  if not (
    (p_dataset = 'source_objects' and p_template_version = '1'
      and p_fingerprint = 'vmp-source-objects-v1')
    or
    (p_dataset = 'products_gmp' and p_template_version = '1'
      and p_fingerprint = 'vmp-products-gmp-v1')
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'TEMPLATE_MISMATCH',
      'error', 'File không khớp mẫu/phiên bản hiện hành của ' || coalesce(p_dataset, '?'));
  end if;

  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_rows) < 1 then
    return jsonb_build_object('ok', false, 'error_code', 'NO_ROWS',
      'error', 'Lô nhập phải có ít nhất một dòng');
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    return jsonb_build_object('ok', false, 'error_code', 'TOO_MANY_ROWS',
      'error', 'Mỗi lô chỉ nhận tối đa 2.000 dòng');
  end if;

  -- Lô cũ chưa ghi của cùng người + dataset hết hiệu lực: hai lô 'validated'
  -- song song thì không biết bản xem trước nào là thật.
  update public.vmp_catalog_import_batches
  set status = 'expired'
  where uploaded_by = v_actor and dataset = p_dataset and status = 'validated';

  insert into public.vmp_catalog_import_batches
    (uploaded_by, dataset, template_version, fingerprint, file_hash, total_rows)
  values (v_actor, p_dataset, p_template_version, p_fingerprint,
          nullif(btrim(coalesce(p_file_hash, '')), ''), jsonb_array_length(p_rows))
  returning id into v_batch_id;

  for v_dong in select * from jsonb_array_elements(p_rows) loop
    v_so := v_so + 1;
    declare
      v_row_number integer := coalesce((v_dong ->> 'rowNumber')::integer, v_so + 1);
      v_kind       text := nullif(btrim(coalesce(v_dong ->> 'objectKind', '')), '');
      v_input      jsonb := coalesce(v_dong -> 'values', '{}'::jsonb);
      v_errors     jsonb := '[]'::jsonb;
      v_patch      jsonb := '{}'::jsonb;
      v_key        text;
      v_cur        jsonb;
      v_cur_ver    integer;
      v_phanloai   text;
      c            record;
      v_bad        text[];
    begin
      -- Khoá lạ trong input là client gửi sai — lỗi của dòng, nói thẳng.
      select array_agg(k order by k) into v_bad
      from jsonb_object_keys(v_input) k
      where k <> all(array(
              select cot from public.vmp_import_cot(p_dataset)
              union select case when p_dataset = 'source_objects'
                                then 'object_code' else 'bfo_code' end));
      if v_bad is not null then
        v_errors := v_errors || jsonb_build_object('code', 'PATCH_FIELD_NOT_ALLOWED',
          'message', 'Trường không thuộc mẫu: ' || array_to_string(v_bad, ', '));
      end if;

      if p_dataset = 'source_objects' then
        v_key := nullif(btrim(coalesce(v_dong ->> 'businessKey',
                                       v_input ->> 'object_code', '')), '');
        if v_kind is null or v_kind not in
           ('Thiết bị', 'Quy trình', 'Kho', 'Hệ thống phụ trợ', 'Vận chuyển') then
          v_errors := v_errors || jsonb_build_object('code', 'LOAI_KHONG_HOP_LE',
            'message', 'Loại đối tượng "' || coalesce(v_kind, '(trống)') || '" không hợp lệ');
        end if;
      else
        v_key := nullif(btrim(coalesce(v_dong ->> 'businessKey',
                                       v_input ->> 'bfo_code', '')), '');
        v_kind := null;
      end if;

      if v_key is null then
        v_errors := v_errors || jsonb_build_object('code', 'THIEU_KHOA',
          'message', 'Thiếu mã khoá của dòng');
      elsif (p_dataset || '|' || coalesce(v_kind, '') || '|' || v_key) = any(v_da_thay) then
        v_errors := v_errors || jsonb_build_object('code', 'TRUNG_KHOA',
          'message', 'Mã "' || v_key || '" xuất hiện hai lần trong lô');
      else
        v_da_thay := v_da_thay
          || (p_dataset || '|' || coalesce(v_kind, '') || '|' || v_key);
      end if;

      -- Bản ghi hiện tại (nếu có) — nguồn của phân loại và version.
      if v_key is not null then
        if p_dataset = 'source_objects' then
          select to_jsonb(so.*), coalesce(so.version, 1) into v_cur, v_cur_ver
          from public.vmp_source_objects so
          where so.object_kind = v_kind and so.object_code = v_key;
        else
          select to_jsonb(sp.*), coalesce(sp.version, 1) into v_cur, v_cur_ver
          from public.vmp_products_gmp sp
          where sp.bfo_code = v_key;
        end if;
      end if;

      -- Chuẩn hoá từng cột và dựng patch = những gì THẬT SỰ khác hiện tại.
      for c in select * from public.vmp_import_cot(p_dataset) loop
        declare
          v_moi jsonb;
          v_cu  jsonb;
        begin
          v_moi := public.vmp_import_chuan_hoa(c.kieu, v_input -> c.cot);
          if c.bat_buoc and jsonb_typeof(v_moi) = 'null' then
            v_errors := v_errors || jsonb_build_object('code', 'THIEU_BAT_BUOC',
              'message', 'Thiếu trường bắt buộc: ' || c.cot);
            continue;
          end if;
          if v_cur is null then
            -- Tạo mới: chỉ mang giá trị có thật.
            if jsonb_typeof(v_moi) <> 'null' then
              v_patch := v_patch || jsonb_build_object(c.cot, v_moi);
            end if;
          else
            v_cu := public.vmp_import_chuan_hoa(c.kieu, v_cur -> c.cot);
            if v_moi is distinct from v_cu then
              v_patch := v_patch || jsonb_build_object(c.cot, v_moi);
            end if;
          end if;
        exception when others then
          v_errors := v_errors || jsonb_build_object('code', 'GIA_TRI_KHONG_HOP_LE',
            'message', 'Giá trị ở cột ' || c.cot || ' không hợp lệ: '
                       || coalesce(v_input #>> array[c.cot], '(trống)'));
        end;
      end loop;

      v_phanloai := case
        when jsonb_array_length(v_errors) > 0 then 'loi'
        when v_cur is null then 'moi'
        when v_patch = '{}'::jsonb then 'khong_doi'
        else 'sua' end;

      if v_phanloai = 'loi' then v_dem_loi := v_dem_loi + 1;
      elsif v_phanloai = 'moi' then v_dem_moi := v_dem_moi + 1;
      elsif v_phanloai = 'sua' then v_dem_sua := v_dem_sua + 1;
      else v_dem_giu := v_dem_giu + 1; end if;

      insert into public.vmp_catalog_import_rows
        (batch_id, row_number, business_key, object_kind, expected_version,
         input, patch, current_snapshot, classification, errors)
      values
        (v_batch_id, v_row_number, coalesce(v_key, ''), v_kind, v_cur_ver,
         v_input, v_patch, v_cur, v_phanloai, v_errors);
    end;
  end loop;

  update public.vmp_catalog_import_batches
  set total_rows = v_so, so_tao_moi = v_dem_moi, so_sua = v_dem_sua,
      so_khong_doi = v_dem_giu, so_loi = v_dem_loi
  where id = v_batch_id;

  return jsonb_build_object(
    'ok', true, 'batch_id', v_batch_id, 'status', 'validated',
    'total', v_so, 'so_tao_moi', v_dem_moi, 'so_sua', v_dem_sua,
    'so_khong_doi', v_dem_giu, 'so_loi', v_dem_loi);
end
$$;


--
-- Name: rpc_sync_vmp_sheet_snapshot("text", "text", "text", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_sync_vmp_sheet_snapshot"("p_sheet_id" "text", "p_sheet_gid" "text", "p_tab_name" "text", "p_headers" "jsonb", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform public.vmp_lock_source_plan_relations(null);
  return public.rpc_sync_vmp_sheet_snapshot__source_impl_20260828(
    p_sheet_id,p_sheet_gid,p_tab_name,p_headers,p_rows);
end
$$;


--
-- Name: rpc_sync_vmp_sheet_snapshot__source_impl_20260828("text", "text", "text", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_sync_vmp_sheet_snapshot__source_impl_20260828"("p_sheet_id" "text", "p_sheet_gid" "text", "p_tab_name" "text", "p_headers" "jsonb", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_run_id uuid;
  v_source_rows integer;
  v_unique_ids integer;
  v_objects integer;
  v_duplicates integer;
  v_plan_upserts integer := 0;
  v_plan_deleted integer := 0;
  v_object_upserts integer := 0;
  v_object_deleted integer := 0;
  v_quality_deleted integer := 0;
  v_notifications_deleted integer := 0;
  v_progress_deleted integer := 0;
  v_full_reset boolean;
  v_checksum text;
  v_result jsonb;
begin
  -- One sync at a time. Concurrent schedule/manual runs serialize here.
  perform pg_advisory_xact_lock(hashtext('public.rpc_sync_vmp_sheet_snapshot'));

  if jsonb_typeof(p_headers) <> 'array' or jsonb_array_length(p_headers) <> 37 then
    raise exception 'VMP_SYNC_INVALID_HEADERS: expected 37 ordered headers';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'VMP_SYNC_INVALID_ROWS: rows must be a JSON array';
  end if;

  v_source_rows := jsonb_array_length(p_rows);
  if v_source_rows < 450 or v_source_rows > 5000 then
    raise exception 'VMP_SYNC_ROW_GUARD: source row count % is outside 450..5000', v_source_rows;
  end if;

  drop table if exists tmp_vmp_sheet_rows;
  create temporary table tmp_vmp_sheet_rows on commit drop as
  select
    (entry ->> 'row_number')::integer as row_number,
    entry -> 'values' as values_json,
    public.vmp_sheet_value(entry -> 'values', 16) as validation_code,
    public.vmp_sheet_value(entry -> 'values', 3) as object_code
  from jsonb_array_elements(p_rows) as x(entry);

  if exists (
    select 1
    from tmp_vmp_sheet_rows
    where row_number < 2
       or jsonb_typeof(values_json) <> 'array'
       or jsonb_array_length(values_json) <> 37
       or validation_code is null
       or object_code is null
  ) then
    raise exception 'VMP_SYNC_SHAPE_GUARD: every row needs row_number, 37 values, ID and object code';
  end if;

  if (select count(*) from tmp_vmp_sheet_rows)
     <> (select count(distinct row_number) from tmp_vmp_sheet_rows) then
    raise exception 'VMP_SYNC_DUPLICATE_ROW_NUMBER: Sheet row numbers must be unique';
  end if;

  select count(distinct validation_code), count(distinct object_code)
    into v_unique_ids, v_objects
  from tmp_vmp_sheet_rows;
  v_duplicates := v_source_rows - v_unique_ids;

  if v_unique_ids < 450 or v_objects < 200 or v_duplicates > 10 then
    raise exception 'VMP_SYNC_CARDINALITY_GUARD: rows=%, unique_ids=%, objects=%, duplicates=%',
      v_source_rows, v_unique_ids, v_objects, v_duplicates;
  end if;

  v_checksum := encode(
    extensions.digest(convert_to(p_headers::text || p_rows::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- No completed canonical run means this is the authorized one-time reset.
  select not exists (
    select 1 from public.vmp_sheet_sync_runs where status = 'completed'
  ) into v_full_reset;

  insert into public.vmp_sheet_sync_runs (
    sheet_id, sheet_gid, tab_name, headers, source_row_count,
    unique_validation_count, object_count, duplicate_validation_count,
    checksum, status
  ) values (
    p_sheet_id, p_sheet_gid, p_tab_name, p_headers, v_source_rows,
    v_unique_ids, v_objects, v_duplicates, v_checksum, 'applying'
  ) returning id into v_run_id;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_plan_items', count(*),
         coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
  from public.vmp_plan_items p;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_objects', count(*),
         coalesce(jsonb_agg(to_jsonb(o) order by o.code), '[]'::jsonb)
  from public.vmp_objects o;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'data_quality_issues', count(*),
         coalesce(jsonb_agg(to_jsonb(q) order by q.detected_at, q.id), '[]'::jsonb)
  from public.data_quality_issues q;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_notifications', count(*),
         coalesce(jsonb_agg(to_jsonb(n) order by n.created_at, n.id), '[]'::jsonb)
  from public.vmp_notifications n;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_progress_events', count(*),
         coalesce(jsonb_agg(to_jsonb(e) order by e.changed_at, e.event_id), '[]'::jsonb)
  from public.vmp_progress_events e;

  insert into public.vmp_sheet_rows (
    sync_run_id, sheet_row_number, values_json, validation_code, object_code, row_hash
  )
  select
    v_run_id,
    row_number,
    values_json,
    validation_code,
    object_code,
    encode(extensions.digest(convert_to(values_json::text, 'UTF8'), 'sha256'), 'hex')
  from tmp_vmp_sheet_rows
  order by row_number;

  drop table if exists tmp_vmp_source;
  create temporary table tmp_vmp_source on commit drop as
  select distinct on (r.validation_code)
    r.row_number,
    r.values_json,
    r.validation_code,
    r.object_code,
    upper(coalesce(public.vmp_sheet_value(r.values_json, 2), 'PQ')) as validation_type,
    coalesce(public.vmp_sheet_value(r.values_json, 29), public.vmp_sheet_value(r.values_json, 13), 'Không phụ thuộc') as report_class,
    coalesce(public.vmp_sheet_value(r.values_json, 17), public.vmp_sheet_value(r.values_json, 19)) as owner_name,
    public.vmp_sheet_value(r.values_json, 19) as secondary_owner,
    public.vmp_sheet_number(public.vmp_sheet_value(r.values_json, 14)) as effort_days,
    public.vmp_sheet_number(public.vmp_sheet_value(r.values_json, 15))::integer as criticality_score,
    public.vmp_sheet_criticality(
      public.vmp_sheet_value(r.values_json, 15),
      coalesce(public.vmp_sheet_value(r.values_json, 29), public.vmp_sheet_value(r.values_json, 13))
    ) as criticality,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 21)) as deadline_protocol,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 25)) as deadline_validation,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 30)) as deadline_report,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 33)) as deadline_vmp,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 22)) as actual_protocol_date,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 27)) as actual_validation_date,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 31)) as actual_report_date,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 34)) as actual_vmp_date,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 26)) as scheduled_date,
    public.vmp_sheet_status(public.vmp_sheet_value(r.values_json, 23)) as status_protocol,
    public.vmp_sheet_status(public.vmp_sheet_value(r.values_json, 28)) as status_validation,
    public.vmp_sheet_status(public.vmp_sheet_value(r.values_json, 32)) as status_report,
    public.vmp_sheet_status(public.vmp_sheet_value(r.values_json, 35)) as status_vmp,
    coalesce((regexp_match(r.validation_code, '/(20\d{2})'))[1]::integer,
             extract(year from current_date)::integer) as plan_year,
    jsonb_build_object(
      'row_number', r.row_number,
      'values', r.values_json,
      'state', public.vmp_sheet_value(r.values_json, 8),
      'show', public.vmp_sheet_value(r.values_json, 9),
      'validation_required', public.vmp_sheet_value(r.values_json, 10),
      'entered_year', public.vmp_sheet_value(r.values_json, 12),
      'qa_email', public.vmp_sheet_value(r.values_json, 18),
      'secondary_email', public.vmp_sheet_value(r.values_json, 20),
      'deadline_validation_start', public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 24)),
      'unknown_flag', public.vmp_sheet_value(r.values_json, 36)
    ) as source_sheet_data
  from tmp_vmp_sheet_rows r
  order by r.validation_code, r.row_number desc;

  if v_full_reset then
    delete from public.data_quality_issues;
    get diagnostics v_quality_deleted = row_count;
    delete from public.vmp_notifications;
    get diagnostics v_notifications_deleted = row_count;
    delete from public.vmp_progress_events;
    get diagnostics v_progress_deleted = row_count;
    delete from public.vmp_plan_items;
    get diagnostics v_plan_deleted = row_count;
    delete from public.vmp_objects;
    get diagnostics v_object_deleted = row_count;
  else
    delete from public.data_quality_issues q
    where q.plan_item_id is not null
      and not exists (
        select 1 from tmp_vmp_source s where s.validation_code = q.plan_item_id
      );
    get diagnostics v_quality_deleted = row_count;

    delete from public.vmp_notifications n
    where not exists (
      select 1 from tmp_vmp_source s where s.validation_code = n.plan_item_id
    );
    get diagnostics v_notifications_deleted = row_count;

    delete from public.vmp_progress_events e
    where not exists (
      select 1 from tmp_vmp_source s where s.validation_code = e.plan_item_id
    );
    get diagnostics v_progress_deleted = row_count;

    delete from public.vmp_plan_items p
    where not exists (
      select 1 from tmp_vmp_source s where s.validation_code = p.id
    );
    get diagnostics v_plan_deleted = row_count;

    delete from public.vmp_objects o
    where not exists (
      select 1 from tmp_vmp_source s where s.object_code = o.code
    );
    get diagnostics v_object_deleted = row_count;
  end if;

  insert into public.vmp_objects (
    code, name, classification, department, area, line,
    criticality_score, criticality, frequency_months, is_active,
    source_sync_run_id, source_sheet_row, source_sheet_data
  )
  select distinct on (s.object_code)
    s.object_code,
    coalesce(public.vmp_sheet_value(s.values_json, 4), s.object_code),
    public.vmp_sheet_classification(public.vmp_sheet_value(s.values_json, 1)),
    public.vmp_sheet_department(public.vmp_sheet_value(s.values_json, 5)),
    coalesce(public.vmp_sheet_value(s.values_json, 6), '—'),
    coalesce(public.vmp_sheet_value(s.values_json, 7), '—'),
    s.criticality_score,
    s.criticality,
    coalesce(nullif(public.vmp_sheet_number(public.vmp_sheet_value(s.values_json, 11))::integer, 0), 12),
    true,
    v_run_id,
    s.row_number,
    s.source_sheet_data || jsonb_build_object(
      'object_type', public.vmp_sheet_value(s.values_json, 1),
      'object_name', public.vmp_sheet_value(s.values_json, 4),
      'department', public.vmp_sheet_value(s.values_json, 5),
      'area', public.vmp_sheet_value(s.values_json, 6),
      'line', public.vmp_sheet_value(s.values_json, 7),
      'frequency_months', public.vmp_sheet_value(s.values_json, 11)
    )
  from tmp_vmp_source s
  order by s.object_code, s.row_number
  on conflict (code) do update set
    name = excluded.name,
    classification = excluded.classification,
    department = excluded.department,
    area = excluded.area,
    line = excluded.line,
    criticality_score = excluded.criticality_score,
    criticality = excluded.criticality,
    frequency_months = excluded.frequency_months,
    is_active = true,
    source_sync_run_id = excluded.source_sync_run_id,
    source_sheet_row = excluded.source_sheet_row,
    source_sheet_data = excluded.source_sheet_data,
    updated_at = now();
  get diagnostics v_object_upserts = row_count;

  insert into public.vmp_plan_items (
    id, validation_code, object_code, validation_type, report_class,
    owner_name, secondary_owner, effort_days, criticality_score, criticality,
    deadline_protocol, deadline_validation, deadline_report, deadline_vmp,
    actual_protocol_date, actual_validation_date, actual_report_date, actual_vmp_date,
    scheduled_date, status_protocol, status_validation, status_report, status_vmp,
    is_active, year, missing_from_sheet, missing_since,
    deleted_from_sheet, deleted_at, delete_reason, last_synced,
    source_sync_run_id, source_sheet_row, source_sheet_data
  )
  select
    s.validation_code, s.validation_code, s.object_code, s.validation_type, s.report_class,
    s.owner_name, s.secondary_owner, s.effort_days, s.criticality_score, s.criticality,
    s.deadline_protocol, s.deadline_validation, s.deadline_report, s.deadline_vmp,
    s.actual_protocol_date, s.actual_validation_date, s.actual_report_date, s.actual_vmp_date,
    s.scheduled_date, s.status_protocol, s.status_validation, s.status_report, s.status_vmp,
    true, s.plan_year, false, null,
    false, null, null, now(),
    v_run_id, s.row_number, s.source_sheet_data
  from tmp_vmp_source s
  on conflict (id) do update set
    validation_code = excluded.validation_code,
    object_code = excluded.object_code,
    validation_type = excluded.validation_type,
    report_class = excluded.report_class,
    -- ---- CỘT DO WEB SỞ HỮU: chỉ ĐIỀN CHỖ TRỐNG, không đè ----
    owner_name = coalesce(nullif(btrim(vmp_plan_items.owner_name), ''), excluded.owner_name),
    secondary_owner = coalesce(nullif(btrim(vmp_plan_items.secondary_owner), ''), excluded.secondary_owner),
    effort_days = excluded.effort_days,
    criticality_score = excluded.criticality_score,
    criticality = excluded.criticality,
    deadline_protocol = excluded.deadline_protocol,
    deadline_validation = excluded.deadline_validation,
    deadline_report = excluded.deadline_report,
    deadline_vmp = excluded.deadline_vmp,
    actual_protocol_date   = coalesce(vmp_plan_items.actual_protocol_date,   excluded.actual_protocol_date),
    actual_validation_date = coalesce(vmp_plan_items.actual_validation_date, excluded.actual_validation_date),
    actual_report_date     = coalesce(vmp_plan_items.actual_report_date,     excluded.actual_report_date),
    actual_vmp_date        = coalesce(vmp_plan_items.actual_vmp_date,        excluded.actual_vmp_date),
    scheduled_date         = coalesce(vmp_plan_items.scheduled_date,         excluded.scheduled_date),
    -- Trạng thái: giữ nguyên nếu web đã đặt khác 'chưa bắt đầu'.
    status_protocol   = case when vmp_plan_items.status_protocol   is distinct from 'not_started'::phase_status then vmp_plan_items.status_protocol   else excluded.status_protocol   end,
    status_validation = case when vmp_plan_items.status_validation is distinct from 'not_started'::phase_status then vmp_plan_items.status_validation else excluded.status_validation end,
    status_report     = case when vmp_plan_items.status_report     is distinct from 'not_started'::phase_status then vmp_plan_items.status_report     else excluded.status_report     end,
    status_vmp        = case when vmp_plan_items.status_vmp        is distinct from 'not_started'::phase_status then vmp_plan_items.status_vmp        else excluded.status_vmp        end,
    is_active = true,
    year = excluded.year,
    missing_from_sheet = false,
    missing_since = null,
    deleted_from_sheet = false,
    deleted_at = null,
    delete_reason = null,
    last_synced = now(),
    source_sync_run_id = excluded.source_sync_run_id,
    source_sheet_row = excluded.source_sheet_row,
    source_sheet_data = excluded.source_sheet_data,
    updated_at = now();
  get diagnostics v_plan_upserts = row_count;

  if (select count(*) from public.vmp_plan_items) <> v_unique_ids
     or (select count(*) from public.vmp_objects) <> v_objects then
    raise exception 'VMP_SYNC_POSTCONDITION_FAILED: plans=%, expected=%, objects=%, expected=%',
      (select count(*) from public.vmp_plan_items), v_unique_ids,
      (select count(*) from public.vmp_objects), v_objects;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'sync_run_id', v_run_id,
    'checksum', v_checksum,
    'full_reset', v_full_reset,
    'source_rows', v_source_rows,
    'unique_validation_ids', v_unique_ids,
    'objects_in_sheet', v_objects,
    'duplicate_validation_ids', v_duplicates,
    'plan_deleted', v_plan_deleted,
    'plan_upserts', v_plan_upserts,
    'object_deleted', v_object_deleted,
    'object_upserts', v_object_upserts,
    'data_quality_deleted', v_quality_deleted,
    'notifications_deleted', v_notifications_deleted,
    'progress_deleted', v_progress_deleted
  );

  update public.vmp_sheet_sync_runs
  set status = 'completed', result = v_result, completed_at = now()
  where id = v_run_id;

  return v_result;
end;
$$;


--
-- Name: FUNCTION "rpc_sync_vmp_sheet_snapshot__source_impl_20260828"("p_sheet_id" "text", "p_sheet_gid" "text", "p_tab_name" "text", "p_headers" "jsonb", "p_rows" "jsonb"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_sync_vmp_sheet_snapshot__source_impl_20260828"("p_sheet_id" "text", "p_sheet_gid" "text", "p_tab_name" "text", "p_headers" "jsonb", "p_rows" "jsonb") IS 'Atomically replaces legacy VMP data on first canonical Sheet sync, then maintains an exact Sheet-owned set with backups.';


--
-- Name: rpc_sync_vmp_sheet_snapshot_with_extras("text", "text", "text", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_sync_vmp_sheet_snapshot_with_extras"("p_sheet_id" "text", "p_sheet_gid" "text", "p_tab_name" "text", "p_headers" "jsonb", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_result jsonb;
  v_run_id uuid;
  v_extra_rows integer := 0;
  v_plan_updates integer := 0;
  v_dept_updates integer := 0;
begin
  v_result := public.rpc_sync_vmp_sheet_snapshot(
    p_sheet_id,
    p_sheet_gid,
    p_tab_name,
    p_headers,
    p_rows
  );

  if coalesce((v_result ->> 'skipped')::boolean, false) then
    return v_result;
  end if;

  v_run_id := nullif(v_result ->> 'sync_run_id', '')::uuid;
  if v_run_id is null then
    return v_result;
  end if;

  insert into public.vmp_sheet_row_extras (
    sync_run_id, sheet_row_number, validation_code, object_code, extra_json
  )
  select
    v_run_id,
    (entry ->> 'row_number')::integer,
    public.vmp_sheet_value(entry -> 'values', 16),
    public.vmp_sheet_value(entry -> 'values', 3),
    coalesce(entry -> 'extra', '{}'::jsonb)
  from jsonb_array_elements(p_rows) as x(entry)
  where jsonb_typeof(entry -> 'extra') = 'object'
  on conflict (sync_run_id, sheet_row_number) do update set
    validation_code = excluded.validation_code,
    object_code = excluded.object_code,
    extra_json = excluded.extra_json;
  get diagnostics v_extra_rows = row_count;

  with latest_extra as (
    select distinct on (validation_code)
      validation_code,
      nullif(btrim(extra_json ->> 'execution_department'), '') as execution_department
    from public.vmp_sheet_row_extras
    where sync_run_id = v_run_id
      and nullif(btrim(extra_json ->> 'execution_department'), '') is not null
    order by validation_code, sheet_row_number desc
  )
  update public.vmp_plan_items p
  set source_sheet_data = p.source_sheet_data || jsonb_build_object(
    'bo_phan_thuc_hien_goc', latest_extra.execution_department
  )
  from latest_extra
  where p.source_sync_run_id = v_run_id
    and p.validation_code = latest_extra.validation_code;
  get diagnostics v_plan_updates = row_count;

  -- NEW: precompute CẢ HAI tập bộ phận cho bộ lọc:
  --   • departments           ← bo_phan_goc (cột 5 canonical), có fallback dept đối tượng.
  --   • execution_departments ← "Bộ phận thực hiện thẩm định" (extra, ngoài 37 cột),
  --                              KHÔNG fallback (rỗng = Sheet không ghi) — khớp deptGroup().
  -- Bọc exception để lỗi ở đây KHÔNG kéo đổ snapshot canonical (dữ liệu dẫn xuất).
  begin
    with mgmt as (
      select distinct on (r.validation_code)
        r.validation_code,
        public.vmp_parse_depts(nullif(btrim(r.values_json ->> 5), '')) as depts
      from public.vmp_sheet_rows r
      where r.sync_run_id = v_run_id
        and r.validation_code is not null
      order by r.validation_code, r.sheet_row_number desc
    ),
    exec_src as (
      select distinct on (validation_code)
        validation_code,
        public.vmp_parse_depts(nullif(btrim(extra_json ->> 'execution_department'), '')) as depts
      from public.vmp_sheet_row_extras
      where sync_run_id = v_run_id
      order by validation_code, sheet_row_number desc
    )
    update public.vmp_plan_items p
    set departments = case
          when array_length(m.depts, 1) > 0 then m.depts
          else array[coalesce(
            (select o.department from public.vmp_objects o where o.code = p.object_code),
            'qa')]
        end,
        execution_departments = coalesce(e.depts, '{}'::text[])
    from mgmt m
    left join exec_src e on e.validation_code = m.validation_code
    where p.source_sync_run_id = v_run_id
      and p.validation_code = m.validation_code;
    get diagnostics v_dept_updates = row_count;
  exception when others then
    v_dept_updates := -1; -- đánh dấu lỗi mềm, không rollback
  end;

  v_result := v_result || jsonb_build_object(
    'extra_rows', v_extra_rows,
    'execution_department_updates', v_plan_updates,
    'department_updates', v_dept_updates
  );

  update public.vmp_sheet_sync_runs
  set
    result = coalesce(result, '{}'::jsonb) || v_result,
    completed_at = now()
  where id = v_run_id;

  return v_result;
end;
$$;


--
-- Name: FUNCTION "rpc_sync_vmp_sheet_snapshot_with_extras"("p_sheet_id" "text", "p_sheet_gid" "text", "p_tab_name" "text", "p_headers" "jsonb", "p_rows" "jsonb"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_sync_vmp_sheet_snapshot_with_extras"("p_sheet_id" "text", "p_sheet_gid" "text", "p_tab_name" "text", "p_headers" "jsonb", "p_rows" "jsonb") IS 'Canonical Sheet sync wrapper that preserves extra non-canonical Sheet columns for dashboard read models.';


--
-- Name: rpc_team_overview_summary(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_team_overview_summary"("p_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role text;
  v_total integer := 0;
  v_completed integer := 0;
  v_rate integer := 0;
  v_updated_at timestamptz;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    null; -- Explicit deployment-verification bypass; no user role is resolved.
  else
    if not public.vmp_is_active_session(auth.uid()) then
      return public.vmp_session_denial();
    end if;

    v_role := public.vmp_business_role(auth.uid());
    if not exists (
      select 1
      from public.vmp_screen_permissions as permission
      where permission.business_role = v_role
        and permission.screen_id = 'overview'
        and permission.can_view is true
    ) then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'FORBIDDEN',
        'error', 'Không có quyền xem Tổng quan'
      );
    end if;
  end if;

  if p_year is null then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_YEAR',
      'error', 'Năm kế hoạch không hợp lệ'
    );
  end if;

  select count(*)::integer,
         count(*) filter (where item.status_vmp = 'completed')::integer,
         max(item.updated_at)
    into v_total, v_completed, v_updated_at
  from public.vmp_plan_items as item
  where item.year = p_year
    and item.is_active is true
    and item.missing_from_sheet is not true
    and coalesce(item.item_state, 'active') = 'active';

  v_rate := case
    when v_total = 0 then 0
    else round(v_completed * 100.0 / v_total)::integer
  end;

  return jsonb_build_object(
    'ok', true,
    'year', p_year,
    'total', v_total,
    'completed', v_completed,
    'rate', v_rate,
    'updated_at', v_updated_at
  );
end
$$;


--
-- Name: rpc_tim_tri_thuc("text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_tim_tri_thuc"("p_cau_hoi" "text", "p_vector" "text" DEFAULT NULL::"text", "p_k" integer DEFAULT 6) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_kq jsonb;
  v_tu_khoa text := public.vmp_khong_dau(coalesce(p_cau_hoi, ''));
  v_toi_da numeric := 3.0 / 61.0;   -- đứng đầu cả ba đường
begin
  with
  theo_vector as (
    select d.id, row_number() over (order by d.embedding <=> p_vector::vector) as hang
    from public.vmp_kb_documents d
    where p_vector is not null and d.embedding is not null
    order by d.embedding <=> p_vector::vector
    limit 30
  ),
  theo_tu_khoa as (
    select d.id,
           row_number() over (order by word_similarity(v_tu_khoa, public.vmp_khong_dau(d.content)) desc) as hang
    from public.vmp_kb_documents d
    where v_tu_khoa <> ''
      and word_similarity(v_tu_khoa, public.vmp_khong_dau(d.content)) > 0.25
    order by word_similarity(v_tu_khoa, public.vmp_khong_dau(d.content)) desc
    limit 30
  ),
  theo_dong as (
    select id, row_number() over (order by sim desc) as hang
    from (
      select d.id, max(word_similarity(v_tu_khoa, public.vmp_khong_dau(dong))) as sim
      from public.vmp_kb_documents d,
           regexp_split_to_table(d.content, E'\n') as dong
      where v_tu_khoa <> '' and length(dong) > 20
      group by d.id
    ) s
    where sim > 0.3
    order by sim desc
    limit 30
  ),
  gop as (
    select id, sum(diem) as diem from (
      select id, 1.0 / (60 + hang) as diem from theo_vector
      union all
      select id, 1.0 / (60 + hang) as diem from theo_tu_khoa
      union all
      select id, 1.0 / (60 + hang) as diem from theo_dong
    ) t group by id
  )
  select coalesce(jsonb_agg(x order by x.diem desc), '[]'::jsonb) into v_kq
  from (
    select d.id,
           round(g.diem::numeric, 5) as diem,
           least(1.0, round((g.diem / v_toi_da)::numeric, 3)) as do_tin,
           coalesce(d.metadata ->> 'source', 'không rõ nguồn') as nguon,
           coalesce(d.metadata ->> 'heading', '') as muc,
           left(d.content, 1200) as noi_dung
    from gop g join public.vmp_kb_documents d on d.id = g.id
    order by g.diem desc
    limit greatest(1, least(p_k, 20))
  ) x;

  return jsonb_build_object(
    'ok', true,
    'so_manh', jsonb_array_length(v_kq),
    'diem_cao_nhat', coalesce((v_kq -> 0 ->> 'diem')::numeric, 0),
    -- Thang 0..1: dùng cái này để quyết định có đủ căn cứ hay không.
    'do_tin_cao_nhat', coalesce((v_kq -> 0 ->> 'do_tin')::numeric, 0),
    'manh', v_kq);
end;
$$;


--
-- Name: FUNCTION "rpc_tim_tri_thuc"("p_cau_hoi" "text", "p_vector" "text", "p_k" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_tim_tri_thuc"("p_cau_hoi" "text", "p_vector" "text", "p_k" integer) IS 'Tìm kiếm lai (vector + từ khoá, hợp nhất RRF) trên kho tri thức VMP. Kèm do_tin thang 0..1 để đặt ngưỡng, và nguồn/mục để trích dẫn.';


--
-- Name: rpc_trang_thai_he_thong(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_trang_thai_he_thong"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_trang_thai_he_thong__five_role_impl_20260824(); end $$;


--
-- Name: rpc_trang_thai_he_thong__five_role_impl_20260824(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_trang_thai_he_thong__five_role_impl_20260824"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_kq   jsonb;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('admin','qa_manager') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA quản lý xem được trạng thái hệ thống');
  end if;

  select jsonb_build_object(
    'ok', true,

    -- Người dùng và vai trò
    'nguoi_dung', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ten', p.full_name, 'email', p.email, 'vai_tro', p.role::text,
        'bo_phan', p.department, 'dang_dung', p.is_active,
        'dang_nhap_gan_nhat', p.last_login
      ) order by p.role::text, p.full_name), '[]'::jsonb)
      from profiles p
    ),

    -- Cấu hình hệ thống (bỏ khoá nhạy cảm)
    'cau_hinh', (
      select coalesce(jsonb_agg(jsonb_build_object('khoa', c.key, 'gia_tri', c.value)
             order by c.key), '[]'::jsonb)
      from system_config c where not coalesce(c.is_sensitive, false)
    ),

    -- Việc tự động đang hẹn giờ (pg_cron)
    'lich_tu_dong', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ten', j.jobname, 'lich', j.schedule, 'dang_bat', j.active,
        'lenh', left(j.command, 90)) order by j.jobname), '[]'::jsonb)
      from cron.job j
    ),

    -- Đồng bộ Sheet gần nhất (đường này đã ngắt, giữ để đối chiếu lịch sử)
    'dong_bo_gan_nhat', (
      select jsonb_build_object('luc', r.started_at, 'trang_thai', r.status,
                                'so_dong_nguon', r.source_row_count,
                                'so_ma_trung', r.duplicate_validation_count)
      from vmp_sheet_sync_runs r order by r.started_at desc limit 1
    ),

    -- Khối lượng dữ liệu
    'du_lieu', jsonb_build_object(
      'hang_muc_dang_theo_doi', (select count(*) from public.vmp_visible_plan_items() where is_active and coalesce(item_state,'active') = 'active'),
      'hang_muc_khong_ap_dung', (select count(*) from public.vmp_visible_plan_items() where is_active and coalesce(item_state,'active') <> 'active'),
      'doi_tuong', (select count(*) from vmp_objects where is_active),
      'nguoi_thuc_hien', (select count(*) from vmp_performers where is_active),
      'dong_nhat_ky', (select count(*) from audit_logs),
      'dung_luong', pg_size_pretty(pg_database_size(current_database()))
    ),

    -- Workflow n8n lỗi trong 7 ngày
    'workflow_loi_7_ngay', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ten', w.workflow_name, 'luc', w.created_at,
        'loi', left(coalesce(w.error_message, ''), 120)) order by w.created_at desc), '[]'::jsonb)
      from (select * from workflow_runs
             where status <> 'success' and created_at > now() - interval '7 days'
             order by created_at desc limit 10) w
    )
  ) into v_kq;

  return v_kq;
end;
$$;


--
-- Name: rpc_update_planned_deadlines("text", "jsonb", "text", integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_update_planned_deadlines"("p_validation_code" "text", "p_deadlines" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_confirmed" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and public.vmp_is_active_session(auth.uid()) is not true then
    return public.vmp_session_denial();
  end if;
  if coalesce(auth.role(),'')<>'service_role'
     and coalesce(public.vmp_business_role(auth.uid()),'')
         not in ('admin','qa_manager') then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được chỉnh deadline kế hoạch');
  end if;
  return public.vmp_update_planned_deadlines_impl(
    p_validation_code,p_deadlines,p_reason,p_expected_version,p_confirmed);
end
$$;


--
-- Name: FUNCTION "rpc_update_planned_deadlines"("p_validation_code" "text", "p_deadlines" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_confirmed" boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_update_planned_deadlines"("p_validation_code" "text", "p_deadlines" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_confirmed" boolean) IS 'Manual complete-snapshot edit of exactly four planned deadlines; admin/qa_manager browser callers and reviewed service_role automation only.';


--
-- Name: rpc_update_progress("text", "jsonb", "text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_update_progress"("p_validation_code" "text", "p_patch" "jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_sheet_patch" "jsonb" DEFAULT NULL::"jsonb", "p_expected_version" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_person_id uuid;
  v_source_id uuid;
  v_item_id text;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(v_actor) then
    return public.vmp_session_denial();
  end if;

  select source_object.id into v_source_id
  from public.vmp_plan_items item
  join public.vmp_objects master_object
    on master_object.code=item.object_code
  join public.vmp_source_objects source_object
    on source_object.object_code=master_object.code
   and source_object.is_active is true
  where item.validation_code=p_validation_code and item.is_active is true
  for key share of source_object;
  if not found then
    return jsonb_build_object('ok',false,'code','item_field_forbidden',
      'error','Hạng mục không có đúng một Source hoạt động',
      'forbidden_fields',coalesce((select jsonb_agg(key order by key)
        from jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) key),'[]'::jsonb),
      'allowed_fields','[]'::jsonb);
  end if;

  select performer.id into v_person_id
  from public.vmp_performers performer
  where performer.user_id=v_actor and performer.is_active;

  if v_role in ('workshop_manager','workshop_staff') then
    perform 1
    from public.vmp_source_workshop_scope_grants grant_row
    join public.vmp_source_objects source_object on source_object.id=v_source_id
    where grant_row.performer_id=v_person_id and grant_row.is_active
      and grant_row.valid_from<=transaction_timestamp()
      and (grant_row.expires_at is null
           or grant_row.expires_at>transaction_timestamp())
      and public.vmp_source_scope_key(source_object.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
      and (grant_row.line_key is null or
           public.vmp_source_scope_key(source_object.line)=grant_row.line_key)
    order by grant_row.id for share of grant_row;
  end if;

  select item.id into v_item_id
  from public.vmp_plan_items item
  where item.validation_code=p_validation_code and item.is_active is true
  for update;
  if not found then
    return jsonb_build_object('ok',false,'code','item_field_forbidden',
      'error','Hạng mục không còn hoạt động',
      'forbidden_fields','[]'::jsonb,'allowed_fields','[]'::jsonb);
  end if;

  if v_role in ('workshop_manager','workshop_staff') then
    perform 1 from public.vmp_item_assignments assignment
    where assignment.validation_code=p_validation_code
      and assignment.performer_id=v_person_id
      and assignment.assignment_kind='equipment_department'
      and assignment.is_active
      and (assignment.expires_at is null
           or assignment.expires_at>transaction_timestamp())
    order by assignment.id for share;
  end if;

  return public.rpc_update_progress__assigned_impl_20260827(
    p_validation_code,p_patch,p_reason,p_sheet_patch,p_expected_version);
end
$$;


--
-- Name: rpc_update_progress__assigned_impl_20260827("text", "jsonb", "text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_update_progress__assigned_impl_20260827"("p_validation_code" "text", "p_patch" "jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_sheet_patch" "jsonb" DEFAULT NULL::"jsonb", "p_expected_version" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_item vmp_plan_items%rowtype;
  v_role user_role;
  v_user_dept text;
  v_item_dept text;
  v_requires_reason boolean := false;
  v_outbox_id bigint := null;
  v_patch jsonb := p_patch;
  v_mode text := public.item_permissions_mode();
  v_allowed text[] := '{}'::text[];
  v_bad_fields text[] := '{}'::text[];
  v_scheduled_at timestamptz;
begin
  if v_patch is null
     or jsonb_typeof(v_patch) <> 'object'
     or v_patch = '{}'::jsonb then
    return jsonb_build_object(
      'ok',false,'code','patch_invalid',
      'error','Patch phải là một object JSON không rỗng');
  end if;

  -- Tên cũ chỉ còn là đường tương thích; mọi kiểm quyền dùng scheduled_at.
  if v_patch ? 'scheduled_date' then
    if not (v_patch ? 'scheduled_at') then
      v_patch := jsonb_set(v_patch, '{scheduled_at}', v_patch -> 'scheduled_date', true);
    end if;
    v_patch := v_patch - 'scheduled_date';
  end if;

  select role, department into v_role, v_user_dept
  from public.profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;

  -- Authorize before taking the row lock so an unassigned caller cannot hold
  -- an item lock or learn whether the submitted version is current.
  v_allowed := public.vmp_allowed_timeline_fields(auth.uid(),p_validation_code);
  if cardinality(coalesce(v_allowed,'{}'::text[]))=0 then
    return jsonb_build_object(
      'ok',false,
      'code','item_field_forbidden',
      'error','Bạn không có trường tiến độ nào được phép cập nhật',
      'forbidden_fields',to_jsonb(array(
        select key from jsonb_object_keys(v_patch) keys(key) order by key)),
      'allowed_fields','[]'::jsonb
    );
  end if;

  select coalesce(array_agg(key order by key),'{}'::text[])
  into v_bad_fields
  from jsonb_object_keys(v_patch) as keys(key)
  where not (key=any(v_allowed));

  if cardinality(v_bad_fields)>0 then
    return jsonb_build_object(
      'ok',false,
      'code','item_field_forbidden',
      'error','Bạn không được cập nhật các trường: '||
        array_to_string(v_bad_fields,', '),
      'forbidden_fields',to_jsonb(v_bad_fields),
      'allowed_fields',to_jsonb(v_allowed)
    );
  end if;

  select * into v_item from public.vmp_plan_items
  where validation_code = p_validation_code and is_active = true
  for update;
  if v_item.id is null then
    return jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || p_validation_code);
  end if;

  -- Re-resolve after lock acquisition so assignment revocation during a lock
  -- wait still fails closed before any audit setting or row mutation.
  v_allowed := public.vmp_allowed_timeline_fields(auth.uid(),p_validation_code);
  if cardinality(coalesce(v_allowed,'{}'::text[]))=0 then
    return jsonb_build_object(
      'ok',false,
      'code','item_field_forbidden',
      'error','Bạn không có trường tiến độ nào được phép cập nhật',
      'forbidden_fields',to_jsonb(array(
        select key from jsonb_object_keys(v_patch) keys(key) order by key)),
      'allowed_fields','[]'::jsonb
    );
  end if;

  select coalesce(array_agg(key order by key),'{}'::text[])
  into v_bad_fields
  from jsonb_object_keys(v_patch) as keys(key)
  where not (key=any(v_allowed));

  if cardinality(v_bad_fields)>0 then
    return jsonb_build_object(
      'ok',false,
      'code','item_field_forbidden',
      'error','Bạn không được cập nhật các trường: '||
        array_to_string(v_bad_fields,', '),
      'forbidden_fields',to_jsonb(v_bad_fields),
      'allowed_fields',to_jsonb(v_allowed)
    );
  end if;

  if p_expected_version is not null and v_item.version is distinct from p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'version_conflict',
      'error', 'Hạng mục đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại dữ liệu và thử lại.',
      'current_version', v_item.version
    );
  end if;

  if coalesce(v_item.item_state, 'active') <> 'active' then
    return jsonb_build_object('ok', false, 'error',
      'Hạng mục đang ở trạng thái nghiệp vụ "' || v_item.item_state ||
      '" — không thể cập nhật tiến độ. Đổi sang "active" trước.');
  end if;

  if (v_patch->>'actual_protocol_date')::date > current_date
     or (v_patch->>'actual_validation_date')::date > current_date
     or (v_patch->>'actual_report_date')::date > current_date
     or (v_patch->>'actual_vmp_date')::date > current_date then
    return jsonb_build_object('ok', false, 'code', 'ngay_tuong_lai', 'error',
      'Ngày hoàn thành thực tế không thể nằm ở tương lai (hôm nay là ' ||
      to_char(current_date, 'DD/MM/YYYY') ||
      '). ALCOA+ đòi ghi nhận đồng thời với việc làm.');
  end if;

  v_requires_reason := (v_patch->>'status_vmp' = 'completed')
                    or (v_patch->>'status_validation' = 'completed')
                    or (v_patch->>'status_report' = 'completed')
                    or (v_patch->>'status_protocol' = 'completed')
                    or (v_patch ? 'actual_vmp_date')
                    or (v_patch ? 'actual_validation_date')
                    or (v_patch ? 'actual_report_date')
                    or (v_patch ? 'actual_protocol_date');
  if v_requires_reason and (p_reason is null or btrim(p_reason) = '') then
    return jsonb_build_object('ok', false, 'error',
      'Cần nhập LÝ DO khi đánh dấu hoàn thành, sửa hoặc xoá ngày hoàn thành (yêu cầu GMP)');
  end if;

  if v_patch ? 'scheduled_at' then
    v_scheduled_at := public.vmp_parse_scheduled_at(v_patch->>'scheduled_at');
  end if;

  perform set_config('app.audit_source', 'dashboard_rpc', true);
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);

  update public.vmp_plan_items set
    status_protocol = case when v_patch ? 'status_protocol'
      then (v_patch->>'status_protocol')::phase_status else status_protocol end,
    status_validation = case when v_patch ? 'status_validation'
      then (v_patch->>'status_validation')::phase_status else status_validation end,
    status_report = case when v_patch ? 'status_report'
      then (v_patch->>'status_report')::phase_status else status_report end,
    status_vmp = case when v_patch ? 'status_vmp'
      then (v_patch->>'status_vmp')::phase_status else status_vmp end,
    actual_protocol_date = case when v_patch ? 'actual_protocol_date'
      then (v_patch->>'actual_protocol_date')::date else actual_protocol_date end,
    actual_validation_date = case when v_patch ? 'actual_validation_date'
      then (v_patch->>'actual_validation_date')::date else actual_validation_date end,
    actual_report_date = case when v_patch ? 'actual_report_date'
      then (v_patch->>'actual_report_date')::date else actual_report_date end,
    actual_vmp_date = case when v_patch ? 'actual_vmp_date'
      then (v_patch->>'actual_vmp_date')::date else actual_vmp_date end,
    scheduled_at = case when v_patch ? 'scheduled_at'
      then v_scheduled_at else scheduled_at end,
    scheduled_date = case when v_patch ? 'scheduled_at'
      then (v_scheduled_at at time zone 'Asia/Bangkok')::date else scheduled_date end,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where validation_code = p_validation_code;

  if false and p_sheet_patch is not null and p_sheet_patch <> '{}'::jsonb then
    insert into public.sheet_sync_outbox (validation_code, sheet_patch, status, next_attempt_at)
    values (p_validation_code, p_sheet_patch, 'pending', now() + interval '30 seconds')
    on conflict (validation_code) where status = 'pending'
    do update set sheet_patch = sheet_sync_outbox.sheet_patch || excluded.sheet_patch,
                  next_attempt_at = now() + interval '30 seconds',
                  updated_at = now()
    returning id into v_outbox_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'validation_code', p_validation_code,
    'msg', 'Đã cập nhật thành công', 'reason_logged', v_requires_reason,
    'outbox_id', v_outbox_id, 'version', v_item.version + 1
  );
exception when others then
  raise log 'rpc_update_progress lỗi (code=%, sqlstate=%): %',
    p_validation_code, sqlstate, sqlerrm;
  begin
    insert into public.data_quality_issues (
      plan_item_id, object_code, issue_type, severity, message, detected_at
    ) values (
      (select id from public.vmp_plan_items where validation_code = p_validation_code limit 1),
      null, 'rpc_error', 'error',
      'rpc_update_progress(' || p_validation_code || '): ' || sqlerrm || ' [sqlstate=' || sqlstate || ']',
      now()
    );
  exception when others then null;
  end;
  return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;


--
-- Name: rpc_update_progress__five_role_impl_20260824("text", "jsonb", "text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_update_progress__five_role_impl_20260824"("p_validation_code" "text", "p_patch" "jsonb", "p_reason" "text" DEFAULT NULL::"text", "p_sheet_patch" "jsonb" DEFAULT NULL::"jsonb", "p_expected_version" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_item vmp_plan_items%rowtype;
  v_role user_role;
  v_user_dept text;
  v_item_dept text;
  v_requires_reason boolean := false;
  v_outbox_id bigint := null;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_mode text := public.item_permissions_mode();
  v_allowed text[] := '{}'::text[];
  v_bad_fields text[] := '{}'::text[];
  v_scheduled_at timestamptz;
begin
  if jsonb_typeof(v_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Patch phải là một object JSON');
  end if;

  -- Tên cũ chỉ còn là đường tương thích; mọi kiểm quyền dùng scheduled_at.
  if v_patch ? 'scheduled_date' then
    if not (v_patch ? 'scheduled_at') then
      v_patch := jsonb_set(v_patch, '{scheduled_at}', v_patch -> 'scheduled_date', true);
    end if;
    v_patch := v_patch - 'scheduled_date';
  end if;

  select role, department into v_role, v_user_dept
  from public.profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;

  select * into v_item from public.vmp_plan_items
  where validation_code = p_validation_code and is_active = true;
  if v_item.id is null then
    return jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || p_validation_code);
  end if;

  if p_expected_version is not null and v_item.version is distinct from p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'version_conflict',
      'error', 'Hạng mục đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại dữ liệu và thử lại.',
      'current_version', v_item.version
    );
  end if;

  if v_mode = 'enforced' then
    v_allowed := public.vmp_allowed_timeline_fields(auth.uid(), p_validation_code);
    select coalesce(array_agg(key order by key), '{}'::text[])
    into v_bad_fields
    from jsonb_object_keys(v_patch) as keys(key)
    where not (key = any(v_allowed));

    if cardinality(v_bad_fields) > 0 then
      return jsonb_build_object(
        'ok', false,
        'code', 'item_field_forbidden',
        'error', 'Bạn không được cập nhật các trường: ' || array_to_string(v_bad_fields, ', '),
        'forbidden_fields', to_jsonb(v_bad_fields),
        'allowed_fields', to_jsonb(v_allowed)
      );
    end if;
  else
    -- Preview chỉ tính và hiển thị quyền mới; luật đang chạy vẫn giữ nguyên.
    if public.muc_quyen('update_progress', v_role::text) = 'khong' then
      return jsonb_build_object('ok', false, 'error', 'Viewer không có quyền cập nhật');
    end if;
    v_item_dept := public.ly_do_khong_sua_duoc(p_validation_code, auth.uid());
    if v_item_dept <> '' then
      return jsonb_build_object('ok', false, 'error', v_item_dept);
    end if;
  end if;

  if coalesce(v_item.item_state, 'active') <> 'active' then
    return jsonb_build_object('ok', false, 'error',
      'Hạng mục đang ở trạng thái nghiệp vụ "' || v_item.item_state ||
      '" — không thể cập nhật tiến độ. Đổi sang "active" trước.');
  end if;

  if (v_patch->>'actual_protocol_date')::date > current_date
     or (v_patch->>'actual_validation_date')::date > current_date
     or (v_patch->>'actual_report_date')::date > current_date
     or (v_patch->>'actual_vmp_date')::date > current_date then
    return jsonb_build_object('ok', false, 'code', 'ngay_tuong_lai', 'error',
      'Ngày hoàn thành thực tế không thể nằm ở tương lai (hôm nay là ' ||
      to_char(current_date, 'DD/MM/YYYY') ||
      '). ALCOA+ đòi ghi nhận đồng thời với việc làm.');
  end if;

  v_requires_reason := (v_patch->>'status_vmp' = 'completed')
                    or (v_patch->>'status_validation' = 'completed')
                    or (v_patch->>'status_report' = 'completed')
                    or (v_patch->>'status_protocol' = 'completed')
                    or (v_patch ? 'actual_vmp_date')
                    or (v_patch ? 'actual_validation_date')
                    or (v_patch ? 'actual_report_date')
                    or (v_patch ? 'actual_protocol_date');
  if v_requires_reason and (p_reason is null or btrim(p_reason) = '') then
    return jsonb_build_object('ok', false, 'error',
      'Cần nhập LÝ DO khi đánh dấu hoàn thành, sửa hoặc xoá ngày hoàn thành (yêu cầu GMP)');
  end if;

  if v_patch ? 'scheduled_at' then
    v_scheduled_at := public.vmp_parse_scheduled_at(v_patch->>'scheduled_at');
  end if;

  perform set_config('app.audit_source', 'dashboard_rpc', true);
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);

  update public.vmp_plan_items set
    status_protocol = case when v_patch ? 'status_protocol'
      then (v_patch->>'status_protocol')::phase_status else status_protocol end,
    status_validation = case when v_patch ? 'status_validation'
      then (v_patch->>'status_validation')::phase_status else status_validation end,
    status_report = case when v_patch ? 'status_report'
      then (v_patch->>'status_report')::phase_status else status_report end,
    status_vmp = case when v_patch ? 'status_vmp'
      then (v_patch->>'status_vmp')::phase_status else status_vmp end,
    actual_protocol_date = case when v_patch ? 'actual_protocol_date'
      then (v_patch->>'actual_protocol_date')::date else actual_protocol_date end,
    actual_validation_date = case when v_patch ? 'actual_validation_date'
      then (v_patch->>'actual_validation_date')::date else actual_validation_date end,
    actual_report_date = case when v_patch ? 'actual_report_date'
      then (v_patch->>'actual_report_date')::date else actual_report_date end,
    actual_vmp_date = case when v_patch ? 'actual_vmp_date'
      then (v_patch->>'actual_vmp_date')::date else actual_vmp_date end,
    scheduled_at = case when v_patch ? 'scheduled_at'
      then v_scheduled_at else scheduled_at end,
    scheduled_date = case when v_patch ? 'scheduled_at'
      then (v_scheduled_at at time zone 'Asia/Bangkok')::date else scheduled_date end,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where validation_code = p_validation_code;

  if false and p_sheet_patch is not null and p_sheet_patch <> '{}'::jsonb then
    insert into public.sheet_sync_outbox (validation_code, sheet_patch, status, next_attempt_at)
    values (p_validation_code, p_sheet_patch, 'pending', now() + interval '30 seconds')
    on conflict (validation_code) where status = 'pending'
    do update set sheet_patch = sheet_sync_outbox.sheet_patch || excluded.sheet_patch,
                  next_attempt_at = now() + interval '30 seconds',
                  updated_at = now()
    returning id into v_outbox_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'validation_code', p_validation_code,
    'msg', 'Đã cập nhật thành công', 'reason_logged', v_requires_reason,
    'outbox_id', v_outbox_id, 'version', v_item.version + 1
  );
exception when others then
  raise log 'rpc_update_progress lỗi (code=%, sqlstate=%): %',
    p_validation_code, sqlstate, sqlerrm;
  begin
    insert into public.data_quality_issues (
      plan_item_id, object_code, issue_type, severity, message, detected_at
    ) values (
      (select id from public.vmp_plan_items where validation_code = p_validation_code limit 1),
      null, 'rpc_error', 'error',
      'rpc_update_progress(' || p_validation_code || '): ' || sqlerrm || ' [sqlstate=' || sqlstate || ']',
      now()
    );
  exception when others then null;
  end;
  return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;


--
-- Name: rpc_upsert_alert_recipient("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_alert_recipient"("p_id" "uuid", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role  text;
  v_id    uuid := p_id;
  v_email text := nullif(btrim(p_patch ->> 'email'), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh sách nhận cảnh báo');
  end if;
  if v_id is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập email');
  end if;

  if v_id is null then
    insert into public.vmp_alert_recipients (email, updated_by) values (v_email, auth.uid())
    returning id into v_id;
  end if;

  update public.vmp_alert_recipients r set
    is_enabled     = coalesce((p_patch ->> 'is_enabled')::boolean, r.is_enabled),
    scope_type     = coalesce(nullif(btrim(p_patch ->> 'scope_type'), ''), r.scope_type),
    scope          = coalesce(p_patch ->> 'scope',          r.scope),
    email          = coalesce(v_email,                      r.email),
    recipient_name = coalesce(p_patch ->> 'recipient_name', r.recipient_name),
    alert_kind     = coalesce(nullif(btrim(p_patch ->> 'alert_kind'), ''), r.alert_kind),
    threshold_days = coalesce((p_patch ->> 'threshold_days')::integer, r.threshold_days),
    note           = coalesce(p_patch ->> 'note',           r.note),
    ai_report_enabled  = coalesce((p_patch ->> 'ai_report_enabled')::boolean, r.ai_report_enabled),
    ai_report_schedule = coalesce(nullif(btrim(p_patch ->> 'ai_report_schedule'), ''), r.ai_report_schedule),
    updated_by     = auth.uid()
  where r.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'msg', 'Đã lưu người nhận');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


--
-- Name: rpc_upsert_item_permission_staff("uuid", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_item_permission_staff"("p_person_id" "uuid", "p_patch" "jsonb", "p_reason" "text", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_upsert_item_permission_staff__five_role_impl_20260824(p_person_id, p_patch, p_reason, p_expected_version); end $$;


--
-- Name: rpc_upsert_item_permission_staff__five_role_impl_20260824("uuid", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_item_permission_staff__five_role_impl_20260824"("p_person_id" "uuid", "p_patch" "jsonb", "p_reason" "text", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor_role text := public.vmp_business_role(auth.uid());
begin
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin'
      and coalesce(p_patch, '{}'::jsonb) ? 'access_class' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin được đổi phân loại quyền'
    );
  end if;
  return public.vmp_upsert_item_permission_staff_before_focused_enforcement(
    p_person_id, p_patch, p_reason, p_expected_version
  );
end
$$;


--
-- Name: rpc_upsert_object("text", "text", "text", "text", "text", "text", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_object"("p_code" "text", "p_name" "text", "p_classification" "text", "p_department" "text", "p_area" "text", "p_criticality" "text", "p_frequency_months" integer, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_upsert_object__five_role_impl_20260824(p_code, p_name, p_classification, p_department, p_area, p_criticality, p_frequency_months, p_notes); end $$;


--
-- Name: rpc_upsert_object__five_role_impl_20260824("text", "text", "text", "text", "text", "text", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_object__five_role_impl_20260824"("p_code" "text", "p_name" "text", "p_classification" "text", "p_department" "text", "p_area" "text", "p_criticality" "text", "p_frequency_months" integer, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF not public.duoc_phep('edit_catalog', v_role::text) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Chỉ admin/QA manager được sửa danh mục');
  END IF;

  PERFORM set_config('app.audit_source', 'dashboard_inventory', true);

  INSERT INTO vmp_objects (code, name, classification, department, area, criticality, frequency_months, notes, is_active)
  VALUES (p_code, p_name, p_classification, p_department, p_area, p_criticality::criticality, p_frequency_months, p_notes, TRUE)
  ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    classification = EXCLUDED.classification,
    department = EXCLUDED.department,
    area = EXCLUDED.area,
    criticality = EXCLUDED.criticality,
    frequency_months = EXCLUDED.frequency_months,
    notes = EXCLUDED.notes,
    updated_at = NOW();

  RETURN jsonb_build_object('ok', true, 'code', p_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;


--
-- Name: rpc_upsert_performer("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_performer"("p_id" "uuid", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when coalesce(auth.role(), '') = 'service_role'
      or public.vmp_current_session_is_active() then jsonb_build_object(
        'ok', false,
        'error_code', 'LEGACY_RPC_DISABLED',
        'error', 'Đường lưu người thực hiện cũ đã ngừng; dùng danh bạ phân quyền có reason và version'
      )
    else public.vmp_session_denial()
end
$$;


--
-- Name: rpc_upsert_product_gmp("text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_product_gmp"("p_bfo_code" "text", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_code text := nullif(btrim(p_bfo_code), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh mục sản phẩm');
  end if;
  if v_code is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập Mã BFO');
  end if;

  insert into public.vmp_products_gmp (bfo_code, source_row)
  values (v_code, 0)
  on conflict (bfo_code) do nothing;

  update public.vmp_products_gmp p set
    product_name     = coalesce(p_patch ->> 'product_name',     p.product_name),
    ingredients      = coalesce(p_patch ->> 'ingredients',      p.ingredients),
    strength         = coalesce(p_patch ->> 'strength',         p.strength),
    production_line  = coalesce(p_patch ->> 'production_line',  p.production_line),
    dosage_form      = coalesce(p_patch ->> 'dosage_form',      p.dosage_form),
    primary_pack     = coalesce(p_patch ->> 'primary_pack',     p.primary_pack),
    batch_size       = coalesce(p_patch ->> 'batch_size',       p.batch_size),
    note             = coalesce(p_patch ->> 'note',             p.note),
    mixing_tank      = coalesce(p_patch ->> 'mixing_tank',      p.mixing_tank),
    final_batch_size = coalesce(p_patch ->> 'final_batch_size', p.final_batch_size)
  where p.bfo_code = v_code;

  return jsonb_build_object('ok', true, 'bfo_code', v_code, 'msg', 'Đã lưu sản phẩm');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


--
-- Name: rpc_upsert_source_object("text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_source_object"("p_object_kind" "text", "p_object_code" "text", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.vmp_lock_catalog_object_v2(p_object_kind,p_object_code);
  return public.rpc_save_catalog_object__five_role_impl_20260824(
    p_object_kind,p_object_code,p_patch,
    'Service Source upsert with canonical QA reconciliation',null);
end
$$;


--
-- Name: rpc_upsert_source_row("text", integer, "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_source_row"("p_source_tab" "text", "p_row_number" integer, "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_upsert_source_row__five_role_impl_20260824(p_source_tab, p_row_number, p_payload); end $$;


--
-- Name: rpc_upsert_source_row__five_role_impl_20260824("text", integer, "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_source_row__five_role_impl_20260824"("p_source_tab" "text", "p_row_number" integer, "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_tab  text := nullif(btrim(p_source_tab), '');
  v_rn   integer := p_row_number;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa dữ liệu thô');
  end if;
  if v_tab is null then
    return jsonb_build_object('ok', false, 'error', 'Thiếu tên tab');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Nội dung dòng phải là đối tượng JSON');
  end if;

  if v_rn is null then
    select coalesce(max(row_number), 1) + 1 into v_rn
    from public.vmp_source_rows where source_tab = v_tab;
  end if;

  insert into public.vmp_source_rows (source_tab, row_number, payload)
  values (v_tab, v_rn, p_payload)
  on conflict (source_tab, row_number) do update set payload = excluded.payload;

  return jsonb_build_object('ok', true, 'source_tab', v_tab, 'row_number', v_rn,
                            'msg', 'Đã lưu dòng');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


--
-- Name: rpc_upsert_staff_email("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_upsert_staff_email"("p_id" "uuid", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role  text;
  v_id    uuid := p_id;
  v_email text := nullif(btrim(p_patch ->> 'email'), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh bạ');
  end if;
  if v_id is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập email');
  end if;

  if v_id is null then
    insert into public.vmp_staff_emails (staff_name, email, updated_by)
    values (coalesce(nullif(btrim(p_patch ->> 'staff_name'), ''), v_email), v_email, auth.uid())
    returning id into v_id;
  end if;

  update public.vmp_staff_emails s set
    staff_name = coalesce(nullif(btrim(p_patch ->> 'staff_name'), ''), s.staff_name),
    email      = coalesce(v_email, s.email),
    department = coalesce(p_patch ->> 'department', s.department),
    note       = coalesce(p_patch ->> 'note',       s.note),
    is_active  = coalesce((p_patch ->> 'is_active')::boolean, s.is_active),
    updated_by = auth.uid()
  where s.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'msg', 'Đã lưu nhân sự');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


--
-- Name: screen_access_mode(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."screen_access_mode"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce((
    select value #>> '{}'
    from public.system_config
    where key = 'screen_access_mode'
  ), 'preview')
$$;


--
-- Name: trigger_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trigger_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: tu_tao_ho_so_nguoi_dung(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."tu_tao_ho_so_nguoi_dung"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    /* Tên hiển thị lấy theo thứ tự: tên người dùng tự khai khi đăng ký →
       tên Google trả về → phần trước @ của email. Không để trống: ma trận
       B gộp người theo TÊN, dòng không tên sẽ không khớp được với ai. */
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Người dùng mới'
    ),
    'viewer',
    true
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  /* Không được để lỗi ở đây làm hỏng việc tạo tài khoản: thà có tài khoản
     mà thiếu hồ sơ (tình trạng cũ, người quản trị vá tay được) còn hơn
     người dùng không đăng ký nổi mà không hiểu vì sao. */
  raise warning 'Không tạo được hồ sơ cho %: %', new.id, sqlerrm;
  return new;
end;
$$;


--
-- Name: tu_tao_ho_so_nhan_su(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."tu_tao_ho_so_nhan_su"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  /* vmp_performers_user_id_uniq (migration 20260801110000) buộc MỖI
     user_id chỉ xuất hiện tối đa MỘT dòng trong toàn bảng, kể cả dòng đã
     is_active=false — chặt hơn vmp_performers_one_active_per_user (chỉ
     xét dòng đang hoạt động). Phải kiểm theo ràng buộc chặt nhất, không
     thì insert bên dưới vỡ unique index thay vì rơi vào ON CONFLICT. */
  if exists (
    select 1 from public.vmp_performers p
    where p.user_id = new.id
  ) then
    return new;
  end if;

  insert into public.vmp_performers (
    performer_name, department, email, user_id, access_class,
    scope_departments, access_areas, scope_factory_ids, scope_area_ids,
    scope_line_ids, is_active, note
  ) values (
    new.full_name, new.department, new.email, new.id, null,
    '{}', '{}', '{}', '{}', '{}', true,
    'Tự tạo khi có tài khoản mới — Admin bổ sung bộ phận, phân loại và phạm vi ở màn Nhân sự.'
  )
  on conflict (user_id) where user_id is not null do nothing;
  return new;
exception when others then
  /* Cùng nguyên tắc với tu_tao_ho_so_nguoi_dung(): lỗi ở đây không được
     làm hỏng việc tạo tài khoản. Thà thiếu hồ sơ (Admin vá tay được, y
     hệt tình trạng trước migration này) còn hơn chặn cả đăng ký. */
  raise warning 'Không tự tạo được hồ sơ nhân sự cho %: %', new.id, sqlerrm;
  return new;
end;
$$;


--
-- Name: validate_plan_item("public"."vmp_plan_items"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."validate_plan_item"("item" "public"."vmp_plan_items") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  errors TEXT[] := '{}';
BEGIN
  -- 1. Bắt buộc có object_code
  IF item.object_code IS NULL OR item.object_code = '' THEN
    errors := array_append(errors, 'Thiếu mã đối tượng (object_code)');
  END IF;

  -- 2. Bắt buộc có validation_type
  IF item.validation_type IS NULL OR item.validation_type = '' THEN
    errors := array_append(errors, 'Thiếu loại thẩm định (validation_type)');
  END IF;

  -- 3. Nếu status_vmp = completed thì phải có actual_vmp_date
  IF item.status_vmp = 'completed' AND item.actual_vmp_date IS NULL THEN
    errors := array_append(errors, 'Trạng thái VMP = hoàn thành nhưng thiếu ngày hoàn thành');
  END IF;

  -- 4. actual_vmp_date không được trước deadline_protocol
  IF item.actual_vmp_date IS NOT NULL AND item.deadline_protocol IS NOT NULL
     AND item.actual_vmp_date < item.deadline_protocol THEN
    errors := array_append(errors, 'Ngày hoàn thành VMP trước ngày bắt đầu đề cương — kiểm tra lại');
  END IF;

  -- 5. Nếu có actual_validation_date mà status_validation vẫn not_started
  IF item.actual_validation_date IS NOT NULL AND item.status_validation = 'not_started' THEN
    errors := array_append(errors, 'Có ngày thẩm định thực tế nhưng trạng thái vẫn "chưa bắt đầu"');
  END IF;

  -- 6. Deadline VMP phải sau deadline protocol
  IF item.deadline_vmp IS NOT NULL AND item.deadline_protocol IS NOT NULL
     AND item.deadline_vmp < item.deadline_protocol THEN
    errors := array_append(errors, 'Deadline VMP trước deadline đề cương — kiểm tra thứ tự');
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(errors, 1) IS NULL,
    'errors', to_jsonb(errors)
  );
END;
$$;


--
-- Name: vmp_ai_dau_van(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_ai_dau_van"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::text
      || '|' || coalesce(max(updated_at), 'epoch'::timestamptz)::text
      || '|' || current_date::text
      -- Phiên bản logic: sửa lời nhắc / định tuyến / mô hình thì tăng số
      -- này, đệm cũ tự hết hiệu lực.
      || '|v' || coalesce((select value #>> '{}' from public.system_config
                           where key = 'ai_phien_ban_logic'), '0')
  from public.vmp_visible_plan_items() where is_active;
$$;


--
-- Name: vmp_ai_ghi_dem(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_ai_ghi_dem"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Chỉ đệm câu do AI trả lời. Đường SQL đã nhanh sẵn.
  if new.duong_tra_loi not in ('gemini', 'du_phong')
     or new.answer is null or length(new.answer) < 20 then
    return new;
  end if;

  insert into public.vmp_ai_cache
    (khoa_cau_hoi, dau_van, cau_hoi_goc, tra_loi, nguon)
  values
    (public.vmp_ai_khoa_cau_hoi(new.question), public.vmp_ai_dau_van(),
     new.question, new.answer, new.duong_tra_loi)
  on conflict (khoa_cau_hoi, dau_van) do update
    set tra_loi = excluded.tra_loi, nguon = excluded.nguon, tao_luc = now(),
        het_han_luc = now() + interval '24 hours';
  return new;
exception when others then
  -- Đệm hỏng không được làm hỏng nhật ký — nhật ký là yêu cầu ALCOA+.
  return new;
end;
$$;


--
-- Name: vmp_ai_khoa_cau_hoi("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_ai_khoa_cau_hoi"("p_q" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select regexp_replace(trim(public.vmp_khong_dau(coalesce(p_q, ''))), '\s+', ' ', 'g')
$$;


--
-- Name: vmp_ai_lang_dong(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_ai_lang_dong"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_ma text;
begin
  if new.phien is null or new.phien !~ '@' then return new; end if;

  if new.y_dinh = 'tam_su' then
    perform public.rpc_ai_ghi_nho(new.phien, 'viec_da_xay_ra',
      'Từng nói đang quá tải, mệt vì nhiều việc',
      array['met','ap luc','qua tai','nhieu viec'], 7);
  end if;

  -- Hỏi về cùng một mã ≥ 2 lần trong 30 ngày → đó là mối quan tâm thật
  select o.code into v_ma
  from vmp_objects o
  where o.is_active and length(o.code) >= 4
    and public.vmp_khong_dau(new.cau_hoi) like '%' || public.vmp_khong_dau(o.code) || '%'
  limit 1;

  if v_ma is not null and (
      select count(*) from public.vmp_ai_hoi_thoai h
      where h.phien = new.phien and h.tao_luc > now() - interval '30 days'
        and public.vmp_khong_dau(h.cau_hoi) like '%' || public.vmp_khong_dau(v_ma) || '%') >= 2
  then
    perform public.rpc_ai_ghi_nho(new.phien, 'dieu_biet_ve',
      'Hay hỏi về thiết bị ' || v_ma, array[public.vmp_khong_dau(v_ma)], 6);
  end if;

  return new;
exception when others then
  return new;   -- lắng đọng hỏng không được làm hỏng hội thoại
end;
$$;


--
-- Name: vmp_allowed_timeline_fields("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_allowed_timeline_fields"("p_uid" "uuid", "p_validation_code" "text") RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce((
    select rights.editable_fields
    from public.vmp_item_rights(p_uid, p_validation_code) rights
  ), '{}'::text[])
$$;


--
-- Name: vmp_apply_catalog_change_v2_impl("uuid", "text", integer, "jsonb", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_apply_catalog_change_v2_impl"("p_change_id" "uuid", "p_reason" "text", "p_expected_timeline_revision" integer, "p_deadline_overrides" "jsonb", "p_override_confirmed" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_change public.vmp_catalog_changes%rowtype;
  v_source public.vmp_source_objects%rowtype;
  v_item public.vmp_plan_items%rowtype;
  v_selection jsonb;
  v_candidate jsonb;
  v_preview jsonb;
  v_entry jsonb;
  v_moc record;
  v_match text[];
  v_codes text[];
  v_selected_codes text[];
  v_locked_codes text[];
  v_inventory_before text[];
  v_inventory_after text[];
  v_expected_inventory text[];
  v_year integer:=extract(year from now())::integer;
  v_expected integer;
  v_index integer:=0;
  v_count integer;
  v_v1 jsonb;
  v_snapshots jsonb:='{}'::jsonb;
  v_locked_snapshots jsonb:='{}'::jsonb;
  v_snapshot jsonb;
  v_source_snapshot jsonb;
  v_current jsonb;
  v_deadline_results jsonb:='[]'::jsonb;
  v_result jsonb;
  v_effective_role text;
begin
  select * into v_change from public.vmp_catalog_changes where id=p_change_id;
  if v_change.id is null then
    return jsonb_build_object('ok',false,'error_code','CHANGE_NOT_FOUND','error','Không tìm thấy thay đổi này');
  end if;
  perform public.vmp_lock_catalog_object_v2(v_change.object_kind,v_change.object_code);
  select * into v_change from public.vmp_catalog_changes where id=p_change_id for update;
  if v_change.id is null then
    return jsonb_build_object('ok',false,'error_code','CHANGE_NOT_FOUND','error','Không tìm thấy thay đổi này');
  end if;
  if v_change.status='applied' then
    return coalesce(v_change.apply_result,jsonb_build_object('ok',true))
      ||jsonb_build_object('ok',true,'da_ap_truoc_do',true);
  end if;
  if v_change.status='superseded' then
    return jsonb_build_object('ok',false,'error_code','SUPERSEDED','error','Thay đổi này đã bị một thay đổi mới hơn thay thế');
  end if;
  if p_expected_timeline_revision is null then
    return jsonb_build_object('ok',false,'error_code','EXPECTED_REVISION_REQUIRED','error','Thiếu phiên bản timeline đã xem trước');
  end if;
  if p_deadline_overrides is null or jsonb_typeof(p_deadline_overrides)<>'array' then
    return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD',
      'error','Danh sách ghi đè deadline không hợp lệ',
      'details',jsonb_build_array(jsonb_build_object('index',null,'reason','TOP_LEVEL_MUST_BE_ARRAY')));
  end if;
  for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
    if jsonb_typeof(v_selection)<>'object' then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','ITEM_MUST_BE_OBJECT')));
    end if;
    if not (v_selection?'validation_code' and v_selection?'expected_item_version')
       or (select count(*) from jsonb_object_keys(v_selection))<>2 then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','EXACT_KEYS_REQUIRED')));
    end if;
    if jsonb_typeof(v_selection->'validation_code')<>'string'
       or nullif(btrim(v_selection->>'validation_code'),'') is null then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','VALIDATION_CODE_REQUIRED')));
    end if;
    if jsonb_typeof(v_selection->'expected_item_version')<>'number'
       or (v_selection->>'expected_item_version')!~'^-?[0-9]+$' then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','INTEGER_VERSION_REQUIRED')));
    end if;
    begin v_expected:=(v_selection->>'expected_item_version')::integer;
    exception when numeric_value_out_of_range then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','INTEGER_VERSION_REQUIRED')));
    end;
    v_index:=v_index+1;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_deadline_overrides) e
      group by e->>'validation_code' having count(*)>1) then
    return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
      'details',jsonb_build_array(jsonb_build_object('index',null,'reason','DUPLICATE_VALIDATION_CODE')));
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'error_code','REASON_REQUIRED','error','Phải nhập lý do trước khi áp vào timeline');
  end if;
  if jsonb_array_length(p_deadline_overrides)>0 and p_override_confirmed is not true then
    return jsonb_build_object('ok',false,'error_code','OVERRIDE_NOT_CONFIRMED',
      'error','Cần xác nhận đặc biệt để áp deadline đã có tiến độ');
  end if;

  select * into v_source from public.vmp_source_objects
  where object_kind=v_change.object_kind and object_code=v_change.object_code for update;
  if v_source.id is null then
    return jsonb_build_object('ok',false,'error_code','OBJECT_NOT_FOUND','error','Đối tượng đã bị xoá khỏi danh mục');
  end if;
  if v_source.timeline_revision is distinct from p_expected_timeline_revision then
    return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
      'error','Timeline đã đổi — xem trước lại',
      'expected_timeline_revision',p_expected_timeline_revision,
      'current_timeline_revision',v_source.timeline_revision);
  end if;

  select coalesce(array_agg(value->>'validation_code' order by value->>'validation_code'),'{}'::text[])
  into v_selected_codes from jsonb_array_elements(p_deadline_overrides);

  -- Lock a deterministic stable superset before the authoritative preview:
  -- every row currently owned by the source object, every current-year row
  -- whose terminal identity names it, and every explicitly selected code.
  -- A later preview row outside this locked set is rejected before mutation.
  perform 1 from public.vmp_plan_items pi
  where pi.object_code=v_source.object_code
     or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/')
     or pi.validation_code=any(v_selected_codes)
  order by pi.validation_code for update;

  select coalesce(array_agg(pi.validation_code order by pi.validation_code),'{}'::text[]),
         coalesce(jsonb_object_agg(pi.validation_code,to_jsonb(pi) order by pi.validation_code),'{}'::jsonb)
  into v_locked_codes,v_locked_snapshots
  from public.vmp_plan_items pi
  where pi.object_code=v_source.object_code
     or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/')
     or pi.validation_code=any(v_selected_codes);

  select coalesce(array_agg(pi.validation_code order by pi.validation_code),'{}'::text[])
  into v_inventory_before
  from public.vmp_plan_items pi
  where pi.object_code=v_source.object_code
     or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/');
  v_source_snapshot:=to_jsonb(v_source);

  v_preview:=public.rpc_preview_catalog_change_v2(p_change_id);
  if coalesce((v_preview->>'ok')::boolean,false) is not true then return v_preview; end if;
  select coalesce(array_agg(distinct code order by code),'{}'::text[]) into v_codes from (
    select value->>'validation_code' code from jsonb_array_elements(coalesce(v_preview->'tao','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'sua','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'dung','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'giu_nguyen','[]'))
  ) impact where code is not null;
  if exists (
    select 1 from unnest(v_codes) impact(code)
    join public.vmp_plan_items pi on pi.validation_code=impact.code
    where not (impact.code=any(v_locked_codes))
  ) then
    return jsonb_build_object('ok',false,'error_code','WRITE_MISMATCH',
      'error','Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác');
  end if;

  for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
    select * into v_item from public.vmp_plan_items where validation_code=v_selection->>'validation_code';
    if v_item.id is null then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_ITEM',
        'error','Mã ghi đè không hợp lệ: '||(v_selection->>'validation_code'),
        'details',jsonb_build_array(v_selection->>'validation_code'));
    end if;
    v_expected:=(v_selection->>'expected_item_version')::integer;
    if v_item.version is distinct from v_expected then
      return jsonb_build_object('ok',false,'error_code','ITEM_STATE_CHANGED',
        'error','Hạng mục '||(v_selection->>'validation_code')||' đã đổi sau khi xem trước; hãy xem trước lại',
        'validation_code',v_selection->>'validation_code','expected_item_version',v_expected,
        'current_item_version',v_item.version,'requires_fresh_preview',true);
    end if;
  end loop;

  for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
    select value into v_candidate from jsonb_array_elements(coalesce(v_preview->'deadline_overrides','[]'))
    where value->>'validation_code'=v_selection->>'validation_code';
    if v_candidate is null then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_ITEM',
        'error','Mã ghi đè không hợp lệ: '||(v_selection->>'validation_code'),
        'details',jsonb_build_array(v_selection->>'validation_code'));
    end if;
    if v_candidate->>'blocker_code'='MISSING_SOURCE_DATA' then
      return jsonb_build_object('ok',false,'error_code','MISSING_SOURCE_DATA',
        'error','Không tính đủ deadline cho '||(v_selection->>'validation_code'),
        'missing',jsonb_build_array(jsonb_build_object('validation_code',v_selection->>'validation_code','fields',v_candidate->'missing')));
    end if;
    if v_candidate->>'blocker_code'='NO_ACTIONABLE_CHANGE' then
      return jsonb_build_object('ok',false,'error_code','NO_ACTIONABLE_CHANGE','error','Không có thay đổi để áp');
    end if;
    if coalesce((v_candidate->>'eligible')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_ITEM',
        'error','Mã ghi đè không hợp lệ: '||(v_selection->>'validation_code'),
        'details',jsonb_build_array(jsonb_build_object('validation_code',v_selection->>'validation_code',
          'reason',v_candidate->>'blocker_reason','blocker_code',v_candidate->>'blocker_code')));
    end if;
    select * into v_item from public.vmp_plan_items where validation_code=v_selection->>'validation_code';
    v_snapshots:=v_snapshots||jsonb_build_object(v_item.validation_code,to_jsonb(v_item));
  end loop;

  if jsonb_array_length(coalesce(v_preview->'tao','[]'))=0
     and jsonb_array_length(coalesce(v_preview->'sua','[]'))=0
     and jsonb_array_length(coalesce(v_preview->'dung','[]'))=0
     and jsonb_array_length(p_deadline_overrides)=0 then
    return jsonb_build_object('ok',false,'error_code','NO_ACTIONABLE_CHANGE','error','Không có thay đổi để áp');
  end if;

  begin
    perform set_config('app.audit_source','catalog_progressed_deadline_override',true);
    perform set_config('app.audit_reason',btrim(p_reason),true);
    v_v1:=public.rpc_apply_catalog_change(p_change_id,p_reason,p_expected_timeline_revision);
    if coalesce((v_v1->>'ok')::boolean,false) is not true then
      raise exception using errcode='P2001',message='V1_REJECTED';
    end if;

    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'tao','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      if not found then raise exception using errcode='P2001',message='CREATE_ROW_MISSING'; end if;
      v_match:=regexp_match(v_item.validation_code,'/([0-9]{4})\.([0-9]+)-(.+)$');
      if v_match is null then raise exception using errcode='P2001',message='CREATE_IDENTITY'; end if;
      select * into v_moc from public.vmp_tinh_moc_thoi_gian(v_item.year,v_source.first_month,
        coalesce(nullif(v_source.frequency_months,0),12),v_match[2]::integer,
        v_source.report_class,v_source.workdays,v_item.validation_type);
      if v_item.id is distinct from v_entry->>'validation_code'
         or v_item.validation_code is distinct from v_entry->>'validation_code'
         or v_item.object_code is distinct from v_source.object_code
         or v_item.validation_type is distinct from v_entry->>'validation_type'
         or v_item.year is distinct from v_year
         or v_item.report_class is distinct from coalesce(v_source.report_class,'Không phụ thuộc')
         or v_item.effort_days is distinct from v_source.workdays::numeric
         or v_item.deadline_protocol is distinct from v_moc.deadline_protocol
         or v_item.deadline_validation is distinct from v_moc.deadline_validation
         or v_item.deadline_report is distinct from v_moc.deadline_report
         or v_item.deadline_vmp is distinct from v_moc.deadline_vmp
         or v_item.departments is distinct from public.vmp_parse_depts(coalesce(v_source.department,''))
         or v_item.created_by is distinct from auth.uid()
         or v_item.updated_by is distinct from auth.uid()
         or v_item.owner_id is not null or v_item.owner_name is not null
         or v_item.secondary_owner is not null
         or v_item.actual_protocol_date is not null or v_item.actual_validation_date is not null
         or v_item.actual_report_date is not null or v_item.actual_vmp_date is not null
         or v_item.status_protocol is distinct from 'not_started'
         or v_item.status_validation is distinct from 'not_started'
         or v_item.status_report is distinct from 'not_started'
         or v_item.status_vmp is distinct from 'not_started'
         or v_item.is_active is distinct from true
         or v_item.item_state is distinct from 'active'
         or v_item.version<>0
         or (to_jsonb(v_item)-array[
               'id','validation_code','object_code','validation_type','report_class','effort_days','year',
               'deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
               'departments','created_by','updated_by','created_at','updated_at',
               'computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text'])
            is distinct from '{
              "owner_id":null,"owner_name":null,"secondary_owner":null,
              "criticality_score":null,"criticality":"medium",
              "actual_protocol_date":null,"actual_validation_date":null,
              "actual_report_date":null,"actual_vmp_date":null,"scheduled_date":null,
              "status_protocol":"not_started","status_validation":"not_started",
              "status_report":"not_started","status_vmp":"not_started",
              "is_active":true,"requires_qa_approval":false,
              "qa_approved_by":null,"qa_approved_at":null,
              "sheet_row_id":null,"last_synced":null,"deleted_from_sheet":false,
              "deleted_at":null,"delete_reason":null,"missing_from_sheet":false,
              "missing_since":null,"item_state":"active","version":0,
              "source_sync_run_id":null,"source_sheet_row":null,"source_sheet_data":{},
              "execution_departments":null,"department_text":null,"work_group":null,
              "scheduled_at":null,"owner_person_id":null,"support_person_id":null
            }'::jsonb then
        raise exception using errcode='P2001',message='CREATE_POSTSTATE';
      end if;
    end loop;
    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'sua','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      if not found then raise exception using errcode='P2001',message='UPDATE_ROW_MISSING'; end if;
      v_match:=regexp_match(v_item.validation_code,'/([0-9]{4})\.([0-9]+)-(.+)$');
      if v_match is null then raise exception using errcode='P2001',message='UPDATE_IDENTITY'; end if;
      select * into v_moc from public.vmp_tinh_moc_thoi_gian(v_item.year,v_source.first_month,
        coalesce(nullif(v_source.frequency_months,0),12),v_match[2]::integer,
        v_source.report_class,v_source.workdays,v_item.validation_type);
      v_snapshot:=v_locked_snapshots->(v_entry->>'validation_code');
      if v_snapshot is null
         or v_item.object_code is distinct from v_source.object_code
         or (v_source.report_class is not null and v_item.report_class is distinct from v_source.report_class)
         or (v_source.workdays is not null and v_item.effort_days is distinct from v_source.workdays::numeric)
         or v_item.deadline_protocol is distinct from v_moc.deadline_protocol
         or v_item.deadline_validation is distinct from v_moc.deadline_validation
         or v_item.deadline_report is distinct from v_moc.deadline_report
         or v_item.deadline_vmp is distinct from v_moc.deadline_vmp
         or v_item.version is distinct from (v_snapshot->>'version')::integer+1
         or v_item.updated_by is distinct from auth.uid()
         or (to_jsonb(v_item)-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
               'report_class','effort_days','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by'])
            is distinct from
            (v_snapshot-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
               'report_class','effort_days','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by']) then
        raise exception using errcode='P2001',message='UPDATE_POSTSTATE';
      end if;
    end loop;
    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'dung','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      v_snapshot:=v_locked_snapshots->(v_entry->>'validation_code');
      if not found or v_snapshot is null
         or v_item.object_code is distinct from v_source.object_code
         or coalesce(v_item.is_active,true) or v_item.item_state is distinct from 'not_applicable'
         or v_item.version is distinct from (v_snapshot->>'version')::integer+1
         or v_item.updated_by is distinct from auth.uid()
         or (to_jsonb(v_item)-array['is_active','item_state','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by'])
            is distinct from
            (v_snapshot-array['is_active','item_state','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by']) then
        raise exception using errcode='P2001',message='STOP_POSTSTATE';
      end if;
    end loop;

    -- Inventory is exact: V1 may add only the authoritative `tao` codes and
    -- may neither delete nor create any other source row.
    select coalesce(array_agg(distinct code order by code),'{}'::text[])
    into v_expected_inventory from (
      select unnest(v_inventory_before) code
      union all
      select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'tao','[]'))
    ) expected where code is not null;
    select coalesce(array_agg(pi.validation_code order by pi.validation_code),'{}'::text[])
    into v_inventory_after from public.vmp_plan_items pi
    where pi.object_code=v_source.object_code
       or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/');
    if v_inventory_after is distinct from v_expected_inventory then
      raise exception using errcode='P2001',message='ITEM_INVENTORY_POSTSTATE';
    end if;

    -- Every pre-existing row outside normal update/stop is byte-for-byte
    -- unchanged by V1. This includes progressed overrides and superset-only
    -- rows that the preview did not advertise.
    for v_entry in select to_jsonb(code) value from unnest(v_locked_codes) code loop
      if not exists (select 1 from jsonb_array_elements(coalesce(v_preview->'sua','[]')) e
                     where e->>'validation_code'=v_entry#>>'{}')
         and not exists (select 1 from jsonb_array_elements(coalesce(v_preview->'dung','[]')) e
                         where e->>'validation_code'=v_entry#>>'{}') then
        select to_jsonb(pi) into v_current from public.vmp_plan_items pi
        where pi.validation_code=v_entry#>>'{}';
        if v_current is distinct from v_locked_snapshots->(v_entry#>>'{}') then
          raise exception using errcode='P2001',message='UNCHANGED_ITEM_POSTSTATE';
        end if;
      end if;
    end loop;

    select to_jsonb(so) into v_current from public.vmp_source_objects so where so.id=v_source.id;
    if v_current is null
       or (v_current-array['timeline_applied_revision','updated_at'])
          is distinct from (v_source_snapshot-array['timeline_applied_revision','updated_at'])
       or (v_current->>'timeline_applied_revision')::integer is distinct from v_source.timeline_revision then
      raise exception using errcode='P2001',message='SOURCE_POSTSTATE';
    end if;

    for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
      select value into v_candidate from jsonb_array_elements(v_preview->'deadline_overrides')
      where value->>'validation_code'=v_selection->>'validation_code';
      v_snapshot:=v_snapshots->(v_selection->>'validation_code');
      update public.vmp_plan_items set
        deadline_protocol=(v_candidate->>'deadline_protocol_moi')::date,
        deadline_validation=(v_candidate->>'deadline_validation_moi')::date,
        deadline_report=(v_candidate->>'deadline_report_moi')::date,
        deadline_vmp=(v_candidate->>'deadline_vmp_moi')::date,
        updated_by=auth.uid(),updated_at=now()
      where validation_code=v_selection->>'validation_code'
        and version=(v_selection->>'expected_item_version')::integer;
      get diagnostics v_count=row_count;
      if v_count<>1 then raise exception using errcode='P2001',message='OVERRIDE_ROWCOUNT'; end if;
      select * into v_item from public.vmp_plan_items where validation_code=v_selection->>'validation_code';
      if v_item.deadline_protocol is distinct from (v_candidate->>'deadline_protocol_moi')::date
         or v_item.deadline_validation is distinct from (v_candidate->>'deadline_validation_moi')::date
         or v_item.deadline_report is distinct from (v_candidate->>'deadline_report_moi')::date
         or v_item.deadline_vmp is distinct from (v_candidate->>'deadline_vmp_moi')::date
         or v_item.version<>(v_selection->>'expected_item_version')::integer+1
         or (to_jsonb(v_item)-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp','computed_status','version','updated_at','updated_by'])
            is distinct from
            (v_snapshot-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp','computed_status','version','updated_at','updated_by']) then
        raise exception using errcode='P2001',message='OVERRIDE_POSTSTATE';
      end if;
      v_deadline_results:=v_deadline_results||jsonb_build_object(
        'validation_code',v_item.validation_code,
        'item_version_cu',(v_selection->>'expected_item_version')::integer,'item_version_moi',v_item.version,
        'deadline_protocol_cu',v_candidate->'deadline_protocol_cu','deadline_protocol_moi',v_candidate->'deadline_protocol_moi',
        'deadline_validation_cu',v_candidate->'deadline_validation_cu','deadline_validation_moi',v_candidate->'deadline_validation_moi',
        'deadline_report_cu',v_candidate->'deadline_report_cu','deadline_report_moi',v_candidate->'deadline_report_moi',
        'deadline_vmp_cu',v_candidate->'deadline_vmp_cu','deadline_vmp_moi',v_candidate->'deadline_vmp_moi',
        'actual_dates_unchanged',true,'statuses_unchanged',true);
    end loop;

    v_effective_role:=case when coalesce(auth.role(),'')='service_role' then 'service_role'
      else public.vmp_business_role(auth.uid()) end;
    v_result:=jsonb_build_object(
      'ok',true,'change_id',p_change_id,'object_code',v_source.object_code,
      'so_tao',jsonb_array_length(coalesce(v_preview->'tao','[]')),
      'so_sua',jsonb_array_length(coalesce(v_preview->'sua','[]')),
      'so_dung',jsonb_array_length(coalesce(v_preview->'dung','[]')),
      'so_giu_nguyen',jsonb_array_length(coalesce(v_preview->'giu_nguyen','[]')),
      'so_deadline_override',jsonb_array_length(p_deadline_overrides),
      'timeline_revision',v_source.timeline_revision,'actor_id',auth.uid(),
      'effective_role',v_effective_role,'reason',btrim(p_reason),
      'deadline_overrides',v_deadline_results,'da_ap_truoc_do',false);
    update public.vmp_catalog_changes set status='applied',impact=v_preview,apply_result=v_result,
      applied_by=auth.uid(),applied_at=now(),apply_reason=btrim(p_reason),last_error=null
    where id=p_change_id;
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception using errcode='P2001',message='RESULT_ROWCOUNT'; end if;
    return v_result;
  exception when sqlstate 'P2001' then
    return jsonb_build_object('ok',false,'error_code','WRITE_MISMATCH',
      'error','Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác');
  end;
end
$_$;


--
-- Name: vmp_business_role("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_business_role"("p_uid" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with prof as (
    select p.id, p.role::text as login_role, p.department
    from public.profiles p
    where p.id = p_uid
      and coalesce(p.is_active, true)
      and p.role::text <> 'viewer'
  ), linked as (
    select case when count(*) = 1 then (array_agg(f.id))[1] end as person_id
    from public.vmp_performers f
    where f.user_id = p_uid and f.is_active
  ), person as (
    select f.* from public.vmp_performers f join linked l on l.person_id = f.id
  )
  select case
    when pr.login_role = 'admin' then 'admin'
    when pr.login_role = 'qa_manager'
      and upper(btrim(pe.department::text)) = 'QA'
      and pe.access_class = 'qa_manager' then 'qa_manager'
    when pr.login_role = 'department_user'
      and upper(btrim(pe.department::text)) = 'QA'
      and pe.access_class = 'qa_progress_editor' then 'qa_staff'
    when pr.login_role = 'department_user'
      and pr.department is not null and pe.department = pr.department
      and pe.access_class = 'equipment_manager' then 'workshop_manager'
    when pr.login_role = 'department_user'
      and pr.department is not null and pe.department = pr.department
      and pe.access_class = 'workshop_staff' then 'workshop_staff'
    else null
  end
  from prof pr left join person pe on true
$$;


--
-- Name: vmp_business_role_unresolved_reason("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_business_role_unresolved_reason"("p_uid" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when public.vmp_business_role(p_uid) is not null then null
    when not exists (select 1 from public.profiles p where p.id = p_uid)
      then 'no_profile'
    when exists (
      select 1 from public.profiles p
      where p.id = p_uid and coalesce(p.is_active, true) = false
    ) then 'inactive_profile'
    when exists (
      select 1 from public.profiles p
      where p.id = p_uid and coalesce(p.is_active, true)
        and p.role::text = 'viewer'
    ) then 'legacy_role_disabled'
    when (select count(*) from public.vmp_performers f
          where f.user_id = p_uid and f.is_active) > 1
      then 'duplicate_person_link'
    when not exists (
      select 1 from public.vmp_performers f
      where f.user_id = p_uid and f.is_active
    ) then 'no_person_link'
    when exists (
      select 1 from public.vmp_performers f
      where f.user_id = p_uid and f.is_active and f.access_class is null
    ) then 'missing_access_class'
    else 'department_mismatch'
  end
$$;


--
-- Name: vmp_cache_nn_vo_hieu(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_cache_nn_vo_hieu"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.vmp_ai_cache_ngu_nghia
  set is_valid = false, invalidated_at = now(),
      invalidated_reason = tg_table_name || ' vua doi'
  where is_valid;
  return null;
end;
$$;


--
-- Name: vmp_can_manage_source_qa_assignment("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_can_manage_source_qa_assignment"("p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.vmp_is_active_session(p_uid)
    and public.vmp_business_role(p_uid) in ('admin','qa_manager')
    and exists (
      select 1 from public.vmp_screen_permissions permission
      where permission.business_role=public.vmp_business_role(p_uid)
        and permission.screen_id='source' and permission.can_view
        and 'manage_qa_assignment'=any(permission.actions)
    )
$$;


--
-- Name: vmp_can_manage_source_workshop_scope("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_can_manage_source_workshop_scope"("p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.vmp_is_active_session(p_uid)
    and public.vmp_business_role(p_uid) in ('admin','qa_manager')
    and exists (
      select 1 from public.vmp_screen_permissions permission
      where permission.business_role=public.vmp_business_role(p_uid)
        and permission.screen_id='source' and permission.can_view
        and 'manage_workshop_scope'=any(permission.actions)
    )
$$;


--
-- Name: vmp_can_view_item("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_can_view_item"("p_uid" "uuid", "p_validation_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce((
    select rights.can_view
    from public.vmp_item_rights(p_uid, p_validation_code) rights
  ), false)
$$;


--
-- Name: vmp_can_view_my_item("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_can_view_my_item"("p_validation_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.vmp_current_session_is_active()
     and public.vmp_can_view_item(auth.uid(), p_validation_code)
$$;


--
-- Name: vmp_can_view_plan_item("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_can_view_plan_item"("p_uid" "uuid", "p_validation_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce((
    select public.vmp_can_view_source_object(p_uid,source_object.id)
    from public.vmp_exact_active_source_for_item(p_validation_code) source_object
  ),false)
$$;


--
-- Name: vmp_can_view_source_object("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_can_view_source_object"("p_uid" "uuid", "p_source_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with actor as (
    select public.vmp_business_role(p_uid) role_name,
           public.vmp_is_active_session(p_uid) active_session,
           (coalesce(auth.role(),'')='service_role'
            or p_uid is not distinct from auth.uid()) caller_matches
  )
  select actor.caller_matches and actor.active_session and exists (
    select 1 from public.vmp_source_objects source_object
    where source_object.id=p_source_id and (
      actor.role_name in ('admin','qa_manager')
      or (source_object.is_active and actor.role_name='qa_staff' and exists (
        select 1 from public.vmp_performers performer
        where performer.user_id=p_uid and performer.is_active
          and performer.id in (
            source_object.owner_person_id,source_object.support_person_id
          )
      ))
      or (source_object.is_active
          and actor.role_name in ('workshop_manager','workshop_staff')
          and exists (
        select 1 from public.vmp_performers performer
        where performer.user_id=p_uid and performer.is_active
          and public.vmp_source_workshop_scope_match(
            performer.id,source_object.id)
      ))
    )
  ) from actor
$$;


--
-- Name: vmp_catalog_timeline_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_catalog_timeline_fields"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select array[
    'frequency_months','first_month','report_class','workdays',
    'validate_flag','is_active'
  ]::text[]
$$;


--
-- Name: vmp_current_actor_can_manage_source_qa_assignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_current_actor_can_manage_source_qa_assignment"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.vmp_can_manage_source_qa_assignment(auth.uid())
$$;


--
-- Name: vmp_current_actor_can_manage_source_workshop_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_current_actor_can_manage_source_workshop_scope"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.vmp_can_manage_source_workshop_scope(auth.uid())
$$;


--
-- Name: vmp_current_actor_is_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_current_actor_is_active"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.vmp_is_active_session(auth.uid())
$$;


--
-- Name: vmp_current_session_is_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_current_session_is_active"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.vmp_is_active_session(auth.uid())
$$;


--
-- Name: vmp_don_dau_vet_dong_bo(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_don_dau_vet_dong_bo"("p_giu" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_rows integer; v_extras integer; v_backups integer;
begin
  create temporary table tmp_giu on commit drop as
  select id from public.vmp_sheet_sync_runs order by started_at desc limit p_giu;

  delete from public.vmp_sheet_rows       where sync_run_id not in (select id from tmp_giu);
  get diagnostics v_rows = row_count;
  delete from public.vmp_sheet_row_extras where sync_run_id not in (select id from tmp_giu);
  get diagnostics v_extras = row_count;
  delete from public.vmp_sheet_sync_backups where sync_run_id not in (select id from tmp_giu);
  get diagnostics v_backups = row_count;

  return jsonb_build_object('ok', true, 'giu_lai_lan', p_giu,
    'dong_tho_da_xoa', v_rows, 'extras_da_xoa', v_extras, 'ban_sao_da_xoa', v_backups);
end;
$$;


--
-- Name: vmp_editable_progress_rights_path("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_editable_progress_rights_path"("p_actor" "uuid") RETURNS TABLE("payload" "jsonb")
    LANGUAGE "sql" STABLE
    AS $$
with actor as (
  select public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), actor_person as (
  select performer.id person_id
  from actor
  join public.vmp_performers performer
    on performer.user_id=p_actor and performer.is_active
), admin_resolved as (
  select item.validation_code,rights.editable_fields,rights.view_reason
  from actor
  join public.vmp_plan_items item
    on actor.role_name='admin' and item.is_active is true
  cross join lateral public.vmp_item_rights(
    p_actor,item.validation_code
  ) rights
  where rights.can_view
    and cardinality(coalesce(rights.editable_fields,'{}'::text[]))>0
), qa_manager_resolved as (
  select item.validation_code,
         array[
           'actual_protocol_date','status_protocol',
           'actual_validation_date','status_validation',
           'actual_report_date','status_report',
           'actual_vmp_date','status_vmp'
         ]::text[] editable_fields,
         'Quản lý QA xem toàn bộ hạng mục hoạt động'::text view_reason
  from actor
  join public.vmp_plan_items item
    on actor.role_name='qa_manager'
   and public.vmp_can_manage_source_qa_assignment(p_actor)
   and item.is_active is true
), qa_sources as (
  select source_object.object_code
  from actor cross join actor_person
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.owner_person_id=actor_person.person_id
  where actor.role_name='qa_staff'
  union
  select source_object.object_code
  from actor cross join actor_person
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.support_person_id=actor_person.person_id
  where actor.role_name='qa_staff'
), qa_resolved as (
  select item.validation_code,
         array[
           'actual_protocol_date','status_protocol','status_validation',
           'actual_report_date','status_report','actual_vmp_date','status_vmp'
         ]::text[] editable_fields,
         'Quan hệ QA trực tiếp trên Source'::text view_reason
  from qa_sources
  join public.vmp_plan_items item
    on item.object_code=qa_sources.object_code and item.is_active is true
), workshop_sources as (
  select scoped_source.object_code,actor_person.person_id
  from actor cross join actor_person
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=actor_person.person_id
   and grant_row.is_active and grant_row.line_key is null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select source_object.object_code
    from public.vmp_source_objects source_object
    where source_object.is_active is true
      and nullif(public.vmp_source_scope_key(source_object.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(source_object.area_code),'')
          is not null
      and public.vmp_source_scope_key(source_object.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
    offset 0
  ) scoped_source on true
  where actor.role_name in ('workshop_manager','workshop_staff')
  union
  select scoped_source.object_code,actor_person.person_id
  from actor cross join actor_person
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=actor_person.person_id
   and grant_row.is_active and grant_row.line_key is not null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select source_object.object_code
    from public.vmp_source_objects source_object
    where source_object.is_active is true
      and nullif(public.vmp_source_scope_key(source_object.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(source_object.area_code),'')
          is not null
      and nullif(public.vmp_source_scope_key(source_object.line),'') is not null
      and public.vmp_source_scope_key(source_object.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
      and public.vmp_source_scope_key(source_object.line)=grant_row.line_key
    offset 0
  ) scoped_source on true
  where actor.role_name in ('workshop_manager','workshop_staff')
), workshop_resolved as (
  select distinct item.validation_code,
         array['actual_validation_date']::text[] editable_fields,
         'Có phạm vi Source và phân công xưởng đang hoạt động'::text view_reason
  from workshop_sources
  join public.vmp_plan_items item
    on item.object_code=workshop_sources.object_code and item.is_active is true
  join public.vmp_item_assignments assignment
    on assignment.validation_code=item.validation_code
   and assignment.performer_id=workshop_sources.person_id
   and assignment.assignment_kind='equipment_department'
   and assignment.is_active is true
   and (assignment.expires_at is null
        or assignment.expires_at>transaction_timestamp())
), resolved as (
  select * from admin_resolved
  union all
  select * from qa_manager_resolved
  union all
  select * from qa_resolved
  union all
  select * from workshop_resolved
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  else jsonb_build_object(
    'ok',true,
    'rights',coalesce((select jsonb_agg(jsonb_build_object(
      'validation_code',resolved.validation_code,
      'editable_fields',to_jsonb(resolved.editable_fields),
      'view_reason',resolved.view_reason
    ) order by resolved.validation_code) from resolved),'[]'::jsonb)
  )
end payload
from actor
$$;


--
-- Name: vmp_enforce_active_plan_source_relation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_enforce_active_plan_source_relation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_source_id uuid;
begin
  if new.is_active is true then
    begin
      select source_object.id into v_source_id
      from public.vmp_objects master_object
      join public.vmp_source_objects source_object
        on source_object.object_code=master_object.code
      where master_object.code=new.object_code
        and source_object.is_active is true
      for key share of source_object,master_object nowait;
    exception when lock_not_available then
      raise exception using errcode='lock_not_available',
        message='SOURCE_ACCESS_RELATION_LOCK_ORDER_REQUIRED';
    end;
    if v_source_id is null then
      raise exception using errcode='foreign_key_violation',
        message='SOURCE_ACCESS_ACTIVE_ITEM_REQUIRES_EXACT_SOURCE';
    end if;
  end if;
  return new;
end
$$;


--
-- Name: vmp_source_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_source_objects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "object_kind" "text" NOT NULL,
    "object_code" "text" NOT NULL,
    "object_name" "text",
    "department" "text",
    "area_code" "text",
    "line" "text",
    "status" "text",
    "show_flag" "text",
    "validate_flag" "text",
    "validate_reason" "text",
    "frequency_months" integer,
    "report_class" "text",
    "workdays" integer,
    "critical_point" "text",
    "first_month" integer,
    "year_ref" integer,
    "source_tab" "text" NOT NULL,
    "source_row" integer NOT NULL,
    "extra" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "edited_on_web" boolean DEFAULT false NOT NULL,
    "updated_by" "uuid",
    "note" "text",
    "complexity_score" integer,
    "quality_impact_score" integer,
    "criticality_score" integer,
    "criticality_source" "text" DEFAULT 'auto'::"text" NOT NULL,
    "owner_name" "text",
    "support_name" "text",
    "work_group" "text",
    "owner_person_id" "uuid",
    "support_person_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "timeline_revision" integer DEFAULT 0 NOT NULL,
    "timeline_applied_revision" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "vmp_source_objects_complexity_score_check" CHECK ((("complexity_score" >= 1) AND ("complexity_score" <= 3))),
    CONSTRAINT "vmp_source_objects_criticality_score_check" CHECK ((("criticality_score" >= 1) AND ("criticality_score" <= 9))),
    CONSTRAINT "vmp_source_objects_criticality_source_check" CHECK (("criticality_source" = ANY (ARRAY['auto'::"text", 'manual'::"text"]))),
    CONSTRAINT "vmp_source_objects_first_month_check" CHECK ((("first_month" IS NULL) OR (("first_month" >= 1) AND ("first_month" <= 12)))),
    CONSTRAINT "vmp_source_objects_object_kind_check" CHECK (("object_kind" = ANY (ARRAY['Thiết bị'::"text", 'Quy trình'::"text", 'Kho'::"text", 'Hệ thống phụ trợ'::"text", 'Vận chuyển'::"text"]))),
    CONSTRAINT "vmp_source_objects_quality_impact_score_check" CHECK ((("quality_impact_score" >= 1) AND ("quality_impact_score" <= 3)))
);


--
-- Name: TABLE "vmp_source_objects"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_source_objects" IS 'Danh mục đối tượng thẩm định, gộp 5 tab nguồn. Đây là đầu vào của luật sinh timeline VMP01.';


--
-- Name: COLUMN "vmp_source_objects"."validate_flag"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."validate_flag" IS 'VMP01 bỏ qua dòng có giá trị khác ''y'' (so sánh sau khi trim/lower/NFC).';


--
-- Name: COLUMN "vmp_source_objects"."first_month"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."first_month" IS 'Thiếu cột này thì VMP01 không tính được deadline và ghi chuỗi "Không xác định do thiếu..." vào cột ngày.';


--
-- Name: COLUMN "vmp_source_objects"."edited_on_web"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."edited_on_web" IS 'TRUE khi bản ghi đã được tạo/sửa từ dashboard. scripts/import-source-catalogs.py
   từ chối chạy nếu có bản ghi nào bật cờ này (tránh TRUNCATE xoá mất dữ liệu nhập tay).';


--
-- Name: COLUMN "vmp_source_objects"."complexity_score"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."complexity_score" IS 'Mức độ phức tạp: 3 Cao · 2 Trung bình · 1 Thấp';


--
-- Name: COLUMN "vmp_source_objects"."quality_impact_score"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."quality_impact_score" IS 'Ảnh hưởng chất lượng SP: 3 Trực tiếp · 2 Gián tiếp · 1 Không';


--
-- Name: COLUMN "vmp_source_objects"."criticality_score"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."criticality_score" IS 'Điểm trọng yếu = phức tạp × ảnh hưởng (1..9). Công thức từ tab 0.Rule timeline VMP.';


--
-- Name: COLUMN "vmp_source_objects"."criticality_source"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."criticality_source" IS 'auto = máy đề xuất, chờ QA duyệt. manual = QA đã chốt, không bị ghi đè.';


--
-- Name: COLUMN "vmp_source_objects"."owner_name"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."owner_name" IS 'QA phụ trách, gán theo vmp_assignment_rules. Sửa tay được ở màn Danh mục nguồn.';


--
-- Name: COLUMN "vmp_source_objects"."work_group"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."work_group" IS 'Nhóm công việc đã khớp — dùng để truy vì sao hạng mục thuộc về người này.';


--
-- Name: COLUMN "vmp_source_objects"."version"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."version" IS 'Khoá lạc quan. Mọi lần lưu qua rpc_save_catalog_object tăng 1. Client gửi expected_version; lệch thì trả VERSION_CONFLICT thay vì ghi đè.';


--
-- Name: COLUMN "vmp_source_objects"."timeline_revision"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."timeline_revision" IS 'Chỉ tăng khi sửa trường ảnh hưởng deadline hoặc phân công. Sửa tên hay ghi chú KHÔNG tăng.';


--
-- Name: COLUMN "vmp_source_objects"."timeline_applied_revision"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_source_objects"."timeline_applied_revision" IS 'Chỉ tăng sau khi áp thành công vào timeline. Lớn hơn nó nghĩa là đang chờ áp.';


--
-- Name: vmp_exact_active_source_for_item("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_exact_active_source_for_item"("p_validation_code" "text") RETURNS SETOF "public"."vmp_source_objects"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with matches as materialized (
    select source_object.*
    from public.vmp_plan_items item
    join public.vmp_objects master_object
      on master_object.code=item.object_code
    join public.vmp_source_objects source_object
      on source_object.object_code=master_object.code
     and source_object.is_active is true
    where item.validation_code=p_validation_code and item.is_active is true
  ), exact as (
    select count(*) match_count from matches
  )
  select matches.* from matches cross join exact
  where exact.match_count=1
$$;


--
-- Name: vmp_guard_active_source_rekey(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_guard_active_source_rekey"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='DELETE' then
    if old.is_active is true and exists (
      select 1 from public.vmp_plan_items item
      where item.object_code=old.object_code and item.is_active is true
    ) then
      raise exception using errcode='foreign_key_violation',
        message='SOURCE_ACCESS_ACTIVE_SOURCE_HAS_ACTIVE_ITEMS';
    end if;
    return old;
  end if;
  if old.is_active is true
     and (new.is_active is not true
          or new.object_code is distinct from old.object_code)
     and exists (
       select 1 from public.vmp_plan_items item
       where item.object_code=old.object_code and item.is_active is true
     ) then
    raise exception using errcode='foreign_key_violation',
      message='SOURCE_ACCESS_ACTIVE_SOURCE_HAS_ACTIVE_ITEMS';
  end if;
  return new;
end
$$;


--
-- Name: vmp_guard_plan_master_rekey(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_guard_plan_master_rekey"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if (tg_op='DELETE' or new.code is distinct from old.code)
     and exists (
       select 1 from public.vmp_plan_items item
       where item.object_code=old.code and item.is_active is true
     ) then
    raise exception using errcode='foreign_key_violation',
      message='SOURCE_ACCESS_MASTER_OBJECT_HAS_ACTIVE_ITEMS';
  end if;
  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end
$$;


--
-- Name: vmp_hang_muc_da_co_tien_do("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_hang_muc_da_co_tien_do"("p_validation_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.vmp_plan_items pi
    where pi.validation_code = p_validation_code
      and (pi.actual_protocol_date is not null
        or pi.actual_validation_date is not null
        or pi.actual_report_date is not null
        or pi.actual_vmp_date is not null
        or pi.status_protocol::text   <> 'not_started'
        or pi.status_validation::text <> 'not_started'
        or pi.status_report::text     <> 'not_started'
        or pi.status_vmp::text        <> 'not_started')
  )
$$;


--
-- Name: vmp_harden_dashboard_object_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_harden_dashboard_object_scope"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_signature regprocedure :=
    'public.rpc_get_vmp_dashboard(integer,boolean,boolean)'::regprocedure;
  v_definition text;
  v_start integer;
  v_tail_relative integer;
  v_tail_marker text := E'\n    ),\n    ''activities''';
  v_predicate text := $predicate$where s.is_active
        and (
          public.item_permissions_mode() = 'preview'
          or auth.role() = 'service_role'
          or public.is_admin()
          or exists (
            select 1
            from public.vmp_visible_plan_items() visible_object_item
            where visible_object_item.object_code = s.object_code
              and visible_object_item.year = p_year
              and visible_object_item.is_active
              and (p_include_missing or not visible_object_item.missing_from_sheet)
              and (
                p_include_cancelled
                or coalesce(visible_object_item.item_state, 'active') <> 'cancelled'
              )
          )
        )$predicate$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_start := position('where s.is_active' in v_definition);
  if v_start = 0 then
    raise exception 'Không tìm thấy predicate objects của rpc_get_vmp_dashboard';
  end if;
  v_tail_relative := position(v_tail_marker in substring(v_definition from v_start));
  if v_tail_relative = 0 then
    raise exception 'Không tìm thấy điểm kết thúc objects của rpc_get_vmp_dashboard';
  end if;

  v_definition := substring(v_definition from 1 for v_start - 1)
    || v_predicate
    || substring(v_definition from v_start + v_tail_relative - 1);
  execute v_definition;

  select pg_get_functiondef(v_signature) into v_definition;
  if regexp_count(v_definition, 'visible_object_item') <> 6 then
    raise exception 'Predicate dashboard objects không ở dạng chuẩn duy nhất';
  end if;
end
$_$;


--
-- Name: vmp_import_chuan_hoa("text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_import_chuan_hoa"("p_kieu" "text", "p_v" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  v_chu text;
begin
  if p_v is null or jsonb_typeof(p_v) = 'null' then return 'null'::jsonb; end if;
  v_chu := btrim(p_v #>> '{}');
  if v_chu = '' then return 'null'::jsonb; end if;

  if p_kieu = 'n' then
    return to_jsonb(v_chu::numeric);
  elsif p_kieu = 'b' then
    return to_jsonb(case lower(v_chu)
      when 'true' then true when 'y' then true when '1' then true when 'có' then true
      when 'false' then false when 'n' then false when '0' then false when 'không' then false
      else v_chu::boolean end);
  elsif p_kieu = 'yn' then
    return to_jsonb(case lower(v_chu)
      when 'true' then 'y' when 'y' then 'y' when '1' then 'y' when 'có' then 'y'
      when 'false' then 'n' when 'n' then 'n' when '0' then 'n' when 'không' then 'n'
      else null end);
  end if;
  return to_jsonb(v_chu);
end
$$;


--
-- Name: vmp_import_cot("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_import_cot"("p_dataset" "text") RETURNS TABLE("cot" "text", "kieu" "text", "bat_buoc" boolean)
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select t.cot, t.kieu, t.bat_buoc from (values
    -- source_objects
    ('source_objects', 'object_name',          't',  true),
    ('source_objects', 'department',           't',  false),
    ('source_objects', 'area_code',            't',  false),
    ('source_objects', 'line',                 't',  false),
    ('source_objects', 'validate_flag',        'yn', false),
    ('source_objects', 'frequency_months',     'n',  false),
    ('source_objects', 'first_month',          'n',  false),
    ('source_objects', 'year_ref',             'n',  false),
    ('source_objects', 'report_class',         't',  false),
    ('source_objects', 'work_group',           't',  false),
    ('source_objects', 'workdays',             'n',  false),
    ('source_objects', 'complexity_score',     'n',  false),
    ('source_objects', 'quality_impact_score', 'n',  false),
    ('source_objects', 'note',                 't',  false),
    ('source_objects', 'is_active',            'b',  false),
    -- products_gmp
    ('products_gmp', 'product_name',     't', true),
    ('products_gmp', 'ingredients',      't', false),
    ('products_gmp', 'strength',         't', false),
    ('products_gmp', 'dosage_form',      't', false),
    ('products_gmp', 'production_line',  't', false),
    ('products_gmp', 'primary_pack',     't', false),
    ('products_gmp', 'batch_size',       't', false),
    ('products_gmp', 'mixing_tank',      't', false),
    ('products_gmp', 'final_batch_size', 't', false),
    ('products_gmp', 'note',             't', false),
    ('products_gmp', 'is_active',        'b', false)
  ) as t(dataset, cot, kieu, bat_buoc)
  where t.dataset = p_dataset;
$$;


--
-- Name: vmp_init_status_text(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_init_status_text"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.status_protocol_text   := coalesce(new.status_protocol_text,   public.vmp_phase_status_text(new.status_protocol));
  new.status_validation_text := coalesce(new.status_validation_text, public.vmp_phase_status_text(new.status_validation));
  new.status_report_text     := coalesce(new.status_report_text,     public.vmp_phase_status_text(new.status_report));
  new.status_vmp_text        := coalesce(new.status_vmp_text,        public.vmp_phase_status_text(new.status_vmp));
  return new;
end;
$$;


--
-- Name: vmp_invalidate_plan_item_revision_from_assignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_invalidate_plan_item_revision_from_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_code text;
  v_codes text[];
  v_previous_invalidation text:=current_setting(
    'app.assignment_revision_invalidation',true);
begin
  select array_agg(distinct code order by code) into v_codes
  from unnest(array[
    case when tg_op<>'INSERT' then old.validation_code end,
    case when tg_op<>'DELETE' then new.validation_code end
  ]) code
  where code is not null;

  perform set_config('app.assignment_revision_invalidation','on',true);
  foreach v_code in array coalesce(v_codes,'{}'::text[]) loop
    perform 1 from public.vmp_plan_items
    where validation_code=v_code
    for update;
    update public.vmp_plan_items set version=version
    where validation_code=v_code;
  end loop;
  perform set_config('app.assignment_revision_invalidation',
    coalesce(nullif(v_previous_invalidation,''),'off'),true);

  if tg_op='DELETE' then return old; end if;
  return new;
exception when others then
  perform set_config('app.assignment_revision_invalidation',
    coalesce(nullif(v_previous_invalidation,''),'off'),true);
  raise;
end
$$;


--
-- Name: FUNCTION "vmp_invalidate_plan_item_revision_from_assignment"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_invalidate_plan_item_revision_from_assignment"() IS 'Owner-only trigger helper invalidating the plan-item whole-row revision after assignment changes.';


--
-- Name: vmp_is_active_session("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_is_active_session"("p_uid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p_uid is not null
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and coalesce(p.is_active, true)
         and p.role::text <> 'viewer'
     )
     and public.vmp_business_role(p_uid) in
       ('admin','qa_manager','qa_staff','workshop_manager','workshop_staff')
$$;


--
-- Name: vmp_item_rights("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_item_rights"("p_uid" "uuid", "p_validation_code" "text") RETURNS TABLE("can_view" boolean, "editable_fields" "text"[], "view_reason" "text", "assignment_sources" "text"[], "scope_match" boolean, "area_match" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role text:=public.vmp_business_role(p_uid);
  v_person public.vmp_performers%rowtype;
  v_source public.vmp_source_objects%rowtype;
  v_has_assignment boolean:=false;
  v_sources text[]:='{}'::text[];
  v_qa_manager_fields constant text[]:=array[
    'actual_protocol_date','status_protocol',
    'actual_validation_date','status_validation',
    'actual_report_date','status_report',
    'actual_vmp_date','status_vmp'
  ]::text[];
  v_qa_staff_fields constant text[]:=array[
    'actual_protocol_date','status_protocol','status_validation',
    'actual_report_date','status_report','actual_vmp_date','status_vmp'
  ]::text[];
begin
  if not public.vmp_is_active_session(p_uid) or v_role is null then
    return query select false,'{}'::text[],
      'Tài khoản hoặc vai trò nghiệp vụ không hợp lệ','{}'::text[],false,false;
    return;
  end if;

  if v_role='admin' then
    return query select *
    from public.vmp_item_rights_before_assignment_only_qa(
      p_uid,p_validation_code);
    return;
  end if;

  if v_role='qa_manager' then
    if public.vmp_can_manage_source_qa_assignment(p_uid)
       and exists (
         select 1 from public.vmp_plan_items item
         where item.validation_code=p_validation_code and item.is_active
       ) then
      return query select true,v_qa_manager_fields,
        'Quản lý QA xem toàn bộ hạng mục hoạt động',
        '{}'::text[],true,true;
      return;
    end if;
    return query select false,'{}'::text[],
      'Principal Quản lý QA không hợp lệ','{}'::text[],false,false;
    return;
  end if;

  select performer.* into v_person
  from public.vmp_performers performer
  where performer.user_id=p_uid and performer.is_active;
  if not found then
    return query select false,'{}'::text[],
      'Tài khoản chưa nối hồ sơ hoạt động','{}'::text[],false,false;
    return;
  end if;

  select source_object.* into v_source
  from public.vmp_exact_active_source_for_item(p_validation_code) source_object;
  if not found then
    return query select false,'{}'::text[],
      'Không có đúng một Source hoạt động cho hạng mục',
      '{}'::text[],false,false;
    return;
  end if;

  if v_role='qa_staff' then
    if v_person.id in (v_source.owner_person_id,v_source.support_person_id) then
      select coalesce(array_agg(distinct assignment.source
                 order by assignment.source),'{}'::text[])
        into v_sources
      from public.vmp_item_assignments assignment
      where assignment.validation_code=p_validation_code
        and assignment.performer_id=v_person.id
        and assignment.assignment_kind='qa' and assignment.is_active
        and (assignment.expires_at is null
             or assignment.expires_at>transaction_timestamp());
      return query select true,v_qa_staff_fields,
        'Quan hệ QA trực tiếp trên Source',v_sources,true,true;
      return;
    end if;
    return query select false,'{}'::text[],
      'Không phải QA phụ trách hoặc hỗ trợ trên Source',
      '{}'::text[],false,false;
    return;
  end if;

  if v_role in ('workshop_manager','workshop_staff') then
    if not public.vmp_source_workshop_scope_match(v_person.id,v_source.id) then
      return query select false,'{}'::text[],
        'Không có phạm vi xưởng đang hoạt động',
        '{}'::text[],false,false;
      return;
    end if;

    select coalesce(bool_or(true),false),
           coalesce(array_agg(distinct assignment.source
                    order by assignment.source),'{}'::text[])
      into v_has_assignment,v_sources
    from public.vmp_item_assignments assignment
    where assignment.validation_code=p_validation_code
      and assignment.performer_id=v_person.id
      and assignment.assignment_kind='equipment_department'
      and assignment.is_active
      and (assignment.expires_at is null
           or assignment.expires_at>transaction_timestamp());
    return query select true,
      case when v_has_assignment then
        array['actual_validation_date']::text[] else '{}'::text[] end,
      case when v_has_assignment then
        'Có phạm vi Source và phân công xưởng đang hoạt động'
      else 'Có phạm vi Source; chưa có phân công sửa tiến độ' end,
      v_sources,true,true;
    return;
  end if;

  return query select false,'{}'::text[],
    'Vai trò không được xem hạng mục Source','{}'::text[],false,false;
end
$$;


--
-- Name: vmp_item_rights_before_assignment_only_qa("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_item_rights_before_assignment_only_qa"("p_uid" "uuid", "p_validation_code" "text") RETURNS TABLE("can_view" boolean, "editable_fields" "text"[], "view_reason" "text", "assignment_sources" "text"[], "scope_match" boolean, "area_match" boolean)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role text;
  v_person_id uuid;
  v_person public.vmp_performers%rowtype;
  v_old record;
  v_scope record;
  v_hierarchy_match boolean;
begin
  select role::text into v_role from public.profiles
  where id = p_uid and coalesce(is_active, true);
  select * into v_old
  from public.vmp_item_rights_before_canonical_scope(p_uid, p_validation_code);
  if v_role = 'admin' then
    return query select v_old.can_view, v_old.editable_fields, v_old.view_reason,
      v_old.assignment_sources, v_old.scope_match, v_old.area_match;
    return;
  end if;
  select * into v_person from public.vmp_performers
  where user_id = p_uid and is_active;
  v_person_id := v_person.id;
  /* Legacy rows remain preview-compatible; preflight prevents enforced. */
  if public.item_permissions_mode() = 'preview' and (
    cardinality(v_person.scope_factory_ids) = 0
    or cardinality(v_person.scope_area_ids) = 0
    or cardinality(v_person.scope_line_ids) = 0
  ) then
    return query select v_old.can_view, v_old.editable_fields, v_old.view_reason,
      v_old.assignment_sources, v_old.scope_match, v_old.area_match;
    return;
  end if;
  select * into v_scope
  from public.vmp_item_scope_matches(v_person_id, p_validation_code);
  v_hierarchy_match := coalesce(v_scope.scope_match, false)
    and coalesce(v_scope.factory_match, false)
    and coalesce(v_scope.area_match, false)
    and coalesce(v_scope.line_match, false);
  return query select
    coalesce(v_old.can_view, false) and v_hierarchy_match,
    case when coalesce(v_old.can_view, false) and v_hierarchy_match
      then v_old.editable_fields else '{}'::text[] end,
    case when coalesce(v_old.can_view, false) and not v_hierarchy_match
      then 'Ngoài phạm vi bộ phận/xưởng/khu vực/line canonical'
      else v_old.view_reason end,
    v_old.assignment_sources,
    coalesce(v_old.scope_match, false) and coalesce(v_scope.scope_match, false),
    v_hierarchy_match;
end
$$;


--
-- Name: vmp_item_rights_before_canonical_scope("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_item_rights_before_canonical_scope"("p_uid" "uuid", "p_validation_code" "text") RETURNS TABLE("can_view" boolean, "editable_fields" "text"[], "view_reason" "text", "assignment_sources" "text"[], "scope_match" boolean, "area_match" boolean)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_role text;
  v_profile_department text;
  v_person_id uuid;
  v_person_department text;
  v_access_class text;
  v_scope text[];
  v_areas text[];
  v_object_department text;
  v_object_area text;
  v_object_line text;
  v_sources text[] := '{}'::text[];
  v_has_any_assignment boolean := false;
  v_has_qa_assignment boolean := false;
  v_has_equipment_assignment boolean := false;
  v_can_view boolean := false;
  v_fields text[] := '{}'::text[];
  v_reason text := 'Không xác định được quyền';
  v_scope_match boolean := false;
  v_area_match boolean := false;
begin
  select profile.role::text, profile.department
  into v_role, v_profile_department
  from public.profiles profile
  where profile.id = p_uid and coalesce(profile.is_active, true);

  if v_role is null then
    return query select false, '{}'::text[],
      'Tài khoản không tồn tại hoặc đã ngừng hoạt động',
      '{}'::text[], false, false;
    return;
  end if;

  select person.id, person.department, person.access_class,
         person.scope_departments, person.access_areas
  into v_person_id, v_person_department, v_access_class, v_scope, v_areas
  from public.vmp_performers person
  where person.user_id = p_uid and person.is_active;

  select object.department, object.area, object.line
  into v_object_department, v_object_area, v_object_line
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.validation_code = p_validation_code and item.is_active;

  if not found then
    return query select false, '{}'::text[],
      'Không tìm thấy hạng mục hoạt động', '{}'::text[], false, false;
    return;
  end if;

  if v_role = 'admin' then
    return query select
      true,
      array[
        'actual_protocol_date', 'status_protocol',
        'actual_validation_date', 'status_validation',
        'actual_report_date', 'status_report',
        'actual_vmp_date', 'status_vmp',
        'scheduled_at'
      ]::text[],
      'Admin quản trị toàn hệ thống',
      array['system_admin']::text[],
      true,
      true;
    return;
  end if;

  if v_person_id is null then
    return query select false, '{}'::text[],
      'Tài khoản chưa nối với danh bạ nhân sự', '{}'::text[], false, false;
    return;
  end if;

  if (v_role = 'qa_manager' or v_access_class in ('qa_manager', 'equipment_manager'))
      and not (
        (
          v_role = 'qa_manager'
          and v_profile_department = 'qa'
          and v_access_class = 'qa_manager'
          and v_person_department = 'qa'
        )
        or (
          v_role = 'department_user'
          and nullif(btrim(coalesce(v_profile_department, '')), '') is not null
          and v_access_class = 'equipment_manager'
          and v_person_department = v_profile_department
        )
      ) then
    return query select false, '{}'::text[],
      'Principal quản lý không hợp lệ hoặc không nhất quán',
      '{}'::text[], false, false;
    return;
  end if;

  v_scope_match := coalesce('*' = any(v_scope), false)
    or coalesce(v_object_department = any(v_scope), false);
  v_area_match := coalesce('*' = any(v_areas), false)
    or coalesce(v_object_area = any(v_areas), false)
    or coalesce(v_object_line = any(v_areas), false);

  select
    coalesce(array_agg(distinct assignment.source order by assignment.source), '{}'::text[]),
    coalesce(bool_or(assignment.grants_access), false),
    coalesce(bool_or(
      assignment.grants_access and assignment.assignment_kind = 'qa'
    ), false),
    coalesce(bool_or(
      assignment.grants_access
      and assignment.assignment_kind = 'equipment_department'
    ), false)
  into v_sources, v_has_any_assignment,
       v_has_qa_assignment, v_has_equipment_assignment
  from public.vmp_active_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.user_id = p_uid;

  if not v_scope_match then
    v_reason := 'Hạng mục nằm ngoài phạm vi bộ phận được cấp';
  elsif not v_area_match then
    v_reason := 'Hạng mục nằm ngoài khu vực/line được cấp';
  elsif v_role = 'qa_manager' and v_access_class = 'qa_manager' then
    v_can_view := true;
    v_reason := 'Quản lý QA trong phạm vi/khu vực được cấp';
  elsif v_role = 'department_user'
      and v_access_class = 'equipment_manager'
      and v_person_department = v_profile_department then
    v_can_view := v_object_department = v_profile_department;
    v_reason := case when v_can_view
      then 'Quản lý bộ phận quản lý thiết bị của hạng mục'
      else 'Hạng mục do bộ phận khác quản lý'
    end;
  elsif v_access_class = 'qa_progress_editor' then
    v_can_view := v_has_qa_assignment;
    v_reason := case when v_can_view
      then 'Có phân công QA, đúng phạm vi và khu vực'
      else 'Chưa có phân công QA đang hoạt động'
    end;
  elsif v_access_class = 'equipment_scheduler' then
    v_can_view := v_has_equipment_assignment
      and v_object_department = coalesce(v_person_department, v_profile_department);
    v_reason := case when v_can_view
      then 'Có phân công xếp lịch, đúng bộ phận quản lý, phạm vi và khu vực'
      else 'Chưa có phân công hợp lệ hoặc không thuộc bộ phận quản lý hạng mục'
    end;
  elsif v_access_class = 'view_only' then
    v_can_view := v_has_any_assignment;
    v_reason := case when v_can_view
      then 'Có phân công, đúng phạm vi và khu vực; phân loại chỉ xem'
      else 'Chưa có phân công đang hoạt động'
    end;
  else
    v_reason := 'Nhân viên chưa được cấp phân loại quyền';
  end if;

  if v_can_view and v_access_class in ('qa_progress_editor', 'qa_manager') then
    v_fields := array[
      'actual_protocol_date', 'status_protocol',
      'actual_validation_date', 'status_validation',
      'actual_report_date', 'status_report',
      'actual_vmp_date', 'status_vmp'
    ]::text[];
  elsif v_can_view and v_access_class in ('equipment_scheduler', 'equipment_manager') then
    v_fields := array['scheduled_at']::text[];
  end if;

  return query select
    v_can_view, v_fields, v_reason, v_sources, v_scope_match, v_area_match;
end
$$;


--
-- Name: vmp_item_scope_matches("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_item_scope_matches"("p_person_id" "uuid", "p_validation_code" "text") RETURNS TABLE("scope_match" boolean, "factory_match" boolean, "area_match" boolean, "line_match" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select matched,matched,matched,matched
  from (
    select coalesce((
      select public.vmp_source_workshop_scope_match(
        p_person_id,source_object.id)
      from public.vmp_exact_active_source_for_item(p_validation_code)
           source_object
    ),false) matched
  ) resolved
$$;


--
-- Name: vmp_item_scope_path_count("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_item_scope_path_count"("p_validation_code" "text") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with target as (
    select object.department, nullif(btrim(object.area), '') as area_code,
           nullif(btrim(object.line), '') as line_code
    from public.vmp_plan_items item
    join public.vmp_objects object on object.code = item.object_code
    where item.validation_code = p_validation_code and item.is_active
  )
  select count(*)::integer
  from target
  join public.vmp_scope_factories factory
    on factory.department_id = target.department and factory.is_active
  join public.vmp_scope_areas area
    on area.factory_id = factory.id and area.is_active
   and (target.area_code is null or area.code = target.area_code)
  left join public.vmp_scope_lines line
    on target.line_code is not null
   and line.area_id = area.id and line.is_active and line.code = target.line_code
  where (target.area_code is not null or target.line_code is not null)
    and (target.line_code is null or line.id is not null)
$$;


--
-- Name: vmp_jsonb_text_array("jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_jsonb_text_array"("p_value" "jsonb", "p_key" "text") RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(array_agg(value order by value), '{}'::text[])
  from (
    select distinct btrim(item) as value
    from jsonb_array_elements_text(coalesce(p_value -> p_key, '[]'::jsonb)) item
    where nullif(btrim(item), '') is not null
  ) normalized
$$;


--
-- Name: vmp_jsonb_uuid_array("jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_jsonb_uuid_array"("p_value" "jsonb", "p_key" "text") RETURNS "uuid"[]
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(array_agg(value order by value), '{}'::uuid[])
  from (
    select distinct btrim(item)::uuid as value
    from jsonb_array_elements_text(coalesce(p_value -> p_key, '[]'::jsonb)) item
    where nullif(btrim(item), '') is not null
  ) normalized
$$;


--
-- Name: vmp_khong_dau("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_khong_dau"("t" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$ select lower(extensions.unaccent(coalesce(t, ''))) $$;


--
-- Name: vmp_loai_tham_dinh("text", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_loai_tham_dinh"("p_object_kind" "text", "p_object_code" "text", "p_year_ref" integer, "p_year" integer) RETURNS "text"[]
    LANGUAGE "sql" STABLE
    AS $$
  select case
    when p_object_kind in ('Thiết bị', 'Hệ thống phụ trợ') then
      case when p_year_ref = p_year
             and not exists (select 1 from public.vmp_plan_items pi
                             where pi.object_code = p_object_code
                               and pi.validation_type = 'IQ')
           then array['DQ','FAT/SAT','IQ','OQ','PQ']
           else array['OQ','PQ'] end
    when p_object_kind = 'Quy trình' then array['PV']
    when p_object_kind = 'Kho'       then array['GSP']
    else array['GDP']
  end
$$;


--
-- Name: vmp_lock_catalog_object_v2("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_lock_catalog_object_v2"("p_object_kind" "text", "p_object_code" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select pg_advisory_xact_lock(hashtextextended(
    coalesce(p_object_kind,'') || chr(31) || coalesce(p_object_code,''),
    20260826130000
  ))
$$;


--
-- Name: vmp_lock_source_plan_relations("text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_lock_source_plan_relations"("p_object_codes" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_relation record;
begin
  for v_relation in
    select source_object.id source_id,source_object.object_code,
           master_object.code master_code
    from public.vmp_source_objects source_object
    join public.vmp_objects master_object
      on master_object.code=source_object.object_code
    where source_object.is_active is true
      and (p_object_codes is null
           or source_object.object_code=any(p_object_codes))
    order by source_object.object_code,source_object.id,master_object.code
    for key share of source_object,master_object
  loop
    null;
  end loop;
end
$$;


--
-- Name: vmp_luu_tru_nhat_ky(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_luu_tru_nhat_ky"("p_thang" integer DEFAULT 12) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_n integer;
begin
  with cu as (
    delete from public.audit_logs
    where created_at < now() - make_interval(months => p_thang)
    returning *
  )
  insert into public.audit_logs_archive select * from cu;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'da_chuyen', v_n,
    'msg', 'Đã chuyển ' || v_n || ' bản ghi cũ hơn ' || p_thang || ' tháng sang bảng lưu trữ');
end;
$$;


--
-- Name: vmp_ma_phan_loai("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_ma_phan_loai"("p_kind" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case lower(trim(coalesce(p_kind, '')))
    when 'thiết bị'          then 'tb'
    when 'quy trình'         then 'qt'
    when 'kho'               then 'kho'
    when 'hệ thống phụ trợ'  then 'ht'
    when 'vận chuyển'        then 'vc'
    else 'tb' end;
$$;


--
-- Name: FUNCTION "vmp_ma_phan_loai"("p_kind" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_ma_phan_loai"("p_kind" "text") IS 'Đổi tên phân loại dài của vmp_source_objects sang mã ngắn mà frontend dùng làm khoá tra bảng CLS.';


--
-- Name: vmp_manager_principal("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_manager_principal"("p_uid" "uuid") RETURNS TABLE("principal_kind" "text", "profile_department" "text", "performer_department" "text", "scope_departments" "text"[], "access_areas" "text"[])
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    case
      when profile.role::text = 'admin' then 'admin'
      when profile.role::text = 'qa_manager'
        and upper(btrim(profile.department::text)) = 'QA'
        and person.access_class = 'qa_manager'
        and upper(btrim(person.department::text)) = 'QA'
        then 'qa_manager'
      when profile.role::text = 'department_user'
        and nullif(btrim(coalesce(profile.department, '')), '') is not null
        and person.access_class = 'equipment_manager'
        and person.department = profile.department
        then 'equipment_manager'
      else null
    end,
    profile.department,
    person.department,
    coalesce(person.scope_departments, '{}'::text[]),
    coalesce(person.access_areas, '{}'::text[])
  from public.profiles profile
  left join public.vmp_performers person
    on person.user_id = profile.id and person.is_active
  where profile.id = p_uid and coalesce(profile.is_active, true)
$$;


--
-- Name: vmp_my_item_rights("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_my_item_rights"("p_validation_code" "text") RETURNS TABLE("can_view" boolean, "editable_fields" "text"[], "view_reason" "text", "assignment_sources" "text"[], "scope_match" boolean, "area_match" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return; end if; return query select * from public.vmp_my_item_rights__five_role_impl_20260824(p_validation_code); end $$;


--
-- Name: vmp_my_item_rights__five_role_impl_20260824("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_my_item_rights__five_role_impl_20260824"("p_validation_code" "text") RETURNS TABLE("can_view" boolean, "editable_fields" "text"[], "view_reason" "text", "assignment_sources" "text"[], "scope_match" boolean, "area_match" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    rights.can_view,
    case when rights.can_view then rights.editable_fields else '{}'::text[] end,
    case when rights.can_view
      then rights.view_reason
      else 'Bạn không có quyền xem hạng mục'
    end,
    case when rights.can_view then rights.assignment_sources else '{}'::text[] end,
    case when rights.can_view then rights.scope_match else false end,
    case when rights.can_view then rights.area_match else false end
  from public.vmp_item_rights(auth.uid(), p_validation_code) rights
$$;


--
-- Name: vmp_normalize_person_name("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_normalize_person_name"("p_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'))
$$;


--
-- Name: FUNCTION "vmp_normalize_person_name"("p_name" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_normalize_person_name"("p_name" "text") IS 'Chuẩn hóa tên để đối chiếu chính xác: trim, gộp khoảng trắng, lower; giữ nguyên dấu.';


--
-- Name: vmp_parse_depts("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_parse_depts"("p_raw" "text") RETURNS "text"[]
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  x text := lower(coalesce(p_raw, ''));
  s text[] := '{}';
begin
  -- LƯU Ý: array_append (không dùng s || 'xx' -> Postgres coi là nối mảng-mảng).
  if x ~ '(\yxsx\y|xưởng|xuong|sản xuất|san xuat|\ysx\y)' then s := array_append(s, 'xsx'); end if;
  if x ~ '(cơ điện|co dien|\ycd\y|cđ)'                     then s := array_append(s, 'cd'); end if;
  if x ~ '(\ykho\y|warehouse)'                             then s := array_append(s, 'kho'); end if;
  if x ~ '(\yrd\y|r&d|nghiên cứu|nghien cuu|research)'     then s := array_append(s, 'rd'); end if;
  if x ~ '(\yqc\y|kiểm nghiệm|kiem nghiem)'                then s := array_append(s, 'qc'); end if;
  if x ~ 'qlcl'  then s := array_append(s, 'qa'); s := array_append(s, 'qc'); end if; -- QLCL = QA + QC
  if x ~ '(\yqa\y|đảm bảo|dam bao)'                        then s := array_append(s, 'qa'); end if;
  return array(select distinct e from unnest(s) as e);
end;
$$;


--
-- Name: FUNCTION "vmp_parse_depts"("p_raw" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_parse_depts"("p_raw" "text") IS 'Bản SQL của frontend parseDepts(): tách chuỗi bộ phận gốc thành tập {sx,cd,kho,rd,qc,qa}. QLCL=QA+QC.';


--
-- Name: vmp_parse_scheduled_at("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_parse_scheduled_at"("p_value" "text") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
declare
  v text := nullif(btrim(p_value), '');
  m text[];
begin
  if v is null then
    return null;
  end if;

  m := regexp_match(v, '^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$');
  if m is not null then
    return make_timestamptz(
      m[3]::integer, m[2]::integer, m[1]::integer,
      coalesce(m[4], '0')::integer, coalesce(m[5], '0')::integer,
      coalesce(m[6], '0')::double precision, 'Asia/Bangkok'
    );
  end if;

  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    return v::timestamp at time zone 'Asia/Bangkok';
  end if;
  if v ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$' then
    return replace(v, 'T', ' ')::timestamp at time zone 'Asia/Bangkok';
  end if;

  return v::timestamptz;
exception when others then
  raise exception 'Lịch thẩm định không đúng định dạng ngày giờ: %', p_value;
end;
$_$;


--
-- Name: FUNCTION "vmp_parse_scheduled_at"("p_value" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_parse_scheduled_at"("p_value" "text") IS 'Đọc dd/mm/yyyy hh:mm:ss hoặc ISO; giá trị không có múi giờ được hiểu theo Asia/Bangkok.';


--
-- Name: vmp_phase_status_text("public"."phase_status"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_phase_status_text"("p" "public"."phase_status") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p
    when 'completed'   then 'Hoàn thành'
    when 'in_progress' then 'Đang tiến hành'
    when 'overdue'     then 'Quá hạn'
    else 'Chưa tiến hành'
  end;
$$;


--
-- Name: vmp_plan_item_row_revision_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_plan_item_row_revision_v2"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.version := old.version + 1;
  return new;
end
$$;


--
-- Name: vmp_preserve_manual_planned_deadline_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_preserve_manual_planned_deadline_state"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if current_setting('app.audit_source',true) in (
       'manual_planned_deadline_edit'
     ) or current_setting('app.assignment_revision_invalidation',true)='on' then
    new.computed_status:=old.computed_status;
    new.is_doc_complete:=old.is_doc_complete;
    new.has_mismatch:=old.has_mismatch;
  end if;
  return new;
end
$$;


--
-- Name: FUNCTION "vmp_preserve_manual_planned_deadline_state"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_preserve_manual_planned_deadline_state"() IS 'Owner-only trigger helper preserving computed fields for manual planned-deadline edits.';


--
-- Name: vmp_preview_catalog_change_v2_impl("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_preview_catalog_change_v2_impl"("p_change_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_base jsonb;
  v_change public.vmp_catalog_changes%rowtype;
  v_source public.vmp_source_objects%rowtype;
  v_item public.vmp_plan_items%rowtype;
  v_entry jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_match text[];
  v_occurrence integer;
  v_deadline_protocol date;
  v_deadline_validation date;
  v_deadline_report date;
  v_deadline_vmp date;
  v_missing jsonb;
  v_eligible boolean;
  v_blocker text;
  v_reason text;
begin
  v_base := public.rpc_preview_catalog_change(p_change_id);
  if coalesce((v_base->>'ok')::boolean,false) is not true then return v_base; end if;
  select * into v_change from public.vmp_catalog_changes where id=p_change_id;
  select * into v_source from public.vmp_source_objects
  where object_kind=v_change.object_kind and object_code=v_change.object_code;

  for v_entry in select value from jsonb_array_elements(coalesce(v_base->'giu_nguyen','[]'::jsonb)) loop
    select * into v_item from public.vmp_plan_items
    where validation_code=v_entry->>'validation_code';
    v_match := case when v_item.id is null then null
      else regexp_match(v_item.validation_code,'/([0-9]{4})\.([0-9]+)-(.+)$') end;
    v_occurrence := null;
    if v_match is not null then
      begin v_occurrence:=v_match[2]::integer; exception when others then v_occurrence:=null; end;
    end if;
    v_deadline_protocol:=null; v_deadline_validation:=null;
    v_deadline_report:=null; v_deadline_vmp:=null; v_missing:='[]'::jsonb;
    if v_item.id is not null and v_occurrence is not null then
      select moc.deadline_protocol,moc.deadline_validation,
             moc.deadline_report,moc.deadline_vmp,coalesce(to_jsonb(moc.thieu),'[]'::jsonb)
      into v_deadline_protocol,v_deadline_validation,
           v_deadline_report,v_deadline_vmp,v_missing
      from public.vmp_tinh_moc_thoi_gian(
        v_item.year,v_source.first_month,coalesce(nullif(v_source.frequency_months,0),12),
        v_occurrence,v_source.report_class,v_source.workdays,v_item.validation_type) moc;
    end if;

    v_blocker:=null; v_reason:=null;
    if v_item.id is null then v_blocker:='ITEM_NOT_FOUND'; v_reason:='Hạng mục không còn tồn tại';
    elsif v_item.object_code is distinct from v_source.object_code then v_blocker:='WRONG_MEMBERSHIP'; v_reason:='Hạng mục không còn thuộc đối tượng';
    elsif coalesce(lower(v_source.validate_flag),'n')<>'y' or not coalesce(v_source.is_active,true) then v_blocker:='STOP_FLOW'; v_reason:='Đối tượng đang thuộc luồng Dừng';
    elsif not coalesce(v_item.is_active,true) then v_blocker:='ITEM_INACTIVE'; v_reason:='Hạng mục không còn hiệu lực';
    elsif v_item.item_state is distinct from 'active' then v_blocker:='ITEM_STATE_INACTIVE'; v_reason:='Hạng mục đã hủy hoặc không áp dụng';
    elsif v_match is null or v_occurrence is null or v_match[1]::integer<>v_item.year
       or v_match[1]::integer<>extract(year from now())::integer
       or v_match[3] is distinct from v_item.validation_type
       or v_item.validation_code is distinct from
          (v_item.object_code||'/'||v_match[1]||'.'||v_match[2]||'-'||v_match[3])
      then v_blocker:='INVALID_ITEM_IDENTITY'; v_reason:='Mã hạng mục không khớp định danh năm/lần/loại';
    elsif jsonb_array_length(v_missing)>0
       or v_deadline_protocol is null or v_deadline_validation is null
       or v_deadline_report is null or v_deadline_vmp is null
      then v_blocker:='MISSING_SOURCE_DATA'; v_reason:='Không tính đủ bốn deadline';
    elsif not (v_item.deadline_protocol is distinct from v_deadline_protocol
       or v_item.deadline_validation is distinct from v_deadline_validation
       or v_item.deadline_report is distinct from v_deadline_report
       or v_item.deadline_vmp is distinct from v_deadline_vmp)
      then v_blocker:='NO_ACTIONABLE_CHANGE'; v_reason:='Deadline hiện tại đã khớp nguồn';
    end if;
    v_eligible:=v_blocker is null;
    v_candidates:=v_candidates||jsonb_build_object(
      'validation_code',v_entry->>'validation_code','item_version',v_item.version,
      'eligible',v_eligible,'blocker_code',v_blocker,'blocker_reason',v_reason,
      'missing',v_missing,
      'progress',jsonb_build_object(
        'actual_protocol_date',v_item.actual_protocol_date,
        'actual_validation_date',v_item.actual_validation_date,
        'actual_report_date',v_item.actual_report_date,
        'actual_vmp_date',v_item.actual_vmp_date,
        'status_protocol',v_item.status_protocol,
        'status_validation',v_item.status_validation,
        'status_report',v_item.status_report,
        'status_vmp',v_item.status_vmp),
      'deadline_protocol_cu',v_item.deadline_protocol,'deadline_protocol_moi',v_deadline_protocol,
      'deadline_validation_cu',v_item.deadline_validation,'deadline_validation_moi',v_deadline_validation,
      'deadline_report_cu',v_item.deadline_report,'deadline_report_moi',v_deadline_report,
      'deadline_vmp_cu',v_item.deadline_vmp,'deadline_vmp_moi',v_deadline_vmp);
  end loop;
  return v_base||jsonb_build_object('deadline_overrides',v_candidates);
end
$_$;


--
-- Name: vmp_profile_authority_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_profile_authority_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception using errcode = '42501',
      message = 'PROFILE_AUTHORITY_COLUMNS_REQUIRE_ADMIN_RPC';
  end if;
  return new;
end
$$;


--
-- Name: vmp_reconcile_source_access_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_reconcile_source_access_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_validate_owner boolean := case when tg_op='INSERT' then true else
    old.owner_person_id is distinct from new.owner_person_id end;
  v_validate_support boolean := case when tg_op='INSERT' then true else
    old.support_person_id is distinct from new.support_person_id end;
begin
  -- Custom GUCs are caller-settable and cannot be trusted as an authorization
  -- fence. Validate only newly introduced/activated relations; an unchanged
  -- ineligible relation remains display-only for unrelated saves.
  if new.is_active is true and v_validate_owner
     and new.owner_person_id is not null
     and not exists (
       select 1
       from public.vmp_performers performer
       join public.profiles profile on profile.id=performer.user_id
       where performer.id=new.owner_person_id
         and performer.is_active is true
         and performer.user_id is not null
         and profile.is_active is true
         and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager')
         and (select count(*) from public.vmp_performers active_performer
              where active_performer.user_id=performer.user_id
                and active_performer.is_active is true)=1
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_TRIGGER_OWNER_NOT_ELIGIBLE';
  end if;
  if new.is_active is true and v_validate_support
     and new.support_person_id is not null
     and not exists (
       select 1
       from public.vmp_performers performer
       join public.profiles profile on profile.id=performer.user_id
       where performer.id=new.support_person_id
         and performer.is_active is true
         and performer.user_id is not null
         and profile.is_active is true
         and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager')
         and (select count(*) from public.vmp_performers active_performer
              where active_performer.user_id=performer.user_id
                and active_performer.is_active is true)=1
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_TRIGGER_SUPPORT_NOT_ELIGIBLE';
  end if;

  -- Every accepted active relation is reconciled before commit.
  perform public.vmp_reconcile_source_qa_projection(new.id);
  return new;
end
$$;


--
-- Name: vmp_reconcile_source_qa_projection("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_reconcile_source_qa_projection"("p_source_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_source public.vmp_source_objects%rowtype;
  v_item public.vmp_plan_items%rowtype;
  v_owner public.vmp_performers%rowtype;
  v_support public.vmp_performers%rowtype;
  v_owner_user_snapshot uuid;
  v_support_user_snapshot uuid;
  v_assignment public.vmp_item_assignments%rowtype;
  v_changed public.vmp_item_assignments%rowtype;
  v_existing public.vmp_item_assignments%rowtype;
  v_old jsonb;
  v_reason text := 'Reconcile canonical Source QA projection';
  v_items integer := 0;
  v_plan_updated integer := 0;
  v_inserted integer := 0;
  v_reactivated integer := 0;
  v_revoked integer := 0;
  v_demoted integer := 0;
  v_rows integer;
  v_owner_eligible boolean := false;
  v_support_eligible boolean := false;
begin
  select source_object.* into strict v_source
  from public.vmp_source_objects source_object
  where source_object.id = p_source_id
  for update;

  -- Snapshot linkage only to identify profiles, then lock in the same global
  -- profile -> performer dependency order used by the migration and runtime.
  -- If linkage changes before the performer lock, the revalidation below
  -- fails and rolls back instead of proceeding with an unlocked profile.
  select performer.user_id into v_owner_user_snapshot
  from public.vmp_performers performer
  where performer.id = v_source.owner_person_id;
  select performer.user_id into v_support_user_snapshot
  from public.vmp_performers performer
  where performer.id = v_source.support_person_id;

  perform 1
  from public.profiles profile
  where profile.id = any (array[
    v_owner_user_snapshot, v_support_user_snapshot
  ]::uuid[])
  order by profile.id
  for update;

  perform 1
  from public.vmp_performers performer
  where performer.id = any (array[
    v_source.owner_person_id, v_source.support_person_id
  ]::uuid[])
  order by performer.id
  for update;

  -- Stable repair order: Source, principal evidence, related active items,
  -- then every assignment row that canonical conversion may change.
  perform 1
  from public.vmp_plan_items item
  where item.object_code = v_source.object_code and item.is_active is true
  order by item.validation_code, item.id
  for update;

  perform 1
  from public.vmp_item_assignments assignment
  where assignment.validation_code in (
      select item.validation_code
      from public.vmp_plan_items item
      where item.object_code = v_source.object_code and item.is_active is true
    )
    and assignment.assignment_kind = 'qa'
    and (
      assignment.source in ('source_owner', 'source_support')
      or (assignment.is_active and (
        assignment.performer_id in (
          v_source.owner_person_id, v_source.support_person_id
        )
        or assignment.assignment_role = 'primary'
      ))
    )
  order by assignment.validation_code, assignment.performer_id,
           assignment.assignment_role, assignment.source, assignment.id
  for update;

  -- Re-read after every required lock is held. Existing performer rows are
  -- retained for display even when they are not eligible for QA authority;
  -- only a missing performer row remains fail-closed because its display
  -- projection cannot be reconstructed safely.
  if v_source.owner_person_id is not null then
    select performer.* into strict v_owner
    from public.vmp_performers performer
    where performer.id = v_source.owner_person_id;

    select count(*) into v_rows
    from public.vmp_performers performer
    where performer.user_id = v_owner.user_id and performer.is_active is true;
    if v_owner.user_id is not null
       and v_owner.user_id is not distinct from v_owner_user_snapshot
       and v_owner.is_active is true
       and v_rows = 1
       and exists (
         select 1 from public.profiles profile
         where profile.id = v_owner.user_id and profile.is_active is true
           and public.vmp_business_role(v_owner.user_id) in ('qa_staff', 'qa_manager')
       ) then
      v_owner_eligible := true;
    end if;
  end if;

  if v_source.support_person_id is not null then
    select performer.* into strict v_support
    from public.vmp_performers performer
    where performer.id = v_source.support_person_id;

    select count(*) into v_rows
    from public.vmp_performers performer
    where performer.user_id = v_support.user_id and performer.is_active is true;
    if v_support.user_id is not null
       and v_support.user_id is not distinct from v_support_user_snapshot
       and v_support.is_active is true
       and v_rows = 1
       and exists (
         select 1 from public.profiles profile
         where profile.id = v_support.user_id and profile.is_active is true
           and public.vmp_business_role(v_support.user_id) in ('qa_staff', 'qa_manager')
       ) then
      v_support_eligible := true;
    end if;
  end if;

  for v_item in
    select item.*
    from public.vmp_plan_items item
    where item.object_code = v_source.object_code and item.is_active is true
    order by item.validation_code, item.id
  loop
    v_items := v_items + 1;

    update public.vmp_plan_items item
    set owner_person_id = v_source.owner_person_id,
        support_person_id = v_source.support_person_id,
        owner_name = case when v_source.owner_person_id is null
                          then null else v_owner.performer_name end,
        secondary_owner = case when v_source.support_person_id is null
                               then null else v_support.performer_name end
    where item.id = v_item.id
      and (item.owner_person_id, item.support_person_id,
           item.owner_name, item.secondary_owner)
          is distinct from
          (v_source.owner_person_id, v_source.support_person_id,
           case when v_source.owner_person_id is null
                then null else v_owner.performer_name end,
           case when v_source.support_person_id is null
                then null else v_support.performer_name end);
    get diagnostics v_rows = row_count;
    v_plan_updated := v_plan_updated + v_rows;

    -- Revoke stale canonical rows first, including source_support when owner
    -- and support intentionally resolve to the same performer.
    for v_assignment in
      select assignment.*
      from public.vmp_item_assignments assignment
      where assignment.validation_code = v_item.validation_code
        and assignment.assignment_kind = 'qa' and assignment.is_active
        and (
          (assignment.source = 'source_owner' and not (
            v_owner_eligible
            and assignment.performer_id is not distinct from
                v_source.owner_person_id
          ))
          or
          (assignment.source = 'source_support' and not (
            v_support_eligible
            and
            assignment.performer_id is not distinct from
              v_source.support_person_id
            and v_source.support_person_id is not null
            and v_source.support_person_id is distinct from
              v_source.owner_person_id
          ))
        )
      order by assignment.performer_id, assignment.assignment_role,
               assignment.source, assignment.id
    loop
      v_old := to_jsonb(v_assignment);
      update public.vmp_item_assignments assignment
      set is_active = false, change_reason = v_reason, updated_by = null
      where assignment.id = v_assignment.id
      returning assignment.* into strict v_changed;
      insert into public.audit_logs(
        user_id, action, table_name, record_id, validation_code,
        changed_fields, change_reason, old_data, new_data, source,
        effective_business_role
      ) values (
        null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
        v_assignment.id::text, v_item.validation_code, array['is_active'],
        v_reason, v_old, to_jsonb(v_changed),
        'source_qa_projection_reconcile', null
      );
      v_revoked := v_revoked + 1;
    end loop;

    if v_owner_eligible then
      -- Preserve history: revoke same-person noncanonical rows rather than
      -- rewriting their source label into the canonical tuple.
      for v_assignment in
        select assignment.*
        from public.vmp_item_assignments assignment
        where assignment.validation_code = v_item.validation_code
          and assignment.assignment_kind = 'qa' and assignment.is_active
          and assignment.performer_id = v_source.owner_person_id
          and assignment.source <> 'source_owner'
        order by assignment.assignment_role, assignment.source, assignment.id
      loop
        v_old := to_jsonb(v_assignment);
        update public.vmp_item_assignments assignment
        set is_active = false, change_reason = v_reason, updated_by = null
        where assignment.id = v_assignment.id
        returning assignment.* into strict v_changed;
        insert into public.audit_logs(
          user_id, action, table_name, record_id, validation_code,
          changed_fields, change_reason, old_data, new_data, source,
          effective_business_role
        ) values (
          null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
          v_assignment.id::text, v_item.validation_code, array['is_active'],
          v_reason, v_old, to_jsonb(v_changed),
          'source_qa_projection_reconcile', null
        );
        v_revoked := v_revoked + 1;
      end loop;

      -- Keep the existing one-primary invariant: a different active primary
      -- is audited and demoted before canonical owner activation.
      for v_assignment in
        select assignment.*
        from public.vmp_item_assignments assignment
        where assignment.validation_code = v_item.validation_code
          and assignment.assignment_kind = 'qa' and assignment.is_active
          and assignment.assignment_role = 'primary'
          and assignment.performer_id is distinct from v_source.owner_person_id
        order by assignment.performer_id, assignment.source, assignment.id
      loop
        v_old := to_jsonb(v_assignment);
        update public.vmp_item_assignments assignment
        set assignment_role = 'collaborator', change_reason = v_reason,
            updated_by = null
        where assignment.id = v_assignment.id
        returning assignment.* into strict v_changed;
        insert into public.audit_logs(
          user_id, action, table_name, record_id, validation_code,
          changed_fields, change_reason, old_data, new_data, source,
          effective_business_role
        ) values (
          null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
          v_assignment.id::text, v_item.validation_code,
          array['assignment_role'], v_reason, v_old, to_jsonb(v_changed),
          'source_qa_projection_reconcile', null
        );
        v_demoted := v_demoted + 1;
      end loop;

      select assignment.* into v_existing
      from public.vmp_item_assignments assignment
      where assignment.validation_code = v_item.validation_code
        and assignment.performer_id = v_source.owner_person_id
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_owner';
      if not found then
        insert into public.vmp_item_assignments(
          validation_code, performer_id, user_id, staff_name, employee_code,
          assignment_kind, source, assignment_role, expires_at, is_active,
          change_reason, created_by, updated_by
        ) values (
          v_item.validation_code, v_owner.id, v_owner.user_id,
          v_owner.performer_name, v_owner.employee_code, 'qa', 'source_owner',
          'primary', null, true, v_reason, null, null
        );
        v_inserted := v_inserted + 1;
      else
        update public.vmp_item_assignments assignment
        set user_id = v_owner.user_id,
            staff_name = v_owner.performer_name,
            employee_code = v_owner.employee_code,
            assignment_role = 'primary', expires_at = null, is_active = true,
            change_reason = v_reason, updated_by = null
        where assignment.id = v_existing.id
          and (assignment.user_id, assignment.staff_name,
               assignment.employee_code, assignment.assignment_role,
               assignment.expires_at, assignment.is_active,
               assignment.change_reason, assignment.updated_by)
              is distinct from
              (v_owner.user_id, v_owner.performer_name,
               v_owner.employee_code, 'primary'::text, null::timestamptz,
               true, v_reason, null::uuid);
        get diagnostics v_rows = row_count;
        if v_rows = 1 and not v_existing.is_active then
          v_reactivated := v_reactivated + 1;
        end if;
      end if;
    end if;

    if v_support_eligible
       and v_source.support_person_id is distinct from v_source.owner_person_id then
      for v_assignment in
        select assignment.*
        from public.vmp_item_assignments assignment
        where assignment.validation_code = v_item.validation_code
          and assignment.assignment_kind = 'qa' and assignment.is_active
          and assignment.performer_id = v_source.support_person_id
          and assignment.source <> 'source_support'
        order by assignment.assignment_role, assignment.source, assignment.id
      loop
        v_old := to_jsonb(v_assignment);
        update public.vmp_item_assignments assignment
        set is_active = false, change_reason = v_reason, updated_by = null
        where assignment.id = v_assignment.id
        returning assignment.* into strict v_changed;
        insert into public.audit_logs(
          user_id, action, table_name, record_id, validation_code,
          changed_fields, change_reason, old_data, new_data, source,
          effective_business_role
        ) values (
          null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
          v_assignment.id::text, v_item.validation_code, array['is_active'],
          v_reason, v_old, to_jsonb(v_changed),
          'source_qa_projection_reconcile', null
        );
        v_revoked := v_revoked + 1;
      end loop;

      select assignment.* into v_existing
      from public.vmp_item_assignments assignment
      where assignment.validation_code = v_item.validation_code
        and assignment.performer_id = v_source.support_person_id
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_support';
      if not found then
        insert into public.vmp_item_assignments(
          validation_code, performer_id, user_id, staff_name, employee_code,
          assignment_kind, source, assignment_role, expires_at, is_active,
          change_reason, created_by, updated_by
        ) values (
          v_item.validation_code, v_support.id, v_support.user_id,
          v_support.performer_name, v_support.employee_code, 'qa',
          'source_support', 'collaborator', null, true, v_reason, null, null
        );
        v_inserted := v_inserted + 1;
      else
        update public.vmp_item_assignments assignment
        set user_id = v_support.user_id,
            staff_name = v_support.performer_name,
            employee_code = v_support.employee_code,
            assignment_role = 'collaborator', expires_at = null,
            is_active = true, change_reason = v_reason, updated_by = null
        where assignment.id = v_existing.id
          and (assignment.user_id, assignment.staff_name,
               assignment.employee_code, assignment.assignment_role,
               assignment.expires_at, assignment.is_active,
               assignment.change_reason, assignment.updated_by)
              is distinct from
              (v_support.user_id, v_support.performer_name,
               v_support.employee_code, 'collaborator'::text,
               null::timestamptz, true, v_reason, null::uuid);
        get diagnostics v_rows = row_count;
        if v_rows = 1 and not v_existing.is_active then
          v_reactivated := v_reactivated + 1;
        end if;
      end if;
    end if;
  end loop;

  if exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and (item.owner_person_id is distinct from v_source.owner_person_id
              or item.support_person_id is distinct from
                 v_source.support_person_id)
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.owner_person_id is not null
         and v_owner_eligible
         and (select count(*)
              from public.vmp_item_assignments assignment
              where assignment.validation_code = item.validation_code
                and assignment.performer_id = v_source.owner_person_id
                and assignment.assignment_kind = 'qa'
                and assignment.source = 'source_owner'
                and assignment.assignment_role = 'primary'
                and assignment.is_active) <> 1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.support_person_id is not null
         and v_support_eligible
         and v_source.support_person_id is distinct from v_source.owner_person_id
         and (select count(*)
              from public.vmp_item_assignments assignment
              where assignment.validation_code = item.validation_code
                and assignment.performer_id = v_source.support_person_id
                and assignment.assignment_kind = 'qa'
                and assignment.source = 'source_support'
                and assignment.assignment_role = 'collaborator'
                and assignment.is_active) <> 1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.owner_person_id is not null
         and v_owner_eligible
         and v_source.owner_person_id is not distinct from
             v_source.support_person_id
         and (select count(*)
              from public.vmp_item_assignments assignment
              where assignment.validation_code = item.validation_code
                and assignment.performer_id = v_source.owner_person_id
                and assignment.assignment_kind = 'qa'
                and assignment.is_active) <> 1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_item_assignments assignment
         on assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa' and assignment.is_active
        and assignment.source in ('source_owner', 'source_support')
       where item.object_code = v_source.object_code and item.is_active is true
         and (
           (assignment.source = 'source_owner' and not (
             v_owner_eligible
             and assignment.performer_id is not distinct from
                 v_source.owner_person_id
           ))
           or
           (assignment.source = 'source_support' and not (
             v_support_eligible
             and
             assignment.performer_id is not distinct from
               v_source.support_person_id
             and v_source.support_person_id is not null
             and v_source.support_person_id is distinct from
               v_source.owner_person_id
           ))
         )
     )
     -- Ineligible existing relations are display-only and must have zero
     -- active canonical Source assignments after reconciliation.
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_item_assignments assignment
         on assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_owner'
        and assignment.is_active
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.owner_person_id is not null
         and not v_owner_eligible
         and assignment.performer_id is not distinct from v_source.owner_person_id
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_item_assignments assignment
         on assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_support'
        and assignment.is_active
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.support_person_id is not null
         and not v_support_eligible
         and assignment.performer_id is not distinct from v_source.support_person_id
     )
     or exists (
       select 1 from pg_index index_row
       where index_row.indexrelid in (
         'public.vmp_item_assignments_one_active_qa_person'::regclass,
         'public.vmp_item_assignments_one_active_qa_primary'::regclass
       ) and (not index_row.indisunique or not index_row.indisvalid
              or not index_row.indisready)
     ) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_RECONCILE_POSTCONDITION';
  end if;

  return jsonb_build_object(
    'ok', true, 'source_id', p_source_id, 'items', v_items,
    'plan_updated', v_plan_updated, 'inserted', v_inserted,
    'reactivated', v_reactivated, 'revoked', v_revoked,
    'demoted', v_demoted
  );
exception
  when no_data_found then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_RECONCILE_INVALID_SOURCE_OR_PRINCIPAL';
end
$$;


--
-- Name: vmp_score_complexity("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_score_complexity"("p_kind" "text", "p_name" "text", "p_report_class" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    -- ---- Quy trình: theo phân loại báo cáo của sheet gốc ----
    when p_kind = 'Quy trình' and p_report_class = 'Vô khuẩn' then 3
    when p_kind = 'Quy trình'                                 then 2

    -- ---- Mức 3: xử lý không khí sạch ----
    -- \m…\M là ranh giới từ, tránh khớp nhầm chữ "laf" nằm giữa tên khác.
    when lower(coalesce(p_name,'')) ~ ('\mlaf\M|buồng cân|buồng lấy mẫu'
         || '|tủ an toàn sinh học|\matsh\M|isolator|găng tay') then 3

    -- ---- Mức 3: tiệt trùng bằng nhiệt ----
    when lower(coalesce(p_name,'')) ~ 'nồi hấp|tủ hấp|tiệt trùng|triệt trùng' then 3

    -- ---- Chặn hai kiểu khớp nhầm của luật mức 3 bên dưới ----
    -- "bán tự động" khớp chuỗi "tự động" nhưng thực tế ÍT tự động hơn.
    -- "Tủ sấy 2 cánh cho lên men" khớp "lên men" nhưng nó là tủ sấy.
    when lower(coalesce(p_name,'')) ~ 'bán tự động|^tủ sấy' then 2

    -- ---- Mức 3: phân tích dụng cụ, sản xuất phức hợp, phụ trợ trọng yếu ----
    when lower(coalesce(p_name,'')) ~ ('sắc ký|sắc kí|hplc|quang phổ|ftir|raman|khối phổ'
         || '|toc|carbon hữu cơ|nội độc tố|khí động học|bfs|lên men|cip'
         || '|nhũ hóa chân không|hvac|nước tinh khiết|nước cất|hơi tinh khiết'
         || '|lọc tiếp tuyến|lọc vô trùng|tự động'
         || '|khí nén|khí nito|khí nitơ|nitrogen') then 3

    -- ---- Mức 1: thiết bị đơn giản, chủ yếu hiệu chuẩn ----
    -- Đã bỏ khỏi nhóm này: passbox, laf, chiller.
    when lower(coalesce(p_name,'')) ~ '^cân|cân check|tủ lạnh|tủ mát|giá |xe đẩy' then 1

    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'thông minh' then 3
    when p_kind = 'Kho' and lower(coalesce(p_name,'')) ~ 'lạnh|mát'    then 2
    when p_kind = 'Kho'                                                then 1
    when p_kind = 'Vận chuyển' then 1
    else 2
  end;
$$;


--
-- Name: FUNCTION "vmp_score_complexity"("p_kind" "text", "p_name" "text", "p_report_class" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_score_complexity"("p_kind" "text", "p_name" "text", "p_report_class" "text") IS 'Điểm mức độ phức tạp 1..3 theo 0.Rule. Cao=hệ nhiều thành phần liên động hoặc có chu trình/xử lý không khí, đòi đủ DQ→PQ và tái thẩm định có phép đo chuyên biệt. Trung bình=thiết bị độc lập có thông số vận hành cần OQ/PQ. Thấp=chủ yếu hiệu chuẩn/xác nhận lắp đặt.';


--
-- Name: vmp_score_quality_impact("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_score_quality_impact"("p_kind" "text", "p_name" "text", "p_department" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  with t as (
    select lower(coalesce(p_name,'')) as n,
           coalesce(p_kind,'') as k,
           -- Là máy ĐO / máy THỬ thì nó nằm ở phòng thí nghiệm, không
           -- nằm trong đường đi của sản phẩm
           (lower(coalesce(p_name,'')) ~ 'máy đo|may do|thiết bị đo|thiet bi do|máy thử|may thu|máy phân tích|may phan tich|máy quét|may quet') as la_may_do
  )
  select case
    when (select n from t) ~ 'nước thải|nuoc thai|lưu hsl|luu hsl|hồ sơ lô|ho so lo' then 1
    when (select k from t) = 'Kho' and (select n from t) ~ 'nghiên cứu|nghien cuu|hsl' then 1
    when (select k from t) = 'Vận chuyển' then 1

    -- Máy đo và máy thử: xét TRƯỚC mọi luật theo tên sản phẩm, vì tên
    -- chúng thường chứa tên sản phẩm mà chúng đo ("máy đo độ rã viên đặt")
    when (select la_may_do from t) then 2

    -- PHÁN QUYẾT QA
    when (select n from t) ~ 'siết nắp|siet nap' then 2
    when (select n from t) ~ 'trộn lập phương|tron lap phuong|viên đặt|vien dat' then 3
    when (select n from t) ~ 'xay keo|ly tâm|ly tam' then 3

    -- MỨC 3 — trực tiếp
    when (select n from t) ~ 'vô trùng|vo trung|isolator|laf|bsc|passbox|tủ truyền|tu truyen|an toàn sinh học|an toan sinh hoc|thao tác có găng|thao tac co gang|găng tay|gang tay' then 3
    when (select n from t) ~ 'nồi hấp|noi hap|tủ hấp|tu hap|tiệt trùng|tiet trung|autoclave|hấp tiệt' then 3
    when (select n from t) ~ 'hvac|khí sạch|khi sach|điều hòa khu|dieu hoa khu' then 3
    when (select n from t) ~ 'nước tinh khiết|nuoc tinh khiet|nước cất|nuoc cat|nước ri|nuoc ri|wfi|purified water' then 3
    when (select n from t) ~ 'khí nén|khi nen|nitơ|nito|hơi tinh khiết|hoi tinh khiet|clean steam' then 3
    when (select n from t) ~ 'tank|bồn|bon|pha chế|pha che|pha dịch|pha dich|lên men|len men|nhũ hóa|nhu hoa|đồng hóa|dong hoa' then 3
    when (select n from t) ~ 'chiết rót|chiet rot|chiêt rót|rót dịch|rot dich|đóng dịch|dong dich|bfs|ffs|đóng túi|dong tui|hàn|han seal|ép vỉ|ep vi|tạo nang|tao nang|đóng gel|dong gel|máy đóng|may dong|nạp chất đẩy|nap chat day' then 3
    when (select k from t) in ('Quy trình','QT') then 3
    when (select n from t) ~ 'quy trình sản xuất|quy trinh san xuat|quy trình vệ sinh|quy trinh ve sinh|cip|sip' then 3
    when (select n from t) ~ 'lọc|loc ' then 3

    -- MỨC 2 — gián tiếp
    when (select n from t) ~ 'sắc k|sac k|hplc|quang phổ|quang pho|ftir|hồng ngoại|hong ngoai|phân cực|phan cuc|khúc xạ|khuc xa|chuẩn độ|chuan do|toc|độ hòa tan|do hoa tan|độ rã|do ra|điểm nóng chảy|diem nong chay|kích thước hạt|kich thuoc hat|cân |can |kính|kinh hien|đo ph|do ph' then 2
    when (select n from t) ~ 'tủ ủ|tu u |tủ ấm|tu am|nuôi cấy|nuoi cay|tủ vi sinh|incubator' then 2
    when (select n from t) ~ 'rửa|rua |sấy|say |ủ nhiệt|u nhiet|lò nung|lo nung' then 2
    when (select k from t) = 'Kho' then 2
    when (select n from t) ~ 'kho lạnh|kho lanh|tủ lạnh|tu lanh|tủ mát|tu mat|chiller|chiler|làm mát|lam mat' then 2
    when (select n from t) ~ 'máy xay|may xay|nghiền|nghien' then 2

    else 3
  end;
$$;


--
-- Name: FUNCTION "vmp_score_quality_impact"("p_kind" "text", "p_name" "text", "p_department" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_score_quality_impact"("p_kind" "text", "p_name" "text", "p_department" "text") IS 'Chấm ảnh hưởng chất lượng theo ISPE direct/indirect/no impact, có tính khả năng phát hiện. Bốn phán quyết QA 2026-07-31 đặt trước luật chung: siết nắp=2, trộn lập phương/viên đặt=3, xay keo/ly tâm=3.';


--
-- Name: vmp_score_quality_impact_de_xuat("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_score_quality_impact_de_xuat"("p_kind" "text", "p_name" "text", "p_department" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  with t as (select lower(coalesce(p_name,'')) as n, coalesce(p_kind,'') as k)
  select case
    when (select n from t) ~ 'nước thải|nuoc thai|lưu hsl|luu hsl|hồ sơ lô|ho so lo' then 1
    when (select k from t) = 'Kho' and (select n from t) ~ 'nghiên cứu|nghien cuu|hsl' then 1
    when (select k from t) = 'Vận chuyển' then 1

    -- MỨC 3 — trực tiếp, sai lệch không bắt lại được
    -- Thêm tên tiếng Việt của BSC và isolator
    when (select n from t) ~ 'vô trùng|vo trung|isolator|laf|bsc|passbox|tủ truyền|tu truyen|an toàn sinh học|an toan sinh hoc|thao tác có găng|thao tac co gang|găng tay|gang tay' then 3
    when (select n from t) ~ 'nồi hấp|noi hap|tủ hấp|tu hap|tiệt trùng|tiet trung|autoclave|hấp tiệt' then 3
    when (select n from t) ~ 'hvac|khí sạch|khi sach|điều hòa khu|dieu hoa khu' then 3
    when (select n from t) ~ 'nước tinh khiết|nuoc tinh khiet|nước cất|nuoc cat|nước ri|nuoc ri|wfi|purified water' then 3
    when (select n from t) ~ 'khí nén|khi nen|nitơ|nito|hơi tinh khiết|hoi tinh khiet|clean steam' then 3
    when (select n from t) ~ 'tank|bồn|bon|pha chế|pha che|pha dịch|pha dich|lên men|len men|nhũ hóa|nhu hoa|đồng hóa|dong hoa' then 3
    -- "chiêt rót" là lỗi gõ thiếu dấu CÓ THẬT trong dữ liệu — bắt cả hai
    when (select n from t) ~ 'chiết rót|chiet rot|chiêt rót|rót dịch|rot dich|đóng dịch|dong dich|bfs|ffs|đóng túi|dong tui|siết nắp|siet nap|hàn|han seal|ép vỉ|ep vi|tạo nang|tao nang|đóng gel|dong gel|máy đóng|may dong|nạp chất đẩy|nap chat day' then 3
    when (select k from t) in ('Quy trình','QT') then 3
    when (select n from t) ~ 'quy trình sản xuất|quy trinh san xuat|quy trình vệ sinh|quy trinh ve sinh|cip|sip' then 3
    when (select n from t) ~ 'lọc|loc ' then 3

    -- MỨC 2 — gián tiếp, có lớp phát hiện chặn lại
    when (select n from t) ~ 'sắc k|sac k|hplc|quang phổ|quang pho|ftir|hồng ngoại|hong ngoai|phân cực|phan cuc|khúc xạ|khuc xa|chuẩn độ|chuan do|toc|độ hòa tan|do hoa tan|độ rã|do ra|điểm nóng chảy|diem nong chay|kích thước hạt|kich thuoc hat|cân |can |kính|kinh hien|đo ph|do ph' then 2
    -- Tủ nuôi cấy / ủ / ấm: dùng cho thử nghiệm vi sinh, có mẫu chứng
    when (select n from t) ~ 'tủ ủ|tu u |tủ ấm|tu am|nuôi cấy|nuoi cay|tủ vi sinh|incubator' then 2
    when (select n from t) ~ 'rửa|rua |sấy|say |ủ nhiệt|u nhiet|lò nung|lo nung' then 2
    when (select k from t) = 'Kho' then 2
    when (select n from t) ~ 'kho lạnh|kho lanh|tủ lạnh|tu lanh|tủ mát|tu mat|chiller|chiler|làm mát|lam mat' then 2
    when (select n from t) ~ 'ly tâm|ly tam|máy xay|may xay|nghiền|nghien' then 2

    else 3
  end;
$$;


--
-- Name: FUNCTION "vmp_score_quality_impact_de_xuat"("p_kind" "text", "p_name" "text", "p_department" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_score_quality_impact_de_xuat"("p_kind" "text", "p_name" "text", "p_department" "text") IS 'BẢN ĐỀ XUẤT chấm ảnh hưởng chất lượng theo ISPE direct/indirect/no impact, có tính khả năng phát hiện. KHÔNG dùng để ghi đè; so sánh qua bảng vmp_danh_gia_anh_huong.';


--
-- Name: vmp_session_denial(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_session_denial"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p
    where p.id = v_uid and coalesce(p.is_active, true)
  ) then
    v_code := 'ACCOUNT_DISABLED';
  else
    v_code := 'ROLE_UNRESOLVED';
  end if;

  return jsonb_build_object(
    'ok', false,
    'error_code', v_code,
    'error', case v_code
      when 'ACCOUNT_DISABLED' then 'Tài khoản không hoạt động'
      else 'Không xác định được vai trò nghiệp vụ'
    end
  );
end
$$;


--
-- Name: vmp_set_item_assignment_unhardened("uuid", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_set_item_assignment_unhardened"("p_person_id" "uuid", "p_validation_code" "text", "p_assignment_kind" "text", "p_action" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_department text;
  v_actor_class text;
  v_actor_scope text[];
  v_actor_areas text[];
  v_target public.vmp_performers%rowtype;
  v_object_department text;
  v_object_area text;
  v_object_line text;
  v_source text;
  v_scope_match boolean;
  v_area_match boolean;
begin
  select
    profile.role::text,
    profile.department,
    performer.access_class,
    performer.scope_departments,
    performer.access_areas
  into
    v_actor_role,
    v_actor_department,
    v_actor_class,
    v_actor_scope,
    v_actor_areas
  from public.profiles profile
  left join public.vmp_performers performer on performer.user_id = profile.id
  where profile.id = v_actor and coalesce(profile.is_active, true);

  if v_actor_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do phân công');
  end if;
  if p_assignment_kind not in ('qa', 'equipment_department') then
    return jsonb_build_object('ok', false, 'error', 'Loại phân công không hợp lệ');
  end if;
  if p_action not in ('assign', 'revoke') then
    return jsonb_build_object('ok', false, 'error', 'Hành động chỉ nhận assign hoặc revoke');
  end if;

  select * into v_target
  from public.vmp_performers
  where id = p_person_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy nhân viên hoạt động');
  end if;

  select object.department, object.area, object.line
  into v_object_department, v_object_area, v_object_line
  from public.vmp_visible_plan_items() item
  join public.vmp_objects object on object.code = item.object_code
  where item.validation_code = p_validation_code and item.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy hạng mục thẩm định');
  end if;

  v_scope_match := coalesce('*' = any(v_actor_scope), false)
    or coalesce(v_object_department = any(v_actor_scope), false);
  v_area_match := coalesce('*' = any(v_actor_areas), false)
    or coalesce(v_object_area = any(v_actor_areas), false)
    or coalesce(v_object_line = any(v_actor_areas), false);

  if v_actor_role <> 'admin' then
    if v_actor_class = 'qa_manager' or v_actor_role = 'qa_manager' then
      if p_assignment_kind <> 'qa' then
        return jsonb_build_object('ok', false, 'error', 'Quản lý QA chỉ phân công loại QA');
      end if;
      if v_target.department <> 'qa'
          or v_target.access_class not in ('qa_progress_editor', 'qa_manager') then
        return jsonb_build_object('ok', false, 'error', 'Chỉ phân công được nhân viên QA hợp lệ');
      end if;
      if not coalesce(v_scope_match, false) or not coalesce(v_area_match, false) then
        return jsonb_build_object('ok', false, 'error', 'Hạng mục ngoài phạm vi/khu vực quản lý QA');
      end if;
    elsif v_actor_class = 'equipment_manager' then
      if p_assignment_kind <> 'equipment_department' then
        return jsonb_build_object(
          'ok', false, 'error', 'Quản lý bộ phận thiết bị chỉ phân công nhân sự bộ phận'
        );
      end if;
      if v_actor_department is null
          or v_target.department is distinct from v_actor_department
          or v_object_department is distinct from v_actor_department then
        return jsonb_build_object(
          'ok', false,
          'error', 'Chỉ phân công người cùng bộ phận cho hạng mục do bộ phận mình quản lý'
        );
      end if;
      if not coalesce(v_scope_match, false) or not coalesce(v_area_match, false) then
        return jsonb_build_object('ok', false, 'error', 'Hạng mục ngoài phạm vi/khu vực quản lý');
      end if;
    else
      return jsonb_build_object('ok', false, 'error', 'Bạn không có quyền phân công hạng mục');
    end if;
  end if;

  v_source := case
    when p_assignment_kind = 'qa' then 'qa_manager'
    else 'equipment_manager'
  end;

  if p_action = 'revoke' then
    update public.vmp_item_assignments
    set is_active = false,
        change_reason = btrim(p_reason),
        updated_by = v_actor
    where validation_code = p_validation_code
      and performer_id = p_person_id
      and assignment_kind = p_assignment_kind
      and source = v_source;
  else
    insert into public.vmp_item_assignments (
      validation_code, performer_id, user_id, staff_name, employee_code,
      assignment_kind, source, source_text, unresolved_reason,
      is_active, change_reason, created_by, updated_by
    ) values (
      p_validation_code, v_target.id, v_target.user_id,
      v_target.performer_name, v_target.employee_code,
      p_assignment_kind, v_source, v_target.performer_name,
      case when v_target.user_id is null then 'account_unlinked' else null end,
      true, btrim(p_reason), v_actor, v_actor
    )
    on conflict (validation_code, performer_id, assignment_kind, source)
      where performer_id is not null
    do update set
      user_id = excluded.user_id,
      staff_name = excluded.staff_name,
      employee_code = excluded.employee_code,
      source_text = excluded.source_text,
      unresolved_reason = excluded.unresolved_reason,
      is_active = true,
      change_reason = excluded.change_reason,
      updated_by = excluded.updated_by;
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, new_data,
    change_reason, source, changed_fields, validation_code
  ) values (
    v_actor,
    case when p_action = 'revoke' then 'DELETE'::public.audit_action else 'UPDATE'::public.audit_action end,
    'vmp_item_assignments',
    p_validation_code || '×' || p_person_id::text,
    jsonb_build_object(
      'person_id', p_person_id,
      'assignment_kind', p_assignment_kind,
      'source', v_source,
      'is_active', p_action = 'assign'
    ),
    btrim(p_reason),
    'dashboard_rpc',
    array['is_active'],
    p_validation_code
  );

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'source', v_source,
    'account_status', case when v_target.user_id is null then 'unlinked' else 'linked' end
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$$;


--
-- Name: vmp_sheet_classification("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_sheet_classification"("p_value" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  if v ~ '(quy trình|quy trinh|process|sop|công đoạn|cong doan)' then return 'qt'; end if;
  if v ~ '(kho|warehouse|storage|bảo quản|bao quan)' then return 'kho'; end if;
  if v ~ '(hệ thống|he thong|phụ trợ|phu tro|hvac|utility|khí|khi|nước|nuoc|điều hòa|dieu hoa)' then return 'ht'; end if;
  if v ~ '(vận chuyển|van chuyen|transport|logistics|cold chain|chuỗi lạnh|chuoi lanh)' then return 'vc'; end if;
  return 'tb';
end;
$$;


--
-- Name: vmp_sheet_criticality("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_sheet_criticality"("p_score" "text", "p_report_class" "text") RETURNS "public"."criticality"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  score numeric := public.vmp_sheet_number(p_score);
  report text := lower(btrim(coalesce(p_report_class, '')));
begin
  if score is not null then
    if score >= 7 then return 'high'::public.criticality; end if;
    if score >= 4 then return 'medium'::public.criticality; end if;
    return 'low'::public.criticality;
  end if;

  if report ~ '(vô khuẩn|vo khuan|sterile|aseptic|nhiễm khuẩn|nhiem khuan|micro)' then
    return 'high'::public.criticality;
  end if;
  if report ~ '(không phụ thuộc|khong phu thuoc|độc lập|doc lap|independent)' then
    return 'low'::public.criticality;
  end if;
  return 'medium'::public.criticality;
end;
$$;


--
-- Name: vmp_sheet_date("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_sheet_date"("p_value" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v text := btrim(coalesce(p_value, ''));
  m text[];
begin
  if v = '' then
    return null;
  end if;

  m := regexp_match(v, '^(\d{4})[-/](\d{1,2})[-/](\d{1,2})');
  if m is not null then
    return make_date(m[1]::integer, m[2]::integer, m[3]::integer);
  end if;

  m := regexp_match(v, '^(\d{1,2})[-/](\d{1,2})[-/](\d{4})');
  if m is not null then
    return make_date(m[3]::integer, m[2]::integer, m[1]::integer);
  end if;

  return null;
exception when others then
  return null;
end;
$$;


--
-- Name: vmp_sheet_department("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_sheet_department"("p_value" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  if v ~ '(xsx|sản xuất|san xuat|xưởng|xuong|production|(^|[^a-z])sx([^a-z]|$))' then return 'xsx'; end if;
  if v ~ '(cơ điện|co dien|mep|kỹ thuật|ky thuat|engineering|cđ|(^|[^a-z])cd([^a-z]|$))' then return 'cd'; end if;
  if v ~ '((^|[^a-z])kho([^a-z]|$)|warehouse)' then return 'kho'; end if;
  if v ~ '((^|[^a-z])rd([^a-z]|$)|r&d|nghiên cứu|nghien cuu|research|qc|kiểm nghiệm|kiem nghiem|lab)' then return 'qc'; end if;
  return 'qa';
end;
$_$;


--
-- Name: vmp_sheet_number("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_sheet_number"("p_value" "text") RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v text := replace(btrim(coalesce(p_value, '')), ',', '.');
begin
  if v = '' or v !~ '^[+-]?\d+(\.\d+)?$' then
    return null;
  end if;
  return v::numeric;
exception when others then
  return null;
end;
$_$;


--
-- Name: vmp_sheet_status("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_sheet_status"("p_value" "text") RETURNS "public"."phase_status"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  if v = ''
     or v ~ '(chưa|chua|không|khong)'
     or v ~ 'not[_ -]?started'
     or v ~ '(chờ|cho|pending|kế hoạch|ke hoach|plan)' then
    return 'not_started'::public.phase_status;
  end if;

  if v ~ '(hoàn thành|hoan thanh|done|đạt|dat|complete|completed|xong|ok)' then
    return 'completed'::public.phase_status;
  end if;

  if v ~ '(đang|dang|progress|in[_ -]?progress|thực hiện|thuc hien|wip)' then
    return 'in_progress'::public.phase_status;
  end if;

  return 'not_started'::public.phase_status;
end;
$$;


--
-- Name: vmp_sheet_value("jsonb", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_sheet_value"("p_values" "jsonb", "p_index" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select nullif(btrim(p_values ->> p_index), '');
$$;


--
-- Name: vmp_source_filters_valid("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_source_filters_valid"("p_filters" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select p_filters is null or (
    pg_catalog.jsonb_typeof(p_filters)='object'
    and not exists (
      select 1 from pg_catalog.jsonb_object_keys(p_filters) filter_key
      where filter_key<>all(array[
        'department','area_code','line','validation','first_month','owner',
        'frequency'
      ]::text[])
    )
    and (not (p_filters?'department') or (
      pg_catalog.jsonb_typeof(p_filters->'department')='string'
      and nullif(pg_catalog.btrim(p_filters->>'department'),'') is not null))
    and (not (p_filters?'area_code') or (
      pg_catalog.jsonb_typeof(p_filters->'area_code')='string'
      and nullif(pg_catalog.btrim(p_filters->>'area_code'),'') is not null))
    and (not (p_filters?'line') or (
      pg_catalog.jsonb_typeof(p_filters->'line')='string'
      and nullif(pg_catalog.btrim(p_filters->>'line'),'') is not null))
    and (not (p_filters?'validation') or (
      pg_catalog.jsonb_typeof(p_filters->'validation')='string'
      and p_filters->>'validation'=any(array[
        'all','validated','outside'
      ]::text[])))
    and (not (p_filters?'first_month') or (
      pg_catalog.jsonb_typeof(p_filters->'first_month')='string'
      and p_filters->>'first_month'=any(array[
        'all','missing','present'
      ]::text[])))
    and (not (p_filters?'owner') or (
      pg_catalog.jsonb_typeof(p_filters->'owner')='string'
      and ((p_filters->>'owner')=any(array[
             'all','assigned','unassigned'
           ]::text[])
        or (pg_catalog.left(p_filters->>'owner',6)='owner:'
          and nullif(pg_catalog.btrim(pg_catalog.substr(
            p_filters->>'owner',7)),'') is not null))))
    and (not (p_filters?'frequency') or (
      pg_catalog.jsonb_typeof(p_filters->'frequency')='string'
      and p_filters->>'frequency'=any(array[
        'all','lte12','gt12'
      ]::text[])))
  )
$$;


--
-- Name: vmp_source_object_matches_filters("public"."vmp_source_objects", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_source_object_matches_filters"("p_source" "public"."vmp_source_objects", "p_search" "text", "p_filters" "jsonb") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select
    (coalesce(btrim(p_search),'')='' or
      p_source.object_code ilike '%'||btrim(p_search)||'%' or
      p_source.object_name ilike '%'||btrim(p_search)||'%' or
      p_source.department ilike '%'||btrim(p_search)||'%' or
      p_source.area_code ilike '%'||btrim(p_search)||'%' or
      p_source.line ilike '%'||btrim(p_search)||'%' or
      p_source.owner_name ilike '%'||btrim(p_search)||'%' or
      p_source.report_class ilike '%'||btrim(p_search)||'%' or
      p_source.work_group ilike '%'||btrim(p_search)||'%' or
      p_source.note ilike '%'||btrim(p_search)||'%')
    and (not (coalesce(p_filters,'{}'::jsonb)?'department')
      or public.vmp_source_scope_key(p_source.department)=
         public.vmp_source_scope_key(p_filters->>'department'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'area_code')
      or public.vmp_source_scope_key(p_source.area_code)=
         public.vmp_source_scope_key(p_filters->>'area_code'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'line')
      or public.vmp_source_scope_key(p_source.line)=
         public.vmp_source_scope_key(p_filters->>'line'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'validation')
      or p_filters->>'validation'='all'
      or (p_filters->>'validation'='validated'
          and lower(btrim(coalesce(p_source.validate_flag,'')))='y')
      or (p_filters->>'validation'='outside'
          and lower(btrim(coalesce(p_source.validate_flag,'')))<>'y'))
    and (not (coalesce(p_filters,'{}'::jsonb)?'first_month')
      or p_filters->>'first_month'='all'
      or (p_filters->>'first_month'='missing'
          and p_source.first_month is null)
      or (p_filters->>'first_month'='present'
          and p_source.first_month is not null))
    and (not (coalesce(p_filters,'{}'::jsonb)?'owner')
      or p_filters->>'owner'='all'
      or (p_filters->>'owner'='assigned'
          and nullif(btrim(p_source.owner_name),'') is not null)
      or (p_filters->>'owner'='unassigned'
          and nullif(btrim(p_source.owner_name),'') is null)
      or (left(p_filters->>'owner',6)='owner:'
          and public.vmp_source_scope_key(p_source.owner_name)=
              public.vmp_source_scope_key(substring(
                p_filters->>'owner' from 7))))
    and (not (coalesce(p_filters,'{}'::jsonb)?'frequency')
      or p_filters->>'frequency'='all'
      or (p_filters->>'frequency'='lte12'
          and p_source.frequency_months is not null
          and p_source.frequency_months<=12)
      or (p_filters->>'frequency'='gt12'
          and p_source.frequency_months is not null
          and p_source.frequency_months>12))
$$;


--
-- Name: vmp_source_objects_page_path("uuid", "text", "text", "jsonb", "jsonb", integer, boolean, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_source_objects_page_path"("p_actor" "uuid", "p_object_kind" "text", "p_search" "text", "p_filters" "jsonb", "p_cursor" "jsonb", "p_limit" integer, "p_include_inactive" boolean, "p_object_id" "uuid") RETURNS TABLE("payload" "jsonb")
    LANGUAGE "sql" STABLE
    AS $_$
with actor as (
  select p_actor actor_id,public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), cursor_input as (
  select case when p_cursor is null then true
              when jsonb_typeof(p_cursor)='object'
               and jsonb_typeof(p_cursor->'object_code')='string'
               and jsonb_typeof(p_cursor->'id')='string'
               and (p_cursor->>'id') ~*
                   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then true else false end valid,
         case when p_cursor is not null
                and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'id')='string'
                and (p_cursor->>'id') ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (p_cursor->>'id')::uuid end cursor_id,
         case when p_cursor is not null and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'object_code')='string'
              then p_cursor->>'object_code' end cursor_code
), manager_authorized as (
  select source_object.*
  from actor
  join public.vmp_source_objects source_object
    on actor.role_name in ('admin','qa_manager')
), qa_authorized as (
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name='qa_staff'
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.owner_person_id=performer.id
  union
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name='qa_staff'
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_objects source_object
    on source_object.is_active is true
   and source_object.support_person_id=performer.id
), workshop_authorized as (
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name in ('workshop_manager','workshop_staff')
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=performer.id and grant_row.is_active
   and grant_row.line_key is null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select scoped_source.*
    from public.vmp_source_objects scoped_source
    where scoped_source.is_active is true
      and nullif(public.vmp_source_scope_key(scoped_source.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(scoped_source.area_code),'')
          is not null
      and public.vmp_source_scope_key(scoped_source.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(scoped_source.area_code)=
          grant_row.area_key
    offset 0
  ) source_object on true
  union
  select source_object.*
  from actor
  join public.vmp_performers performer
    on actor.role_name in ('workshop_manager','workshop_staff')
   and performer.user_id=actor.actor_id and performer.is_active
  join public.vmp_source_workshop_scope_grants grant_row
    on grant_row.performer_id=performer.id and grant_row.is_active
   and grant_row.line_key is not null
   and grant_row.valid_from<=transaction_timestamp()
   and (grant_row.expires_at is null
        or grant_row.expires_at>transaction_timestamp())
  join lateral (
    select scoped_source.*
    from public.vmp_source_objects scoped_source
    where scoped_source.is_active is true
      and nullif(public.vmp_source_scope_key(scoped_source.department),'')
          is not null
      and nullif(public.vmp_source_scope_key(scoped_source.area_code),'')
          is not null
      and nullif(public.vmp_source_scope_key(scoped_source.line),'') is not null
      and public.vmp_source_scope_key(scoped_source.department)=
          grant_row.department_key
      and public.vmp_source_scope_key(scoped_source.area_code)=
          grant_row.area_key
      and public.vmp_source_scope_key(scoped_source.line)=grant_row.line_key
    offset 0
  ) source_object on true
), authorized as (
  select * from manager_authorized
  union all
  select * from qa_authorized
  union all
  select * from workshop_authorized
), filtered as (
  select authorized.*
  from authorized cross join actor
  where (authorized.is_active
         or (actor.role_name in ('admin','qa_manager')
             and coalesce(p_include_inactive,false)))
    and (p_object_kind is null or authorized.object_kind=p_object_kind)
    and public.vmp_source_object_matches_filters(
          authorized,p_search,p_filters)
    and (p_object_id is null or authorized.id=p_object_id)
), cursor_status as (
  select cursor_input.*,
         p_cursor is null or exists (
           select 1 from filtered
           where filtered.object_code=cursor_input.cursor_code
             and filtered.id=cursor_input.cursor_id
         ) present
  from cursor_input
), paged as (
  select filtered.*
  from filtered cross join cursor_status
  where p_cursor is null
     or (filtered.object_code,filtered.id)>
        (cursor_status.cursor_code,cursor_status.cursor_id)
), limited as (
  select paged.* from paged order by object_code,id
  limit case when p_limit between 1 and 100 then p_limit+1 else 0 end
), returned as (
  select limited.* from limited order by object_code,id
  limit case when p_limit between 1 and 100 then p_limit else 0 end
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  when p_limit is null or p_limit<1 or p_limit>100 then jsonb_build_object(
    'ok',false,'error_code','INVALID_LIMIT','error','Giới hạn phải từ 1 đến 100')
  when not public.vmp_source_filters_valid(p_filters) then
    jsonb_build_object(
      'ok',false,'error_code','INVALID_FILTERS','error','Bộ lọc phải là JSON object')
  when not cursor_status.valid then jsonb_build_object(
    'ok',false,'error_code','INVALID_CURSOR','error','Con trỏ không hợp lệ')
  when not cursor_status.present then jsonb_build_object(
    'ok',false,'error_code','CURSOR_EXPIRED','error','Con trỏ không còn hiệu lực')
  else jsonb_build_object(
    'ok',true,
    'rows',coalesce((select jsonb_agg(to_jsonb(returned) order by object_code,id)
                     from returned),'[]'::jsonb),
    'authorized_total',(select count(*) from filtered),
    'next_cursor',case when (select count(*) from limited)>p_limit then (
      select jsonb_build_object('object_code',object_code,'id',id)
      from returned order by object_code desc,id desc limit 1
    ) else null end
  )
end payload
from actor cross join cursor_status
$_$;


--
-- Name: vmp_source_qa_candidates_page_path("uuid", "text", "jsonb", integer, "uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_source_qa_candidates_page_path"("p_actor" "uuid", "p_search" "text", "p_cursor" "jsonb", "p_limit" integer, "p_include_ids" "uuid"[]) RETURNS TABLE("payload" "jsonb")
    LANGUAGE "sql" STABLE
    AS $_$
with actor as (
  select public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), cursor_input as (
  select case when p_cursor is null then true
              when jsonb_typeof(p_cursor)='object'
               and jsonb_typeof(p_cursor->'normalized_full_name')='string'
               and jsonb_typeof(p_cursor->'person_id')='string'
               and (p_cursor->>'person_id') ~*
                   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then true else false end valid,
         case when p_cursor is not null
                and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'person_id')='string'
                and (p_cursor->>'person_id') ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (p_cursor->>'person_id')::uuid end cursor_id,
         case when p_cursor is not null and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'normalized_full_name')='string'
              then p_cursor->>'normalized_full_name' end cursor_name
), candidate as (
  select performer.id person_id,performer.performer_name,
         performer.normalized_full_name,performer.email,performer.department,
         public.vmp_business_role(performer.user_id) role_name
  from public.vmp_performers performer
  join public.profiles profile on profile.id=performer.user_id
  where performer.is_active is true and performer.user_id is not null
    and performer.access_class in ('qa_manager','qa_progress_editor')
    and coalesce(profile.is_active,true)
    and public.vmp_business_role(profile.id) in ('qa_staff','qa_manager')
    and (coalesce(btrim(p_search),'')=''
         or performer.normalized_full_name like
              public.vmp_source_scope_key(p_search)||'%')
), cursor_status as (
  select cursor_input.*,
         p_cursor is null or exists (
           select 1 from candidate
           where candidate.normalized_full_name=cursor_input.cursor_name
             and candidate.person_id=cursor_input.cursor_id
         ) present
  from cursor_input
), paged as (
  select candidate.* from candidate cross join cursor_status
  where p_cursor is null
     or (candidate.normalized_full_name,candidate.person_id)>
        (cursor_status.cursor_name,cursor_status.cursor_id)
), limited as (
  select paged.* from paged
  order by normalized_full_name,person_id
  limit case when p_limit between 1 and 50 then p_limit+1 else 0 end
), returned as (
  select limited.* from limited order by normalized_full_name,person_id
  limit case when p_limit between 1 and 50 then p_limit else 0 end
), included as (
  select requested.person_id,performer.performer_name,
         performer.normalized_full_name,performer.email,performer.department,
         coalesce(
           public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager'),
           false
         ) eligible,
         case
           when performer.id is null then 'PERSON_NOT_FOUND'
           when not performer.is_active then 'PERFORMER_INACTIVE'
           when performer.user_id is null then 'ACCOUNT_UNLINKED'
           when not coalesce(profile.is_active,false) then 'ACCOUNT_DISABLED'
           when public.vmp_business_role(performer.user_id)
                not in ('qa_staff','qa_manager')
             or public.vmp_business_role(performer.user_id) is null
             then 'ROLE_INELIGIBLE'
           else null
         end ineligibility_reason
  from (
    select distinct unnest(coalesce(p_include_ids,'{}'::uuid[])) person_id
  ) requested
  left join public.vmp_performers performer on performer.id=requested.person_id
  left join public.profiles profile on profile.id=performer.user_id
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  when actor.role_name not in ('admin','qa_manager') then jsonb_build_object(
    'ok',false,'error_code','FORBIDDEN','error','Không có quyền chọn QA phụ trách')
  when p_limit is null or p_limit<1 or p_limit>50 then jsonb_build_object(
    'ok',false,'error_code','INVALID_LIMIT','error','Giới hạn phải từ 1 đến 50')
  when not cursor_status.valid then jsonb_build_object(
    'ok',false,'error_code','INVALID_CURSOR','error','Con trỏ không hợp lệ')
  when not cursor_status.present then jsonb_build_object(
    'ok',false,'error_code','CURSOR_EXPIRED','error','Con trỏ không còn hiệu lực')
  else jsonb_build_object(
    'ok',true,
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'person_id',person_id,'performer_name',performer_name,
      'normalized_full_name',normalized_full_name,'email',email,
      'department',department,'role_name',role_name
    ) order by normalized_full_name,person_id) from returned),'[]'::jsonb),
    'included_current',coalesce((select jsonb_agg(to_jsonb(included)
      order by included.normalized_full_name nulls last,included.person_id)
      from included),'[]'::jsonb),
    'authorized_total',(select count(*) from candidate),
    'next_cursor',case when (select count(*) from limited)>p_limit then (
      select jsonb_build_object(
        'normalized_full_name',normalized_full_name,'person_id',person_id)
      from returned order by normalized_full_name desc,person_id desc limit 1
    ) else null end
  )
end payload
from actor cross join cursor_status
$_$;


--
-- Name: vmp_source_scope_key("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_source_scope_key"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select pg_catalog.lower(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(p_value, '[[:space:]]+', ' ', 'g')
    )
  )
$$;


--
-- Name: vmp_source_workshop_scope_match("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_source_workshop_scope_match"("p_person_id" "uuid", "p_source_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.vmp_source_objects source_object
    join public.vmp_source_workshop_scope_grants grant_row
      on grant_row.performer_id=p_person_id
     and grant_row.is_active
     and grant_row.valid_from<=transaction_timestamp()
     and (grant_row.expires_at is null
          or grant_row.expires_at>transaction_timestamp())
     and source_object.department is not null
     and source_object.area_code is not null
     and public.vmp_source_scope_key(source_object.department)=
         grant_row.department_key
     and public.vmp_source_scope_key(source_object.area_code)=grant_row.area_key
     and (grant_row.line_key is null or (
       source_object.line is not null
       and public.vmp_source_scope_key(source_object.line)=grant_row.line_key
     ))
    where source_object.id=p_source_id and source_object.is_active
  )
$$;


--
-- Name: vmp_strip_catalog_pending_access_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_strip_catalog_pending_access_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.old_data:=coalesce(new.old_data,'{}'::jsonb)
    -'owner_person_id'-'support_person_id'-'owner_name'-'support_name';
  new.new_data:=coalesce(new.new_data,'{}'::jsonb)
    -'owner_person_id'-'support_person_id'-'owner_name'-'support_name';
  return new;
end
$$;


--
-- Name: vmp_sync_item_assignments_from_performer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_sync_item_assignments_from_performer"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  update public.vmp_item_assignments assignment
  set user_id = new.user_id,
      employee_code = new.employee_code,
      staff_name = new.performer_name,
      unresolved_reason = case
        when new.user_id is null then 'account_unlinked'
        else null
      end
  where assignment.performer_id = new.id
    and (
      assignment.user_id is distinct from new.user_id
      or assignment.employee_code is distinct from new.employee_code
      or assignment.staff_name is distinct from new.performer_name
      or assignment.unresolved_reason is distinct from case
        when new.user_id is null then 'account_unlinked'
        else null
      end
    );
  return new;
end
$$;


--
-- Name: vmp_sync_status_text(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_sync_status_text"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Chỉ can thiệp khi enum ĐỔI và chữ tương ứng KHÔNG được ghi trong
  -- cùng lệnh update. Như vậy đường ghi nào muốn giữ chữ riêng vẫn giữ được.
  if new.status_protocol is distinct from old.status_protocol
     and new.status_protocol_text is not distinct from old.status_protocol_text then
    new.status_protocol_text := public.vmp_phase_status_text(new.status_protocol);
  end if;

  if new.status_validation is distinct from old.status_validation
     and new.status_validation_text is not distinct from old.status_validation_text then
    new.status_validation_text := public.vmp_phase_status_text(new.status_validation);
  end if;

  if new.status_report is distinct from old.status_report
     and new.status_report_text is not distinct from old.status_report_text then
    new.status_report_text := public.vmp_phase_status_text(new.status_report);
  end if;

  if new.status_vmp is distinct from old.status_vmp
     and new.status_vmp_text is not distinct from old.status_vmp_text then
    new.status_vmp_text := public.vmp_phase_status_text(new.status_vmp);
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION "vmp_sync_status_text"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_sync_status_text"() IS 'Giữ status_*_text theo kịp enum status_*. Không ghi đè chữ do người dùng tự nhập trong cùng lệnh update.';


--
-- Name: vmp_tinh_moc_thoi_gian(integer, integer, integer, integer, "text", numeric, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_tinh_moc_thoi_gian"("p_year" integer, "p_first_month" integer, "p_freq_months" integer, "p_lan_thu" integer, "p_report_class" "text", "p_workdays" numeric, "p_validation_type" "text") RETURNS TABLE("deadline_protocol" "date", "deadline_validation" "date", "deadline_report" "date", "deadline_vmp" "date", "thieu" "text"[])
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  K_REPORT constant jsonb := '{"không phụ thuộc":2,"hóa lý":2,
                               "nhiễm khuẩn":7,"vô khuẩn":16}'::jsonb;
  v_freq  integer := coalesce(nullif(p_freq_months, 0), 12);
  v_tm    integer;
  v_month integer;
  v_yr    integer;
  v_nbc   integer;
begin
  deadline_protocol := null; deadline_validation := null;
  deadline_report := null;   deadline_vmp := null;
  thieu := '{}';

  if p_first_month is null then
    thieu := array_append(thieu, 'Tháng thẩm định đầu tiên');
    return next;
    return;
  end if;

  v_tm    := p_first_month + (p_lan_thu - 1) * v_freq;
  v_month := ((v_tm - 1) % 12) + 1;
  v_yr    := p_year + ((v_tm - 1) / 12);

  deadline_vmp    := (make_date(v_yr, v_month, 1) + interval '1 month' - interval '1 day')::date;
  deadline_report := deadline_vmp - 5;

  -- IQ và OQ luôn 2 ngày, không phụ thuộc phân loại báo cáo.
  if p_validation_type in ('IQ', 'OQ') then
    v_nbc := 2;
  else
    v_nbc := (K_REPORT ->> lower(coalesce(p_report_class, '')))::integer;
  end if;

  if v_nbc is null then
    thieu := array_append(thieu, 'Phân loại báo cáo');
    return next;
    return;
  end if;

  deadline_validation := deadline_report - v_nbc;

  if p_workdays is null then
    thieu := array_append(thieu, 'Số ngày công thẩm định thực tế');
    return next;
    return;
  end if;

  deadline_protocol := deadline_validation - p_workdays::integer - 60;
  return next;
end
$$;


--
-- Name: vmp_touch_authorization_revision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_touch_authorization_revision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_rows integer;
begin
  if current_setting('vmp.authorization_revision_touched', true) is distinct from '1' then
    perform set_config('vmp.authorization_revision_touched', '1', true);
    update public.vmp_authorization_revision
    set revision = revision + 1,
        updated_at = transaction_timestamp()
    where singleton;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception using errcode = 'check_violation',
        message = 'SOURCE_ACCESS_AUTHORIZATION_REVISION_SINGLETON';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;


--
-- Name: vmp_unfiltered_security_definer_item_readers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_unfiltered_security_definer_item_readers"() RETURNS TABLE("signature" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with allowed(signature,reason) as (
    values
      ('audit_plan_item_changes()','owner trigger audit; no browser result'),
      ('audit_plan_item_changes_v2()','owner trigger audit; no browser result'),
      ('ly_do_khong_sua_duoc(text,uuid)','legacy field-rights helper'),
      ('rpc_alert_context(text,integer)',
       'service alert reader through the rights-filtered visible-item helper'),
      ('vmp_item_rights(uuid,text)','target-item rights resolver'),
      ('rpc_my_editable_progress_rights()','rights-filtered browser result'),
      ('rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
       'owner-only implementation behind the current rights writer'),
      ('rpc_item_permission_preflight()','manager-only completeness check'),
      ('rpc_luat_xem()','manager-only policy metadata'),
      ('rpc_apply_assignments(boolean)','service assignment writer'),
      ('rpc_apply_sheet_sync(text,text,jsonb)','service sync writer'),
      ('rpc_create_plan_item(text,text,integer,integer,jsonb)',
       'manager writer with Source-first locks'),
      ('rpc_delete_plan_item(text,text)','manager soft-delete writer'),
      ('rpc_generate_timeline(integer,boolean)','manager timeline writer'),
      ('rpc_recalc_criticality(boolean)','manager criticality writer'),
      ('rpc_reconcile_orphan_objects(text[])','service repair writer'),
      ('rpc_refresh_computed_status()','service status writer'),
      ('rpc_refresh_source_item_assignments()','service projection repair'),
      ('rpc_register_alert(text,text,text,text,text,text,text)',
       'service alert writer'),
      ('rpc_resolve_missing(text,text,text)','manager missing-item writer'),
      ('rpc_rollback_vmp_sheet_sync(uuid)','service rollback writer'),
      ('rpc_set_item_assignment(uuid,text,text,text,text)',
       'legacy assignment writer'),
      ('rpc_set_item_performer(text,text)','legacy performer writer'),
      ('rpc_item_assignments(text,uuid)','manager assignment reader'),
      ('rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)',
       'manager assignment writer'),
      ('rpc_set_item_performer_by_id(text,uuid,text)',
       'manager performer writer through its reviewed owner delegate'),
      ('rpc_upsert_source_object(text,text,jsonb)','service Source writer'),
      ('rpc_set_item_state(text,text,text)','manager state writer'),
      ('rpc_sync_vmp_sheet_snapshot(text,text,text,jsonb,jsonb)',
       'service snapshot writer'),
      ('rpc_sync_vmp_sheet_snapshot_with_extras(text,text,text,jsonb,jsonb)',
       'service extended snapshot writer'),
      ('rpc_update_progress(text,jsonb,text,jsonb,integer)',
       'rights-filtered browser writer'),
      ('rpc_active_rules()','manager-only catalog rules reader'),
      ('rpc_apply_catalog_change(uuid,text,integer)',
       'manager catalog writer with Source-first locks'),
      ('rpc_preview_catalog_change(uuid)','manager-only pending preview'),
      ('rpc_preview_item_rights(uuid,text)',
       'manager-only explicit item-rights preview'),
      ('rpc_apply_sheet_sync__source_impl_20260828(text,text,jsonb)',
       'owner-only renamed sync implementation'),
      ('rpc_rollback_vmp_sheet_sync__source_impl_20260828(uuid)',
       'owner-only renamed rollback implementation'),
      ('rpc_sync_vmp_sheet_snapshot__source_impl_20260828(text,text,text,jsonb,jsonb)',
       'owner-only renamed snapshot implementation'),
      ('vmp_exact_active_source_for_item(text)',
       'owner-only exact Source relation resolver'),
      ('vmp_guard_active_source_rekey()','owner trigger relation guard'),
      ('vmp_guard_plan_master_rekey()','owner trigger master relation guard'),
      ('vmp_reconcile_source_qa_projection(uuid)',
       'owner-only projection reconciler'),
      ('rpc_cleanup_orphan_source_assignment_resolutions(text)',
       'service assignment repair writer'),
      ('rpc_commit_catalog_import(uuid,text)',
       'manager import writer with Source-first locks'),
      ('rpc_delete_source_object(text,text,text)','service Source writer'),
      ('rpc_export_source_objects(text,text,jsonb,jsonb,integer)',
       'rights-filtered audited browser export'),
      ('rpc_link_item_permission_account(uuid,uuid,text,integer)',
       'manager account-link writer'),
      ('rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)',
       'rights-filtered browser Source reader'),
      ('rpc_resolve_source_item_assignment(uuid,uuid,text)',
       'service assignment resolution writer'),
      ('rpc_save_catalog_object(text,text,jsonb,text,integer)',
       'manager Source writer with atomic access projection'),
      ('rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)',
       'manager coverage writer with reason and version checks'),
      ('rpc_source_field_suggestions(text,text,text,jsonb,integer)',
       'manager-only bounded Source suggestions'),
      ('rpc_source_object_facets(text,jsonb)',
       'rights-filtered bounded Source facets'),
      ('rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)',
       'manager-only coverage tuple reader'),
      ('rpc_stage_catalog_import(text,text,text,text,jsonb)',
       'manager-only import staging writer'),
      ('vmp_can_view_source_object(uuid,uuid)',
       'current-actor exact Source predicate with alternate-UID defense'),
      ('vmp_enforce_active_plan_source_relation()',
       'owner trigger enforcing exact active Source relation'),
      ('vmp_lock_source_plan_relations(text[])',
       'owner-only global Source-first lock helper'),
      ('vmp_set_item_assignment_unhardened(uuid,text,text,text,text)',
       'owner-only implementation behind reviewed assignment writers'),
      ('vmp_source_workshop_scope_match(uuid,uuid)',
       'private workshop Source predicate'),
      ('vmp_sync_item_assignments_from_performer()',
       'owner trigger synchronization writer'),
      ('vmp_upsert_source_object_before_person_id(text,text,jsonb)',
       'owner-only legacy Source writer implementation'),
      ('rpc_get_vmp_dashboard(integer,boolean,boolean)',
       'rights-filtered visible-Source dashboard'),
      ('rpc_get_vmp_watermark(integer)',
       'rights-filtered visible-Source cache watermark'),
      ('rpc_source_warnings(integer)',
       'rights-filtered visible-Source warnings'),
      ('vmp_visible_plan_items()',
       'rights-filtered current-actor item relation'),
      ('vmp_unfiltered_security_definer_item_readers()',
       'service-only executable inventory; self-reference is audited')
  ), candidates as (
    select case
      when procedure.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
        then format('%s(%s)',left(procedure.proname,
          -length('__five_role_impl_20260824')),
          replace(pg_catalog.oidvectortypes(procedure.proargtypes),', ',','))
      else procedure.oid::regprocedure::text
    end signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.prosecdef
      and (pg_get_functiondef(procedure.oid) ilike '%vmp_source_objects%'
        or pg_get_functiondef(procedure.oid) ilike '%vmp_plan_items%'
        or pg_get_functiondef(procedure.oid) ilike '%vmp_item_assignments%')
  )
  select candidate.signature
  from candidates candidate
  left join allowed on allowed.signature=candidate.signature
  where allowed.signature is null
  order by candidate.signature
$$;


--
-- Name: vmp_update_planned_deadlines_impl("text", "jsonb", "text", integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_update_planned_deadlines_impl"("p_validation_code" "text", "p_deadlines" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_confirmed" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_key text;
  v_value jsonb;
  v_text text;
  v_parsed date;
  v_protocol date;
  v_validation date;
  v_report date;
  v_vmp date;
  v_before public.vmp_plan_items%rowtype;
  v_after public.vmp_plan_items%rowtype;
  v_before_json jsonb;
  v_after_json jsonb;
  v_old_deadlines jsonb;
  v_new_deadlines jsonb;
  v_changed_fields text[]:='{}'::text[];
  v_expected_audit_fields text[];
  v_actual_audit_fields text[];
  v_audit_ids uuid[];
  v_audit public.audit_logs%rowtype;
  v_audit_count integer;
  v_row_count integer;
  v_actor uuid:=auth.uid();
  v_effective_role text:=case when coalesce(auth.role(),'')='service_role'
    then 'service_role' else public.vmp_business_role(auth.uid()) end;
begin
  if p_deadlines is null or jsonb_typeof(p_deadlines)<>'object'
     or (select count(*) from jsonb_object_keys(p_deadlines))<>4
     or not (p_deadlines?'deadline_protocol'
         and p_deadlines?'deadline_validation'
         and p_deadlines?'deadline_report'
         and p_deadlines?'deadline_vmp') then
    return jsonb_build_object('ok',false,
      'error_code','INVALID_DEADLINE_PAYLOAD',
      'error','Payload deadline phải chứa đúng bốn ngày kế hoạch');
  end if;

  foreach v_key in array array[
    'deadline_protocol','deadline_validation','deadline_report','deadline_vmp'
  ] loop
    v_value:=p_deadlines->v_key;
    if v_value='null'::jsonb then
      continue;
    end if;
    if jsonb_typeof(v_value)<>'string' then
      return jsonb_build_object('ok',false,
        'error_code','INVALID_DEADLINE_PAYLOAD',
        'error','Deadline phải là ngày ISO YYYY-MM-DD hoặc null');
    end if;
    v_text:=p_deadlines->>v_key;
    if v_text!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object('ok',false,
        'error_code','INVALID_DEADLINE_PAYLOAD',
        'error','Deadline phải là ngày ISO YYYY-MM-DD hoặc null');
    end if;
    begin
      v_parsed:=v_text::date;
      if to_char(v_parsed,'YYYY-MM-DD') is distinct from v_text then
        return jsonb_build_object('ok',false,
          'error_code','INVALID_DEADLINE_PAYLOAD',
          'error','Deadline phải là ngày ISO YYYY-MM-DD hoặc null');
      end if;
    exception when others then
      return jsonb_build_object('ok',false,
        'error_code','INVALID_DEADLINE_PAYLOAD',
        'error','Deadline phải là ngày ISO YYYY-MM-DD hoặc null');
    end;
  end loop;

  v_protocol:=(p_deadlines->>'deadline_protocol')::date;
  v_validation:=(p_deadlines->>'deadline_validation')::date;
  v_report:=(p_deadlines->>'deadline_report')::date;
  v_vmp:=(p_deadlines->>'deadline_vmp')::date;

  if p_expected_version is null then
    return jsonb_build_object('ok',false,
      'error_code','EXPECTED_REVISION_REQUIRED',
      'error','Thiếu phiên bản hạng mục đã tải');
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,
      'error_code','REASON_REQUIRED',
      'error','Phải nhập lý do điều chỉnh deadline kế hoạch');
  end if;
  if p_confirmed is not true then
    return jsonb_build_object('ok',false,
      'error_code','CONFIRMATION_REQUIRED',
      'error','Phải xác nhận chỉ đổi bốn deadline kế hoạch');
  end if;

  select * into v_before from public.vmp_plan_items
  where validation_code=p_validation_code for update;
  if not found then
    return jsonb_build_object('ok',false,
      'error_code','ITEM_NOT_FOUND','error','Không tìm thấy hạng mục');
  end if;
  if v_before.is_active is distinct from true
     or v_before.item_state is distinct from 'active' then
    return jsonb_build_object('ok',false,
      'error_code','ITEM_STATE_INACTIVE',
      'error','Hạng mục không ở trạng thái hoạt động');
  end if;
  if v_before.version is distinct from p_expected_version then
    return jsonb_build_object(
      'ok',false,'error_code','VERSION_CONFLICT',
      'error','Hạng mục đã đổi sau khi tải dữ liệu',
      'validation_code',p_validation_code,
      'expected_version',p_expected_version,
      'current_version',v_before.version,
      'requires_reload',true);
  end if;

  if (v_before.deadline_protocol is not null and v_protocol is null)
     or (v_before.deadline_validation is not null and v_validation is null)
     or (v_before.deadline_report is not null and v_report is null)
     or (v_before.deadline_vmp is not null and v_vmp is null) then
    return jsonb_build_object('ok',false,
      'error_code','DEADLINE_ERASURE_FORBIDDEN',
      'error','Không được xoá deadline kế hoạch đã có');
  end if;

  if (v_protocol is not null and v_validation is not null and v_protocol>v_validation)
     or (v_protocol is not null and v_report is not null and v_protocol>v_report)
     or (v_protocol is not null and v_vmp is not null and v_protocol>v_vmp)
     or (v_validation is not null and v_report is not null and v_validation>v_report)
     or (v_validation is not null and v_vmp is not null and v_validation>v_vmp)
     or (v_report is not null and v_vmp is not null and v_report>v_vmp) then
    return jsonb_build_object('ok',false,
      'error_code','DEADLINE_ORDER_INVALID',
      'error','Bốn deadline kế hoạch phải theo đúng thứ tự');
  end if;

  if v_before.deadline_protocol is not distinct from v_protocol
     and v_before.deadline_validation is not distinct from v_validation
     and v_before.deadline_report is not distinct from v_report
     and v_before.deadline_vmp is not distinct from v_vmp then
    return jsonb_build_object('ok',false,
      'error_code','NO_ACTIONABLE_CHANGE','error','Không có deadline nào thay đổi');
  end if;

  if v_before.deadline_protocol is distinct from v_protocol then
    v_changed_fields:=array_append(v_changed_fields,'deadline_protocol');
  end if;
  if v_before.deadline_validation is distinct from v_validation then
    v_changed_fields:=array_append(v_changed_fields,'deadline_validation');
  end if;
  if v_before.deadline_report is distinct from v_report then
    v_changed_fields:=array_append(v_changed_fields,'deadline_report');
  end if;
  if v_before.deadline_vmp is distinct from v_vmp then
    v_changed_fields:=array_append(v_changed_fields,'deadline_vmp');
  end if;

  v_before_json:=to_jsonb(v_before);
  v_old_deadlines:=jsonb_build_object(
    'deadline_protocol',v_before.deadline_protocol,
    'deadline_validation',v_before.deadline_validation,
    'deadline_report',v_before.deadline_report,
    'deadline_vmp',v_before.deadline_vmp);
  v_new_deadlines:=jsonb_build_object(
    'deadline_protocol',v_protocol,
    'deadline_validation',v_validation,
    'deadline_report',v_report,
    'deadline_vmp',v_vmp);
  select coalesce(array_agg(id),'{}'::uuid[]) into v_audit_ids
  from public.audit_logs where validation_code=p_validation_code;

  perform set_config('app.audit_source','manual_planned_deadline_edit',true);
  perform set_config('app.audit_reason',btrim(p_reason),true);

  begin
    update public.vmp_plan_items set
      deadline_protocol=v_protocol,
      deadline_validation=v_validation,
      deadline_report=v_report,
      deadline_vmp=v_vmp,
      updated_by=v_actor,
      updated_at=clock_timestamp()
    where validation_code=p_validation_code and version=p_expected_version;
    get diagnostics v_row_count=row_count;
    if v_row_count<>1 then
      raise exception using errcode='P2001',message='MANUAL_UPDATE_ROWCOUNT';
    end if;

    select * into v_after from public.vmp_plan_items
    where validation_code=p_validation_code;
    v_after_json:=to_jsonb(v_after);
    if v_after.deadline_protocol is distinct from v_protocol
       or v_after.deadline_validation is distinct from v_validation
       or v_after.deadline_report is distinct from v_report
       or v_after.deadline_vmp is distinct from v_vmp
       or v_after.version is distinct from p_expected_version+1
       or v_after.updated_by is distinct from v_actor
       or v_after.updated_at is null
       or (v_after_json-array['deadline_protocol','deadline_validation',
            'deadline_report','deadline_vmp','version','updated_at','updated_by'])
          is distinct from
          (v_before_json-array['deadline_protocol','deadline_validation',
            'deadline_report','deadline_vmp','version','updated_at','updated_by']) then
      raise exception using errcode='P2001',message='MANUAL_UPDATE_POSTSTATE';
    end if;

    select count(*) into v_audit_count from public.audit_logs
    where validation_code=p_validation_code;
    if v_audit_count<>cardinality(v_audit_ids)+1 then
      raise exception using errcode='P2001',message='MANUAL_AUDIT_COUNT';
    end if;
    select * into strict v_audit from public.audit_logs
    where validation_code=p_validation_code and not (id=any(v_audit_ids));

    if v_audit.user_id is distinct from v_actor
       or v_audit.effective_business_role is distinct from v_effective_role then
      update public.audit_logs set
        user_id=v_actor,
        effective_business_role=v_effective_role
      where id=v_audit.id;
      select * into strict v_audit from public.audit_logs where id=v_audit.id;
    end if;

    select coalesce(array_agg(field order by field),'{}'::text[])
    into v_expected_audit_fields from unnest(v_changed_fields) field;
    select coalesce(array_agg(field order by field),'{}'::text[])
    into v_actual_audit_fields from unnest(v_audit.changed_fields) field;
    if v_audit.user_id is distinct from v_actor
       or v_audit.action::text is distinct from 'DEADLINE_CHANGE'
       or v_audit.table_name is distinct from 'vmp_plan_items'
       or v_audit.record_id is distinct from v_before.id
       or v_audit.validation_code is distinct from p_validation_code
       or v_audit.change_reason is distinct from btrim(p_reason)
       or v_audit.source is distinct from 'manual_planned_deadline_edit'
       or v_audit.effective_business_role is distinct from v_effective_role
       or v_audit.old_data is distinct from v_before_json
       or v_audit.new_data is distinct from v_after_json
       or v_actual_audit_fields is distinct from v_expected_audit_fields then
      raise exception using errcode='P2001',message='MANUAL_AUDIT_POSTSTATE';
    end if;

    return jsonb_build_object(
      'ok',true,
      'validation_code',p_validation_code,
      'old_deadlines',v_old_deadlines,
      'new_deadlines',v_new_deadlines,
      'changed_fields',to_jsonb(v_changed_fields),
      'previous_version',p_expected_version,
      'current_version',v_after.version,
      'actor_id',v_actor,
      'effective_role',v_effective_role,
      'reason',btrim(p_reason),
      'protected_fields_preserved',true);
  exception when sqlstate 'P2001' then
    return jsonb_build_object('ok',false,
      'error_code','WRITE_MISMATCH',
      'error','Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác');
  end;
end
$_$;


--
-- Name: FUNCTION "vmp_update_planned_deadlines_impl"("p_validation_code" "text", "p_deadlines" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_confirmed" boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."vmp_update_planned_deadlines_impl"("p_validation_code" "text", "p_deadlines" "jsonb", "p_reason" "text", "p_expected_version" integer, "p_confirmed" boolean) IS 'Owner-only SECURITY INVOKER implementation for rpc_update_planned_deadlines.';


--
-- Name: vmp_upsert_item_permission_staff_before_focused_enforcement("uuid", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_upsert_item_permission_staff_before_focused_enforcement"("p_person_id" "uuid", "p_patch" "jsonb", "p_reason" "text", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_old public.vmp_performers%rowtype;
  v_new public.vmp_performers%rowtype;
  v_person_id uuid := p_person_id;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_bad_fields text[];
  v_full_name text;
  v_employee_code text;
  v_department text;
  v_access_class text;
  v_email text;
  v_user_id uuid;
  v_departments text[];
  v_factories uuid[];
  v_areas uuid[];
  v_lines uuid[];
  v_legacy_areas text[];
  v_is_active boolean;
  v_email_sent boolean;
  v_requires_scope boolean;
  v_version integer;
begin
  select role::text into v_actor_role from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and public.vmp_business_role(v_actor) is distinct from 'admin'
      and public.vmp_business_role(v_actor) is distinct from 'qa_manager' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin và Quản lý QA được sửa hồ sơ trong danh bạ nhân sự');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do thay đổi');
  end if;

  select array_agg(key order by key) into v_bad_fields
  from jsonb_object_keys(v_patch) key
  where key <> all(array[
    'full_name', 'employee_code', 'department', 'access_class', 'email',
    'scope_departments', 'scope_factory_ids', 'scope_area_ids',
    'scope_line_ids', 'is_active', 'email_sent_confirmed'
  ]::text[]);
  if v_bad_fields is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PATCH_FIELD_NOT_ALLOWED',
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad_fields, ', '));
  end if;

  if v_person_id is null then
    if p_expected_version is distinct from 0 then
      return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
        'error', 'Hồ sơ mới phải có expected_version = 0', 'current_version', 0);
    end if;
  else
    select * into v_old from public.vmp_performers
    where id = v_person_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'PERSON_NOT_FOUND',
        'error', 'Không tìm thấy nhân viên cần sửa');
    end if;
    if p_expected_version is distinct from v_old.version then
      return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
        'error', 'Hồ sơ đã được cập nhật ở phiên khác',
        'current_version', v_old.version);
    end if;
  end if;

  v_full_name := case when v_patch ? 'full_name'
    then nullif(btrim(v_patch->>'full_name'), '') else v_old.performer_name end;
  v_employee_code := case when v_patch ? 'employee_code'
    then nullif(btrim(v_patch->>'employee_code'), '') else v_old.employee_code end;
  v_department := case when v_patch ? 'department'
    then lower(nullif(btrim(v_patch->>'department'), '')) else v_old.department end;
  v_access_class := case when v_patch ? 'access_class'
    then nullif(btrim(v_patch->>'access_class'), '') else v_old.access_class end;
  v_email := case when v_patch ? 'email'
    then lower(nullif(btrim(v_patch->>'email'), '')) else v_old.email end;
  v_departments := case when v_patch ? 'scope_departments'
    then public.vmp_jsonb_text_array(v_patch, 'scope_departments')
    else coalesce(v_old.scope_departments, '{}'::text[]) end;
  v_factories := case when v_patch ? 'scope_factory_ids'
    then public.vmp_jsonb_uuid_array(v_patch, 'scope_factory_ids')
    else coalesce(v_old.scope_factory_ids, '{}'::uuid[]) end;
  v_areas := case when v_patch ? 'scope_area_ids'
    then public.vmp_jsonb_uuid_array(v_patch, 'scope_area_ids')
    else coalesce(v_old.scope_area_ids, '{}'::uuid[]) end;
  v_lines := case when v_patch ? 'scope_line_ids'
    then public.vmp_jsonb_uuid_array(v_patch, 'scope_line_ids')
    else coalesce(v_old.scope_line_ids, '{}'::uuid[]) end;
  v_is_active := case when v_patch ? 'is_active'
    then (v_patch->>'is_active')::boolean else coalesce(v_old.is_active, true) end;
  v_email_sent := case when v_patch ? 'email_sent_confirmed'
    then (v_patch->>'email_sent_confirmed')::boolean
    else coalesce(v_old.email_sent_confirmed, false) end;

  if p_person_id is not null and v_old.user_id is not null and (
    (v_patch ? 'department' and v_department is distinct from v_old.department)
    or (v_patch ? 'access_class' and v_access_class is distinct from v_old.access_class)
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'ACCOUNT_RELINK_REQUIRED',
      'error', 'Phải gỡ tài khoản trước khi đổi bộ phận hoặc phân loại quyền');
  end if;
  if p_person_id is not null
      and v_old.user_id is not null
      and v_old.is_active
      and not v_is_active then
    return jsonb_build_object('ok', false,
      'error_code', 'ACCOUNT_UNLINK_REQUIRED',
      'error', 'Phải gỡ tài khoản trước khi ngừng hoạt động hồ sơ');
  end if;
  if v_full_name is null then
    return jsonb_build_object('ok', false, 'error_code', 'FULL_NAME_REQUIRED',
      'error', 'Phải nhập Họ và tên');
  end if;
  if v_email is not null
      and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_EMAIL',
      'error', 'Email không đúng định dạng: ' || v_email);
  end if;
  if v_access_class is not null and v_access_class not in (
    'view_only', 'qa_progress_editor', 'qa_manager',
    'workshop_staff', 'equipment_manager', 'equipment_scheduler'
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_ACCESS_CLASS',
      'error', 'Phân loại quyền không hợp lệ');
  end if;
  if v_access_class in ('qa_progress_editor', 'qa_manager')
      and v_department is distinct from 'qa' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_QA_DEPARTMENT',
      'error', 'Phân loại QA chỉ cấp cho nhân viên thuộc bộ phận QA');
  end if;
  if v_is_active and not public.vmp_valid_person_department(v_department) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DEPARTMENT',
      'error', 'Bộ phận nhân viên phải là mã đang có trong departments');
  end if;

  v_requires_scope := v_access_class not in ('qa_progress_editor', 'qa_manager');
  if v_is_active and v_requires_scope and not public.vmp_valid_permission_scope(
    v_departments, v_factories, v_areas, v_lines
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_SCOPE_HIERARCHY',
      'error', 'Phạm vi phải có đủ đường bộ phận → xưởng → khu vực → line đang hoạt động');
  end if;
  if not v_requires_scope then
    v_departments := '{}'::text[];
    v_factories := '{}'::uuid[];
    v_areas := '{}'::uuid[];
    v_lines := '{}'::uuid[];
    v_legacy_areas := '{}'::text[];
  else
    select coalesce(array_agg(code order by code), '{}'::text[])
    into v_legacy_areas
    from (
      select distinct area.code
      from public.vmp_scope_areas area where area.id = any(v_areas)
      union
      select distinct line.code
      from public.vmp_scope_lines line where line.id = any(v_lines)
    ) value;
  end if;

  /* Email chỉ là metadata. Liên kết account chỉ đi qua RPC xác nhận Admin. */
  v_user_id := case when v_person_id is null then null else v_old.user_id end;
  v_version := case when v_person_id is null then 1 else v_old.version + 1 end;
  if v_person_id is null then
    insert into public.vmp_performers (
      performer_name, employee_code, email, department, user_id, access_class,
      scope_departments, access_areas, scope_factory_ids, scope_area_ids,
      scope_line_ids, version, email_sent_confirmed, is_active, updated_by
    ) values (
      v_full_name, v_employee_code, v_email, v_department, v_user_id, v_access_class,
      v_departments, v_legacy_areas, v_factories, v_areas, v_lines, v_version,
      v_email_sent, v_is_active, v_actor
    ) returning * into v_new;
    v_person_id := v_new.id;
  else
    update public.vmp_performers set
      performer_name = v_full_name, employee_code = v_employee_code,
      email = v_email, department = v_department, user_id = v_user_id,
      access_class = v_access_class, scope_departments = v_departments,
      access_areas = v_legacy_areas, scope_factory_ids = v_factories,
      scope_area_ids = v_areas, scope_line_ids = v_lines, version = v_version,
      email_sent_confirmed = v_email_sent, is_active = v_is_active,
      updated_by = v_actor
    where id = v_person_id returning * into v_new;
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor,
    (case when p_person_id is null then 'INSERT' else 'UPDATE' end)::public.audit_action,
    'vmp_performers', v_person_id::text,
    case when p_person_id is null then null else to_jsonb(v_old) end,
    to_jsonb(v_new), btrim(p_reason), 'dashboard_rpc',
    array(select jsonb_object_keys(v_patch) order by 1)
  );
  return jsonb_build_object(
    'ok', true, 'person_id', v_person_id, 'user_id', v_user_id,
    'version', v_version,
    'account_status', case when v_user_id is null then 'unlinked' else 'linked' end
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error_code', 'UNIQUE_CONFLICT',
      'error', 'Mã nhân viên hoặc tài khoản đã tồn tại');
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_VALUE',
      'error', 'Giá trị patch không đúng định dạng');
  when others then
    return jsonb_build_object('ok', false, 'error_code', 'SAVE_FAILED',
      'error', sqlerrm);
end
$_$;


--
-- Name: vmp_upsert_item_permission_staff_department_unchecked("uuid", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_upsert_item_permission_staff_department_unchecked"("p_person_id" "uuid", "p_patch" "jsonb", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor_role text;
  v_old public.vmp_performers%rowtype;
  v_department text;
  v_access_class text;
  v_email text;
  v_user_id uuid;
  v_profile_role text;
  v_profile_department text;
  v_scope text[];
  v_areas text[];
begin
  select role::text into v_actor_role
  from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chỉ Admin được sửa hồ sơ trong danh bạ nhân sự & quyền'
    );
  end if;

  if p_person_id is not null then
    select * into v_old from public.vmp_performers where id = p_person_id;
  end if;

  v_department := case
    when p_patch ? 'department' then lower(nullif(btrim(p_patch->>'department'), ''))
    else v_old.department
  end;
  v_access_class := case
    when p_patch ? 'access_class' then nullif(btrim(p_patch->>'access_class'), '')
    else v_old.access_class
  end;
  v_email := case
    when p_patch ? 'email' then lower(nullif(btrim(p_patch->>'email'), ''))
    else v_old.email
  end;
  v_scope := case
    when p_patch ? 'scope_departments'
      then public.vmp_jsonb_text_array(p_patch, 'scope_departments')
    else v_old.scope_departments
  end;
  v_areas := case
    when p_patch ? 'access_areas'
      then public.vmp_jsonb_text_array(p_patch, 'access_areas')
    else v_old.access_areas
  end;

  if not public.vmp_valid_scope_departments(v_scope) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Phạm vi bộ phận chỉ nhận mã đang có trong danh mục departments hoặc *'
    );
  end if;
  if not public.vmp_valid_access_areas(v_areas) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Khu vực/line chỉ nhận giá trị đang có trên đối tượng thẩm định hoặc *'
    );
  end if;

  if v_email is not null then
    select profile.id, profile.role::text, profile.department
    into v_user_id, v_profile_role, v_profile_department
    from public.profiles profile
    where lower(btrim(profile.email)) = v_email
    order by profile.created_at
    limit 1;
  end if;

  if v_user_id is not null and v_access_class = 'equipment_manager'
      and (
        v_profile_role <> 'department_user'
        or nullif(btrim(coalesce(v_profile_department, '')), '') is null
        or v_department is distinct from v_profile_department
      ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Quản lý thiết bị phải có role department_user và khớp profiles.department'
    );
  end if;
  if v_user_id is not null and v_access_class = 'qa_manager'
      and (
        v_profile_role <> 'qa_manager'
        or v_profile_department is distinct from 'qa'
        or v_department is distinct from 'qa'
      ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Quản lý QA phải có role qa_manager và thuộc bộ phận QA ở cả hai hồ sơ'
    );
  end if;

  return public.vmp_upsert_item_permission_staff_unvalidated(
    p_person_id, p_patch, p_reason
  );
end
$$;


--
-- Name: vmp_upsert_item_permission_staff_unvalidated("uuid", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_upsert_item_permission_staff_unvalidated"("p_person_id" "uuid", "p_patch" "jsonb", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_old public.vmp_performers%rowtype;
  v_person_id uuid := p_person_id;
  v_full_name text;
  v_employee_code text;
  v_department text;
  v_access_class text;
  v_email text;
  v_user_id uuid;
  v_scope text[];
  v_areas text[];
  v_is_active boolean;
  v_email_sent boolean;
  v_new jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);

  if v_actor_role <> 'admin' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chỉ Admin được sửa hồ sơ trong danh bạ nhân sự & quyền'
    );
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do thay đổi');
  end if;

  if v_person_id is not null then
    select * into v_old
    from public.vmp_performers
    where id = v_person_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Không tìm thấy nhân viên cần sửa');
    end if;
  end if;

  v_full_name := case
    when p_patch ? 'full_name' then nullif(btrim(p_patch ->> 'full_name'), '')
    else v_old.performer_name
  end;
  v_employee_code := case
    when p_patch ? 'employee_code' then nullif(btrim(p_patch ->> 'employee_code'), '')
    else v_old.employee_code
  end;
  v_department := case
    when p_patch ? 'department' then lower(nullif(btrim(p_patch ->> 'department'), ''))
    else v_old.department
  end;
  v_access_class := case
    when p_patch ? 'access_class' then nullif(btrim(p_patch ->> 'access_class'), '')
    else v_old.access_class
  end;
  v_email := case
    when p_patch ? 'email' then lower(nullif(btrim(p_patch ->> 'email'), ''))
    else v_old.email
  end;
  v_scope := case
    when p_patch ? 'scope_departments' then public.vmp_jsonb_text_array(p_patch, 'scope_departments')
    else v_old.scope_departments
  end;
  v_areas := case
    when p_patch ? 'access_areas' then public.vmp_jsonb_text_array(p_patch, 'access_areas')
    else v_old.access_areas
  end;
  v_is_active := case
    when p_patch ? 'is_active' then (p_patch ->> 'is_active')::boolean
    else coalesce(v_old.is_active, true)
  end;
  v_email_sent := case
    when p_patch ? 'email_sent_confirmed' then (p_patch ->> 'email_sent_confirmed')::boolean
    else coalesce(v_old.email_sent_confirmed, false)
  end;

  if v_full_name is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập Họ và tên');
  end if;
  if v_email is not null
      and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'Email không đúng định dạng: ' || v_email);
  end if;
  if v_access_class is not null and v_access_class not in (
    'view_only', 'qa_progress_editor', 'qa_manager',
    'equipment_scheduler', 'equipment_manager'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Phân loại quyền không hợp lệ');
  end if;
  if v_access_class in ('qa_progress_editor', 'qa_manager')
      and v_department is distinct from 'qa' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Phân loại QA chỉ cấp cho nhân viên thuộc bộ phận QA'
    );
  end if;
  if v_is_active and (
    v_department is null
    or v_access_class is null
    or coalesce(cardinality(v_scope), 0) = 0
    or coalesce(cardinality(v_areas), 0) = 0
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Nhân viên hoạt động phải có bộ phận, phân loại, phạm vi và khu vực'
    );
  end if;

  if v_email is not null then
    select id into v_user_id
    from public.profiles
    where lower(btrim(email)) = v_email
    order by created_at
    limit 1;

    if v_user_id is not null and exists (
      select 1
      from public.vmp_performers
      where user_id = v_user_id and id is distinct from v_person_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'Email/tài khoản này đã nối với một nhân viên khác'
      );
    end if;
  end if;

  if v_person_id is null then
    insert into public.vmp_performers (
      performer_name, employee_code, email, department, user_id,
      access_class, scope_departments, access_areas,
      email_sent_confirmed, is_active, updated_by
    ) values (
      v_full_name, v_employee_code, v_email, v_department, v_user_id,
      v_access_class, v_scope, v_areas,
      v_email_sent, v_is_active, v_actor
    )
    returning id into v_person_id;

    select to_jsonb(person) into v_new
    from public.vmp_performers person
    where id = v_person_id;

    insert into public.audit_logs (
      user_id, action, table_name, record_id, new_data,
      change_reason, source, changed_fields
    ) values (
      v_actor, 'INSERT', 'vmp_performers', v_person_id::text, v_new,
      btrim(p_reason), 'dashboard_rpc', array(
        select jsonb_object_keys(p_patch)
      )
    );
  else
    update public.vmp_performers
    set performer_name = v_full_name,
        employee_code = v_employee_code,
        email = v_email,
        department = v_department,
        user_id = v_user_id,
        access_class = v_access_class,
        scope_departments = v_scope,
        access_areas = v_areas,
        email_sent_confirmed = v_email_sent,
        is_active = v_is_active,
        updated_by = v_actor
    where id = v_person_id;

    select to_jsonb(person) into v_new
    from public.vmp_performers person
    where id = v_person_id;

    insert into public.audit_logs (
      user_id, action, table_name, record_id, old_data, new_data,
      change_reason, source, changed_fields
    ) values (
      v_actor, 'UPDATE', 'vmp_performers', v_person_id::text,
      to_jsonb(v_old), v_new, btrim(p_reason), 'dashboard_rpc', array(
        select jsonb_object_keys(p_patch)
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'person_id', v_person_id,
    'user_id', v_user_id,
    'account_status', case when v_user_id is null then 'unlinked' else 'linked' end
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'error', 'Mã nhân viên đã tồn tại: ' || coalesce(v_employee_code, '')
    );
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$_$;


--
-- Name: vmp_upsert_source_object_before_person_id("text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_upsert_source_object_before_person_id"("p_object_kind" "text", "p_object_code" "text", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_principal_kind text;
  v_id uuid;
  v_code text := nullif(btrim(p_object_code), '');
  v_kind text := nullif(btrim(p_object_kind), '');
  v_allowed constant text[] := array[
    'object_name', 'department', 'area_code', 'line', 'status', 'show_flag',
    'validate_flag', 'validate_reason', 'frequency_months', 'report_class',
    'workdays', 'critical_point', 'first_month', 'year_ref', 'note', 'is_active',
    'owner_name', 'support_name', 'work_group',
    'complexity_score', 'quality_impact_score', 'criticality_score'
  ];
  v_bad text[];
  v_touch_score boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    select principal.principal_kind into v_principal_kind
    from public.vmp_manager_principal(auth.uid()) principal;
    if v_principal_kind is null then
      return jsonb_build_object(
        'ok', false, 'error', 'Không xác định được người dùng'
      );
    end if;
    if v_principal_kind not in ('admin', 'qa_manager') then
      return jsonb_build_object(
        'ok', false,
        'error', 'Chỉ admin hoặc QA được thêm/sửa danh mục nguồn'
      );
    end if;
  end if;

  if v_code is null or v_kind is null then
    return jsonb_build_object(
      'ok', false, 'error', 'Thiếu mã hoặc loại đối tượng'
    );
  end if;
  if v_kind not in (
    'Thiết bị', 'Quy trình', 'Kho', 'Hệ thống phụ trợ', 'Vận chuyển'
  ) then
    return jsonb_build_object(
      'ok', false, 'error', 'Loại đối tượng không hợp lệ: ' || v_kind
    );
  end if;

  select array_agg(key) into v_bad
  from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) key
  where key <> all (v_allowed);
  if v_bad is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad, ', ')
    );
  end if;

  v_touch_score := p_patch ?| array[
    'complexity_score', 'quality_impact_score', 'criticality_score'
  ];

  insert into public.vmp_source_objects (
    object_kind, object_code, source_tab, source_row, edited_on_web, updated_by
  ) values (
    v_kind, v_code, 'web', 0, true, auth.uid()
  )
  on conflict (object_kind, object_code) do update
  set edited_on_web = true, updated_by = auth.uid()
  returning id into v_id;

  update public.vmp_source_objects object
  set object_name = coalesce(p_patch->>'object_name', object.object_name),
      department = coalesce(p_patch->>'department', object.department),
      area_code = coalesce(p_patch->>'area_code', object.area_code),
      line = coalesce(p_patch->>'line', object.line),
      status = coalesce(p_patch->>'status', object.status),
      show_flag = coalesce(p_patch->>'show_flag', object.show_flag),
      validate_flag = coalesce(
        lower(p_patch->>'validate_flag'), object.validate_flag
      ),
      validate_reason = coalesce(
        p_patch->>'validate_reason', object.validate_reason
      ),
      report_class = coalesce(p_patch->>'report_class', object.report_class),
      critical_point = coalesce(
        p_patch->>'critical_point', object.critical_point
      ),
      note = coalesce(p_patch->>'note', object.note),
      owner_name = coalesce(p_patch->>'owner_name', object.owner_name),
      support_name = coalesce(p_patch->>'support_name', object.support_name),
      work_group = coalesce(p_patch->>'work_group', object.work_group),
      frequency_months = coalesce(
        (p_patch->>'frequency_months')::integer, object.frequency_months
      ),
      workdays = coalesce((p_patch->>'workdays')::integer, object.workdays),
      first_month = coalesce(
        (p_patch->>'first_month')::integer, object.first_month
      ),
      year_ref = coalesce((p_patch->>'year_ref')::integer, object.year_ref),
      complexity_score = coalesce(
        (p_patch->>'complexity_score')::integer, object.complexity_score
      ),
      quality_impact_score = coalesce(
        (p_patch->>'quality_impact_score')::integer,
        object.quality_impact_score
      ),
      criticality_score = coalesce(
        (p_patch->>'criticality_score')::integer, object.criticality_score
      ),
      criticality_source = case
        when v_touch_score then 'manual' else object.criticality_source
      end,
      is_active = coalesce(
        (p_patch->>'is_active')::boolean, object.is_active
      )
  where object.id = v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'object_code', v_code,
    'msg', case
      when v_touch_score then
        'Đã lưu — điểm trọng yếu chuyển sang ĐÃ DUYỆT, không bị chấm lại đè'
      else 'Đã lưu danh mục'
    end
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$$;


--
-- Name: vmp_valid_access_areas("text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_valid_access_areas"("p_areas" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select not exists (
    select 1
    from unnest(coalesce(p_areas, '{}'::text[])) value
    where value <> '*'
      and not exists (
        select 1
        from public.vmp_objects object
        where btrim(coalesce(object.area, '')) = value
           or btrim(coalesce(object.line, '')) = value
      )
  )
$$;


--
-- Name: vmp_valid_permission_scope("text"[], "uuid"[], "uuid"[], "uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_valid_permission_scope"("p_departments" "text"[], "p_factories" "uuid"[], "p_areas" "uuid"[], "p_lines" "uuid"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select cardinality(coalesce(p_departments, '{}'::text[])) > 0
    and cardinality(coalesce(p_factories, '{}'::uuid[])) > 0
    and cardinality(coalesce(p_areas, '{}'::uuid[])) > 0
    and cardinality(coalesce(p_lines, '{}'::uuid[])) > 0
    and not exists (
      select 1
      from unnest(coalesce(p_departments, '{}'::text[])) scope_department(id)
      left join public.departments department
        on department.id = scope_department.id
       and coalesce(department.is_active, true)
      where department.id is null
    )
    and not exists (
      select 1
      from unnest(coalesce(p_factories, '{}'::uuid[])) scope_factory(id)
      left join public.vmp_scope_factories factory
        on factory.id = scope_factory.id and factory.is_active
      where factory.id is null
        or not (factory.department_id = any(p_departments))
    )
    and not exists (
      select 1
      from unnest(coalesce(p_areas, '{}'::uuid[])) scope_area(id)
      left join public.vmp_scope_areas area
        on area.id = scope_area.id and area.is_active
      where area.id is null or not (area.factory_id = any(p_factories))
    )
    and not exists (
      select 1
      from unnest(coalesce(p_lines, '{}'::uuid[])) scope_line(id)
      left join public.vmp_scope_lines line
        on line.id = scope_line.id and line.is_active
      where line.id is null or not (line.area_id = any(p_areas))
    )
$$;


--
-- Name: vmp_valid_person_department("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_valid_person_department"("p_department" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.departments department
    where department.id = p_department
      and coalesce(department.is_active, true)
  )
$$;


--
-- Name: vmp_valid_scope_departments("text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_valid_scope_departments"("p_scope" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select not exists (
    select 1
    from unnest(coalesce(p_scope, '{}'::text[])) value
    where value <> '*'
      and not exists (
        select 1 from public.departments department
        where department.id = value and coalesce(department.is_active, true)
      )
  )
$$;


--
-- Name: vmp_visible_plan_items(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."vmp_visible_plan_items"() RETURNS SETOF "public"."vmp_plan_items"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select item.*
  from public.vmp_plan_items item
  where public.item_permissions_mode() = 'preview'
     or auth.role() = 'service_role'
     or public.vmp_can_view_item(auth.uid(), item.validation_code)
     or public.is_admin()
$$;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."audit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "user_name" "text",
    "user_role" "public"."user_role",
    "action" "public"."audit_action" NOT NULL,
    "table_name" "text",
    "record_id" "text",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "change_reason" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "source" "text" DEFAULT 'dashboard'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "validation_code" "text",
    "changed_fields" "text"[],
    "effective_business_role" "text",
    CONSTRAINT "audit_logs_effective_business_role_check" CHECK ((("effective_business_role" IS NULL) OR ("effective_business_role" = ANY (ARRAY['admin'::"text", 'qa_manager'::"text", 'qa_staff'::"text", 'workshop_manager'::"text", 'workshop_staff'::"text", 'viewer'::"text", 'service_role'::"text"]))))
);


--
-- Name: COLUMN "audit_logs"."validation_code"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."audit_logs"."validation_code" IS 'Mã thẩm định liên quan — để lọc audit theo mã nhanh hơn';


--
-- Name: COLUMN "audit_logs"."changed_fields"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."audit_logs"."changed_fields" IS 'Danh sách trường đã thay đổi. Ví dụ: {status_vmp, actual_vmp_date}';


--
-- Name: COLUMN "audit_logs"."effective_business_role"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."audit_logs"."effective_business_role" IS 'Vai nghiệp vụ hiệu lực lúc ghi. NULL = bản ghi cũ trước 15/08/2026; giao diện hiển thị "Không xác định (dữ liệu cũ)", không đoán bừa.';


--
-- Name: audit_logs_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."audit_logs_archive" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "user_name" "text",
    "user_role" "public"."user_role",
    "action" "public"."audit_action" NOT NULL,
    "table_name" "text",
    "record_id" "text",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "change_reason" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "source" "text" DEFAULT 'dashboard'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "validation_code" "text",
    "changed_fields" "text"[]
);


--
-- Name: TABLE "audit_logs_archive"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."audit_logs_archive" IS 'Nhật ký thao tác cũ hơn 12 tháng, chuyển từ audit_logs. Giữ nguyên nội dung — chỉ đổi chỗ nằm.';


--
-- Name: audit_logs_purge_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."audit_logs_purge_log" (
    "id" bigint NOT NULL,
    "purged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purged_by" "uuid",
    "table_name" "text" NOT NULL,
    "row_count" integer NOT NULL,
    "date_from" "date",
    "date_to" "date",
    "criteria" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "breakdown" "jsonb"
);


--
-- Name: TABLE "audit_logs_purge_log"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."audit_logs_purge_log" IS 'Biên bản mỗi lần xoá nhật ký thao tác: xoá bao nhiêu, tiêu chí nào, vì sao. Không bao giờ xoá bảng này.';


--
-- Name: audit_logs_purge_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."audit_logs_purge_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_purge_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."audit_logs_purge_log_id_seq" OWNED BY "public"."audit_logs_purge_log"."id";


--
-- Name: data_quality_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."data_quality_issues" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "plan_item_id" "text",
    "object_code" "text",
    "issue_type" "text" NOT NULL,
    "severity" "public"."quality_severity" DEFAULT 'warning'::"public"."quality_severity" NOT NULL,
    "field_name" "text",
    "field_value" "text",
    "expected_value" "text",
    "message" "text" NOT NULL,
    "source_row" integer,
    "is_resolved" boolean DEFAULT false,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "resolution_note" "text",
    "workflow_run_id" "uuid",
    "detected_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."departments" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text" NOT NULL,
    "manager_id" "uuid",
    "email" "text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'viewer'::"public"."user_role" NOT NULL,
    "department" "text",
    "phone" "text",
    "title" "text",
    "is_active" boolean DEFAULT true,
    "last_login" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pham_vi" "text",
    CONSTRAINT "profiles_pham_vi_check" CHECK ((("pham_vi" IS NULL) OR ("pham_vi" = ANY (ARRAY['co'::"text", 'bo_phan'::"text", 'phan_cong'::"text", 'khong'::"text"]))))
);


--
-- Name: COLUMN "profiles"."pham_vi"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."profiles"."pham_vi" IS 'Phạm vi sửa hạng mục RIÊNG của người này. NULL = dùng mức chung của vai trong vmp_role_permissions.';


--
-- Name: sheet_sync_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sheet_sync_outbox" (
    "id" bigint NOT NULL,
    "validation_code" "text" NOT NULL,
    "sheet_patch" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'dashboard'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "sheet_sync_outbox"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."sheet_sync_outbox" IS 'Hàng đợi đẩy tiến độ Web→Google Sheet. WF-06 rút và ghi Sheet (có retry) để Sheet luôn khớp Supabase.';


--
-- Name: sheet_sync_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."sheet_sync_outbox_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sheet_sync_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."sheet_sync_outbox_id_seq" OWNED BY "public"."sheet_sync_outbox"."id";


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."system_config" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'general'::"text",
    "is_sensitive" boolean DEFAULT false,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: vmp_item_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_item_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "validation_code" "text" NOT NULL,
    "performer_id" "uuid",
    "user_id" "uuid",
    "staff_name" "text" NOT NULL,
    "normalized_staff_name" "text" GENERATED ALWAYS AS ("public"."vmp_normalize_person_name"("staff_name")) STORED,
    "employee_code" "text",
    "assignment_kind" "text" NOT NULL,
    "source" "text" NOT NULL,
    "source_text" "text",
    "unresolved_reason" "text",
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "change_reason" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assignment_role" "text",
    CONSTRAINT "vmp_item_assignments_assignment_kind_check" CHECK (("assignment_kind" = ANY (ARRAY['qa'::"text", 'equipment_department'::"text"]))),
    CONSTRAINT "vmp_item_assignments_role_check" CHECK (((("assignment_kind" = 'qa'::"text") AND ("assignment_role" IS NOT NULL) AND ("assignment_role" = ANY (ARRAY['primary'::"text", 'collaborator'::"text"]))) OR (("assignment_kind" = 'equipment_department'::"text") AND ("assignment_role" IS NULL)))),
    CONSTRAINT "vmp_item_assignments_source_check" CHECK (("source" = ANY (ARRAY['sheet_qa'::"text", 'sheet_other_staff'::"text", 'qa_manager'::"text", 'equipment_manager'::"text", 'source_owner'::"text", 'source_support'::"text"]))),
    CONSTRAINT "vmp_item_assignments_unresolved_reason_check" CHECK ((("unresolved_reason" IS NULL) OR ("unresolved_reason" = ANY (ARRAY['not_found'::"text", 'duplicate_name'::"text", 'account_unlinked'::"text", 'stale_resolution'::"text"]))))
);


--
-- Name: COLUMN "vmp_item_assignments"."assignment_role"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_item_assignments"."assignment_role" IS 'Vai trò QA theo hạng mục: primary hoặc collaborator; phân công thiết bị để null.';


--
-- Name: vmp_active_item_assignments; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."vmp_active_item_assignments" WITH ("security_invoker"='true') AS
 SELECT "id",
    "validation_code",
    "performer_id",
    "user_id",
    "staff_name",
    "normalized_staff_name",
    "employee_code",
    "assignment_kind",
    "source",
    "source_text",
    "unresolved_reason",
    "expires_at",
    "is_active",
    "change_reason",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at",
    (("user_id" IS NOT NULL) AND "is_active" AND (("expires_at" IS NULL) OR ("expires_at" > "now"()))) AS "grants_access"
   FROM "public"."vmp_item_assignments" "assignment";


--
-- Name: vmp_ai_bi_danh; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_bi_danh" (
    "id" bigint NOT NULL,
    "bi_danh" "text" NOT NULL,
    "loai" "text" NOT NULL,
    "gia_tri" "text",
    "ghi_chu" "text"
);


--
-- Name: TABLE "vmp_ai_bi_danh"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_ai_bi_danh" IS 'Cách gọi dân dã của người dùng ánh xạ về giá trị chuẩn. Thứ này không suy ra được từ dữ liệu nên phải chép tay.';


--
-- Name: vmp_ai_bi_danh_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."vmp_ai_bi_danh_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vmp_ai_bi_danh_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."vmp_ai_bi_danh_id_seq" OWNED BY "public"."vmp_ai_bi_danh"."id";


--
-- Name: vmp_ai_bo_kiem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_bo_kiem" (
    "ma" "text" NOT NULL,
    "cau_hoi" "text" NOT NULL,
    "mong_doi" "jsonb" NOT NULL,
    "ghi_chu" "text"
);


--
-- Name: vmp_ai_bo_nho; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_bo_nho" (
    "id" bigint NOT NULL,
    "nguoi" "text" NOT NULL,
    "tang" "text" NOT NULL,
    "loai" "text" NOT NULL,
    "noi_dung" "text" NOT NULL,
    "tu_khoa" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "quan_trong" integer DEFAULT 5 NOT NULL,
    "so_lan_nhac" integer DEFAULT 0 NOT NULL,
    "tao_luc" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nhac_cuoi" timestamp with time zone
);


--
-- Name: TABLE "vmp_ai_bo_nho"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_ai_bo_nho" IS 'Bộ nhớ dài hạn của Vali về từng người. Chỉ ghi điều liên quan tới công việc và cách làm việc — KHÔNG suy diễn tâm lý, không chấm điểm thái độ. Người dùng xoá được bộ nhớ về mình.';


--
-- Name: vmp_ai_bo_nho_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_bo_nho" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_ai_bo_nho_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_ai_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_cache" (
    "id" bigint NOT NULL,
    "khoa_cau_hoi" "text" NOT NULL,
    "dau_van" "text" NOT NULL,
    "cau_hoi_goc" "text" NOT NULL,
    "tra_loi" "text" NOT NULL,
    "nguon" "text" NOT NULL,
    "tao_luc" timestamp with time zone DEFAULT "now"() NOT NULL,
    "het_han_luc" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "so_lan_dung" integer DEFAULT 0 NOT NULL,
    "dung_gan_nhat" timestamp with time zone
);


--
-- Name: TABLE "vmp_ai_cache"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_ai_cache" IS 'Đệm câu trả lời AI. Khoá gồm câu hỏi + dấu vân dữ liệu (số dòng + max updated_at + ngày hiện tại) nên dữ liệu đổi là dòng đệm tự hết tác dụng, không cần dọn.';


--
-- Name: vmp_ai_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_cache" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_ai_cache_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_ai_cache_ngu_nghia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_cache_ngu_nghia" (
    "id" bigint NOT NULL,
    "cau_hoi" "text" NOT NULL,
    "cau_hoi_khoa" "text" NOT NULL,
    "vector" "extensions"."vector"(768) NOT NULL,
    "phan_hoi" "jsonb" NOT NULL,
    "phu_thuoc" "text" DEFAULT 'so_lieu'::"text" NOT NULL,
    "hit_count" integer DEFAULT 0 NOT NULL,
    "is_valid" boolean DEFAULT true NOT NULL,
    "invalidated_at" timestamp with time zone,
    "invalidated_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_ai_cache_ngu_nghia_phu_thuoc_check" CHECK (("phu_thuoc" = ANY (ARRAY['so_lieu'::"text", 'tri_thuc'::"text"])))
);


--
-- Name: TABLE "vmp_ai_cache_ngu_nghia"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_ai_cache_ngu_nghia" IS 'Cache câu trả lời theo vector câu hỏi (học từ Du_bao_thoi_tiet). Tự vô hiệu khi dữ liệu đổi; sống tối đa hết ngày; không nhận câu cá nhân.';


--
-- Name: vmp_ai_cache_ngu_nghia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."vmp_ai_cache_ngu_nghia_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vmp_ai_cache_ngu_nghia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."vmp_ai_cache_ngu_nghia_id_seq" OWNED BY "public"."vmp_ai_cache_ngu_nghia"."id";


--
-- Name: vmp_ai_cau_hoi_vang; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_cau_hoi_vang" (
    "id" bigint NOT NULL,
    "cau_hoi" "text" NOT NULL,
    "mong_doi" "jsonb" NOT NULL,
    "nhom" "text" DEFAULT 'doi_tuong'::"text" NOT NULL,
    "bat" boolean DEFAULT true NOT NULL,
    "ghi_chu" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_ai_cau_hoi_vang"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_ai_cau_hoi_vang" IS 'Bộ câu hỏi vàng chấm tầng nhận diện từ khoá. Thêm câu mới MỖI KHI có câu trả lời sai ngoài thực tế — đó là cách bộ này lớn lên.';


--
-- Name: vmp_ai_cau_hoi_vang_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."vmp_ai_cau_hoi_vang_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vmp_ai_cau_hoi_vang_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."vmp_ai_cau_hoi_vang_id_seq" OWNED BY "public"."vmp_ai_cau_hoi_vang"."id";


--
-- Name: vmp_ai_cham_diem_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_cham_diem_log" (
    "id" bigint NOT NULL,
    "chay_luc" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tong" integer NOT NULL,
    "dat" integer NOT NULL,
    "truot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ghi_chu" "text"
);


--
-- Name: vmp_ai_cham_diem_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."vmp_ai_cham_diem_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vmp_ai_cham_diem_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."vmp_ai_cham_diem_log_id_seq" OWNED BY "public"."vmp_ai_cham_diem_log"."id";


--
-- Name: vmp_ai_chat_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_chat_log" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "question" "text" NOT NULL,
    "answer" "text",
    "sources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "model" "text",
    "latency_ms" integer,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duong_tra_loi" "text",
    "y_dinh" "text",
    "so_lac" "jsonb",
    "ty_le_bam" integer
);


--
-- Name: vmp_ai_chat_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_chat_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_ai_chat_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_ai_dong_nghia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_dong_nghia" (
    "id" bigint NOT NULL,
    "tu_chuan" "text" NOT NULL,
    "cach_goi" "text" NOT NULL,
    "nhom" "text",
    "bat" boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE "vmp_ai_dong_nghia"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_ai_dong_nghia" IS 'Từ đồng nghĩa để mở rộng câu hỏi. Cả hai cột đều lưu dạng ĐÃ BỎ DẤU vì luật dò chạy trên chuỗi bỏ dấu. Thêm dòng là dùng ngay, không sửa hàm.';


--
-- Name: vmp_ai_dong_nghia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_dong_nghia" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_ai_dong_nghia_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_ai_giong; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_giong" (
    "id" bigint NOT NULL,
    "ngu_canh" "text" NOT NULL,
    "cau" "text" NOT NULL,
    "bat" boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE "vmp_ai_giong"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_ai_giong" IS 'Từ điển CÁCH NÓI của công chúa Vali, gom theo ngữ cảnh. Mỗi lần trả lời rút ngẫu nhiên vài câu nhét vào lời nhắc để giọng khỏi lặp. Đây là cách nói, KHÔNG phải nội dung — số liệu vẫn do SQL cấp.';


--
-- Name: vmp_ai_giong_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_giong" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_ai_giong_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_ai_hoi_thoai; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_hoi_thoai" (
    "id" bigint NOT NULL,
    "phien" "text" NOT NULL,
    "cau_hoi" "text" NOT NULL,
    "y_dinh" "text",
    "cho_lam_ro" boolean DEFAULT false NOT NULL,
    "tao_luc" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_ai_hoi_thoai"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_ai_hoi_thoai" IS 'Trí nhớ ngắn cho đường SQL. Giữ 30 phút — đủ để nối câu hỏi lại với câu trả lời, không đủ lâu để câu cũ chen vào câu mới.';


--
-- Name: vmp_ai_hoi_thoai_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_hoi_thoai" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_ai_hoi_thoai_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_ai_mo_hinh; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_mo_hinh" (
    "ma" "text" NOT NULL,
    "ten" "text" NOT NULL,
    "nha_cung_cap" "text" NOT NULL,
    "bac" "text" NOT NULL,
    "mien_phi" boolean DEFAULT true NOT NULL,
    "thu_tu" integer NOT NULL,
    "bat" boolean DEFAULT true NOT NULL,
    "so_lan_goi" integer DEFAULT 0 NOT NULL,
    "so_lan_loi" integer DEFAULT 0 NOT NULL,
    "loi_lien_tiep" integer DEFAULT 0 NOT NULL,
    "tre_tb_ms" integer,
    "loi_gan_nhat" "text",
    "luc_loi" timestamp with time zone,
    "nghi_den" timestamp with time zone,
    "ghi_chu" "text"
);


--
-- Name: TABLE "vmp_ai_mo_hinh"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_ai_mo_hinh" IS 'Bảng sức khoẻ mô hình AI. Router đọc để chọn, n8n ghi lại sau mỗi lần gọi. Mô hình lỗi liên tiếp bị cho nghỉ và bỏ qua ngay từ đầu.';


--
-- Name: vmp_ai_report_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_report_cache" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "report_data" "jsonb" NOT NULL,
    "ai_model" "text" DEFAULT 'gpt-4o'::"text",
    "ai_response" "text" NOT NULL,
    "prompt_used" "text",
    "created_by" "uuid",
    "created_by_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "disclaimer" "text" DEFAULT 'BẢN NHÁP AI — Cần QA xác nhận trước khi phát hành'::"text"
);


--
-- Name: vmp_ai_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_reviews" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "snapshot_id" "uuid" NOT NULL,
    "ai_provider" "text" DEFAULT 'anthropic'::"text",
    "ai_model" "text",
    "prompt_used" "text" NOT NULL,
    "input_data" "jsonb" NOT NULL,
    "ai_response" "text" NOT NULL,
    "is_approved" boolean DEFAULT false,
    "disclaimer" "text" DEFAULT 'BẢN NHÁP AI — Cần QA xác nhận trước khi phát hành'::"text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_comments" "text",
    "tokens_used" integer,
    "generation_time_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: vmp_ai_trich_dan_tam; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_ai_trich_dan_tam" (
    "id" bigint NOT NULL,
    "phien" "text" DEFAULT ''::"text" NOT NULL,
    "trich" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: vmp_ai_trich_dan_tam_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_trich_dan_tam" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_ai_trich_dan_tam_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_objects" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "classification" "text" DEFAULT 'tb'::"text" NOT NULL,
    "department" "text",
    "area" "text" DEFAULT '—'::"text",
    "line" "text" DEFAULT '—'::"text",
    "gxp_impact" "text" DEFAULT 'GxP'::"text",
    "criticality_score" integer,
    "criticality" "public"."criticality" DEFAULT 'medium'::"public"."criticality" NOT NULL,
    "frequency_months" integer DEFAULT 12,
    "is_active" boolean DEFAULT true,
    "notes" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_sync_run_id" "uuid",
    "source_sheet_row" integer,
    "source_sheet_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "vmp_objects_criticality_score_check" CHECK ((("criticality_score" >= 1) AND ("criticality_score" <= 9)))
);


--
-- Name: TABLE "vmp_objects"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_objects" IS 'Read-only projection of canonical Google Sheet VMP objects for browser roles. Mutated only by the n8n snapshot service.';


--
-- Name: vmp_ai_tu_dien; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."vmp_ai_tu_dien" WITH ("security_invoker"='true') AS
 SELECT 'nguoi'::"text" AS "loai",
    "vmp_plan_items"."owner_name" AS "gia_tri",
    "public"."vmp_khong_dau"("vmp_plan_items"."owner_name") AS "khoa"
   FROM "public"."vmp_plan_items"
  WHERE ("vmp_plan_items"."owner_name" IS NOT NULL)
  GROUP BY "vmp_plan_items"."owner_name"
UNION ALL
 SELECT 'nhom_viec'::"text" AS "loai",
    "vmp_plan_items"."work_group" AS "gia_tri",
    "public"."vmp_khong_dau"("vmp_plan_items"."work_group") AS "khoa"
   FROM "public"."vmp_plan_items"
  WHERE ("vmp_plan_items"."work_group" IS NOT NULL)
  GROUP BY "vmp_plan_items"."work_group"
UNION ALL
 SELECT 'loai_td'::"text" AS "loai",
    "vmp_plan_items"."validation_type" AS "gia_tri",
    "public"."vmp_khong_dau"("vmp_plan_items"."validation_type") AS "khoa"
   FROM "public"."vmp_plan_items"
  WHERE ("vmp_plan_items"."validation_type" IS NOT NULL)
  GROUP BY "vmp_plan_items"."validation_type"
UNION ALL
 SELECT 'bo_phan'::"text" AS "loai",
    "vmp_objects"."department" AS "gia_tri",
    "public"."vmp_khong_dau"("vmp_objects"."department") AS "khoa"
   FROM "public"."vmp_objects"
  WHERE (("vmp_objects"."department" IS NOT NULL) AND "vmp_objects"."is_active")
  GROUP BY "vmp_objects"."department"
UNION ALL
 SELECT 'khu_vuc'::"text" AS "loai",
    "vmp_objects"."area" AS "gia_tri",
    "public"."vmp_khong_dau"("vmp_objects"."area") AS "khoa"
   FROM "public"."vmp_objects"
  WHERE (("vmp_objects"."area" IS NOT NULL) AND "vmp_objects"."is_active")
  GROUP BY "vmp_objects"."area"
UNION ALL
 SELECT 'line'::"text" AS "loai",
    "vmp_objects"."line" AS "gia_tri",
    "public"."vmp_khong_dau"("vmp_objects"."line") AS "khoa"
   FROM "public"."vmp_objects"
  WHERE (("vmp_objects"."line" IS NOT NULL) AND "vmp_objects"."is_active")
  GROUP BY "vmp_objects"."line"
UNION ALL
 SELECT 'ma'::"text" AS "loai",
    "vmp_objects"."code" AS "gia_tri",
    "public"."vmp_khong_dau"("vmp_objects"."code") AS "khoa"
   FROM "public"."vmp_objects"
  WHERE ("vmp_objects"."is_active" AND ("length"("vmp_objects"."code") >= 4))
UNION ALL
 SELECT 'ten_doi_tuong'::"text" AS "loai",
    "vmp_objects"."name" AS "gia_tri",
    "public"."vmp_khong_dau"("vmp_objects"."name") AS "khoa"
   FROM "public"."vmp_objects"
  WHERE ("vmp_objects"."is_active" AND ("length"("vmp_objects"."name") >= 4));


--
-- Name: VIEW "vmp_ai_tu_dien"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW "public"."vmp_ai_tu_dien" IS 'Từ điển thực thể sinh thẳng từ dữ liệu: tên QA, nhóm việc, loại thẩm định, bộ phận, khu vực, dây chuyền, mã và tên đối tượng. Thêm dữ liệu mới là trợ lý nhận ra ngay, không phải sửa mẫu.';


--
-- Name: vmp_alert_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_alert_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "scope_type" "text" DEFAULT 'tất cả'::"text" NOT NULL,
    "scope" "text",
    "email" "text" NOT NULL,
    "recipient_name" "text",
    "alert_kind" "text" DEFAULT 'cả hai'::"text" NOT NULL,
    "threshold_days" integer,
    "note" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_report_enabled" boolean DEFAULT false NOT NULL,
    "ai_report_schedule" "text" DEFAULT 'không'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "vmp_alert_recipients_ai_schedule_check" CHECK (("ai_report_schedule" = ANY (ARRAY['không'::"text", 'hằng tuần'::"text", 'hằng tháng'::"text"]))),
    CONSTRAINT "vmp_alert_recipients_threshold_days_check" CHECK ((("threshold_days" IS NULL) OR (("threshold_days" >= 0) AND ("threshold_days" <= 365))))
);


--
-- Name: TABLE "vmp_alert_recipients"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_alert_recipients" IS 'Người nhận email cảnh báo đến hạn. Thay cho tab "CanhBao" trong Google Sheet.';


--
-- Name: COLUMN "vmp_alert_recipients"."ai_report_enabled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_alert_recipients"."ai_report_enabled" IS 'Nhận bản phân tích AI tổng hợp (Vani VMP 5). Khác với is_enabled — cờ đó dành cho mail cảnh báo từng hạng mục.';


--
-- Name: COLUMN "vmp_alert_recipients"."ai_report_schedule"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_alert_recipients"."ai_report_schedule" IS 'Tần suất gửi tự động bản phân tích AI: không | hằng tuần (thứ Hai) | hằng tháng (ngày 1).';


--
-- Name: vmp_assignment_matrix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_assignment_matrix" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_name" "text" NOT NULL,
    "department" "text" NOT NULL,
    "validation_type" "text" NOT NULL,
    "line" "text" DEFAULT '*'::"text" NOT NULL,
    "vai_tro" "text" DEFAULT 'thuc_hien'::"text" NOT NULL,
    "note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_assignment_matrix_vai_tro_check" CHECK (("vai_tro" = ANY (ARRAY['thuc_hien'::"text", 'ho_tro'::"text"])))
);


--
-- Name: vmp_assignment_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_assignment_rules" (
    "id" integer NOT NULL,
    "category" "text" NOT NULL,
    "work_group" "text" NOT NULL,
    "match_kind" "text",
    "match_name_re" "text",
    "match_areas" "text"[],
    "match_dept" "text",
    "owner_name" "text" NOT NULL,
    "support_name" "text",
    "expected_2026" integer,
    "priority" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_assignment_rules"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_assignment_rules" IS 'Luật phân công QA phụ trách. Luật có priority nhỏ hơn được xét trước; luật khớp đầu tiên thắng.';


--
-- Name: vmp_authorization_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_authorization_revision" (
    "singleton" boolean DEFAULT true NOT NULL,
    "revision" bigint DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "transaction_timestamp"() NOT NULL,
    CONSTRAINT "vmp_authorization_revision_positive" CHECK (("revision" > 0)),
    CONSTRAINT "vmp_authorization_revision_singleton" CHECK ("singleton")
);


--
-- Name: vmp_catalog_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_catalog_changes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "object_kind" "text" NOT NULL,
    "object_code" "text" NOT NULL,
    "source_version" integer NOT NULL,
    "timeline_revision" integer NOT NULL,
    "old_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "new_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "impact" "jsonb",
    "apply_result" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_by" "uuid",
    "applied_by" "uuid",
    "apply_reason" "text",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    CONSTRAINT "vmp_catalog_changes_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'previewed'::"text", 'applied'::"text", 'failed'::"text", 'superseded'::"text"])))
);


--
-- Name: vmp_catalog_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_catalog_import_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "dataset" "text" NOT NULL,
    "template_version" "text" NOT NULL,
    "fingerprint" "text" NOT NULL,
    "file_hash" "text",
    "status" "text" DEFAULT 'validated'::"text" NOT NULL,
    "total_rows" integer DEFAULT 0 NOT NULL,
    "so_tao_moi" integer DEFAULT 0 NOT NULL,
    "so_sua" integer DEFAULT 0 NOT NULL,
    "so_khong_doi" integer DEFAULT 0 NOT NULL,
    "so_loi" integer DEFAULT 0 NOT NULL,
    "batch_reason" "text",
    "committed_result" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "committed_at" timestamp with time zone,
    CONSTRAINT "vmp_catalog_import_batches_dataset_check" CHECK (("dataset" = ANY (ARRAY['source_objects'::"text", 'products_gmp'::"text"]))),
    CONSTRAINT "vmp_catalog_import_batches_status_check" CHECK (("status" = ANY (ARRAY['uploaded'::"text", 'validated'::"text", 'committed'::"text", 'failed'::"text", 'expired'::"text"])))
);


--
-- Name: TABLE "vmp_catalog_import_batches"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_catalog_import_batches" IS 'Lô nhập Excel danh mục. KHÔNG chứa dữ liệu chính tắc — chỉ là phòng chờ; bảng thật chỉ bị ghi bởi rpc_commit_catalog_import qua writer chính tắc.';


--
-- Name: vmp_catalog_import_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_catalog_import_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "row_number" integer NOT NULL,
    "business_key" "text" DEFAULT ''::"text" NOT NULL,
    "object_kind" "text",
    "expected_version" integer,
    "input" "jsonb" NOT NULL,
    "patch" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "current_snapshot" "jsonb",
    "classification" "text" NOT NULL,
    "errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "row_reason" "text",
    CONSTRAINT "vmp_catalog_import_rows_classification_check" CHECK (("classification" = ANY (ARRAY['moi'::"text", 'sua'::"text", 'khong_doi'::"text", 'loi'::"text"])))
);


--
-- Name: TABLE "vmp_catalog_import_rows"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_catalog_import_rows" IS 'Từng dòng của một lô nhập, kèm phân loại và patch đã chuẩn hoá. row_reason là cột DUY NHẤT được sửa sau khi staging (qua RPC riêng).';


--
-- Name: vmp_chat_giong; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_chat_giong" (
    "id" bigint NOT NULL,
    "ten" "text" NOT NULL,
    "tu_khoa" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "noi_dung" "text" NOT NULL,
    "uu_tien" integer DEFAULT 100 NOT NULL,
    "bat" boolean DEFAULT true NOT NULL,
    "ghi_chu" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_chat_giong"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_chat_giong" IS 'Sổ tay giọng của Vali: mảnh ứng xử kích hoạt theo từ khoá (kiểu lorebook của character card v2). Sửa ở đây là đổi được cách nói mà không phải sửa workflow.';


--
-- Name: vmp_chat_giong_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."vmp_chat_giong_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vmp_chat_giong_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."vmp_chat_giong_id_seq" OWNED BY "public"."vmp_chat_giong"."id";


--
-- Name: vmp_chat_loi_cho; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_chat_loi_cho" (
    "id" bigint NOT NULL,
    "loai" "text" NOT NULL,
    "noi_dung" "text" NOT NULL,
    "nguon" "text",
    "bat" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_chat_loi_cho_loai_check" CHECK (("loai" = ANY (ARRAY['tho'::"text", 'nguyen_tac'::"text", 'meo'::"text"])))
);


--
-- Name: TABLE "vmp_chat_loi_cho"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_chat_loi_cho" IS 'Mẩu hiện ra trong lúc người dùng chờ Vali trả lời. Thêm mẩu mới = INSERT một dòng, không phải build lại web.';


--
-- Name: vmp_chat_loi_cho_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."vmp_chat_loi_cho_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vmp_chat_loi_cho_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."vmp_chat_loi_cho_id_seq" OWNED BY "public"."vmp_chat_loi_cho"."id";


--
-- Name: vmp_danh_gia_anh_huong; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_danh_gia_anh_huong" (
    "ma_doi_tuong" "text" NOT NULL,
    "ten" "text" NOT NULL,
    "phan_loai" "text",
    "bo_phan" "text",
    "diem_phuc_tap" integer,
    "ah_hien_tai" integer,
    "ah_de_xuat" integer,
    "trong_yeu_hien_tai" integer,
    "trong_yeu_de_xuat" integer,
    "lech" integer,
    "cach_xep" "text",
    "so_hang_muc" integer,
    "danh_gia_luc" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_danh_gia_anh_huong"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_danh_gia_anh_huong" IS 'Đối chiếu điểm ảnh hưởng chất lượng: hiện tại vs đề xuất theo ISPE. Bảng ĐỀ XUẤT — QA đọc rồi quyết, không tự áp.';


--
-- Name: vmp_deadline_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_deadline_rules" (
    "id" integer NOT NULL,
    "report_class" "text" NOT NULL,
    "report_days" integer DEFAULT 2 NOT NULL,
    "protocol_offset" integer DEFAULT 60 NOT NULL,
    "report_offset" integer DEFAULT 5 NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: vmp_deadline_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."vmp_deadline_rules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vmp_deadline_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."vmp_deadline_rules_id_seq" OWNED BY "public"."vmp_deadline_rules"."id";


--
-- Name: vmp_diem_truoc_khi_doi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_diem_truoc_khi_doi" (
    "object_code" "text",
    "object_name" "text",
    "pt_cu" integer,
    "ah_cu" integer,
    "diem_cu" integer,
    "nguon_cu" "text",
    "chup_luc" timestamp with time zone
);


--
-- Name: TABLE "vmp_diem_truoc_khi_doi"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_diem_truoc_khi_doi" IS 'Ảnh điểm trọng yếu trước lần đổi thang 2026-07-31. Dùng để lùi lại nếu cần.';


--
-- Name: vmp_email_cho_phep; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_email_cho_phep" (
    "email" "text" NOT NULL,
    "ghi_chu" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_email_cho_phep"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_email_cho_phep" IS 'Email được phép có tài khoản. Trigger chan_dang_ky_la trên auth.users chặn mọi email không nằm ở đây.';


--
-- Name: vmp_kb_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_kb_chunks" (
    "id" bigint NOT NULL,
    "source" "text" NOT NULL,
    "heading" "text",
    "ord" integer DEFAULT 0 NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "extensions"."vector"(768),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_kb_chunks"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_kb_chunks" IS 'Đoạn tài liệu luật/GMP cho trợ lý hỏi đáp. CHỈ chứa tri thức tĩnh — số liệu timeline không nạp vào đây, xem chú thích đầu migration.';


--
-- Name: vmp_kb_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_kb_chunks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_kb_chunks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_kb_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_kb_documents" (
    "id" bigint NOT NULL,
    "content" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "embedding" "extensions"."vector"(768)
);


--
-- Name: vmp_kb_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_kb_documents" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_kb_documents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_legacy_action_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_legacy_action_map" (
    "hanh_dong_cu" "text" NOT NULL,
    "screen_id" "text" NOT NULL,
    "hanh_dong_moi" "text" NOT NULL,
    "ghi_chu" "text"
);


--
-- Name: TABLE "vmp_legacy_action_map"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_legacy_action_map" IS 'Cầu nối tạm: hành động của hệ quyền cũ → hành động tương đương ở hệ 6 vai. Hành động KHÔNG có ở đây vẫn đọc vmp_role_permissions.';


--
-- Name: vmp_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "notification_type" "text" NOT NULL,
    "plan_item_id" "text",
    "recipient_email" "text" NOT NULL,
    "recipient_name" "text",
    "channel" "public"."notification_ch" DEFAULT 'email'::"public"."notification_ch",
    "subject" "text",
    "body_preview" "text",
    "sent_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "next_retry_at" timestamp with time zone,
    "workflow_run_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: vmp_performers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_performers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "performer_name" "text" NOT NULL,
    "email" "text",
    "department" "text",
    "role_title" "text",
    "note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "employee_code" "text",
    "normalized_full_name" "text" GENERATED ALWAYS AS ("public"."vmp_normalize_person_name"("performer_name")) STORED,
    "access_class" "text",
    "scope_departments" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "access_areas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "email_sent_confirmed" boolean DEFAULT false NOT NULL,
    "scope_factory_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "scope_area_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "scope_line_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "vmp_performers_access_class_check" CHECK ((("access_class" IS NULL) OR ("access_class" = ANY (ARRAY['view_only'::"text", 'qa_progress_editor'::"text", 'qa_manager'::"text", 'workshop_staff'::"text", 'equipment_manager'::"text", 'equipment_scheduler'::"text"])))),
    CONSTRAINT "vmp_performers_version_check" CHECK (("version" > 0))
);


--
-- Name: TABLE "vmp_performers"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_performers" IS 'Người thực hiện thẩm định: tên + email. Nhập trực tiếp trên dashboard (tab "Người thực hiện").';


--
-- Name: COLUMN "vmp_performers"."employee_code"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_performers"."employee_code" IS 'Mã nhân viên tùy chọn trong giai đoạn đầu; duy nhất khi có giá trị.';


--
-- Name: COLUMN "vmp_performers"."access_class"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_performers"."access_class" IS 'Một phân loại quyền chính của nhân viên trong VMP.';


--
-- Name: COLUMN "vmp_performers"."scope_departments"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_performers"."scope_departments" IS 'Danh sách mã bộ phận được tiếp cận; phần tử * nghĩa là toàn nhà máy.';


--
-- Name: COLUMN "vmp_performers"."access_areas"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_performers"."access_areas" IS 'Danh sách area/line được tiếp cận; phần tử * nghĩa là toàn bộ trong phạm vi.';


--
-- Name: vmp_products_gmp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_products_gmp" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bfo_code" "text" NOT NULL,
    "product_name" "text",
    "ingredients" "text",
    "strength" "text",
    "production_line" "text",
    "dosage_form" "text",
    "primary_pack" "text",
    "batch_size" "text",
    "note" "text",
    "mixing_tank" "text",
    "final_batch_size" "text",
    "source_row" integer NOT NULL,
    "extra" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE "vmp_products_gmp"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_products_gmp" IS 'Danh mục sản phẩm/cỡ lô GMP từ tab "DM TDQTSX show GMP". Dữ liệu nền, không sinh timeline.';


--
-- Name: COLUMN "vmp_products_gmp"."is_active"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."vmp_products_gmp"."is_active" IS 'Còn dùng hay đã ngừng. Hồ sơ GMP không xoá bản ghi, chỉ tắt cờ này.';


--
-- Name: vmp_progress_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_progress_events" (
    "event_id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "plan_item_id" "text" NOT NULL,
    "phase" "text" NOT NULL,
    "old_status" "public"."phase_status",
    "new_status" "public"."phase_status" NOT NULL,
    "old_date" "date",
    "new_date" "date",
    "change_reason" "text",
    "changed_by" "uuid" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "source" "text" DEFAULT 'dashboard'::"text",
    "ip_address" "inet",
    "user_agent" "text"
);


--
-- Name: vmp_report_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_report_snapshots" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "report_period" "public"."report_period" NOT NULL,
    "period_label" "text" NOT NULL,
    "scope" "text" DEFAULT 'all'::"text",
    "scope_label" "text" DEFAULT 'Toàn nhà máy'::"text",
    "year" integer NOT NULL,
    "kpi_data" "jsonb" NOT NULL,
    "items_snapshot" "jsonb",
    "overdue_list" "jsonb",
    "mismatch_list" "jsonb",
    "filter_applied" "jsonb",
    "status" "public"."report_status" DEFAULT 'draft'::"public"."report_status",
    "template_version" "text" DEFAULT 'v2.0'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "exported_format" "text"[],
    "file_urls" "jsonb"
);


--
-- Name: vmp_rls_siet_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_rls_siet_log" (
    "id" bigint NOT NULL,
    "tablename" "text" NOT NULL,
    "policyname" "text" NOT NULL,
    "cmd" "text" NOT NULL,
    "vai_cu" "text" NOT NULL,
    "vai_moi" "text" NOT NULL,
    "doi_luc" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_rls_siet_log"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_rls_siet_log" IS 'Nhật ký siết RLS 2026-07-31: policy nào bị đổi từ public sang authenticated. Dùng để lùi lại nếu web trắng dữ liệu.';


--
-- Name: vmp_rls_siet_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."vmp_rls_siet_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vmp_rls_siet_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."vmp_rls_siet_log_id_seq" OWNED BY "public"."vmp_rls_siet_log"."id";


--
-- Name: vmp_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_role_permissions" (
    "hanh_dong" "text" NOT NULL,
    "vai_tro" "public"."user_role" NOT NULL,
    "muc" "text" DEFAULT 'khong'::"text" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_role_permissions_muc_check" CHECK (("muc" = ANY (ARRAY['co'::"text", 'bo_phan'::"text", 'phan_cong'::"text", 'khong'::"text"])))
);


--
-- Name: TABLE "vmp_role_permissions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_role_permissions" IS 'Luật phân quyền GHI. Các hàm RPC đọc bảng này qua public.duoc_phep / public.muc_quyen. Sửa qua rpc_set_role_permission.';


--
-- Name: vmp_scope_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_scope_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "factory_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_scope_areas_code_check" CHECK ((NULLIF("btrim"("code"), ''::"text") IS NOT NULL)),
    CONSTRAINT "vmp_scope_areas_name_check" CHECK ((NULLIF("btrim"("name"), ''::"text") IS NOT NULL))
);


--
-- Name: TABLE "vmp_scope_areas"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_scope_areas" IS 'Khu vực chuẩn, bắt buộc thuộc một xưởng chuẩn.';


--
-- Name: vmp_scope_factories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_scope_factories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "department_id" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_scope_factories_code_check" CHECK ((NULLIF("btrim"("code"), ''::"text") IS NOT NULL)),
    CONSTRAINT "vmp_scope_factories_name_check" CHECK ((NULLIF("btrim"("name"), ''::"text") IS NOT NULL))
);


--
-- Name: TABLE "vmp_scope_factories"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_scope_factories" IS 'Danh mục xưởng chuẩn. Migration cố ý không suy đoán/tự sinh xưởng từ area hoặc line legacy.';


--
-- Name: vmp_scope_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_scope_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "area_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_scope_lines_code_check" CHECK ((NULLIF("btrim"("code"), ''::"text") IS NOT NULL)),
    CONSTRAINT "vmp_scope_lines_name_check" CHECK ((NULLIF("btrim"("name"), ''::"text") IS NOT NULL))
);


--
-- Name: TABLE "vmp_scope_lines"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_scope_lines" IS 'Line chuẩn, bắt buộc thuộc một khu vực chuẩn.';


--
-- Name: vmp_screen_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_screen_permissions" (
    "business_role" "text" NOT NULL,
    "screen_id" "text" NOT NULL,
    "can_view" boolean DEFAULT false NOT NULL,
    "data_scope" "text" DEFAULT 'none'::"text" NOT NULL,
    "actions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "vmp_screen_permissions_business_role_check" CHECK (("business_role" = ANY (ARRAY['admin'::"text", 'qa_manager'::"text", 'qa_staff'::"text", 'workshop_manager'::"text", 'workshop_staff'::"text"]))),
    CONSTRAINT "vmp_screen_permissions_data_scope_check" CHECK (("data_scope" = ANY (ARRAY['all'::"text", 'workshop'::"text", 'assigned'::"text", 'own'::"text", 'none'::"text"]))),
    CONSTRAINT "vmp_screen_permissions_deny_is_empty" CHECK (("can_view" OR (("data_scope" = 'none'::"text") AND ("actions" = '{}'::"text"[])))),
    CONSTRAINT "vmp_screen_permissions_screen_id_check" CHECK (("screen_id" = ANY (ARRAY['today'::"text", 'overview'::"text", 'timeline'::"text", 'alerts'::"text", 'risk'::"text", 'progress'::"text", 'inventory'::"text", 'source'::"text", 'workload'::"text", 'reports'::"text", 'rules'::"text", 'people'::"text", 'health'::"text", 'audit'::"text", 'accounts'::"text", 'admin'::"text", 'phanquyen'::"text"])))
);


--
-- Name: vmp_sheet_row_extras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_sheet_row_extras" (
    "sync_run_id" "uuid" NOT NULL,
    "sheet_row_number" integer NOT NULL,
    "validation_code" "text" NOT NULL,
    "object_code" "text" NOT NULL,
    "extra_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_sheet_row_extras_extra_json_check" CHECK (("jsonb_typeof"("extra_json") = 'object'::"text")),
    CONSTRAINT "vmp_sheet_row_extras_sheet_row_number_check" CHECK (("sheet_row_number" >= 2))
);


--
-- Name: vmp_sheet_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_sheet_rows" (
    "sync_run_id" "uuid" NOT NULL,
    "sheet_row_number" integer NOT NULL,
    "values_json" "jsonb" NOT NULL,
    "validation_code" "text" NOT NULL,
    "object_code" "text" NOT NULL,
    "row_hash" "text" NOT NULL,
    CONSTRAINT "vmp_sheet_rows_sheet_row_number_check" CHECK (("sheet_row_number" >= 2)),
    CONSTRAINT "vmp_sheet_rows_values_json_check" CHECK (("jsonb_typeof"("values_json") = 'array'::"text"))
);


--
-- Name: vmp_sheet_sync_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_sheet_sync_backups" (
    "sync_run_id" "uuid" NOT NULL,
    "dataset" "text" NOT NULL,
    "row_count" integer NOT NULL,
    "rows_json" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_sheet_sync_backups_dataset_check" CHECK (("dataset" = ANY (ARRAY['vmp_plan_items'::"text", 'vmp_objects'::"text", 'data_quality_issues'::"text", 'vmp_notifications'::"text", 'vmp_progress_events'::"text"]))),
    CONSTRAINT "vmp_sheet_sync_backups_rows_json_check" CHECK (("jsonb_typeof"("rows_json") = 'array'::"text"))
);


--
-- Name: vmp_sheet_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_sheet_sync_runs" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "sheet_id" "text" NOT NULL,
    "sheet_gid" "text" NOT NULL,
    "tab_name" "text" NOT NULL,
    "headers" "jsonb" NOT NULL,
    "source_row_count" integer NOT NULL,
    "unique_validation_count" integer NOT NULL,
    "object_count" integer NOT NULL,
    "duplicate_validation_count" integer DEFAULT 0 NOT NULL,
    "checksum" "text" NOT NULL,
    "status" "text" DEFAULT 'applying'::"text" NOT NULL,
    "result" "jsonb",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_sheet_sync_runs_duplicate_validation_count_check" CHECK (("duplicate_validation_count" >= 0)),
    CONSTRAINT "vmp_sheet_sync_runs_headers_check" CHECK (("jsonb_typeof"("headers") = 'array'::"text")),
    CONSTRAINT "vmp_sheet_sync_runs_object_count_check" CHECK (("object_count" >= 0)),
    CONSTRAINT "vmp_sheet_sync_runs_source_row_count_check" CHECK (("source_row_count" >= 0)),
    CONSTRAINT "vmp_sheet_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['applying'::"text", 'completed'::"text", 'failed'::"text", 'rolled_back'::"text"]))),
    CONSTRAINT "vmp_sheet_sync_runs_unique_validation_count_check" CHECK (("unique_validation_count" >= 0))
);


--
-- Name: vmp_source_assignment_resolutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_source_assignment_resolutions" (
    "validation_code" "text" NOT NULL,
    "assignment_kind" "text" NOT NULL,
    "source" "text" NOT NULL,
    "normalized_source_name" "text" NOT NULL,
    "performer_id" "uuid",
    "change_reason" "text" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vmp_source_assignment_resolutions_assignment_kind_check" CHECK (("assignment_kind" = ANY (ARRAY['qa'::"text", 'equipment_department'::"text"]))),
    CONSTRAINT "vmp_source_assignment_resolutions_source_check" CHECK (("source" = ANY (ARRAY['sheet_qa'::"text", 'sheet_other_staff'::"text"])))
);


--
-- Name: vmp_source_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_source_rows" (
    "id" bigint NOT NULL,
    "source_tab" "text" NOT NULL,
    "row_number" integer NOT NULL,
    "payload" "jsonb" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_source_rows"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_source_rows" IS 'Bản thô từng dòng của 5 tab danh mục + tab sản phẩm GMP. Giữ cả dòng thiếu mã để đối chiếu.';


--
-- Name: vmp_source_rows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_source_rows" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vmp_source_rows_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vmp_source_workshop_scope_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_source_workshop_scope_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "performer_id" "uuid" NOT NULL,
    "department" "text" NOT NULL,
    "department_key" "text" NOT NULL,
    "area_code" "text" NOT NULL,
    "area_key" "text" NOT NULL,
    "line" "text",
    "line_key" "text",
    "valid_from" timestamp with time zone DEFAULT "transaction_timestamp"() NOT NULL,
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "transaction_timestamp"() NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "transaction_timestamp"() NOT NULL,
    "updated_by" "uuid",
    "change_reason" "text" NOT NULL,
    CONSTRAINT "vmp_source_workshop_grants_area_key" CHECK (((NULLIF("area_key", ''::"text") IS NOT NULL) AND ("area_key" = "public"."vmp_source_scope_key"("area_code")))),
    CONSTRAINT "vmp_source_workshop_grants_area_nonblank" CHECK ((NULLIF("btrim"("area_code"), ''::"text") IS NOT NULL)),
    CONSTRAINT "vmp_source_workshop_grants_department_key" CHECK (((NULLIF("department_key", ''::"text") IS NOT NULL) AND ("department_key" = "public"."vmp_source_scope_key"("department")))),
    CONSTRAINT "vmp_source_workshop_grants_department_nonblank" CHECK ((NULLIF("btrim"("department"), ''::"text") IS NOT NULL)),
    CONSTRAINT "vmp_source_workshop_grants_expiry" CHECK ((("expires_at" IS NULL) OR ("expires_at" > "valid_from"))),
    CONSTRAINT "vmp_source_workshop_grants_line_pair" CHECK (((("line" IS NULL) AND ("line_key" IS NULL)) OR (("line" IS NOT NULL) AND ("line_key" IS NOT NULL) AND (NULLIF("btrim"("line"), ''::"text") IS NOT NULL) AND (NULLIF("line_key", ''::"text") IS NOT NULL) AND ("line_key" = "public"."vmp_source_scope_key"("line"))))),
    CONSTRAINT "vmp_source_workshop_grants_reason" CHECK ((NULLIF("btrim"("change_reason"), ''::"text") IS NOT NULL)),
    CONSTRAINT "vmp_source_workshop_grants_version" CHECK (("version" > 0))
);


--
-- Name: vmp_staff_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vmp_staff_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "department" "text",
    "note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "vmp_staff_emails"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vmp_staff_emails" IS 'Danh bạ nhân sự. Thay cho tab "Danh_sach_Email" trong Google Sheet.';


--
-- Name: vmp_status_current; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."vmp_status_current" WITH ("security_invoker"='true') AS
 SELECT "pi"."id",
    "pi"."object_code",
    "pi"."validation_type",
    "pi"."deadline_vmp",
    "pi"."deadline_protocol",
    "pi"."deadline_validation",
    "pi"."deadline_report",
    "pi"."computed_status",
    "pi"."status_protocol",
    "pi"."status_validation",
    "pi"."status_report",
    "pi"."status_vmp",
    "pi"."is_doc_complete",
    "pi"."has_mismatch",
    "pi"."owner_name",
    "pi"."criticality",
    "pi"."criticality_score",
    "o"."name" AS "object_name",
    "o"."classification",
    "o"."department",
    "d"."short_name" AS "dept_short",
        CASE
            WHEN ("pi"."status_vmp" = 'completed'::"public"."phase_status") THEN 'done'::"text"
            WHEN (("pi"."deadline_vmp" IS NOT NULL) AND ("pi"."deadline_vmp" < CURRENT_DATE) AND ("pi"."status_vmp" <> 'completed'::"public"."phase_status")) THEN 'over'::"text"
            WHEN (("pi"."status_validation" = 'in_progress'::"public"."phase_status") OR ("pi"."status_protocol" = 'completed'::"public"."phase_status")) THEN 'prog'::"text"
            WHEN (("pi"."deadline_protocol" IS NOT NULL) AND (("pi"."deadline_protocol" - CURRENT_DATE) > 30)) THEN 'plan'::"text"
            ELSE 'todo'::"text"
        END AS "derived_status",
        CASE
            WHEN ("pi"."deadline_vmp" IS NOT NULL) THEN ("pi"."deadline_vmp" - CURRENT_DATE)
            ELSE NULL::integer
        END AS "days_to_deadline",
        CASE
            WHEN (("pi"."status_validation" = 'completed'::"public"."phase_status") AND ("pi"."status_report" <> 'completed'::"public"."phase_status")) THEN 'val_done_doc_pending'::"text"
            WHEN (("pi"."status_validation" <> 'completed'::"public"."phase_status") AND ("pi"."status_report" = 'completed'::"public"."phase_status")) THEN 'doc_done_val_pending'::"text"
            ELSE NULL::"text"
        END AS "derived_mismatch"
   FROM (("public"."vmp_plan_items" "pi"
     JOIN "public"."vmp_objects" "o" ON (("pi"."object_code" = "o"."code")))
     LEFT JOIN "public"."departments" "d" ON (("o"."department" = "d"."id")))
  WHERE (("pi"."is_active" = true) AND ("o"."is_active" = true));


--
-- Name: workflow_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."workflow_runs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workflow_id" "text" NOT NULL,
    "workflow_name" "text" NOT NULL,
    "execution_id" "text",
    "status" "public"."workflow_status" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "input_summary" "jsonb",
    "output_summary" "jsonb",
    "error_message" "text",
    "error_details" "jsonb",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "parent_run_id" "uuid",
    "triggered_by" "text" DEFAULT 'schedule'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: audit_logs_purge_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_logs_purge_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_logs_purge_log_id_seq"'::"regclass");


--
-- Name: sheet_sync_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sheet_sync_outbox" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sheet_sync_outbox_id_seq"'::"regclass");


--
-- Name: vmp_ai_bi_danh id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_bi_danh" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vmp_ai_bi_danh_id_seq"'::"regclass");


--
-- Name: vmp_ai_cache_ngu_nghia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_cache_ngu_nghia" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vmp_ai_cache_ngu_nghia_id_seq"'::"regclass");


--
-- Name: vmp_ai_cau_hoi_vang id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_cau_hoi_vang" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vmp_ai_cau_hoi_vang_id_seq"'::"regclass");


--
-- Name: vmp_ai_cham_diem_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_cham_diem_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vmp_ai_cham_diem_log_id_seq"'::"regclass");


--
-- Name: vmp_chat_giong id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_chat_giong" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vmp_chat_giong_id_seq"'::"regclass");


--
-- Name: vmp_chat_loi_cho id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_chat_loi_cho" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vmp_chat_loi_cho_id_seq"'::"regclass");


--
-- Name: vmp_deadline_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_deadline_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vmp_deadline_rules_id_seq"'::"regclass");


--
-- Name: vmp_rls_siet_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_rls_siet_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vmp_rls_siet_log_id_seq"'::"regclass");


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");


--
-- Name: audit_logs_purge_log audit_logs_purge_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_logs_purge_log"
    ADD CONSTRAINT "audit_logs_purge_log_pkey" PRIMARY KEY ("id");


--
-- Name: data_quality_issues data_quality_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_quality_issues"
    ADD CONSTRAINT "data_quality_issues_pkey" PRIMARY KEY ("id");


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: sheet_sync_outbox sheet_sync_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sheet_sync_outbox"
    ADD CONSTRAINT "sheet_sync_outbox_pkey" PRIMARY KEY ("id");


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_pkey" PRIMARY KEY ("key");


--
-- Name: vmp_ai_bi_danh vmp_ai_bi_danh_bi_danh_loai_gia_tri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_bi_danh"
    ADD CONSTRAINT "vmp_ai_bi_danh_bi_danh_loai_gia_tri_key" UNIQUE ("bi_danh", "loai", "gia_tri");


--
-- Name: vmp_ai_bi_danh vmp_ai_bi_danh_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_bi_danh"
    ADD CONSTRAINT "vmp_ai_bi_danh_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_bo_kiem vmp_ai_bo_kiem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_bo_kiem"
    ADD CONSTRAINT "vmp_ai_bo_kiem_pkey" PRIMARY KEY ("ma");


--
-- Name: vmp_ai_bo_nho vmp_ai_bo_nho_nguoi_noi_dung_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_bo_nho"
    ADD CONSTRAINT "vmp_ai_bo_nho_nguoi_noi_dung_key" UNIQUE ("nguoi", "noi_dung");


--
-- Name: vmp_ai_bo_nho vmp_ai_bo_nho_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_bo_nho"
    ADD CONSTRAINT "vmp_ai_bo_nho_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_cache vmp_ai_cache_khoa_cau_hoi_dau_van_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_cache"
    ADD CONSTRAINT "vmp_ai_cache_khoa_cau_hoi_dau_van_key" UNIQUE ("khoa_cau_hoi", "dau_van");


--
-- Name: vmp_ai_cache_ngu_nghia vmp_ai_cache_ngu_nghia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_cache_ngu_nghia"
    ADD CONSTRAINT "vmp_ai_cache_ngu_nghia_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_cache vmp_ai_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_cache"
    ADD CONSTRAINT "vmp_ai_cache_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_cau_hoi_vang vmp_ai_cau_hoi_vang_cau_hoi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_cau_hoi_vang"
    ADD CONSTRAINT "vmp_ai_cau_hoi_vang_cau_hoi_key" UNIQUE ("cau_hoi");


--
-- Name: vmp_ai_cau_hoi_vang vmp_ai_cau_hoi_vang_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_cau_hoi_vang"
    ADD CONSTRAINT "vmp_ai_cau_hoi_vang_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_cham_diem_log vmp_ai_cham_diem_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_cham_diem_log"
    ADD CONSTRAINT "vmp_ai_cham_diem_log_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_chat_log vmp_ai_chat_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_chat_log"
    ADD CONSTRAINT "vmp_ai_chat_log_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_dong_nghia vmp_ai_dong_nghia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_dong_nghia"
    ADD CONSTRAINT "vmp_ai_dong_nghia_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_dong_nghia vmp_ai_dong_nghia_tu_chuan_cach_goi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_dong_nghia"
    ADD CONSTRAINT "vmp_ai_dong_nghia_tu_chuan_cach_goi_key" UNIQUE ("tu_chuan", "cach_goi");


--
-- Name: vmp_ai_giong vmp_ai_giong_ngu_canh_cau_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_giong"
    ADD CONSTRAINT "vmp_ai_giong_ngu_canh_cau_key" UNIQUE ("ngu_canh", "cau");


--
-- Name: vmp_ai_giong vmp_ai_giong_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_giong"
    ADD CONSTRAINT "vmp_ai_giong_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_hoi_thoai vmp_ai_hoi_thoai_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_hoi_thoai"
    ADD CONSTRAINT "vmp_ai_hoi_thoai_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_mo_hinh vmp_ai_mo_hinh_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_mo_hinh"
    ADD CONSTRAINT "vmp_ai_mo_hinh_pkey" PRIMARY KEY ("ma");


--
-- Name: vmp_ai_report_cache vmp_ai_report_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_report_cache"
    ADD CONSTRAINT "vmp_ai_report_cache_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_reviews vmp_ai_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_reviews"
    ADD CONSTRAINT "vmp_ai_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_ai_trich_dan_tam vmp_ai_trich_dan_tam_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_trich_dan_tam"
    ADD CONSTRAINT "vmp_ai_trich_dan_tam_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_alert_recipients vmp_alert_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_alert_recipients"
    ADD CONSTRAINT "vmp_alert_recipients_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_assignment_matrix vmp_assignment_matrix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_assignment_matrix"
    ADD CONSTRAINT "vmp_assignment_matrix_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_assignment_rules vmp_assignment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_assignment_rules"
    ADD CONSTRAINT "vmp_assignment_rules_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_authorization_revision vmp_authorization_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_authorization_revision"
    ADD CONSTRAINT "vmp_authorization_revision_pkey" PRIMARY KEY ("singleton");


--
-- Name: vmp_catalog_changes vmp_catalog_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_catalog_changes"
    ADD CONSTRAINT "vmp_catalog_changes_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_catalog_import_batches vmp_catalog_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_catalog_import_batches"
    ADD CONSTRAINT "vmp_catalog_import_batches_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_catalog_import_rows vmp_catalog_import_rows_batch_id_row_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_catalog_import_rows"
    ADD CONSTRAINT "vmp_catalog_import_rows_batch_id_row_number_key" UNIQUE ("batch_id", "row_number");


--
-- Name: vmp_catalog_import_rows vmp_catalog_import_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_catalog_import_rows"
    ADD CONSTRAINT "vmp_catalog_import_rows_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_chat_giong vmp_chat_giong_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_chat_giong"
    ADD CONSTRAINT "vmp_chat_giong_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_chat_loi_cho vmp_chat_loi_cho_noi_dung_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_chat_loi_cho"
    ADD CONSTRAINT "vmp_chat_loi_cho_noi_dung_key" UNIQUE ("noi_dung");


--
-- Name: vmp_chat_loi_cho vmp_chat_loi_cho_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_chat_loi_cho"
    ADD CONSTRAINT "vmp_chat_loi_cho_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_danh_gia_anh_huong vmp_danh_gia_anh_huong_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_danh_gia_anh_huong"
    ADD CONSTRAINT "vmp_danh_gia_anh_huong_pkey" PRIMARY KEY ("ma_doi_tuong");


--
-- Name: vmp_deadline_rules vmp_deadline_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_deadline_rules"
    ADD CONSTRAINT "vmp_deadline_rules_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_deadline_rules vmp_deadline_rules_report_class_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_deadline_rules"
    ADD CONSTRAINT "vmp_deadline_rules_report_class_key" UNIQUE ("report_class");


--
-- Name: vmp_email_cho_phep vmp_email_cho_phep_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_email_cho_phep"
    ADD CONSTRAINT "vmp_email_cho_phep_pkey" PRIMARY KEY ("email");


--
-- Name: vmp_item_assignments vmp_item_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_item_assignments"
    ADD CONSTRAINT "vmp_item_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_kb_chunks vmp_kb_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_kb_chunks"
    ADD CONSTRAINT "vmp_kb_chunks_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_kb_chunks vmp_kb_chunks_source_ord_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_kb_chunks"
    ADD CONSTRAINT "vmp_kb_chunks_source_ord_key" UNIQUE ("source", "ord");


--
-- Name: vmp_kb_documents vmp_kb_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_kb_documents"
    ADD CONSTRAINT "vmp_kb_documents_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_legacy_action_map vmp_legacy_action_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_legacy_action_map"
    ADD CONSTRAINT "vmp_legacy_action_map_pkey" PRIMARY KEY ("hanh_dong_cu");


--
-- Name: vmp_notifications vmp_notifications_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_notifications"
    ADD CONSTRAINT "vmp_notifications_idempotency_key_key" UNIQUE ("idempotency_key");


--
-- Name: vmp_notifications vmp_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_notifications"
    ADD CONSTRAINT "vmp_notifications_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_objects vmp_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_objects"
    ADD CONSTRAINT "vmp_objects_pkey" PRIMARY KEY ("code");


--
-- Name: vmp_performers vmp_performers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_performers"
    ADD CONSTRAINT "vmp_performers_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_plan_items vmp_plan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_plan_items"
    ADD CONSTRAINT "vmp_plan_items_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_products_gmp vmp_products_gmp_bfo_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_products_gmp"
    ADD CONSTRAINT "vmp_products_gmp_bfo_code_key" UNIQUE ("bfo_code");


--
-- Name: vmp_products_gmp vmp_products_gmp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_products_gmp"
    ADD CONSTRAINT "vmp_products_gmp_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_progress_events vmp_progress_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_progress_events"
    ADD CONSTRAINT "vmp_progress_events_pkey" PRIMARY KEY ("event_id");


--
-- Name: vmp_report_snapshots vmp_report_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_report_snapshots"
    ADD CONSTRAINT "vmp_report_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_rls_siet_log vmp_rls_siet_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_rls_siet_log"
    ADD CONSTRAINT "vmp_rls_siet_log_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_role_permissions vmp_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_role_permissions"
    ADD CONSTRAINT "vmp_role_permissions_pkey" PRIMARY KEY ("hanh_dong", "vai_tro");


--
-- Name: vmp_scope_areas vmp_scope_areas_factory_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_scope_areas"
    ADD CONSTRAINT "vmp_scope_areas_factory_id_code_key" UNIQUE ("factory_id", "code");


--
-- Name: vmp_scope_areas vmp_scope_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_scope_areas"
    ADD CONSTRAINT "vmp_scope_areas_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_scope_factories vmp_scope_factories_department_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_scope_factories"
    ADD CONSTRAINT "vmp_scope_factories_department_id_code_key" UNIQUE ("department_id", "code");


--
-- Name: vmp_scope_factories vmp_scope_factories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_scope_factories"
    ADD CONSTRAINT "vmp_scope_factories_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_scope_lines vmp_scope_lines_area_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_scope_lines"
    ADD CONSTRAINT "vmp_scope_lines_area_id_code_key" UNIQUE ("area_id", "code");


--
-- Name: vmp_scope_lines vmp_scope_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_scope_lines"
    ADD CONSTRAINT "vmp_scope_lines_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_screen_permissions vmp_screen_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_screen_permissions"
    ADD CONSTRAINT "vmp_screen_permissions_pkey" PRIMARY KEY ("business_role", "screen_id");


--
-- Name: vmp_sheet_row_extras vmp_sheet_row_extras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_sheet_row_extras"
    ADD CONSTRAINT "vmp_sheet_row_extras_pkey" PRIMARY KEY ("sync_run_id", "sheet_row_number");


--
-- Name: vmp_sheet_rows vmp_sheet_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_sheet_rows"
    ADD CONSTRAINT "vmp_sheet_rows_pkey" PRIMARY KEY ("sync_run_id", "sheet_row_number");


--
-- Name: vmp_sheet_sync_backups vmp_sheet_sync_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_sheet_sync_backups"
    ADD CONSTRAINT "vmp_sheet_sync_backups_pkey" PRIMARY KEY ("sync_run_id", "dataset");


--
-- Name: vmp_sheet_sync_runs vmp_sheet_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_sheet_sync_runs"
    ADD CONSTRAINT "vmp_sheet_sync_runs_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_source_assignment_resolutions vmp_source_assignment_resolutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_assignment_resolutions"
    ADD CONSTRAINT "vmp_source_assignment_resolutions_pkey" PRIMARY KEY ("validation_code", "assignment_kind", "source", "normalized_source_name");


--
-- Name: vmp_source_objects vmp_source_objects_object_kind_object_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_objects"
    ADD CONSTRAINT "vmp_source_objects_object_kind_object_code_key" UNIQUE ("object_kind", "object_code");


--
-- Name: vmp_source_objects vmp_source_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_objects"
    ADD CONSTRAINT "vmp_source_objects_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_source_rows vmp_source_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_rows"
    ADD CONSTRAINT "vmp_source_rows_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_source_rows vmp_source_rows_source_tab_row_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_rows"
    ADD CONSTRAINT "vmp_source_rows_source_tab_row_number_key" UNIQUE ("source_tab", "row_number");


--
-- Name: vmp_source_workshop_scope_grants vmp_source_workshop_scope_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_workshop_scope_grants"
    ADD CONSTRAINT "vmp_source_workshop_scope_grants_pkey" PRIMARY KEY ("id");


--
-- Name: vmp_staff_emails vmp_staff_emails_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_staff_emails"
    ADD CONSTRAINT "vmp_staff_emails_email_key" UNIQUE ("email");


--
-- Name: vmp_staff_emails vmp_staff_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_staff_emails"
    ADD CONSTRAINT "vmp_staff_emails_pkey" PRIMARY KEY ("id");


--
-- Name: workflow_runs workflow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id");


--
-- Name: idx_ai_cache_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ai_cache_created" ON "public"."vmp_ai_report_cache" USING "btree" ("created_at" DESC);


--
-- Name: idx_ai_cache_tim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ai_cache_tim" ON "public"."vmp_ai_cache" USING "btree" ("khoa_cau_hoi", "dau_van", "het_han_luc");


--
-- Name: idx_ai_chat_log_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ai_chat_log_time" ON "public"."vmp_ai_chat_log" USING "btree" ("created_at" DESC);


--
-- Name: idx_ai_review_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ai_review_approved" ON "public"."vmp_ai_reviews" USING "btree" ("is_approved");


--
-- Name: idx_ai_review_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ai_review_snapshot" ON "public"."vmp_ai_reviews" USING "btree" ("snapshot_id");


--
-- Name: idx_alert_recipients_ai_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_alert_recipients_ai_report" ON "public"."vmp_alert_recipients" USING "btree" ("ai_report_enabled", "ai_report_schedule") WHERE "ai_report_enabled";


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_action" ON "public"."audit_logs" USING "btree" ("action");


--
-- Name: idx_audit_archive_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_archive_time" ON "public"."audit_logs_archive" USING "btree" ("created_at" DESC);


--
-- Name: idx_audit_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_record" ON "public"."audit_logs" USING "btree" ("record_id");


--
-- Name: idx_audit_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_table" ON "public"."audit_logs" USING "btree" ("table_name");


--
-- Name: idx_audit_table_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_table_time" ON "public"."audit_logs" USING "btree" ("table_name", "created_at" DESC);


--
-- Name: idx_audit_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_time" ON "public"."audit_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_user" ON "public"."audit_logs" USING "btree" ("user_id");


--
-- Name: idx_bo_nho_nguoi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_bo_nho_nguoi" ON "public"."vmp_ai_bo_nho" USING "btree" ("nguoi", "tang", "quan_trong" DESC);


--
-- Name: idx_dept_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_dept_active" ON "public"."departments" USING "btree" ("is_active");


--
-- Name: idx_dq_detected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_dq_detected" ON "public"."data_quality_issues" USING "btree" ("detected_at" DESC);


--
-- Name: idx_dq_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_dq_item" ON "public"."data_quality_issues" USING "btree" ("plan_item_id");


--
-- Name: idx_dq_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_dq_resolved" ON "public"."data_quality_issues" USING "btree" ("is_resolved");


--
-- Name: idx_dq_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_dq_severity" ON "public"."data_quality_issues" USING "btree" ("severity");


--
-- Name: idx_dq_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_dq_type" ON "public"."data_quality_issues" USING "btree" ("issue_type");


--
-- Name: idx_hoi_thoai_phien; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_hoi_thoai_phien" ON "public"."vmp_ai_hoi_thoai" USING "btree" ("phien", "tao_luc" DESC);


--
-- Name: idx_kb_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_kb_chunks_embedding" ON "public"."vmp_kb_chunks" USING "ivfflat" ("embedding" "extensions"."vector_cosine_ops") WITH ("lists"='20');


--
-- Name: idx_kb_chunks_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_kb_chunks_source" ON "public"."vmp_kb_chunks" USING "btree" ("source");


--
-- Name: idx_kb_docs_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_kb_docs_embedding" ON "public"."vmp_kb_documents" USING "ivfflat" ("embedding" "extensions"."vector_cosine_ops") WITH ("lists"='20');


--
-- Name: idx_kb_docs_meta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_kb_docs_meta" ON "public"."vmp_kb_documents" USING "gin" ("metadata");


--
-- Name: idx_kb_docs_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_kb_docs_trgm" ON "public"."vmp_kb_documents" USING "gin" ("public"."vmp_khong_dau"("content") "extensions"."gin_trgm_ops");


--
-- Name: idx_notif_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notif_created" ON "public"."vmp_notifications" USING "btree" ("created_at" DESC);


--
-- Name: idx_notif_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notif_idempotency" ON "public"."vmp_notifications" USING "btree" ("idempotency_key");


--
-- Name: idx_notif_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notif_recipient" ON "public"."vmp_notifications" USING "btree" ("recipient_email");


--
-- Name: idx_notif_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notif_status" ON "public"."vmp_notifications" USING "btree" ("status");


--
-- Name: idx_notif_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notif_type" ON "public"."vmp_notifications" USING "btree" ("notification_type");


--
-- Name: idx_outbox_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_outbox_code" ON "public"."sheet_sync_outbox" USING "btree" ("validation_code", "status");


--
-- Name: idx_outbox_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_outbox_due" ON "public"."sheet_sync_outbox" USING "btree" ("next_attempt_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'error'::"text"]));


--
-- Name: idx_outbox_one_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_outbox_one_pending" ON "public"."sheet_sync_outbox" USING "btree" ("validation_code") WHERE ("status" = 'pending'::"text");


--
-- Name: idx_plan_active_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_active_year" ON "public"."vmp_plan_items" USING "btree" ("year", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_plan_dl_proto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_dl_proto" ON "public"."vmp_plan_items" USING "btree" ("deadline_protocol");


--
-- Name: idx_plan_dl_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_dl_report" ON "public"."vmp_plan_items" USING "btree" ("deadline_report");


--
-- Name: idx_plan_dl_vmp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_dl_vmp" ON "public"."vmp_plan_items" USING "btree" ("deadline_vmp");


--
-- Name: idx_plan_item_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_item_state" ON "public"."vmp_plan_items" USING "btree" ("year", "item_state");


--
-- Name: idx_plan_mismatch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_mismatch" ON "public"."vmp_plan_items" USING "btree" ("has_mismatch") WHERE ("has_mismatch" IS NOT NULL);


--
-- Name: idx_plan_obj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_obj" ON "public"."vmp_plan_items" USING "btree" ("object_code");


--
-- Name: idx_plan_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_status" ON "public"."vmp_plan_items" USING "btree" ("computed_status");


--
-- Name: idx_plan_validation_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_plan_validation_code" ON "public"."vmp_plan_items" USING "btree" ("validation_code");


--
-- Name: idx_plan_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_visible" ON "public"."vmp_plan_items" USING "btree" ("year", "is_active", "missing_from_sheet") WHERE (("is_active" = true) AND ("missing_from_sheet" = false));


--
-- Name: idx_plan_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_plan_year" ON "public"."vmp_plan_items" USING "btree" ("year");


--
-- Name: idx_profiles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_active" ON "public"."profiles" USING "btree" ("is_active");


--
-- Name: idx_profiles_active_role_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_active_role_department" ON "public"."profiles" USING "btree" ("role", "department", "id") WHERE ("is_active" IS TRUE);


--
-- Name: idx_profiles_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_dept" ON "public"."profiles" USING "btree" ("department");


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");


--
-- Name: idx_progress_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_progress_item" ON "public"."vmp_progress_events" USING "btree" ("plan_item_id");


--
-- Name: idx_progress_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_progress_phase" ON "public"."vmp_progress_events" USING "btree" ("phase");


--
-- Name: idx_progress_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_progress_time" ON "public"."vmp_progress_events" USING "btree" ("changed_at" DESC);


--
-- Name: idx_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_progress_user" ON "public"."vmp_progress_events" USING "btree" ("changed_by");


--
-- Name: idx_snapshot_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_snapshot_created" ON "public"."vmp_report_snapshots" USING "btree" ("created_at" DESC);


--
-- Name: idx_snapshot_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_snapshot_period" ON "public"."vmp_report_snapshots" USING "btree" ("report_period");


--
-- Name: idx_snapshot_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_snapshot_status" ON "public"."vmp_report_snapshots" USING "btree" ("status");


--
-- Name: idx_snapshot_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_snapshot_year" ON "public"."vmp_report_snapshots" USING "btree" ("year");


--
-- Name: idx_source_objects_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_source_objects_active" ON "public"."vmp_source_objects" USING "btree" ("validate_flag") WHERE ("validate_flag" = 'y'::"text");


--
-- Name: idx_source_objects_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_source_objects_code" ON "public"."vmp_source_objects" USING "btree" ("object_code");


--
-- Name: idx_source_objects_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_source_objects_dept" ON "public"."vmp_source_objects" USING "btree" ("department");


--
-- Name: idx_source_objects_edited; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_source_objects_edited" ON "public"."vmp_source_objects" USING "btree" ("edited_on_web") WHERE "edited_on_web";


--
-- Name: idx_source_objects_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_source_objects_kind" ON "public"."vmp_source_objects" USING "btree" ("object_kind");


--
-- Name: idx_trich_dan_tam_phien; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_trich_dan_tam_phien" ON "public"."vmp_ai_trich_dan_tam" USING "btree" ("phien", "created_at");


--
-- Name: idx_vmp_item_assignments_active_performer_validation_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_item_assignments_active_performer_validation_kind" ON "public"."vmp_item_assignments" USING "btree" ("performer_id", "validation_code", "assignment_kind") WHERE "is_active";


--
-- Name: idx_vmp_item_assignments_active_validation_performer_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_item_assignments_active_validation_performer_kind" ON "public"."vmp_item_assignments" USING "btree" ("validation_code", "performer_id", "assignment_kind") WHERE "is_active";


--
-- Name: idx_vmp_obj_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_obj_active" ON "public"."vmp_objects" USING "btree" ("is_active");


--
-- Name: idx_vmp_obj_cls; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_obj_cls" ON "public"."vmp_objects" USING "btree" ("classification");


--
-- Name: idx_vmp_obj_crit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_obj_crit" ON "public"."vmp_objects" USING "btree" ("criticality");


--
-- Name: idx_vmp_obj_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_obj_dept" ON "public"."vmp_objects" USING "btree" ("department");


--
-- Name: idx_vmp_objects_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_objects_updated_at" ON "public"."vmp_objects" USING "btree" ("updated_at" DESC);


--
-- Name: idx_vmp_performers_active_candidate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_performers_active_candidate" ON "public"."vmp_performers" USING "btree" ("access_class", "normalized_full_name", "id") WHERE ("is_active" AND ("user_id" IS NOT NULL));


--
-- Name: idx_vmp_plan_items_departments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_plan_items_departments" ON "public"."vmp_plan_items" USING "gin" ("departments");


--
-- Name: idx_vmp_plan_items_execution_departments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_plan_items_execution_departments" ON "public"."vmp_plan_items" USING "gin" ("execution_departments");


--
-- Name: idx_vmp_plan_items_object_year_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_plan_items_object_year_active" ON "public"."vmp_plan_items" USING "btree" ("object_code", "year", "is_active", "validation_code");


--
-- Name: idx_vmp_plan_items_year_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_plan_items_year_updated_at" ON "public"."vmp_plan_items" USING "btree" ("year", "updated_at" DESC);


--
-- Name: idx_vmp_sheet_row_extras_validation_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_sheet_row_extras_validation_code" ON "public"."vmp_sheet_row_extras" USING "btree" ("validation_code");


--
-- Name: idx_vmp_sheet_rows_object_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_sheet_rows_object_code" ON "public"."vmp_sheet_rows" USING "btree" ("object_code");


--
-- Name: idx_vmp_sheet_rows_validation_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_sheet_rows_validation_code" ON "public"."vmp_sheet_rows" USING "btree" ("validation_code");


--
-- Name: idx_vmp_source_objects_active_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_source_objects_active_owner" ON "public"."vmp_source_objects" USING "btree" ("owner_person_id", "id") WHERE (("is_active" IS TRUE) AND ("owner_person_id" IS NOT NULL));


--
-- Name: idx_vmp_source_objects_active_scope_area; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_source_objects_active_scope_area" ON "public"."vmp_source_objects" USING "btree" ("public"."vmp_source_scope_key"("department"), "public"."vmp_source_scope_key"("area_code"), "id") WHERE (("is_active" IS TRUE) AND (NULLIF("public"."vmp_source_scope_key"("department"), ''::"text") IS NOT NULL) AND (NULLIF("public"."vmp_source_scope_key"("area_code"), ''::"text") IS NOT NULL));


--
-- Name: idx_vmp_source_objects_active_scope_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_source_objects_active_scope_line" ON "public"."vmp_source_objects" USING "btree" ("public"."vmp_source_scope_key"("department"), "public"."vmp_source_scope_key"("area_code"), "public"."vmp_source_scope_key"("line"), "id") WHERE (("is_active" IS TRUE) AND (NULLIF("public"."vmp_source_scope_key"("department"), ''::"text") IS NOT NULL) AND (NULLIF("public"."vmp_source_scope_key"("area_code"), ''::"text") IS NOT NULL) AND (NULLIF("public"."vmp_source_scope_key"("line"), ''::"text") IS NOT NULL));


--
-- Name: idx_vmp_source_objects_active_support; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_source_objects_active_support" ON "public"."vmp_source_objects" USING "btree" ("support_person_id", "id") WHERE (("is_active" IS TRUE) AND ("support_person_id" IS NOT NULL));


--
-- Name: idx_vmp_source_objects_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_source_objects_list" ON "public"."vmp_source_objects" USING "btree" ("object_kind", "is_active", "object_code", "id");


--
-- Name: idx_vmp_source_workshop_grants_area; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_source_workshop_grants_area" ON "public"."vmp_source_workshop_scope_grants" USING "btree" ("department_key", "area_key", "performer_id") WHERE ("is_active" AND ("line_key" IS NULL));


--
-- Name: idx_vmp_source_workshop_grants_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_source_workshop_grants_line" ON "public"."vmp_source_workshop_scope_grants" USING "btree" ("department_key", "area_key", "line_key", "performer_id") WHERE ("is_active" AND ("line_key" IS NOT NULL));


--
-- Name: idx_vmp_source_workshop_grants_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_source_workshop_grants_person" ON "public"."vmp_source_workshop_scope_grants" USING "btree" ("performer_id", "is_active", "expires_at", "id");


--
-- Name: idx_vmp_sync_runs_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vmp_sync_runs_status_created" ON "public"."vmp_sheet_sync_runs" USING "btree" ("status", "created_at" DESC);


--
-- Name: uq_alert_recipients_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_alert_recipients_scope" ON "public"."vmp_alert_recipients" USING "btree" ("lower"("email"), "scope_type", COALESCE("scope", ''::"text"));


--
-- Name: uq_data_quality_unresolved_validation_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_data_quality_unresolved_validation_issue" ON "public"."data_quality_issues" USING "btree" ("plan_item_id", "issue_type", "message") WHERE ("is_resolved" IS NOT TRUE);


--
-- Name: uq_vmp_source_objects_active_object_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_vmp_source_objects_active_object_code" ON "public"."vmp_source_objects" USING "btree" ("object_code") WHERE ("is_active" IS TRUE);


--
-- Name: uq_vmp_source_workshop_grants_active_area; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_vmp_source_workshop_grants_active_area" ON "public"."vmp_source_workshop_scope_grants" USING "btree" ("performer_id", "department_key", "area_key") WHERE ("is_active" AND ("line_key" IS NULL));


--
-- Name: uq_vmp_source_workshop_grants_active_line; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_vmp_source_workshop_grants_active_line" ON "public"."vmp_source_workshop_scope_grants" USING "btree" ("performer_id", "department_key", "area_key", "line_key") WHERE ("is_active" AND ("line_key" IS NOT NULL));


--
-- Name: uq_vmp_source_workshop_grants_id_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_vmp_source_workshop_grants_id_version" ON "public"."vmp_source_workshop_scope_grants" USING "btree" ("id", "version");


--
-- Name: vmp_ai_bi_danh_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_ai_bi_danh_idx" ON "public"."vmp_ai_bi_danh" USING "btree" ("bi_danh");


--
-- Name: vmp_assignment_matrix_bo_phan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_assignment_matrix_bo_phan" ON "public"."vmp_assignment_matrix" USING "btree" ("department", "validation_type");


--
-- Name: vmp_assignment_matrix_o; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vmp_assignment_matrix_o" ON "public"."vmp_assignment_matrix" USING "btree" ("staff_name", "validation_type", "line");


--
-- Name: vmp_cache_nn_khoa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_cache_nn_khoa_idx" ON "public"."vmp_ai_cache_ngu_nghia" USING "btree" ("cau_hoi_khoa") WHERE "is_valid";


--
-- Name: vmp_cache_nn_valid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_cache_nn_valid_idx" ON "public"."vmp_ai_cache_ngu_nghia" USING "btree" ("is_valid", "created_at");


--
-- Name: vmp_cache_nn_vector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_cache_nn_vector_idx" ON "public"."vmp_ai_cache_ngu_nghia" USING "hnsw" ("vector" "extensions"."vector_cosine_ops");


--
-- Name: vmp_catalog_changes_dang_cho; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_catalog_changes_dang_cho" ON "public"."vmp_catalog_changes" USING "btree" ("object_kind", "object_code") WHERE ("status" = ANY (ARRAY['pending'::"text", 'previewed'::"text"]));


--
-- Name: vmp_catalog_import_batches_file_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vmp_catalog_import_batches_file_uq" ON "public"."vmp_catalog_import_batches" USING "btree" ("uploaded_by", "dataset", "file_hash") WHERE ("file_hash" IS NOT NULL);


--
-- Name: vmp_chat_giong_bat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_chat_giong_bat_idx" ON "public"."vmp_chat_giong" USING "btree" ("bat", "uu_tien");


--
-- Name: vmp_chat_loi_cho_bat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_chat_loi_cho_bat_idx" ON "public"."vmp_chat_loi_cho" USING "btree" ("bat", "loai");


--
-- Name: vmp_item_assignments_linked_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vmp_item_assignments_linked_uniq" ON "public"."vmp_item_assignments" USING "btree" ("validation_code", "performer_id", "assignment_kind", "source") WHERE ("performer_id" IS NOT NULL);


--
-- Name: vmp_item_assignments_one_active_qa_person; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vmp_item_assignments_one_active_qa_person" ON "public"."vmp_item_assignments" USING "btree" ("validation_code", "performer_id", "assignment_kind") WHERE (("performer_id" IS NOT NULL) AND ("assignment_kind" = 'qa'::"text") AND "is_active");


--
-- Name: vmp_item_assignments_one_active_qa_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vmp_item_assignments_one_active_qa_primary" ON "public"."vmp_item_assignments" USING "btree" ("validation_code") WHERE (("assignment_kind" = 'qa'::"text") AND ("assignment_role" = 'primary'::"text") AND "is_active");


--
-- Name: vmp_item_assignments_unresolved_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vmp_item_assignments_unresolved_uniq" ON "public"."vmp_item_assignments" USING "btree" ("validation_code", "normalized_staff_name", "assignment_kind", "source") WHERE ("performer_id" IS NULL);


--
-- Name: vmp_item_assignments_user_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_item_assignments_user_item_idx" ON "public"."vmp_item_assignments" USING "btree" ("user_id", "validation_code") WHERE "is_active";


--
-- Name: vmp_performers_employee_code_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vmp_performers_employee_code_uniq" ON "public"."vmp_performers" USING "btree" ("lower"("btrim"("employee_code"))) WHERE (NULLIF("btrim"("employee_code"), ''::"text") IS NOT NULL);


--
-- Name: vmp_performers_normalized_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_performers_normalized_name_idx" ON "public"."vmp_performers" USING "btree" ("normalized_full_name");


--
-- Name: vmp_performers_one_active_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vmp_performers_one_active_per_user" ON "public"."vmp_performers" USING "btree" ("user_id") WHERE ("is_active" AND ("user_id" IS NOT NULL));


--
-- Name: vmp_performers_user_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vmp_performers_user_id_uniq" ON "public"."vmp_performers" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);


--
-- Name: vmp_plan_items_owner_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_plan_items_owner_person_idx" ON "public"."vmp_plan_items" USING "btree" ("owner_person_id") WHERE ("owner_person_id" IS NOT NULL);


--
-- Name: vmp_source_objects_owner_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_source_objects_owner_person_idx" ON "public"."vmp_source_objects" USING "btree" ("owner_person_id") WHERE ("owner_person_id" IS NOT NULL);


--
-- Name: vmp_source_objects_support_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vmp_source_objects_support_person_idx" ON "public"."vmp_source_objects" USING "btree" ("support_person_id") WHERE ("support_person_id" IS NOT NULL);


--
-- Name: vmp_plan_items audit_vmp_plan_items_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "audit_vmp_plan_items_v2" AFTER INSERT OR DELETE OR UPDATE ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_plan_item_changes_v2"();


--
-- Name: vmp_ai_bi_danh cache_nn_vo_hieu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "cache_nn_vo_hieu" AFTER INSERT OR DELETE OR UPDATE ON "public"."vmp_ai_bi_danh" FOR EACH STATEMENT EXECUTE FUNCTION "public"."vmp_cache_nn_vo_hieu"();


--
-- Name: vmp_chat_giong cache_nn_vo_hieu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "cache_nn_vo_hieu" AFTER INSERT OR DELETE OR UPDATE ON "public"."vmp_chat_giong" FOR EACH STATEMENT EXECUTE FUNCTION "public"."vmp_cache_nn_vo_hieu"();


--
-- Name: vmp_kb_documents cache_nn_vo_hieu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "cache_nn_vo_hieu" AFTER INSERT OR DELETE OR UPDATE ON "public"."vmp_kb_documents" FOR EACH STATEMENT EXECUTE FUNCTION "public"."vmp_cache_nn_vo_hieu"();


--
-- Name: vmp_objects cache_nn_vo_hieu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "cache_nn_vo_hieu" AFTER INSERT OR DELETE OR UPDATE ON "public"."vmp_objects" FOR EACH STATEMENT EXECUTE FUNCTION "public"."vmp_cache_nn_vo_hieu"();


--
-- Name: vmp_plan_items cache_nn_vo_hieu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "cache_nn_vo_hieu" AFTER INSERT OR DELETE OR UPDATE ON "public"."vmp_plan_items" FOR EACH STATEMENT EXECUTE FUNCTION "public"."vmp_cache_nn_vo_hieu"();


--
-- Name: vmp_ai_chat_log ghi_dem_ai; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ghi_dem_ai" AFTER INSERT ON "public"."vmp_ai_chat_log" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_ai_ghi_dem"();


--
-- Name: vmp_plan_items init_status_text; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "init_status_text" BEFORE INSERT ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_init_status_text"();


--
-- Name: vmp_ai_hoi_thoai lang_dong_bo_nho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "lang_dong_bo_nho" AFTER INSERT ON "public"."vmp_ai_hoi_thoai" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_ai_lang_dong"();


--
-- Name: departments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."departments" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: profiles set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: system_config set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."system_config" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_alert_recipients set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_alert_recipients" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_assignment_matrix set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_assignment_matrix" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_deadline_rules set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_deadline_rules" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_item_assignments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_item_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_objects set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_objects" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_performers set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_performers" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_plan_items set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_products_gmp set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_products_gmp" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_scope_areas set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_scope_areas" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_scope_factories set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_scope_factories" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_scope_lines set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_scope_lines" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_source_assignment_resolutions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_source_assignment_resolutions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_source_objects set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_source_objects" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_staff_emails set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."vmp_staff_emails" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();


--
-- Name: vmp_plan_items sync_status_text; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "sync_status_text" BEFORE UPDATE ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_sync_status_text"();


--
-- Name: vmp_objects trg_audit_objects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_objects" AFTER INSERT OR DELETE OR UPDATE ON "public"."vmp_objects" FOR EACH ROW EXECUTE FUNCTION "public"."audit_object_changes"();


--
-- Name: vmp_plan_items trg_compute_flags; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_compute_flags" BEFORE INSERT OR UPDATE ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."compute_doc_flags"();


--
-- Name: vmp_plan_items trg_validate_plan_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_validate_plan_item" BEFORE INSERT OR UPDATE ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_plan_item_validation"();


--
-- Name: profiles tu_tao_ho_so_nhan_su; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "tu_tao_ho_so_nhan_su" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tu_tao_ho_so_nhan_su"();


--
-- Name: vmp_plan_items u_manual_planned_deadline_state; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "u_manual_planned_deadline_state" BEFORE UPDATE ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_preserve_manual_planned_deadline_state"();


--
-- Name: vmp_item_assignments vmp_authorization_revision_assignment_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_assignment_delete" AFTER DELETE ON "public"."vmp_item_assignments" FOR EACH ROW WHEN (("old"."assignment_kind" = 'equipment_department'::"text")) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_item_assignments vmp_authorization_revision_assignment_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_assignment_insert" AFTER INSERT ON "public"."vmp_item_assignments" FOR EACH ROW WHEN (("new"."assignment_kind" = 'equipment_department'::"text")) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_item_assignments vmp_authorization_revision_assignment_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_assignment_update" AFTER UPDATE OF "validation_code", "performer_id", "assignment_kind", "expires_at", "is_active" ON "public"."vmp_item_assignments" FOR EACH ROW WHEN ((((((("old"."validation_code" IS DISTINCT FROM "new"."validation_code") OR ("old"."performer_id" IS DISTINCT FROM "new"."performer_id")) OR ("old"."assignment_kind" IS DISTINCT FROM "new"."assignment_kind")) OR ("old"."expires_at" IS DISTINCT FROM "new"."expires_at")) OR ("old"."is_active" IS DISTINCT FROM "new"."is_active")) AND (("old"."assignment_kind" = 'equipment_department'::"text") OR ("new"."assignment_kind" = 'equipment_department'::"text")))) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_source_workshop_scope_grants vmp_authorization_revision_grant_insert_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_grant_insert_delete" AFTER INSERT OR DELETE ON "public"."vmp_source_workshop_scope_grants" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_source_workshop_scope_grants vmp_authorization_revision_grant_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_grant_update" AFTER UPDATE OF "performer_id", "department_key", "area_key", "line_key", "valid_from", "expires_at", "is_active" ON "public"."vmp_source_workshop_scope_grants" FOR EACH ROW WHEN (((((((("old"."performer_id" IS DISTINCT FROM "new"."performer_id") OR ("old"."department_key" IS DISTINCT FROM "new"."department_key")) OR ("old"."area_key" IS DISTINCT FROM "new"."area_key")) OR ("old"."line_key" IS DISTINCT FROM "new"."line_key")) OR ("old"."valid_from" IS DISTINCT FROM "new"."valid_from")) OR ("old"."expires_at" IS DISTINCT FROM "new"."expires_at")) OR ("old"."is_active" IS DISTINCT FROM "new"."is_active"))) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_performers vmp_authorization_revision_performer_insert_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_performer_insert_delete" AFTER INSERT OR DELETE ON "public"."vmp_performers" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_performers vmp_authorization_revision_performer_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_performer_update" AFTER UPDATE OF "user_id", "is_active", "access_class", "department" ON "public"."vmp_performers" FOR EACH ROW WHEN ((((("old"."user_id" IS DISTINCT FROM "new"."user_id") OR ("old"."is_active" IS DISTINCT FROM "new"."is_active")) OR ("old"."access_class" IS DISTINCT FROM "new"."access_class")) OR ("old"."department" IS DISTINCT FROM "new"."department"))) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_plan_items vmp_authorization_revision_plan_insert_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_plan_insert_delete" AFTER INSERT OR DELETE ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_plan_items vmp_authorization_revision_plan_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_plan_update" AFTER UPDATE OF "object_code", "is_active" ON "public"."vmp_plan_items" FOR EACH ROW WHEN ((("old"."object_code" IS DISTINCT FROM "new"."object_code") OR ("old"."is_active" IS DISTINCT FROM "new"."is_active"))) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: profiles vmp_authorization_revision_profile_insert_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_profile_insert_delete" AFTER INSERT OR DELETE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: profiles vmp_authorization_revision_profile_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_profile_update" AFTER UPDATE OF "is_active", "role", "department" ON "public"."profiles" FOR EACH ROW WHEN (((("old"."is_active" IS DISTINCT FROM "new"."is_active") OR ("old"."role" IS DISTINCT FROM "new"."role")) OR ("old"."department" IS DISTINCT FROM "new"."department"))) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_screen_permissions vmp_authorization_revision_screen_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_screen_delete" AFTER DELETE ON "public"."vmp_screen_permissions" FOR EACH ROW WHEN (("old"."screen_id" = 'source'::"text")) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_screen_permissions vmp_authorization_revision_screen_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_screen_insert" AFTER INSERT ON "public"."vmp_screen_permissions" FOR EACH ROW WHEN (("new"."screen_id" = 'source'::"text")) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_screen_permissions vmp_authorization_revision_screen_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_screen_update" AFTER UPDATE OF "business_role", "screen_id", "can_view", "data_scope", "actions" ON "public"."vmp_screen_permissions" FOR EACH ROW WHEN ((((((("old"."business_role" IS DISTINCT FROM "new"."business_role") OR ("old"."screen_id" IS DISTINCT FROM "new"."screen_id")) OR ("old"."can_view" IS DISTINCT FROM "new"."can_view")) OR ("old"."data_scope" IS DISTINCT FROM "new"."data_scope")) OR ("old"."actions" IS DISTINCT FROM "new"."actions")) AND (("old"."screen_id" = 'source'::"text") OR ("new"."screen_id" = 'source'::"text")))) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_source_objects vmp_authorization_revision_source_insert_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_source_insert_delete" AFTER INSERT OR DELETE ON "public"."vmp_source_objects" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_source_objects vmp_authorization_revision_source_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_authorization_revision_source_update" AFTER UPDATE OF "owner_person_id", "support_person_id", "object_code", "is_active", "department", "area_code", "line" ON "public"."vmp_source_objects" FOR EACH ROW WHEN (((((((("old"."owner_person_id" IS DISTINCT FROM "new"."owner_person_id") OR ("old"."support_person_id" IS DISTINCT FROM "new"."support_person_id")) OR ("old"."object_code" IS DISTINCT FROM "new"."object_code")) OR ("old"."is_active" IS DISTINCT FROM "new"."is_active")) OR ("public"."vmp_source_scope_key"("old"."department") IS DISTINCT FROM "public"."vmp_source_scope_key"("new"."department"))) OR ("public"."vmp_source_scope_key"("old"."area_code") IS DISTINCT FROM "public"."vmp_source_scope_key"("new"."area_code"))) OR ("public"."vmp_source_scope_key"("old"."line") IS DISTINCT FROM "public"."vmp_source_scope_key"("new"."line")))) EXECUTE FUNCTION "public"."vmp_touch_authorization_revision"();


--
-- Name: vmp_catalog_changes vmp_catalog_changes_timeline_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_catalog_changes_timeline_only" BEFORE INSERT OR UPDATE OF "old_data", "new_data" ON "public"."vmp_catalog_changes" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_strip_catalog_pending_access_fields"();


--
-- Name: vmp_item_assignments vmp_item_assignment_plan_revision; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_item_assignment_plan_revision" AFTER INSERT OR DELETE OR UPDATE ON "public"."vmp_item_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_invalidate_plan_item_revision_from_assignment"();


--
-- Name: vmp_objects vmp_objects_source_relation_delete_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_objects_source_relation_delete_guard" BEFORE DELETE ON "public"."vmp_objects" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_guard_plan_master_rekey"();


--
-- Name: vmp_objects vmp_objects_source_relation_update_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_objects_source_relation_update_guard" BEFORE UPDATE OF "code" ON "public"."vmp_objects" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_guard_plan_master_rekey"();


--
-- Name: vmp_plan_items vmp_plan_item_row_revision_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_plan_item_row_revision_v2" BEFORE UPDATE ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_plan_item_row_revision_v2"();


--
-- Name: vmp_plan_items vmp_plan_items_active_source_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_plan_items_active_source_guard" BEFORE INSERT OR UPDATE OF "object_code", "is_active" ON "public"."vmp_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_enforce_active_plan_source_relation"();


--
-- Name: profiles vmp_profiles_authority_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_profiles_authority_guard" BEFORE UPDATE OF "role", "department", "is_active", "pham_vi" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_profile_authority_guard"();


--
-- Name: vmp_source_objects vmp_source_objects_access_insert_projection; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_source_objects_access_insert_projection" AFTER INSERT ON "public"."vmp_source_objects" FOR EACH ROW WHEN ((("new"."is_active" IS TRUE) AND (("new"."owner_person_id" IS NOT NULL) OR ("new"."support_person_id" IS NOT NULL)))) EXECUTE FUNCTION "public"."vmp_reconcile_source_access_trigger"();


--
-- Name: vmp_source_objects vmp_source_objects_access_projection; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_source_objects_access_projection" AFTER UPDATE OF "owner_person_id", "support_person_id", "is_active" ON "public"."vmp_source_objects" FOR EACH ROW WHEN ((("new"."is_active" IS TRUE) AND ((("old"."owner_person_id" IS DISTINCT FROM "new"."owner_person_id") OR ("old"."support_person_id" IS DISTINCT FROM "new"."support_person_id")) OR ("old"."is_active" IS DISTINCT FROM true)))) EXECUTE FUNCTION "public"."vmp_reconcile_source_access_trigger"();


--
-- Name: vmp_source_objects vmp_source_objects_active_delete_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_source_objects_active_delete_guard" BEFORE DELETE ON "public"."vmp_source_objects" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_guard_active_source_rekey"();


--
-- Name: vmp_source_objects vmp_source_objects_active_relation_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_source_objects_active_relation_guard" BEFORE UPDATE OF "object_code", "is_active" ON "public"."vmp_source_objects" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_guard_active_source_rekey"();


--
-- Name: vmp_performers vmp_sync_item_assignments_from_performer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "vmp_sync_item_assignments_from_performer" AFTER UPDATE OF "user_id", "employee_code", "performer_name" ON "public"."vmp_performers" FOR EACH ROW EXECUTE FUNCTION "public"."vmp_sync_item_assignments_from_performer"();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: data_quality_issues data_quality_issues_plan_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_quality_issues"
    ADD CONSTRAINT "data_quality_issues_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "public"."vmp_plan_items"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: data_quality_issues data_quality_issues_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_quality_issues"
    ADD CONSTRAINT "data_quality_issues_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");


--
-- Name: data_quality_issues data_quality_issues_workflow_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_quality_issues"
    ADD CONSTRAINT "data_quality_issues_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id");


--
-- Name: departments departments_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "auth"."users"("id");


--
-- Name: profiles profiles_department_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_department_fkey" FOREIGN KEY ("department") REFERENCES "public"."departments"("id");


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: system_config system_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_ai_report_cache vmp_ai_report_cache_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_report_cache"
    ADD CONSTRAINT "vmp_ai_report_cache_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_ai_reviews vmp_ai_reviews_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_reviews"
    ADD CONSTRAINT "vmp_ai_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_ai_reviews vmp_ai_reviews_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_ai_reviews"
    ADD CONSTRAINT "vmp_ai_reviews_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."vmp_report_snapshots"("id");


--
-- Name: vmp_catalog_changes vmp_catalog_changes_applied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_catalog_changes"
    ADD CONSTRAINT "vmp_catalog_changes_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_catalog_changes vmp_catalog_changes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_catalog_changes"
    ADD CONSTRAINT "vmp_catalog_changes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_catalog_import_rows vmp_catalog_import_rows_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_catalog_import_rows"
    ADD CONSTRAINT "vmp_catalog_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."vmp_catalog_import_batches"("id") ON DELETE CASCADE;


--
-- Name: vmp_deadline_rules vmp_deadline_rules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_deadline_rules"
    ADD CONSTRAINT "vmp_deadline_rules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_item_assignments vmp_item_assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_item_assignments"
    ADD CONSTRAINT "vmp_item_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: vmp_item_assignments vmp_item_assignments_performer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_item_assignments"
    ADD CONSTRAINT "vmp_item_assignments_performer_id_fkey" FOREIGN KEY ("performer_id") REFERENCES "public"."vmp_performers"("id") ON DELETE SET NULL;


--
-- Name: vmp_item_assignments vmp_item_assignments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_item_assignments"
    ADD CONSTRAINT "vmp_item_assignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: vmp_item_assignments vmp_item_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_item_assignments"
    ADD CONSTRAINT "vmp_item_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: vmp_item_assignments vmp_item_assignments_validation_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_item_assignments"
    ADD CONSTRAINT "vmp_item_assignments_validation_code_fkey" FOREIGN KEY ("validation_code") REFERENCES "public"."vmp_plan_items"("validation_code") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vmp_notifications vmp_notifications_plan_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_notifications"
    ADD CONSTRAINT "vmp_notifications_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "public"."vmp_plan_items"("id");


--
-- Name: vmp_objects vmp_objects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_objects"
    ADD CONSTRAINT "vmp_objects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_objects vmp_objects_department_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_objects"
    ADD CONSTRAINT "vmp_objects_department_fkey" FOREIGN KEY ("department") REFERENCES "public"."departments"("id");


--
-- Name: vmp_objects vmp_objects_source_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_objects"
    ADD CONSTRAINT "vmp_objects_source_sync_run_id_fkey" FOREIGN KEY ("source_sync_run_id") REFERENCES "public"."vmp_sheet_sync_runs"("id") ON DELETE SET NULL;


--
-- Name: vmp_objects vmp_objects_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_objects"
    ADD CONSTRAINT "vmp_objects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_performers vmp_performers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_performers"
    ADD CONSTRAINT "vmp_performers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: vmp_plan_items vmp_plan_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_plan_items"
    ADD CONSTRAINT "vmp_plan_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_plan_items vmp_plan_items_object_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_plan_items"
    ADD CONSTRAINT "vmp_plan_items_object_code_fkey" FOREIGN KEY ("object_code") REFERENCES "public"."vmp_objects"("code");


--
-- Name: vmp_plan_items vmp_plan_items_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_plan_items"
    ADD CONSTRAINT "vmp_plan_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");


--
-- Name: vmp_plan_items vmp_plan_items_owner_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_plan_items"
    ADD CONSTRAINT "vmp_plan_items_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "public"."vmp_performers"("id") ON DELETE SET NULL;


--
-- Name: vmp_plan_items vmp_plan_items_qa_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_plan_items"
    ADD CONSTRAINT "vmp_plan_items_qa_approved_by_fkey" FOREIGN KEY ("qa_approved_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_plan_items vmp_plan_items_source_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_plan_items"
    ADD CONSTRAINT "vmp_plan_items_source_sync_run_id_fkey" FOREIGN KEY ("source_sync_run_id") REFERENCES "public"."vmp_sheet_sync_runs"("id") ON DELETE SET NULL;


--
-- Name: vmp_plan_items vmp_plan_items_support_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_plan_items"
    ADD CONSTRAINT "vmp_plan_items_support_person_id_fkey" FOREIGN KEY ("support_person_id") REFERENCES "public"."vmp_performers"("id") ON DELETE SET NULL;


--
-- Name: vmp_plan_items vmp_plan_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_plan_items"
    ADD CONSTRAINT "vmp_plan_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_progress_events vmp_progress_events_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_progress_events"
    ADD CONSTRAINT "vmp_progress_events_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_progress_events vmp_progress_events_plan_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_progress_events"
    ADD CONSTRAINT "vmp_progress_events_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "public"."vmp_plan_items"("id");


--
-- Name: vmp_report_snapshots vmp_report_snapshots_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_report_snapshots"
    ADD CONSTRAINT "vmp_report_snapshots_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_report_snapshots vmp_report_snapshots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_report_snapshots"
    ADD CONSTRAINT "vmp_report_snapshots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_scope_areas vmp_scope_areas_factory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_scope_areas"
    ADD CONSTRAINT "vmp_scope_areas_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."vmp_scope_factories"("id");


--
-- Name: vmp_scope_factories vmp_scope_factories_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_scope_factories"
    ADD CONSTRAINT "vmp_scope_factories_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id");


--
-- Name: vmp_scope_lines vmp_scope_lines_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_scope_lines"
    ADD CONSTRAINT "vmp_scope_lines_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."vmp_scope_areas"("id");


--
-- Name: vmp_screen_permissions vmp_screen_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_screen_permissions"
    ADD CONSTRAINT "vmp_screen_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: vmp_sheet_row_extras vmp_sheet_row_extras_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_sheet_row_extras"
    ADD CONSTRAINT "vmp_sheet_row_extras_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "public"."vmp_sheet_sync_runs"("id") ON DELETE CASCADE;


--
-- Name: vmp_sheet_rows vmp_sheet_rows_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_sheet_rows"
    ADD CONSTRAINT "vmp_sheet_rows_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "public"."vmp_sheet_sync_runs"("id") ON DELETE CASCADE;


--
-- Name: vmp_sheet_sync_backups vmp_sheet_sync_backups_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_sheet_sync_backups"
    ADD CONSTRAINT "vmp_sheet_sync_backups_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "public"."vmp_sheet_sync_runs"("id") ON DELETE CASCADE;


--
-- Name: vmp_source_assignment_resolutions vmp_source_assignment_resolutions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_assignment_resolutions"
    ADD CONSTRAINT "vmp_source_assignment_resolutions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: vmp_source_assignment_resolutions vmp_source_assignment_resolutions_performer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_assignment_resolutions"
    ADD CONSTRAINT "vmp_source_assignment_resolutions_performer_id_fkey" FOREIGN KEY ("performer_id") REFERENCES "public"."vmp_performers"("id") ON DELETE SET NULL;


--
-- Name: vmp_source_assignment_resolutions vmp_source_assignment_resolutions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_assignment_resolutions"
    ADD CONSTRAINT "vmp_source_assignment_resolutions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: vmp_source_assignment_resolutions vmp_source_assignment_resolutions_validation_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_assignment_resolutions"
    ADD CONSTRAINT "vmp_source_assignment_resolutions_validation_code_fkey" FOREIGN KEY ("validation_code") REFERENCES "public"."vmp_plan_items"("validation_code") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vmp_source_objects vmp_source_objects_owner_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_objects"
    ADD CONSTRAINT "vmp_source_objects_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "public"."vmp_performers"("id") ON DELETE SET NULL;


--
-- Name: vmp_source_objects vmp_source_objects_support_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_objects"
    ADD CONSTRAINT "vmp_source_objects_support_person_id_fkey" FOREIGN KEY ("support_person_id") REFERENCES "public"."vmp_performers"("id") ON DELETE SET NULL;


--
-- Name: vmp_source_workshop_scope_grants vmp_source_workshop_scope_grants_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_workshop_scope_grants"
    ADD CONSTRAINT "vmp_source_workshop_scope_grants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: vmp_source_workshop_scope_grants vmp_source_workshop_scope_grants_performer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_workshop_scope_grants"
    ADD CONSTRAINT "vmp_source_workshop_scope_grants_performer_id_fkey" FOREIGN KEY ("performer_id") REFERENCES "public"."vmp_performers"("id");


--
-- Name: vmp_source_workshop_scope_grants vmp_source_workshop_scope_grants_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vmp_source_workshop_scope_grants"
    ADD CONSTRAINT "vmp_source_workshop_scope_grants_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: workflow_runs workflow_runs_parent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_parent_run_id_fkey" FOREIGN KEY ("parent_run_id") REFERENCES "public"."workflow_runs"("id");


--
-- Name: vmp_ai_report_cache ai_cache_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_cache_insert" ON "public"."vmp_ai_report_cache" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: vmp_ai_report_cache ai_cache_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_cache_select" ON "public"."vmp_ai_report_cache" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_ai_chat_log ai_chat_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_chat_own" ON "public"."vmp_ai_chat_log" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "pr"
  WHERE (("pr"."id" = "auth"."uid"()) AND ("pr"."role" = ANY (ARRAY['admin'::"public"."user_role", 'qa_manager'::"public"."user_role"])))))));


--
-- Name: vmp_ai_reviews ai_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_insert" ON "public"."vmp_ai_reviews" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: vmp_ai_reviews ai_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_select" ON "public"."vmp_ai_reviews" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_ai_reviews ai_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_update" ON "public"."vmp_ai_reviews" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_qa"());


--
-- Name: vmp_alert_recipients alert_recipients_manager_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "alert_recipients_manager_select" ON "public"."vmp_alert_recipients" FOR SELECT TO "authenticated" USING ("public"."vmp_current_actor_can_manage_source_qa_assignment"());


--
-- Name: vmp_assignment_matrix assignment_matrix_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assignment_matrix_select" ON "public"."vmp_assignment_matrix" FOR SELECT TO "authenticated" USING ((true AND "public"."vmp_current_session_is_active"()));


--
-- Name: vmp_assignment_rules assignment_rules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assignment_rules_select" ON "public"."vmp_assignment_rules" FOR SELECT TO "authenticated" USING (true);


--
-- Name: audit_logs_archive audit_archive_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "audit_archive_select" ON "public"."audit_logs_archive" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin_or_qa"() AS "is_admin_or_qa"));


--
-- Name: audit_logs audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "audit_insert" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((true AND "public"."vmp_current_session_is_active"()));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs_archive; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."audit_logs_archive" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs_purge_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."audit_logs_purge_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "audit_select" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin_or_qa"() AS "is_admin_or_qa") AND "public"."vmp_current_session_is_active"()));


--
-- Name: vmp_ai_bo_kiem bo_kiem_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bo_kiem_doc" ON "public"."vmp_ai_bo_kiem" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_ai_bo_nho bo_nho_cua_minh; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bo_nho_cua_minh" ON "public"."vmp_ai_bo_nho" FOR SELECT TO "authenticated" USING ((("nguoi" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role"))))));


--
-- Name: vmp_ai_cache cache_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cache_doc" ON "public"."vmp_ai_cache" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_ai_cache_ngu_nghia cache_nn_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cache_nn_doc" ON "public"."vmp_ai_cache_ngu_nghia" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_ai_cham_diem_log cdl_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cdl_doc" ON "public"."vmp_ai_cham_diem_log" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_ai_cau_hoi_vang chv_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chv_doc" ON "public"."vmp_ai_cau_hoi_vang" FOR SELECT TO "authenticated" USING (true);


--
-- Name: system_config config_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "config_modify" ON "public"."system_config" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: system_config config_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "config_select" ON "public"."system_config" FOR SELECT TO "authenticated" USING (("public"."vmp_current_session_is_active"() AND ((NOT "is_sensitive") OR "public"."is_admin"())));


--
-- Name: data_quality_issues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."data_quality_issues" ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;

--
-- Name: departments dept_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dept_delete" ON "public"."departments" FOR DELETE TO "authenticated" USING ("public"."is_admin"());


--
-- Name: departments dept_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dept_insert" ON "public"."departments" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_qa"());


--
-- Name: departments dept_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dept_select" ON "public"."departments" FOR SELECT TO "authenticated" USING (true);


--
-- Name: departments dept_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dept_update" ON "public"."departments" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_qa"());


--
-- Name: vmp_danh_gia_anh_huong dg_ah_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dg_ah_doc" ON "public"."vmp_danh_gia_anh_huong" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_diem_truoc_khi_doi diem_cu_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "diem_cu_doc" ON "public"."vmp_diem_truoc_khi_doi" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_deadline_rules dl_rules_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dl_rules_modify" ON "public"."vmp_deadline_rules" TO "authenticated" USING ("public"."is_admin_or_qa"());


--
-- Name: vmp_deadline_rules dl_rules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dl_rules_select" ON "public"."vmp_deadline_rules" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_ai_dong_nghia dong_nghia_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dong_nghia_doc" ON "public"."vmp_ai_dong_nghia" FOR SELECT TO "authenticated" USING (true);


--
-- Name: data_quality_issues dq_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dq_insert" ON "public"."data_quality_issues" FOR INSERT TO "authenticated" WITH CHECK ((true AND "public"."vmp_current_session_is_active"()));


--
-- Name: data_quality_issues dq_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dq_select" ON "public"."data_quality_issues" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin_or_qa"() AS "is_admin_or_qa") AND "public"."vmp_current_session_is_active"()));


--
-- Name: data_quality_issues dq_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dq_update" ON "public"."data_quality_issues" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_admin_or_qa"() AS "is_admin_or_qa") AND "public"."vmp_current_session_is_active"())) WITH CHECK ((( SELECT "public"."is_admin_or_qa"() AS "is_admin_or_qa") AND "public"."vmp_current_session_is_active"()));


--
-- Name: vmp_email_cho_phep email_cho_phep_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "email_cho_phep_select" ON "public"."vmp_email_cho_phep" FOR SELECT TO "authenticated" USING ((true AND "public"."vmp_current_session_is_active"()));


--
-- Name: vmp_ai_giong giong_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "giong_doc" ON "public"."vmp_ai_giong" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_ai_hoi_thoai hoi_thoai_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hoi_thoai_doc" ON "public"."vmp_ai_hoi_thoai" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_item_assignments item_assignments_manager_or_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "item_assignments_manager_or_self_select" ON "public"."vmp_item_assignments" FOR SELECT TO "authenticated" USING (("public"."vmp_current_actor_can_manage_source_qa_assignment"() OR ("public"."vmp_current_actor_is_active"() AND (EXISTS ( SELECT 1
   FROM "public"."vmp_performers" "performer"
  WHERE (("performer"."id" = "vmp_item_assignments"."performer_id") AND ("performer"."user_id" = "auth"."uid"()) AND "performer"."is_active"))))));


--
-- Name: vmp_kb_chunks kb_chunks_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kb_chunks_read" ON "public"."vmp_kb_chunks" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_kb_documents kb_docs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kb_docs_read" ON "public"."vmp_kb_documents" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_chat_loi_cho loi_cho_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loi_cho_doc" ON "public"."vmp_chat_loi_cho" FOR SELECT TO "authenticated" USING (("bat" AND "public"."vmp_current_session_is_active"()));


--
-- Name: vmp_ai_mo_hinh mo_hinh_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mo_hinh_doc" ON "public"."vmp_ai_mo_hinh" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_notifications notif_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notif_insert" ON "public"."vmp_notifications" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_qa"());


--
-- Name: vmp_notifications notif_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notif_select" ON "public"."vmp_notifications" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_qa"() OR ("recipient_email" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));


--
-- Name: vmp_objects obj_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "obj_select" ON "public"."vmp_objects" FOR SELECT TO "authenticated" USING (true);


--
-- Name: sheet_sync_outbox outbox_no_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outbox_no_client" ON "public"."sheet_sync_outbox" USING (false) WITH CHECK (false);


--
-- Name: vmp_performers performers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "performers_select" ON "public"."vmp_performers" FOR SELECT TO "authenticated" USING (((("user_id" = "auth"."uid"()) OR "public"."is_admin"()) AND "public"."vmp_current_session_is_active"()));


--
-- Name: vmp_plan_items plan_items_authorized_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan_items_authorized_select" ON "public"."vmp_plan_items" FOR SELECT TO "authenticated" USING ("public"."vmp_can_view_plan_item"("auth"."uid"(), "validation_code"));


--
-- Name: vmp_products_gmp products_gmp_manager_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "products_gmp_manager_select" ON "public"."vmp_products_gmp" FOR SELECT TO "authenticated" USING ("public"."vmp_current_actor_can_manage_source_qa_assignment"());


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("public"."vmp_current_session_is_active"() AND "public"."is_admin"()));


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("public"."vmp_current_session_is_active"() AND "public"."is_admin_or_qa"())));


--
-- Name: vmp_progress_events progress_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "progress_insert" ON "public"."vmp_progress_events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));


--
-- Name: vmp_progress_events progress_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "progress_select" ON "public"."vmp_progress_events" FOR SELECT TO "authenticated" USING (true);


--
-- Name: audit_logs_purge_log purge_log_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "purge_log_select" ON "public"."audit_logs_purge_log" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin_or_qa"() AS "is_admin_or_qa"));


--
-- Name: vmp_rls_siet_log rls_siet_log_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rls_siet_log_doc" ON "public"."vmp_rls_siet_log" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_role_permissions role_permissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "role_permissions_select" ON "public"."vmp_role_permissions" FOR SELECT TO "authenticated" USING (true);


--
-- Name: sheet_sync_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sheet_sync_outbox" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_report_snapshots snapshot_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "snapshot_insert" ON "public"."vmp_report_snapshots" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_qa"());


--
-- Name: vmp_report_snapshots snapshot_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "snapshot_select" ON "public"."vmp_report_snapshots" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_report_snapshots snapshot_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "snapshot_update" ON "public"."vmp_report_snapshots" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_qa"());


--
-- Name: vmp_source_objects source_objects_authorized_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "source_objects_authorized_select" ON "public"."vmp_source_objects" FOR SELECT TO "authenticated" USING ("public"."vmp_can_view_source_object"("auth"."uid"(), "id"));


--
-- Name: vmp_source_rows source_rows_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "source_rows_select_authenticated" ON "public"."vmp_source_rows" FOR SELECT TO "authenticated" USING ((true AND "public"."vmp_current_session_is_active"()));


--
-- Name: vmp_source_workshop_scope_grants source_workshop_scope_grants_manager_or_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "source_workshop_scope_grants_manager_or_self_select" ON "public"."vmp_source_workshop_scope_grants" FOR SELECT TO "authenticated" USING (("public"."vmp_current_actor_can_manage_source_workshop_scope"() OR ("public"."vmp_current_actor_is_active"() AND (EXISTS ( SELECT 1
   FROM "public"."vmp_performers" "performer"
  WHERE (("performer"."id" = "vmp_source_workshop_scope_grants"."performer_id") AND ("performer"."user_id" = "auth"."uid"()) AND "performer"."is_active"))))));


--
-- Name: vmp_staff_emails staff_emails_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff_emails_select" ON "public"."vmp_staff_emails" FOR SELECT TO "authenticated" USING ((true AND "public"."vmp_current_session_is_active"()));


--
-- Name: system_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."system_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_bi_danh; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_bi_danh" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_bi_danh vmp_ai_bi_danh_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vmp_ai_bi_danh_doc" ON "public"."vmp_ai_bi_danh" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_ai_bo_kiem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_bo_kiem" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_bo_nho; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_bo_nho" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_cache" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_cache_ngu_nghia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_cache_ngu_nghia" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_cau_hoi_vang; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_cau_hoi_vang" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_cham_diem_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_cham_diem_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_chat_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_chat_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_dong_nghia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_dong_nghia" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_giong; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_giong" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_hoi_thoai; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_hoi_thoai" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_mo_hinh; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_mo_hinh" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_report_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_report_cache" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_trich_dan_tam; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_ai_trich_dan_tam" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_alert_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_alert_recipients" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_assignment_matrix; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_assignment_matrix" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_assignment_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_assignment_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_authorization_revision; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_authorization_revision" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_catalog_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_catalog_changes" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_catalog_import_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_catalog_import_batches" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_catalog_import_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_catalog_import_rows" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_chat_giong; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_chat_giong" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_chat_giong vmp_chat_giong_doc; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vmp_chat_giong_doc" ON "public"."vmp_chat_giong" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vmp_chat_loi_cho; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_chat_loi_cho" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_danh_gia_anh_huong; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_danh_gia_anh_huong" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_deadline_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_deadline_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_diem_truoc_khi_doi; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_diem_truoc_khi_doi" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_email_cho_phep; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_email_cho_phep" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_item_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_item_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_kb_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_kb_chunks" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_kb_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_kb_documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_legacy_action_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_legacy_action_map" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_objects" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_performers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_performers" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_plan_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_plan_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_products_gmp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_products_gmp" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_progress_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_progress_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_report_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_report_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_rls_siet_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_rls_siet_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_role_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_scope_areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_scope_areas" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_scope_factories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_scope_factories" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_scope_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_scope_lines" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_screen_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_screen_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_sheet_row_extras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_sheet_row_extras" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_sheet_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_sheet_rows" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_sheet_sync_backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_sheet_sync_backups" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_sheet_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_sheet_sync_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_source_assignment_resolutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_source_assignment_resolutions" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_source_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_source_objects" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_source_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_source_rows" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_source_workshop_scope_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_source_workshop_scope_grants" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_staff_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vmp_staff_emails" ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_runs wf_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wf_insert" ON "public"."workflow_runs" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: workflow_runs wf_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wf_select" ON "public"."workflow_runs" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin_or_qa"() AS "is_admin_or_qa"));


--
-- Name: workflow_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."workflow_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_bo_nho xoa_bo_nho_cua_minh; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "xoa_bo_nho_cua_minh" ON "public"."vmp_ai_bo_nho" FOR DELETE TO "authenticated" USING (("nguoi" = ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));


--
-- PostgreSQL database dump complete
--

\unrestrict XtEfKugoHXfdIolg4QKRIAXYp08woNz50A9TosO3sYosuhp0dxifUhFSZy228W9
