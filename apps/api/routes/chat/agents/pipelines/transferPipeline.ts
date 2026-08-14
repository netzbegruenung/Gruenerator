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

Dazu zählen ausdrücklich die Anrisse anderer Beiträge, auch wenn sie
Zahlen, Daten, Orte oder Rekorde zum selben Thema nennen. Ein Anriss
trägt eine eigene Schlagzeile, ein eigenes Datum und einen Verweis wie
"mehr" oder eine Player-Zeile - daran erkennst du ihn, nicht daran, wie
inhaltlich er klingt. Er ist kein Punkt des Originals. Steht er
trotzdem in der Fassung, ist das keine Abdeckung, sondern eine
HINZUFÜGUNG (b), und zwar auch dann, wenn die Zahlen darin stimmen.

Erstelle daraus eine Tabelle:

| Punkt | Kerninhalt im Original (1 Zeile) | in der Fassung: vollständig / verkürzt / fehlt | was fehlt |

Arbeite die Liste lückenlos ab. Überspringe keinen Punkt, auch keinen,
der dir unwichtig erscheint. Zähle am Ende aus:
X von Y Punkten vollständig, Z verkürzt, W fehlend.

Nennt das Original die Umstände einer Äusserung - Anlass, Ort,
Zeitpunkt -, bekommen sie eine eigene Zeile in der Tabelle, auch wenn
sie im Original in einem Nebensatz stehen. Sie sind ein Punkt, kein
Beiwerk: sie sagen, in welcher Rolle jemand gesprochen hat. Wenn du
diese Zeile gar nicht erst anlegst, kann die Tabelle den Verlust nicht
zeigen und zählt eine unvollständige Fassung als lückenlos.

Ein Punkt ist mehr als seine Kernaussage. Ort, Anlass, Zeitpunkt und
Urheber einer Äusserung gehören zu dem Punkt, in dessen Absatz sie
stehen. Ebenso die Eigenschaftswörter, mit denen das Original eine Lage
als bedrohlich, schwer oder aussergewöhnlich bewertet: sie tragen die
Dringlichkeit, und ohne sie steht dieselbe Sache harmloser da. Fehlen
diese Angaben in der Fassung, ist der Punkt verkürzt - auch wenn die
Aussage selbst vollständig dasteht. Genau sie verschwinden beim
Vereinfachen als Erstes, weil sie den Satz verlängern, ohne die
Forderung zu ändern.

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
                        zu Begriffen, die im Text nicht vorkommen, und
                        Worterklärungen, deren INHALT nicht aus dem
                        Original hervorgeht - der Begriff kann darin
                        stehen und seine Erklärung trotzdem hinzukommen)
                        KEINE Hinzufügung sind die Mittel, die das
                        Regelwerk der Fassung vorschreibt:
${devices}
                        Diese als Fehler zu melden hiesse, der Fassung
                        ihre eigenen Regeln vorzuwerfen.
 c) MODALITÄTS-FEHLER - Sicherheitsgrad oder Verbindlichkeit verändert.
                        Nicht nur am Modalverb: aus "wird erwartet" wird
                        "wird sein", aus "soll" wird "ist", aus "fordert"
                        wird "gilt" - und ebenso, wenn eine Möglichkeit
                        zur Wirkung wird, wenn eine Bedingung wegfällt
                        ("wenn ..., dann" -> ein Aussagesatz), oder wenn
                        Konjunktiv und indirekte Rede des Originals in
                        der Fassung als Tatsache erscheinen.
                        Eine übernommene Bedingung heilt den Fehler
                        nicht: steht das Wenn noch da, die Folge aber im
                        Indikativ, ist die Zusage dieselbe wie ohne das
                        Wenn. Prüfe Bedingung und Folge getrennt.
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
 h) BEDEUTUNGS-VERSCHIEBUNG - abgeschwächt, verschärft, gewertet;
                        dazu die Zeitform: eine Wirkung, die im Original
                        allgemein gilt, steht in der Fassung in der
                        Vergangenheit und ist damit ein abgeschlossenes
                        Ereignis statt einer Regel
 i) VERLUST DER URHEBERSCHAFT - nicht erkennbar, von welcher
                        Organisation der Text stammt

