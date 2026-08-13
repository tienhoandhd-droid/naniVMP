import { AlertTriangle, ChevronDown } from "lucide-react";
import { C, TEXT } from "../../constants/theme.ts";

export type CatalogWarning = {
  id: string;
  tone: "bad" | "ask";
  title: string;
  body: string;
  items: string[];
  more?: number;
  blocking: boolean;
};

export default function CatalogWarningsSummary({ warnings }: { warnings: CatalogWarning[] }) {
  if (warnings.length === 0) return null;

  const blockingCount = warnings.filter((warning) => warning.blocking).length;

  return (
    <section className="vmp-catalog-warnings" aria-label="Tóm tắt vấn đề dữ liệu">
      <div className="vmp-catalog-warnings__summary" style={{ fontFamily: TEXT }}>
        <AlertTriangle size={16} aria-hidden="true" />
        <span>Có {warnings.length} nhóm vấn đề dữ liệu</span>
        {blockingCount > 0 && <b>{blockingCount} nhóm cần xử lý ngay</b>}
        {blockingCount === 0 && <span>Không có nhóm nào chặn timeline</span>}
      </div>

      <div className="vmp-catalog-warnings__groups">
        {warnings.map((warning) => {
          const bad = warning.tone === "bad";
          const items = warning.items.slice(0, 12);
          const more = Math.max(0, (warning.more ?? 0) + warning.items.length - items.length);
          return (
            <details key={warning.id} className={`vmp-catalog-warning vmp-catalog-warning--${warning.tone}`}
              open={warning.blocking}>
              <summary>
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{warning.title}</span>
                {warning.blocking && <b className="vmp-catalog-warning__blocker">Cần xử lý</b>}
                <ChevronDown className="vmp-catalog-warning__chevron" size={16} aria-hidden="true" />
              </summary>
              <div className="vmp-catalog-warning__body" style={{ color: bad ? C.raspText : C.marigoldText }}>
                <div>{warning.body}</div>
                {items.length > 0 && (
                  <div className="vmp-catalog-warning__items">
                    {items.join(" · ")}{more > 0 ? ` … và ${more} đối tượng nữa` : ""}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
