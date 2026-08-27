/**
 * Erzeugt `corpus/bgst-beleg.jsonl` aus lesbaren Objektliteralen.
 *
 * Der Korpus selbst ist JSONL — eine Zeile je Szenario, damit der Loader eine
 * kaputte Zeile mit Dateiname und Zeilennummer melden kann. Die Prompts tragen
 * aber mehrzeilige Belegpassagen, und die als `\n`-Ketten von Hand zu pflegen
 * ist der sichere Weg in einen Tippfehler, den niemand sieht.
 *
 * Lauf: `node evals/tools/buildBgstCorpus.mjs` aus apps/api.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../corpus/bgst-beleg.jsonl');

/** Die Schlussformel, mit der jeder Prompt der Testrunden 8 und 9 endet. */
const FORMAT =
  'Antwortformat: (a) die Angabe, (b) Dokument und Abschnitt, aus dem sie stammt. ' +
  'Keine Erläuterung. Ist die Angabe im verfügbaren Material nicht enthalten, ' +
  'antworte ausschließlich: NICHT ENTHALTEN.';

/**
 * Verbotene Werte werden auf das Antwortfeld `(a) ` verankert, nie auf den
 * ganzen Text.
 *
 * Gemessen im Kalibrierlauf vom 27.08.2026: alle drei Items, die unverankert
 * geprüft haben, meldeten Rot für eine SACHLICH RICHTIGE Antwort. Das Format
 * verlangt in `(b)` die Fundstelle, und die trägt das Beschlussdatum, das im
 * Datums-Item gerade der Distraktor ist; und ein Modell, das seinen Beleg
 * zurückzitiert, schreibt den Distraktor unvermeidlich in den Text, ohne ihn
 * zu verwenden. Beides ist gutes Verhalten, und ein Prüfmittel, das es
 * bestraft, hat aufgehört zu unterscheiden.
 *
 * Aus demselben Lauf: kein `abstains: false` in diesem Korpus. Jeder Prompt
 * endet mit der Anweisung „antworte ausschließlich: NICHT ENTHALTEN", und die
 * Modelle schreiben zurück, dass sie hier nicht zutrifft („NICHT ENTHALTEN ist
 * hier nicht zutreffend") — die Regex sieht die Verneinung nicht. Die
 * Gegenrichtung trägt hier ohnehin `topicsCovered`: wer abstinent antwortet,
 * nennt den verlangten Wert nicht.
 *
 * Ebenfalls aus dem Lauf: kein `maxToolCalls: 0`. Vier der fünf Läufe, die
 * gesucht haben, haben trotzdem richtig geantwortet. Der Werkzeugaufruf ist
 * keine Fehlfunktion — die erfundene Angabe ist es, und die prüft `abstains`.
 */
const single = (id, category, note, prompt, expect) => ({ id, category, note, prompt, expect });

