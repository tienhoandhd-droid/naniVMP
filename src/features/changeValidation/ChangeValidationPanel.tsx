import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileDiff, Plus, RefreshCw, X } from "lucide-react";

import SmartTable, { type SmartTableColumn } from "../../components/ui/SmartTable.tsx";
import StateBoundary from "../../components/ui/StateBoundary.tsx";
import ViewportDialog from "../../components/ui/ViewportDialog.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import { formatBangkokDate, formatBangkokShortDateTime } from "../../lib/formatBangkok.ts";
import {
  createPlanFromChange,
  listChanges,
  requestChangeSync,
  saveChange,
  searchChangeObjects,
} from "./api.ts";
import {
  filterChanges,
  HANDLING_STATUS_LABEL,
  isOverdue,
  type ChangeFilter,
  type ChangeHandlingStatus,
  type ChangeListResult,
  type ChangeObject,
  type ChangeRecord,
} from "./contracts.ts";

type LoadState = "loading" | "ready" | "error";

const TYPES = ["IQ", "OQ", "PQ", "DQ", "FAT/SAT", "PV", "GSP", "GDP"] as const;
const POLL_MS = 15_000;
/* Ngày hôm nay theo giờ VN, dạng yyyy-mm-dd để so với hạn. */
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });

function todayVn(): string {
  return dayFormatter.format(new Date());
}

/* "PCTB1305 · Khu B3 · TP sinh phẩm mới · XSX" — đủ để phân biệt các thiết bị tên giống nhau. */
function objectDetail(o: ChangeObject): string {
  return [o.code, o.area ? `Khu ${o.area}` : null, o.line, o.department?.toUpperCase()].filter(Boolean).join(" · ");
}

