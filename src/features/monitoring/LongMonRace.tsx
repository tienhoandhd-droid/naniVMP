import { ArrowLeft, ArrowRight, CalendarClock, Waves } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { Activity } from "../../types/domain.ts";
import {
  buildLongMonRaceModel,
  LONG_MON_STAGE_META,
  type LongMonStageMeta,
} from "./longMonRaceModel.ts";

const BACKGROUND_URL = "/art/monitoring/long-mon-vmp-racecourse-v15.png";
const SPECIES_SHEET_URL = "/art/monitoring/long-mon-six-species-v15.png";

interface LongMonRaceProps {
  activities: readonly Activity[];
  now?: Date;
  onOpen: (activity: Activity) => void;
  scopeControl?: LongMonScopeControl;
}

export interface LongMonPersonOption {
  personId: string;
  fullName: string;
  label: string;
}

export interface LongMonScopeControl {
  canChooseAudience: boolean;
  audience: "team" | "personal";
  scopeLabel: string;
  people: readonly LongMonPersonOption[];
  selectedPersonId: string | null;
  emptyMessage?: string | null;
  onAudienceChange: (audience: "team" | "personal") => void;
  onPersonChange: (personId: string | null) => void;
}

type SpriteStyle = CSSProperties & {
  "--long-mon-sprite-x": string;
  "--long-mon-sprite-y": string;
};

type FishStyle = CSSProperties & {
  "--long-mon-x": string;
  "--long-mon-y": string;
  "--school-x": string;
  "--school-y": string;
  "--school-scale": number;
  "--school-rotate": string;
};

type RaceCanvasStyle = CSSProperties & {
  "--long-mon-scene-width": string;
  "--long-mon-scene-height": string;
};

function spriteStyle(stage: LongMonStageMeta): SpriteStyle {
  return {
    "--long-mon-sprite-x": stage.spriteX,
    "--long-mon-sprite-y": stage.spriteY,
  };
}

