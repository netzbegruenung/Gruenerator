/**
 * Die Naht zwischen Anfrage und Graph-Zustand.
 *
 * Der Fehler, den es hier zu verhindern gilt, ist nicht „falsch gerechnet",
 * sondern „gar nicht weitergereicht": `currentBoard` stand im Vertrag, wurde
 * validiert, vom Router gelesen — und `buildStreamContext` gab es nie an
 * `initializeChatState`. Der Board-Chat war dadurch monatelang komplett tot
 * (Klassifikator-Schnellbahn blind, `edit_document` ohne Ziel), und KEINE
 * Prüfebene konnte das sehen:
 *
 *  - Typen nicht: ein weggelassenes optionales Feld ist typkorrekt.
 *  - Zod nicht: der Vertrag beschreibt die Leitung, nicht ihre Verwendung.
 *  - Die Einheitentests beider Enden nicht: sie bauen den Zustand von Hand
 *    (`{ currentBoard: … } as ChatGraphState`) und prüfen damit genau die
 *    Annahme, die live falsch war.
 *
 * Der Wächter unten schliesst die Lücke von aussen: WELCHE Felder der Vertrag
 * führt, steht im Vertrag; WELCHE davon der Zustand kennt, steht in
 * `ChatGraph.ts`; ob sie übergeben werden, steht in `streamContext.ts`. Der
 * Schnitt dieser drei Mengen ist die Zusicherung.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chatGraphContract } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * Feldnamen, die auf dem Weg umbenannt werden. Ohne diese Tabelle fielen sie
 * aus dem Mengenschnitt und wären ungewacht — genau die Sorte Feld, bei der
 * eine Verwechslung am wahrscheinlichsten ist.
 */
const RENAMES: Record<string, string> = {
  webpageUrls: 'attachedWebpageUrls',
  platform: 'clientPlatform',
};

/**
 * Vertragsfelder, die den Zustand bewusst NICHT erreichen — sie werden im
 * Router oder beim Aufbau des Kontexts verbraucht (`attachments` wird zu
 * `imageAttachments`/`attachmentContext` verarbeitet, `roleRef`/`roleName`
 * werden zu `customSystemPrompt` aufgelöst, `currentSharepic`/`currentReel`/
 * `currentSocialPost` bedienen die Verfeinerungs-Pfade im Router).
 *
 * Die Liste ist bewusst NICHT der Ort, an dem man ein vergessenes Feld
 * stillstellt: sie greift nur für Felder, die `initializeChatState` gar nicht
 * entgegennimmt. Sobald `ChatGraphInput` ein Feld kennt, muss es übergeben
 * werden — dann hilft kein Eintrag hier.
 */
const CONSUMED_BEFORE_THE_STATE = new Set<string>([]);

function contractBodyKeys(): string[] {
  const body = chatGraphContract.stream.body as unknown as { shape: Record<string, unknown> };
  return Object.keys(body.shape);
}

/** Alle `input.X`, die `initializeChatState` liest — die Felder, die der
 *  Zustand überhaupt entgegennimmt. */
function stateInputKeys(): Set<string> {
  const src = read('../../../agents/langgraph/ChatGraph/ChatGraph.ts');
  return new Set([...src.matchAll(/input\.([a-zA-Z_]\w*)/g)].map((m) => m[1]));
}

/**
 * Das Objektliteral, das `streamContext` an `initializeChatState` übergibt —
 * je Schlüssel der Quelltext seines Wertes (Kurzschreibweise ergibt '').
 */
