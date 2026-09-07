import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

const MANUAL_COPY_MESSAGE = "Không sao chép được. Hãy chọn và sao chép thủ công.";

export type ClipboardWrite = Pick<Clipboard, "writeText"> | undefined;

export async function copyTextToClipboard(text: string, clipboard: ClipboardWrite = globalThis.navigator?.clipboard) {
  if (!clipboard?.writeText) return { ok: false as const, message: MANUAL_COPY_MESSAGE };
  try {
    await clipboard.writeText(text);
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: MANUAL_COPY_MESSAGE };
  }
}

export function CopyCodesButton({
  text, label, successLabel = "Đã sao chép", className, style, children,
}: {
  text: string;
  label: string;
  successLabel?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const [status, setStatus] = useState("");
  const [showManualCopy, setShowManualCopy] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeout.current !== null) clearTimeout(timeout.current);
  }, []);

  const copy = async () => {
    if (timeout.current !== null) clearTimeout(timeout.current);
    const result = await copyTextToClipboard(text);
    if (!result.ok) {
      setStatus(result.message);
      setShowManualCopy(true);
      return;
    }
    setShowManualCopy(false);
    setStatus(successLabel);
    timeout.current = setTimeout(() => setStatus(""), 2_000);
  };

  return <span style={{ display: "inline-grid", gap: 6, minWidth: 0, maxWidth: "100%", marginLeft: style?.marginLeft }}>
    <button type="button" className={className} style={style} onClick={() => void copy()}>
      {status === successLabel ? successLabel : (children ?? label)}
    </button>
    {status && <span role="status" aria-live="polite" style={{ fontSize: 12 }}>{status}</span>}
    {showManualCopy && <textarea readOnly value={text} aria-label={`${label}: sao chép thủ công`}
      style={{ width: "min(100%, 520px)", minHeight: 72, resize: "vertical" }} />}
  </span>;
}
