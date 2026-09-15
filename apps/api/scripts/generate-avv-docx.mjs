// Generates a clean Word (.docx) of the updated Muster:
//   Leistungsvereinbarung + Vereinbarung zur Auftragsverarbeitung (AVV) + Anhänge.
// Wording stays close to the source .txt; provider details are corrected against
// the codebase (Gladia→Regolo/Seeweb; no chat "Ultra mode"; GlitchTip self-hosted;
// + Italien als Verarbeitungsort; Claude entfernt; Black Forest Labs EU / Entität offen).
//
// Stand 11.08.2026: § 2 zur Modellwahl in der Fassung der Kanzlei (Rückmeldung
// vom 11.08.2026) — im Chat wählbar mit Voreinstellung „Automatisch", sonst je
// Funktionstyp fest vorgegeben. Die Anbieterangaben weichen davon ab, weil die
// Kanzlei noch IONOS führt (hier nicht mehr angebunden) und GreenPT/Scaleway
// nicht kennt; die Transkription läuft laut `TRANSCRIPTION_CHAIN` über Voxtral
// und GreenPT, nicht mehr über Regolo. Quelle der Wahrheit sind `ProviderName`
// (`services/ai/providers.ts`) und `TRANSCRIPTION_CHAIN`
// (`services/transcription/providerPolicy.ts`), nicht dieses Dokument.
//
// Run:  node apps/api/scripts/generate-avv-docx.mjs
// Output: <repo-root>/legal-exports/Leistungsvereinbarung_und_AVV_Gruenerator.docx

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../../legal-exports');

// --- Inline markup parser: **bold** and [[text|url]] ----------------------
function inlineRuns(text) {
  const runs = [];
  const linkRe = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
  let last = 0;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) runs.push(...boldRuns(text.slice(last, m.index)));
    runs.push(
      new ExternalHyperlink({
        link: m[2],
        children: [new TextRun({ text: m[1], style: 'Hyperlink' })],
      })
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(...boldRuns(text.slice(last)));
  return runs;
}
function boldRuns(text) {
  const parts = text.split('**');
  const runs = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '') continue;
    runs.push(new TextRun({ text: parts[i], bold: i % 2 === 1 }));
  }
  return runs;
}

const HEADING_BY_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
};
function title(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 36 })],
    spacing: { after: 240 },
  });
}
function heading(level, text) {
  return new Paragraph({
    children: inlineRuns(text),
    heading: HEADING_BY_LEVEL[level],
    spacing: { before: level <= 2 ? 320 : 220, after: 110 },
  });
}
function para(text) {
  return new Paragraph({ children: inlineRuns(text), spacing: { after: 130 } });
}
function bullet(text, level = 0) {
  return new Paragraph({ children: inlineRuns(text), bullet: { level }, spacing: { after: 50 } });
}
function buildTable(head, rows) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text) =>
    new TableCell({
      borders,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: text
        .split('\n')
        .map((line) => new Paragraph({ children: inlineRuns(line), spacing: { after: 0 } })),
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h) => cell(`**${h}**`)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
    ],
  });
}
function render(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.title) out.push(title(b.title));
    else if (b.h) out.push(heading(b.h, b.text));
    else if (b.p !== undefined) out.push(para(b.p));
    else if (b.li !== undefined) out.push(bullet(b.li, b.level || 0));
    else if (b.table) out.push(buildTable(b.table.head, b.table.rows));
    else if (b.spacer) out.push(new Paragraph({ children: [], spacing: { after: 80 } }));
    else if (b.rule)
      out.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } },
          spacing: { before: 160, after: 160 },
        })
      );
  }
  return out;
}

