import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNguoiVaQuyen, fetchVaiNghiepVu, setUserActive, type NguoiVaQuyen, type VaiNghiepVuRow } from "../../lib/supabaseData.ts";
import { searchPermissionDirectory } from "../itemPermissions/api.ts";
import { buildAccountAdministrationRows, type AccountAdministrationRow } from "./accountAdministrationModel.ts";
import type { DirectoryPerson } from "../itemPermissions/types.ts";
export type AccountSourceName = "accounts" | "roles" | "directory";
export interface AccountAdministrationSnapshot { rows: AccountAdministrationRow[]; errors: Partial<Record<AccountSourceName, string>>; }
export interface AccountAdministrationLoaders { loadAccounts: () => Promise<NguoiVaQuyen>; loadRoles: () => Promise<VaiNghiepVuRow[]>; loadDirectory: () => Promise<DirectoryPerson[]>; }
export interface ReloadAccountByUserId { (userId: string): Promise<AccountAdministrationRow | null>; }
export interface AccountAdministrationPanelProps { canManageAccounts: boolean; revision?: number; loaders?: AccountAdministrationLoaders; mutateActive?: typeof setUserActive; onEditRole?: (row: AccountAdministrationRow, reload: ReloadAccountByUserId) => void; }
export function resolveReloadedAccount(snapshot: AccountAdministrationSnapshot, userId: string, isCurrent: () => boolean): AccountAdministrationRow | null { if (!isCurrent() || Object.keys(snapshot.errors).length > 0) return null; return snapshot.rows.find((row) => row.userId === userId) ?? null; }
export function createActivationUiState() { let token = 0; return { begin: () => ++token, cancel: (value: number) => { if (token === value) token++; }, isCurrent: (value: number) => token === value }; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export async function loadAccountAdministrationSnapshot(loaders: AccountAdministrationLoaders): Promise<AccountAdministrationSnapshot> {
  const settled = await Promise.allSettled([loaders.loadAccounts(), loaders.loadRoles(), loaders.loadDirectory()]);
  const errors: Partial<Record<AccountSourceName, string>> = {};
  const accounts = settled[0].status === "fulfilled" ? settled[0].value : null;
  const roles = settled[1].status === "fulfilled" ? settled[1].value : [];
  const directory = settled[2].status === "fulfilled" ? settled[2].value : [];
  if (settled[0].status === "rejected") errors.accounts = errorMessage(settled[0].reason);
  if (settled[1].status === "rejected") errors.roles = errorMessage(settled[1].reason);
  if (settled[2].status === "rejected") errors.directory = errorMessage(settled[2].reason);
  return { rows: accounts ? buildAccountAdministrationRows({ accounts: accounts.nguoi, roles, directory }) : [], errors };
}
export function applySourceUncertainty(rows: AccountAdministrationRow[], errors: Partial<Record<AccountSourceName, string>>): AccountAdministrationRow[] {
  const keys = new Set<string>();
  if (errors.roles) ["business_role", "department", "scope", "assignment"].forEach((key) => keys.add(key));
  if (errors.directory) ["person_link", "department", "scope", "assignment"].forEach((key) => keys.add(key));
  return rows.map((row) => ({ ...row, readiness: row.readiness.map((item) => keys.has(item.key) ? { ...item, state: "unknown" as const, nextAction: null, detail: "Nguồn dữ liệu chưa xác minh được trạng thái." } : item) }));
}
export interface ActivationArgs { userId: string; nextActive: boolean; reason: string; mutate: typeof setUserActive; reload: ReloadAccountByUserId; isCurrent: () => boolean; operation?: { token: number }; }
export interface ActivationCoordinatorArgs { userId: string; nextActive: boolean; reason: string; canManage: () => boolean; mutate: typeof setUserActive; reload: (userId: string) => Promise<{ userId?: string | null; accountActive?: boolean } | null>; }
export function createActivationCoordinator() {
  let busy = false;
  return { async run(args: ActivationCoordinatorArgs): Promise<{ kind: "verified" | "stale" | "rejected" | "written_unverified" | "busy"; message?: string }> {
    if (busy) return { kind: "busy" }; if (!args.canManage()) return { kind: "stale" }; if (!args.reason.trim()) return { kind: "rejected", message: "Cần nhập lý do." }; busy = true;
    try {
    let result;
    try { result = await args.mutate(args.userId, args.nextActive, args.reason.trim()); } catch (error) { return { kind: "rejected", message: errorMessage(error) }; }
    if (!result.ok) return { kind: "rejected", message: result.error || "Không thể cập nhật tài khoản" };
    if (!args.canManage()) return { kind: "stale" };
    let row;
    try { row = await args.reload(args.userId); } catch (error) { return args.canManage() ? { kind: "written_unverified", message: `Đã ghi nhưng chưa đối chiếu lại được: ${errorMessage(error)}` } : { kind: "stale" }; }
    if (!args.canManage()) return { kind: "stale" };
    return row?.userId === args.userId && row.accountActive === args.nextActive ? { kind: "verified" } : { kind: "written_unverified", message: "Đã ghi nhưng chưa đối chiếu lại được." };
    } finally { busy = false; }
  } };
}
export async function activateAccount(args: ActivationArgs): Promise<{ kind: "verified" | "stale" | "rejected" | "written_unverified" | "busy"; message?: string }> {
  if (args.operation && args.operation.token !== 1) return { kind: "busy" };
  if (args.operation) args.operation.token = 2;
  if (!args.reason.trim()) return { kind: "rejected", message: "Cần nhập lý do." };
  let result;
  try { result = await args.mutate(args.userId, args.nextActive, args.reason.trim()); } catch (error) { return args.isCurrent() ? { kind: "rejected", message: errorMessage(error) } : { kind: "stale" }; }
  if (!result.ok) return args.isCurrent() ? { kind: "rejected", message: result.error || "Không thể cập nhật tài khoản" } : { kind: "stale" };
  if (!args.isCurrent()) return { kind: "stale" };
  try { const row = await args.reload(args.userId); return args.isCurrent() && row?.userId === args.userId && row.accountActive === args.nextActive ? { kind: "verified" } : { kind: "written_unverified", message: "Đã ghi nhưng chưa đối chiếu lại được." }; } catch (error) { return args.isCurrent() ? { kind: "written_unverified", message: `Đã ghi nhưng chưa đối chiếu lại được: ${errorMessage(error)}` } : { kind: "stale" }; }
}
export function stableRowKey(row: Pick<AccountAdministrationRow, "key">, index: number): string { return `${row.key}:${index}`; }
const defaultLoaders: AccountAdministrationLoaders = { loadAccounts: fetchNguoiVaQuyen, loadRoles: fetchVaiNghiepVu, loadDirectory: () => searchPermissionDirectory("") };

export interface ActivationDraft {
  row: AccountAdministrationRow;
  next: boolean;
  reason: string;
  token: number;
}

export function ActivationDialog({
  draft,
  status,
  submitting,
  onReason,
  onCancel,
  onConfirm,
}: {
  draft: ActivationDraft;
  status: string | null;
  submitting: boolean;
  onReason: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-label="Đổi trạng thái tài khoản">
      <p>{draft.row.userId} → {draft.next ? "hoạt động" : "tắt"}</p>
      <textarea
        aria-label="Lý do đổi trạng thái"
        value={draft.reason}
        disabled={submitting}
        onChange={(event) => onReason(event.target.value)}
      />
      <button disabled={submitting} onClick={onCancel}>Hủy</button>
      <button disabled={!draft.reason.trim() || submitting} onClick={onConfirm}>Xác nhận</button>
      {status && <p role="alert">{status}</p>}
    </div>
  );
}

export function AccountAdministrationContent({
  snapshot,
  rows,
  loading,
  canManageAccounts,
  controlsDisabled = false,
  reload,
  onRetry,
  onEditRole,
  onStartActivation,
}: {
  snapshot: AccountAdministrationSnapshot;
  rows: AccountAdministrationRow[];
  loading: boolean;
  canManageAccounts: boolean;
  controlsDisabled?: boolean;
  reload: ReloadAccountByUserId;
  onRetry: () => void;
  onEditRole?: AccountAdministrationPanelProps["onEditRole"];
  onStartActivation: (row: AccountAdministrationRow) => void;
}) {
  return (
    <section aria-label="Quản trị tài khoản và vai trò">
      <h2>Trạng thái tài khoản</h2>
      {loading && <p role="status">Đang tải dữ liệu…</p>}
      {snapshot.errors.accounts && (
        <div role="alert">
          Không tải được tài khoản: {snapshot.errors.accounts}{" "}
          <button onClick={onRetry}>Tải lại</button>
        </div>
      )}
      {Object.entries(snapshot.errors)
        .filter(([key]) => key !== "accounts")
        .map(([key, value]) => (
          <div role="status" key={key}>
            Nguồn {key} chưa xác minh: {value}{" "}
            <button onClick={onRetry}>Tải lại</button>
          </div>
        ))}
      <div>
        {rows.map((row, index) => (
          <article key={stableRowKey(row, index)} aria-label={row.name}>
            <h3>{row.name}</h3>
            <p>{row.email || "Không có email"} · user_id: {row.userId || "thiếu"}</p>
            {!row.accountActive && <span data-badge="inactive">Không hoạt động</span>}
            {row.readiness.some((item) => item.state === "unknown") && (
              <span data-badge="unknown">Chưa xác minh</span>
            )}
            <p>Vai: {row.businessRole || "Chưa giải được"} · Phạm vi: {row.scopeSummary}</p>
            <ul aria-label="Checklist sẵn sàng">
              {row.readiness.map((item) => (
                <li key={item.key} data-state={item.state}>
                  {item.label}: {item.detail}{item.nextAction && <> — {item.nextAction}</>}
                </li>
              ))}
            </ul>
            {canManageAccounts && row.userId && (
              <div>
                {onEditRole && (
                  <button disabled={controlsDisabled} onClick={() => onEditRole(row, reload)}>Sửa vai</button>
                )}
                <button disabled={controlsDisabled} onClick={() => onStartActivation(row)}>
                  {row.accountActive ? "Tắt" : "Bật lại"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function AccountAdministrationView({ canManageAccounts, revision = 0, loaders = defaultLoaders, mutateActive = setUserActive, onEditRole }: AccountAdministrationPanelProps) {
  const [snapshot, setSnapshot] = useState<AccountAdministrationSnapshot>({ rows: [], errors: {} }); const [loading, setLoading] = useState(true); const generation = useRef(0);
  const load = useCallback(async () => { const current = ++generation.current; setLoading(true); try { const next = await loadAccountAdministrationSnapshot(loaders); if (current === generation.current) setSnapshot(next); } catch (error) { if (current === generation.current) setSnapshot({ rows: [], errors: { accounts: errorMessage(error) } }); } finally { if (current === generation.current) setLoading(false); } }, [loaders]);
  useEffect(() => { void load(); }, [load, revision]);
  const reload = useCallback(async (userId: string) => { const request = ++generation.current; const next = await loadAccountAdministrationSnapshot(loaders); if (generation.current !== request) return null; setSnapshot(next); return resolveReloadedAccount({ ...next, rows: applySourceUncertainty(next.rows, next.errors) }, userId, () => generation.current === request); }, [loaders]);
  const [draft, setDraft] = useState<ActivationDraft | null>(null); const activeGeneration = useRef(0); const uiOperation = useRef(createActivationUiState()); const coordinator = useRef(createActivationCoordinator()); const [status, setStatus] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (!canManageAccounts) { activeGeneration.current += 1; setDraft(null); setSubmitting(false); } }, [canManageAccounts]);
  const confirm = async () => { const userId = draft?.row.userId; if (!userId || submitting || !draft) return; setSubmitting(true); const target = draft; const outcome = await coordinator.current.run({ userId, nextActive: target.next, reason: target.reason.trim(), canManage: () => canManageAccounts && activeGeneration.current === target.token && uiOperation.current.isCurrent(target.token), mutate: mutateActive, reload }); if (uiOperation.current.isCurrent(target.token)) { if (outcome.kind === "verified") setDraft(null); else if (outcome.kind !== "stale") setStatus(outcome.message || "Không thể xác minh trạng thái"); setSubmitting(false); } };
  const rows = applySourceUncertainty(snapshot.rows, snapshot.errors);
  const startActivation = (row: AccountAdministrationRow) => {
    if (submitting) return;
    setStatus(null);
    const token = uiOperation.current.begin();
    activeGeneration.current = token;
    setDraft({ row, next: !row.accountActive, reason: "", token });
  };
  const cancel = () => {
    if (!draft || submitting) return;
    uiOperation.current.cancel(draft.token);
    activeGeneration.current += 1;
    setDraft(null);
  };
  return (
    <>
      <AccountAdministrationContent
        snapshot={snapshot}
        rows={rows}
        loading={loading}
        canManageAccounts={canManageAccounts}
        controlsDisabled={submitting}
        reload={reload}
        onRetry={() => { void load(); }}
        onEditRole={onEditRole}
        onStartActivation={startActivation}
      />
      {draft && (
        <ActivationDialog
          draft={draft}
          status={status}
          submitting={submitting}
          onReason={(reason) => setDraft({ ...draft, reason })}
          onCancel={cancel}
          onConfirm={() => { void confirm(); }}
        />
      )}
    </>
  );
}

export function AccountAdministrationPanel(props: AccountAdministrationPanelProps) {
  return <AccountAdministrationView {...props} />;
}
