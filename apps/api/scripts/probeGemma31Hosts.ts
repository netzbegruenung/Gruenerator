/**
 * Regolos `gemma4-31b` gegen Cortecs' `gemma-4-31b-it` — dasselbe Modell, zwei
 * Hosts.
 *
 *   pnpm --filter @gruenerator/api exec cross-env \
 *     NODE_OPTIONS=--conditions=development \
 *     npx tsx --env-file=.env scripts/probeGemma31Hosts.ts
 *
 * Die `development`-Condition ist nicht optional: dieses Skript geht über die
 * Fassade `services/ai/generate.ts` und zieht damit die Workspace-Pakete mit,
 * die ohne sie auf ihre gebauten Einstiegspunkte auflösen und mit
 * `does not provide an export named …` abbrechen. Alle Skripte in package.json
 * setzen sie aus demselben Grund.
 *
 * Braucht REGOLO_API_KEY und CORTECS_API_KEY. Kostet ein paar zehntausend
 * Token; der Prüf-Prompt ist absichtlich gross.
 *
 * ── Warum diese Messung, und warum genau so ───────────────────────────────
 *
 * `INTERMEDIATE_LANES.pruefung` fährt Regolos dichtes 31B, mit einem Sibling
 * daneben, den der Aufrufer nach 30 s PARALLEL dazuschaltet. Den Sibling gibt
 * es wegen des 14.08.2026: Regolos `gemma4-31b` antwortete an dem Tag mit
 * 3,7 tok/s statt der sonst gemessenen ~76, Regolo selbst war gesund (sein
 * `mistral-small-4-119b` lief mit 113 tok/s), es war dieses eine Modell dort.
 * Ein Prüfbericht, der ruhig 36 s braucht, brauchte 218 s und riss die
 * Zeitsperre.
 *
 * Die Frage ist also nicht „welcher Host ist schneller", sondern ob Cortecs'
 * Endpunkt desselben Modells (Unterauftragnehmer infercom, Luxemburg/
 * Deutschland) als zweiter Bezugsweg taugt — und ob er dabei denselben Bericht
 * schreibt.
 *
 * GEMESSEN WIRD DESHALB BEIDES. Ein reiner Geschwindigkeitstest würde die
 * Eigenschaft verfehlen, für die es diese Stufe gibt: hier ist ein Fehler eine
 * ÜBERSEHENE AUSLASSUNG, kein schwächerer Satz. Der Prüftext unten enthält
 * deshalb genau eine eingebaute Lücke — eine Frist, die in der einfachen
 * Fassung fehlt — plus eine Zahl, die verfälscht wurde. Ein Host, der schnell
 * antwortet und die Lücke übersieht, ist als Sibling wertlos.
 *
 * SERIELL UND UNTER LAST. Der 14.08. war ein Lastereignis, und die Messung vom
 * 01.08. hielt für diese Familie p50 unter zehn parallelen Anfragen fest. Ein
 * einzelner ruhiger Lauf hätte den Ausfall damals nicht gezeigt.
 *
 * KEIN reasoning_effort. Beide Hosts liefern dieses Modell ohne Denk-Block
 * (gemessen 21.08.2026: 420 bzw. 449 Zeichen Inhalt, 0 Zeichen Denken, ohne
 * jeden Parameter). Bei Cortecs wäre der Pin sogar schädlich — infercom weist
 * `reasoning_effort: 'none'` mit HTTP 400 ab, weshalb die Whitelist in
 * cortecsRequestPolicy.ts dieses Modell bewusst NICHT führt.
 */

import { streamText } from 'ai';

import { getModel } from '../services/ai/providers.js';

import type { ProviderName } from '../services/ai/providers.js';

const ZIELE: readonly { label: string; provider: ProviderName; model: string }[] = [
  { label: 'regolo/gemma4-31b', provider: 'regolo', model: 'gemma4-31b' },
  { label: 'cortecs/gemma-4-31b-it', provider: 'cortecs', model: 'gemma-4-31b-it' },
];