SCHRITT 2b - WAS DIE RÜCKÜBERSETZUNG NICHT ZEIGEN KANN
Die blinde Instanz hatte den Auftrag, Überschriften, Worterklärungen,
den Abschnitt "Schwierige Wörter" und den Übersetzungshinweis NICHT zu
übernehmen. Diese Teile der Fassung sind in Schritt 2 deshalb
unsichtbar - nicht unauffällig. Halte sie einzeln gegen das Original:
- jeden Eintrag unter "Schwierige Wörter", mit drei Fragen in dieser
  Reihenfolge:
  1. Steht der erklärte INHALT im Original? Wenn nicht, trägt der
     Eintrag die vorgeschriebene Kennzeichnung? Fehlt sie, ist es eine
     HINZUFÜGUNG (b).
  2. Steht dieselbe Erklärung auch oben im Fliesstext der Fassung, an
     der Stelle, wo der Begriff vorkommt? Der Abschnitt sammelt nur
     ein, was oben schon erklärt ist. Ein Eintrag, der dort nicht
     wiederzufinden ist, wird hier zum ersten Mal erklärt und ist eine
     HINZUFÜGUNG (b) - unabhängig davon, ob seine Kennzeichnung stimmt.
  3. Erklärt der Eintrag überhaupt etwas? Ein Eintrag, der nur mitteilt,
     dass das Original den Begriff nicht erklärt, gehört an die
     Fundstelle im Text und nicht in diese Liste. Das ist ein
     Regelverstoss (MITTEL), keine Hinzufügung.
- jede Zwischenüberschrift: Behauptet sie etwas, das der Abschnitt
  darunter nicht hergibt?
- den Übersetzungshinweis: Stimmen Dokumentart, Urheber und Datum mit
  dem Original überein? Eine Angabe, die das Original nicht macht,
  fehlt im Hinweis zu Recht. Steht dort stattdessen ein Lückenfüller
  ("von ohne Urheber", "vom ohne Datum"), ist das ein Befund (MITTEL).
Prüfe diesen Schritt auch dann, wenn die Rückübersetzung ausgefallen
ist - er hängt nicht an ihr.

SCHRITT 2c - MODALITÄTS-ABGLEICH (aufzählen, nicht beurteilen)
Modalitätsfehler entgehen dir, wenn du den Text liest und dich fragst,
ob dir etwas auffällt. Zähle stattdessen ab.
Gehe das ORIGINAL durch und schreibe jede Stelle heraus, an der eine
Aussage nicht einfach behauptet wird:
- Konjunktiv oder indirekte Rede ("sei", "werde", "könne", "hiess es")
- ein Modalwort ("kann", "soll", "müsste", "möglicherweise", "dürfte")
- eine Bedingung ("wenn ...", "sofern ...", "bei ...")
- eine Einschränkung des Geltungsbereichs ("weitgehend", "in der Regel")
Für jede dieser Stellen eine Zeile:

| Nr | Original (Zitat) | entsprechende Stelle in der Fassung (Zitat) | Grad erhalten: ja / nein |

Die Fassung darf umformulieren; entscheidend ist allein, ob am Ende
dieselbe Verbindlichkeit dasteht. Prüfe bei Bedingungen Bedingung UND
Folge getrennt: das übernommene "wenn" macht eine Folge im Indikativ
nicht unsicher. Findest du zur Original-Stelle nichts in der Fassung,
ist der Grad nicht erhalten - eine weggelassene Einschränkung ist die
häufigste Form dieses Fehlers.
Jede Zeile mit "nein" wird zu einem Befund (c) in B. Ist diese Liste
leer, weil das Original keine einzige solche Stelle enthält, schreibe
das ausdrücklich hin - bei einem Text, der Forderungen und Aussagen
Dritter wiedergibt, ist das der unwahrscheinlichere Fall.

