/**
 * Die LV-Bevorzugung generischer Rezepte — der Kern des Fixes „LV-Rolle aktiv,
 * aber es lädt das generische Presserezept". Getestet gegen die ECHTEN
 * Registries (SKILLS, LANDESVERBAENDE): die Zuordnung ist abgeleitet, nicht
 * konfiguriert, also muss der Test dieselbe Ableitung sehen wie die Laufzeit.
 */
import {
  DISABLED_LV_AGENT_IDS,
  getSystemAgent,
  LANDESVERBAND_ENTRIES,
} from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

import {
  ownedLvDefaultRecipeMention,
  preferredLvRecipeMention,
  roleAwareDefaultRecipeMention,
} from './lvRecipePreference.js';

/** Die eine Rolle, die LV-Material freischaltet (vgl. recipeCatalog.vitest). */
const lgs = (bundesland: string) => ({
  ebene: 'land',
  rolle: 'Mitarbeiter*in Landesgeschäftsstelle',
  bundesland,
});

describe('preferredLvRecipeMention — Rollen-Pfad (generischer Agent)', () => {
  it('führt presse zur Partei-Variante des eigenen Landesverbands', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        activeRole: lgs('Bayern'),
        userLocale: 'de-DE',
      })
    ).toBe('presse-bayern-partei');
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        activeRole: lgs('Hessen'),
        userLocale: 'de-DE',
      })
    ).toBe('presse-hessen-partei');
  });

  it('führt instagram zur Insta-Variante des eigenen Landesverbands', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'instagram',
        activeRole: lgs('Bayern'),
        userLocale: 'de-DE',
      })
    ).toBe('insta-bayern');
  });

  it('lässt Rezepte ohne LV-Varianten in Ruhe (facebook, reel, …)', () => {
    for (const mention of ['facebook', 'twitter', 'linkedin', 'reel', 'wahlpruefstein']) {
      expect(
        preferredLvRecipeMention({ mention, activeRole: lgs('Bayern'), userLocale: 'de-DE' })
      ).toBeNull();
    }
  });

  it('steht ohne Landesgeschäftsstellen-Rolle still', () => {
    expect(
      preferredLvRecipeMention({ mention: 'presse', activeRole: null, userLocale: 'de-DE' })
    ).toBeNull();
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        activeRole: {
          ebene: 'land',
          rolle: 'Mitarbeiter*in Landtagsfraktion',
          bundesland: 'Bayern',
        },
        userLocale: 'de-DE',
      })
    ).toBeNull();
  });

  it('ignoriert gespeicherte, aber nicht aktive Rollen — „Ohne Rolle" heißt ohne LV-Vorzug', () => {
    // Die Hessen-LGS-Rolle steht im Profil, im Chat ist aber keine Rolle aktiv:
    // der Server reicht dann `activeRole: null` durch, nicht die Rollenliste.
    expect(
      preferredLvRecipeMention({ mention: 'presse', activeRole: null, userLocale: 'de-DE' })
    ).toBeNull();
    expect(
      roleAwareDefaultRecipeMention(
        { identifier: 'gruenerator-oeffentlichkeitsarbeit', defaultRecipeMention: 'presse' },
        { activeRole: null, userLocale: 'de-DE' }
      )
    ).toBe('presse');
  });

  it('lässt eine bereits LV-spezifische Mention unangetastet', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse-saarland',
        activeRole: lgs('Saarland'),
        userLocale: 'de-DE',
      })
    ).toBeNull();
  });
});

describe('preferredLvRecipeMention — Agenten-Pfad (LV-PR-Agent)', () => {
  it('bindet die Wahl an den LV-Agenten, unabhängig von der aktiven Rolle', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-oeffentlichkeitsarbeit-saarland',
        activeRole: null,
        userLocale: 'de-DE',
      })
    ).toBe('presse-saarland');
    // Hessen-Rolle auf dem Saarland-Agenten: der Agent gewinnt.
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-oeffentlichkeitsarbeit-saarland',
        activeRole: lgs('Hessen'),
        userLocale: 'de-DE',
      })
    ).toBe('presse-saarland');
  });

  it('fällt auf einem LV-Agenten ohne eigene Rezepte NICHT auf fremde Rollen zurück', () => {
    // Schleswig-Holstein hat keine eigenen Rezepte; eine Hessen-Rolle darf dem
    // SH-Agenten trotzdem keine hessischen Schreibvorgaben unterschieben.
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-oeffentlichkeitsarbeit-schleswig-holstein',
        activeRole: lgs('Hessen'),
        userLocale: 'de-DE',
      })
    ).toBeNull();
  });

  it('führt den AT-PR-Agenten zur österreichischen Presseaussendung', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-oeffentlichkeitsarbeit-at',
        activeRole: null,
        userLocale: 'de-AT',
      })
    ).toBe('presse-at');
  });

  it('lässt Nicht-LV-Agenten den Rollen-Pfad nehmen', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-universal',
        activeRole: lgs('Hessen'),
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
        { activeRole: lgs('Hessen'), userLocale: 'de-DE' }
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
        { activeRole: lgs('Bayern'), userLocale: 'de-DE' }
      )
    ).toBe('presse-hessen-partei');
  });

  it('liefert null ohne Default', () => {
    expect(
      roleAwareDefaultRecipeMention(
        { identifier: 'gruenerator-universal' },
        { activeRole: lgs('Hessen'), userLocale: 'de-DE' }
      )
    ).toBeNull();
  });

  it('lässt einen eigenen Custom-Default unangetastet — keine Rezept-Familie, keine LV-Umbiegung', () => {
    // Ein an einen Agenten gebundenes Custom-Rezept (Task 9) ist keine der
    // beiden LV-Familien (presse/instagram) — die Landesgeschäftsstellen-Rolle
    // darf es trotzdem nicht auf eine LV-Variante umbiegen.
    expect(
      roleAwareDefaultRecipeMention(
        { identifier: 'gruenerator-universal', defaultRecipeMention: 'omveinladungen' },
        { activeRole: lgs('Hessen'), userLocale: 'de-DE' }
      )
    ).toBe('omveinladungen');
  });
});