// =========================================================================
const content = [
  { title: 'Leistungsvereinbarung und Vereinbarung zur Auftragsverarbeitung' },
  { p: '**Muster** – Stand: 2. September 2026' },
  {
    p: 'Dieses Dokument besteht aus der Leistungsvereinbarung (Teil A), der ihr als Anlage beigefügten Vereinbarung zur Auftragsverarbeitung (Teil B) sowie den zugehörigen Anhängen (Weisungsbefugnis, technisch-organisatorische Maßnahmen, Subunternehmen).',
  },

  { rule: true },
  { h: 2, text: 'Teil A – Leistungsvereinbarung' },
  { p: 'zwischen der' },
  { p: '**[Verantwortliche Stelle / öffentliche Stelle]**, vertreten durch [Name]' },
  { p: '– nachfolgend „Auftraggeber" bzw. „Verantwortlicher" –' },
  { p: 'und' },
  { p: '**Moritz Wächter (Grünerator)**, Villestraße 6–8, 53347 Alfter' },
  { p: '– nachfolgend „Auftragnehmer" bzw. „Auftragsverarbeiter" –' },
  { p: '– beide nachfolgend gemeinsam „Vertragsparteien" –' },

  { h: 3, text: '§ 1 Vertragsgegenstand' },
  {
    p: '(1) Gegenstand dieser Vereinbarung ist die Bereitstellung und Nutzung der KI-gestützten Content-Erstellungsplattform **GRUENERATOR** (erreichbar unter [[https://gruenerator.eu|https://gruenerator.eu]]) durch den Auftragnehmer für den Auftraggeber.',
  },
  {
    p: '(2) Der Auftragnehmer stellt die Plattform im Auftrag und in Zusammenarbeit mit der [[netzbegrünung – Verein für grüne Netzkultur e.V.|https://netzbegruenung.de/]] bereit.',
  },

  { h: 3, text: '§ 2 Leistungsbeschreibung' },
  { p: '(1) Die Plattform bietet insbesondere folgende Funktionen:' },
  {
    li: '**KI-Textgenerierung:** Erstellung von Pressemitteilungen, Social-Media-Beiträgen, Reden und weiteren Texten. Im Chat ist das Modell wählbar (Voreinstellung „Automatisch"); bei den übrigen Generatorfunktionen ist der Dienstleister je Funktionstyp fest vorgegeben. Eingesetzt werden ausschließlich Dienstleister mit Verarbeitung in der EU (Mistral AI/FR, eigene KI-Modelle der netzbegrünung e.V./EU, Seeweb/Regolo AI/IT, GreenPT BV/NL mit Verarbeitung in FR; Mistral Medium 3.5 läuft auf Rechenleistung von Scaleway/FR)',
  },
  {
    li: '**Bildbearbeitung und -generierung:** Sharepics und Grafiken (Grünerator Imagine, FLUX-Modell von Black Forest Labs; Verarbeitung in der EU)',
  },
  {
    li: '**Audio- und Videotranskription:** Umwandlung von Sprach- und Videoaufnahmen in Text (Reel-Grünerator) vorrangig über Mistral AI Voxtral (FR), ersatzweise über GreenPT (Verarbeitung in FR; keine dauerhafte Speicherung der Audio-Eingaben)',
  },
  {
    li: '**Notebooks:** KI-gestützte Frage-Antwort-Funktion zu Parteiprogrammen, Beschlüssen und weiteren Dokumenten (Vektorsuche)',
  },
  {
    li: '**Kollaborative Dokumentenbearbeitung:** gemeinsames Erstellen und Bearbeiten von Texten in Echtzeit',
  },
  { li: '**Web-Recherche:** agentische Recherche mit Quellenangaben (Linkup, SearXNG)' },
  {
    li: '**Sprachverarbeitung & Echtzeit-Sprachdialog (Voice Agent):** Spracherkennung (Voxtral) und Sprachausgabe (KugelAudio)',
  },
  {
    p: '(2) Konkret bereitgestellt wird für den Auftraggeber in der Regel ein dediziertes **Notebook**, in das die vom Auftraggeber bereitgestellten Inhalte eingepflegt (eingelesen und indexiert) werden, um eine KI-gestützte Recherche und Frage-Antwort-Funktion auf diesen Inhalten zu ermöglichen. Die Einpflege erfolgt in der Regel automatisiert durch Auslesen (Scraping) der vom Auftraggeber benannten Webseiten; in Ausnahmefällen ist auch eine manuelle Bereitstellung und Einpflege möglich.',
  },
  {
    p: '(3) Der Auftragnehmer ist berechtigt, den Funktionsumfang der Plattform zu erweitern, einzuschränken oder zu verändern, sofern dies für den Auftraggeber zumutbar ist und das Datenschutzniveau nicht unterschritten wird.',
  },

  { h: 3, text: '§ 3 Gegenstand, Art, Umfang und Zweck der Datenverarbeitung' },
  {
    p: '(1) Im Rahmen der Leistungserbringung verarbeitet der Auftragnehmer personenbezogene Daten ausschließlich auf Weisung und im Auftrag des Auftraggebers. Einzelheiten regelt die als Anlage beigefügte Vereinbarung zur Auftragsverarbeitung (Teil B).',
  },
  {
    p: '(2) **Art und Zweck:** KI-gestützte Erstellung, Bearbeitung und Abruf von Inhalten sowie die zugehörigen technischen Hilfsfunktionen (Transkription, Bildgenerierung, Suche, Sprachverarbeitung); einschließlich der in der Regel automatisierten Einpflege (Scraping) der vom Auftraggeber benannten Webseiten in ein Notebook und der KI-gestützten Recherche auf diesen Inhalten.',
  },
  { p: '(3) **Dauer:** für die Laufzeit dieser Leistungsvereinbarung (§ 7).' },
  {
    p: '(4) Die Kategorien personenbezogener Daten und betroffener Personen sowie der Verarbeitungsort ergeben sich aus § 2 der Vereinbarung zur Auftragsverarbeitung (Teil B).',
  },

  { h: 3, text: '§ 4 Pflichten des Auftragnehmers' },
  {
    p: '(1) Der Auftragnehmer erbringt die Leistungen mit der Sorgfalt eines ordentlichen Anbieters und unter Einhaltung der datenschutzrechtlichen Vorgaben (insbesondere DSGVO).',
  },
  {
    p: '(2) Der Auftragnehmer setzt geeignete technische und organisatorische Maßnahmen (Art. 32 DSGVO) gemäß dem Anhang „Technisch-organisatorische Maßnahmen (TOM)" um.',
  },

  { h: 3, text: '§ 5 Mitwirkungspflichten des Auftraggebers' },
  {
    p: 'Der Auftraggeber benennt weisungsberechtigte Ansprechpersonen (Anhang „Weisungsbefugnis") und stellt sicher, dass die Nutzung der Plattform im Einklang mit den Nutzungsbedingungen erfolgt; insbesondere werden keine personenbezogenen Daten Dritter ohne Rechtsgrundlage eingegeben.',
  },
  {
    p: 'Der Auftraggeber benennt zudem die für das Notebook einzupflegenden Webseiten/Quellen, verantwortet die Rechtmäßigkeit ihrer Bereitstellung (insbesondere eine Rechtsgrundlage für darin enthaltene personenbezogene Daten) und autorisiert das automatisierte Auslesen (Scraping) der benannten Webseiten durch den Auftragnehmer.',
  },

  { h: 3, text: '§ 6 Vergütung' },
  {
    p: 'Die Nutzung der Plattform ist derzeit unentgeltlich, soweit zwischen den Vertragsparteien nicht ausdrücklich etwas anderes vereinbart ist. Ein Anspruch auf dauerhafte kostenlose Bereitstellung besteht nicht.',
  },

  { h: 3, text: '§ 7 Laufzeit und Kündigung' },
  { p: '(1) Die Vereinbarung wird auf die Dauer von einem Jahr ab Unterzeichnung geschlossen.' },
  {
    p: '(2) Sie verlängert sich um jeweils ein weiteres Jahr, sofern sie nicht mit einer Frist von einem Monat zum jeweiligen Laufzeitende in Textform gekündigt wird.',
  },
  { p: '(3) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.' },
  {
    p: '(4) Nach Beendigung gelten die Regelungen zur Löschung und Rückgabe von Daten gemäß § 7 der Vereinbarung zur Auftragsverarbeitung (Teil B); die im Notebook eingepflegten Daten werden innerhalb von 30 Tagen nach Vertragsende gelöscht oder zurückgegeben, sofern keine gesetzliche Aufbewahrungspflicht entgegensteht.',
  },

  { h: 3, text: '§ 8 Datenschutz' },
  {
    p: 'Die Verarbeitung personenbezogener Daten richtet sich nach der als Anlage beigefügten Vereinbarung zur Auftragsverarbeitung (Teil B), die Bestandteil dieser Leistungsvereinbarung ist.',
  },

  { h: 3, text: '§ 9 Schlussbestimmungen' },
  { p: '(1) Änderungen und Ergänzungen bedürfen der Textform.' },
  {
    p: '(2) Sollten einzelne Regelungen unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Regelungen unberührt.',
  },

  { rule: true },
  { h: 2, text: 'Teil B – Vereinbarung zur Auftragsverarbeitung' },
  {
    p: 'Als Anlage zur Leistungsvereinbarung (Teil A) – nachfolgend „Leistungsvereinbarung" – zwischen der **[Verantwortliche Stelle / öffentliche Stelle]**, vertreten durch [Name] (– nachfolgend „Verantwortlicher" –) und **Moritz Wächter**, Villestraße 6–8, 53347 Alfter (– nachfolgend „Auftragsverarbeiter" –) – beide nachfolgend gemeinsam „Vertragsparteien" – wird die folgende Vereinbarung zur Auftragsverarbeitung geschlossen:',
  },

  { h: 3, text: 'Präambel' },
  {
    p: 'Die Vertragsparteien sind mit der Leistungsvereinbarung ein Auftragsverarbeitungsverhältnis eingegangen. Um die sich hieraus ergebenden Rechte und Pflichten gemäß den Vorgaben der europäischen Datenschutz-Grundverordnung (Verordnung (EU) 2016/679 des Europäischen Parlaments und des Rates vom 27. April 2016 – DSGVO) und der jeweils anwendbaren nationalen Datenschutzgesetze (in Deutschland des Bundesdatenschutzgesetzes – BDSG, in Österreich des Datenschutzgesetzes – DSG) zu konkretisieren, schließen die Vertragsparteien die nachfolgende Vereinbarung.',
  },

  { h: 3, text: '§ 1 Anwendungsbereich' },
  {
    p: '(1) Die Vereinbarung findet Anwendung auf die Verarbeitung (Art. 4 Nr. 2 DSGVO) aller personenbezogenen Daten (im Folgenden: Daten), die Gegenstand der Leistungsvereinbarung sind oder im Rahmen von deren Durchführung anfallen und auf Weisung des Verantwortlichen verarbeitet werden. Nicht unter den Anwendungsbereich fallen Daten von Mitarbeitern des Auftragsverarbeiters, soweit sie ausschließlich das Beschäftigungsverhältnis mit dem Auftragsverarbeiter betreffen.',
  },
  {
    p: '(2) Diese Vereinbarung gilt vorrangig vor anderen Vereinbarungen und Abreden zwischen Auftraggeber und Auftragnehmer, es sei denn, zwischen den Parteien wird ausdrücklich etwas anderes vereinbart.',
  },

  { h: 3, text: '§ 2 Konkretisierung des Auftragsinhalts' },
  {
    p: '(1) Gegenstand und Dauer der Auftragsverarbeitung sowie Umfang, Art und Zweck der vorgesehenen Verarbeitung von Daten bestimmen sich nach der Leistungsvereinbarung, die dieser Vereinbarung angefügt ist.',
  },
  {
    p: '(2) Folgende Arten personenbezogener Daten sind Gegenstand der Verarbeitung durch den Auftragsverarbeiter:',
  },
  { li: 'Personenstammdaten (z. B. Name, Login-Daten)' },
  { li: 'Texteingaben (Inhalte, die Nutzer*innen in die Plattform eingeben)' },
  {
    li: 'Vom Verantwortlichen bereitgestellte bzw. von dessen Webseiten automatisiert ausgelesene Inhalte (Notebook-Dokumente)',
  },
  { li: 'Bilddaten (Uploads zur Bearbeitung)' },
  { li: 'Audio- und Videodaten (Sprachaufnahmen, Video-Reels zur Transkription)' },
  { li: 'Technische Nutzungsdaten (Logs, Session-Daten)' },
  {
    li: 'Abgeleitete Daten, aus denen Rückschlüsse auf politische Positionen gezogen werden können',
  },
  {
    p: '(3) Der Kreis der durch den Umgang mit ihren Daten betroffenen Personen ist (Kategorien betroffener Personen):',
  },
  { li: 'Nutzer*innen des Dienstes Grünerator' },
  { li: 'Besucher*innen der Website des Grünerators' },
  {
    p: '(4) Im Rahmen der Auftragsverarbeitung werden besondere Kategorien personenbezogener Daten verarbeitet, insbesondere politische Meinungen (Art. 9 Abs. 1 DSGVO).',
  },
  { p: '(5) Die verarbeiteten personenbezogenen Daten haben einen hohen Schutzbedarf.' },

  { h: 3, text: '§ 3 Verpflichtungen und Weisungsbefugnis' },
  {
    p: '(1) Die Vertragsparteien sind verpflichtet, die ihnen durch datenschutzrechtliche Vorschriften (insbesondere die DSGVO) auferlegten Pflichten einzuhalten. Der Verantwortliche kann jederzeit die Herausgabe, Berichtigung, Anpassung, Löschung und Einschränkung der Verarbeitung der Daten verlangen.',
  },
  {
    p: '(2) Zur Gewährleistung des Schutzes der Rechte der betroffenen Personen unterstützt der Auftragsverarbeiter den Verantwortlichen angemessen, insbesondere durch die Gewährleistung geeigneter technischer und organisatorischer Maßnahmen.',
  },
  {
    p: '(3) Soweit sich eine betroffene Person zwecks Geltendmachung eines Betroffenenrechts unmittelbar an den Auftragsverarbeiter wendet, wird der Auftragsverarbeiter dieses Ersuchen unverzüglich an den Verantwortlichen weiterleiten.',
  },
  {
    p: '(4) Der Auftragsverarbeiter darf Daten ausschließlich im Rahmen der Weisungen des Verantwortlichen verarbeiten, sofern er nicht zu einer anderen Verarbeitung durch das Recht der Union oder des Mitgliedstaates, dem der Auftragsverarbeiter unterliegt, hierzu verpflichtet ist. In einem solchen Fall teilt der Auftragsverarbeiter dem Verantwortlichen diese rechtlichen Anforderungen vor der Verarbeitung mit, sofern das betreffende Recht eine solche Mitteilung nicht wegen eines wichtigen öffentlichen Interesses verbietet. Eine Weisung ist die auf einen bestimmten Umgang des Auftragsverarbeiters mit Daten gerichtete schriftliche, elektronische oder mündliche Anordnung des Verantwortlichen. Die Anordnungen sind zu dokumentieren.',
  },
  {
    p: '(5) Der Auftragsverarbeiter hat den Verantwortlichen unverzüglich zu informieren, wenn er der Meinung ist, eine Weisung verstoße gegen datenschutzrechtliche Vorschriften. Der Auftragsverarbeiter ist berechtigt, die Durchführung der entsprechenden Weisung solange auszusetzen, bis sie von Seiten des Verantwortlichen bestätigt oder geändert wird. Die weisungsberechtigten Personen sowie die Kommunikationswege sind im Anhang „Weisungsbefugnis" festgelegt.',
  },
  {
    p: '(6) Änderungen des Verarbeitungsgegenstandes mit Verfahrensänderungen sind gemeinsam abzustimmen und zu dokumentieren.',
  },
  {
    p: '(7) Auskünfte an Dritte oder die betroffene Person darf der Auftragsverarbeiter nur nach vorheriger ausdrücklicher schriftlicher (oder dokumentierter elektronischer) Zustimmung durch den Verantwortlichen erteilen, es sei denn er ist gesetzlich zur Herausgabe verpflichtet.',
  },
  {
    p: '(8) **Zweckbindung und KI-Training:** Der Auftragsverarbeiter verwendet die Daten für keine anderen Zwecke und ist insbesondere nicht berechtigt, sie an Dritte weiterzugeben, es sei denn er ist hierzu gesetzlich verpflichtet. Insbesondere ist eine Nutzung personenbezogener Daten zu Trainings- oder Modellentwicklungszwecken durch den Auftragsverarbeiter oder dessen Subunternehmer (z. B. Mistral AI, Scaleway, GreenPT, Seeweb/Regolo AI, KugelAudio, Black Forest Labs) vertraglich ausgeschlossen bzw. per Opt-out deaktiviert, sofern dies nicht ausdrücklich vom Verantwortlichen angewiesen wurde.',
  },
  {
    p: '(9) Der Verantwortliche führt das Verzeichnis von Verarbeitungstätigkeiten i. S. d. Art. 30 Abs. 1 DSGVO. Der Auftragsverarbeiter führt entsprechend den Vorgaben des Art. 30 Abs. 2 DSGVO ein Verzeichnis zu allen Kategorien von im Auftrag des Verantwortlichen durchgeführten Tätigkeiten.',
  },
  {
    p: '(10) **Verarbeitungsort:** Die Verarbeitung der Daten im Auftrag des Verantwortlichen findet ausschließlich auf dem Gebiet der Europäischen Union (EU) bzw. des Europäischen Wirtschaftsraumes (EWR) statt (insb. Deutschland, Frankreich, Finnland, Italien, die Niederlande und Polen). Dies gilt auch für die eingesetzten KI-Dienstleister. Eine Übermittlung personenbezogener Daten in Drittländer findet nicht statt. Selbst gehostete Dienste (z. B. Fehlermonitoring mit GlitchTip, Metasuche mit SearXNG) werden auf eigenen bzw. von der netzbegrünung betriebenen EU-Servern ausgeführt.',
  },
  {
    p: '(11) Der Auftragsverarbeiter gewährleistet, dass ihm unterstellte natürliche Personen, die Zugang zu Daten haben, diese nur auf Anweisung des Verantwortlichen verarbeiten. Telearbeit/Home Office ist unter Einhaltung angemessener TOM zulässig.',
  },

  { h: 3, text: '§ 4 Beachtung zwingender gesetzlicher Pflichten durch den Auftragsverarbeiter' },
  {
    p: '(1) Der Auftragsverarbeiter gewährleistet, dass sich die zur Verarbeitung der Daten befugten Personen zur Vertraulichkeit verpflichtet haben oder einer angemessenen gesetzlichen Verschwiegenheitspflicht unterliegen.',
  },
  {
    p: '(2) Die Vertragsparteien unterstützen sich gegenseitig beim Nachweis der Rechenschaftspflicht (Art. 5 Abs. 2 DSGVO).',
  },
  {
    p: '(3) Der Auftragsverarbeiter teilt dem Verantwortlichen die Kontaktdaten des Datenschutzbeauftragten oder eines Ansprechpartners für den Datenschutz mit.',
  },
  {
    p: '(4) Der Auftragsverarbeiter informiert den Verantwortlichen unverzüglich über Kontrollen durch Aufsichtsbehörden.',
  },

  { h: 3, text: '§ 5 Technisch-organisatorische Maßnahmen und deren Kontrolle' },
  {
    p: '(1) Die Vertragsparteien vereinbaren die im Anhang „Technisch-organisatorische Maßnahmen (TOM)" niedergelegten Maßnahmen.',
  },
  {
    p: '(2) Ergibt eine Prüfung des Verantwortlichen einen Anpassungsbedarf der TOM gemäß Art. 32 DSGVO, sind die Anpassungen vom Auftragsverarbeiter umzusetzen.',
  },
  {
    p: '(3) TOM unterliegen dem technischen Fortschritt. Der Auftragsverarbeiter darf angemessene alternative Maßnahmen umsetzen, ohne das Sicherheitsniveau zu unterschreiten.',
  },
  {
    p: '(4) Der Auftragsverarbeiter stellt dem Verantwortlichen alle erforderlichen Informationen zum Nachweis der Einhaltung der Vorgaben bereit und ermöglicht Überprüfungen.',
  },
  {
    p: '(5) Die Überprüfung kann auch auf Grundlage aktueller Testate/Berichte unabhängiger Instanzen oder Zertifizierungen erfolgen.',
  },

  { h: 3, text: '§ 6 Mitteilung bei Verstößen durch den Auftragsverarbeiter' },
  {
    p: 'Der Auftragsverarbeiter unterrichtet den Verantwortlichen umgehend bei schwerwiegenden Störungen seines Betriebsablaufes, bei Verdacht auf Verstöße gegen diese Vereinbarung sowie gesetzliche Datenschutzbestimmungen oder anderen Unregelmäßigkeiten bei der Verarbeitung der Daten. Dies gilt insbesondere für die Meldepflicht nach Art. 33 Abs. 2 DSGVO.',
  },

  { h: 3, text: '§ 7 Löschung und Rückgabe von Daten' },
  { p: '(1) Überlassene Datenträger und Datensätze verbleiben im Eigentum des Verantwortlichen.' },
  {
    p: '(2) Nach Abschluss der Leistungen oder auf Aufforderung gibt der Auftragsverarbeiter sämtliche verarbeiteten personenbezogenen Daten zurück oder löscht sie datenschutzgerecht.',
  },
  {
    p: '(3) **Besonderheit bei KI-Diensten:** Daten in den temporären Speichern (Caches) der Subunternehmer (z. B. Mistral AI) werden gemäß deren festgelegten Fristen (max. 30 Tage zur Missbrauchserkennung) automatisch gelöscht. Bei GreenPT (Audio/Video) werden die Eingaben ausschließlich im Arbeitsspeicher verarbeitet und nicht dauerhaft gespeichert; bei Seeweb/Regolo AI erfolgt die Löschung unmittelbar nach der Verarbeitung („Zero Data Retention").',
  },

  { h: 3, text: '§ 8 Subunternehmen' },
  {
    p: '(1) Der Auftragsverarbeiter darf Subunternehmen nach folgendem Verfahren einsetzen: Allgemeine Genehmigung – der Auftragsverarbeiter unterrichtet den Verantwortlichen mindestens vier Wochen im Voraus schriftlich über beabsichtigte Änderungen der Liste (Hinzufügen/Ersetzen) und stellt erforderliche Informationen zur Ausübung des Widerspruchsrechts bereit.',
  },
  {
    p: '(2) Der Auftragsverarbeiter stellt sicher, dass vertragliche Vereinbarungen mit Subunternehmen ein Datenschutzniveau mindestens entsprechend dieser Vereinbarung gewährleisten; insbesondere TOM (Art. 32 DSGVO) und klare Zweckbindung ohne Trainingsnutzung personenbezogener Daten.',
  },
  { p: '(3) Die aktuell genehmigten Subunternehmer sind im Anhang „Subunternehmen" aufgeführt.' },

  { h: 3, text: '§ 9 Datenschutzkontrolle' },
  {
    p: 'Der Auftragsverarbeiter verpflichtet sich, der/dem Datenschutzbeauftragten des Verantwortlichen Zugang zu gewähren und kooperiert umfassend.',
  },

  { h: 3, text: '§ 10 Haftung und Schadenersatz' },
  { p: 'Es gilt Art. 82 DSGVO.' },

  { h: 3, text: '§ 11 Schlussbestimmungen' },
  { p: '(1) Änderungen/Ergänzungen bedürfen der Schriftform.' },
  {
    p: '(2) Sollten einzelne Regelungen unwirksam sein, bleibt die Wirksamkeit im Übrigen unberührt.',
  },

  { spacer: true },
  { p: 'Datum, Ort: _______________________________' },
  { spacer: true },
  {
    p: 'Unterschrift (Verantwortlicher): __________________________   Unterschrift (Auftragsverarbeiter): __________________________',
  },
  {
    p: 'Name, Vorname: [Name]                                                                   Moritz Wächter',
  },

  { rule: true },
  { h: 2, text: 'Anhänge' },

  { h: 3, text: 'Anhang „Weisungsbefugnis" zu § 3' },
  {
    p: 'zur Vereinbarung zur Auftragsverarbeitung vom [Datum eintragen] zwischen [öffentliche Stelle] und Grünerator (Moritz Wächter).',
  },
  { p: '**Weisungsberechtigte Personen auf Seiten des Verantwortlichen:**' },
  { li: 'Projektleitung der zuständigen öffentlichen Stelle (Weisungsbefugter): [Name]' },
  { li: 'Stellvertretung der Projektleitung (Stellvertreter): [Name]' },
  { p: '**Zum Empfang der Weisungen berechtigte Personen auf Seiten des Auftragsverarbeiters:**' },
  { li: 'Moritz Wächter (Grünerator)' },
  {
    p: '**Vorgesehene Informationswege:** elektronisch (E-Mail), schriftlich (Brief/Fax), mündlich. Weisungen werden dokumentiert.',
  },

  { h: 3, text: 'Anhang „Technisch-organisatorische Maßnahmen (TOM)"' },
  {
    p: 'zur Vereinbarung zur Auftragsverarbeitung vom [Datum eintragen] zwischen [öffentliche Stelle] und Grünerator (Moritz Wächter).',
  },
  {
    p: '**§ 1 Technische und organisatorische Sicherheitsmaßnahmen:** Die Verarbeitung erfolgt ausschließlich auf Servern in der EU (Deutschland/Finnland/Frankreich/Italien). Der Auftragsverarbeiter setzt Maßnahmen gem. Art. 32 DSGVO um.',
  },
  {
    p: '**§ 2 Innerbetriebliche Organisation:** Zugriff auf personenbezogene Daten ausschließlich durch Moritz Wächter; klare Rollen; Need-to-know-Prinzip. Nutzung von 2-Faktor-Authentifizierung (2FA) für alle administrativen Zugänge.',
  },
  { p: '**§ 3 Konkretisierung der Einzelmaßnahmen:**' },
  {
    table: {
      head: ['Nr.', 'Maßnahme', 'Umsetzung der Maßnahme'],
      rows: [
        [
          '1',
          'Verschlüsselung',
          'End-to-End-Transportverschlüsselung (TLS/HTTPS); Verschlüsselung ruhender Daten in Datenbanken; SSH-Key-Only-Zugriff auf Server.',
        ],
        [
          '2',
          'Vertraulichkeit / Integrität',
          'Härtung der Server (Hetzner/netzbegrünung); Firewalling; Patch-Management; Datentrennung durch Mandantenfähigkeit (Keycloak).',
        ],
        [
          '3',
          'Wiederherstellbarkeit',
          'Tägliche Backups (verschlüsselt); geo-redundante Speicherung relevanter Daten.',
        ],
        [
          '4',
          'Identifizierung / Autorisierung',
          'Starke Passwörter; 2FA für Admin-Zugänge; Zugriffsbeschränkung auf Moritz Wächter.',
        ],
        [
          '5',
          'Schutz bei Übermittlung',
          'TLS (mind. 1.2/1.3); HSTS; API-Kommunikation mit Subunternehmern ausschließlich verschlüsselt.',
        ],
        [
          '6',
          'Physische Sicherheit',
          'Nutzung ISO-27001-zertifizierter Rechenzentren der Dienstleister (Hetzner).',
        ],
        [
          '7',
          'Datenminimierung',
          'Keine dauerhafte Speicherung der Audio-/Video-Eingaben bei den Transkriptionsanbietern (Mistral AI Voxtral, GreenPT); Zero Data Retention bei Seeweb/Regolo AI; Kurzzeit-Logs (max. 30 Tage) bei KI-Providern; lokale Browser-Speicherung für Entwürfe bevorzugt.',
        ],
        [
          '8',
          'Auftragskontrolle',
          'Abschluss von AV-Verträgen (DPA) mit allen Subunternehmern; Deaktivierung von KI-Training (Opt-out).',
        ],
      ],
    },
  },
  { spacer: true },

  { h: 3, text: 'Anhang „Subunternehmen" zu § 8' },
  {
    p: 'Nach § 8 Abs. 1 sind die bereits hinzugezogenen Subunternehmen zu bezeichnen; der Verantwortliche erklärt sich mit deren Beauftragung einverstanden.',
  },
  {
    table: {
      head: [
        'Subunternehmen',
        'Sitz',
        'AV/DPA',
        'Leistungsgegenstand',
        'Rechtsgrundlage / Übermittlung',
      ],
      rows: [
        [
          'Hetzner Online GmbH',
          'Industriestr. 25, 91710 Gunzenhausen, DE',
          'Bestehend',
          'Hosting der Webanwendung & Server',
          'Verarbeitung in DE (EU); ISO-27001 zertifiziert.',
        ],
        [
          'netzbegrünung – Verein für grüne Netzkultur e.V.',
          'Deutschland',
          'Ausstehend',
          'Infrastruktur, eigene KI-Modelle, Datenbanken, Vektorsuche, Authentifizierung',
          'Verarbeitung in DE/Finnland (EU).',
        ],
        [
          'Mistral AI',
          '15 rue des Halles, 75001 Paris, FR',
          'Bestehend',
          'KI-Text- & Sprachverarbeitung (KI-Textmodelle, Voxtral-Spracherkennung)',
          'Verarbeitung in FR (EU). DPA vorhanden. Kein Training.',
        ],
        [
          'KugelAudio GmbH',
          'Rosenthaler Str. 36, 10178 Berlin, DE (AG Charlottenburg, HRB 277989 B)',
          'Bestehend',
          'Sprachausgabe (Text-to-Speech) für Vorlesefunktion und Echtzeit-Sprachdialog',
          'Sitz DE, Verarbeitung in der EU über den EU-Endpunkt. EU-AVV vom 19.08.2026. Keine dauerhafte Speicherung der Inhalte (Zero Data Retention), kein Training. Eigene Unterauftragnehmer laut Trust Center: Verda AI (FI), Hetzner (DE), Nebius (FI/FR), Contabo (DE), OVH (FR/DE), Scaleway (FR/NL/PL), Supabase (EU).',
        ],
        [
          'Scaleway SAS',
          "8 rue de la Ville-l'Évêque, 75008 Paris, FR",
          '[zu prüfen]',
          'Rechenleistung für das KI-Textmodell Mistral Medium 3.5',
          'Verarbeitung in FR (EU). Kein Training.',
        ],
        [
          'GreenPT BV',
          'Plompetorengracht 4, 3512 CC Utrecht, NL',
          '[zu prüfen]',
          'KI-Textmodelle sowie Audio-/Videotranskription',
          'Sitz NL, Verarbeitung in FR (EU). Keine dauerhafte Speicherung. Kein Training.',
        ],
        [
          'Seeweb S.r.l. / Regolo AI',
          'C.so Lazio 9/a, 03100 Frosinone, IT',
          'Bestehend',
          'KI-Textmodelle, Reranking, Bildgenerierung (Qwen-Image)',
          'Verarbeitung in IT (EU). Zero Data Retention. Kein Training.',
        ],
        [
          'Linkup Technologies SAS',
          '28 avenue des Pépinières, 94260 Fresnes, FR',
          'Bestehend',
          'Agentische Web-Recherche mit Quellenangaben (Suchanfragen)',
          'Verarbeitung in FR (EU).',
        ],
        [
          'Black Forest Labs ([Vertragsentität eintragen])',
          'HQ Freiburg im Breisgau (DE); Vertragsentität noch zu bestätigen',
          'Bestehend',
          'Bildgenerierung (FLUX)',
          'Verarbeitung in der EU (EU-API api.eu.bfl.ai). Kein Training.',
        ],
      ],
    },
  },
];

function expandNewlines(blocks) {
  return blocks.flatMap((b) => {
    if (b.p !== undefined && b.p.includes('\n'))
      return b.p.split('\n').map((line) => ({ p: line }));
    return [b];
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: render(expandNewlines(content)) }],
  });
  const buffer = await Packer.toBuffer(doc);
  const target = resolve(OUT_DIR, 'Leistungsvereinbarung_und_AVV_Gruenerator.docx');
  await writeFile(target, buffer);
  console.log(
    `✓ Leistungsvereinbarung_und_AVV_Gruenerator.docx (${(buffer.length / 1024).toFixed(1)} KB) -> ${target}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
