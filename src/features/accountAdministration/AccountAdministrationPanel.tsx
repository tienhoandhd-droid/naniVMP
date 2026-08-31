import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchNguoiVaQuyen, fetchVaiNghiepVu, setUserActive, type NguoiVaQuyen, type VaiNghiepVuRow } from "../../lib/supabaseData.ts";
import { searchPermissionDirectory } from "../itemPermissions/api.ts";
import { businessRoleLabel } from "../../lib/businessRoles.ts";
import {
  accountControlState,
  buildAccountAdministrationRows,
  buildRoleControlRows,
  filterAndSortAccountControlRows,
  type AccountAdministrationRow,
  type AccountControlFilter,
} from "./accountAdministrationModel.ts";
import type { DirectoryPerson } from "../itemPermissions/types.ts";
export type AccountSourceName = "accounts" | "roles" | "directory";
export interface AccountAdministrationSnapshot { rows: AccountAdministrationRow[]; errors: Partial<Record<AccountSourceName, string>>; }
export interface AccountAdministrationLoaders { loadAccounts: () => Promise<NguoiVaQuyen>; loadRoles: () => Promise<VaiNghiepVuRow[]>; loadDirectory: () => Promise<DirectoryPerson[]>; }
export interface ReloadAccountByUserId { (userId: string): Promise<AccountAdministrationRow | null>; }
export interface AccountAdministrationPanelProps {
  canManageAccounts: boolean;
  revision?: number;
  loaders?: AccountAdministrationLoaders;
  mutateActive?: typeof setUserActive;
  onEditRole?: (row: AccountAdministrationRow, reload: ReloadAccountByUserId) => void;
  onOpenAccountLink?: () => void;
  onViewRights?: (row: AccountAdministrationRow) => void;
  activeTool?: "link" | `rights:${string}` | null;
}
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
  onOpenAccountLink,
  onViewRights,
  activeTool = null,
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
  onOpenAccountLink?: AccountAdministrationPanelProps["onOpenAccountLink"];
  onViewRights?: AccountAdministrationPanelProps["onViewRights"];
  activeTool?: AccountAdministrationPanelProps["activeTool"];
  onStartActivation: (row: AccountAdministrationRow) => void;
}) {
  const [filter, setFilter] = useState<AccountControlFilter>("all");
  const roleRows = useMemo(() => buildRoleControlRows(rows), [rows]);
  const visibleRows = useMemo(() => filterAndSortAccountControlRows(rows, filter), [filter, rows]);
  const attentionCount = rows.filter((row) => accountControlState(row) === "attention").length;
  const unknownCount = rows.filter((row) => accountControlState(row) === "unknown").length;
  const stateLabel = { attention: "Cần xử lý", unknown: "Chưa xác minh", ready: "Sẵn sàng" } as const;

  return (
    <section className="pq-control" aria-labelledby="pq-control-title">
      <div className="pq-control__heading">
        <div>
          <h2 id="pq-control-title">Bảng kiểm soát vai trò &amp; tài khoản</h2>
          <p>Ưu tiên tài khoản thiếu cấu hình; mở chi tiết chỉ khi cần xử lý.</p>
        </div>
        <div className="pq-control__filters" role="group" aria-label="Lọc bảng tài khoản">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tất cả <b>{rows.length}</b></button>
          <button type="button" aria-pressed={filter === "attention"} onClick={() => setFilter("attention")}>Cần xử lý trước <b>{attentionCount}</b></button>
          {canManageAccounts && onOpenAccountLink && (
            <button
              type="button"
              aria-expanded={activeTool === "link"}
              aria-controls="pq-account-tools"
              onClick={onOpenAccountLink}
            >
              Liên kết tài khoản
            </button>
          )}
        </div>
      </div>
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
      <div className="reg reg--tron pq-control__role-table">
        <div className="reg-scroll">
          <table className="reg-table" data-role-control-table="true">
            <caption>Tổng hợp tài khoản theo 5 vai trò</caption>
            <thead><tr>
              <th scope="col" data-reg-stick>Vai trò</th>
              <th scope="col">Phạm vi mặc định</th>
              <th scope="col" className="reg-num">Tài khoản</th>
              <th scope="col" className="reg-num">Hoạt động</th>
              <th scope="col" className="reg-num">Sẵn sàng</th>
              <th scope="col" className="reg-num">Cần xử lý</th>
              <th scope="col"><span className="sr-only">Lọc</span></th>
            </tr></thead>
            <tbody>
              {roleRows.map((role) => (
                <tr key={role.id}>
                  <th scope="row" data-reg-stick>{role.label}</th>
                  <td>{role.scopeLabel}</td>
                  <td className="reg-num">{role.total}</td>
                  <td className="reg-num">{role.active}</td>
                  <td className="reg-num"><span className="pq-control__count is-ready">{role.ready}</span></td>
                  <td className="reg-num"><span className={`pq-control__count ${role.attention ? "is-attention" : ""}`}>{role.attention}</span></td>
                  <td className="pq-control__action">
                    <button type="button" aria-pressed={filter === role.id} onClick={() => setFilter(role.id)}>
                      Xem tài khoản
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pq-control__account-head">
        <h3>Tài khoản {filter === "all" ? "" : `· ${filter === "attention" ? "cần xử lý" : businessRoleLabel(filter)}`}</h3>
        <span>{visibleRows.length} dòng · {unknownCount} chưa xác minh</span>
      </div>
      <div className="reg reg--tron">
        <div className="reg-scroll">
          <table className="reg-table" data-account-control-table="true">
            <caption>Tài khoản theo trạng thái sẵn sàng; dòng cần xử lý được xếp trước</caption>
            <thead><tr>
              <th scope="col" data-reg-stick>Tài khoản</th>
              <th scope="col">Vai trò</th>
              <th scope="col">Phạm vi</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Kiểm tra</th>
              <th scope="col">Thao tác</th>
            </tr></thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const controlState = accountControlState(row);
                const issueItems = row.readiness.filter((item) => item.state === "missing" || item.state === "unknown");
                const passed = row.readiness.length - issueItems.length;
                return (
                  <tr key={stableRowKey(row, index)} data-control-state={controlState}>
                    <th scope="row" data-reg-stick>
                      <span className="pq-control__name">{row.name}</span>
                      <span className="reg-muted">{row.email || "Chưa có email"}</span>
                    </th>
                    <td>{businessRoleLabel(row.businessRole)}</td>
                    <td>{row.scopeSummary}</td>
                    <td><span className={`pq-control__state is-${controlState}`}>{stateLabel[controlState]}</span></td>
                    <td>
                      <details className="pq-control__details">
                        <summary>{passed}/{row.readiness.length} đạt{issueItems.length ? ` · ${issueItems.length} vấn đề` : ""}</summary>
                        <ul aria-label={`Checklist sẵn sàng của ${row.name}`}>
                          {row.readiness.map((item) => (
                            <li key={item.key} data-state={item.state}>
                              <b>{item.label}</b><span>{item.detail}</span>{item.nextAction && <em>{item.nextAction}</em>}
                            </li>
                          ))}
                        </ul>
                        <p className="reg-muted">UUID: {row.userId || "thiếu"}</p>
                      </details>
                    </td>
                    <td className="pq-control__row-actions">
                      {onViewRights && row.directoryPerson && (
                        <button
                          type="button"
                          aria-expanded={activeTool === `rights:${row.personId}`}
                          aria-controls="pq-account-tools"
                          onClick={() => onViewRights(row)}
                        >
                          Xem quyền
                        </button>
                      )}
                      {canManageAccounts && row.userId && (
                        <>
                          {onEditRole && (
                            <button type="button" disabled={controlsDisabled} onClick={() => onEditRole(row, reload)}>Sửa vai</button>
                          )}
                          <button type="button" disabled={controlsDisabled} onClick={() => onStartActivation(row)}>
                            {row.accountActive ? "Tắt" : "Bật lại"}
                          </button>
                        </>
                      )}
                      {!onViewRights && !(canManageAccounts && row.userId) && <span className="reg-muted">Chỉ xem</span>}
                    </td>
                  </tr>
                );
              })}
              {!visibleRows.length && <tr><td colSpan={6}>Không có tài khoản phù hợp bộ lọc.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function AccountAdministrationView({
  canManageAccounts,
  revision = 0,
  loaders = defaultLoaders,
  mutateActive = setUserActive,
  onEditRole,
  onOpenAccountLink,
  onViewRights,
  activeTool,
}: AccountAdministrationPanelProps) {
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
        onOpenAccountLink={onOpenAccountLink}
        onViewRights={onViewRights}
        activeTool={activeTool}
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
