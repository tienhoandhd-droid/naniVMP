import type { LongMonRaceFish } from './longMonRaceModel.ts';

export type LongMonView = 'date' | 'organic';
export const LONG_MON_VIEW_KEY = 'vmp.long-mon.view';
export function parseLongMonView(value: unknown): LongMonView {
  return value === 'organic' ? 'organic' : 'date';
}

export interface OrganicPlacement {
  xPct: number;
  yPct: number;
  rotateDeg: number;
  scale: number;
}

function seedOf(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

/** Presentation only. The chronological model remains the sole data authority.
 * A phyllotaxis spiral spreads fish like seeds on a flower: no deadline lanes,
 * no random jumps on re-render. Stable ID order also keeps keyboard navigation
 * independent of screen positions. The scene grows vertically for large sets. */
export function buildOrganicPlacements(fish: readonly LongMonRaceFish[]): Map<string, OrganicPlacement> {
  const ordered = [...fish].sort((a, b) => String(a.activity.id).localeCompare(String(b.activity.id), 'en'));
  const placements = new Map<string, OrganicPlacement>();
  ordered.forEach((item, index) => {
    const id = String(item.activity.id);
    const seed = seedOf(id);
    const radius = ordered.length === 1 ? 0 : Math.sqrt((index + .5) / ordered.length);
    const theta = index * Math.PI * (3 - Math.sqrt(5)) + .65;
    placements.set(id, {
      xPct: 48.5 + 40 * radius * Math.cos(theta),
      yPct: 54.5 + 30 * radius * Math.sin(theta),
      rotateDeg: (seed - .5) * 56,
      scale: .82 + seed * .28,
    });
  });
  return placements;
}
