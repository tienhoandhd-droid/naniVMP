import { useCallback, useEffect, useState } from "react";
import { fetchNguoiVaQuyen, fetchVaiNghiepVu, setBusinessRole, setUserActive, type NguoiVaQuyen, type VaiNghiepVuRow } from "../../lib/supabaseData.ts";
import { searchPermissionDirectory } from "../itemPermissions/api.ts";
import { buildAccountAdministrationRows, type AccountAdministrationRow } from "./accountAdministrationModel.ts";
import type { DirectoryPerson } from "../itemPermissions/types.ts";

export type AccountSourceName = "accounts" | "roles" | "directory";
export interface AccountAdministrationSnapshot { rows: AccountAdministrationRow[]; errors: Partial<Record<AccountSourceName, string>>; }
export interface AccountAdministrationLoaders { loadAccounts: () => Promise<NguoiVaQuyen>; loadRoles: () => Promise<VaiNghiepVuRow[]>; loadDirectory: () => Promise<DirectoryPerson[]>; }
export interface ReloadAccountByUserId { (userId: string): Promise<AccountAdministrationRow | null>; }
export interface AccountAdministrationPanelProps {
  canManageAccounts: boolean;
  revision?: number;
  loaders?: AccountAdministrationLoaders;
  mutateRole?: typeof setBusinessRole;
  mutateActive?: typeof setUserActive;
  onEditRole?: (row: AccountAdministrationRow, reload: ReloadAccountByUserId) => void;
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export async function loadAccountAdministrationSnapshot(loaders: AccountAdministrationLoaders): Promise<AccountAdministrationSnapshot> {
  const results = await Promise.allSettled([loaders.loadAccounts(), loaders.loadRoles(), loaders.loadDirectory()]);
  const errors: Partial<Record<AccountSourceName, string>> = {};
  const accounts = results[0].status === "fulfilled" ? results[0].value : (errors.accounts = message(results[0].reason), null);
  const roles = results[1].status === "fulfilled" ? results[1].value : (errors.roles = message(results[1].reason), []);
  const directory = results[2].status === "fulfilled" ? results[2].value : (errors.directory = message(results[2].reason), []);
  return { rows: accounts ? buildAccountAdministrationRows({ accounts: accounts.nguoi, roles, directory }) : [], errors };
}

const defaultLoaders: AccountAdministrationLoaders = { loadAccounts: fetchNguoiVaQuyen, loadRoles: fetchVaiNghiepVu, loadDirectory: () => searchPermissionDirectory("") };

export function AccountAdministrationPanel({ canManageAccounts, revision = 0, loaders = defaultLoaders, mutateActive = setUserActive, onEditRole }: AccountAdministrationPanelProps) {
  const [snapshot, setSnapshot] = useState<AccountAdministrationSnapshot>({ rows: [], errors: {} });
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setSnapshot(await loadAccountAdministrationSnapshot(loaders)); setLoading(false); }, [loaders]);
  useEffect(() => { void load(); }, [load, revision]);
  const reload = useCallback(async (userId: string) => {
    const next = await loadAccountAdministrationSnapshot(loaders);
    setSnapshot(next);
    return next.rows.find((row) => row.userId === userId) ?? null;
  }, [loaders]);
  const [activeDraft, setActiveDraft] = useState<{ row: AccountAdministrationRow; next: boolean; reason: string } | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const confirmActive = async () => {
    if (!activeDraft?.row.userId || !activeDraft.reason.trim()) return;
    try { const result = await mutateActive(activeDraft.row.userId, activeDraft.next, activeDraft.reason.trim()); if (!result.ok) throw new Error(result.error || "Không thể cập nhật tài khoản"); await reload(activeDraft.row.userId); setActiveDraft(null); setActiveError(null); }
    catch (error) { setActiveError(message(error)); }
  };
  return <section aria-label="Quản trị tài khoản và vai trò">
    <h2>Trạng thái tài khoản</h2>
    {loading && <p>Đang tải dữ liệu…</p>}
    {snapshot.errors.accounts && <div role="alert">Không tải được tài khoản: {snapshot.errors.accounts} <button onClick={() => void load()}>Tải lại</button></div>}
    {Object.entries(snapshot.errors).filter(([key]) => key !== "accounts").map(([key, error]) => <p role="status" key={key}>Nguồn {key} chưa xác minh: {error}</p>)}
    <div>{snapshot.rows.map((row) => <article key={row.key} aria-label={row.name}>
      <h3>{row.name}</h3><p>{row.email || "Không có email"} · user_id: {row.userId || "thiếu"}</p>
      <p>Vai: {row.businessRole || "Chưa giải được"} · Phạm vi: {row.scopeSummary}</p>
      <ul aria-label="Checklist sẵn sàng">{row.readiness.map((item) => <li key={item.key} data-state={item.state}>{item.label}: {item.detail}{item.nextAction && <> — {item.nextAction}</>}</li>)}</ul>
      {canManageAccounts && row.userId && <div><button onClick={() => onEditRole?.(row, reload)}>Sửa vai</button><button onClick={() => setActiveDraft({ row, next: !row.accountActive, reason: "" })}>{row.accountActive ? "Tắt" : "Bật lại"}</button></div>}
    </article>)}</div>
    {activeDraft && <div role="dialog" aria-label="Đổi trạng thái tài khoản"><p>{activeDraft.row.userId} → {activeDraft.next ? "hoạt động" : "tắt"}</p><textarea aria-label="Lý do đổi trạng thái" value={activeDraft.reason} onChange={(event) => setActiveDraft({ ...activeDraft, reason: event.target.value })} /><button onClick={() => setActiveDraft(null)}>Hủy</button><button onClick={() => void confirmActive()} disabled={!activeDraft.reason.trim()}>Xác nhận</button>{activeError && <p role="alert">{activeError}</p>}</div>}
  </section>;
}
