--
-- PostgreSQL database dump
--

\restrict P9UyjCDfTg5BIzSbJ0ifZCwGAMYuPucZUbMTvnN1sKF9QcCxyxaZvkoC6jiJL0I

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
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.departments VALUES ('cd', 'Cơ điện', 'CĐ', NULL, NULL, true, 2, '2026-06-22 04:01:40.545049+00', '2026-06-22 04:01:40.545049+00');
INSERT INTO public.departments VALUES ('kho', 'Kho', 'Kho', NULL, NULL, true, 3, '2026-06-22 04:01:40.545049+00', '2026-06-22 04:01:40.545049+00');
INSERT INTO public.departments VALUES ('qc', 'RD / QC', 'RD/QC', NULL, NULL, true, 4, '2026-06-22 04:01:40.545049+00', '2026-06-22 04:01:40.545049+00');
INSERT INTO public.departments VALUES ('qa', 'QA – QLCL', 'QA', NULL, NULL, true, 5, '2026-06-22 04:01:40.545049+00', '2026-06-22 04:01:40.545049+00');
INSERT INTO public.departments VALUES ('xsx', 'Xưởng sản xuất', 'XSX', NULL, NULL, true, 1, '2026-07-08 21:24:20.298231+00', '2026-07-08 21:24:20.298231+00');


--
-- Data for Name: system_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.system_config VALUES ('app_name', '"VMP Monitor"', 'Tên ứng dụng', 'general', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('org_name', '"CPC1 Hà Nội"', 'Tên tổ chức', 'general', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('org_unit', '"V/Q Team — QLCL"', 'Đơn vị quản lý', 'general', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('current_year', '2026', 'Năm kế hoạch hiện tại', 'general', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('overdue_alert_days', '[7, 14, 30]', 'Ngưỡng cảnh báo tới hạn (ngày)', 'notification', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('email_recipients_qa', '[]', 'Danh sách email QA nhận báo cáo', 'notification', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('report_template_version', '"v2.0"', 'Phiên bản mẫu báo cáo', 'report', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('ai_disclaimer_vi', '"BẢN NHÁP AI — Cần QA xác nhận trước khi phát hành"', 'Nhãn AI draft', 'report', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('ai_disclaimer_en', '"AI DRAFT — QA review required before release"', 'Nhãn AI draft EN', 'report', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('max_ai_tokens', '1200', 'Giới hạn token cho AI nhận xét', 'report', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('sync_source', '"google_sheet"', 'Nguồn dữ liệu đồng bộ', 'general', false, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.system_config VALUES ('allowed_cors_origins', '["https://cpc1hn.github.io"]', 'Domain được phép CORS', 'general', false, NULL, '2026-06-22 03:49:18.415937+00');


--
-- Data for Name: vmp_deadline_rules; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.vmp_deadline_rules VALUES (1, 'Độc lập', 2, 60, 5, 'Báo cáo không phụ thuộc kết quả QC', true, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.vmp_deadline_rules VALUES (2, 'Hóa lý', 2, 60, 5, 'Báo cáo có chỉ tiêu hóa lý', true, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.vmp_deadline_rules VALUES (3, 'Nhiễm khuẩn', 7, 60, 5, 'Báo cáo có chỉ tiêu vi sinh', true, NULL, '2026-06-22 03:49:18.415937+00');
INSERT INTO public.vmp_deadline_rules VALUES (4, 'Vô khuẩn', 16, 60, 5, 'Báo cáo sản phẩm vô khuẩn — thời gian QC dài nhất', true, NULL, '2026-06-22 03:49:18.415937+00');


--
-- Name: vmp_deadline_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vmp_deadline_rules_id_seq', 8, true);


--
-- PostgreSQL database dump complete
--

\unrestrict P9UyjCDfTg5BIzSbJ0ifZCwGAMYuPucZUbMTvnN1sKF9QcCxyxaZvkoC6jiJL0I