/** Das Original. Verwaltungsdeutsch, weil das der Ausgangsstoff der Lane ist. */
const ORIGINAL = `
Satzung über die Erhebung von Benutzungsgebühren für die Abfallentsorgung

§ 1 Gebührenpflicht. Für die Inanspruchnahme der öffentlichen Abfallentsorgung
werden Benutzungsgebühren erhoben. Gebührenpflichtig ist, wer Eigentümer des
angeschlossenen Grundstücks ist. Mehrere Gebührenpflichtige haften als
Gesamtschuldner.

§ 2 Gebührenmaßstab. Die Gebühr bemisst sich nach der Zahl und dem Volumen der
bereitgestellten Restabfallbehälter sowie nach der Häufigkeit der Leerung. Für
einen Behälter mit 120 Litern Fassungsvermögen beträgt die Jahresgebühr bei
vierzehntägiger Leerung 186 Euro. Für einen Behälter mit 240 Litern
Fassungsvermögen beträgt sie 312 Euro.

§ 3 Entstehung und Fälligkeit. Die Gebührenpflicht entsteht mit dem Ersten des
Monats, der auf den Anschluss an die Abfallentsorgung folgt. Die Jahresgebühr
wird in vier gleichen Teilbeträgen jeweils zum 15. Februar, 15. Mai,
15. August und 15. November fällig.

§ 4 Anzeigepflicht. Der Gebührenpflichtige hat einen Wechsel des Eigentums
innerhalb von zwei Wochen nach dem Übergang schriftlich anzuzeigen. Kommt er
dieser Pflicht nicht nach, haftet er für die bis zum Eingang der Anzeige
entstandenen Gebühren neben dem neuen Eigentümer.

§ 5 Ermäßigung. Auf Antrag wird die Gebühr um 25 vom Hundert ermäßigt, wenn im
Haushalt mindestens drei Kinder unter vierzehn Jahren leben. Der Antrag ist
bis zum 31. März des laufenden Jahres zu stellen.
`.trim();

/**
 * Die zu prüfende Fassung. Zwei Fehler sind eingebaut, und beide sind von der
 * Art, die diese Lane fangen soll:
 *
 *  A — AUSLASSUNG: § 4 (Anzeigepflicht bei Eigentumswechsel, Zwei-Wochen-Frist)
 *      fehlt vollständig.
 *  B — ZAHLENDREHER: der 240-Liter-Behälter steht mit 321 statt 312 Euro.
 *
 * Nicht als Fehler zählt, was Einfache Sprache VORSCHREIBT — kurze Sätze,
 * Zwischenüberschriften, direkte Anrede. Ein Host, der das als Hinzufügung
 * meldet, wirft der Fassung ihre eigenen Regeln vor; genau daran scheiterte
 * der erste Prüfbericht dieser Pipeline überhaupt.
 */
const FASSUNG = `
Gebühren für die Müll-Abfuhr

Wer muss zahlen?
Sie zahlen für die Müll-Abfuhr, wenn Ihnen das Grundstück gehört.
Wenn mehrere Menschen Eigentümer sind, zahlen alle gemeinsam.

Wie hoch ist die Gebühr?
Die Gebühr hängt von Ihrer Müll-Tonne ab.
Sie hängt auch davon ab, wie oft die Tonne geleert wird.
Eine Tonne mit 120 Litern kostet 186 Euro im Jahr.
Die Tonne wird dann alle 14 Tage geleert.
Eine Tonne mit 240 Litern kostet 321 Euro im Jahr.

Ab wann müssen Sie zahlen?
Sie zahlen ab dem 1. Tag des Monats nach dem Anschluss.
Sie zahlen die Gebühr in 4 Teilen:
am 15. Februar, am 15. Mai, am 15. August und am 15. November.

Gibt es eine Ermäßigung?
Sie zahlen 25 Prozent weniger, wenn bei Ihnen mindestens 3 Kinder wohnen.
Die Kinder müssen jünger als 14 Jahre sein.
Sie müssen den Antrag bis zum 31. März stellen.
`.trim();

