import { CalendarClock, CalendarDays, Waves, Pause, Play, Search } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Activity } from "../../types/domain.ts";
import {
  buildLongMonRaceModel,
  LONG_MON_STAGE_META,
  type LongMonStageMeta,
} from "./longMonRaceModel.ts";

import { buildOrganicPlacements, parseLongMonView, LONG_MON_VIEW_KEY, type LongMonView } from "./longMonPresentation.ts";

/* BASE_URL thay vì "/": app deploy GitHub Pages dạng project
 * (https://<user>.github.io/<repo>/) với `base: "./"` — đường dẫn tuyệt
 * đối "/art/..." sẽ trỏ ra NGOÀI repo và cả bức tranh biến mất trên
 * production. import.meta.env.BASE_URL luôn có "/" ở cuối. */
const ART_BASE = `${import.meta.env?.BASE_URL ?? "/"}art/monitoring/`;
const BACKGROUND_URL = `${ART_BASE}long-mon-ngu-do-silk-v1.webp`;
const SPECIES_SHEET_URL = `${ART_BASE}long-mon-six-species-v16.webp`;
/* Cổng Vũ Môn vẽ tay (SVG → Inkscape xuất PNG) — xem chú thích trong CSS. */

/* Mồi tải hai tranh NGAY khi chunk màn này về — song song với việc React
 * render — thay vì chờ <img>/CSS mount mới bắt đầu (3 chặng mạng nối tiếp:
 * chunk JS → render → tranh). Trình duyệt tự khử trùng lặp request. */
if (typeof window !== "undefined") {
  for (const url of [BACKGROUND_URL, SPECIES_SHEET_URL]) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}

/* Deadline tạo pha nền của đàn; id tạo lệch pha và biên độ riêng. Kết quả
 * luôn xác định để cùng dữ liệu không "nhảy đàn" sau khi tải lại. */
function swimTiming(id: string, deadline: string): {
  delay: string;
  dur: string;
  x: string;
  y: string;
  rotate: string;
} {
  let hash = 2166136261;
  for (let i = 0; i < `${deadline}:${id}`.length; i += 1) {
    hash ^= `${deadline}:${id}`.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const u = (hash >>> 0) / 4294967295;
  const v = ((hash >>> 8) & 0xffff) / 65535;
  const w = ((hash >>> 16) & 0xffff) / 65535;
  return {
    delay: `${(-u * 9.5).toFixed(2)}s`,
    dur: `${(5.2 + v * 5.3).toFixed(2)}s`,
    x: `${(1.5 + u * 2.5).toFixed(2)}px`,
    y: `${(2 + w * 3).toFixed(2)}px`,
    rotate: `${(.8 + v * 2.2).toFixed(2)}deg`,
  };
}

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
  "--swim-delay": string;
  "--swim-dur": string;
  "--long-mon-x": string;
  "--long-mon-y": string;
  "--school-x": string;
  "--school-y": string;
  "--school-scale": number;
  "--school-rotate": string;
  "--motion-x": string;
  "--motion-y": string;
  "--motion-rotate": string;
  "--organic-facing": number;
};

type RaceCanvasStyle = CSSProperties & {
  "--long-mon-scene-width": string;
  "--long-mon-scene-height": string;
  "--long-mon-contained-width"?: string;
  "--long-mon-contained-height"?: string;
};

function spriteStyle(stage: LongMonStageMeta): SpriteStyle {
  return {
    /* Ảnh atlas đặt từ JS (không phải CSS) để đi qua BASE_URL — url()
       tuyệt đối trong CSS không được Vite viết lại theo base. */
    backgroundImage: `url("${SPECIES_SHEET_URL}")`,
    "--long-mon-sprite-x": stage.spriteX,
    "--long-mon-sprite-y": stage.spriteY,
  };
}

