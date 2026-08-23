/**
 * Die LV-Bevorzugung generischer Rezepte — der Kern des Fixes „LV-Rolle aktiv,
 * aber es lädt das generische Presserezept". Getestet gegen die ECHTEN
 * Registries (SKILLS, LANDESVERBAENDE): die Zuordnung ist abgeleitet, nicht
 * konfiguriert, also muss der Test dieselbe Ableitung sehen wie die Laufzeit.
 */
import { describe, expect, it } from 'vitest';

import { preferredLvRecipeMention, roleAwareDefaultRecipeMention } from './lvRecipePreference.js';

/** Die eine Rolle, die LV-Material freischaltet (vgl. recipeCatalog.vitest). */
const lgs = (bundesland: string) => ({
  ebene: 'land',
  rolle: 'Mitarbeiter*in Landesgeschäftsstelle',
  bundesland,
});

describe('preferredLvRecipeMention — Rollen-Pfad (generischer Agent)', () => {
  it('führt presse zur Partei-Variante des eigenen Landesverbands', () => {
    expect(
      preferredLvRecipeMention({ mention: 'presse', roles: [lgs('Bayern')], userLocale: 'de-DE' })
    ).toBe('presse-bayern-partei');
    expect(
      preferredLvRecipeMention({ mention: 'presse', roles: [lgs('Hessen')], userLocale: 'de-DE' })
    ).toBe('presse-hessen-partei');
  });

  it('führt instagram zur Insta-Variante des eigenen Landesverbands', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'instagram',
        roles: [lgs('Bayern')],
        userLocale: 'de-DE',
      })
    ).toBe('insta-bayern');
  });

  it('lässt Rezepte ohne LV-Varianten in Ruhe (facebook, reel, …)', () => {
    for (const mention of ['facebook', 'twitter', 'linkedin', 'reel', 'wahlpruefstein']) {
      expect(
        preferredLvRecipeMention({ mention, roles: [lgs('Bayern')], userLocale: 'de-DE' })
      ).toBeNull();
    }
  });

  it('steht ohne Landesgeschäftsstellen-Rolle still', () => {
    expect(
      preferredLvRecipeMention({ mention: 'presse', roles: [], userLocale: 'de-DE' })
    ).toBeNull();
    expect(
      preferredLvRecipeMention({ mention: 'presse', roles: null, userLocale: 'de-DE' })
    ).toBeNull();
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        roles: [{ ebene: 'land', rolle: 'Mitarbeiter*in Landtagsfraktion', bundesland: 'Bayern' }],
        userLocale: 'de-DE',
      })
    ).toBeNull();
  });

  it('steht bei mehreren Landesverbänden still — die Wahl wäre geraten', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        roles: [lgs('Bayern'), lgs('Hessen')],
        userLocale: 'de-DE',
      })
    ).toBeNull();
  });

  it('lässt eine bereits LV-spezifische Mention unangetastet', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse-saarland',
        roles: [lgs('Saarland')],
        userLocale: 'de-DE',
      })
    ).toBeNull();
  });
});

describe('preferredLvRecipeMention — Agenten-Pfad (LV-PR-Agent)', () => {
  it('bindet die Wahl an den LV-Agenten, unabhängig von den Rollen', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-oeffentlichkeitsarbeit-saarland',
        roles: null,
        userLocale: 'de-DE',
      })
    ).toBe('presse-saarland');
    // Hessen-Rolle auf dem Saarland-Agenten: der Agent gewinnt.
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-oeffentlichkeitsarbeit-saarland',
        roles: [lgs('Hessen')],
        userLocale: 'de-DE',
      })
    ).toBe('presse-saarland');
  });

  it('fällt auf einem LV-Agenten ohne eigene Rezepte NICHT auf fremde Rollen zurück', () => {
    // Sachsen hat keine eigenen Rezepte; eine Hessen-Rolle darf dem
    // Sachsen-Agenten trotzdem keine hessischen Schreibvorgaben unterschieben.
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-oeffentlichkeitsarbeit-sachsen',
        roles: [lgs('Hessen')],
        userLocale: 'de-DE',
      })
    ).toBeNull();
  });

  it('führt den AT-PR-Agenten zur österreichischen Presseaussendung', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-oeffentlichkeitsarbeit-at',
        roles: null,
        userLocale: 'de-AT',
      })
    ).toBe('presse-at');
  });

  it('lässt Nicht-LV-Agenten den Rollen-Pfad nehmen', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-universal',
        roles: [lgs('Hessen')],
        userLocale: 'de-DE',
      })
    ).toBe('presse-hessen-partei');
  });
});

describe('roleAwareDefaultRecipeMention', () => {
  it('macht den generischen Default des generischen PR-Agenten LV-bewusst', () => {
    expect(
      roleAwareDefaultRecipeMention(
        { identifier: 'gruenerator-oeffentlichkeitsarbeit', defaultRecipeMention: 'presse' },
        { userRoles: [lgs('Hessen')], userLocale: 'de-DE' }
      )
    ).toBe('presse-hessen-partei');
  });

  it('lässt kuratierte LV-Defaults unverändert passieren', () => {
    expect(
      roleAwareDefaultRecipeMention(
        {
          identifier: 'gruenerator-oeffentlichkeitsarbeit-hessen',
          defaultRecipeMention: 'presse-hessen-partei',
        },
        { userRoles: [lgs('Bayern')], userLocale: 'de-DE' }
      )
    ).toBe('presse-hessen-partei');
  });

  it('liefert null ohne Default', () => {
    expect(
      roleAwareDefaultRecipeMention(
        { identifier: 'gruenerator-universal' },
        { userRoles: [lgs('Hessen')], userLocale: 'de-DE' }
      )
    ).toBeNull();
  });
});
