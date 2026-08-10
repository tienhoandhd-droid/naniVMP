import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { RootScopeOption } from "./scopeHierarchy.ts";

interface LinkedMultiSelectProps {
  label: string;
  options: RootScopeOption[];
  selected: string[];
  disabledReason?: string;
  onChange: (selected: string[]) => void;
}

function toggleId(values: string[], id: string): string[] {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

export default function LinkedMultiSelect({
  label,
  options,
  selected,
  disabledReason,
  onChange,
}: LinkedMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const optionById = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const filtered = options.filter((option) => !normalizedQuery
    || `${option.code} ${option.label}`.toLocaleLowerCase("vi").includes(normalizedQuery));
  const reasonId = `${label.toLocaleLowerCase("vi").replace(/[^a-z0-9]+/g, "-")}-reason`;

  const openAndFocus = () => {
    setOpen(true);
    window.requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
  };

  return (
    <div className="ip-multi">
      <span className="ip-multi-label">{label}</span>
      <button
        type="button"
        className="pq-o ip-multi-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={disabledReason ? reasonId : undefined}
        disabled={Boolean(disabledReason)}
        onClick={() => open ? setOpen(false) : openAndFocus()}
        onKeyDown={(event) => {
          if (!open && ["ArrowDown", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            openAndFocus();
          }
        }}
      >
        <span>{selected.length ? `${selected.length} đã chọn` : "— chọn —"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>

      {disabledReason && <span id={reasonId} className="ip-multi-reason">{disabledReason}</span>}

      {selected.length > 0 && (
        <div className="ip-multi-tags" aria-label={`${label}: các giá trị đã chọn`}>
          {selected.map((id) => {
            const option = optionById.get(id);
            return (
              <span key={id}>
                {option ? `${option.code} · ${option.label}` : id}
                <button type="button" aria-label={`Bỏ ${option?.label || id}`} onClick={() => onChange(selected.filter((value) => value !== id))}>
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            );
          })}
          <button type="button" className="ip-multi-clear" onClick={() => onChange([])}>Xóa tất cả</button>
        </div>
      )}

      {open && (
        <div
          ref={listRef}
          className="ip-multi-popover"
          role="listbox"
          aria-label={`${label}: danh sách lựa chọn`}
          aria-multiselectable="true"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        >
          <label className="ip-multi-search">
            <Search size={14} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo mã hoặc tên…" aria-label={`Tìm ${label}`} />
          </label>
          <div className="ip-multi-options">
            {filtered.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  data-value={option.id}
                  aria-selected={checked}
                  onClick={() => onChange(toggleId(selected, option.id))}
                >
                  <span className="ip-multi-check">{checked && <Check size={13} aria-hidden="true" />}</span>
                  <span><b>{option.code}</b><small>{option.label}</small></span>
                </button>
              );
            })}
            {!filtered.length && <span className="ip-empty">Không có lựa chọn phù hợp.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
