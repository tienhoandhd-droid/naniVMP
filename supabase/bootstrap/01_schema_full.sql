--
-- PostgreSQL database dump
--

\restrict i4rhe7KCMFMwMpb2uuDiRFANRAzEBrxzhPN9A53DrY9kxxmhxSJ3hl6VGRs1Pr6

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

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

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_action AS ENUM (
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

CREATE TYPE public.criticality AS ENUM (
    'high',
    'medium',
    'low'
);


--
-- Name: item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_status AS ENUM (
    'plan',
    'todo',
    'prog',
    'done',
    'over'
);


--
-- Name: notification_ch; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_ch AS ENUM (
    'email',
    'dashboard',
    'both'
);


--
-- Name: phase_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.phase_status AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'overdue'
);


--
-- Name: quality_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quality_severity AS ENUM (
    'error',
    'warning',
    'info'
);


--
-- Name: report_period; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_period AS ENUM (
    'weekly',
    'monthly',
    'quarterly',
    'annual',
    'custom'
);


--
-- Name: report_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_status AS ENUM (
    'draft',
    'ai_generated',
    'qa_reviewing',
    'approved',
    'archived'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'qa_manager',
    'department_user',
    'viewer'
);


--
-- Name: workflow_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workflow_status AS ENUM (
    'running',
    'success',
    'failed',
    'partial'
);


--
-- Name: audit_object_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_object_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'INSERT';
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
    v_action := 'UPDATE';
  ELSIF TG_OP = 'DELETE' THEN v_action := 'DELETE';
  END IF;

  INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data, source)
  VALUES (
    v_action::audit_action, 'vmp_objects', COALESCE(NEW.code, OLD.code),
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END,
    COALESCE(current_setting('app.audit_source', true), 'trigger')
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: audit_plan_item_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_plan_item_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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

CREATE FUNCTION public.audit_plan_item_changes_v2() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_action TEXT;
  v_user_id UUID;
  v_changed TEXT[] := '{}';
  v_validation_code TEXT;
  v_reason TEXT;
BEGIN
  v_reason := NULLIF(current_setting('app.audit_reason', true), '');

  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_user_id := NEW.created_by;
    v_validation_code := NEW.validation_code;
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_id := COALESCE(NEW.updated_by, OLD.updated_by);
    v_validation_code := COALESCE(NEW.validation_code, OLD.validation_code);

    IF OLD.status_protocol IS DISTINCT FROM NEW.status_protocol THEN v_changed := array_append(v_changed, 'status_protocol'); END IF;
    IF OLD.status_validation IS DISTINCT FROM NEW.status_validation THEN v_changed := array_append(v_changed, 'status_validation'); END IF;
    IF OLD.status_report IS DISTINCT FROM NEW.status_report THEN v_changed := array_append(v_changed, 'status_report'); END IF;
    IF OLD.status_vmp IS DISTINCT FROM NEW.status_vmp THEN v_changed := array_append(v_changed, 'status_vmp'); END IF;
    IF OLD.deadline_vmp IS DISTINCT FROM NEW.deadline_vmp THEN v_changed := array_append(v_changed, 'deadline_vmp'); END IF;
    IF OLD.deadline_protocol IS DISTINCT FROM NEW.deadline_protocol THEN v_changed := array_append(v_changed, 'deadline_protocol'); END IF;
    IF OLD.deadline_report IS DISTINCT FROM NEW.deadline_report THEN v_changed := array_append(v_changed, 'deadline_report'); END IF;
    IF OLD.owner_name IS DISTINCT FROM NEW.owner_name THEN v_changed := array_append(v_changed, 'owner_name'); END IF;
    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN v_changed := array_append(v_changed, 'is_active'); END IF;
    IF OLD.missing_from_sheet IS DISTINCT FROM NEW.missing_from_sheet THEN v_changed := array_append(v_changed, 'missing_from_sheet'); END IF;
    IF OLD.actual_vmp_date IS DISTINCT FROM NEW.actual_vmp_date THEN v_changed := array_append(v_changed, 'actual_vmp_date'); END IF;
    IF OLD.actual_protocol_date IS DISTINCT FROM NEW.actual_protocol_date THEN v_changed := array_append(v_changed, 'actual_protocol_date'); END IF;
    IF OLD.actual_validation_date IS DISTINCT FROM NEW.actual_validation_date THEN v_changed := array_append(v_changed, 'actual_validation_date'); END IF;
    IF OLD.actual_report_date IS DISTINCT FROM NEW.actual_report_date THEN v_changed := array_append(v_changed, 'actual_report_date'); END IF;

    IF array_length(v_changed, 1) IS NULL THEN RETURN NEW; END IF;

    IF OLD.is_active AND NOT NEW.is_active THEN v_action := 'DELETE';
    ELSIF v_changed && ARRAY['status_protocol','status_validation','status_report','status_vmp'] THEN v_action := 'STATUS_CHANGE';
    ELSIF v_changed && ARRAY['deadline_vmp','deadline_protocol','deadline_report'] THEN v_action := 'DEADLINE_CHANGE';
    ELSE v_action := 'UPDATE';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_user_id := OLD.updated_by;
    v_validation_code := OLD.validation_code;
  END IF;

  INSERT INTO audit_logs (
    user_id, action, table_name, record_id,
    validation_code, changed_fields, change_reason,
    old_data, new_data, source
  ) VALUES (
    v_user_id, v_action::audit_action, 'vmp_plan_items',
    COALESCE(NEW.id, OLD.id), v_validation_code, v_changed, v_reason,
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END,
    COALESCE(current_setting('app.audit_source', true), 'trigger')
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: auth_user_dept(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_user_dept() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
    SELECT COALESCE(
        (SELECT department FROM profiles WHERE id = auth.uid()),
        ''
    );
$$;


--
-- Name: auth_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_user_role() RETURNS public.user_role
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
    SELECT COALESCE(
        (SELECT role FROM profiles WHERE id = auth.uid()),
        'viewer'::user_role
    );
$$;


--
-- Name: calculate_deadlines(date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_deadlines(target_date date, p_report_class text DEFAULT 'Không phụ thuộc'::text) RETURNS TABLE(dl_protocol date, dl_validation date, dl_report date)
    LANGUAGE plpgsql STABLE
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: vmp_plan_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_plan_items (
    id text NOT NULL,
    object_code text NOT NULL,
    validation_type text DEFAULT 'PQ'::text NOT NULL,
    report_class text DEFAULT 'Không phụ thuộc'::text,
    owner_id uuid,
    owner_name text,
    secondary_owner text,
    effort_days numeric(4,1),
    criticality_score integer,
    criticality public.criticality DEFAULT 'medium'::public.criticality NOT NULL,
    year integer DEFAULT EXTRACT(year FROM now()) NOT NULL,
    deadline_protocol date,
    deadline_validation date,
    deadline_report date,
    deadline_vmp date,
    actual_protocol_date date,
    actual_validation_date date,
    actual_report_date date,
    actual_vmp_date date,
    scheduled_date date,
    status_protocol public.phase_status DEFAULT 'not_started'::public.phase_status,
    status_validation public.phase_status DEFAULT 'not_started'::public.phase_status,
    status_report public.phase_status DEFAULT 'not_started'::public.phase_status,
    status_vmp public.phase_status DEFAULT 'not_started'::public.phase_status,
    computed_status public.item_status DEFAULT 'plan'::public.item_status,
    is_doc_complete boolean DEFAULT false,
    has_mismatch text,
    is_active boolean DEFAULT true,
    requires_qa_approval boolean DEFAULT false,
    qa_approved_by uuid,
    qa_approved_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sheet_row_id text,
    last_synced timestamp with time zone,
    deleted_from_sheet boolean DEFAULT false,
    deleted_at timestamp with time zone,
    delete_reason text,
    validation_code text NOT NULL,
    missing_from_sheet boolean DEFAULT false,
    missing_since timestamp with time zone,
    item_state text DEFAULT 'active'::text NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    source_sync_run_id uuid,
    source_sheet_row integer,
    source_sheet_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    departments text[],
    execution_departments text[],
    CONSTRAINT chk_item_state CHECK ((item_state = ANY (ARRAY['active'::text, 'not_applicable'::text, 'cancelled'::text]))),
    CONSTRAINT vmp_plan_items_criticality_score_check CHECK (((criticality_score >= 1) AND (criticality_score <= 9)))
);


--
-- Name: TABLE vmp_plan_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vmp_plan_items IS 'Read-only projection of canonical Google Sheet VMP rows for browser roles. Mutated only by the n8n snapshot service.';


--
-- Name: COLUMN vmp_plan_items.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.id IS 'ID kỹ thuật (PK), có thể tự sinh hoặc = validation_code';


--
-- Name: COLUMN vmp_plan_items.object_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.object_code IS 'Mã thiết bị/hệ thống (FK → vmp_objects). Ví dụ: TB001, HT005';


--
-- Name: COLUMN vmp_plan_items.validation_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.validation_type IS 'Loại thẩm định: IQ, OQ, PQ, CSV, RE';


--
-- Name: COLUMN vmp_plan_items.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.is_active IS 'TRUE = đang hiệu lực. Chỉ QA/admin được đổi. KHÔNG tự động đổi khi mất khỏi Sheet.';


--
-- Name: COLUMN vmp_plan_items.validation_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.validation_code IS 'Mã thẩm định duy nhất — neo chính cho sync Sheet↔DB. Ví dụ: VD-TB001-PQ-2026';


--
-- Name: COLUMN vmp_plan_items.missing_from_sheet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.missing_from_sheet IS 'TRUE nếu mã không còn trong Google Sheet. Dashboard ẩn đi nhưng giữ trong DB để truy vết.';


--
-- Name: COLUMN vmp_plan_items.item_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.item_state IS 'Vòng đời nghiệp vụ: active | not_applicable (Không áp dụng) | cancelled (Đã hủy). Khác missing_from_sheet và is_active.';


--
-- Name: COLUMN vmp_plan_items.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.version IS 'Bản đếm cho khóa lạc quan. CHỈ rpc_update_progress tăng (+1 mỗi lần lưu từ web). Cron/đồng bộ Sheet KHÔNG thay đổi → tránh xung đột giả.';


--
-- Name: COLUMN vmp_plan_items.departments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.departments IS 'Tập bộ phận (sx/cd/kho/rd/qc/qa) suy ra từ Sheet "bộ phận quản lý" (cột 5 canonical) bằng vmp_parse_depts(), precompute lúc sync. Nguồn chân lý cho bộ lọc Bộ phận quản lý.';


--
-- Name: COLUMN vmp_plan_items.execution_departments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vmp_plan_items.execution_departments IS 'Tập bộ phận suy ra từ cột PHỤ "Bộ phận thực hiện thẩm định" (bo_phan_thuc_hien_goc, ngoài 37 canonical). Nguồn chân lý cho chiều "Bộ phận thực hiện". Rỗng nếu Sheet không ghi.';


--
-- Name: check_doc_mismatch(public.vmp_plan_items); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_doc_mismatch(item public.vmp_plan_items) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
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

CREATE FUNCTION public.compute_doc_flags() RETURNS trigger
    LANGUAGE plpgsql
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
-- Name: compute_item_status(public.vmp_plan_items); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_item_status(item public.vmp_plan_items) RETURNS public.item_status
    LANGUAGE plpgsql IMMUTABLE
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
-- Name: compute_item_status_v2(public.vmp_plan_items); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_item_status_v2(item public.vmp_plan_items) RETURNS text
    LANGUAGE plpgsql STABLE
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
-- Name: enforce_plan_item_validation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_plan_item_validation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
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
-- Name: is_admin_or_qa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_or_qa() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT auth_user_role() IN ('admin', 'qa_manager');
$$;


--
-- Name: rpc_alert_context(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_alert_context(p_validation_code text, p_limit integer DEFAULT 5) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_item    vmp_plan_items;
  v_history JSONB;
  v_alerts  JSONB;
  v_dl_changes INT := 0;
  v_overdue_alerts INT := 0;
BEGIN
  SELECT * INTO v_item FROM vmp_plan_items WHERE validation_code = p_validation_code;
  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không tìm thấy mã: ' || p_validation_code);
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
-- Name: rpc_apply_sheet_sync(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_apply_sheet_sync(p_op text, p_validation_code text, p_patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
-- Name: rpc_check_data_quality(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_check_data_quality(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  issues JSONB := '[]'::jsonb;
BEGIN
  -- 1. Thiếu deadline VMP
  SELECT issues || COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'type', 'missing_deadline', 'severity', 'error',
    'msg', 'Thiếu deadline VMP cho hạng mục ' || id
  )), '[]'::jsonb) INTO issues
  FROM vmp_plan_items WHERE year = p_year AND deadline_vmp IS NULL AND is_active = TRUE;

  -- 2. Hoàn thành nhưng thiếu ngày
  SELECT issues || COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'type', 'done_no_date', 'severity', 'error',
    'msg', 'Trạng thái hoàn thành nhưng thiếu ngày: ' || id
  )), '[]'::jsonb) INTO issues
  FROM vmp_plan_items
  WHERE year = p_year AND status_vmp = 'completed' AND actual_vmp_date IS NULL AND is_active = TRUE;

  -- 3. Thiếu owner
  SELECT issues || COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'type', 'missing_owner', 'severity', 'warning',
    'msg', 'Thiếu người phụ trách QA: ' || id
  )), '[]'::jsonb) INTO issues
  FROM vmp_plan_items
  WHERE year = p_year AND (owner_name IS NULL OR owner_name = '' OR owner_name = '—') AND is_active = TRUE;

  -- 4. Lệch pha: thẩm định xong nhưng hồ sơ chưa
  SELECT issues || COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'type', 'mismatch_val_doc', 'severity', 'warning',
    'msg', 'Thẩm định xong nhưng hồ sơ chưa hoàn thành: ' || id
  )), '[]'::jsonb) INTO issues
  FROM vmp_plan_items
  WHERE year = p_year AND status_validation = 'completed'
    AND status_report != 'completed' AND is_active = TRUE;

  RETURN issues;
