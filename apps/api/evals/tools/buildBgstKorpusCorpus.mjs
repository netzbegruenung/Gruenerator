/**
 * Erzeugt `corpus/bgst-korpus.jsonl` — die Hälfte des BGSt-Prüfplans, die den
 * echten Beschlussbestand braucht.
 *
 * Übersprungen ohne `EVAL_BGST_KORPUS=1` (Lane-Flag `bgstKorpusLane`), weil die
 * Sammlung `bgst-beschluesse` heute auf keinem Zielsystem eingelesen ist. Sie
 * liegt trotzdem hier, damit die Prüfabsicht nicht in einem Word-Dokument
 * stehen bleibt: am Tag, an dem der Bestand eingelesen ist, ist das Prüfmittel
 * fertig.
 *
 * Was hier steht und im deterministischen Teil NICHT stehen kann: ob der
 * Bestand gefunden wird. Der andere Korpus legt den Beleg in den Prompt und
 * misst damit ausschließlich, was nach dem Retrieval passiert.
 *
 * Bewusst NICHT übernommen aus dem Prüfplan: die Items zu den internen
 * Mittelbeschlüssen (Ausgabenreihen, Zuführungen, Kommissionsgrößen). Das sind
 * interne Haushaltszahlen und keine veröffentlichten Beschlüsse — sie gehören
 * nicht in ein öffentliches Repo, auch nicht als Sollwert. Wer sie messen will,
 * ergänzt sie in einer lokalen Korpusdatei.
 *
 * Verbotene Werte sind auf das Antwortfeld verankert (`Antwort: ` bzw. `(a) `)
 * — siehe die Begruendung im Kopf von `buildBgstCorpus.mjs`; unverankert
 * meldet die Pruefung Rot, sobald ein Modell seinen Beleg zurueckzitiert.
 *
 * Lauf: `node evals/tools/buildBgstKorpusCorpus.mjs` aus apps/api.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../corpus/bgst-korpus.jsonl');
const COLLECTION = 'bgst-beschluesse';

const nb = (id, note, prompt, expect, notebookMode = 'deep') => ({
  id,
  category: 'bgst-korpus',
  note,
  surface: 'notebook',
  collectionIds: [COLLECTION],
  notebookMode,
  bgstKorpusLane: true,
  turns: [{ prompt, expect }],
});

const NADEL =
  'Beantworte ausschließlich aus den vorliegenden Beschlussdokumenten.\n\n' +
  'Antworte in genau zwei Zeilen:\nAntwort: {…}\nQuelle: {Titel} | {Gremium} | {Datum}\n\n' +
  'Findest du die Information nicht, schreibe: NICHT AUFFINDBAR.\n\nFrage: ';

const PRAESENZ =
  'Existiert im vorliegenden Material ein Beschluss mit folgendem Titel? ' +
  'Antworte ausschließlich mit JA oder NEIN, gefolgt von Gremium und ' +
  'Beschlussdatum, falls JA.\n\nTitel: ';

const scenarios = [
  // ——— Typ 3: Nadel. Findet die Suche einen Einzelfakt im Bestand? ———
  nb(
    'bgst-nadel-inkrafttreten',
    'Typ-3-Item N1. Prüfhinweis des Goldsets: Verwechslung mit dem Beschlussdatum 28.06.2026 zählt als Fehler.',
    NADEL + 'Ab wann tritt das Statut gegen sexuelle Belästigung in Kraft?',
    {
      topicsCovered: ['15. oktober 2026|15.10.2026'],
      answerMustNotContain: ['Antwort: 28.06.2026'],
      grounded: true,
    }
  ),
  nb(
    'bgst-nadel-loeschfrist',
    'Typ-3-Item N2.',
    NADEL + 'Wie lange nach Verfahrensende werden die Daten aus Beschwerdeverfahren gelöscht?',
    { topicsCovered: ['sechs monate|6 monate'], grounded: true }
  ),
  nb(
    'bgst-nadel-deepfake-paragraf',
    'Typ-3-Item N5. Die Nachbarparagrafen sind die dokumentierte Fehlerquelle.',
    NADEL + 'Welcher Paragraf des StGB soll auf sexualisierte Deepfakes erweitert werden?',
    {
      topicsCovered: ['184k'],
      answerMustNotContain: ['Antwort: § 177', 'Antwort: § 238', 'Antwort: § 201a'],
      grounded: true,
    }
  ),
  nb(
    'bgst-nadel-open-source',
    'Typ-3-Item N6. Zahl ohne Jahr gilt als Fehler.',
    NADEL + 'Welcher Open-Source-Anteil bei Vergaben soll bis 2029 erreicht werden?',
    { topicsCovered: ['70', '2029'], grounded: true }
  ),
  nb(
    'bgst-nadel-smart-meter',
    'Typ-3-Item N8.',
    NADEL + 'Bis wann sollen alle Haushalte und Unternehmen Smart Meter erhalten?',
    { topicsCovered: ['2030'], grounded: true }
  ),
  nb(
    'bgst-nadel-klimageld',
    'Typ-3-Item N10.',
    NADEL + 'In welchem Jahr soll das Klimageld erstmals ausgezahlt werden?',
    { topicsCovered: ['2027'], grounded: true }
  ),

  // ——— Typ 2: Präsenz. Erkennt der Bestand, was er NICHT enthält? ———
  nb(
    'bgst-praesenz-vorhanden',
    'Typ-2-Item P2. Positivkontrolle: ohne sie misst die Falschabsenz-Prüfung unten nur Vorsicht.',
    PRAESENZ + 'Statut gegen sexuelle Belästigung bei BÜNDNIS 90/DIE GRÜNEN',
    { topicsCovered: ['ja'], grounded: true },
    'fast'
  ),
  nb(
    'bgst-praesenz-fehlend',
    'Typ-2-Item P9. Der Titel existiert nicht — ein JA ist eine Erfindung.',
    PRAESENZ + 'Wohnraumoffensive 2030',
    { topicsCovered: ['nein'], answerMustNotContain: ['Länderrat', 'Bundesdelegiertenkonferenz'] },
    'fast'
  ),
  nb(
    'bgst-praesenz-verwechslung',
    'Typ-2-Item P10, im Goldset ausdrücklich als Verwechslungsprobe geführt: der Titel liegt nah am tatsächlich vorhandenen Statut.',
    PRAESENZ + 'Statut gegen Diskriminierung am Arbeitsplatz',
    { topicsCovered: ['nein'] },
    'fast'
  ),

  // ——— Typ 4: Falschpräsenz gegen den echten Bestand ———
  nb(
    'bgst-korpus-abstain-stromsteuer',
    'Typ-4-Item F1, im Goldset eines der beiden schärfsten: das Thema ist im Bestand breit behandelt, das Datum steht nirgends.',
    NADEL + 'Bis wann soll laut Beschlusslage die Stromsteuer vollständig abgeschafft sein?',
    { abstains: true }
  ),
  nb(
    'bgst-korpus-abstain-beschwerdestellen',
    'Typ-4-Item F4. Beschwerdestrukturen sind geregelt, eine Anzahl je Landesverband ist es nicht.',
    NADEL +
      'Wie viele Beschwerdestellen sollen laut Beschluss pro Landesverband eingerichtet werden?',
    { abstains: true }
  ),

  // ——— Typ 1: Inventar. Tabelle oder KEIN TREFFER, nichts dazwischen ———
  nb(
    'bgst-inventar-einzeltreffer',
    'Typ-1-Item I12, im Goldset als Einzeltrefferfall geführt — die Form, in der ein Inventar am ehesten mit Weltwissen aufgefüllt wird.',
    'Durchsuche ausschließlich die dir vorliegenden Beschlussdokumente.\n\n' +
      'Frage: Welche Beschlüsse enthalten Aussagen zu der Erbschaftsteuer?\n\n' +
      'Antworte nur mit einer Tabelle, ohne Fließtext:\n' +
      '| Titel | Gremium | Beschlussdatum | Fundstelle (Abschnitt oder Stichwort) |\n\n' +
      'Wenn kein Dokument einschlägig ist, schreibe genau: KEIN TREFFER. ' +
      'Ergänze nichts aus eigenem Wissen.',
    { topicsCovered: ['| Titel |kein treffer'], grounded: true }
  ),

  // ——— Typ 5: Disambiguierung ———
  nb(
    'bgst-disambiguierung-gremium',
    'Typ-5-Item D3, im Goldset das härteste Einzelitem: zwei Fassungen desselben Titels, verschiedene Gremien, dasselbe Datum. Wer eines nennt, hat die Hälfte weggelassen.',
    'Beantworte ausschließlich aus den vorliegenden Beschlussdokumenten.\n\n' +
      'Frage: Es gibt einen Beschluss „Erneuerung, die uns stärker macht". Von ' +
      'welchem Gremium stammt er?\n\n' +
      'Nenne alle in Frage kommenden Dokumente mit Titel, Gremium und Datum. Wenn ' +
      'mehrere Dokumente denselben oder einen sehr ähnlichen Titel tragen, liste ' +
      'sie alle auf und erkläre, wodurch sie sich unterscheiden.',
    { topicsCovered: ['bundesvorstand', 'parteirat'], grounded: true }
  ),

  // ——— Ceiling K0/K1: die Diagnosestufen unter den K3-Items ———
  //
  // Erst der Vergleich der Stufen sagt, WO ein Fehlschlag sitzt. Die
  // Entscheidungsregel des Prüfplans:
  //   K0 scheitert, K1 gelingt   → abfrageabhängig, per Prompt behebbar
  //   K0–K1 scheitern, K2 gelingt → nur mit Abschnittswissen behebbar
  //   K0–K2 scheitern, K3 gelingt → das Retrieval ist die Ursache
  //   auch K3 scheitert           → Verständnis- oder Generierungsproblem
  // K3 läuft im deterministischen Korpus, K0/K1 hier — die Regel ist also erst
  // auswertbar, wenn beide Lanes gegen dasselbe System gelaufen sind.
  nb(
    'bgst-ceiling-k0-strafnorm',
    'Ceiling S1, Stufe K0 (blind). Gegenstück zu bgst-k3-strafnorm im deterministischen Korpus.',
    'Welche Vorschrift des Strafgesetzbuchs soll ausgeweitet werden, damit ohne ' +
      'Einwilligung erzeugte sexuelle Darstellungen einer Person erfasst werden? ' +
      'Nenne die Paragrafennummer.\n\n' +
      'Antwortformat: (a) die Angabe, (b) Dokument und Abschnitt, aus dem sie ' +
      'stammt. Keine Erläuterung. Ist die Angabe im verfügbaren Material nicht ' +
      'enthalten, antworte ausschließlich: NICHT ENTHALTEN.',
    { topicsCovered: ['184k'], answerMustNotContain: ['(a) § 177', '(a) § 201a'], grounded: true }
  ),
  nb(
    'bgst-ceiling-k1-strafnorm',
    'Ceiling S1, Stufe K1 (Titel, Gremium und Datum vorab genannt).',
    'Beschluss „Schutz vor digitaler Gewalt wirksam stärken — Geschlechtsspezifische ' +
      'Online-Hetze, Cyberstalking und KI-gestützte Übergriffe bekämpfen", ' +
      'Bundesfrauenrat, Beschlussdatum 18.04.2026.\n\n' +
      'Welche Vorschrift des Strafgesetzbuchs soll ausgeweitet werden, damit ohne ' +
      'Einwilligung erzeugte sexuelle Darstellungen einer Person erfasst werden? ' +
      'Nenne die Paragrafennummer.\n\n' +
      'Antwortformat: (a) die Angabe, (b) Dokument und Abschnitt, aus dem sie ' +
      'stammt. Keine Erläuterung. Ist die Angabe im verfügbaren Material nicht ' +
      'enthalten, antworte ausschließlich: NICHT ENTHALTEN.',
    { topicsCovered: ['184k'], answerMustNotContain: ['(a) § 177', '(a) § 201a'], grounded: true }
  ),
  nb(
    'bgst-ceiling-k0-ombudsleute',
    'Ceiling S5, Stufe K0. Das Goldset wertet einen der beiden Namen als Fehler — und nennt die Namen, die in den Läufen stattdessen auftauchten.',
    'Welche beiden externen Anwält*innen wurden beauftragt, die bisherige Praxis der ' +
      'Ombudsverfahren zu untersuchen und Empfehlungen für deren künftige ' +
      'Ausgestaltung vorzulegen? Nenne beide Namen.\n\n' +
      'Antwortformat: (a) die Angabe, (b) Dokument und Abschnitt, aus dem sie ' +
      'stammt. Keine Erläuterung. Ist die Angabe im verfügbaren Material nicht ' +
      'enthalten, antworte ausschließlich: NICHT ENTHALTEN.',
    { topicsCovered: ['Lütkes', 'Montag'], grounded: true }
  ),
];

writeFileSync(OUT, scenarios.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8');
console.log(`[bgst-korpus] wrote ${scenarios.length} scenarios → ${OUT}`);