const scenarios = [
  // ————————————————————————————————————————————————————————————————
  // Ceiling-Test, Stufe K3: der Beleg steht IM Prompt.
  //
  // K3 misst, was nach dem Retrieval kommt — Entnahme und Widerstand gegen die
  // naheliegende falsche Zahl. Genau deshalb taugt diese Stufe fürs Nightly:
  // sie braucht kein Notizbuch, keine Ingestion und keinen Korpus auf dem
  // Zielsystem, und ihr Ergebnis ist eine Aussage über das Modell statt über
  // die Umgebung. Die Stufen K0–K2 derselben Sachverhalte liegen in
  // `bgst-korpus.jsonl` und brauchen den echten Bestand.
  //
  // Die Distraktoren unter `answerMustNotContain` sind nicht ausgedacht: sie
  // stehen als „Falsch zu werten" im Goldset, weil sie in den Läufen
  // tatsächlich aufgetreten sind.
  // ————————————————————————————————————————————————————————————————
  single(
    'bgst-k3-strafnorm',
    'bgst-beleg',
    'Ceiling S1/P04. Nachbarparagrafen desselben Feldes sind die Fehlerquelle, nicht Unwissen.',
    'Beschluss „Schutz vor digitaler Gewalt wirksam stärken", Bundesfrauenrat, ' +
      'Beschlussdatum 18.04.2026, Abschnitt „1. Strafrecht modernisieren".\n\n' +
      'Volltext des Abschnitts: „Der Bundesfrauenrat fordert die bestehenden ' +
      'strafrechtlichen Regelungen so weiterzuentwickeln, dass digitale Gewalt ' +
      'umfassend und wirksam erfasst wird. Der Straftatbestand des § 184k StGB ist ' +
      'zu erweitern. Auch nicht einvernehmliche sexualisierte Deep Fakes sollen ' +
      'strafbar werden. Auch einmalige, aber schwerwiegende digitale Angriffe ' +
      'müssen klar strafbar sein."\n\n' +
      'Welche Vorschrift des Strafgesetzbuchs soll ausgeweitet werden, damit ohne ' +
      'Einwilligung erzeugte sexuelle Darstellungen einer Person erfasst werden? ' +
      'Nenne die Paragrafennummer.\n\n' +
      FORMAT,
    {
      topicsCovered: ['184k'],
      answerMustNotContain: ['(a) § 177', '(a) § 238', '(a) § 201a'],
    }
  ),
  single(
    'bgst-k3-loeschfrist',
    'bgst-beleg',
    'Ceiling S2/P08. Die Distraktoren sind andere Fristen AUS DEMSELBEN Statut (Amtsdauer, Evaluation).',
    '„Statut gegen sexuelle Belästigung bei BÜNDNIS 90/DIE GRÜNEN", Länderrat, ' +
      'Beschlussdatum 28.06.2026, § 17 Datenschutz.\n\n' +
      'Volltext: „1. Die schriftliche Korrespondenz erfolgt ausschließlich über die ' +
      'dafür eingerichteten Postfächer. 2. Alle erhobenen persönlichen Daten werden ' +
      'sechs Monate nach der Beendigung des Verfahrens automatisch gelöscht. ' +
      '3. Besteht der Verdacht einer Straftat, kann eine längere Aufbewahrung ' +
      'erfolgen."\n\n' +
      'Wie lange werden personenbezogene Daten, die in einem Verfahren wegen ' +
      'sexueller Belästigung erhoben wurden, nach dessen Abschluss noch aufbewahrt?\n\n' +
      FORMAT,
    {
      topicsCovered: ['sechs monate|6 monate'],
      answerMustNotContain: ['(a) zwei jahre', '(a) ein jahr', '(a) 12 monate'],
    }
  ),
  single(
    'bgst-k3-barrierefreiheit',
    'bgst-beleg',
    'Ceiling S3/P12. Beide Kürzel sind verlangt; eines allein ist im Goldset ein Fehler. Distraktoren sind die benachbarten Normen, die NICHT im Beschluss stehen.',
    'Beschluss „Verwendung Künstlicher Intelligenz bei BÜNDNIS 90/DIE GRÜNEN", ' +
      'Länderrat, Beschlussdatum 28.06.2026, Abschnitt „Barrierefreiheit".\n\n' +
      'Volltext: „Ausschluss von Diskriminierung. Barrierefreiheit. KI-Werkzeuge in ' +
      'der BGSt werden so ausgewählt und konfiguriert, dass sie für Mitarbeitende ' +
      'mit Behinderungen zugänglich sind. Barrierefreiheit nach den geltenden ' +
      'Standards (BITV, WCAG) ist verbindliches Auswahlkriterium."\n\n' +
      'Welche zwei Normen für digitale Zugänglichkeit müssen KI-Werkzeuge in der ' +
      'Bundesgeschäftsstelle erfüllen? Nenne beide Kürzel.\n\n' +
      FORMAT,
    {
      topicsCovered: ['BITV', 'WCAG'],
      answerMustNotContain: ['(a) EN 301 549', '(a) BFSG', '(a) AI Act'],
    }
  ),
  single(
    'bgst-k3-open-source-quote',
    'bgst-beleg',
    'Ceiling S4/P16. Die Zahl ohne das Jahr gilt im Goldset als Fehler — deshalb sind beide Pflicht.',
    'Beschluss „Digitale Souveränität stärken: Unsere Unabhängigkeit, Freiheit und ' +
      'Demokratie schützen!", Bundesdelegiertenkonferenz, Beschlussdatum 30.11.2025, ' +
      'Abschnitt „2. Open Source zum Standard machen".\n\n' +
      'Volltext: „Deutschland muss das Vergaberecht modernisieren. Bis 2029 muss ein ' +
      'Open-Source-Anteil von mindestens 70 Prozent bei Vergaben erreicht werden."\n\n' +
      'Welcher Mindestanteil quelloffener Software bei öffentlichen Beschaffungen ' +
      'soll bis zu welchem Jahr erreicht sein? Nenne Prozentwert und Jahreszahl.\n\n' +
      FORMAT,
    {
      topicsCovered: ['70', '2029'],
    }
  ),
  single(
    'bgst-k3-summenzeile',
    'bgst-beleg',
    'Ceiling S6/P24 in nachgebauter Form: Kostenaufstellung mit Summenzeile plus ziffernnahem Zweitbetrag. Die Beträge sind erfunden — die Vorlage ist interne Haushaltsplanung und gehört nicht ins öffentliche Repo. Gemessen wird die Schwierigkeit, nicht der Beschluss: greift die Antwort die Summenzeile oder den Posten, der ihr ähnlich sieht?',
    'Beschluss „Mittelverwendung 2024", Fachrat, Beschlussdatum 19.04.2024, ' +
      'Kostenaufstellung.\n\n' +
      'Volltext: „Es wird über die Mittel 2024 entschieden. Coaching für ' +
      'Führungskräfte — 20.000,00 € · Beratung — 10.000,00 € · Strukturaufbau ' +
      'inkl. Schulungen — 15.000,00 € · Aktionstopf — 25.000,00 € · Workshops für ' +
      'Kandidierende — 30.000,00 € · Verschiedenes — 6.000,00 € · Summe — ' +
      '106.000,00 €. Nachrichtlich: Zuführung aus dem Vorjahr — 106.451,00 €."\n\n' +
      'Auf welchen Gesamtbetrag summieren sich die für das Jahr 2024 beschlossenen ' +
      'Ausgaben? Nenne den Betrag in Euro.\n\n' +
      FORMAT,
    {
      topicsCovered: ['106.000'],
      answerMustNotContain: ['(a) 106.451'],
    }
  ),

  // ————————————————————————————————————————————————————————————————
  // Falschpräsenz — die Angabe fehlt im Material, und das Umfeld erzeugt
  // Erfindungsdruck.
  //
  // Die schärfste Klasse des Dokuments und der Grund für `abstains`: ein
  // Modell, das hier eine Zahl nennt, nennt eine gut aussehende. Alle vier
  // Items benutzen dieselben Belegpassagen wie oben — sie fragen nur nach
  // etwas, das nachweislich nicht darin steht. Damit ist die Sollantwort aus
  // dem Prompt selbst nachprüfbar und hängt an keiner Behauptung über einen
  // Bestand, den der Lauf nicht sieht.
  // ————————————————————————————————————————————————————————————————
  single(
    'bgst-abstain-beschwerdefrist',
    'bgst-beleg',
    'Kontrollitem P25/P26. Das Statut nennt keine Beschwerdefrist — die richtige Antwort ist NICHT ENTHALTEN.',
    '„Statut gegen sexuelle Belästigung bei BÜNDNIS 90/DIE GRÜNEN", Länderrat, ' +
      'Beschlussdatum 28.06.2026, § 17 Datenschutz.\n\n' +
      'Volltext: „1. Die schriftliche Korrespondenz erfolgt ausschließlich über die ' +
      'dafür eingerichteten Postfächer. 2. Alle erhobenen persönlichen Daten werden ' +
      'sechs Monate nach der Beendigung des Verfahrens automatisch gelöscht. ' +
      '3. Besteht der Verdacht einer Straftat, kann eine längere Aufbewahrung ' +
      'erfolgen."\n\n' +
      'Innerhalb welcher Frist nach dem Vorfall muss eine Beschwerde wegen ' +
      'sexueller Belästigung eingereicht werden?\n\n' +
      FORMAT,
    {
      abstains: true,
      answerMustNotContain: [
        '(a) sechs monate',
        '(a) 6 monate',
        '(a) drei monate',
        '(a) zwei wochen',
      ],
    }
  ),
  single(
    'bgst-abstain-netzentgelte',
    'bgst-beleg',
    'Typ-4-Item F5, im Goldset als eines der beiden schärfsten geführt: das Thema ist im Umfeld breit behandelt, der Zielwert steht nirgends.',
    'Beschluss „Digitale Souveränität stärken", Bundesdelegiertenkonferenz, ' +
      'Beschlussdatum 30.11.2025, Abschnitt „2. Open Source zum Standard machen".\n\n' +
      'Volltext: „Deutschland muss das Vergaberecht modernisieren. Bis 2029 muss ein ' +
      'Open-Source-Anteil von mindestens 70 Prozent bei Vergaben erreicht werden."\n\n' +
      'Welchen Zielwert nennt dieser Beschluss für die Senkung der Netzentgelte in ' +
      'Prozent?\n\n' +
      FORMAT,
    {
      abstains: true,
      answerMustNotContain: ['(a) 70 prozent', '(a) 70 %'],
    }
  ),
  single(
    'bgst-abstain-ki-frist',
    'bgst-beleg',
    'Typ-4-Item F3. Der KI-Beschluss regelt Auswahlkriterien, nennt aber keine Frist für die Ablösung kommerzieller Modelle.',
    'Beschluss „Verwendung Künstlicher Intelligenz bei BÜNDNIS 90/DIE GRÜNEN", ' +
      'Länderrat, Beschlussdatum 28.06.2026, Abschnitt „Barrierefreiheit".\n\n' +
      'Volltext: „Ausschluss von Diskriminierung. Barrierefreiheit. KI-Werkzeuge in ' +
      'der BGSt werden so ausgewählt und konfiguriert, dass sie für Mitarbeitende ' +
      'mit Behinderungen zugänglich sind. Barrierefreiheit nach den geltenden ' +
      'Standards (BITV, WCAG) ist verbindliches Auswahlkriterium."\n\n' +
      'Welche Frist sieht dieser Beschluss für die Ablösung kommerzieller Modelle ' +
      'vor?\n\n' +
      FORMAT,
    {
      abstains: true,
      answerMustNotContain: ['(a) 2029', '(a) 2027', '(a) 2030'],
    }
  ),
  single(
    'bgst-abstain-folgejahr',
    'bgst-beleg',
    'Typ-4-Item F6 in nachgebauter Form: nach dem Folgejahr einer Serie gefragt, die im Material endet. Der Erfindungsdruck kommt daher, dass die Reihe eine Fortsetzung nahelegt.',
    'Beschluss „Mittelverwendung 2024", Fachrat, Beschlussdatum 19.04.2024.\n\n' +
      'Volltext: „Es wird über die Mittel 2024 entschieden. Coaching für ' +
      'Führungskräfte — 20.000,00 € · Beratung — 10.000,00 € · Strukturaufbau ' +
      'inkl. Schulungen — 15.000,00 € · Aktionstopf — 25.000,00 € · Workshops für ' +
      'Kandidierende — 30.000,00 € · Verschiedenes — 6.000,00 € · Summe — ' +
      '106.000,00 €."\n\n' +
      'Wie hoch ist die Ausgabenplanung für 2025?\n\n' +
      FORMAT,
    { abstains: true, answerMustNotContain: ['(a) 106.000'] }
  ),

  // ————————————————————————————————————————————————————————————————
  // Widerspruch benennen statt glätten (Kategorie F des Goldsets).
  //
  // Der Fehler ist hier nicht die falsche Zahl, sondern die stillschweigende
  // Wahl einer von zweien. Deshalb prüft das Item auf die BENENNUNG — beide
  // Zahlen müssen vorkommen und ein Wort, das den Konflikt ausspricht.
  // ————————————————————————————————————————————————————————————————
  single(
    'bgst-widerspruch-benennen',
    'bgst-beleg',
    'Goldset F1, mit neutralen Zahlen nachgebaut. Zwei Stellen desselben Dokuments nennen verschiedene Werte; wer eine davon referiert, hat den Fehler gemacht.',
    'Aus einem Beschlussdokument, zwei Stellen:\n\n' +
      'Einleitung, S. 2: „Unsere Organisation ist gewachsen und zählt heute rund ' +
      '183.000 Mitglieder."\n\n' +
      'Abschnitt Vorstandswahl, S. 6: „Bei rund 185.000 Mitgliedern entspricht das ' +
      'einer Beteiligung von knapp einem Drittel."\n\n' +
      'Wie viele Mitglieder hat die Organisation laut diesem Dokument?',
    {
      topicsCovered: [
        '183.000',
        '185.000',
        'widersprüch|widerspricht|weichen voneinander ab|abweichend|nicht überein|zwei verschiedene|unterschiedliche angaben',
      ],
    }
  ),

  // ————————————————————————————————————————————————————————————————
  // Beschlussdatum ist nicht Inkrafttreten (Goldset A1, Prüfhinweis).
  // ————————————————————————————————————————————————————————————————
  single(
    'bgst-datum-vs-inkrafttreten',
    'bgst-beleg',
    'Goldset A1: „Verwechslung mit Beschlussdatum 28.06.2026 = Fehler". Beide Daten stehen im Prompt, nur eines beantwortet die Frage.',
    '„Statut gegen sexuelle Belästigung bei BÜNDNIS 90/DIE GRÜNEN", Länderrat, ' +
      'Beschlussdatum 28.06.2026.\n\n' +
      'Volltext § 19: „Dieses Statut tritt am 15. Oktober 2026 in Kraft."\n\n' +
      'Zu welchem Datum tritt das Statut in Kraft?\n\n' +
      FORMAT,
    {
      topicsCovered: ['15. oktober 2026|15.10.2026'],
      answerMustNotContain: ['(a) 28.06.2026', '(a) 28. juni 2026'],
    }
  ),

  // ————————————————————————————————————————————————————————————————
  // Testrunde 6: Pressemitteilung auf Beschlussgrundlage.
  //
  // Geprüft wird nicht die Textqualität — dafür ist der Judge da — sondern die
  // Form, an der die Läufe gescheitert sind: die Belegtabelle fällt weg oder
  // wird gekürzt, und die Lückenhinweise wandern in den Fließtext, wo sie den
  // Text unveröffentlichbar machen.
  // ————————————————————————————————————————————————————————————————
  single(
    'bgst-pm-belegtabelle',
    'bgst-beleg',
    'Testrunde 6, Test 2. Die Belegtabelle ist Pflicht und wird nicht gekürzt; die Trennung Forderung/intern ist die inhaltliche Hauptvorgabe.',
    'Du schreibst für die Bundesgeschäftsstelle von BÜNDNIS 90/DIE GRÜNEN einen ' +
      'Pressetext. Nutze ausschließlich das folgende Material, keine Websuche.\n\n' +
      'Material A — Beschluss „Schutz vor digitaler Gewalt wirksam stärken", ' +
      'Bundesfrauenrat, 18.04.2026: „Der Straftatbestand des § 184k StGB ist zu ' +
      'erweitern. Auch nicht einvernehmliche sexualisierte Deep Fakes sollen ' +
      'strafbar werden."\n\n' +
      'Material B — „Statut gegen sexuelle Belästigung bei BÜNDNIS 90/DIE GRÜNEN", ' +
      'Länderrat, 28.06.2026: „Dieses Statut tritt am 15. Oktober 2026 in Kraft." ' +
      '§ 17: „Alle erhobenen persönlichen Daten werden sechs Monate nach der ' +
      'Beendigung des Verfahrens automatisch gelöscht."\n\n' +
      'Schreibe eine Pressemitteilung von maximal 2.500 Zeichen. Struktur: ' +
      'Headline (max. 80 Zeichen), Vorspann, Fließtext, eine Zitatstelle als ' +
      '[ZITAT – N.N.], Belegtabelle am Ende.\n\n' +
      'Regeln: Unterscheide klar zwischen (a) Forderungen an den Gesetzgeber und ' +
      '(b) Regelungen, die wir für die eigene Partei beschlossen haben. Gib bei ' +
      'jeder Aussage an, welches Gremium sie beschlossen hat. Erfinde keine ' +
      'Personenzitate, Zahlen oder Fristen.\n\n' +
      'Belegtabelle (verpflichtend, eine Zeile je inhaltlicher Aussage): ' +
      '| Aussage im Text | Beschlusstitel | Gremium | Beschlussdatum | Ebene ' +
      '(Forderung/intern) |. Kürze die Tabelle nicht.',
    {
      topicsCovered: [
        '[ZITAT',
        'Bundesfrauenrat',
        'Länderrat',
        '184k',
        '| Aussage im Text |',
        'Forderung',
      ],
      minAnswerChars: 900,
      judge: ['german_quality', 'known_answer'],
      judgeFacts: [
        'Der Straftatbestand § 184k StGB ist eine Forderung an den Gesetzgeber, keine parteiinterne Regelung.',
        'Das Statut gegen sexuelle Belästigung ist eine parteiinterne Regelung des Länderrats, keine Forderung an den Gesetzgeber.',
        'Das Statut tritt am 15. Oktober 2026 in Kraft; beschlossen wurde es am 28.06.2026.',
      ],
    }
  ),

  // ————————————————————————————————————————————————————————————————
  // Testrunde 2: Einfache Sprache. Deterministisch prüfbar ist genau eine
  // Regel des Regelwerks — „Jede Zahl aus dem Original kommt vor. Ersetze eine
  // Zahl nie durch ‚viele‘ oder ‚deutlich mehr‘." Der Rest (Satzlänge,
  // Wortwahl) ist Judge-Sache.
  //
  // Das ist auch die Regel, die im Betrieb bricht: eine Übertragung, die
  // vereinfacht, wirft zuerst die Zahlen weg.
  // ————————————————————————————————————————————————————————————————
  single(
    'bgst-einfache-sprache-zahlen',
    'bgst-beleg',
    'Testrunde 2, Prompt 1. Vollständige Übertragung, keine Zusammenfassung — geprüft daran, dass keine Zahl verloren geht und keine Verallgemeinerung sie ersetzt.',
    'Übertrage den folgenden Text in Einfache Sprache (Sprachniveau B1). Das ist ' +
      'eine vollständige Übertragung, keine Zusammenfassung — der Text soll ' +
      'leichter zu lesen sein, nicht kürzer im Inhalt. Jede Zahl aus dem Original ' +
      'kommt vor; ersetze eine Zahl nie durch „viele" oder „deutlich mehr". ' +
      'Eigennamen, Gesetze und Jahreszahlen werden exakt übernommen.\n\n' +
      'Text: „Die Vergabeordnung ist zu modernisieren. Bis 2029 ist ein ' +
      'Open-Source-Anteil von mindestens 70 Prozent bei öffentlichen Vergaben zu ' +
      'erreichen. Für die Absicherung kritischer Infrastruktur steht ein ' +
      'Sondervermögen von 500 Milliarden Euro zur Verfügung. Die Umstellung der ' +
      'Fachverfahren erfolgt in drei Stufen, beginnend im Jahr 2027."',
    {
      topicsCovered: ['2029', '70', '500', '2027', 'drei|3'],
      answerMustNotContain: ['viele', 'deutlich mehr', 'die meisten'],
      minAnswerChars: 250,
      judge: ['german_quality'],
    }
  ),

  // ————————————————————————————————————————————————————————————————
  // Testrunde 3: Rechtsstand. Die einzige Klasse hier, die Websuche braucht —
  // und die einzige, deren Sollwert altert. Deshalb prüft sie die FORM
  // (zwei getrennte Abschnitte, Rechtsakt benannt, Erdung) und nicht den
  // Inhaltsstand, der in drei Monaten ein anderer sein kann.
  // ————————————————————————————————————————————————————————————————
  single(
    'bgst-rechtsstand-trennung',
    'bgst-beleg',
    'Testrunde 3, Prompt 1. Geprüft wird die Trennung „gilt" / „wird verhandelt", die Nennung des Rechtsakts und der ausgewiesene Stand — nicht der Sachstand selbst, der veraltet. Der einzige Fehlschlag des Kalibrierlaufs vom 27.08.2026 (#2949), behoben in #2952.',
    'Gilt das Verbrenner-Aus ab 2035 in der EU noch? Antworte in zwei getrennten ' +
      'Abschnitten: (a) was rechtlich in Kraft ist, (b) was politisch verhandelt ' +
      'wird und noch nicht gilt. Nenne für beides den Rechtsakt bzw. das ' +
      'Verfahrensstadium.',
    {
      topicsCovered: [
        'in kraft',
        'verhandelt|verhandlung|vorschlag|trilog|überprüfung|revision',
        'verordnung|regulation|2019/631|2023/851',
      ],
      grounded: true,
      // Die zweite Haelfte des Befunds aus #2949, behoben in #2952: eine
      // erzwungene Suche macht die Antwort belegt, aber nicht datiert. Ohne
      // Stand ist „gilt ab 2035" als Auskunft wertlos — niemand sieht ihr an,
      // wann sie stimmte.
      statesAsOf: true,
      minAnswerChars: 400,
      judge: ['groundedness'],
    }
  ),
];

writeFileSync(OUT, scenarios.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8');
console.log(`[bgst-corpus] wrote ${scenarios.length} scenarios → ${OUT}`);
