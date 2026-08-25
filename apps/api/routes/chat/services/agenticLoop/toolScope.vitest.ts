import { describe, it, expect } from 'vitest';

import { createToolScope, DEFERRABLE_GROUPS } from './toolScope.js';

const PERSONAL = DEFERRABLE_GROUPS[0].tools;
const LOADER = DEFERRABLE_GROUPS[0].loaderTool;

/** Ein realistischer Katalog: Recherche-Familie + die persönliche Gruppe. */
const MOUNTED = [
  'gruenerator_search',
  'web_search',
  'scrape_url',
  'summarize',
  'umfragen',
  ...PERSONAL,
];

const scopeFor = (userText: string) => createToolScope({ toolNames: MOUNTED, userText });

describe('createToolScope — wann die Gruppe zu bleibt', () => {
  // Der Turn spricht NICHT über eigene Inhalte → Gruppe zurückgestellt.
  const geschlossen = [
    'Was steht im Wahlprogramm zu Windkraft?',
    'Fasse mir die Debatte zum Heizungsgesetz zusammen',
    'Schreib eine Pressemitteilung zum Radentscheid',
    'Wer ist Bundesministerin für Umwelt?',
    'Wie hoch war die Wahlbeteiligung 2025?',
    'Mach ein Sharepic zum Tempolimit',
    // Erstellen ist kein Abrufen: `create_document` ist ohnehin montiert.
    'Schreib mir ein Dokument über Windkraft',
    '',
  ];
  // Der Turn spricht über eigene Inhalte → Gruppe von Anfang an offen.
  const offen = [
    'Welche Aufgaben stehen auf meinem Board?',
    'Zeig mir meine Dokumente zum Thema Verkehr',
    'Leg das in mein Notizbuch',
    'Was liegt in meinen Projekten?',
    'Welche Sharepics habe ich schon gemacht?',
    'Durchsuche meine früheren Unterhaltungen nach dem Haushaltsbeschluss',
    'Welche Dokumente habe ich zu Windkraft?',
    'Zeig unsere Gruppe an',
    'meine Notizbücher bitte',
    // Live am 25.08.2026 daneben gegangen, bevor das Tor zwei Wortklassen
    // unterschied: der Planer suchte im Web bzw. ERFAND die Antwort, statt den
    // Lader zu rufen. Siehe scripts/probeToolScopeRecall.ts.
    'Zeig mir die Aufgabe zum Radentscheid',
    'Welche Notizbücher gibt es?',
    'Öffne das Dokument Haushaltsrede',
    'Leg eine Karte auf das Klimaboard',
    // Selbstbezug ohne Substantiv. Hier erfand der Planer eine FEHLANZEIGE
    // ("Ich sehe keine offenen Aufgaben für dich") — die teuerste Ausfallform.
    'Steht da noch was Offenes für mich drin?',
    'Ich suche was, das ich neulich abgelegt hatte',
  ];

  // Fehlalarme, die wir bewusst in Kauf nehmen: sie kosten den vollen Katalog,
  // nie eine Fähigkeit. Hier festgehalten, damit niemand sie für Absicht hält
  // und damit ihr Wachsen auffällt.
  const fehlalarme = [
    'Welche Aufgaben hat die Bundesregierung?',
    'Zeig mir die Inhalte des Koalitionsvertrags',
    // "board" öffnet allein — der Preis dafür, dass "Welche Notizbücher gibt
    // es?" nicht mehr erfunden wird. Erstellen bräuchte die Gruppe nicht.
    'Erstelle ein Board für die Kampagne',
  ];

  it.each(fehlalarme)('öffnet zu grosszügig (bekannt, kostet nur Tokens): %j', (text) => {
    expect(scopeFor(text).activeTools()).toBeUndefined();
  });

  it.each(geschlossen)('stellt zurück: %j', (text) => {
    const active = scopeFor(text).activeTools();
    expect(active).toBeDefined();
    for (const t of PERSONAL) expect(active).not.toContain(t);
    // Der Rückweg bleibt IMMER offen — sonst wäre ein Fehlschluss ein
    // Fähigkeitsverlust statt eines zusätzlichen Schritts.
    expect(active).toContain(LOADER);
    expect(active).toContain('gruenerator_search');
  });

  it.each(offen)('lässt offen: %j', (text) => {
    // `undefined` heisst "kein Eingriff": alle montierten Werkzeuge gehen mit.
    expect(scopeFor(text).activeTools()).toBeUndefined();
  });

  it('montiert den Lader nur, solange die Gruppe zu ist', () => {
    expect(Object.keys(scopeFor('Was steht im Wahlprogramm?').loaderTools())).toEqual([LOADER]);
    expect(Object.keys(scopeFor('Zeig mir meine Dokumente').loaderTools())).toEqual([]);
  });
});