function formatDeadline(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/* Bảng meta loài cá là hằng module — dựng Map một lần, không phải mỗi render. */
const META_BY_STAGE = new Map(LONG_MON_STAGE_META.map((stage) => [stage.id, stage]));

function LongMonRace({
  activities,
  now = new Date(),
  onOpen,
  scopeControl,
}: LongMonRaceProps) {
  /* buildLongMonRaceModel duyệt + băm vị trí cho từng con cá.
   * Trước 31/08 nó chạy lại ở mỗi render của TimelinePage (kể cả khi chỉ đổi
   * bộ chọn phạm vi) vì không memo — giờ chỉ tính lại khi dữ liệu/mốc đổi. */
  const audience = scopeControl?.audience ?? "team";
  const model = useMemo(
    () => buildLongMonRaceModel(activities, now, { audience }),
    [activities, now, audience],
  );
  const [view, setView] = useState<LongMonView>(() => {
    try { return parseLongMonView(localStorage.getItem(LONG_MON_VIEW_KEY)); }
    catch { return "date"; }
  });
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const organic = useMemo(() => view === "organic" ? buildOrganicPlacements(model.fish) : null, [model.fish, view]);
  const sceneHeight = 560;
  function changeView(next: LongMonView) {
    setView(next);
    try { localStorage.setItem(LONG_MON_VIEW_KEY, next); } catch { /* Display still works in private mode. */ }
  }
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const viewportRef = useRef<HTMLDivElement>(null);
  const raceRef = useRef<HTMLElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [containedScene, setContainedScene] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const race = raceRef.current;
    const viewport = viewportRef.current;
    if (!race || !viewport) return;
    const measure = () => {
      setAvailableHeight(Math.max(280, Math.floor(window.innerHeight - race.getBoundingClientRect().top - 8)));
      const { width, height } = viewport.getBoundingClientRect();
      const sceneHeight = Math.floor(Math.min(height, width / 2));
      setContainedScene({ width: sceneHeight * 2, height: sceneHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(race);
    observer.observe(viewport);
    if (race.parentElement) observer.observe(race.parentElement);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [view, model.fish.length]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && query) { setQuery(""); setHighlightedId(null); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [query]);
  const metaByStage = META_BY_STAGE;
  const canvasStyle: RaceCanvasStyle = {
    "--long-mon-scene-width": `${model.sceneWidthPx}px`,
    "--long-mon-scene-height": `${sceneHeight}px`,
    ...(containedScene ? {
      "--long-mon-contained-width": `${containedScene.width}px`,
      "--long-mon-contained-height": `${containedScene.height}px`,
    } : {}),
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (view === "organic") { if (viewport) { viewport.scrollLeft = 0; viewport.scrollTop = 0; } return; }
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth + 1) return;
    const today = viewport.querySelector<HTMLElement>(".long-mon-race__today");
    if (!today) return;
    const target = today.offsetLeft - viewport.clientWidth / 2;
    viewport.scrollLeft = Math.max(0, Math.min(target, viewport.scrollWidth - viewport.clientWidth));
  }, [model.todayPct, view]);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    if (!needle) return [];
    return model.fish.filter(({ activity }) => [activity.code, activity.name, activity.objName, activity.obj, activity.id]
      .some(value => String(value ?? "").toLocaleLowerCase("vi").includes(needle))).slice(0, 8);
  }, [model.fish, query]);
  const highlight = (value: string) => {
    const needle = query.trim();
    const at = value.toLocaleLowerCase("vi").indexOf(needle.toLocaleLowerCase("vi"));
    if (at < 0 || !needle) return value;
    return <>{value.slice(0, at)}<mark>{value.slice(at, at + needle.length)}</mark>{value.slice(at + needle.length)}</>;
  };

  return (
    <section ref={raceRef} className="long-mon-race" style={availableHeight ? { "--long-mon-available-height": `${availableHeight}px` } as CSSProperties : undefined} data-view={view} data-paused={paused || hidden} aria-label={view === "date" ? "Dòng thời gian VMP 60 ngày quanh Hôm nay" : "Long Môn VMP · Ngư đồ nghệ thuật"}>
      <header className="long-mon-race__head">
        <div className="long-mon-race__title-block">
          <span className="long-mon-race__eyebrow">60 ngày quanh Hôm nay</span>
          <h2>Long Môn VMP</h2>
          <p>Mỗi cá một hành trình · Bấm cá để xem hạn và hồ sơ</p>
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
        </div>
      </header>

      <div className="long-mon-race__toolbar">
        <div className="long-mon-race__view-switch" role="group" aria-label="Cách sắp xếp cá">
          <button type="button" data-long-mon-view="date" aria-pressed={view === "date"} onClick={() => changeView("date")}>
            <CalendarDays size={17} aria-hidden="true" /> Theo ngày
          </button>
          <button type="button" data-long-mon-view="organic" aria-pressed={view === "organic"} onClick={() => changeView("organic")}>
            <Waves size={18} aria-hidden="true" /> Bơi tự nhiên
          </button>
        </div>
        <p className="long-mon-race__view-hint" aria-live="polite">
          {view === "date" ? "Vị trí cá theo hạn VMP · từ trái sang phải" : "Ngư đồ nghệ thuật · vị trí tự do, hạn VMP giữ nguyên"}
        </p>
        <button type="button" className="long-mon-race__pause" data-long-mon-pause aria-pressed={paused}
          aria-label={paused ? "Tiếp tục bơi" : "Tạm dừng chuyển động"} onClick={() => setPaused(value => !value)}>
          {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
          <span>{paused ? "Tiếp tục bơi" : "Tạm dừng"}</span>
        </button>
        <label className="long-mon-race__search">
          <Search size={15} aria-hidden="true" />
          <span className="lp-visually-hidden">Tìm hồ sơ trong ngư đồ</span>
          <input data-long-mon-search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã, tên hồ sơ" />
        </label>
        {matches.length > 0 && <div className="long-mon-race__search-results" role="list" aria-label="Hồ sơ khớp tìm kiếm">
          {matches.map(({ activity }) => {
            const code = String(activity.code || activity.id);
            const name = String(activity.name || activity.objName || activity.obj || "Hạng mục VMP");
            return <div key={String(activity.id)} role="listitem"><button type="button" data-long-mon-search-result onClick={() => { setHighlightedId(String(activity.id)); onOpen(activity); }}>
              <strong>{highlight(code)}</strong><span>{highlight(name)}</span>
            </button></div>;
          })}
        </div>}
        {query.trim() && matches.length === 0 && <p className="long-mon-race__search-empty" role="status">Không có hồ sơ khớp.</p>}
      </div>

      <div ref={viewportRef} className="long-mon-race__viewport" tabIndex={0} aria-label={view === "date" ? "60 ngày VMP quanh Hôm nay; dùng Tab để chọn cá và Enter để mở hồ sơ" : "Hồ cá nghệ thuật; dùng Tab để chọn cá và Enter để mở hồ sơ"}>
        <div
          className="long-mon-race__canvas long-mon-race__canvas--adaptive-scene"
          data-density-scale={model.densityScale}
          data-scene-width={model.sceneWidthPx}
          data-scene-height={sceneHeight}
          style={canvasStyle}
        >
          {/* fetchpriority="high": tranh nền LÀ nội dung chính của màn — trình
              duyệt mặc định xếp ảnh sau JS/CSS, ép ưu tiên để bớt màn trống.
              width/height gốc của file để giữ chỗ, tránh CLS khi tranh về
              (CSS vẫn scale theo --long-mon-scene-*). */}
          <img className="long-mon-race__background" src={BACKGROUND_URL} alt="" aria-hidden="true"
            width={1774} height={887} decoding="async" {...({ fetchpriority: "high" } as Record<string, string>)} />
          <div className="long-mon-race__wash" aria-hidden="true" />
          {view === "organic" && <div className="long-mon-race__pond-light" aria-hidden="true"><i /><i /><i /></div>}

          <div className="long-mon-race__periods" aria-hidden="true">
            {model.periods.map((period) => (
              <span
                key={period.id}
                data-long-mon-period={period.id}
                className={`long-mon-race__period long-mon-race__period--${period.id}`}
                style={{ left: `${period.startPct}%`, width: `${period.widthPct}%` }}
              >
                <strong>{period.label}</strong>
              </span>
            ))}
          </div>

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
            <div className="long-mon-race__school" role="list"
              data-long-mon-density={model.fish.length > 24 ? "dense" : "sparse"} aria-label={`${model.fish.length} hạng mục có hạn VMP trong 60 ngày`}>
              {model.fish.map((fish) => {
                const stage = metaByStage.get(fish.stage)!;
                const deadline = formatDeadline(fish.deadline);
                const code = String(fish.activity.code || fish.activity.id);
                const name = String(fish.activity.name || fish.activity.objName || fish.activity.obj || "Hạng mục VMP");
                const swim = swimTiming(String(fish.activity.id), fish.deadline);
                const placement = organic?.get(String(fish.activity.id));
                const dateYPct = Math.max(20, Math.min(88, 21 + fish.renderYPct * .67));
                const style: FishStyle = {
                  "--swim-delay": swim.delay,
                  "--swim-dur": swim.dur,
                  "--long-mon-x": `${placement?.xPct ?? fish.renderXPct}%`,
                  "--long-mon-y": `${placement?.yPct ?? dateYPct}%`,
                  "--school-x": "0px",
                  "--school-y": "0px",
                  "--school-scale": placement?.scale ?? fish.renderScale,
                  "--school-rotate": `${placement?.rotateDeg ?? fish.renderRotateDeg}deg`,
                  "--motion-x": swim.x,
                  "--motion-y": swim.y,
                  "--motion-rotate": swim.rotate,
                  "--organic-facing": placement && placement.rotateDeg < 0 ? -1 : 1,
                };
                return (
                  <span key={fish.activity.id} className="long-mon-race__fish-position" style={style} role="listitem">
                    <button
                      type="button"
                      className={`long-mon-race__fish long-mon-race__fish--${fish.stage}`}
                      data-long-mon-fish={fish.activity.id}
                      data-long-mon-code={code}
                      data-deadline={fish.deadline}
                      data-week={fish.weekKey}
                      data-anchor-x={fish.deadlinePct}
                      data-render-x={fish.renderXPct}
                      data-owner-start={fish.ownerStartPct}
                      data-owner-end={fish.ownerEndPct}
                      data-school-formation={fish.schoolFormation}
                      data-motion-profile={fish.motionProfile}
                      data-long-mon-highlighted={highlightedId === String(fish.activity.id) || undefined}
                      data-collision-width="62"
                      data-collision-height="54"
                      aria-label={`${code} · ${stage.label} · hạn VMP ${deadline}`}
                      onClick={() => onOpen(fish.activity)}
                    >
                      <span className="long-mon-race__fish-body">
                        <span className="long-mon-race__wake" aria-hidden="true" />
                        <span className="long-mon-race__sprite" style={spriteStyle(stage)} aria-hidden="true" />
                      </span>
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
              <strong>{scopeControl?.emptyMessage ? "Không thể mở ngư đồ cá nhân" : "Không có hạn VMP trong 30 ngày đã qua và 30 ngày sắp tới"}</strong>
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
          <span>{model.fish.length} hạng mục trong 60 ngày</span>
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

/* memo: TimelinePage đã ổn định tham chiếu props (now/scopeControl qua
 * useMemo, onOpen qua useCallback) nên shallow-compare chặn được re-render
 * khi state khác của trang (modal chi tiết, dialog sửa hạn) thay đổi. */
export default memo(LongMonRace);

export { BACKGROUND_URL as LONG_MON_BACKGROUND_URL, SPECIES_SHEET_URL as LONG_MON_SPECIES_SHEET_URL };