function handedOverProps(): Map<string, string> {
  const src = read('./streamContext.ts');
  const call = src.indexOf('initializeChatState({');
  expect(call, 'initializeChatState-Aufruf in streamContext.ts nicht gefunden').toBeGreaterThan(-1);
  let depth = 0;
  let end = call;
  for (let i = src.indexOf('{', call); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const literal = src.slice(call, end);
  const heads = [...literal.matchAll(/^ {4}([a-zA-Z_]\w*)\s*[,:]/gm)];
  const props = new Map<string, string>();
  heads.forEach((head, i) => {
    const slice = literal.slice(head.index, i + 1 < heads.length ? heads[i + 1].index : undefined);
    props.set(
      head[1],
      slice
        .replace(/\/\/.*$/gm, '')
        .replace(/^ {4}\w+\s*:?/, '')
        .replace(/,\s*$/, '')
        .trim()
    );
  });
  return props;
}

const handedOverKeys = (): Set<string> => new Set(handedOverProps().keys());

describe('Anfrage → Graph-Zustand: jedes Feld, das der Zustand kennt, wird übergeben', () => {
  it('reicht jedes gemeinsame Vertragsfeld an initializeChatState weiter', () => {
    const inputKeys = stateInputKeys();
    const handed = handedOverKeys();

    const missing = contractBodyKeys()
      .filter((key) => !CONSUMED_BEFORE_THE_STATE.has(key))
      .map((key) => ({ key, stateKey: RENAMES[key] ?? key }))
      .filter(({ stateKey }) => inputKeys.has(stateKey))
      .filter(({ stateKey }) => !handed.has(stateKey))
      .map(({ key, stateKey }) => (key === stateKey ? key : `${key} → ${stateKey}`));

    expect(
      missing,
      'Diese Felder kommen im Body an und der Graph-Zustand kennt sie — aber ' +
        'buildStreamContext übergibt sie nicht an initializeChatState. Genau so ' +
        'starb der Board-Chat (currentBoard). Entweder übergeben, oder — falls ' +
        'der Router sie allein verbraucht — aus ChatGraphInput entfernen.'
    ).toEqual([]);
  });

  it('nimmt den Wert aus dem gleichnamigen Feld, nicht aus dem Nachbarn', () => {
    // Die zweite Hälfte desselben Fehlers: übergeben, aber das Falsche
    // (`currentBoard: rawCurrentDocument`). Der Mengenschnitt oben sieht nur
    // den Schlüssel; hier muss der WERT den Namen des Vertragsfeldes nennen.
    // Kurzschreibweise (`wolkeFiles,`) ist per Definition in Ordnung.
    const props = handedOverProps();
    const inputKeys = stateInputKeys();
    const mismatched = contractBodyKeys()
      .map((key) => ({ key, stateKey: RENAMES[key] ?? key }))
      .filter(({ stateKey }) => inputKeys.has(stateKey) && props.has(stateKey))
      .filter(({ key, stateKey }) => {
        const value = props.get(stateKey)!;
        return value !== '' && !value.toLowerCase().includes(key.toLowerCase());
      })
      .map(({ key, stateKey }) => `${stateKey} := ${props.get(stateKey)} (erwartet: ${key})`);

    expect(
      mismatched,
      'Der übergebene Wert nennt das Vertragsfeld nicht, aus dem er stammen ' +
        'sollte — Verdacht auf vertauschte Nachbarfelder. Ist die Herkunft ' +
        'absichtlich eine andere, gehört sie in RENAMES statt hierher.'
    ).toEqual([]);
  });

  it('greift überhaupt: die drei Quellen sind lesbar und nicht leer', () => {
    // Ohne diese Probe wäre ein stiller Fehlgriff (umbenannte Datei, geänderte
    // Einrückung, Vertrag ohne `shape`) ein GRÜNER Test über einer leeren Menge
    // — die häufigste Art, wie ein Wächter aufhört zu wachen.
    expect(contractBodyKeys().length).toBeGreaterThan(20);
    expect(stateInputKeys().size).toBeGreaterThan(20);
    expect(handedOverProps().size).toBeGreaterThan(20);
  });

  it('wacht namentlich über die Editor-Flächen-Anker', () => {
    // Der konkrete Regress. Vertrag + Zustand kennen sie, also MÜSSEN sie
    // übergeben werden — unabhängig davon, ob der Mengenschnitt oben je
    // umgebaut wird.
    const handed = handedOverKeys();
    const inputKeys = stateInputKeys();
    for (const anchor of ['currentBoard', 'currentDocument', 'docMentionIds', 'boardIds']) {
      expect(inputKeys.has(anchor), `${anchor} fehlt in ChatGraphInput`).toBe(true);
      expect(handed.has(anchor), `${anchor} wird nicht übergeben`).toBe(true);
    }
  });
});