SCHRITT 3 - REGEL-PRÜFUNG
Prüfe an mindestens acht über den Text verteilten Stellen und gib die
geprüften Stellen an:
Satzlänge, mehr als ein Nebensatz pro Satz, Passiv ohne benannten
Akteur, Substantivierungen, Metaphern, unerklärte Fachwörter, fehlende
oder überzählige Wörterbuch-Einträge, uneinheitliche Begriffe,
stehengebliebene Wörter der Verwaltungs- und Nachrichtensprache sowie
Amts- und Funktionsbezeichnungen, die vor einem Namen zusammengezogen
statt in einem eigenen Satz aufgelöst sind.
Wenn du hier nichts findest, benenne die acht geprüften Stellen
trotzdem.

AUSGABE

A. Abdeckungstabelle mit Auszählung
A2. Modalitäts-Abgleich - die Tabelle aus Schritt 2c, vollständig und
   mit beiden Zitaten je Zeile. Sie steht auch dann da, wenn jede Zeile
   "ja" trägt: sie ist der Nachweis, dass du abgezählt und nicht nur
   überflogen hast.
B. Befund-Tabelle
   | Nr | Stelle | Fehlerart | Schweregrad | Beschreibung |
   KRITISCH = inhaltlich falsch oder politisch verfälscht
   HOCH     = wesentlicher Inhalt fehlt oder ist missverständlich
   MITTEL   = Regelverstoß, der das Verstehen erschwert
   NIEDRIG  = stilistisch, ohne Verständnisfolgen
   Ein Modalitäts-Fehler (c) ist mindestens HOCH: er verändert, was der
   Urheber zugesagt, gefordert oder nur für möglich gehalten hat. Das
   ist kein Stilproblem, sondern eine andere politische Aussage.
   Für jeden Befund: Zitiere die belegende Stelle aus dem Original.
   Findest du keinen Beleg, streiche den Befund.
   B muss jede Zeile aus A aufnehmen, die "verkürzt" oder "fehlt"
   trägt: was dort fehlt, ist ein Befund - in aller Regel eine
   AUSLASSUNG (a). Eine A-Zeile ohne Befund in B heisst, du hast den
   Mangel gesehen und nicht gemeldet.
C. Korrektur-Vorschläge - für JEDEN Befund KRITISCH und HOCH, keinen
   auslassen. Formuliere den Abschnitt neu, in ${spec.registerName}
   (${spec.levelLabel}, dasselbe Regelwerk wie die Fassung).
   Bei MITTEL genügt der korrigierte Satz statt des ganzen Abschnitts -
   aber er steht da. Ein Befund ohne Korrektur zwingt die lesende
   Person, den Fehler selbst zu beheben, den du bereits kennst.
D. Fehlerarten-Nachweis - eine Zeile je Fehlerart a) bis i), in dieser
   Reihenfolge, jede entweder mit der Nummer des Befunds aus B oder mit
   "geprüft, kein Befund". Schweigen zu einer Fehlerart ist kein
   Unbedenklichkeitsnachweis, und genau als solcher wird es gelesen.
   "geprüft, kein Befund" bei a) ist ausgeschlossen, solange A eine
   Zeile mit "verkürzt" oder "fehlt" trägt. Widersprechen sich A und D,
   gilt A. Dasselbe gilt für c) gegenüber A2: jede Zeile dort mit
   "nein" ist ein Befund.
