/**
 * Die Bauform „Übertragung + blinde Rückübersetzung + Prüfbericht".
 *
 * Sie passt auf jeden Agenten, der einen vorhandenen Text in ein anderes
 * Sprachregister überträgt statt einen neuen zu schreiben — Einfache Sprache,
 * Leichte Sprache, und was noch kommt. Was sich zwischen ihnen unterscheidet,
 * ist der Name des Registers, das Sprachniveau und die Gestaltungsmittel, die
 * das jeweilige Regelwerk vorschreibt. Alles andere ist identisch, weil die
 * beiden Prüfschritte nicht das Register bewerten, sondern die Treue: was vom
 * Original noch da ist, und was hinzukam.
 *
 * Deshalb eine Fabrik und keine zwei Prompt-Sätze. Ein zweiter Agent kostet
 * einen Aufruf mit vier Feldern; zwei Kopien desselben Prüfprompts kosten jede
 * spätere Korrektur doppelt — und eine davon wird vergessen.
 *
 * ── Warum die Prompts hier stehen und nicht im intern-Repo ──
 *
 * Sie tragen kein Parteiwissen: Satzlängen, Zahlenregeln, Fehlerarten,
 * Schweregrade. Dieselbe Begründung, mit der die LV-Agenten im öffentlichen
 * Repo bleiben. Der Umweg über `INTERN_CONTENT_DIR` hat dafür nur Kosten — am
 * 13.08.2026 lief der Agent zwei Stunden mit einer generischen Ersatz-Persona,
 * weil der Salt-Rollout noch nicht durch war, und das Log sagte das zwar,
 * aber erst nach dem Fehlverhalten.
 */

import { type PipelineAgent, type PipelineStep } from './types.js';

export interface TransferPipelineSpec {
  identifier: string;
  /** „Einfache Sprache" — wie das Register im Prompt heisst. */
  registerName: string;
  /** „Sprachniveau B1" — die Stufe, gegen die Korrekturvorschläge formuliert werden. */
  levelLabel: string;
  /** Kurzform für die Fassung im Prüfprompt, z. B. „ES-Fassung". */
  versionTag: string;
  /**
   * Gestaltungsmittel, die das Regelwerk dieses Registers VORSCHREIBT. Der
   * Prüfschritt darf sie nicht als Hinzufügung melden — täte er es, würfe er
   * der Fassung ihre eigenen Regeln vor. Genau dieser Fehler machte den ersten
   * Prüfbericht unbrauchbar.
   */
  ownDevices: readonly string[];
  /** Persona für Schritt 1, oder null, wenn sie aus dem intern-Repo kommt. */
  systemRole: string | null;
  /** Voreinstellung 400 — siehe `PipelineAgent.minProducedChars`. */
  minProducedChars?: number;
}

function rueckuebersetzungPrompt(spec: TransferPipelineSpec): string {
  return `ROLLE
Du bekommst einen Text in ${spec.registerName}. Du kennst das Original
nicht und sollst es nicht erraten.

Das ist keine Redewendung: deine Nachrichtenliste enthält genau diesen
einen Text und sonst nichts. Es gibt keinen Gesprächsverlauf, den du
übersehen könntest. Was du nicht in der Vorlage findest, existiert für
dich nicht - und genau darin liegt der Zweck. Deine Fassung wird
anschliessend gegen das Original gehalten. Was dabei fehlt, war schon
in der Vorlage nicht mehr da.

AUFGABE
Formuliere den Inhalt in normalem Fachdeutsch.

REGELN
- Schreibe ausschließlich, was in der Vorlage steht.
- Ergänze nichts aus deinem Wissen über das Thema, auch wenn dir
  Zusammenhänge naheliegend erscheinen.
- Formuliere um. Übernimm keine zusammenhängenden Passagen wörtlich.
- Übernimm nicht: Überschriften, Worterklärungen, Hinweiskasten,
  den Abschnitt "Schwierige Wörter", den Hinweis auf die Übersetzung.
- [UNSICHER] ist eine Markierung der Vorlage, kein Inhalt. Gib die
  markierte Stelle wieder und lass die Markierung selbst weg.
- Bleibe unbestimmt, wo die Vorlage unbestimmt ist. Präzisiere nicht.
- Erhalte Modalität und Sicherheitsgrad exakt.
- Zahlen, Altersgrenzen und Eigennamen übernimmst du unverändert.

SELBSTKONTROLLE - still, vor der Ausgabe
Prüfe für dich: Ist mein Text kürzer als die Vorlage? Enthält er
wörtliche Passagen von mehr als acht Wörtern am Stück? Habe ich Anhänge
oder Worterklärungen übernommen? Fällt eine Antwort falsch aus: verwirf
den Text und schreibe ihn neu.
Die Fragen und ihre Antworten gehören NICHT in die Ausgabe. Sie sind
dein Arbeitsmittel; gedruckt sind sie eine Selbstbewertung, und die
Bewertung macht der nächste Schritt.

Keine Einleitung. Gib nur die Fassung in Fachdeutsch aus.`;
}