describe('createToolScope — der Rückweg', () => {
  it('öffnet die Gruppe für alle folgenden Schritte', () => {
    const scope = scopeFor('Was steht im Wahlprogramm zu Windkraft?');
    expect(scope.activeTools()).not.toContain('boards_tasks');

    scope.open('meine_inhalte');

    // Nichts mehr zurückgestellt → kein Eingriff mehr, alles geht mit.
    expect(scope.activeTools()).toBeUndefined();
    expect(scope.deferredToolNames()).toEqual([]);
  });

  it('öffnet die Gruppe, wenn das Modell den Lader ruft', async () => {
    const scope = scopeFor('Was steht im Wahlprogramm zu Windkraft?');
    const loader = scope.loaderTools()[LOADER] as {
      execute: (i: unknown, o: unknown) => Promise<unknown>;
    };

    const out = (await loader.execute({}, { toolCallId: 'c1' })) as { geoeffnet: boolean };

    expect(out.geoeffnet).toBe(true);
    expect(scope.activeTools()).toBeUndefined();
  });
});

describe('createToolScope — eine @-Erwähnung schlägt das Tor', () => {
  // Das Label der Erwähnung ("@[Meine Dokumente](tool:documents)") ist aus
  // `lastUserTextNoMentions` entfernt, das Tor sieht die Absicht also nie.
  // Gleichzeitig erzwingt `pinnedFirstTool` genau dieses Werkzeug auf Schritt 0.
  it('öffnet die Gruppe, in der das festgezurrte Werkzeug liegt', () => {
    const scope = createToolScope({
      toolNames: MOUNTED,
      userText: 'fass das mal zusammen',
      pinnedTool: 'documents',
    });
    expect(scope.activeTools()).toBeUndefined();
  });

  it('lässt die Gruppe zu, wenn das festgezurrte Werkzeug woanders liegt', () => {
    const scope = createToolScope({
      toolNames: MOUNTED,
      userText: 'fass das mal zusammen',
      pinnedTool: 'web_search',
    });
    expect(scope.activeTools()).not.toContain('documents');
  });
});

describe('createToolScope — was NICHT montiert ist, gibt es hier nicht', () => {
  it('stellt nichts zurück, wenn die Gruppe diesen Turn gar nicht montiert ist', () => {
    // Der Fall "enabledTools hat die persönlichen Werkzeuge abgeschaltet".
    const scope = createToolScope({
      toolNames: ['gruenerator_search', 'web_search'],
      userText: 'Was steht im Wahlprogramm zu Windkraft?',
    });
    expect(scope.activeTools()).toBeUndefined();
    expect(Object.keys(scope.loaderTools())).toEqual([]);
  });

  it('nennt nur montierte Namen — activeTools darf nichts erfinden', () => {
    const scope = createToolScope({
      toolNames: ['gruenerator_search', 'documents', 'media'],
      userText: 'Was steht im Wahlprogramm zu Windkraft?',
    });
    expect(scope.activeTools()).toEqual(['gruenerator_search', LOADER]);
  });
});
