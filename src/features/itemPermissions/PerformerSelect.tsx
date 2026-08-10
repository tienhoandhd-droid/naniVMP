import type { CSSProperties } from "react";
import { C, TEXT } from "../../constants/theme.ts";
import type { PerformerChoice } from "./performerSelection.ts";

interface PerformerSelectProps {
  value: string | null;
  options: readonly PerformerChoice[];
  allowClear?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  style?: CSSProperties;
  onChange: (personId: string | null) => void;
}

export default function PerformerSelect({
  value,
  options,
  allowClear = true,
  disabled = false,
  ariaLabel = "Chọn người thực hiện",
  style,
  onChange,
}: PerformerSelectProps) {
  const currentExists = value === null || options.some((person) => person.personId === value);

  return (
    <select
      aria-label={ariaLabel}
      value={currentExists ? value ?? "" : ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: `1.5px solid ${C.pinkSoft}`,
        background: disabled ? C.pinkMist : C.surface,
        color: C.plum,
        fontFamily: TEXT,
        fontSize: 14,
        ...style,
      }}
    >
      {allowClear && <option value="">— chưa phân công —</option>}
      {!allowClear && !value && <option value="">— chọn người —</option>}
      {options.map((person) => (
        <option key={person.personId} value={person.personId}>
          {person.fullName} · {person.email || "chưa có email"} · {person.department || "chưa có bộ phận"}
        </option>
      ))}
    </select>
  );
}
