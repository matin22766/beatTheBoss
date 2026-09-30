import type { WeaponDef } from './types';
import { models } from './models';

export const WEAPONS: WeaponDef[] = [
  {
    id: 'fists',
    name: 'Fists',
    category: 'blunt',
    archetype: 'melee',
    icon: '🥊',
    price: 0,
    damage: 9,
    type: 'blunt',
    impulse: 28,
    cooldown: 0.12,
    auto: true,
    sound: 'whoosh',
    hitSound: 'punch',
    model: models.glove,
    opts: { swing: 'jab', reach: 0.12 },
  },
];

export function weaponById(id: string): WeaponDef {
  const w = WEAPONS.find((d) => d.id === id);
  if (!w) throw new Error(`Unknown weapon ${id}`);
  return w;
}
