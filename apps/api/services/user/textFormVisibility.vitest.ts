/**
 * Precedence when the same mention resolves to more than one visible row —
 * own, then group, then public — with a deterministic tie-break; und die Frage
 * daneben, ob eine Zeile überhaupt als eigener Eintrag aufgezählt wird.
 *
 * Run with: cd apps/api && npx vitest run services/user/textFormVisibility.vitest.ts
 */
import { describe, expect, it } from 'vitest';

import {
  isListableTextForm,
  pickVisibleTextForm,
  type TextFormAccess,
} from './textFormVisibility.js';

const USER = 'user-1';

interface Row {
  id: string;
  user_id: string;
  created_at: Date | string;
  access: TextFormAccess;
}

function row(id: string, userId: string, access: TextFormAccess, createdAt: string): Row {
  return { id, user_id: userId, access, created_at: createdAt };
}

describe('pickVisibleTextForm', () => {
  it('prefers own over group and public, regardless of row order', () => {
    const own = row('own-1', USER, 'own', '2026-01-01T00:00:00Z');
    const group = row('group-1', 'other-user', 'group', '2026-01-01T00:00:00Z');
    const pub = row('public-1', 'other-user', 'public', '2026-01-01T00:00:00Z');

    expect(pickVisibleTextForm([group, pub, own], USER)).toBe(own);
    expect(pickVisibleTextForm([pub, own, group], USER)).toBe(own);
  });

  it('prefers group over public when there is no own row', () => {
    const group = row('group-1', 'other-user', 'group', '2026-01-01T00:00:00Z');
    const pub = row('public-1', 'other-user', 'public', '2026-01-01T00:00:00Z');

    expect(pickVisibleTextForm([pub, group], USER)).toBe(group);
  });

  it('breaks a tie within the same access level by created_at ascending', () => {
    const older = row('public-a', 'other-user', 'public', '2026-01-01T00:00:00Z');
    const newer = row('public-b', 'other-user', 'public', '2026-02-01T00:00:00Z');

    expect(pickVisibleTextForm([newer, older], USER)).toBe(older);
  });

  it('breaks a tie on equal created_at by id ascending', () => {
    const a = row('a', 'other-user', 'public', '2026-01-01T00:00:00Z');
    const b = row('b', 'other-user', 'public', '2026-01-01T00:00:00Z');

    expect(pickVisibleTextForm([b, a], USER)).toBe(a);
  });

  it('returns undefined for an empty list', () => {
    expect(pickVisibleTextForm([], USER)).toBeUndefined();
  });
});

/**
 * Die Regel, an der Mention-Menü und Rezept-Katalog gemeinsam hängen. Sie sass
 * bis zur Vereinheitlichung als Bedingung in zwei Abfragen und war damit nur
 * mit Postgres prüfbar — genau der Grund, warum sie zwischen den beiden schon
 * einmal auseinanderlief (#2937).
 */
describe('isListableTextForm', () => {
  it('zählt eine eigene Textform auf', () => {
    expect(isListableTextForm('custom', 'omveinladungen')).toBe(true);
  });

  it('lässt ein Preset weg, das den Rumpf eines Systemrezepts ersetzt', () => {
    // `@presse` steht im Menü als Rezept; die angelernte Zeile füllt es aus und
    // darf nicht mit ihrem eigenen Titel danebenstehen.
    expect(isListableTextForm('preset', 'presse')).toBe(false);
  });

  it('zählt `antrag` auf — ein Preset ohne mitgeliefertes Rezept', () => {
    // Es überschreibt nichts, also wäre es sonst auf keinem Pfad erreichbar.
    expect(isListableTextForm('preset', 'antrag')).toBe(true);
  });

  it('lässt einen Rezept-Stil auf einer Landesverbands-Mention weg', () => {
    expect(isListableTextForm('recipe', 'presse-bayern-partei')).toBe(false);
  });

  it('zählt eine eigene Textform auch dann auf, wenn die Mention ein Rezept kennt', () => {
    // `kind` entscheidet zuerst: eine Custom-Zeile ist immer ihr eigener
    // Eintrag. Kollidieren kann sie nicht — `resolveTextFormKind` lässt eine
    // Custom-Mention auf einer Rezept-Mention gar nicht erst entstehen.
    expect(isListableTextForm('custom', 'presse')).toBe(true);
  });
});
