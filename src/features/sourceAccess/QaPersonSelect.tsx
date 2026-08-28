import { useState, type CSSProperties } from "react";
import { RefreshCw } from "lucide-react";
import { C, TEXT } from "../../constants/theme.ts";
import type { IncludedSourceQaCandidate, SourceQaCandidateIdentity } from "./contracts.ts";
import type { SourceQaCandidatesState } from "./sourceAccessModel.ts";

const LY_DO_KHONG_DU_DIEU_KIEN: Record<string, string> = {
  PERSON_NOT_FOUND: "không còn trong danh bạ",
  PERFORMER_INACTIVE: "nhân sự đã ngừng hoạt động",
  ACCOUNT_UNLINKED: "chưa nối với tài khoản",
  ACCOUNT_DISABLED: "tài khoản đã bị vô hiệu hóa",
  ROLE_INELIGIBLE: "không còn vai trò QA phù hợp",
};

function label(person: SourceQaCandidateIdentity): string {
  const identity = [person.fullName, person.email ?? "chưa có email", person.department ?? "chưa có bộ phận"];
  identity.push(`ID …${person.personId.slice(-8)}`);
  return identity.join(" · ");
}

function current(state: SourceQaCandidatesState, personId: string | null): IncludedSourceQaCandidate | null {
  if (!personId) return null;
  return state.includedCurrent.find((person) => person.personId === personId) ?? null;
}

export default function QaPersonSelect({
  id, value, state, ariaLabel, ariaDescribedBy, ariaInvalid, disabled = false,
  onChange, onRetry, onLoadMore, onSearch,
}: {
  id: string;
  value: string | null;
  state: SourceQaCandidatesState;
  ariaLabel: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  disabled?: boolean;
  onChange: (personId: string | null) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onSearch: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedCurrent = current(state, value);
  const ineligible = selectedCurrent && !selectedCurrent.eligible ? selectedCurrent : null;
  const selectable = state.status === "ready" && !disabled;
  const rows = state.rows;
  const currentEligibleOutsidePage = selectedCurrent?.eligible
    && !rows.some((person) => person.personId === selectedCurrent.personId)
    ? selectedCurrent : null;
  const style: CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 10,
    border: `1.5px solid ${C.pinkSoft}`, background: selectable ? C.surface : C.pinkMist,
    color: C.plum, fontFamily: TEXT, fontSize: 14,
  };

  return (
    <div>
      <label htmlFor={`${id}-search`} className="cw-goi-y">Tìm QA đủ điều kiện</label>
      <input
        id={`${id}-search`}
        type="search"
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          onSearch(nextQuery);
        }}
        placeholder="Nhập tên QA…"
        aria-label={`Tìm ${ariaLabel}`}
        disabled={disabled}
        className="cw-o"
      />
      <select
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        value={value ?? ""}
        disabled={!selectable}
        onChange={(event) => onChange(event.target.value || null)}
        style={style}
      >
        <option value="">— chưa phân công —</option>
        {ineligible && <option value={ineligible.personId} disabled>{label(ineligible)} — không còn đủ điều kiện</option>}
        {currentEligibleOutsidePage && <option value={currentEligibleOutsidePage.personId}>{label(currentEligibleOutsidePage)}</option>}
        {rows.map((person) => <option key={person.personId} value={person.personId}>{label(person)}</option>)}
      </select>
      {value && !disabled && !selectable && (
        <button type="button" className="cw-nut cw-nut--phu" onClick={() => onChange(null)}>
          Bỏ phân công
        </button>
      )}
      {state.status === "loading" && <p role="status" aria-live="polite">Đang tải danh sách QA…</p>}
      {state.status === "ready" && rows.length === 0 && <p>Không có QA nào đủ điều kiện.</p>}
      {state.status === "error" && (
        <p role="alert">
          Không tải được danh sách QA: {state.error?.error}
          <button type="button" className="cw-nut cw-nut--phu" onClick={onRetry}><RefreshCw size={14} /> Thử lại</button>
        </p>
      )}
      {ineligible && (
        <p role="alert">
          Người đang được chọn {LY_DO_KHONG_DU_DIEU_KIEN[ineligible.ineligibilityReason ?? ""] ?? "không còn đủ điều kiện"}.
          {!disabled && <button type="button" className="cw-nut cw-nut--phu" onClick={() => onChange(null)}>Bỏ phân công</button>}
        </p>
      )}
      {state.status === "ready" && state.nextCursor && (
        <button type="button" className="cw-nut cw-nut--phu" onClick={onLoadMore}>Tải thêm QA</button>
      )}
    </div>
  );
}