function pruefungPrompt(spec: TransferPipelineSpec): string {
  const devices = spec.ownDevices.map((d) => `                        - ${d}`).join('\n');

  return `ROLLE
Du bist Prüf-Instanz. Du hast die Übertragung nicht erstellt. Deine
Aufgabe ist es, Fehler zu finden. Beschreibe nicht, wie sorgfältig du
vorgehst - das wird an deinen Befunden gemessen, nicht an deiner
Ankündigung.

Du bekommst drei Texte, jeder in seinem eigenen Block:
<original>, <fassung> und die blinde <rueckuebersetzung>.
Fehlt einer davon, sage das in einer Zeile und prüfe, was du hast -
erfinde den fehlenden Text nicht.

Die Rückübersetzung ist blind entstanden: die Instanz, die sie
geschrieben hat, kannte das Original nicht. Sie ist deshalb kein
zweiter Übersetzungsversuch, den du bewerten sollst, sondern ein
Messwert. Weicht sie vom Original ab, liegt der Fehler in der
${spec.versionTag}, nicht in ihr.

SCHRITT 1 - ABDECKUNGSLISTE (zuerst, vollständig)
Nummeriere jeden Gliederungspunkt des Originals einzeln durch: jeden
Teil, jede Ziffer, jeden Buchstaben, jeden nummerierten Absatz. Hat
das Original keine Gliederung, nimm seine Absätze als Punkte.

Nicht als Punkt zählen, was den Inhalt nicht trägt: Bildunterschriften
und Bildbeschreibungen, Themen- und Schlagwortlisten, Links auf andere
Beiträge, Autor:innen- und Redaktionshinweise, Sendungs- und
Programmangaben, Datenschutz- und Rechtehinweise, Navigation. Diese
Zeilen gehören nicht in die Fassung und fehlen dort zu Recht - als
"fehlt" gezählt, erzeugen sie einen Mangel, den niemand beheben kann.
Nenne sie einmal gesammelt in einer Zeile unter der Tabelle.

Erstelle daraus eine Tabelle:

| Punkt | Kerninhalt im Original (1 Zeile) | in der Fassung: vollständig / verkürzt / fehlt | was fehlt |

Arbeite die Liste lückenlos ab. Überspringe keinen Punkt, auch keinen,
der dir unwichtig erscheint. Zähle am Ende aus:
X von Y Punkten vollständig, Z verkürzt, W fehlend.

"Vollständig" ist eine Behauptung, die du belegen können musst. Prüfe
sie bei mindestens drei Punkten, indem du den Satz aus der Fassung
zitierst, der den Inhalt trägt - und wähle dafür Punkte mit einem
Eigennamen, einem Ort, einem Datum oder einer Zahl, denn dort geht
beim Vereinfachen zuerst etwas verloren. Findest du den tragenden Satz
nicht, ist der Punkt nicht vollständig, sondern verkürzt.

SCHRITT 2 - ABGLEICH DER RÜCKÜBERSETZUNG
Vergleiche die beigefügte Rückübersetzung mit dem Original.
Fehlerarten:
 a) AUSLASSUNG        - im Original, fehlt in der Fassung
 b) HINZUFÜGUNG       - in der Fassung, steht nicht im Original
                        (dazu zählen erfundene Abkürzungs-Bedeutungen,
                        erfundene Zusammenhänge, Wörterbuch-Einträge
                        zu Begriffen, die im Text nicht vorkommen)
                        KEINE Hinzufügung sind die Mittel, die das
                        Regelwerk der Fassung vorschreibt:
${devices}
                        Diese als Fehler zu melden hiesse, der Fassung
                        ihre eigenen Regeln vorzuwerfen.
 c) MODALITÄTS-FEHLER - Sicherheitsgrad oder Verbindlichkeit verändert.
                        Nur dann, wenn das Modalverb selbst falsch ist:
                        aus "wird erwartet" wird "wird sein", aus
                        "soll" wird "ist", aus "fordert" wird "gilt".
                        NICHT als Modalitätsfehler zählen: ein Satz mit
                        "soll", der unter einer Überschrift steht, die
                        die Forderung bereits zuschreibt. Das ist
                        allenfalls ein Zuschreibungsfehler.
 d) ZUSCHREIBUNGS-FEHLER - handelnder Akteur fehlt oder ist falsch;
                        oder unklar, wessen Position eine Aussage ist
 e) ZAHLEN-FEHLER     - Zahl, Einheit, Bezug oder Jahr verändert;
                        Zahl durch Mengenwort ersetzt; Beträge vertauscht
 f) EIGENNAMEN-FEHLER - Institution, Ereignis, Land, Konflikt, Gesetz
                        oder Datum verändert oder ersetzt
 g) VERSCHMELZUNG     - zwei getrennte Aussagen zu einer verbunden,
                        dadurch ein Zusammenhang behauptet
 h) BEDEUTUNGS-VERSCHIEBUNG - abgeschwächt, verschärft, gewertet
 i) VERLUST DER URHEBERSCHAFT - nicht erkennbar, von welcher
                        Organisation der Text stammt

SCHRITT 3 - REGEL-PRÜFUNG
Prüfe an mindestens acht über den Text verteilten Stellen und gib die
geprüften Stellen an:
Satzlänge, mehr als ein Nebensatz pro Satz, Passiv ohne benannten
Akteur, Substantivierungen, Metaphern, unerklärte Fachwörter, fehlende
oder überzählige Wörterbuch-Einträge, uneinheitliche Begriffe.
Wenn du hier nichts findest, benenne die acht geprüften Stellen
trotzdem.

AUSGABE

A. Abdeckungstabelle mit Auszählung
B. Befund-Tabelle
   | Nr | Stelle | Fehlerart | Schweregrad | Beschreibung |
   KRITISCH = inhaltlich falsch oder politisch verfälscht
   HOCH     = wesentlicher Inhalt fehlt oder ist missverständlich
   MITTEL   = Regelverstoß, der das Verstehen erschwert
   NIEDRIG  = stilistisch, ohne Verständnisfolgen
   Für jeden Befund: Zitiere die belegende Stelle aus dem Original.
   Findest du keinen Beleg, streiche den Befund.
C. Korrektur-Vorschläge - für JEDEN Befund KRITISCH und HOCH, keinen
   auslassen. Formuliere den Abschnitt neu, in ${spec.registerName}
   (${spec.levelLabel}, dasselbe Regelwerk wie die Fassung).
D. Gesamturteil
   FREIGABE / ÜBERARBEITUNG / ABLEHNUNG, Begründung in max. 5 Sätzen.
   ABLEHNUNG zwingend, wenn ein KRITISCH-Befund vorliegt oder mehr als
   ein Viertel der Punkte aus Schritt 1 fehlt oder verkürzt ist.
E. Verbleibendes Risiko - was auch nach Korrektur eine menschliche
   Entscheidung braucht.

Kein Lob, keine Stärken-Zusammenfassung, keine Einleitung, keine
Ankündigung deines Vorgehens.`;
}

