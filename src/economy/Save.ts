import type { GoreMode } from '../fx/Effects';

export type Quality = 'low' | 'medium' | 'high';

export interface SaveData {
  v: 1;
  coins: number;
  ownedWeapons: string[];
  ownedThemes: string[];
  weapon: string;
  theme: string;
  settings: { volume: number; muted: boolean; gore: GoreMode; quality: Quality; autoQuality: boolean };
  stats: { hits: number; kills: number; severs: number; bestCombo: number };
  /** Progression: current boss level, player rank and XP into it, promotions (prestige). */
  bossLevel: number;
  rank: number;
  xp: number;
  promotions: number;
  /** Weapon upgrade tier (0-5) and knockouts scored with each weapon (mastery). */
  upgrades: Record<string, number>;
  mastery: Record<string, number>;
  /** Knockouts per arena. */
  kosByTheme: Record<string, number>;
}

export const SAVE_KEY = 'bossSmash.save.v1';

export function defaultSave(freeWeapons: string[], freeThemes: string[]): SaveData {
  return {
    v: 1,
    coins: 0,
    ownedWeapons: [...freeWeapons],
    ownedThemes: [...freeThemes],
    weapon: freeWeapons[0] ?? 'fists',
    theme: freeThemes[0] ?? 'office',
    settings: { volume: 0.8, muted: false, gore: 'red', quality: 'high', autoQuality: true },
    stats: { hits: 0, kills: 0, severs: 0, bestCombo: 0 },
    bossLevel: 1,
    rank: 1,
    xp: 0,
    promotions: 0,
    upgrades: {},
    mastery: {},
    kosByTheme: {},
  };
}

/** A string → integer map, clamped, with anything malformed dropped. */
function intMap(v: unknown, min: number, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x === 'number' && Number.isFinite(x) && k.length < 40) out[k] = Math.floor(Math.min(max, Math.max(min, x)));
  }
  return out;
}

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const num = (v: unknown, d: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;

/**
 * Parse and sanitise stored data. Anything missing or malformed falls back to defaults, and free
 * items are always owned, so a corrupt or old save can never brick the game.
 */
export function parseSave(raw: string | null, freeWeapons: string[], freeThemes: string[]): SaveData {
  const d = defaultSave(freeWeapons, freeThemes);
  if (!raw) return d;
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return d;
    o = parsed as Record<string, unknown>;
  } catch {
    return d;
  }
  const s = (o.settings ?? {}) as Record<string, unknown>;
  const st = (o.stats ?? {}) as Record<string, unknown>;
  const ownedWeapons = [...new Set([...freeWeapons, ...(isStrArr(o.ownedWeapons) ? o.ownedWeapons : [])])];
  const ownedThemes = [...new Set([...freeThemes, ...(isStrArr(o.ownedThemes) ? o.ownedThemes : [])])];
  return {
    v: 1,
    coins: Math.floor(num(o.coins, 0, 0, 1e9)),
    ownedWeapons,
    ownedThemes,
    weapon: typeof o.weapon === 'string' && ownedWeapons.includes(o.weapon) ? o.weapon : d.weapon,
    theme: typeof o.theme === 'string' && ownedThemes.includes(o.theme) ? o.theme : d.theme,
    settings: {
      volume: num(s.volume, d.settings.volume, 0, 1),
      muted: typeof s.muted === 'boolean' ? s.muted : false,
      gore: s.gore === 'green' || s.gore === 'off' || s.gore === 'red' ? s.gore : 'red',
      quality: s.quality === 'low' || s.quality === 'medium' || s.quality === 'high' ? s.quality : 'high',
      autoQuality: typeof s.autoQuality === 'boolean' ? s.autoQuality : true,
    },
    stats: {
      hits: Math.floor(num(st.hits, 0, 0)),
      kills: Math.floor(num(st.kills, 0, 0)),
      severs: Math.floor(num(st.severs, 0, 0)),
      bestCombo: Math.floor(num(st.bestCombo, 0, 0)),
    },
    bossLevel: Math.floor(num(o.bossLevel, 1, 1, 9999)),
    rank: Math.floor(num(o.rank, 1, 1, 999)),
    xp: num(o.xp, 0, 0, 1e9),
    promotions: Math.floor(num(o.promotions, 0, 0, 999)),
    upgrades: intMap(o.upgrades, 0, 5),
    mastery: intMap(o.mastery, 0, 1e9),
    kosByTheme: intMap(o.kosByTheme, 0, 1e9),
  };
}

/** Thin wrapper over localStorage that never throws (private mode, quota, disabled storage). */
export class SaveStore {
  data: SaveData;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly freeWeapons: string[],
    private readonly freeThemes: string[],
  ) {
    let raw: string | null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      raw = null;
    }
    this.data = parseSave(raw, freeWeapons, freeThemes);
  }

  /** Debounced write. */
  save(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush(): void {
    this.timer = null;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore: progress just won't persist in this browser.
    }
  }

  reset(): void {
    this.data = defaultSave(this.freeWeapons, this.freeThemes);
    this.flush();
  }
}
