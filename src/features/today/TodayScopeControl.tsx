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

  return <div className="visual-filter-bar" aria-label="Phạm vi việc hôm nay">
    <button type="button" className="visual-reset-btn" aria-label={presentation.actionLabel}
      aria-pressed={scope === "mine"} disabled={personalActionDisabled} onClick={changeScope}>
      {presentation.actionLabel}
    </button>
    {presentation.warning && <div className="visual-filter-field" role="status">{presentation.warning}</div>}
  </div>;
}

export default TodayScopeControl;
