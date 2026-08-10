/* =====================================================================
 *  domain.ts — Kiểu nghiệp vụ VMP
 *  ---------------------------------------------------------------------
 *  Kiểu bảng/RPC suy TRỰC TIẾP từ database.ts (sinh tự động từ schema
 *  Supabase thật bằng `supabase gen types`). Đừng gõ tay lại cấu trúc
 *  bảng ở đây — sửa schema rồi sinh lại:
 *
 *    supabase gen types typescript --db-url "$SUPABASE_DB_URL" \
 *      --schema public > src/types/database.ts
 *
 *  File này chỉ chứa những kiểu KHÔNG suy được từ schema: hình dạng dữ
 *  liệu sau khi biến đổi cho giao diện, và các union giá trị nghiệp vụ.
 * ===================================================================== */
import type { Database } from "./database.ts";

/* ---------- Bảng ---------- */
export type Tables = Database["public"]["Tables"];
export type PlanItemRow     = Tables["vmp_plan_items"]["Row"];
export type ObjectRow       = Tables["vmp_objects"]["Row"];
export type SourceObjectRow = Tables["vmp_source_objects"]["Row"];
export type ProductGmpRow   = Tables["vmp_products_gmp"]["Row"];
export type ProfileRow      = Tables["profiles"]["Row"];
export type DepartmentRow   = Tables["departments"]["Row"];
export type AlertRecipientRow = Tables["vmp_alert_recipients"]["Row"];
export type StaffEmailRow     = Tables["vmp_staff_emails"]["Row"];
export type PerformerRow      = Tables["vmp_performers"]["Row"];

/* ---------- Vai trò & quyền ---------- */
/** Vai trò lưu trong profiles.role (enum user_role của Postgres). */
export type UserRole = Database["public"]["Enums"]["user_role"];
/** Quyền rút gọn dùng trong giao diện, ánh xạ từ UserRole ở supabaseClient. */
export type Perm = "admin" | "edit" | "view";

export interface AppUser {
  uid?: string;
  name: string;
  email?: string;
  role: UserRole | "viewer";
  perm: Perm;
  department?: string;
  token?: string;
}

/* ---------- Giá trị nghiệp vụ ---------- */
/** Loại thẩm định do luật VMP01 sinh ra. */
export type ValidationType =
  | "DQ" | "FAT/SAT" | "IQ" | "OQ" | "PQ" | "PV" | "GSP" | "GDP";

/** Phân loại đối tượng của 5 danh mục nguồn. */
export type ObjectKind =
  | "Thiết bị" | "Quy trình" | "Kho" | "Hệ thống phụ trợ" | "Vận chuyển";

/** Phân loại báo cáo — quyết định khoảng cách báo cáo (2/2/7/16 ngày). */
export type ReportClass =
  | "Không phụ thuộc" | "Hóa lý" | "Nhiễm khuẩn" | "Vô khuẩn";

/**
 * Trạng thái suy ra khi đọc, luôn tính lại theo ngày hôm nay.
 * Giá trị do deriveSt() trong n8nAdapter sinh ra — giữ đúng 5 giá trị này,
 * đừng đổi tên nếu chưa sửa deriveSt và các bảng màu trong constants/vmp.
 */
export type ActivityStatus = "plan" | "todo" | "prog" | "done" | "over";

/** Bốn mốc thời gian của một hạng mục. Null khi chưa có mốc đích (target). */
export interface Milestones {
  protocol: Date | null;
  validation: Date | null;
  report: Date | null;
  target: Date | null;
}

/** Mốc cảnh báo gần nhất của một hạng mục (do nextAlert tính). */
export interface AlertInfo {
  stage: string;
  date: Date;
  dleft: number;
  /** null khi còn xa, chưa tới ngưỡng cảnh báo. */
  kind: "over" | "soon" | null;
}

/* ---------- Hình dạng cho giao diện ---------- */
/**
 * Một hạng mục sau khi qua adapter (n8nAdapter/supabaseData). Khác
 * PlanItemRow: tên trường ngắn gọn cho UI và có các trường suy diễn
 * (st, target, docDone) tính lại mỗi lần đọc.
 */
