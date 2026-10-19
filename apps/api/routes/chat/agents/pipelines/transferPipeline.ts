/**
 * Die Bauform „Übertragung + blinde Rückübersetzung + Prüfbericht
 * (+ Überarbeitung, wenn der Bericht nicht freigibt)".
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

import { type PipelineAgent } from './types.js';

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
Findest du hier nichts, ist das kein Befund - aber prüfe die acht
trotzdem.

AUSGABE
Gib dein Ergebnis ausschliesslich über das Werkzeug \`pruefbericht\` zurück.
- abdeckung: die Liste aus Schritt 1, ein Eintrag je Punkt, lückenlos.
- beiwerk: die nicht gezählten Zeilen, gesammelt in einer Zeile.
- modalitaet: die Liste aus Schritt 2c, je Stelle mit beiden Zitaten. Sie
  ist auch dann vollständig, wenn jede Stelle erhalten ist: sie ist der
  Nachweis, dass du abgezählt und nicht nur überflogen hast.
- befunde: jeder Befund aus Schritt 2, 2b und 3. Regelverstösse aus
  Schritt 3 tragen die Fehlerart "r".
  KRITISCH = inhaltlich falsch oder politisch verfälscht
  HOCH     = wesentlicher Inhalt fehlt oder ist missverständlich
  MITTEL   = Regelverstoss, der das Verstehen erschwert
  NIEDRIG  = stilistisch, ohne Verständnisfolgen
  Ein Modalitäts-Fehler (c) ist mindestens HOCH: er verändert, was der
  Urheber zugesagt, gefordert oder nur für möglich gehalten hat.
  Jede Abdeckungszeile mit "verkürzt" oder "fehlt" ist auch ein Befund,
  in aller Regel eine AUSLASSUNG (a).
  beleg: das wörtliche Zitat aus dem Original. Findest du keinen Beleg,
  streiche den Befund. Bei einem Regelverstoss steht das Zitat der
  Fassung in "stelle", und "beleg" bleibt leer.
  korrektur: für KRITISCH und HOCH der neu formulierte Abschnitt in
  ${spec.registerName} (${spec.levelLabel}, dasselbe Regelwerk wie die
  Fassung), für MITTEL der korrigierte Satz.
- begruendung: deine Einschätzung in höchstens 5 Sätzen. Ein Urteil
  (Freigabe, Ablehnung) nennst du NICHT - das rechnet das System aus
  deinen Listen.
- risiko: was auch nach einer Korrektur eine menschliche Entscheidung
  braucht.

Ein Bericht ohne einen einzigen Befund ist möglich, aber selten. Bevor du
ihn abgibst, geh die Listen noch einmal durch: Trägt jede Aussage Dritter
in der Fassung denselben Grad wie im Original? Steht der Anlass der
Äusserung darin? Findest du dabei nichts, ist "keine Befunde" dein
Ergebnis.

Kein Lob, keine Stärken-Zusammenfassung, keine Einleitung.`;
}

function ueberarbeitungPrompt(spec: TransferPipelineSpec): string {
  const regelwerk = spec.systemRole
    ? `${spec.systemRole}\n\n`
    : `Du überträgst Texte in ${spec.registerName} (${spec.levelLabel}).\n\n`;

  return `${regelwerk}ÜBERARBEITUNG
Deine Fassung ist von einer unabhängigen Prüf-Instanz geprüft worden. Du
bekommst drei Blöcke: das <original>, die <fassung> und die nummerierte
Liste <punkte>, die die Prüfung beanstandet hat.

Schreibe die Fassung vollständig neu - als fertigen Text in
${spec.registerName}, nach dem Regelwerk oben:
- Behebe jeden Punkt der Liste. Steht ein Vorschlag dabei, nutze ihn, wenn
  er dem Regelwerk folgt; sonst formuliere selbst.
- Prüfe jeden Punkt am Original, bevor du ihn umsetzt. Steht das, was der
  Punkt verlangt, nicht im Original, setzt du ihn nicht um.
- Was die Liste nicht beanstandet, übernimmst du aus der Fassung
  unverändert.
- Eine Auslassung behebst du an der Stelle, an der sie im Original steht,
  nicht als Nachtrag am Ende.
- Ergänze nichts, was nicht im Original steht.
- Behalte die Form: Titel als \`# \`, Zwischenüberschriften als \`## \`,
  Aufzählungen als Liste.

Gib nur die überarbeitete Fassung aus. Kein Kommentar zu den Änderungen,
keine Liste der behobenen Punkte, keine Einleitung.`;
}

function nachpruefungPrompt(spec: TransferPipelineSpec): string {
  const devices = spec.ownDevices.map((d) => `- ${d}`).join('\n');

  return `ROLLE
Du bist Prüf-Instanz. Eine Fassung in ${spec.registerName} wurde
überarbeitet, weil eine frühere Prüfung Mängel fand. Du prüfst, ob die
Mängel behoben sind - nicht den ganzen Text noch einmal von vorn.

Du bekommst vier Blöcke: das <original>, die <vorige_fassung>, die
<neue_fassung> und die nummerierte Liste <punkte> der Mängel.

AUFGABE
1. Für JEDEN Punkt der Liste: Ist er in der neuen Fassung behoben?
   "behoben" ist eine Behauptung, die du belegen musst: zitiere in "beleg"
   den Satz der neuen Fassung, der den Mangel behebt. Findest du ihn
   nicht, ist der Punkt nicht behoben.
   Bei einer Auslassung: steht der Inhalt des Originals jetzt da?
   Bei Modalität: trägt die Stelle jetzt denselben Grad wie das Original
   - Möglichkeit bleibt Möglichkeit ("kann"), Plan bleibt Plan ("soll"),
   Bedingung bleibt Bedingung, und die Folge einer Bedingung steht nicht
   im blossen Indikativ?
2. neue_befunde: NUR, was die Überarbeitung neu verschlechtert hat.
   Vergleiche dafür die neue mit der vorigen Fassung: Inhalt, der vorher
   da war und jetzt fehlt; eine Zahl oder ein Name, der jetzt falsch ist;
   etwas, das nicht im Original steht. Für jeden neuen Befund ein
   wörtlicher Beleg aus dem Original.
   Keine Hinzufügung sind die Mittel, die das Regelwerk der Fassung
   vorschreibt:
${devices}

Gib das Ergebnis ausschliesslich über das Werkzeug \`nachpruefung\`
zurück: je Punkt ein Eintrag mit seiner Nummer. Keine Einleitung.`;
}

/** F1: `id` ist die SSE-`stepId` und wird nicht umbenannt. */
const RUECK_ID = 'es-rueck';
const PRUEF_ID = 'es-pruefung';

