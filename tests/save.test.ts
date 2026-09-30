import { describe, it, expect } from 'vitest';
import { parseSave, defaultSave } from '../src/economy/Save';

const FREE_W = ['fists', 'bat'];
const FREE_T = ['office'];

describe('parseSave', () => {
  it('returns defaults for missing or corrupt data', () => {
    expect(parseSave(null, FREE_W, FREE_T)).toEqual(defaultSave(FREE_W, FREE_T));
    expect(parseSave('{not json', FREE_W, FREE_T)).toEqual(defaultSave(FREE_W, FREE_T));
    expect(parseSave('42', FREE_W, FREE_T)).toEqual(defaultSave(FREE_W, FREE_T));
  });

  it('keeps valid progress and always includes free items', () => {
    const s = parseSave(JSON.stringify({ coins: 1234.9, ownedWeapons: ['katana'], ownedThemes: ['beach'], weapon: 'katana', theme: 'beach' }), FREE_W, FREE_T);
    expect(s.coins).toBe(1234);
    expect(s.ownedWeapons).toEqual(expect.arrayContaining(['fists', 'bat', 'katana']));
    expect(s.ownedThemes).toEqual(expect.arrayContaining(['office', 'beach']));
    expect(s.weapon).toBe('katana');
    expect(s.theme).toBe('beach');
  });

  it('rejects tampered or invalid values', () => {
    const s = parseSave(
      JSON.stringify({
        coins: -50,
        ownedWeapons: 'everything',
        weapon: 'rocket',
        theme: 'space',
        settings: { volume: 9, gore: 'purple', quality: 'ultra', muted: 'yes' },
        stats: { kills: 'many' },
      }),
      FREE_W,
      FREE_T,
    );
    expect(s.coins).toBe(0);
    expect(s.ownedWeapons).toEqual(FREE_W);
    expect(s.weapon).toBe('fists'); // not owned → default
    expect(s.theme).toBe('office');
    expect(s.settings).toEqual({ volume: 1, muted: false, gore: 'red', quality: 'high', autoQuality: true });
    expect(s.stats.kills).toBe(0);
  });

  it('adds progression to old saves and sanitises it', () => {
    const old = parseSave(JSON.stringify({ coins: 10 }), FREE_W, FREE_T);
    expect(old.bossLevel).toBe(1);
    expect(old.rank).toBe(1);
    expect(old.xp).toBe(0);
    expect(old.promotions).toBe(0);
    expect(old.upgrades).toEqual({});
    const s = parseSave(
      JSON.stringify({ bossLevel: 0, rank: -3, xp: 'lots', promotions: 2.7, upgrades: { katana: 9, bat: 2, x: 'no' }, mastery: [1, 2], kosByTheme: { office: 4 } }),
      FREE_W,
      FREE_T,
    );
    expect(s.bossLevel).toBe(1);
    expect(s.rank).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.promotions).toBe(2);
    expect(s.upgrades).toEqual({ katana: 5, bat: 2 });
    expect(s.mastery).toEqual({});
    expect(s.kosByTheme).toEqual({ office: 4 });
  });
});