export interface Activity {
  id: string;
  code: string;              // validation_code
  obj: string;               // object_code
  objName?: string;
  /** Tên hiển thị của hạng mục (thường là tên đối tượng). */
  name?: string;
  type: string;              // loại thẩm định
  /** Loại thẩm định dạng chữ dùng để hiển thị: IQ / OQ / PQ / PV / GSP / GDP… */
  vtype?: string;
  /** Nhóm phân loại đối tượng: tb | qt | kho | ht | vc. */
  cls?: string;
  dept?: string;
  depts?: string[];
  execDepts?: string[];
  exec_depts?: string[];
  owner?: string;
  owner_name?: string;
  secondary_owner?: string;
  year?: number;
  /** Trạng thái nghiệp vụ của bản ghi: active | not_applicable | cancelled. */
  state?: string;
  /** Mức tới hạn dạng chữ: Cao | TB | Thấp. */
  crit?: string;
  /** Điểm trọng yếu 1–9 = phức tạp × ảnh hưởng chất lượng. */
  score?: number | string;
  /** Người hỗ trợ (QA thứ hai) — từ vmp_source_objects.support_name. */
  support?: string | null;
  /** Nhóm phân công QA, vd "Hệ thống nồi hấp/tủ hấp". */
  group?: string | null;
  /** Tần suất thẩm định (tháng). */
  freq?: number;
  /** Phân loại báo cáo rút gọn, dùng tra số ngày báo cáo. */
  dep?: string;
/** Mã lệch dữ liệu giữa các cột trạng thái, vd "val_done_doc_pending". */
  mismatch?: string | null;
  /** Trạng thái suy ra tại thời điểm đọc. */
  st: ActivityStatus;
  target?: string | null;    // mốc đích đang theo dõi
  docDone?: boolean;
  effort?: number | null;
  criticality?: string;
  dlProtocol?: string | null;
  dlValidation?: string | null;
  dlReport?: string | null;
  dlVmp?: string | null;
  actProtocol?: string | null;
  actValidation?: string | null;
  actReport?: string | null;
  actVmp?: string | null;
  version?: number;
  /** Mốc thời gian đã tính sẵn (enrich gắn vào để khỏi tính lại). */
  m?: Milestones;
  /** Cảnh báo gần nhất (enrich gắn vào). */
  alert?: AlertInfo | null;
  /** Bản ghi gốc từ DB, dùng để tính lại các trường suy diễn. */
  _raw?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VmpObject {
  code: string;
  name: string;
  dept?: string;
  /** Nhóm phân loại: tb | qt | kho | ht | vc. */
  cls?: string;
  classification?: string;
  area?: string;
  line?: string;
  criticality?: string;
  /** Mức tới hạn dạng chữ: Cao | TB | Thấp. */
  crit?: string;
  /** Điểm trọng yếu hiển thị (1–9 hoặc "—"). */
  grade?: string;
  /** Phạm vi GxP. */
  gxp?: string;
  /** Có nằm trong kế hoạch thẩm định không. */
  need?: boolean | string;
  reason?: string;
  freq?: number | null;
  [key: string]: unknown;
}

/** Kết quả trả về từ mọi RPC ghi: { ok, error?, ... } */
export interface RpcResult {
  ok: boolean;
  error?: string;
  msg?: string;
  code?: string;
  current_version?: number;
  [key: string]: unknown;
}

/** Kết quả rpc_generate_timeline. */
export interface GenerateTimelineResult extends RpcResult {
  nam: number;
  da_ghi: boolean;
  so_tao_moi: number;
  so_bo_qua: number;
  so_thieu_moc: number;
  /** Đối tượng tần suất > 12 tháng chưa tới chu kỳ nên bị hoãn. */
  so_chua_toi_chu_ky?: number;
  chua_toi_chu_ky?: Array<{
    object_code: string; object_name: string;
    tan_suat_thang: number; moc_gan_nhat: number; ky_ke_tiep: number;
  }>;
  danh_sach?: Array<{
    validation_code: string;
    object_code: string;
    object_kind: string;
    validation_type: string;
    lan: number;
    deadline_vmp: string | null;
    deadline_report: string | null;
    deadline_validation: string | null;
    deadline_protocol: string | null;
    thieu_du_lieu: string[];
  }>;
}

/** Gói dữ liệu dashboard trả về từ rpc_get_vmp_dashboard. */
export interface VmpDataset {
  objects: VmpObject[];
  activities: Activity[];
  source: "supabase" | "n8n";
  count: number;
  updated_at?: string | null;
}

/** Cấu hình kết nối lưu ở localStorage. */
export interface ConnConfig {
  readUrl?: string;
  writeUrl?: string;
  [key: string]: unknown;
}

/** Chế độ quyền ngoại lệ theo từng hạng mục VMP. */
export type ItemPermissionMode = "preview" | "enforced";
