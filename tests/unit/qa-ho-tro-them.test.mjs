import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { docQaHoTroThem } from "../../src/features/sourceAccess/qaHoTroThem.ts";

const MIGRATION = readFileSync("supabase/migrations/20261017100000_qa_ho_tro_them.sql", "utf8");

/** Thân một hàm trong migration, từ "create or replace function public.<ten>(" tới "$function$;". */
function thanHam(ten) {
  const dau = MIGRATION.search(new RegExp(`create or replace function public\\.${ten}\\(`, "i"));
  assert.notEqual(dau, -1, `migration phải định nghĩa ${ten}`);
  const cuoi = MIGRATION.indexOf("$function$;", dau);
  return MIGRATION.slice(dau, cuoi);
}

test("đọc đúng danh sách QA hỗ trợ thêm", () => {
  const ds = docQaHoTroThem({
    ok: true, co_the_sua: true,
    rows: [{ performer_id: "a", performer_name: "Một", ly_do: "Phân công", them_luc: "2026-10-17T00:00:00Z" }],
  });
  assert.equal(ds.coTheSua, true);
  assert.deepEqual(ds.rows, [{ performerId: "a", performerName: "Một", lyDo: "Phân công" }]);
});

test("server từ chối hoặc sai dạng thì báo lỗi, không hiện danh sách rỗng", () => {
  assert.throws(() => docQaHoTroThem({ ok: false, error: "Không tìm thấy hạng mục" }), /Không tìm thấy/);
  assert.throws(() => docQaHoTroThem(null), /không trả dữ liệu/);
  assert.throws(() => docQaHoTroThem({ ok: true, rows: [] }), /co_the_sua/);
  assert.throws(() => docQaHoTroThem({ ok: true, co_the_sua: false, rows: [{ performer_id: 1 }] }), /Dòng 1 sai định dạng/);
});

test("bốn hàm quyền chỉ THÊM nhánh QA hỗ trợ thêm, giữ nguyên điều kiện cũ", () => {
  const ir = thanHam("vmp_item_rights");
  assert.match(ir, /if v_person\.id in \(v_source\.owner_person_id,v_source\.support_person_id\)\s+or exists \(select 1 from public\.vmp_source_supporters extra/);
  const cv = thanHam("vmp_can_view_source_object");
  assert.match(cv, /source_object\.owner_person_id,source_object\.support_person_id\s+\) or exists \(\s+select 1 from public\.vmp_source_supporters extra/);
  const pp = thanHam("vmp_source_objects_page_path");
  assert.match(pp, /source_object\.owner_person_id=performer\.id/);
  assert.match(pp, /source_object\.support_person_id=performer\.id\s+union[\s\S]*?join public\.vmp_source_supporters extra/);
  const ep = thanHam("vmp_editable_progress_rights_path");
  assert.match(ep, /source_object\.owner_person_id=actor_person\.person_id/);
  assert.match(ep, /source_object\.support_person_id=actor_person\.person_id[\s\S]*?join public\.vmp_source_supporters extra/);
  // Nhánh mới chỉ dành cho vai qa_staff ở hai hàm liệt kê.
  for (const than of [pp, ep]) {
    assert.match(than, /actor\.role_name='qa_staff'[\s\S]*?vmp_source_supporters/);
  }
});

test("RPC thêm/bỏ QA hỗ trợ thêm: chỉ người phân công QA, bắt lý do, cùng luật đủ điều kiện, ghi nhật ký", () => {
  const dat = thanHam("rpc_source_supporter_dat");
  assert.match(dat, /security definer\s+set search_path = public, pg_temp/);
  assert.match(dat, /if not public\.vmp_can_manage_source_qa_assignment\(v_actor\) then\s+return jsonb_build_object\('ok', false, 'error_code', 'FORBIDDEN'/);
  assert.match(dat, /'REASON_REQUIRED'/);
  assert.match(dat, /public\.vmp_qa_assignable\(v_nguoi\.user_id, v_nguoi\.department\)/);
  assert.match(dat, /insert into public\.audit_logs/);
  const doc = thanHam("rpc_source_supporters");
  assert.match(doc, /public\.vmp_can_view_source_object\(v_actor, v_source_id\)/);
  for (const chuKy of ["rpc_source_supporters(text)", "rpc_source_supporter_dat(text, uuid, boolean, text)"]) {
    const ten = chuKy.replace(/[()]/g, "\\$&");
    assert.match(MIGRATION, new RegExp(`revoke all on function public\\.${ten} from public, anon;`));
    assert.match(MIGRATION, new RegExp(`grant execute on function public\\.${ten} to authenticated;`));
  }
  // Bảng không mở cho web đọc/ghi trực tiếp; đổi người phải tăng phiên bản quyền.
  assert.match(MIGRATION, /alter table public\.vmp_source_supporters enable row level security;/);
  assert.match(MIGRATION, /revoke all on table public\.vmp_source_supporters from public, anon, authenticated;/);
  assert.match(MIGRATION, /after insert or delete on public\.vmp_source_supporters\s+for each row execute function public\.vmp_touch_authorization_revision\(\)/);
});
