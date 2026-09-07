import { useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import ViewportDialog from "../../components/ui/ViewportDialog.tsx";
import { getCatalogHelp } from "./catalogHelpContent.ts";
import "./catalog-help.css";

export default function CatalogContextHelp({ region, canChange }: { region: string; canChange: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const guide = getCatalogHelp(region);

  return (
    <>
      <button ref={triggerRef} type="button" className="cch-trigger"
        aria-label={`Hướng dẫn ${guide.title}`} title={`Hướng dẫn ${guide.title}`}
        onClick={() => setOpen(true)}>
        <CircleHelp size={17} aria-hidden="true" />
      </button>
      <ViewportDialog open={open} onRequestClose={() => setOpen(false)}
        returnFocusRef={triggerRef} icon={CircleHelp} maxWidth={620}
        title={`Hướng dẫn · ${guide.title}`} description={guide.summary}
        footer={<div className="cch-footer"><button type="button" className="cch-close" onClick={() => setOpen(false)}>Đã hiểu</button></div>}>
        <div className="cch-guide">
          <section aria-labelledby="cch-steps-heading">
            <h3 id="cch-steps-heading">Cách dùng</h3>
            <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          </section>
          {guide.fields && (
            <section aria-labelledby="cch-fields-heading">
              <h3 id="cch-fields-heading">Trường cần chú ý</h3>
              <ul className="cch-fields">{guide.fields.map((field) => <li key={field}>{field}</li>)}</ul>
            </section>
          )}
          {guide.caution && <p className="cch-caution"><b>Lưu ý:</b> {guide.caution}</p>}
          <p className="cch-access" role="note">{canChange ? guide.editorNote : guide.readerNote}</p>
        </div>
      </ViewportDialog>
    </>
  );
}