const SYSTEM = `Du prüfst eine Fassung in Einfacher Sprache gegen ihr Original.

Gib GENAU diese drei Abschnitte aus:

## Abdeckung
Eine Tabelle mit einer Zeile je Paragraf des Originals. Spalten:
Paragraf | Inhalt in einem Halbsatz | in der Fassung enthalten (ja/nein) | Beleg aus der Fassung

## Befunde
Je Befund eine Zeile: SCHWERE (HOCH/MITTEL/NIEDRIG) — was fehlt oder abweicht — Beleg.
Zähle NUR Auslassungen, sachliche Abweichungen und falsche Zahlen.
Was Einfache Sprache vorschreibt, ist KEIN Befund: kurze Sätze,
Zwischenüberschriften als Fragen, direkte Anrede, Wiederholungen.

## Gesamturteil
Ein Satz: ist die Fassung vollständig und sachlich richtig?`;

const AUFGABE = `ORIGINAL:\n\n${ORIGINAL}\n\n---\n\n${'ZU PRÜFENDE FASSUNG'}:\n\n${FASSUNG}`;

interface Lauf {
  label: string;
  ok: boolean;
  /** Zeit bis zum ersten Textstück — die Wartezeit, die ein Mensch spürt. */
  ttftMs: number | null;
  /** Ende bis Ende, einschliesslich Verbindungsaufbau. */
  gesamtMs: number;
  outputTokens: number;
  /** Ausgabe-Token je Sekunde REINER Generierung (gesamt abzüglich TTFT). Die
   *  Kennzahl, in der die Störung vom 14.08.2026 vermerkt ist: 3,7 gegen ~76. */
  tokProSek: number | null;
  zeichen: number;
  fehler?: string;
  findetAuslassung: boolean;
  findetZahl: boolean;
}

async function einLauf(ziel: (typeof ZIELE)[number]): Promise<Lauf> {
  const start = Date.now();
  let ttftMs: number | null = null;
  let text = '';
  try {
    const result = streamText({
      model: getModel(ziel.provider, ziel.model),
      system: SYSTEM,
      prompt: AUFGABE,
      maxOutputTokens: 4000,
      temperature: 0.1,
    });
    for await (const stueck of result.textStream) {
      if (ttftMs === null) ttftMs = Date.now() - start;
      text += stueck;
    }
    const gesamtMs = Date.now() - start;
    const usage = await result.usage;
    const outputTokens = usage.outputTokens ?? 0;
    // Gegen die GENERIERUNGSZEIT, nicht die Gesamtzeit: sonst mischt sich die
    // Wartezeit vor dem ersten Token in den Durchsatz und macht einen schnell
    // generierenden Host mit träger Anlaufzeit künstlich langsam.
    const generierung = ttftMs === null ? gesamtMs : gesamtMs - ttftMs;
    const unten = text.toLowerCase();
    return {
      label: ziel.label,
      ok: text.length > 0,
      ttftMs,
      gesamtMs,
      outputTokens,
      tokProSek:
        generierung > 0 && outputTokens > 0
          ? Math.round((outputTokens / generierung) * 1000 * 10) / 10
          : null,
      zeichen: text.length,
      findetAuslassung:
        /§\s*4/.test(text) || unten.includes('anzeige') || unten.includes('eigentumswechsel'),
      findetZahl: text.includes('312') && text.includes('321'),
    };
  } catch (err) {
    return {
      label: ziel.label,
      ok: false,
      ttftMs,
      gesamtMs: Date.now() - start,
      outputTokens: 0,
      tokProSek: null,
      zeichen: 0,
      fehler: err instanceof Error ? err.message : String(err),
      findetAuslassung: false,
      findetZahl: false,
    };
  }
}

function zeile(l: Lauf): string {
  if (!l.ok) return `    FEHLER nach ${l.gesamtMs} ms — ${l.fehler ?? 'leere Antwort'}`;
  const treffer = l.findetAuslassung && l.findetZahl ? 'beide Fehler' : 'FEHLER ÜBERSEHEN';
  return (
    `  TTFT ${String(l.ttftMs ?? -1).padStart(5)} ms` +
    `  gesamt ${String(l.gesamtMs).padStart(6)} ms` +
    `  ${String(l.outputTokens).padStart(4)} tok` +
    `  ${String(l.tokProSek ?? 0).padStart(5)} tok/s` +
    `  ${treffer}`
  );
}