export function buildTransferPipeline(spec: TransferPipelineSpec): PipelineAgent {
  return {
    identifier: spec.identifier,
    registerName: spec.registerName,
    systemRole: spec.systemRole,
    forceIntent: 'produktion',
    steps: {
      rueck: {
        id: RUECK_ID,
        title: 'Rückübersetzung (blind)…',
        systemPrompt: rueckuebersetzungPrompt(spec),
        requestType: 'chat_einfache_sprache_rueck',
        // Reichlich bemessen, und zwar aus zwei Richtungen: die Rückübersetzung
        // ist kürzer als ihre Vorlage (der Prompt verlangt das), aber Gemma 4 ist
        // ein Reasoning-Modell — seine Denk-Tokens zählen gegen dieses Budget,
        // und ein zu knapper Deckel liefert leeren `content` statt einer kurzen
        // Antwort.
        maxTokens: 6000,
        // Ruhig 8 s, im langsamen Lauf 64 s. Derselbe Abstand wie bei der Prüfung.
        hedgeAfterMs: 30_000,
      },
      pruefung: {
        id: PRUEF_ID,
        title: 'Prüfe Vollständigkeit…',
        systemPrompt: pruefungPrompt(spec),
        requestType: 'chat_einfache_sprache_pruefung',
        // Zwei Listen mit je zwei Zitaten pro Zeile, als JSON. Gemma 4 denkt
        // gegen dasselbe Budget, und ein abgeschnittener Bericht ist hier ein
        // ungültiges Objekt.
        maxTokens: 14000,
        // Hier wird gezählt und belegt, nicht formuliert.
        temperature: 0.1,
        // Gemessen 14.08.2026: 36 s ruhig, 218 s unter Last; der Sibling schafft
        // denselben Bericht in rund 16 s. Die Sperre bricht die Anfrage beim
        // Anbieter nicht ab (siehe `executeWithTimeout`), sie beendet nur das
        // Warten.
        timeoutMs: 240_000,
        hedgeAfterMs: 75_000,
      },
      ueberarbeitung: {
        id: 'es-ueberarbeitung',
        title: 'Überarbeite die Fassung…',
        systemPrompt: ueberarbeitungPrompt(spec),
        requestType: 'chat_einfache_sprache_ueberarbeitung',
        // Eine ganze Fassung, und Gemma 4 denkt gegen dasselbe Budget.
        maxTokens: 12000,
        timeoutMs: 240_000,
        hedgeAfterMs: 75_000,
      },
      nachpruefung: {
        id: 'es-nachpruefung',
        title: 'Prüfe die Überarbeitung…',
        systemPrompt: nachpruefungPrompt(spec),
        requestType: 'chat_einfache_sprache_nachpruefung',
        maxTokens: 8000,
        temperature: 0.1,
        timeoutMs: 240_000,
        hedgeAfterMs: 60_000,
      },
    },
  };
}
