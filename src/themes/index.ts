import type { ThemeDef } from './Theme';
import { office } from './office';
import { warehouse, boxingRing, kitchen, lab } from './indoor';
import { rooftop, beach, space } from './outdoor';

/** All arenas in shop order. */
export const THEMES: ThemeDef[] = [office, warehouse, boxingRing, kitchen, rooftop, lab, beach, space];

export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? office;
}
