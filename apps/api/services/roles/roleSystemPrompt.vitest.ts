import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = { INTERN_CONTENT_DIR: undefined as string | undefined };
vi.mock('../../config/env.js', () => ({
  get env() {
    return envMock;
  },
}));

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = mkdtempSync(resolve(tmpdir(), 'rollen-'));
  mkdirSync(resolve(dir, 'rollen'));
  envMock.INTERN_CONTENT_DIR = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeBaustein(key: string, body: string) {
  writeFileSync(resolve(dir, 'rollen', `${key}.md`), body, 'utf8');
}

async function load() {
  return import('./roleSystemPrompt.js');
}

describe('resolveRoleSystemPrompt', () => {
  it('composes baustein, context and register line', async () => {
    writeBaustein('mdb-buero', 'Du arbeitest im Bundestagsbüro {{partyNameGenitive}}.');
    const { resolveRoleSystemPrompt } = await load();

    const prompt = resolveRoleSystemPrompt(
      {
        ebene: 'bund',
        rolle: 'Mitarbeiter*in MdB-Büro',
        bundesland: 'Nordrhein-Westfalen',
        abgeordnete: 'Katharina Dröge',
      },
      'de-DE'
    );

    expect(prompt).toBe(
      'Du arbeitest im Bundestagsbüro von Bündnis 90/Die Grünen.\n\n' +
        'Dein Kontext: Ebene Bund, Nordrhein-Westfalen, Büro von Katharina Dröge.\n\n' +
        'Schreibe auf Deutsch, in der Du-Form, mit Genderstern.'
    );
  });

  it('resolves the party placeholder for Austria', async () => {
    writeBaustein('at-gemeinderaetin', 'Du bist Gemeinderät*in für {{partyName}}.');
    const { resolveRoleSystemPrompt } = await load();

    const prompt = resolveRoleSystemPrompt(
      { ebene: 'gemeinde', rolle: 'Gemeinderät*in', gliederung: 'Innsbruck' },
      'de-AT'
    );

    expect(prompt).toContain('Die Grünen – Die Grüne Alternative');
    expect(prompt).toContain('Dein Kontext: Gemeinde Innsbruck.');
    expect(prompt).not.toContain('{{');
  });

  // Dieselbe Bezeichnung, zwei Gremien — der Ebenen-Schlüssel geht vor.
  it('picks the level-specific baustein for Ratsmitglied', async () => {
    writeBaustein('kreistagsmitglied', 'Kreistag.');
    writeBaustein('ratsmitglied', 'Gemeinderat.');
    const { resolveRoleSystemPrompt } = await load();

    expect(
      resolveRoleSystemPrompt({ ebene: 'kreisverband', rolle: 'Ratsmitglied' }, 'de-DE')
    ).toContain('Kreistag.');
    expect(
      resolveRoleSystemPrompt({ ebene: 'ortsverband', rolle: 'Ratsmitglied' }, 'de-DE')
    ).toContain('Gemeinderat.');
  });

  it('appends the role-specific instruction the user typed', async () => {
    writeBaustein('ortsverband', 'Ortsverband.');
    const { resolveRoleSystemPrompt } = await load();

    const prompt = resolveRoleSystemPrompt(
      {
        ebene: 'ortsverband',
        rolle: 'Mitarbeiter*in Ortsverband',
        instructions: 'Immer mit Terminhinweis.',
      },
      'de-DE'
    );

    expect(prompt).toContain('Außerdem gilt: Immer mit Terminhinweis.');
  });

  it('returns null for a freely typed role — no catalogue entry', async () => {
    const { resolveRoleSystemPrompt } = await load();
    expect(
      resolveRoleSystemPrompt({ ebene: 'bund', rolle: 'Hoftrompeter*in' }, 'de-DE')
    ).toBeNull();
  });

  it('returns null when the private directory was never rolled out', async () => {
    const { resolveRoleSystemPrompt } = await load();
    expect(
      resolveRoleSystemPrompt({ ebene: 'bund', rolle: 'Mitarbeiter*in MdB-Büro' }, 'de-DE')
    ).toBeNull();
  });
});

describe('findRole', () => {
  it('matches on level and label together', async () => {
    const { findRole } = await load();
    const roles = [
      { ebene: 'kreisverband', rolle: 'Presse & Social-Media' },
      { ebene: 'ortsverband', rolle: 'Presse & Social-Media' },
    ];

    expect(findRole(roles, { ebene: 'ortsverband', rolle: 'Presse & Social-Media' })).toBe(
      roles[1]
    );
    expect(findRole(roles, { ebene: 'bund', rolle: 'Presse & Social-Media' })).toBeNull();
  });
});