function formatDeadline(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function LongMonRace({
  activities,
  now = new Date(),
  onOpen,
  scopeControl,
}: LongMonRaceProps) {
  const model = buildLongMonRaceModel(activities, now, {
    audience: scopeControl?.audience ?? "team",
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const metaByStage = new Map(LONG_MON_STAGE_META.map((stage) => [stage.id, stage]));
  const canvasStyle: RaceCanvasStyle = {
    "--long-mon-scene-width": `${model.sceneWidthPx}px`,
    "--long-mon-scene-height": `${model.sceneHeightPx}px`,
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth + 1) return;
    const today = viewport.querySelector<HTMLElement>(".long-mon-race__today");
    if (!today) return;
    const target = today.offsetLeft - viewport.clientWidth / 2;
    viewport.scrollLeft = Math.max(0, Math.min(target, viewport.scrollWidth - viewport.clientWidth));
  }, [model.todayPct]);

  return (
    <section className="long-mon-race" aria-label="Trường đua hạn VMP ba tháng">
      <header className="long-mon-race__head">
        <div className="long-mon-race__title-block">
          <span className="long-mon-race__eyebrow">Bản đồ deadline · ba tháng liền kề</span>
          <h2>Long Môn VMP</h2>
          <p>
            Mỗi thiết bị là một cá. Hạn VMP đưa cá vào vùng tuần; bấm cá để xem ngày
            chính xác, loài và màu cho biết giai đoạn đã hoàn thành.
          </p>
        </div>
        <div className="long-mon-race__head-side">
          {scopeControl && (
            <div className="long-mon-race__scope">
              {scopeControl.canChooseAudience ? (
                <>
                  <div className="long-mon-race__scope-switch" role="group" aria-label="Chọn phạm vi ngư đồ">
                    <button type="button" data-long-mon-audience="team"
                      aria-pressed={scopeControl.audience === "team"}
                      onClick={() => scopeControl.onAudienceChange("team")}>Cả nhóm QA</button>
                    <button type="button" data-long-mon-audience="personal"
                      aria-pressed={scopeControl.audience === "personal"}
                      disabled={scopeControl.people.length === 0}
                      onClick={() => scopeControl.onAudienceChange("personal")}>Cá nhân</button>
                  </div>
                  {scopeControl.audience === "personal" && scopeControl.people.length > 0 && (
                    <label className="long-mon-race__person" htmlFor="long-mon-person-select">
                      <span>Chọn người QA</span>
                      <select id="long-mon-person-select" value={scopeControl.selectedPersonId ?? ""}
                        onChange={(event) => scopeControl.onPersonChange(event.target.value || null)}>
                        {scopeControl.people.map((person) => (
                          <option key={person.personId} value={person.personId}>{person.fullName}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              ) : (
                <span className="long-mon-race__personal-only" data-long-mon-personal-only="true">
                  {scopeControl.scopeLabel}
                </span>
              )}
              <span className="long-mon-race__scope-status" aria-live="polite">
                {model.fish.length} cá · {scopeControl.scopeLabel}
              </span>
            </div>
          )}
          <div className="long-mon-race__flow" aria-label="Dòng nước chảy sang trái; cá và thời gian tiến sang phải">
            <span><Waves size={16} aria-hidden="true" /> Dòng nước <ArrowLeft size={15} aria-hidden="true" /></span>
            <span>Thời gian &amp; cá <ArrowRight size={15} aria-hidden="true" /></span>
          </div>
        </div>
      </header>

      <div ref={viewportRef} className="long-mon-race__viewport" tabIndex={0} aria-label="Kéo ngang để xem toàn bộ trường đua trên màn hình hẹp">
        <div
          className="long-mon-race__canvas long-mon-race__canvas--adaptive-scene"
          data-density-scale={model.densityScale}
          data-scene-width={model.sceneWidthPx}
          data-scene-height={model.sceneHeightPx}
          style={canvasStyle}
        >
          <img className="long-mon-race__background" src={BACKGROUND_URL} alt="" aria-hidden="true" />
          <div className="long-mon-race__wash" aria-hidden="true" />

          <div className="long-mon-race__months" aria-hidden="true">
            {model.bands.map((band) => (
              <span
                key={`${band.year}-${band.month}`}
                className="long-mon-race__month"
                style={{ left: `${band.startPct}%`, width: `${band.widthPct}%` }}
              >
                <strong>{band.label}</strong>
                <small>{band.shortLabel}</small>
              </span>
            ))}
          </div>

          <div className="long-mon-race__weeks" aria-hidden="true">
            {model.weeks.map((week) => (
              <span key={week.key} data-long-mon-week={week.key}
                style={{ left: `${week.startPct}%`, width: `${week.widthPct}%` }}>
                {week.label}
              </span>
            ))}
          </div>

          {model.todayPct !== null && (
            <div className="long-mon-race__today" style={{ left: `${model.todayPct}%` }}>
              <span>Hôm nay</span>
            </div>
          )}

          {model.fish.length > 0 ? (
            <div className="long-mon-race__school" role="list" aria-label={`${model.fish.length} hạng mục có hạn VMP trong ba tháng`}>
              {model.fish.map((fish) => {
                const stage = metaByStage.get(fish.stage)!;
                const deadline = formatDeadline(fish.deadline);
                const code = String(fish.activity.code || fish.activity.id);
                const name = String(fish.activity.name || fish.activity.objName || fish.activity.obj || "Hạng mục VMP");
                const style: FishStyle = {
                  "--long-mon-x": `${fish.xPct}%`,
                  "--long-mon-y": `${fish.yPct}%`,
                  "--school-x": `${fish.renderOffsetXPx}px`,
                  "--school-y": `${fish.renderOffsetYPx}px`,
                  "--school-scale": fish.renderScale,
                  "--school-rotate": `${fish.renderRotateDeg}deg`,
                };
                return (
                  <span key={fish.activity.id} className="long-mon-race__fish-position" style={style} role="listitem">
                    <button
                      type="button"
                      className={`long-mon-race__fish long-mon-race__fish--${fish.stage}`}
                      data-long-mon-fish={fish.activity.id}
                      data-deadline={fish.deadline}
                      data-week={fish.weekKey}
                      data-anchor-x={fish.xPct}
                      data-collision-width="84"
                      data-collision-height="78"
                      aria-label={`${code} · ${stage.label} · hạn VMP ${deadline}`}
                      onClick={() => onOpen(fish.activity)}
                    >
                      <span className="long-mon-race__wake" aria-hidden="true" />
                      <span className="long-mon-race__sprite" style={spriteStyle(stage)} aria-hidden="true" />
                      <span className="long-mon-race__code" aria-hidden="true">{code}</span>
                      <span className="long-mon-race__tooltip" aria-hidden="true">
                        <strong>{code}</strong>
                        <span>{name}</span>
                        <em>{stage.label} · hạn {deadline}</em>
                      </span>
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="long-mon-race__empty">
              <CalendarClock size={22} aria-hidden="true" />
              <strong>{scopeControl?.emptyMessage ? "Không thể mở ngư đồ cá nhân" : "Không có hạn VMP trong ba tháng này"}</strong>
              <span>{scopeControl?.emptyMessage ?? "Các bộ lọc hiện tại không để lại hạng mục nào trên trường đua."}</span>
            </div>
          )}
        </div>
      </div>

      <footer className="long-mon-race__footer">
        <ul className="long-mon-race__legend" aria-label="Chú giải sáu trạng thái cá">
          {LONG_MON_STAGE_META.map((stage) => (
            <li key={stage.id} data-long-mon-legend={stage.id}>
              <span className="long-mon-race__legend-sprite" style={spriteStyle(stage)} aria-hidden="true" />
              <span>
                <strong>{stage.shortLabel}</strong>
                <small>{stage.species}</small>
              </span>
              <b>{model.stageCounts[stage.id]}</b>
            </li>
          ))}
        </ul>
        <div className="long-mon-race__notes">
          <span>{model.fish.length} hạng mục đang hiện trên trường đua</span>
          {model.missingDeadlineCount > 0 && (
            <span className="long-mon-race__missing">
              {model.missingDeadlineCount} hạng mục chưa có hạn VMP
            </span>
          )}
        </div>
      </footer>
    </section>
  );
}

export { BACKGROUND_URL as LONG_MON_BACKGROUND_URL, SPECIES_SHEET_URL as LONG_MON_SPECIES_SHEET_URL };
