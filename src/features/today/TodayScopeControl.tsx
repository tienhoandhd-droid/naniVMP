import {
  canUsePersonalTodayScope,
  presentTodayPersonScope,
  type TodayPersonScope,
} from "./todayPersonScope.ts";

export interface TodayScopeControlProps {
  scope: TodayPersonScope;
  currentPersonId: string | null;
  onChange: (scope: TodayPersonScope) => void;
}

export function TodayScopeControl({ scope, currentPersonId, onChange }: TodayScopeControlProps) {
  const presentation = presentTodayPersonScope(scope, currentPersonId);
  const personalActionDisabled = scope === "team" && !canUsePersonalTodayScope(currentPersonId);

  const changeScope = () => {
    if (personalActionDisabled) return;
    onChange(scope === "mine" ? "team" : "mine");
  };

  return <div className="timeline-scope-inline" aria-label="Phạm vi việc hôm nay">
    <button type="button" className="timeline-scope-btn" aria-label={presentation.actionLabel}
      aria-pressed={scope === "mine"} disabled={personalActionDisabled} onClick={changeScope}>
      {presentation.actionLabel}
    </button>
    {presentation.warning && <div className="timeline-scope-hint" role="status">{presentation.warning}</div>}
  </div>;
}

export default TodayScopeControl;
