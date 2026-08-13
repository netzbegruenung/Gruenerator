/**
 * Vertrags-Guard zwischen Better Auth und `userProfileSchema`.
 *
 * Der Ausfall, der diesen Test erzwungen hat: `ai_consent_at` stand in
 * `additionalFields` als `{ type: 'date' }` über einer TIMESTAMPTZ-Spalte,
 * `session.user.ai_consent_at` war also ein `Date`. `userProfileSchema`
 * forderte `z.string()`. Ergebnis: `toBetterAuthUser()` warf ZodError für jede
 * Person MIT erteilter Einwilligung, der Silent-Catch in `resolveSession`
 * machte daraus `kind: 'unavailable'`, und der Server antwortete auf JEDER
 * Route mit 503.
 *
 * Warum `authBoundary.vitest.ts` das nicht fand: dort steht jedes Fixture von
 * Hand da und ist gegen `UserProfile` typisiert — also gegen den OUTPUT-Typ des
 * Schemas, das geprüft werden soll. Ein Fixture, das seinen Typ vom Prüfling
 * bekommt, kann ihm nie widersprechen; `ai_consent_at: new Date()` wäre dort
 * ein Compilerfehler gewesen. Der Fehler saß zwischen zwei Deklarationen, die
 * nichts voneinander wussten.
 *
 * Dieser Test liest deshalb keine Fixtures, sondern beide Deklarationen selbst
 * und hält sie gegeneinander. Er deckt damit auch jedes künftig ergänzte Feld
 * ab, ohne dass jemand daran denken muss.
 */

import { userProfileSchema } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';
import { type z } from 'zod';

import { USER_ADDITIONAL_FIELDS } from './betterAuthUserFields.js';

/**
 * Felder, die Better Auth führt, `userProfileSchema` aber bewusst NICHT kennt.
 * `z.object` wirft unbekannte Schlüssel still weg — ohne diese Liste würde ein
 * neues Feld einfach lautlos nie beim Client ankommen.
 *
 * Ein neues `additionalField` MUSS eine Entscheidung erzwingen: entweder ins
 * Schema (dann prüft der Typtest es automatisch mit) oder hierher.
 */
const NOT_IN_PROFILE_SCHEMA = new Set([
  'auth_source', // interne Herkunftsmarkierung, nie an den Client
  'custom_antrag_gliederung',
  'presseabbinder',
  'document_mode',
  'profile_image',
  'deutschlandmodus',
  'groups',
  'content_management',
  'sites',
  'website',
  'ai_sharepic',
]);

/**
 * Ein für den deklarierten Better-Auth-Typ repräsentativer Laufzeitwert — das,
 * was der Adapter für dieses Feld tatsächlich in `session.user` legt.
 */
const SAMPLE_FOR_TYPE = {
  string: 'x',
  boolean: true,
  number: 1,
  date: new Date('2026-01-01T00:00:00.000Z'),
} as const;

/** Minimale Pflichtfelder, damit der Parse nicht an fremden Pfaden scheitert. */
const BASE_INPUT = {
  id: 'user-contract-guard',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

const schemaKeys = new Set(Object.keys(userProfileSchema.shape));

/**
 * Beanstandungen, die eine echte Typunverträglichkeit belegen — nicht bloß
 * einen unpassenden Beispielwert.
 *
 * `invalid_type` zählt immer: der Wert hat die falsche Laufzeitklasse.
 * `invalid_union` zählt nur für nicht-String-Typen. Bei `string` ist unser
 * Beispielwert `'x'` willkürlich, und Enum-Felder wie `default_startpage` oder
 * `chat_background` melden dann zu Recht einen ungültigen WERT — das ist kein
 * Vertragsbruch und darf den Test nicht rot färben.
 */
function typeIssuesFor(field: string, baType: keyof typeof SAMPLE_FOR_TYPE) {
  const result = userProfileSchema.safeParse({
    ...BASE_INPUT,
    [field]: SAMPLE_FOR_TYPE[baType],
  });
  if (result.success) return [];
  return result.error.issues.filter(
    (issue: z.ZodIssue) =>
      issue.path[0] === field &&
      (issue.code === 'invalid_type' || (issue.code === 'invalid_union' && baType !== 'string'))
  );
}

const sharedFields = Object.entries(USER_ADDITIONAL_FIELDS).filter(([name]) =>
  schemaKeys.has(name)
);

describe('Better Auth additionalFields ↔ userProfileSchema', () => {
  it.each(sharedFields)('%s: der deklarierte Better-Auth-Typ parst sauber', (name, config) => {
    const baType = config.type as keyof typeof SAMPLE_FOR_TYPE;
    expect(SAMPLE_FOR_TYPE).toHaveProperty(baType);

    const issues = typeIssuesFor(name, baType);
    expect(
      issues,
      `additionalFields.${name} ist \`type: '${baType}'\`, userProfileSchema akzeptiert diesen ` +
        `Laufzeittyp aber nicht: ${JSON.stringify(issues)}. Entweder das Schema erweitern ` +
        `(z. B. \`z.union([z.string(), z.date()])\`) oder den Better-Auth-Typ korrigieren.`
    ).toEqual([]);
  });

  it('kennt jedes additionalField — entweder im Schema oder bewusst ausgenommen', () => {
    const untriaged = Object.keys(USER_ADDITIONAL_FIELDS).filter(
      (name) => !schemaKeys.has(name) && !NOT_IN_PROFILE_SCHEMA.has(name)
    );
    expect(
      untriaged,
      'Neues additionalField ohne Entscheidung: entweder in userProfileSchema aufnehmen ' +
        '(dann wird es hier automatisch typgeprüft) oder in NOT_IN_PROFILE_SCHEMA eintragen. ' +
        'Solange es in keinem von beidem steht, wirft z.object es still weg.'
    ).toEqual([]);
  });

  it('hat keine veralteten Einträge in NOT_IN_PROFILE_SCHEMA', () => {
    const stale = [...NOT_IN_PROFILE_SCHEMA].filter(
      (name) => schemaKeys.has(name) || !(name in USER_ADDITIONAL_FIELDS)
    );
    expect(
      stale,
      'Eintrag steht inzwischen im Schema oder gar nicht mehr in additionalFields — entfernen.'
    ).toEqual([]);
  });

  it('deckt ai_consent_at ab (der Fall, der 503 auslöste)', () => {
    // Explizit gepinnt, damit der Regressionsfall auch dann sichtbar bleibt,
    // wenn jemand die generische Schleife umbaut.
    expect(USER_ADDITIONAL_FIELDS.ai_consent_at.type).toBe('date');
    expect(typeIssuesFor('ai_consent_at', 'date')).toEqual([]);
  });
});