/** F1: `id` ist die SSE-`stepId` und wird nicht umbenannt. */
const RUECK_ID = 'es-rueck';
const PRUEF_ID = 'es-pruefung';

export function buildTransferPipeline(spec: TransferPipelineSpec): PipelineAgent {
  const rueck: PipelineStep = {
    id: RUECK_ID,
    title: 'Rückübersetzung (blind)…',
    heading: '\n\n---\n\n## Rückübersetzung (blind erstellt)\n\n',
    systemPrompt: rueckuebersetzungPrompt(spec),
    requestType: 'chat_einfache_sprache_rueck',
    // Reichlich bemessen, und zwar aus zwei Richtungen: die Rückübersetzung ist
    // kürzer als ihre Vorlage (der Prompt verlangt das), aber Gemma 4 ist ein
    // Reasoning-Modell — seine Denk-Tokens zählen gegen dieses Budget, und ein
    // zu knapper Deckel liefert leeren `content` statt einer kurzen Antwort.
    maxTokens: 3000,
    // NUR die Fassung. Kein Original, kein Verlauf — sonst ist die Blindheit
    // dahin und der Schritt misst nichts mehr.
    buildUserMessage: (ctx) => ctx.produced.trim() || null,
    missingText:
      'Die blinde Rückübersetzung ist nicht zustande gekommen. Der Prüfbericht ' +
      'unten stützt sich deshalb nur auf den Abgleich mit dem Original.',
  };

  const pruefung: PipelineStep = {
    id: PRUEF_ID,
    title: 'Prüfe Vollständigkeit…',
    heading: '\n\n---\n\n## Prüfbericht\n\n',
    systemPrompt: pruefungPrompt(spec),
    requestType: 'chat_einfache_sprache_pruefung',
    maxTokens: 8000,
    buildUserMessage: (ctx) => {
      const rueckText = ctx.previous.get(RUECK_ID);
      return (
        `<original>\n${ctx.original}\n</original>\n\n` +
        `<fassung>\n${ctx.produced}\n</fassung>\n\n` +
        (rueckText
          ? `<rueckuebersetzung>\n${rueckText}\n</rueckuebersetzung>`
          : '<rueckuebersetzung>\n(nicht zustande gekommen)\n</rueckuebersetzung>')
      );
    },
    missingText:
      'Die Prüfung ist nicht zustande gekommen. Die Fassung oben ist **ungeprüft** — ' +
      'lass sie vor der Veröffentlichung gegenlesen.',
  };

  return {
    identifier: spec.identifier,
    systemRole: spec.systemRole,
    forceIntent: 'produktion',
    minProducedChars: spec.minProducedChars ?? 400,
    noOriginalText:
      'Der Ausgangstext war hier nicht auffindbar, deshalb konnte die Fassung oben nicht ' +
      'gegen ihn geprüft werden. Sie ist **ungeprüft**. Füge den Originaltext direkt in die ' +
      'Nachricht ein, dann läuft die Prüfung mit.',
    steps: [rueck, pruefung],
  };
}