E. Gesamturteil
   FREIGABE / ÜBERARBEITUNG / ABLEHNUNG, Begründung in max. 5 Sätzen.
   ABLEHNUNG zwingend, wenn ein KRITISCH-Befund vorliegt oder mehr als
   ein Viertel der Punkte aus Schritt 1 fehlt oder verkürzt ist.
   FREIGABE nur, wenn D für jede Fehlerart eine Zeile trägt, A2
   vorliegt und keine ihrer Zeilen "nein" trägt, und kein Befund
   KRITISCH oder HOCH ist. Im Zweifel ÜBERARBEITUNG.
   Ein Bericht ohne einen einzigen Befund ist möglich, aber selten.
   Bevor du ihn abgibst, geh A, A2 und Schritt 2b noch einmal durch:
   Trägt jede Aussage Dritter in der Fassung denselben Grad wie im
   Original? Steht der Anlass der Äusserung darin? Sind die Fachwörter
   gekennzeichnet? Findest du dabei nichts, ist "keine Befunde" dein
   Ergebnis - findest du etwas, war es kein sorgfältiger Bericht,
   sondern ein schneller.
F. Verbleibendes Risiko - was auch nach Korrektur eine menschliche
   Entscheidung braucht.

Kein Lob, keine Stärken-Zusammenfassung, keine Einleitung, keine
Ankündigung deines Vorgehens.`;
}

/** F1: `id` ist die SSE-`stepId` und wird nicht umbenannt. */
const RUECK_ID = 'es-rueck';
const PRUEF_ID = 'es-pruefung';

/**
 * Obergrenze für das Original im Prüfkontext. Siehe `buildUserMessage` des
 * Prüfschritts für die Begründung — und dafür, warum die Kürzung angesagt wird.
 */
const MAX_ORIGINAL_CHARS = 24000;

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
    // Angehoben mit der Modalitäts-Tabelle aus Schritt 2c: sie bringt zwei
    // Zitate je Zeile. Gemma 4 denkt gegen dasselbe Budget, und ein
    // abgeschnittener Bericht verliert als Erstes das Gesamturteil am Ende.
    maxTokens: 11000,
    // Niedriger als die Rückübersetzung: hier wird gezählt und belegt, nicht
    // formuliert.
    temperature: 0.1,
    buildUserMessage: (ctx) => {
      // Drei Texte plus Systemprompt müssen in ein Fenster passen, und das
      // Original ist der einzige unbegrenzte Teil — Fassung und Rückübersetzung
      // sind durch ihre eigenen Token-Deckel schon beschränkt. Die Kürzung wird
      // im Prompt ANGESAGT: still gekürzt wäre die Abdeckungsliste
      // unvollständig, ohne dass es jemand merkt, und genau diese Liste ist das
      // Prüfmittel.
      const gekuerzt = ctx.original.length > MAX_ORIGINAL_CHARS;
      const original = gekuerzt ? ctx.original.slice(0, MAX_ORIGINAL_CHARS) : ctx.original;
      const kuerzungsHinweis = gekuerzt
        ? '\n\n(Gekürzt — das Original ist länger als hier gezeigt. Beziehe die ' +
          'Abdeckungsliste nur auf den gezeigten Teil und sage das im Bericht.)'
        : '';

      // Der Prompt kennt drei benannte Texte und behandelt einen fehlenden
      // ausdrücklich. Deshalb wird die ausgefallene Rückübersetzung BENANNT
      // statt weggelassen — sonst prüft das Modell zwei Texte und meldet es nicht.
      const rueckText = ctx.previous.get(RUECK_ID);
      return (
        `<original>\n${original}${kuerzungsHinweis}\n</original>\n\n` +
        `<fassung>\n${ctx.produced}\n</fassung>\n\n` +
        (rueckText
          ? `<rueckuebersetzung>\n${rueckText}\n</rueckuebersetzung>`
          : '<rueckuebersetzung>\n(Die Rückübersetzung ist nicht zustande gekommen. ' +
            'Prüfe ohne sie und sage das.)\n</rueckuebersetzung>')
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