export default function ChangeValidationPanel() {
  const [data, setData] = useState<ChangeListResult | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<ChangeFilter>("open");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  /* Tăng sau mỗi lần chính mình lưu: hộp thoại dựng lại với bản mới.
     Người khác lưu thì KHÔNG dựng lại — chữ đang gõ còn nguyên, lưu sẽ báo xung đột. */
  const [dialogNonce, setDialogNonce] = useState(0);
  const [refreshError, setRefreshError] = useState("");
  const sequence = useRef(0);
  const toast = useToast();

  /* Trả true khi đã có dữ liệu mới. */
  const load = useCallback(async (quiet = false): Promise<boolean> => {
    const current = ++sequence.current;
    if (!quiet) setLoadState("loading");
    try {
      const next = await listChanges();
      if (current !== sequence.current) return false;
      setData(next);
      setError("");
      setRefreshError("");
      setLoadState("ready");
      return true;
    } catch (cause) {
      if (current !== sequence.current) return false;
      const message = cause instanceof Error ? cause.message : String(cause);
      if (quiet) setRefreshError(message);
      else {
        setError(message);
        setLoadState("error");
      }
      return false;
    }
  }, []);

  useEffect(() => { void load(); }, [load, tick]);

  /* Đang chờ n8n đọc sheet: tải lại nhẹ mỗi 15 giây đến khi xong. */
  const syncBusy = data?.sync.lastStatus === "cho" || data?.sync.lastStatus === "dang_chay";
  useEffect(() => {
    if (!syncBusy) return undefined;
    const timer = window.setTimeout(() => { void load(true); }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [syncBusy, data, load]);

  const today = todayVn();
  const rows = useMemo(() => data ? filterChanges(data.records, filter, query, today) : [],
    [data, filter, query, today]);
  const canEdit = data?.canEdit === true;
  const openRecord = data?.records.find((row) => row.id === openId) ?? null;

  const columns = useMemo<SmartTableColumn<ChangeRecord>[]>(() => [
    {
      id: "code",
      header: "Mã thay đổi",
      priority: "primary",
      cell: (row) => (
        <div className="rv-code">
          <b>{row.changeCode}</b>
          <span>{[row.changeType, row.department].filter(Boolean).join(" · ") || row.sourceTab}</span>
        </div>
      ),
    },
    {
      id: "content",
      header: "Cần thẩm định",
      cell: (row) => (
        <div className="tdd-noi-dung">
          <b>{row.validationContent ?? "—"}</b>
          {row.changeContent && <span>{row.changeContent}</span>}
        </div>
      ),
    },
    {
      id: "objects",
      header: "Thiết bị",
      cell: (row) => row.objects.length
        ? <div className="tdd-chips">{row.objects.map((o) => (
            <span key={o.code} className="tdd-chip" title={objectDetail(o)}>{o.code}{o.name ? ` · ${o.name}` : ""}</span>
          ))}</div>
        : <span className="rv-status rv-status--pending">Chưa gắn</span>,
    },
    {
      id: "deadline",
      header: "Hạn",
      cell: (row) => (
        <div className="rv-code">
          <b className={isOverdue(row, today) ? "tdd-qua-han" : undefined}>
            {row.deadline ? formatBangkokDate(row.deadline) : "Chưa có hạn"}
          </b>
          {isOverdue(row, today) && <span className="tdd-qua-han">Quá hạn</span>}
        </div>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: (row) => row.removedFromSheetAt
        ? <span className="rv-status rv-status--obsolete">Sheet bỏ yêu cầu</span>
        : <span className={`rv-status tdd-tt--${row.handlingStatus}`}>{HANDLING_STATUS_LABEL[row.handlingStatus]}</span>,
    },
    {
      id: "actions",
      header: "",
      align: "end",
      cell: (row) => (
        <button type="button" className="cw-nut" onClick={() => setOpenId(row.id)}
          aria-label={`${canEdit ? "Sửa" : "Xem"} ${row.changeCode}`}>
          {canEdit ? "Sửa" : "Xem"}
        </button>
      ),
    },
  ], [canEdit, today]);

  const requestSync = async () => {
    if (!canEdit || requesting) return;
    setRequesting(true);
    try {
      const result = await requestChangeSync();
      toast.thanhCong(result.already ? "Đang cập nhật từ sheet…" : "Đã gửi yêu cầu. Khoảng 1–2 phút sẽ có dữ liệu mới.");
      await load(true);
    } catch (cause) {
      toast.loi(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRequesting(false);
    }
  };

  const sync = data?.sync;
  const syncLine = !sync ? ""
    : syncBusy ? "Đang cập nhật từ sheet…"
    : sync.lastOkAt ? `Cập nhật từ sheet lúc ${formatBangkokShortDateTime(sync.lastOkAt)}`
    : "Chưa cập nhật từ sheet lần nào";

  return (
    <section className="rv-panel" aria-labelledby="tdd-heading">
      <header className="rv-toolbar">
        <div>
          <h3 id="tdd-heading">Thẩm định do thay đổi</h3>
          <p aria-live="polite">{syncLine}</p>
        </div>
        <div className="rv-toolbar__actions">
          <label className="rv-filter" htmlFor="tdd-loc">
            <span>Hiển thị</span>
            <select id="tdd-loc" className="cw-o" value={filter}
              onChange={(event) => setFilter(event.target.value as ChangeFilter)}>
              <option value="open">Cần xử lý</option>
              <option value="unlinked">Chưa gắn thiết bị</option>
              <option value="overdue">Quá hạn</option>
              <option value="all">Tất cả</option>
            </select>
          </label>
          <label className="rv-filter" htmlFor="tdd-tim">
            <span>Tìm</span>
            <input id="tdd-tim" className="cw-o" type="search" value={query}
              placeholder="Mã CC, nội dung, mã thiết bị" onChange={(event) => setQuery(event.target.value)} />
          </label>
          {canEdit && (
            <button type="button" className="cw-nut" disabled={requesting || syncBusy} onClick={requestSync}>
              <RefreshCw size={15} aria-hidden="true" /> {syncBusy ? "Đang cập nhật…" : "Làm mới"}
            </button>
          )}
        </div>
      </header>

      {canEdit && sync?.lastStatus === "loi" && sync.lastError && (
        <p className="cw-loi" role="alert">Lần cập nhật gần nhất bị lỗi: {sync.lastError}</p>
      )}
      {refreshError && (
        <p className="cw-loi" role="alert">Chưa tải lại được: {refreshError}{" "}
          <button type="button" className="cw-nut" onClick={() => setTick((value) => value + 1)}>Thử lại</button>
        </p>
      )}

      {loadState === "loading" && <StateBoundary state="loading" title="Đang tải phiếu thay đổi" skeletonRows={5} />}
      {loadState === "error" && (
        <StateBoundary state="error" title="Chưa tải được phiếu thay đổi" description={error}
          onRetry={() => setTick((value) => value + 1)} />
      )}
      {loadState === "ready" && data && data.records.length === 0 && (
        <StateBoundary state="empty" title="Chưa có phiếu thay đổi cần thẩm định"
          description={canEdit ? "Bấm Làm mới để lấy từ sheet." : undefined} />
      )}
      {loadState === "ready" && data && data.records.length > 0 && (
        <SmartTable caption="Phiếu thay đổi cần thẩm định" rows={rows} rowKey={(row) => row.id}
          columns={columns} empty="Không có phiếu nào khớp bộ lọc." />
      )}

      {openRecord && (
        <ChangeDialog key={`${openRecord.id}:${dialogNonce}`} row={openRecord} canEdit={canEdit}
          canCreatePlan={data?.canCreatePlan === true}
          onClose={() => setOpenId(null)}
          onChanged={async (closeAfter) => {
            if (closeAfter) {
              setOpenId(null);
              await load(true);
              return;
            }
            // Hộp thoại ở lại (vừa thêm thiết bị): dựng lại bằng bản mới. Tải lại hỏng thì
            // giữ hộp thoại cũ, không dựng lại bằng bản cũ. Không tăng khi đã đóng — mở lại
            // ngay trong lúc tải sẽ bị dựng lại và mất chữ đang gõ.
            if (await load(true)) setDialogNonce((value) => value + 1);
          }} />
      )}
    </section>
  );
}

function ChangeDialog({ row: liveRow, canEdit, canCreatePlan, onClose, onChanged }: {
  row: ChangeRecord;
  canEdit: boolean;
  canCreatePlan: boolean;
  onClose: () => void;
  onChanged: (closeAfter: boolean) => Promise<void>;
}) {
  /* Giữ bản lúc mở: lưu bằng phiên bản này để máy chủ phát hiện người khác vừa sửa. */
  const [row] = useState(liveRow);
  const changedElsewhere = liveRow.version !== row.version;
  const [objects, setObjects] = useState<ChangeObject[]>(row.objects);
  const [planIds, setPlanIds] = useState<string[]>(row.planItems.filter((p) => p.linked).map((p) => p.id));
  const [status, setStatus] = useState<ChangeHandlingStatus>(row.handlingStatus);
  const [note, setNote] = useState(row.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const savedCodes = row.objects.map((o) => o.code).join("|");
  const dirty = objects.map((o) => o.code).join("|") !== savedCodes
    || [...planIds].sort().join("|") !== row.planItems.filter((p) => p.linked).map((p) => p.id).sort().join("|")
    || status !== row.handlingStatus
    || note.trim() !== (row.note ?? "");

  /* Chỉ hiện đợt của thiết bị đang chọn; đợt đã gắn luôn hiện để bỏ được. */
  const chosen = new Set(objects.map((o) => o.code));
  const visiblePlans = row.planItems.filter((p) => chosen.has(p.objectCode) || planIds.includes(p.id));
  const newObjectsWithoutPlans = objects.filter((o) => !row.objects.some((s) => s.code === o.code));

  const save = async () => {
    if (busy || !canEdit) return;
    setBusy(true);
    setError("");
    try {
      const result = await saveChange({
        changeId: row.id,
        expectedVersion: row.version,
        objectCodes: objects.map((o) => o.code),
        planItemIds: planIds.filter((id) => visiblePlans.some((p) => p.id === id && chosen.has(p.objectCode))),
        // Hạn lấy thẳng từ sheet (chủ dự án chốt 22/10) — web không ghi hạn riêng.
        deadlineOverride: null,
        handlingStatus: status,
        note: note.trim(),
      });
      if (!result.ok) {
        setError(result.errorCode === "VERSION_CONFLICT"
          ? "Người khác vừa sửa phiếu này. Đóng để tải lại."
          : result.error);
        return;
      }
      toast.thanhCong(`Đã lưu ${row.changeCode}.`);
      await onChanged(newObjectsWithoutPlans.length === 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewportDialog open icon={FileDiff} maxWidth={720} dismissDisabled={busy}
      title={row.changeCode}
      description={row.validationContent ?? row.changeContent ?? undefined}
      onRequestClose={onClose}
      footer={<div className="cw-chan-nut">
        <button type="button" className="cw-nut" disabled={busy} onClick={onClose}>{canEdit ? "Huỷ" : "Đóng"}</button>
        {canEdit && (
          <button type="button" className="cw-nut cw-nut--chinh" disabled={busy || !dirty} onClick={save}>
            {busy ? "Đang lưu…" : "Lưu"}
          </button>
        )}
      </div>}>
      {changedElsewhere && !busy && (
        <p className="cw-loi" role="status">Người khác vừa sửa phiếu này. Đóng rồi mở lại để xem bản mới.</p>
      )}
      <dl className="tdd-nguon">
        <div><dt>Nội dung thay đổi</dt><dd>{row.changeContent ?? "—"}</dd></div>
        <div><dt>Loại</dt><dd>{[row.changeClass, row.changeType].filter(Boolean).join(" · ") || "—"}</dd></div>
        <div><dt>Phòng ban · phụ trách</dt><dd>{[row.department, row.ownerText].filter(Boolean).join(" · ") || "—"}</dd></div>
        {row.removedFromSheetAt && (
          <div><dt>Sheet</dt><dd>Đã bỏ yêu cầu thẩm định lúc {formatBangkokShortDateTime(row.removedFromSheetAt)}</dd></div>
        )}
      </dl>

      <ObjectPicker objects={objects} canEdit={canEdit} disabled={busy}
        onChange={(next) => { setObjects(next); setError(""); }} />

      <fieldset className="tdd-dot">
        <legend className="cw-nhan">Đợt thẩm định</legend>
        {visiblePlans.length === 0 && (
          <p className="cw-nhe">{objects.length === 0 ? "Gắn thiết bị trước." : "Thiết bị chưa có đợt thẩm định."}</p>
        )}
        {visiblePlans.map((plan) => (
          <label key={plan.id} className="tdd-dot__dong">
            <input type="checkbox" disabled={!canEdit || busy || !chosen.has(plan.objectCode)}
              checked={planIds.includes(plan.id)}
              onChange={(event) => setPlanIds((prev) => event.target.checked
                ? [...prev, plan.id] : prev.filter((id) => id !== plan.id))} />
            <span><b>{plan.validationCode}</b>
              {plan.deadlineValidation && <small> · hạn {formatBangkokDate(plan.deadlineValidation)}</small>}</span>
          </label>
        ))}
        {canEdit && newObjectsWithoutPlans.length > 0 && (
          <p className="cw-nhe">Lưu để hiện đợt của {newObjectsWithoutPlans.map((o) => o.code).join(", ")}.</p>
        )}
      </fieldset>

      {canCreatePlan && row.objects.length > 0 && (
        <CreatePlan row={row} disabled={busy || dirty} onCreated={() => onChanged(false)} />
      )}

      <div className="tdd-luoi">
        <div className="cw-truong">
          <span className="cw-nhan">Hạn thẩm định (theo sheet)</span>
          <b className="tdd-han">{row.deadlineSheet ? formatBangkokDate(row.deadlineSheet) : "Sheet chưa ghi ngày"}</b>
          {row.deadlineRaw && row.deadlineRaw !== (row.deadlineSheet ? formatBangkokDate(row.deadlineSheet) : "") && (
            <span className="cw-nhe">Sheet ghi: {row.deadlineRaw}</span>
          )}
        </div>
        <label className="cw-truong" htmlFor="tdd-trang-thai">
          <span className="cw-nhan">Trạng thái</span>
          <select id="tdd-trang-thai" className="cw-o" value={status} disabled={!canEdit || busy}
            onChange={(event) => setStatus(event.target.value as ChangeHandlingStatus)}>
            {(Object.keys(HANDLING_STATUS_LABEL) as ChangeHandlingStatus[]).map((key) => (
              <option key={key} value={key}>{HANDLING_STATUS_LABEL[key]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="cw-truong" htmlFor="tdd-ghi-chu">
        <span className="cw-nhan">Ghi chú</span>
        <textarea id="tdd-ghi-chu" className="cw-o" rows={2} maxLength={2000} value={note}
          disabled={!canEdit || busy} onChange={(event) => setNote(event.target.value)} />
      </label>
      {/* Giữ chỗ dòng lỗi để nút Lưu không nhảy khi có thông báo (máy tính bảng). */}
      <p className="cw-loi tdd-loi" role="alert" aria-live="assertive">{error}</p>
    </ViewportDialog>
  );
}

function ObjectPicker({ objects, canEdit, disabled, onChange }: {
  objects: ChangeObject[];
  canEdit: boolean;
  disabled: boolean;
  onChange: (next: ChangeObject[]) => void;
}) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<ChangeObject[]>([]);
  const [loadError, setLoadError] = useState("");
  const sequence = useRef(0);

  useEffect(() => {
    const q = text.trim();
    if (!canEdit || q.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const current = ++sequence.current;
    const timer = window.setTimeout(() => {
      searchChangeObjects(q)
        .then((next) => {
          if (current !== sequence.current) return;
          setSuggestions(next.filter((item) => !objects.some((o) => o.code === item.code)));
          setLoadError("");
        })
        .catch((cause: unknown) => {
          if (current !== sequence.current) return;
          setSuggestions([]);
          setLoadError(cause instanceof Error ? cause.message : String(cause));
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [text, canEdit, objects]);

  const add = (item: ChangeObject) => {
    if (objects.some((o) => o.code === item.code)) return;
    onChange([...objects, item]);
    setText("");
    setSuggestions([]);
  };

  return (
    <div className="tdd-thiet-bi">
      <span className="cw-nhan" id="tdd-thiet-bi-nhan">Thiết bị</span>
      <div className="tdd-chips" aria-labelledby="tdd-thiet-bi-nhan">
        {objects.length === 0 && <span className="cw-nhe">Chưa gắn thiết bị nào.</span>}
        {objects.map((o) => (
          <span key={o.code} className="tdd-chip" title={objectDetail(o)}>
            {o.code}{o.name ? ` · ${o.name}` : ""}
            {canEdit && (
              <button type="button" className="tdd-chip__bo" disabled={disabled}
                aria-label={`Bỏ ${o.code}`} onClick={() => onChange(objects.filter((x) => x.code !== o.code))}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <>
          <input className="cw-o" type="search" value={text} disabled={disabled} data-dialog-focus
            aria-label="Gõ mã hoặc tên thiết bị" placeholder="Tìm theo tên hoặc mã, gõ không dấu được (vd: tank 100)"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && suggestions.length > 0) {
                event.preventDefault();
                add(suggestions[0]);
              }
            }} />
          {loadError && <p className="cw-loi" role="alert">{loadError}</p>}
          {suggestions.length > 0 && (
            <ul className="tdd-goi-y" aria-label="Gợi ý thiết bị">
              {suggestions.map((item) => (
                <li key={item.code}>
                  <button type="button" className="tdd-goi-y__nut" disabled={disabled} onClick={() => add(item)}>
                    <b>{item.name ?? item.code}</b><span>{objectDetail(item)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function CreatePlan({ row, disabled, onCreated }: {
  row: ChangeRecord;
  disabled: boolean;
  onCreated: () => Promise<void>;
}) {
  const [objectCode, setObjectCode] = useState(row.objects[0]?.code ?? "");
  const [type, setType] = useState<string>("OQ");
  const [year, setYear] = useState(String(Number((row.deadline ?? todayVn()).slice(0, 4))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const create = async () => {
    if (busy || disabled) return;
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2020 || y > 2100) {
      setError("Năm phải trong khoảng 2020–2100.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await createPlanFromChange({
        changeId: row.id, expectedVersion: row.version, objectCode, validationType: type, year: y,
      });
      if (!result.ok) {
        setError(result.errorCode === "VERSION_CONFLICT"
          ? "Người khác vừa sửa phiếu này. Đóng để tải lại." : result.error);
        return;
      }
      toast.thanhCong(`Đã tạo ${result.validationCode ?? "đợt mới"} và gắn vào ${row.changeCode}.`);
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="tdd-tao">
      <legend className="cw-nhan">Tạo đợt tái thẩm định</legend>
      <div className="tdd-tao__hang">
        <select className="cw-o" aria-label="Thiết bị" value={objectCode} disabled={busy || disabled}
          onChange={(event) => setObjectCode(event.target.value)}>
          {row.objects.map((o) => <option key={o.code} value={o.code}>{o.code}</option>)}
        </select>
        <select className="cw-o" aria-label="Loại thẩm định" value={type} disabled={busy || disabled}
          onChange={(event) => setType(event.target.value)}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="cw-o" aria-label="Năm" inputMode="numeric" value={year} disabled={busy || disabled}
          onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))} />
        <button type="button" className="cw-nut" disabled={busy || disabled} onClick={create}>
          <Plus size={15} aria-hidden="true" /> {busy ? "Đang tạo…" : "Tạo đợt"}
        </button>
      </div>
      {disabled && !busy && <p className="cw-nhe">Lưu thay đổi trước khi tạo đợt.</p>}
      {error && <p className="cw-loi" role="alert">{error}</p>}
    </fieldset>
  );
}