END;
$$;


--
-- Name: rpc_dashboard_kpi(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dashboard_kpi(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    result JSONB;
BEGIN
    WITH items AS (
        SELECT * FROM vmp_plan_items WHERE year = p_year AND is_active = TRUE
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
-- Name: rpc_deactivate_object(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_deactivate_object(p_code text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'qa_manager') THEN
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
-- Name: rpc_due_alerts(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_due_alerts(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer, p_soon_days integer DEFAULT 7) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
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
      FROM vmp_plan_items pi
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
-- Name: rpc_get_audit_logs(integer, integer, text, text, text, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_audit_logs(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_table_name text DEFAULT NULL::text, p_action text DEFAULT NULL::text, p_user_email text DEFAULT NULL::text, p_record_id text DEFAULT NULL::text, p_from_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to_date timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', (
      SELECT COUNT(*) FROM audit_logs
      WHERE (p_table_name IS NULL OR table_name = p_table_name)
        AND (p_action IS NULL OR action::TEXT = p_action)
        AND (p_user_email IS NULL OR user_email ILIKE '%' || p_user_email || '%')
        AND (p_record_id IS NULL OR record_id = p_record_id)
        AND (p_from_date IS NULL OR created_at >= p_from_date)
        AND (p_to_date IS NULL OR created_at <= p_to_date)
    ),
    'logs', (
      SELECT COALESCE(jsonb_agg(row_to_json(l.*) ORDER BY l.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, user_email, action::TEXT, table_name, record_id,
               old_data, new_data, change_reason, source, created_at
        FROM audit_logs
        WHERE (p_table_name IS NULL OR table_name = p_table_name)
          AND (p_action IS NULL OR action::TEXT = p_action)
          AND (p_user_email IS NULL OR user_email ILIKE '%' || p_user_email || '%')
          AND (p_record_id IS NULL OR record_id = p_record_id)
          AND (p_from_date IS NULL OR created_at >= p_from_date)
          AND (p_to_date IS NULL OR created_at <= p_to_date)
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) l
    )
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: rpc_get_item_version(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_item_version(p_validation_code text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT version FROM vmp_plan_items WHERE validation_code = p_validation_code LIMIT 1;
$$;


--
-- Name: rpc_get_missing_items(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_missing_items(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
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
    FROM vmp_plan_items
    WHERE year = p_year AND missing_from_sheet = TRUE
  );
END;
$$;


--
-- Name: rpc_get_vmp_dashboard(integer, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_vmp_dashboard(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer, p_include_missing boolean DEFAULT false, p_include_cancelled boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
declare
  result jsonb;
begin
  with latest_run as (
    select id
    from vmp_sheet_sync_runs
    where status = 'completed'
    order by created_at desc
    limit 1
  ),
  raw_status as (
    select distinct on (r.validation_code)
      r.validation_code,
      nullif(trim(r.values_json->>5), '')  as bo_phan_goc,
      nullif(trim(r.values_json->>23), '') as tt_de_cuong_goc,
      nullif(trim(r.values_json->>28), '') as tt_tham_dinh_goc,
      nullif(trim(r.values_json->>32), '') as tt_bao_cao_goc,
      nullif(trim(r.values_json->>35), '') as tt_vmp_goc
    from vmp_sheet_rows r
    join latest_run lr on r.sync_run_id = lr.id
    where r.validation_code is not null
    order by r.validation_code, r.sheet_row_number desc
  ),
  visible_items as (
    select pi.*, o.name as object_name, o.classification, o.department as obj_dept,
           o.area, o.line, o.criticality as obj_criticality, o.frequency_months,
           d.short_name as dept_short
    from vmp_plan_items pi
    join vmp_objects o on pi.object_code = o.code
    left join departments d on o.department = d.id
    where pi.year = p_year
      and pi.is_active = true
      and o.is_active = true
      and (p_include_missing or pi.missing_from_sheet = false)
      and (p_include_cancelled or coalesce(pi.item_state, 'active') <> 'cancelled')
  )
  select jsonb_build_object(
    'objects', (
      select coalesce(jsonb_agg(distinct jsonb_build_object(
        'code', o.code, 'name', o.name, 'cls', o.classification,
        'dept', o.department, 'area', o.area, 'line', o.line,
        'crit', case o.criticality when 'high' then 'Cao' when 'medium' then 'TB' else 'Thấp' end,
        'freq', o.frequency_months, 'need', true
      )), '[]'::jsonb)
      from vmp_objects o where o.is_active = true
    ),
    'activities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.validation_code,
        'validation_code', i.validation_code,
        'code', i.object_code,
        'name', i.object_name,
        'vtype', i.validation_type,
        'dept', i.obj_dept,
        -- Bộ phận QUẢN LÝ (bo_phan_goc): ưu tiên cột precompute; chưa có (chưa sync
        -- lại) thì tính tại chỗ; cuối cùng fallback dept đối tượng — khớp enrich().
        'depts', to_jsonb(coalesce(
          nullif(i.departments, array[]::text[]),
          nullif(public.vmp_parse_depts(rs.bo_phan_goc), array[]::text[]),
          array[coalesce(i.obj_dept, 'qa')]
        )),
        -- Bộ phận THỰC HIỆN (cột phụ ngoài 37): KHÔNG fallback dept đối tượng —
        -- rỗng nghĩa là Sheet chưa ghi, khớp deptGroup(bo_phan_thuc_hien_goc).
        'exec_depts', to_jsonb(coalesce(
          i.execution_departments,
          public.vmp_parse_depts(nullif(trim(i.source_sheet_data ->> 'bo_phan_thuc_hien_goc'), '')),
          '{}'::text[]
        )),
        'owner', coalesce(i.owner_name, '—'),
        'effort', i.effort_days,
        'score', i.criticality_score,
        'crit', case i.obj_criticality when 'high' then 'Cao' when 'medium' then 'TB' else 'Thấp' end,
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
          'bo_phan', i.obj_dept,
          'bo_phan_goc', rs.bo_phan_goc,
          'bo_phan_thuc_hien_goc', nullif(trim(i.source_sheet_data ->> 'bo_phan_thuc_hien_goc'), ''),
          'phan_loai', i.classification,
          'khu_vuc', i.area,
          'line', i.line,
          'tan_suat', i.frequency_months,
          'dl_vmp', i.deadline_vmp,
          'dl_de_cuong', i.deadline_protocol,
          'dl_bao_cao', i.deadline_report,
          'tt_de_cuong', i.status_protocol::text,
          'tt_tham_dinh', i.status_validation::text,
          'tt_bao_cao', i.status_report::text,
          'tt_vmp', i.status_vmp::text,
          'tt_de_cuong_goc', rs.tt_de_cuong_goc,
          'tt_tham_dinh_goc', rs.tt_tham_dinh_goc,
          'tt_bao_cao_goc', rs.tt_bao_cao_goc,
          'tt_vmp_goc', rs.tt_vmp_goc,
          'ngay_de_cuong', i.actual_protocol_date,
          'ngay_tham_dinh', i.actual_validation_date,
          'ngay_bao_cao', i.actual_report_date,
          'ngay_vmp', i.actual_vmp_date,
          'lich_td', i.scheduled_date,
          'state', coalesce(i.item_state, 'active')
        )
      )), '[]'::jsonb)
      from visible_items i
      left join raw_status rs on rs.validation_code = i.validation_code
    ),
    'source', 'supabase',
    'updated_at', now(),
    'year', p_year
  ) into result;

  return result;
end;
$$;


--
-- Name: rpc_get_vmp_watermark(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_vmp_watermark(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object(
    'year', p_year,
    'plan_items', (
      select count(*) from public.vmp_plan_items
      where year = p_year and is_active = true
    ),
    'objects', (
      select count(*) from public.vmp_objects where is_active = true
    ),
    'updated_at', greatest(
      coalesce((select max(updated_at) from public.vmp_plan_items where year = p_year), 'epoch'::timestamptz),
      coalesce((select max(updated_at) from public.vmp_objects), 'epoch'::timestamptz)
    )
  );
$$;


--
-- Name: FUNCTION rpc_get_vmp_watermark(p_year integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_get_vmp_watermark(p_year integer) IS 'Watermark nhẹ (count + max updated_at) cho web poll — chỉ refetch dashboard khi giá trị đổi.';


--
-- Name: rpc_mark_alert_sent(text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_mark_alert_sent(p_idempotency_key text, p_ok boolean, p_error text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
-- Name: rpc_reconcile_orphan_objects(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_reconcile_orphan_objects(p_codes_in_sheet text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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

CREATE FUNCTION public.rpc_refresh_computed_status() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
-- Name: rpc_register_alert(text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_register_alert(p_idempotency_key text, p_type text, p_validation_code text, p_recipient_email text, p_recipient_name text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_body_preview text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
-- Name: rpc_resolve_missing(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_resolve_missing(p_validation_code text, p_decision text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'qa_manager') THEN
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
-- Name: rpc_resolve_outbox(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_resolve_outbox(p_id bigint, p_ok boolean, p_error text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
-- Name: rpc_rollback_vmp_sheet_sync(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_rollback_vmp_sheet_sync(p_sync_run_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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
-- Name: FUNCTION rpc_rollback_vmp_sheet_sync(p_sync_run_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_rollback_vmp_sheet_sync(p_sync_run_id uuid) IS 'Exactly restores VMP domain and dependent data captured before a canonical Sheet sync run.';


--
-- Name: rpc_set_item_state(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_set_item_state(p_validation_code text, p_state text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_state NOT IN ('active','not_applicable','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trạng thái không hợp lệ');
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin','qa_manager') THEN
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
-- Name: rpc_sync_vmp_sheet_snapshot(text, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_sync_vmp_sheet_snapshot(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
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
    owner_name = excluded.owner_name,
    secondary_owner = excluded.secondary_owner,
    effort_days = excluded.effort_days,
    criticality_score = excluded.criticality_score,
    criticality = excluded.criticality,
    deadline_protocol = excluded.deadline_protocol,
    deadline_validation = excluded.deadline_validation,
    deadline_report = excluded.deadline_report,
    deadline_vmp = excluded.deadline_vmp,
    actual_protocol_date = excluded.actual_protocol_date,
    actual_validation_date = excluded.actual_validation_date,
    actual_report_date = excluded.actual_report_date,
    actual_vmp_date = excluded.actual_vmp_date,
    scheduled_date = excluded.scheduled_date,
    status_protocol = excluded.status_protocol,
    status_validation = excluded.status_validation,
    status_report = excluded.status_report,
    status_vmp = excluded.status_vmp,
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
-- Name: FUNCTION rpc_sync_vmp_sheet_snapshot(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_sync_vmp_sheet_snapshot(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb) IS 'Atomically replaces legacy VMP data on first canonical Sheet sync, then maintains an exact Sheet-owned set with backups.';


--
-- Name: rpc_sync_vmp_sheet_snapshot_with_extras(text, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_sync_vmp_sheet_snapshot_with_extras(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
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
-- Name: FUNCTION rpc_sync_vmp_sheet_snapshot_with_extras(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_sync_vmp_sheet_snapshot_with_extras(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb) IS 'Canonical Sheet sync wrapper that preserves extra non-canonical Sheet columns for dashboard read models.';


--
-- Name: rpc_update_progress(text, jsonb, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text DEFAULT NULL::text, p_sheet_patch jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_item          vmp_plan_items;
  v_role          TEXT;
  v_user_dept     TEXT;
  v_item_dept     TEXT;
  v_requires_reason BOOLEAN := FALSE;
  v_outbox_id     BIGINT := NULL;
BEGIN
  SELECT role, department INTO v_role, v_user_dept
  FROM profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  END IF;

  SELECT * INTO v_item FROM vmp_plan_items
  WHERE validation_code = p_validation_code AND is_active = TRUE;

  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || p_validation_code);
  END IF;

  IF v_role = 'viewer' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Viewer không có quyền cập nhật');
  END IF;

  IF v_role = 'department_user' THEN
    -- BẤT BIẾN #5 FIX: department lấy qua vmp_objects.department (không có cột department ở vmp_plan_items)
    SELECT o.department INTO v_item_dept
    FROM vmp_objects o WHERE o.code = v_item.object_code;

    IF v_item_dept IS DISTINCT FROM v_user_dept THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Bạn chỉ được cập nhật hạng mục thuộc bộ phận của mình');
    END IF;
  END IF;

  -- Chặn cập nhật hạng mục đã hủy/Không áp dụng
  IF COALESCE(v_item.item_state, 'active') <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Hạng mục đang ở trạng thái nghiệp vụ "' || v_item.item_state ||
      '" — không thể cập nhật tiến độ. Đổi sang "active" trước.');
  END IF;

  v_requires_reason := (p_patch->>'status_vmp'        = 'completed')
                    OR (p_patch->>'status_validation' = 'completed')
                    OR (p_patch->>'status_report'     = 'completed')
                    OR (p_patch->>'status_protocol'   = 'completed')
                    OR (p_patch ? 'actual_vmp_date')
                    OR (p_patch ? 'actual_validation_date')
                    OR (p_patch ? 'actual_report_date')
                    OR (p_patch ? 'actual_protocol_date');

  IF v_requires_reason AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Cần nhập LÝ DO khi đánh dấu hoàn thành hoặc sửa ngày hoàn thành (yêu cầu GMP)');
  END IF;

  PERFORM set_config('app.audit_source', 'dashboard_rpc', true);
  PERFORM set_config('app.audit_reason', COALESCE(p_reason, ''), true);

  UPDATE vmp_plan_items SET
    status_protocol    = COALESCE((p_patch->>'status_protocol')::phase_status, status_protocol),
    status_validation  = COALESCE((p_patch->>'status_validation')::phase_status, status_validation),
    status_report      = COALESCE((p_patch->>'status_report')::phase_status, status_report),
    status_vmp         = COALESCE((p_patch->>'status_vmp')::phase_status, status_vmp),
    actual_protocol_date   = COALESCE((p_patch->>'actual_protocol_date')::DATE, actual_protocol_date),
    actual_validation_date = COALESCE((p_patch->>'actual_validation_date')::DATE, actual_validation_date),
    actual_report_date     = COALESCE((p_patch->>'actual_report_date')::DATE, actual_report_date),
    actual_vmp_date        = COALESCE((p_patch->>'actual_vmp_date')::DATE, actual_vmp_date),
    scheduled_date         = COALESCE((p_patch->>'scheduled_date')::DATE, scheduled_date),
    updated_by = auth.uid(),
    updated_at = NOW()
  WHERE validation_code = p_validation_code;

  IF p_sheet_patch IS NOT NULL AND p_sheet_patch <> '{}'::jsonb THEN
    -- next_attempt_at + 30s để WF-04 mirror tức thời có thời gian hoàn tất
    -- TRƯỚC khi WF-06 (chạy mỗi 1 phút) claim → giảm ghi Sheet trùng.
    INSERT INTO sheet_sync_outbox (validation_code, sheet_patch, status, next_attempt_at)
    VALUES (p_validation_code, p_sheet_patch, 'pending', NOW() + INTERVAL '30 seconds')
    ON CONFLICT (validation_code) WHERE status = 'pending'
    DO UPDATE SET sheet_patch     = sheet_sync_outbox.sheet_patch || EXCLUDED.sheet_patch,
                  next_attempt_at = NOW() + INTERVAL '30 seconds',
                  updated_at      = NOW()
    RETURNING id INTO v_outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'validation_code', p_validation_code,
    'msg', 'Đã cập nhật thành công',
    'reason_logged', v_requires_reason,
    'outbox_id', v_outbox_id
  );
EXCEPTION
  WHEN OTHERS THEN
    -- S2-A FIX: LOG lỗi gốc ra Postgres logs + ghi data_quality_issues
    RAISE LOG 'rpc_update_progress lỗi (code=%, sqlstate=%): %',
      p_validation_code, SQLSTATE, SQLERRM;
    BEGIN
      INSERT INTO data_quality_issues (
        plan_item_id, object_code, issue_type, severity, message, detected_at
      ) VALUES (
        (SELECT id FROM vmp_plan_items WHERE validation_code = p_validation_code LIMIT 1),
        NULL, 'rpc_error', 'error',
        'rpc_update_progress(' || p_validation_code || '): ' || SQLERRM || ' [sqlstate=' || SQLSTATE || ']',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      -- nếu bảng data_quality_issues không tồn tại hoặc khác schema, bỏ qua
      NULL;
    END;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;


--
-- Name: rpc_update_progress(text, jsonb, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text DEFAULT NULL::text, p_sheet_patch jsonb DEFAULT NULL::jsonb, p_expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_item            vmp_plan_items;
  v_role            TEXT;
  v_user_dept       TEXT;
  v_item_dept       TEXT;
  v_requires_reason BOOLEAN := FALSE;
  v_outbox_id       BIGINT := NULL;
BEGIN
  SELECT role, department INTO v_role, v_user_dept
  FROM profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  END IF;

  SELECT * INTO v_item FROM vmp_plan_items
  WHERE validation_code = p_validation_code AND is_active = TRUE;

  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Không tìm thấy mã thẩm định: ' || p_validation_code);
  END IF;

  -- (MỚI) KHÓA LẠC QUAN: nếu client gửi version kỳ vọng mà DB đã khác → có người sửa trước.
  IF p_expected_version IS NOT NULL AND v_item.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'version_conflict',
      'error', 'Hạng mục đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại dữ liệu và thử lại.',
      'current_version', v_item.version
    );
  END IF;

  IF v_role = 'viewer' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Viewer không có quyền cập nhật');
  END IF;

  IF v_role = 'department_user' THEN
    SELECT o.department INTO v_item_dept
    FROM vmp_objects o WHERE o.code = v_item.object_code;
    IF v_item_dept IS DISTINCT FROM v_user_dept THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Bạn chỉ được cập nhật hạng mục thuộc bộ phận của mình');
    END IF;
  END IF;

  IF COALESCE(v_item.item_state, 'active') <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Hạng mục đang ở trạng thái nghiệp vụ "' || v_item.item_state ||
      '" — không thể cập nhật tiến độ. Đổi sang "active" trước.');
  END IF;

  v_requires_reason := (p_patch->>'status_vmp'        = 'completed')
                    OR (p_patch->>'status_validation' = 'completed')
                    OR (p_patch->>'status_report'     = 'completed')
                    OR (p_patch->>'status_protocol'   = 'completed')
                    OR (p_patch ? 'actual_vmp_date')
                    OR (p_patch ? 'actual_validation_date')
                    OR (p_patch ? 'actual_report_date')
                    OR (p_patch ? 'actual_protocol_date');

  IF v_requires_reason AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Cần nhập LÝ DO khi đánh dấu hoàn thành hoặc sửa ngày hoàn thành (yêu cầu GMP)');
  END IF;

  PERFORM set_config('app.audit_source', 'dashboard_rpc', true);
  PERFORM set_config('app.audit_reason', COALESCE(p_reason, ''), true);

  UPDATE vmp_plan_items SET
    status_protocol    = COALESCE((p_patch->>'status_protocol')::phase_status, status_protocol),
    status_validation  = COALESCE((p_patch->>'status_validation')::phase_status, status_validation),
    status_report      = COALESCE((p_patch->>'status_report')::phase_status, status_report),
    status_vmp         = COALESCE((p_patch->>'status_vmp')::phase_status, status_vmp),
    actual_protocol_date   = COALESCE((p_patch->>'actual_protocol_date')::DATE, actual_protocol_date),
    actual_validation_date = COALESCE((p_patch->>'actual_validation_date')::DATE, actual_validation_date),
    actual_report_date     = COALESCE((p_patch->>'actual_report_date')::DATE, actual_report_date),
    actual_vmp_date        = COALESCE((p_patch->>'actual_vmp_date')::DATE, actual_vmp_date),
    scheduled_date         = COALESCE((p_patch->>'scheduled_date')::DATE, scheduled_date),
    version    = version + 1,        -- (MỚI) tăng bản đếm cho khóa lạc quan
    updated_by = auth.uid(),
    updated_at = NOW()
  WHERE validation_code = p_validation_code;

  IF p_sheet_patch IS NOT NULL AND p_sheet_patch <> '{}'::jsonb THEN
    INSERT INTO sheet_sync_outbox (validation_code, sheet_patch, status, next_attempt_at)
    VALUES (p_validation_code, p_sheet_patch, 'pending', NOW() + INTERVAL '30 seconds')
    ON CONFLICT (validation_code) WHERE status = 'pending'
    DO UPDATE SET sheet_patch     = sheet_sync_outbox.sheet_patch || EXCLUDED.sheet_patch,
                  next_attempt_at = NOW() + INTERVAL '30 seconds',
                  updated_at      = NOW()
    RETURNING id INTO v_outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'validation_code', p_validation_code,
    'msg', 'Đã cập nhật thành công',
    'reason_logged', v_requires_reason,
    'outbox_id', v_outbox_id,
    'version', v_item.version + 1
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'rpc_update_progress lỗi (code=%, sqlstate=%): %',
      p_validation_code, SQLSTATE, SQLERRM;
    BEGIN
      INSERT INTO data_quality_issues (
        plan_item_id, object_code, issue_type, severity, message, detected_at
      ) VALUES (
        (SELECT id FROM vmp_plan_items WHERE validation_code = p_validation_code LIMIT 1),
        NULL, 'rpc_error', 'error',
        'rpc_update_progress(' || p_validation_code || '): ' || SQLERRM || ' [sqlstate=' || SQLSTATE || ']',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;


--
-- Name: rpc_upsert_object(text, text, text, text, text, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_object(p_code text, p_name text, p_classification text, p_department text, p_area text, p_criticality text, p_frequency_months integer, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'qa_manager') THEN
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
-- Name: trigger_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: validate_plan_item(public.vmp_plan_items); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_plan_item(item public.vmp_plan_items) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
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
-- Name: vmp_parse_depts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vmp_parse_depts(p_raw text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
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
-- Name: FUNCTION vmp_parse_depts(p_raw text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.vmp_parse_depts(p_raw text) IS 'Bản SQL của frontend parseDepts(): tách chuỗi bộ phận gốc thành tập {sx,cd,kho,rd,qc,qa}. QLCL=QA+QC.';


--
-- Name: vmp_sheet_classification(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vmp_sheet_classification(p_value text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
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
-- Name: vmp_sheet_criticality(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vmp_sheet_criticality(p_score text, p_report_class text) RETURNS public.criticality
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
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
-- Name: vmp_sheet_date(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vmp_sheet_date(p_value text) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
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
-- Name: vmp_sheet_department(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vmp_sheet_department(p_value text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
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
-- Name: vmp_sheet_number(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vmp_sheet_number(p_value text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
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
-- Name: vmp_sheet_status(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vmp_sheet_status(p_value text) RETURNS public.phase_status
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
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
-- Name: vmp_sheet_value(jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vmp_sheet_value(p_values jsonb, p_index integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select nullif(btrim(p_values ->> p_index), '');
$$;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    user_email text,
    user_name text,
    user_role public.user_role,
    action public.audit_action NOT NULL,
    table_name text,
    record_id text,
    old_data jsonb,
    new_data jsonb,
    change_reason text,
    ip_address inet,
    user_agent text,
    source text DEFAULT 'dashboard'::text,
    created_at timestamp with time zone DEFAULT now(),
    validation_code text,
    changed_fields text[]
);


--
-- Name: COLUMN audit_logs.validation_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.validation_code IS 'Mã thẩm định liên quan — để lọc audit theo mã nhanh hơn';


--
-- Name: COLUMN audit_logs.changed_fields; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.changed_fields IS 'Danh sách trường đã thay đổi. Ví dụ: {status_vmp, actual_vmp_date}';


--
-- Name: data_quality_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_quality_issues (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    plan_item_id text,
    object_code text,
    issue_type text NOT NULL,
    severity public.quality_severity DEFAULT 'warning'::public.quality_severity NOT NULL,
    field_name text,
    field_value text,
    expected_value text,
    message text NOT NULL,
    source_row integer,
    is_resolved boolean DEFAULT false,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_note text,
    workflow_run_id uuid,
    detected_at timestamp with time zone DEFAULT now()
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id text NOT NULL,
    name text NOT NULL,
    short_name text NOT NULL,
    manager_id uuid,
    email text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    role public.user_role DEFAULT 'viewer'::public.user_role NOT NULL,
    department text,
    phone text,
    title text,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sheet_sync_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sheet_sync_outbox (
    id bigint NOT NULL,
    validation_code text NOT NULL,
    sheet_patch jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'dashboard'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sheet_sync_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sheet_sync_outbox IS 'Hàng đợi đẩy tiến độ Web→Google Sheet. WF-06 rút và ghi Sheet (có retry) để Sheet luôn khớp Supabase.';


--
-- Name: sheet_sync_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sheet_sync_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sheet_sync_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sheet_sync_outbox_id_seq OWNED BY public.sheet_sync_outbox.id;


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    category text DEFAULT 'general'::text,
    is_sensitive boolean DEFAULT false,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: vmp_ai_report_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_ai_report_cache (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    report_data jsonb NOT NULL,
    ai_model text DEFAULT 'gpt-4o'::text,
    ai_response text NOT NULL,
    prompt_used text,
    created_by uuid,
    created_by_email text,
    created_at timestamp with time zone DEFAULT now(),
    disclaimer text DEFAULT 'BẢN NHÁP AI — Cần QA xác nhận trước khi phát hành'::text
);


--
-- Name: vmp_ai_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_ai_reviews (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    snapshot_id uuid NOT NULL,
    ai_provider text DEFAULT 'anthropic'::text,
    ai_model text,
    prompt_used text NOT NULL,
    input_data jsonb NOT NULL,
    ai_response text NOT NULL,
    is_approved boolean DEFAULT false,
    disclaimer text DEFAULT 'BẢN NHÁP AI — Cần QA xác nhận trước khi phát hành'::text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_comments text,
    tokens_used integer,
    generation_time_ms integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vmp_deadline_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_deadline_rules (
    id integer NOT NULL,
    report_class text NOT NULL,
    report_days integer DEFAULT 2 NOT NULL,
    protocol_offset integer DEFAULT 60 NOT NULL,
    report_offset integer DEFAULT 5 NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: vmp_deadline_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vmp_deadline_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vmp_deadline_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vmp_deadline_rules_id_seq OWNED BY public.vmp_deadline_rules.id;


--
-- Name: vmp_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    idempotency_key text NOT NULL,
    notification_type text NOT NULL,
    plan_item_id text,
    recipient_email text NOT NULL,
    recipient_name text,
    channel public.notification_ch DEFAULT 'email'::public.notification_ch,
    subject text,
    body_preview text,
    sent_at timestamp with time zone,
    status text DEFAULT 'pending'::text,
    error_message text,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    next_retry_at timestamp with time zone,
    workflow_run_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vmp_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_objects (
    code text NOT NULL,
    name text NOT NULL,
    classification text DEFAULT 'tb'::text NOT NULL,
    department text,
    area text DEFAULT '—'::text,
    line text DEFAULT '—'::text,
    gxp_impact text DEFAULT 'GxP'::text,
    criticality_score integer,
    criticality public.criticality DEFAULT 'medium'::public.criticality NOT NULL,
    frequency_months integer DEFAULT 12,
    is_active boolean DEFAULT true,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    source_sync_run_id uuid,
    source_sheet_row integer,
    source_sheet_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT vmp_objects_criticality_score_check CHECK (((criticality_score >= 1) AND (criticality_score <= 9)))
);


--
-- Name: TABLE vmp_objects; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vmp_objects IS 'Read-only projection of canonical Google Sheet VMP objects for browser roles. Mutated only by the n8n snapshot service.';


--
-- Name: vmp_progress_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_progress_events (
    event_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    plan_item_id text NOT NULL,
    phase text NOT NULL,
    old_status public.phase_status,
    new_status public.phase_status NOT NULL,
    old_date date,
    new_date date,
    change_reason text,
    changed_by uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now(),
    source text DEFAULT 'dashboard'::text,
    ip_address inet,
    user_agent text
);


--
-- Name: vmp_report_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_report_snapshots (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    report_period public.report_period NOT NULL,
    period_label text NOT NULL,
    scope text DEFAULT 'all'::text,
    scope_label text DEFAULT 'Toàn nhà máy'::text,
    year integer NOT NULL,
    kpi_data jsonb NOT NULL,
    items_snapshot jsonb,
    overdue_list jsonb,
    mismatch_list jsonb,
    filter_applied jsonb,
    status public.report_status DEFAULT 'draft'::public.report_status,
    template_version text DEFAULT 'v2.0'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    approved_by uuid,
    approved_at timestamp with time zone,
    exported_format text[],
    file_urls jsonb
);


--
-- Name: vmp_sheet_row_extras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_sheet_row_extras (
    sync_run_id uuid NOT NULL,
    sheet_row_number integer NOT NULL,
    validation_code text NOT NULL,
    object_code text NOT NULL,
    extra_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vmp_sheet_row_extras_extra_json_check CHECK ((jsonb_typeof(extra_json) = 'object'::text)),
    CONSTRAINT vmp_sheet_row_extras_sheet_row_number_check CHECK ((sheet_row_number >= 2))
);


--
-- Name: vmp_sheet_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_sheet_rows (
    sync_run_id uuid NOT NULL,
    sheet_row_number integer NOT NULL,
    values_json jsonb NOT NULL,
    validation_code text NOT NULL,
    object_code text NOT NULL,
    row_hash text NOT NULL,
    CONSTRAINT vmp_sheet_rows_sheet_row_number_check CHECK ((sheet_row_number >= 2)),
    CONSTRAINT vmp_sheet_rows_values_json_check CHECK ((jsonb_typeof(values_json) = 'array'::text))
);


--
-- Name: vmp_sheet_sync_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_sheet_sync_backups (
    sync_run_id uuid NOT NULL,
    dataset text NOT NULL,
    row_count integer NOT NULL,
    rows_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vmp_sheet_sync_backups_dataset_check CHECK ((dataset = ANY (ARRAY['vmp_plan_items'::text, 'vmp_objects'::text, 'data_quality_issues'::text, 'vmp_notifications'::text, 'vmp_progress_events'::text]))),
    CONSTRAINT vmp_sheet_sync_backups_rows_json_check CHECK ((jsonb_typeof(rows_json) = 'array'::text))
);


--
-- Name: vmp_sheet_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vmp_sheet_sync_runs (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    sheet_id text NOT NULL,
    sheet_gid text NOT NULL,
    tab_name text NOT NULL,
    headers jsonb NOT NULL,
    source_row_count integer NOT NULL,
    unique_validation_count integer NOT NULL,
    object_count integer NOT NULL,
    duplicate_validation_count integer DEFAULT 0 NOT NULL,
    checksum text NOT NULL,
    status text DEFAULT 'applying'::text NOT NULL,
    result jsonb,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vmp_sheet_sync_runs_duplicate_validation_count_check CHECK ((duplicate_validation_count >= 0)),
    CONSTRAINT vmp_sheet_sync_runs_headers_check CHECK ((jsonb_typeof(headers) = 'array'::text)),
    CONSTRAINT vmp_sheet_sync_runs_object_count_check CHECK ((object_count >= 0)),
    CONSTRAINT vmp_sheet_sync_runs_source_row_count_check CHECK ((source_row_count >= 0)),
    CONSTRAINT vmp_sheet_sync_runs_status_check CHECK ((status = ANY (ARRAY['applying'::text, 'completed'::text, 'failed'::text, 'rolled_back'::text]))),
    CONSTRAINT vmp_sheet_sync_runs_unique_validation_count_check CHECK ((unique_validation_count >= 0))
);


--
-- Name: vmp_status_current; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vmp_status_current AS
 SELECT pi.id,
    pi.object_code,
    pi.validation_type,
    pi.deadline_vmp,
    pi.deadline_protocol,
    pi.deadline_validation,
    pi.deadline_report,
    pi.computed_status,
    pi.status_protocol,
    pi.status_validation,
    pi.status_report,
    pi.status_vmp,
    pi.is_doc_complete,
    pi.has_mismatch,
    pi.owner_name,
    pi.criticality,
    pi.criticality_score,
    o.name AS object_name,
    o.classification,
    o.department,
    d.short_name AS dept_short,
        CASE
            WHEN (pi.status_vmp = 'completed'::public.phase_status) THEN 'done'::text
            WHEN ((pi.deadline_vmp IS NOT NULL) AND (pi.deadline_vmp < CURRENT_DATE) AND (pi.status_vmp <> 'completed'::public.phase_status)) THEN 'over'::text
            WHEN ((pi.status_validation = 'in_progress'::public.phase_status) OR (pi.status_protocol = 'completed'::public.phase_status)) THEN 'prog'::text
            WHEN ((pi.deadline_protocol IS NOT NULL) AND ((pi.deadline_protocol - CURRENT_DATE) > 30)) THEN 'plan'::text
            ELSE 'todo'::text
        END AS derived_status,
        CASE
            WHEN (pi.deadline_vmp IS NOT NULL) THEN (pi.deadline_vmp - CURRENT_DATE)
            ELSE NULL::integer
        END AS days_to_deadline,
        CASE
            WHEN ((pi.status_validation = 'completed'::public.phase_status) AND (pi.status_report <> 'completed'::public.phase_status)) THEN 'val_done_doc_pending'::text
            WHEN ((pi.status_validation <> 'completed'::public.phase_status) AND (pi.status_report = 'completed'::public.phase_status)) THEN 'doc_done_val_pending'::text
            ELSE NULL::text
        END AS derived_mismatch
   FROM ((public.vmp_plan_items pi
     JOIN public.vmp_objects o ON ((pi.object_code = o.code)))
     LEFT JOIN public.departments d ON ((o.department = d.id)))
  WHERE ((pi.is_active = true) AND (o.is_active = true));


--
-- Name: workflow_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_runs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    workflow_id text NOT NULL,
    workflow_name text NOT NULL,
    execution_id text,
    status public.workflow_status NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone,
    duration_ms integer,
    input_summary jsonb,
    output_summary jsonb,
    error_message text,
    error_details jsonb,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    parent_run_id uuid,
    triggered_by text DEFAULT 'schedule'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sheet_sync_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_sync_outbox ALTER COLUMN id SET DEFAULT nextval('public.sheet_sync_outbox_id_seq'::regclass);


--
-- Name: vmp_deadline_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_deadline_rules ALTER COLUMN id SET DEFAULT nextval('public.vmp_deadline_rules_id_seq'::regclass);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: data_quality_issues data_quality_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_issues
    ADD CONSTRAINT data_quality_issues_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: sheet_sync_outbox sheet_sync_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_sync_outbox
    ADD CONSTRAINT sheet_sync_outbox_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (key);


--
-- Name: vmp_ai_report_cache vmp_ai_report_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_ai_report_cache
    ADD CONSTRAINT vmp_ai_report_cache_pkey PRIMARY KEY (id);


--
-- Name: vmp_ai_reviews vmp_ai_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_ai_reviews
    ADD CONSTRAINT vmp_ai_reviews_pkey PRIMARY KEY (id);


--
-- Name: vmp_deadline_rules vmp_deadline_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_deadline_rules
    ADD CONSTRAINT vmp_deadline_rules_pkey PRIMARY KEY (id);


--
-- Name: vmp_deadline_rules vmp_deadline_rules_report_class_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_deadline_rules
    ADD CONSTRAINT vmp_deadline_rules_report_class_key UNIQUE (report_class);


--
-- Name: vmp_notifications vmp_notifications_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_notifications
    ADD CONSTRAINT vmp_notifications_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: vmp_notifications vmp_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_notifications
    ADD CONSTRAINT vmp_notifications_pkey PRIMARY KEY (id);


--
-- Name: vmp_objects vmp_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_objects
    ADD CONSTRAINT vmp_objects_pkey PRIMARY KEY (code);


--
-- Name: vmp_plan_items vmp_plan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_plan_items
    ADD CONSTRAINT vmp_plan_items_pkey PRIMARY KEY (id);


--
-- Name: vmp_progress_events vmp_progress_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_progress_events
    ADD CONSTRAINT vmp_progress_events_pkey PRIMARY KEY (event_id);


--
-- Name: vmp_report_snapshots vmp_report_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_report_snapshots
    ADD CONSTRAINT vmp_report_snapshots_pkey PRIMARY KEY (id);


--
-- Name: vmp_sheet_row_extras vmp_sheet_row_extras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_sheet_row_extras
    ADD CONSTRAINT vmp_sheet_row_extras_pkey PRIMARY KEY (sync_run_id, sheet_row_number);


--
-- Name: vmp_sheet_rows vmp_sheet_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_sheet_rows
    ADD CONSTRAINT vmp_sheet_rows_pkey PRIMARY KEY (sync_run_id, sheet_row_number);


--
-- Name: vmp_sheet_sync_backups vmp_sheet_sync_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_sheet_sync_backups
    ADD CONSTRAINT vmp_sheet_sync_backups_pkey PRIMARY KEY (sync_run_id, dataset);


--
-- Name: vmp_sheet_sync_runs vmp_sheet_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_sheet_sync_runs
    ADD CONSTRAINT vmp_sheet_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: workflow_runs workflow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);


--
-- Name: idx_ai_cache_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_cache_created ON public.vmp_ai_report_cache USING btree (created_at DESC);


--
-- Name: idx_ai_review_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_review_approved ON public.vmp_ai_reviews USING btree (is_approved);


--
-- Name: idx_ai_review_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_review_snapshot ON public.vmp_ai_reviews USING btree (snapshot_id);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_record ON public.audit_logs USING btree (record_id);


--
-- Name: idx_audit_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_table ON public.audit_logs USING btree (table_name);


--
-- Name: idx_audit_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_time ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_audit_validation_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_validation_code ON public.audit_logs USING btree (validation_code);


--
-- Name: idx_dept_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dept_active ON public.departments USING btree (is_active);


--
-- Name: idx_dq_detected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dq_detected ON public.data_quality_issues USING btree (detected_at DESC);


--
-- Name: idx_dq_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dq_item ON public.data_quality_issues USING btree (plan_item_id);


--
-- Name: idx_dq_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dq_resolved ON public.data_quality_issues USING btree (is_resolved);


--
-- Name: idx_dq_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dq_severity ON public.data_quality_issues USING btree (severity);


--
-- Name: idx_dq_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dq_type ON public.data_quality_issues USING btree (issue_type);


--
-- Name: idx_notif_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_created ON public.vmp_notifications USING btree (created_at DESC);


--
-- Name: idx_notif_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_idempotency ON public.vmp_notifications USING btree (idempotency_key);


--
-- Name: idx_notif_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_recipient ON public.vmp_notifications USING btree (recipient_email);


--
-- Name: idx_notif_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_status ON public.vmp_notifications USING btree (status);


--
-- Name: idx_notif_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_type ON public.vmp_notifications USING btree (notification_type);


--
-- Name: idx_outbox_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_code ON public.sheet_sync_outbox USING btree (validation_code, status);


--
-- Name: idx_outbox_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_due ON public.sheet_sync_outbox USING btree (next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'error'::text]));


--
-- Name: idx_outbox_one_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_outbox_one_pending ON public.sheet_sync_outbox USING btree (validation_code) WHERE (status = 'pending'::text);


--
-- Name: idx_plan_active_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_active_year ON public.vmp_plan_items USING btree (year, is_active) WHERE (is_active = true);


--
-- Name: idx_plan_dl_proto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_dl_proto ON public.vmp_plan_items USING btree (deadline_protocol);


--
-- Name: idx_plan_dl_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_dl_report ON public.vmp_plan_items USING btree (deadline_report);


--
-- Name: idx_plan_dl_vmp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_dl_vmp ON public.vmp_plan_items USING btree (deadline_vmp);


--
-- Name: idx_plan_item_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_item_state ON public.vmp_plan_items USING btree (year, item_state);


--
-- Name: idx_plan_mismatch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_mismatch ON public.vmp_plan_items USING btree (has_mismatch) WHERE (has_mismatch IS NOT NULL);


--
-- Name: idx_plan_obj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_obj ON public.vmp_plan_items USING btree (object_code);


--
-- Name: idx_plan_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_owner ON public.vmp_plan_items USING btree (owner_id);


--
-- Name: idx_plan_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_search ON public.vmp_plan_items USING gin ((((((id || ' '::text) || COALESCE(owner_name, ''::text)) || ' '::text) || validation_type)) extensions.gin_trgm_ops);


--
-- Name: idx_plan_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_status ON public.vmp_plan_items USING btree (computed_status);


--
-- Name: idx_plan_validation_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_plan_validation_code ON public.vmp_plan_items USING btree (validation_code);


--
-- Name: idx_plan_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_visible ON public.vmp_plan_items USING btree (year, is_active, missing_from_sheet) WHERE ((is_active = true) AND (missing_from_sheet = false));


--
-- Name: idx_plan_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_year ON public.vmp_plan_items USING btree (year);


--
-- Name: idx_profiles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_active ON public.profiles USING btree (is_active);


--
-- Name: idx_profiles_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_dept ON public.profiles USING btree (department);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_progress_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_progress_item ON public.vmp_progress_events USING btree (plan_item_id);


--
-- Name: idx_progress_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_progress_phase ON public.vmp_progress_events USING btree (phase);


--
-- Name: idx_progress_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_progress_time ON public.vmp_progress_events USING btree (changed_at DESC);


--
-- Name: idx_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_progress_user ON public.vmp_progress_events USING btree (changed_by);


--
-- Name: idx_snapshot_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshot_created ON public.vmp_report_snapshots USING btree (created_at DESC);


--
-- Name: idx_snapshot_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshot_period ON public.vmp_report_snapshots USING btree (report_period);


--
-- Name: idx_snapshot_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshot_status ON public.vmp_report_snapshots USING btree (status);


--
-- Name: idx_snapshot_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshot_year ON public.vmp_report_snapshots USING btree (year);


--
-- Name: idx_vmp_obj_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_obj_active ON public.vmp_objects USING btree (is_active);


--
-- Name: idx_vmp_obj_cls; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_obj_cls ON public.vmp_objects USING btree (classification);


--
-- Name: idx_vmp_obj_crit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_obj_crit ON public.vmp_objects USING btree (criticality);


--
-- Name: idx_vmp_obj_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_obj_dept ON public.vmp_objects USING btree (department);


--
-- Name: idx_vmp_obj_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_obj_search ON public.vmp_objects USING gin ((((((code || ' '::text) || name) || ' '::text) || COALESCE(area, ''::text))) extensions.gin_trgm_ops);


--
-- Name: idx_vmp_objects_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_objects_updated_at ON public.vmp_objects USING btree (updated_at DESC);


--
-- Name: idx_vmp_plan_items_departments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_plan_items_departments ON public.vmp_plan_items USING gin (departments);


--
-- Name: idx_vmp_plan_items_execution_departments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_plan_items_execution_departments ON public.vmp_plan_items USING gin (execution_departments);


--
-- Name: idx_vmp_plan_items_year_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_plan_items_year_updated_at ON public.vmp_plan_items USING btree (year, updated_at DESC);


--
-- Name: idx_vmp_sheet_row_extras_validation_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_sheet_row_extras_validation_code ON public.vmp_sheet_row_extras USING btree (validation_code);


--
-- Name: idx_vmp_sheet_rows_object_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_sheet_rows_object_code ON public.vmp_sheet_rows USING btree (object_code);


--
-- Name: idx_vmp_sheet_rows_validation_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_sheet_rows_validation_code ON public.vmp_sheet_rows USING btree (validation_code);


--
-- Name: idx_vmp_sync_runs_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vmp_sync_runs_status_created ON public.vmp_sheet_sync_runs USING btree (status, created_at DESC);


--
-- Name: idx_wf_run_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_run_status ON public.workflow_runs USING btree (status);


--
-- Name: idx_wf_run_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_run_time ON public.workflow_runs USING btree (started_at DESC);


--
-- Name: idx_wf_run_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_run_workflow ON public.workflow_runs USING btree (workflow_id);


--
-- Name: uq_data_quality_unresolved_validation_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_data_quality_unresolved_validation_issue ON public.data_quality_issues USING btree (plan_item_id, issue_type, message) WHERE (is_resolved IS NOT TRUE);


--
-- Name: vmp_plan_items audit_vmp_plan_items_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_vmp_plan_items_v2 AFTER INSERT OR DELETE OR UPDATE ON public.vmp_plan_items FOR EACH ROW EXECUTE FUNCTION public.audit_plan_item_changes_v2();


--
-- Name: departments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: profiles set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: system_config set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: vmp_deadline_rules set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vmp_deadline_rules FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: vmp_objects set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vmp_objects FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: vmp_plan_items set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vmp_plan_items FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


--
-- Name: vmp_objects trg_audit_objects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_objects AFTER INSERT OR DELETE OR UPDATE ON public.vmp_objects FOR EACH ROW EXECUTE FUNCTION public.audit_object_changes();


--
-- Name: vmp_plan_items trg_compute_flags; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_compute_flags BEFORE INSERT OR UPDATE ON public.vmp_plan_items FOR EACH ROW EXECUTE FUNCTION public.compute_doc_flags();


--
-- Name: vmp_plan_items trg_validate_plan_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_plan_item BEFORE INSERT OR UPDATE ON public.vmp_plan_items FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_item_validation();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: data_quality_issues data_quality_issues_plan_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_issues
    ADD CONSTRAINT data_quality_issues_plan_item_id_fkey FOREIGN KEY (plan_item_id) REFERENCES public.vmp_plan_items(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: data_quality_issues data_quality_issues_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_issues
    ADD CONSTRAINT data_quality_issues_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);


--
-- Name: data_quality_issues data_quality_issues_workflow_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_issues
    ADD CONSTRAINT data_quality_issues_workflow_run_id_fkey FOREIGN KEY (workflow_run_id) REFERENCES public.workflow_runs(id);


--
-- Name: departments departments_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES auth.users(id);


--
-- Name: profiles profiles_department_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_department_fkey FOREIGN KEY (department) REFERENCES public.departments(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: system_config system_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: vmp_ai_report_cache vmp_ai_report_cache_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_ai_report_cache
    ADD CONSTRAINT vmp_ai_report_cache_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: vmp_ai_reviews vmp_ai_reviews_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_ai_reviews
    ADD CONSTRAINT vmp_ai_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: vmp_ai_reviews vmp_ai_reviews_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_ai_reviews
    ADD CONSTRAINT vmp_ai_reviews_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.vmp_report_snapshots(id);


--
-- Name: vmp_deadline_rules vmp_deadline_rules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_deadline_rules
    ADD CONSTRAINT vmp_deadline_rules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: vmp_notifications vmp_notifications_plan_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_notifications
    ADD CONSTRAINT vmp_notifications_plan_item_id_fkey FOREIGN KEY (plan_item_id) REFERENCES public.vmp_plan_items(id);


--
-- Name: vmp_objects vmp_objects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_objects
    ADD CONSTRAINT vmp_objects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: vmp_objects vmp_objects_department_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_objects
    ADD CONSTRAINT vmp_objects_department_fkey FOREIGN KEY (department) REFERENCES public.departments(id);


--
-- Name: vmp_objects vmp_objects_source_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_objects
    ADD CONSTRAINT vmp_objects_source_sync_run_id_fkey FOREIGN KEY (source_sync_run_id) REFERENCES public.vmp_sheet_sync_runs(id) ON DELETE SET NULL;


--
-- Name: vmp_objects vmp_objects_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_objects
    ADD CONSTRAINT vmp_objects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: vmp_plan_items vmp_plan_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_plan_items
    ADD CONSTRAINT vmp_plan_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: vmp_plan_items vmp_plan_items_object_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_plan_items
    ADD CONSTRAINT vmp_plan_items_object_code_fkey FOREIGN KEY (object_code) REFERENCES public.vmp_objects(code);


--
-- Name: vmp_plan_items vmp_plan_items_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_plan_items
    ADD CONSTRAINT vmp_plan_items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);


--
-- Name: vmp_plan_items vmp_plan_items_qa_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_plan_items
    ADD CONSTRAINT vmp_plan_items_qa_approved_by_fkey FOREIGN KEY (qa_approved_by) REFERENCES auth.users(id);


--
-- Name: vmp_plan_items vmp_plan_items_source_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_plan_items
    ADD CONSTRAINT vmp_plan_items_source_sync_run_id_fkey FOREIGN KEY (source_sync_run_id) REFERENCES public.vmp_sheet_sync_runs(id) ON DELETE SET NULL;


--
-- Name: vmp_plan_items vmp_plan_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_plan_items
    ADD CONSTRAINT vmp_plan_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: vmp_progress_events vmp_progress_events_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_progress_events
    ADD CONSTRAINT vmp_progress_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- Name: vmp_progress_events vmp_progress_events_plan_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_progress_events
    ADD CONSTRAINT vmp_progress_events_plan_item_id_fkey FOREIGN KEY (plan_item_id) REFERENCES public.vmp_plan_items(id);


--
-- Name: vmp_report_snapshots vmp_report_snapshots_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_report_snapshots
    ADD CONSTRAINT vmp_report_snapshots_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: vmp_report_snapshots vmp_report_snapshots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_report_snapshots
    ADD CONSTRAINT vmp_report_snapshots_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: vmp_sheet_row_extras vmp_sheet_row_extras_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_sheet_row_extras
    ADD CONSTRAINT vmp_sheet_row_extras_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.vmp_sheet_sync_runs(id) ON DELETE CASCADE;


--
-- Name: vmp_sheet_rows vmp_sheet_rows_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_sheet_rows
    ADD CONSTRAINT vmp_sheet_rows_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.vmp_sheet_sync_runs(id) ON DELETE CASCADE;


--
-- Name: vmp_sheet_sync_backups vmp_sheet_sync_backups_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vmp_sheet_sync_backups
    ADD CONSTRAINT vmp_sheet_sync_backups_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.vmp_sheet_sync_runs(id) ON DELETE CASCADE;


--
-- Name: workflow_runs workflow_runs_parent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_parent_run_id_fkey FOREIGN KEY (parent_run_id) REFERENCES public.workflow_runs(id);


--
-- Name: vmp_ai_report_cache ai_cache_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_cache_insert ON public.vmp_ai_report_cache FOR INSERT WITH CHECK (true);


--
-- Name: vmp_ai_report_cache ai_cache_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_cache_select ON public.vmp_ai_report_cache FOR SELECT USING (true);


--
-- Name: vmp_ai_reviews ai_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_insert ON public.vmp_ai_reviews FOR INSERT WITH CHECK (true);


--
-- Name: vmp_ai_reviews ai_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_select ON public.vmp_ai_reviews FOR SELECT USING (true);


--
-- Name: vmp_ai_reviews ai_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_update ON public.vmp_ai_reviews FOR UPDATE USING (public.is_admin_or_qa());


--
-- Name: audit_logs audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_insert ON public.audit_logs FOR INSERT WITH CHECK (true);


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_select ON public.audit_logs FOR SELECT USING ((public.is_admin_or_qa() OR (user_id = auth.uid())));


--
-- Name: system_config config_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_modify ON public.system_config USING ((public.auth_user_role() = 'admin'::public.user_role));


--
-- Name: system_config config_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_select ON public.system_config FOR SELECT USING (((NOT is_sensitive) OR (public.auth_user_role() = 'admin'::public.user_role)));


--
-- Name: data_quality_issues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_quality_issues ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: departments dept_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_delete ON public.departments FOR DELETE USING ((public.auth_user_role() = 'admin'::public.user_role));


--
-- Name: departments dept_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_insert ON public.departments FOR INSERT WITH CHECK (public.is_admin_or_qa());


--
-- Name: departments dept_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_select ON public.departments FOR SELECT USING (true);


--
-- Name: departments dept_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_update ON public.departments FOR UPDATE USING (public.is_admin_or_qa());


--
-- Name: vmp_deadline_rules dl_rules_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dl_rules_modify ON public.vmp_deadline_rules USING (public.is_admin_or_qa());


--
-- Name: vmp_deadline_rules dl_rules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dl_rules_select ON public.vmp_deadline_rules FOR SELECT USING (true);


--
-- Name: data_quality_issues dq_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dq_insert ON public.data_quality_issues FOR INSERT WITH CHECK (true);


--
-- Name: data_quality_issues dq_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dq_select ON public.data_quality_issues FOR SELECT USING (public.is_admin_or_qa());


--
-- Name: data_quality_issues dq_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dq_update ON public.data_quality_issues FOR UPDATE USING (public.is_admin_or_qa());


--
-- Name: vmp_notifications notif_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_insert ON public.vmp_notifications FOR INSERT WITH CHECK (public.is_admin_or_qa());


--
-- Name: vmp_notifications notif_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_select ON public.vmp_notifications FOR SELECT USING ((public.is_admin_or_qa() OR (recipient_email = ( SELECT profiles.email
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));


--
-- Name: vmp_objects obj_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY obj_select ON public.vmp_objects FOR SELECT USING (true);


--
-- Name: sheet_sync_outbox outbox_no_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outbox_no_client ON public.sheet_sync_outbox USING (false) WITH CHECK (false);


--
-- Name: vmp_plan_items plan_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_select ON public.vmp_plan_items FOR SELECT USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK ((public.auth_user_role() = 'admin'::public.user_role));


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (((id = auth.uid()) OR public.is_admin_or_qa()));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (((id = auth.uid()) OR (public.auth_user_role() = 'admin'::public.user_role)));


--
-- Name: vmp_progress_events progress_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_insert ON public.vmp_progress_events FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: vmp_progress_events progress_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY progress_select ON public.vmp_progress_events FOR SELECT USING (true);


--
-- Name: sheet_sync_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sheet_sync_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_report_snapshots snapshot_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snapshot_insert ON public.vmp_report_snapshots FOR INSERT WITH CHECK (public.is_admin_or_qa());


--
-- Name: vmp_report_snapshots snapshot_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snapshot_select ON public.vmp_report_snapshots FOR SELECT USING (true);


--
-- Name: vmp_report_snapshots snapshot_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY snapshot_update ON public.vmp_report_snapshots FOR UPDATE USING (public.is_admin_or_qa());


--
-- Name: system_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_report_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_ai_report_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_ai_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_ai_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_deadline_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_deadline_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_plan_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_plan_items ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_progress_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_progress_events ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_report_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_report_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_sheet_row_extras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_sheet_row_extras ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_sheet_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_sheet_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_sheet_sync_backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_sheet_sync_backups ENABLE ROW LEVEL SECURITY;

--
-- Name: vmp_sheet_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vmp_sheet_sync_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_runs wf_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wf_insert ON public.workflow_runs FOR INSERT WITH CHECK (true);


--
-- Name: workflow_runs wf_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wf_select ON public.workflow_runs FOR SELECT USING (public.is_admin_or_qa());


--
-- Name: workflow_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION audit_object_changes(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_object_changes() TO anon;
GRANT ALL ON FUNCTION public.audit_object_changes() TO authenticated;
GRANT ALL ON FUNCTION public.audit_object_changes() TO service_role;


--
-- Name: FUNCTION audit_plan_item_changes(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_plan_item_changes() TO anon;
GRANT ALL ON FUNCTION public.audit_plan_item_changes() TO authenticated;
GRANT ALL ON FUNCTION public.audit_plan_item_changes() TO service_role;


--
-- Name: FUNCTION audit_plan_item_changes_v2(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_plan_item_changes_v2() TO anon;
GRANT ALL ON FUNCTION public.audit_plan_item_changes_v2() TO authenticated;
GRANT ALL ON FUNCTION public.audit_plan_item_changes_v2() TO service_role;


--
-- Name: FUNCTION auth_user_dept(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auth_user_dept() TO anon;
GRANT ALL ON FUNCTION public.auth_user_dept() TO authenticated;
GRANT ALL ON FUNCTION public.auth_user_dept() TO service_role;


--
-- Name: FUNCTION auth_user_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auth_user_role() TO anon;
GRANT ALL ON FUNCTION public.auth_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.auth_user_role() TO service_role;


--
-- Name: FUNCTION calculate_deadlines(target_date date, p_report_class text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_deadlines(target_date date, p_report_class text) TO anon;
GRANT ALL ON FUNCTION public.calculate_deadlines(target_date date, p_report_class text) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_deadlines(target_date date, p_report_class text) TO service_role;


--
-- Name: TABLE vmp_plan_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.vmp_plan_items TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.vmp_plan_items TO authenticated;
GRANT ALL ON TABLE public.vmp_plan_items TO service_role;


--
-- Name: FUNCTION check_doc_mismatch(item public.vmp_plan_items); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_doc_mismatch(item public.vmp_plan_items) TO anon;
GRANT ALL ON FUNCTION public.check_doc_mismatch(item public.vmp_plan_items) TO authenticated;
GRANT ALL ON FUNCTION public.check_doc_mismatch(item public.vmp_plan_items) TO service_role;


--
-- Name: FUNCTION compute_doc_flags(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.compute_doc_flags() TO anon;
GRANT ALL ON FUNCTION public.compute_doc_flags() TO authenticated;
GRANT ALL ON FUNCTION public.compute_doc_flags() TO service_role;


--
-- Name: FUNCTION compute_item_status(item public.vmp_plan_items); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.compute_item_status(item public.vmp_plan_items) TO anon;
GRANT ALL ON FUNCTION public.compute_item_status(item public.vmp_plan_items) TO authenticated;
GRANT ALL ON FUNCTION public.compute_item_status(item public.vmp_plan_items) TO service_role;


--
-- Name: FUNCTION compute_item_status_v2(item public.vmp_plan_items); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.compute_item_status_v2(item public.vmp_plan_items) TO anon;
GRANT ALL ON FUNCTION public.compute_item_status_v2(item public.vmp_plan_items) TO authenticated;
GRANT ALL ON FUNCTION public.compute_item_status_v2(item public.vmp_plan_items) TO service_role;


--
-- Name: FUNCTION enforce_plan_item_validation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_plan_item_validation() TO anon;
GRANT ALL ON FUNCTION public.enforce_plan_item_validation() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_plan_item_validation() TO service_role;


--
-- Name: FUNCTION is_admin_or_qa(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin_or_qa() TO anon;
GRANT ALL ON FUNCTION public.is_admin_or_qa() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin_or_qa() TO service_role;


--
-- Name: FUNCTION rpc_alert_context(p_validation_code text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_alert_context(p_validation_code text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.rpc_alert_context(p_validation_code text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_alert_context(p_validation_code text, p_limit integer) TO service_role;


--
-- Name: FUNCTION rpc_apply_sheet_sync(p_op text, p_validation_code text, p_patch jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_apply_sheet_sync(p_op text, p_validation_code text, p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_apply_sheet_sync(p_op text, p_validation_code text, p_patch jsonb) TO service_role;


--
-- Name: FUNCTION rpc_check_data_quality(p_year integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_check_data_quality(p_year integer) TO anon;
GRANT ALL ON FUNCTION public.rpc_check_data_quality(p_year integer) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_check_data_quality(p_year integer) TO service_role;


--
-- Name: FUNCTION rpc_dashboard_kpi(p_year integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_dashboard_kpi(p_year integer) TO anon;
GRANT ALL ON FUNCTION public.rpc_dashboard_kpi(p_year integer) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_dashboard_kpi(p_year integer) TO service_role;


--
-- Name: FUNCTION rpc_deactivate_object(p_code text, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_deactivate_object(p_code text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_deactivate_object(p_code text, p_reason text) TO service_role;


--
-- Name: FUNCTION rpc_due_alerts(p_year integer, p_soon_days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_due_alerts(p_year integer, p_soon_days integer) TO anon;
GRANT ALL ON FUNCTION public.rpc_due_alerts(p_year integer, p_soon_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_due_alerts(p_year integer, p_soon_days integer) TO service_role;


--
-- Name: FUNCTION rpc_get_audit_logs(p_limit integer, p_offset integer, p_table_name text, p_action text, p_user_email text, p_record_id text, p_from_date timestamp with time zone, p_to_date timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_get_audit_logs(p_limit integer, p_offset integer, p_table_name text, p_action text, p_user_email text, p_record_id text, p_from_date timestamp with time zone, p_to_date timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.rpc_get_audit_logs(p_limit integer, p_offset integer, p_table_name text, p_action text, p_user_email text, p_record_id text, p_from_date timestamp with time zone, p_to_date timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_get_audit_logs(p_limit integer, p_offset integer, p_table_name text, p_action text, p_user_email text, p_record_id text, p_from_date timestamp with time zone, p_to_date timestamp with time zone) TO service_role;


--
-- Name: FUNCTION rpc_get_item_version(p_validation_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_get_item_version(p_validation_code text) TO anon;
GRANT ALL ON FUNCTION public.rpc_get_item_version(p_validation_code text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_get_item_version(p_validation_code text) TO service_role;


--
-- Name: FUNCTION rpc_get_missing_items(p_year integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_get_missing_items(p_year integer) TO anon;
GRANT ALL ON FUNCTION public.rpc_get_missing_items(p_year integer) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_get_missing_items(p_year integer) TO service_role;


--
-- Name: FUNCTION rpc_get_vmp_dashboard(p_year integer, p_include_missing boolean, p_include_cancelled boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_get_vmp_dashboard(p_year integer, p_include_missing boolean, p_include_cancelled boolean) TO anon;
GRANT ALL ON FUNCTION public.rpc_get_vmp_dashboard(p_year integer, p_include_missing boolean, p_include_cancelled boolean) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_get_vmp_dashboard(p_year integer, p_include_missing boolean, p_include_cancelled boolean) TO service_role;


--
-- Name: FUNCTION rpc_get_vmp_watermark(p_year integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_get_vmp_watermark(p_year integer) TO anon;
GRANT ALL ON FUNCTION public.rpc_get_vmp_watermark(p_year integer) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_get_vmp_watermark(p_year integer) TO service_role;


--
-- Name: FUNCTION rpc_mark_alert_sent(p_idempotency_key text, p_ok boolean, p_error text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_mark_alert_sent(p_idempotency_key text, p_ok boolean, p_error text) TO anon;
GRANT ALL ON FUNCTION public.rpc_mark_alert_sent(p_idempotency_key text, p_ok boolean, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_mark_alert_sent(p_idempotency_key text, p_ok boolean, p_error text) TO service_role;


--
-- Name: FUNCTION rpc_reconcile_orphan_objects(p_codes_in_sheet text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_reconcile_orphan_objects(p_codes_in_sheet text[]) TO anon;
GRANT ALL ON FUNCTION public.rpc_reconcile_orphan_objects(p_codes_in_sheet text[]) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_reconcile_orphan_objects(p_codes_in_sheet text[]) TO service_role;


--
-- Name: FUNCTION rpc_refresh_computed_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_refresh_computed_status() TO anon;
GRANT ALL ON FUNCTION public.rpc_refresh_computed_status() TO authenticated;
GRANT ALL ON FUNCTION public.rpc_refresh_computed_status() TO service_role;


--
-- Name: FUNCTION rpc_register_alert(p_idempotency_key text, p_type text, p_validation_code text, p_recipient_email text, p_recipient_name text, p_subject text, p_body_preview text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_register_alert(p_idempotency_key text, p_type text, p_validation_code text, p_recipient_email text, p_recipient_name text, p_subject text, p_body_preview text) TO anon;
GRANT ALL ON FUNCTION public.rpc_register_alert(p_idempotency_key text, p_type text, p_validation_code text, p_recipient_email text, p_recipient_name text, p_subject text, p_body_preview text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_register_alert(p_idempotency_key text, p_type text, p_validation_code text, p_recipient_email text, p_recipient_name text, p_subject text, p_body_preview text) TO service_role;


--
-- Name: FUNCTION rpc_resolve_missing(p_validation_code text, p_decision text, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_resolve_missing(p_validation_code text, p_decision text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_resolve_missing(p_validation_code text, p_decision text, p_reason text) TO service_role;


--
-- Name: FUNCTION rpc_resolve_outbox(p_id bigint, p_ok boolean, p_error text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_resolve_outbox(p_id bigint, p_ok boolean, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_resolve_outbox(p_id bigint, p_ok boolean, p_error text) TO service_role;


--
-- Name: FUNCTION rpc_rollback_vmp_sheet_sync(p_sync_run_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_rollback_vmp_sheet_sync(p_sync_run_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_rollback_vmp_sheet_sync(p_sync_run_id uuid) TO service_role;


--
-- Name: FUNCTION rpc_set_item_state(p_validation_code text, p_state text, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_set_item_state(p_validation_code text, p_state text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_set_item_state(p_validation_code text, p_state text, p_reason text) TO service_role;


--
-- Name: FUNCTION rpc_sync_vmp_sheet_snapshot(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_sync_vmp_sheet_snapshot(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_sync_vmp_sheet_snapshot(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb) TO service_role;


--
-- Name: FUNCTION rpc_sync_vmp_sheet_snapshot_with_extras(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_sync_vmp_sheet_snapshot_with_extras(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_sync_vmp_sheet_snapshot_with_extras(p_sheet_id text, p_sheet_gid text, p_tab_name text, p_headers jsonb, p_rows jsonb) TO service_role;


--
-- Name: FUNCTION rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text, p_sheet_patch jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text, p_sheet_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text, p_sheet_patch jsonb) TO service_role;


--
-- Name: FUNCTION rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text, p_sheet_patch jsonb, p_expected_version integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text, p_sheet_patch jsonb, p_expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_update_progress(p_validation_code text, p_patch jsonb, p_reason text, p_sheet_patch jsonb, p_expected_version integer) TO service_role;


--
-- Name: FUNCTION rpc_upsert_object(p_code text, p_name text, p_classification text, p_department text, p_area text, p_criticality text, p_frequency_months integer, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rpc_upsert_object(p_code text, p_name text, p_classification text, p_department text, p_area text, p_criticality text, p_frequency_months integer, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rpc_upsert_object(p_code text, p_name text, p_classification text, p_department text, p_area text, p_criticality text, p_frequency_months integer, p_notes text) TO service_role;


--
-- Name: FUNCTION trigger_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trigger_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.trigger_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_set_updated_at() TO service_role;


--
-- Name: FUNCTION validate_plan_item(item public.vmp_plan_items); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_plan_item(item public.vmp_plan_items) TO anon;
GRANT ALL ON FUNCTION public.validate_plan_item(item public.vmp_plan_items) TO authenticated;
GRANT ALL ON FUNCTION public.validate_plan_item(item public.vmp_plan_items) TO service_role;


--
-- Name: FUNCTION vmp_parse_depts(p_raw text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vmp_parse_depts(p_raw text) TO anon;
GRANT ALL ON FUNCTION public.vmp_parse_depts(p_raw text) TO authenticated;
GRANT ALL ON FUNCTION public.vmp_parse_depts(p_raw text) TO service_role;


--
-- Name: FUNCTION vmp_sheet_classification(p_value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vmp_sheet_classification(p_value text) TO anon;
GRANT ALL ON FUNCTION public.vmp_sheet_classification(p_value text) TO authenticated;
GRANT ALL ON FUNCTION public.vmp_sheet_classification(p_value text) TO service_role;


--
-- Name: FUNCTION vmp_sheet_criticality(p_score text, p_report_class text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vmp_sheet_criticality(p_score text, p_report_class text) TO anon;
GRANT ALL ON FUNCTION public.vmp_sheet_criticality(p_score text, p_report_class text) TO authenticated;
GRANT ALL ON FUNCTION public.vmp_sheet_criticality(p_score text, p_report_class text) TO service_role;


--
-- Name: FUNCTION vmp_sheet_date(p_value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vmp_sheet_date(p_value text) TO anon;
GRANT ALL ON FUNCTION public.vmp_sheet_date(p_value text) TO authenticated;
GRANT ALL ON FUNCTION public.vmp_sheet_date(p_value text) TO service_role;


--
-- Name: FUNCTION vmp_sheet_department(p_value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vmp_sheet_department(p_value text) TO anon;
GRANT ALL ON FUNCTION public.vmp_sheet_department(p_value text) TO authenticated;
GRANT ALL ON FUNCTION public.vmp_sheet_department(p_value text) TO service_role;


--
-- Name: FUNCTION vmp_sheet_number(p_value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vmp_sheet_number(p_value text) TO anon;
GRANT ALL ON FUNCTION public.vmp_sheet_number(p_value text) TO authenticated;
GRANT ALL ON FUNCTION public.vmp_sheet_number(p_value text) TO service_role;


--
-- Name: FUNCTION vmp_sheet_status(p_value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vmp_sheet_status(p_value text) TO anon;
GRANT ALL ON FUNCTION public.vmp_sheet_status(p_value text) TO authenticated;
GRANT ALL ON FUNCTION public.vmp_sheet_status(p_value text) TO service_role;


--
-- Name: FUNCTION vmp_sheet_value(p_values jsonb, p_index integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vmp_sheet_value(p_values jsonb, p_index integer) TO anon;
GRANT ALL ON FUNCTION public.vmp_sheet_value(p_values jsonb, p_index integer) TO authenticated;
GRANT ALL ON FUNCTION public.vmp_sheet_value(p_values jsonb, p_index integer) TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE data_quality_issues; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.data_quality_issues TO anon;
GRANT ALL ON TABLE public.data_quality_issues TO authenticated;
GRANT ALL ON TABLE public.data_quality_issues TO service_role;


--
-- Name: TABLE departments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.departments TO anon;
GRANT ALL ON TABLE public.departments TO authenticated;
GRANT ALL ON TABLE public.departments TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE sheet_sync_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sheet_sync_outbox TO anon;
GRANT ALL ON TABLE public.sheet_sync_outbox TO authenticated;
GRANT ALL ON TABLE public.sheet_sync_outbox TO service_role;


--
-- Name: SEQUENCE sheet_sync_outbox_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.sheet_sync_outbox_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sheet_sync_outbox_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sheet_sync_outbox_id_seq TO service_role;


--
-- Name: TABLE system_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.system_config TO anon;
GRANT ALL ON TABLE public.system_config TO authenticated;
GRANT ALL ON TABLE public.system_config TO service_role;


--
-- Name: TABLE vmp_ai_report_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_ai_report_cache TO anon;
GRANT ALL ON TABLE public.vmp_ai_report_cache TO authenticated;
GRANT ALL ON TABLE public.vmp_ai_report_cache TO service_role;


--
-- Name: TABLE vmp_ai_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_ai_reviews TO anon;
GRANT ALL ON TABLE public.vmp_ai_reviews TO authenticated;
GRANT ALL ON TABLE public.vmp_ai_reviews TO service_role;


--
-- Name: TABLE vmp_deadline_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_deadline_rules TO anon;
GRANT ALL ON TABLE public.vmp_deadline_rules TO authenticated;
GRANT ALL ON TABLE public.vmp_deadline_rules TO service_role;


--
-- Name: SEQUENCE vmp_deadline_rules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.vmp_deadline_rules_id_seq TO anon;
GRANT ALL ON SEQUENCE public.vmp_deadline_rules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.vmp_deadline_rules_id_seq TO service_role;


--
-- Name: TABLE vmp_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_notifications TO anon;
GRANT ALL ON TABLE public.vmp_notifications TO authenticated;
GRANT ALL ON TABLE public.vmp_notifications TO service_role;


--
-- Name: TABLE vmp_objects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.vmp_objects TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.vmp_objects TO authenticated;
GRANT ALL ON TABLE public.vmp_objects TO service_role;


--
-- Name: TABLE vmp_progress_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_progress_events TO anon;
GRANT ALL ON TABLE public.vmp_progress_events TO authenticated;
GRANT ALL ON TABLE public.vmp_progress_events TO service_role;


--
-- Name: TABLE vmp_report_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_report_snapshots TO anon;
GRANT ALL ON TABLE public.vmp_report_snapshots TO authenticated;
GRANT ALL ON TABLE public.vmp_report_snapshots TO service_role;


--
-- Name: TABLE vmp_sheet_row_extras; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_sheet_row_extras TO service_role;


--
-- Name: TABLE vmp_sheet_rows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_sheet_rows TO service_role;


--
-- Name: TABLE vmp_sheet_sync_backups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_sheet_sync_backups TO service_role;


--
-- Name: TABLE vmp_sheet_sync_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_sheet_sync_runs TO service_role;


--
-- Name: TABLE vmp_status_current; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vmp_status_current TO anon;
GRANT ALL ON TABLE public.vmp_status_current TO authenticated;
GRANT ALL ON TABLE public.vmp_status_current TO service_role;


--
-- Name: TABLE workflow_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workflow_runs TO anon;
GRANT ALL ON TABLE public.workflow_runs TO authenticated;
GRANT ALL ON TABLE public.workflow_runs TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict i4rhe7KCMFMwMpb2uuDiRFANRAzEBrxzhPN9A53DrY9kxxmhxSJ3hl6VGRs1Pr6