function median(werte: number[]): number {
  if (werte.length === 0) return 0;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[m - 1]! + s[m]!) / 2) : s[m]!;
}

function fasse(label: string, laeufe: Lauf[]): void {
  const gut = laeufe.filter((l) => l.ok);
  if (gut.length === 0) {
    console.log(`  ${label.padEnd(24)} KEIN Lauf erfolgreich`);
    return;
  }
  const ttft = gut.map((l) => l.ttftMs).filter((v): v is number => v !== null);
  const durchsatz = gut.map((l) => l.tokProSek).filter((v): v is number => v !== null);
  const treffer = gut.filter((l) => l.findetAuslassung && l.findetZahl).length;
  console.log(
    `  ${label.padEnd(24)} TTFT p50 ${String(median(ttft)).padStart(5)} ms  ` +
      `gesamt p50 ${String(median(gut.map((l) => l.gesamtMs))).padStart(6)} ms  ` +
      `${String(median(durchsatz)).padStart(4)} tok/s (min ${Math.min(...durchsatz)}, ` +
      `max ${Math.max(...durchsatz)})  ` +
      `Qualität ${treffer}/${gut.length}  (${gut.length}/${laeufe.length} durchgekommen)`
  );
}

async function main(): Promise<void> {
  const RUHIG = 5;
  const PARALLEL = 4;

  console.log(`Prüf-Prompt: ${AUFGABE.length} Zeichen Eingabe, Deckel 4000 Ausgabe-Token.`);
  console.log('Gestreamt, damit TTFT und Durchsatz getrennt messbar sind.');
  console.log('Qualität läuft mit: § 4 fehlt (Auslassung), 240 l steht mit 321 statt 312.\n');

  // ABWECHSELND, nicht blockweise. Der erste Durchgang mass Regolo am Stück
  // zuerst und bekam 16,8 s / 8,8 s — ruhig also LANGSAMER als derselbe Host
  // danach unter Last (5,7 s). Ein Kaltstart, der auf den ersten Block fällt,
  // sieht sonst aus wie eine Eigenschaft des Hosts. Verschränkt trifft er
  // beide gleich, und ein Aufwärm-Lauf je Host geht gar nicht erst in die
  // Wertung ein.
  const ruhig = new Map<string, Lauf[]>(ZIELE.map((z) => [z.label, []]));
  console.log('── Aufwärmen (nicht gewertet)');
  for (const ziel of ZIELE) {
    const l = await einLauf(ziel);
    console.log(`  ${ziel.label.padEnd(24)} ${l.ms} ms`);
  }
  console.log(`\n── ${RUHIG} ruhige Läufe je Host, abwechselnd`);
  for (let i = 0; i < RUHIG; i++) {
    for (const ziel of ZIELE) {
      const l = await einLauf(ziel);
      ruhig.get(ziel.label)!.push(l);
      console.log(`  ${ziel.label.padEnd(24)}${zeile(l)}`);
    }
  }

  console.log(`\n── Unter Last: ${PARALLEL} gleichzeitige Anfragen je Host`);
  const unterLast = new Map<string, Lauf[]>();
  for (const ziel of ZIELE) {
    const laeufe = await Promise.all(Array.from({ length: PARALLEL }, () => einLauf(ziel)));
    unterLast.set(ziel.label, laeufe);
    console.log(`  ${ziel.label}`);
    for (const l of laeufe) console.log(zeile(l));
  }

  console.log('\n── Zusammenfassung ───────────────────────────────────────');
  console.log('  ruhig:');
  for (const ziel of ZIELE) fasse(ziel.label, ruhig.get(ziel.label) ?? []);
  console.log('  unter Last:');
  for (const ziel of ZIELE) fasse(ziel.label, unterLast.get(ziel.label) ?? []);
  console.log(
    '\n  tok/s ist gegen die reine Generierungszeit gerechnet (gesamt abzüglich\n' +
      '  TTFT) — die Kennzahl, in der die Regolo-Störung vom 14.08.2026 steht\n' +
      '  (3,7 gegen sonst ~76 tok/s).'
  );
}

void main();