describe('preferredLvRecipeMention — Instanz-Tür', () => {
  // Die drei automatischen Türen laufen hier zusammen, und diese ist die
  // einzige, die eine Bestandsrolle nicht selbst schließt: wer die
  // Landesgeschäftsstellen-Rolle vor der Verengung angelegt hat, trägt sie
  // weiter — die Instanz muss die Umleitung trotzdem verweigern.
  it('biegt nicht auf eine Variante um, die die Instanz nicht führt', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        activeRole: lgs('Bayern'),
        userLocale: 'de-DE',
        instanceId: 'bgst',
      })
    ).toBeNull();
  });

  it('biegt auf Instanzen mit Landesverbänden weiterhin um', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        activeRole: lgs('Bayern'),
        userLocale: 'de-DE',
        instanceId: 'production',
      })
    ).toBe('presse-bayern-partei');
  });

  it('gilt auch auf dem LV-Agenten selbst', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-oeffentlichkeitsarbeit-bayern',
        activeRole: null,
        userLocale: 'de-DE',
        instanceId: 'bgst',
      })
    ).toBeNull();
  });
});

describe('preferredLvRecipeMention — Bürger*innen-Familie', () => {
  it('führt buergermail über die Rolle zur Variante des eigenen Landesverbands', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'buergermail',
        activeRole: lgs('Berlin'),
        userLocale: 'de-DE',
      })
    ).toBe('buerger-berlin');
  });

  it('bindet buergermail auf dem Bürger-Agenten an dessen Landesverband', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'buergermail',
        agentIdentifier: 'gruenerator-buergeranfragen-mecklenburg-vorpommern',
        activeRole: lgs('Hessen'),
        userLocale: 'de-DE',
      })
    ).toBe('buerger-mv');
  });

  it('führt auch auf dem Bürger-Agenten presse zur Presse-Variante desselben Verbands', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'presse',
        agentIdentifier: 'gruenerator-buergeranfragen-hessen',
        activeRole: null,
        userLocale: 'de-DE',
      })
    ).toBe('presse-hessen-partei');
  });

  it('biegt auf dem Agenten eines abgeschalteten Verbands nicht um', () => {
    expect(
      preferredLvRecipeMention({
        mention: 'buergermail',
        agentIdentifier: 'gruenerator-buergeranfragen-hamburg',
        activeRole: null,
        userLocale: 'de-DE',
      })
    ).toBeNull();
  });
});

describe('ownedLvDefaultRecipeMention', () => {
  // Die Regel ist abgeleitet („genau ein eigenes Rezept"), nicht deklariert.
  // Bekäme ein Bürger-Agent ein zweites Rezept, fiele das Vorladen still weg —
  // dieser Test macht das laut.
  it.each(
    LANDESVERBAND_ENTRIES.flatMap((lv) => [
      lv.buergerAgentId,
      lv.beschlussAgentId,
      lv.wahlprogrammAgentId,
    ])
      .filter((id): id is string => id !== undefined && !DISABLED_LV_AGENT_IDS.has(id))
      .map((id) => [id] as const)
  )('lädt auf %s vor', (id) => {
    const agent = getSystemAgent(id);
    expect(agent).toBeDefined();
    expect(ownedLvDefaultRecipeMention(agent ?? {})).toBe(agent?.defaultRecipeMention);
  });

  it('liefert das Rezept eines Ein-Rezept-LV-Agenten', () => {
    expect(
      ownedLvDefaultRecipeMention({
        identifier: 'gruenerator-buergeranfragen-berlin',
        defaultRecipeMention: 'buerger-berlin',
      })
    ).toBe('buerger-berlin');
  });

  it('lässt LV-PR-Agenten beim Selbstladen — sie führen mehr als ein Rezept', () => {
    expect(
      ownedLvDefaultRecipeMention({
        identifier: 'gruenerator-oeffentlichkeitsarbeit-saarland',
        defaultRecipeMention: 'presse-saarland',
      })
    ).toBeNull();
  });

  it('greift nicht, wenn der Default einem anderen Agenten gehört', () => {
    expect(
      ownedLvDefaultRecipeMention({
        identifier: 'gruenerator-wahlpruefsteine-berlin',
        defaultRecipeMention: 'wahlpruefstein',
      })
    ).toBeNull();
    expect(
      ownedLvDefaultRecipeMention({
        identifier: 'gruenerator-buergerservice',
        defaultRecipeMention: 'buergermail',
      })
    ).toBeNull();
  });

  it('greift nicht auf dem Agenten eines abgeschalteten Verbands', () => {
    expect(
      ownedLvDefaultRecipeMention({
        identifier: 'gruenerator-buergeranfragen-hamburg',
        defaultRecipeMention: 'buerger-hamburg',
      })
    ).toBeNull();
  });
});
