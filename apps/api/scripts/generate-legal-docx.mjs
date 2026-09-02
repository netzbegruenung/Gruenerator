// Generates clean Word (.docx) versions of the corrected legal pages
// (Datenschutzerklärung + Impressum). Content mirrors the corrected React
// components in apps/web/src/components/pages/Impressum_Datenschutz_Terms/.
//
// Run:  node apps/api/scripts/generate-legal-docx.mjs
// Output: <repo-root>/legal-exports/Datenschutz.docx, Impressum.docx
//
// Resolves the `docx` dependency from apps/api/node_modules regardless of cwd.

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

const PRIMARY_URL = 'https://gruenerator.eu';

// --- Inline markup parser -------------------------------------------------
// Supports **bold** and [[text|url]] hyperlinks within a string.
function inlineRuns(text) {
  const runs = [];
  // Split on links first, keeping the delimiters.
  const linkRe = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
  let last = 0;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) runs.push(...boldRuns(text.slice(last, m.index)));
    runs.push(
      new ExternalHyperlink({
        link: m[2],
        children: [new TextRun({ text: m[1], style: 'Hyperlink' })],
      }),
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

// --- Block helpers --------------------------------------------------------
const HEADING_BY_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
};

function title(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 40 })],
    spacing: { after: 240 },
  });
}

function heading(level, text) {
  return new Paragraph({
    children: inlineRuns(text),
    heading: HEADING_BY_LEVEL[level],
    spacing: { before: level <= 2 ? 320 : 240, after: 120 },
  });
}

function para(text) {
  return new Paragraph({ children: inlineRuns(text), spacing: { after: 140 } });
}

function bullet(text, level = 0) {
  return new Paragraph({ children: inlineRuns(text), bullet: { level }, spacing: { after: 60 } });
}

function buildTable(head, rows) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text, bold) =>
    new TableCell({
      borders,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: !!bold })] })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) })),
    ],
  });
}

// Render an array of block descriptors into docx elements.
function render(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.title) out.push(title(b.title));
    else if (b.h) out.push(heading(b.h, b.text));
    else if (b.p !== undefined) out.push(para(b.p));
    else if (b.li !== undefined) out.push(bullet(b.li, b.level || 0));
    else if (b.table) out.push(buildTable(b.table.head, b.table.rows));
    else if (b.spacer) out.push(new Paragraph({ children: [], spacing: { after: 80 } }));
  }
  return out;
}

// --- Datenschutzerklärung content ----------------------------------------
const datenschutz = [
  { title: 'Datenschutzerklärung' },
  { p: 'Stand: 2. September 2026' },

  { h: 2, text: 'Kurzzusammenfassung' },
  {
    p: `**Der [[GRUENERATOR|${PRIMARY_URL}]] verarbeitet nur die Texte, die Du aktiv in die Eingabefelder eingibst. Diese werden zur KI-Bearbeitung an einen unserer europäischen KI-Dienstleister weitergeleitet (insbesondere [[Mistral AI|https://mistral.ai/]] in Frankreich, KI-Modelle der netzbegrünung e.V. sowie Seeweb/Regolo AI in Italien); welches Modell verwendet wird, kannst Du pro Anfrage selbst wählen. Deine Daten werden dort nicht zum Training der KI verwendet. Bei Nutzung des Grünerator Imagine zur Bildbearbeitung werden Deine hochgeladenen Bilder direkt an Black Forest Labs auf EU-Servern weitergeleitet und dort mit dem FLUX-Modell verarbeitet. Wir speichern die Bilder nicht auf unseren Servern. Die Bilder werden ausschließlich zur Bearbeitung verwendet und nicht zum Training der KI genutzt. Wenn Du die Suchfunktion des GRUENERATORs nutzt, werden Deine Suchanfragen über unsere KI-Dienstleister sowie spezialisierte Suchdienste (in der EU) verarbeitet. Bei Nutzung der Sprachverarbeitung werden Deine Audiodaten in der EU verarbeitet: die Spracherkennung übernimmt Mistral AI (Voxtral), die Sprachausgabe des KI-Agenten die KugelAudio GmbH (Berlin). Bei Aktivierung des Echtzeit-Sprachdialogs bleibt Dein Mikrofon für die Dauer der Sitzung aktiv und wird automatisch freigegeben, sobald Du die Sitzung beendest, den Browser-Tab wechselst, die Seite verlässt oder das Fenster schließt. Bitte achte also darauf, dass Du keine personenbezogenen oder vertraulichen Daten eingibst oder sprichst und dass sich keine weiteren Personen ohne deren Einwilligung in Hörweite Deines Mikrofons befinden.**`,
  },
  { p: '**Hinweis zu den KI-Anbietern:** Du kannst pro Anfrage selbst wählen, welches KI-Modell und damit welcher Anbieter Deine Eingaben verarbeitet (oder „Automatisch" wählen lassen). Es kommen ausschließlich Anbieter mit Verarbeitung in der EU zum Einsatz:' },
  { li: 'Mistral AI (Frankreich)' },
  { li: 'KI-Modelle der netzbegrünung e.V. (eigene Server, EU)' },
  { li: 'Seeweb/Regolo AI (Italien)' },
  { p: 'Die Auswahl triffst Du bei jeder einzelnen Anfrage selbst.' },
  {
    p: '**Wenn Du die Sprachaufnahme-Funktion oder den Reel-Grünerator nutzt, werden Deine Audio- und Videodaten auf unserem Server verarbeitet. Die Audiodaten werden zur Transkription vorrangig an Regolo (EU, Zero Data Retention) oder alternativ an Mistral AI Voxtral (EU) übermittelt. Die verarbeiteten Daten werden nicht dauerhaft bei uns gespeichert.**',
  },
  {
    p: 'Ausführliche Informationen zur Datenschutzerklärung und Deinen Rechten findest Du unten auf dieser Seite. Weiterführende Informationen dazu, wie Mistral AI Deine Eingaben verarbeitet und behandelt, findest Du in der [[Datenschutzerklärung|https://mistral.ai/privacy-policy/]] sowie in den [[Nutzungsbedingungen|https://mistral.ai/terms/]] von Mistral AI.',
  },
  {
    p: '**Hinweis:** Die [[netzbegrünung – Verein für grüne Netzkultur e.V.|https://netzbegruenung.de/]] arbeitet daran alle Daten selbst zu verarbeiten, damit Du den GRUENERATOR schon bald komplett sorg- und bedenklos nutzen kannst. Falls Du dieses Ziel unterstützen willst, kannst Du das mit einer [[Spende|https://netzbegruenung.de/verein/spenden/]] oder einer [[Mitgliedschaft|https://netzbegruenung.de/verein/mitgliedsantrag/]] tun.',
  },

  { h: 2, text: 'Nutzungsbedingungen' },
  { p: 'Es gelten unsere [[Nutzungsbedingungen|/nutzungsbedingungen]].' },

  { h: 2, text: 'Datenschutzhinweise' },
  {
    p: 'Informationen über die Verarbeitung Deiner Daten gemäß [[Art. 13 der Datenschutz-Grundverordnung (DS-GVO)|https://dejure.org/gesetze/DSGVO/13.html]]',
  },

  { h: 3, text: '1. Verantwortlicher' },
  {
    p: 'Verantwortlich für diese Website ist Moritz Wächter, Villestr. 6-8, 53347 Alfter, info@moritz-waechter.de.',
  },

  { h: 3, text: '2. Daten, die für die Bereitstellung der Website und die Erstellung der Protokolldateien verarbeitet werden' },
  { h: 4, text: 'a. Welche Daten werden für welchen Zweck verarbeitet?' },
  {
    p: 'Wir verarbeiten personenbezogene Daten unserer Nutzer*innen grundsätzlich nur, soweit dies zur Bereitstellung einer funktionsfähigen Website erforderlich ist. Die Verarbeitung personenbezogener Daten unserer Nutzer*innen erfolgt regelmäßig nur nach Einwilligung der Nutzer*in. Eine Ausnahme gilt in solchen Fällen, in denen eine vorherige Einholung einer Einwilligung aus tatsächlichen Gründen nicht möglich ist und die Verarbeitung der Daten durch gesetzliche Vorschriften gestattet.',
  },
  {
    p: 'Die vorübergehende Speicherung der Daten ist für den Ablauf eines Websitebesuchs erforderlich, um eine Auslieferung der Website zu ermöglichen.',
  },

  { h: 4, text: 'b. Auf welcher Rechtsgrundlage werden diese Daten verarbeitet?' },
  {
    p: 'Die Daten werden auf der Grundlage [[des Art. 6 Abs. 1 Buchstabe f DS-GVO|https://dejure.org/gesetze/DSGVO/6.html]] verarbeitet.',
  },

  { h: 4, text: 'c. Gibt es neben dem Verantwortlichen weitere Empfänger der personenbezogenen Daten?' },
  {
    p: 'Die Website wird bei Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Deutschland, info@hetzner.com gehostet. Der Hoster empfängt die oben genannten Daten als Auftragsverarbeiter. Bei Nutzung des Grünerator Imagine fungiert Black Forest Labs als Auftragsverarbeiter für die Bildbearbeitung mittels FLUX-KI (Verarbeitung in der EU). Beim Reel-Grünerator fungiert **Regolo AI** als Auftragsverarbeiter für die Audiotranskription mit Zero Data Retention (EU-Datenverarbeitung). Als Fallback wird **Mistral AI Voxtral** für die Transkription eingesetzt.',
  },
  {
    p: 'Darüber hinaus nutzen wir für die Bereitstellung der KI-Funktionen und der Suchfunktion spezialisierte technische Dienstleister, die als unsere Auftragsverarbeiter agieren. Für die Anwendungsüberwachung nutzen wir die selbst gehostete Open-Source-Software **GlitchTip** auf eigenen Servern in der EU; eine Weitergabe an Dritte findet dabei nicht statt.',
  },

  { h: 3, text: 'Auftragsverarbeitung durch technische Dienstleister' },
  { p: '**Gemeinsame Grundsätze für alle Dienstleister:**' },
  { li: 'Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)' },
  { li: 'Auftragsverarbeitungsverträge gemäß Art. 28 DSGVO vorhanden' },
  { li: '**Kein KI-Training: Deine Daten werden bei keinem unserer Partner zum Training verwendet**' },
  { li: 'Maximale Speicherdauer: 30 Tage für technische Zwecke/Missbrauchserkennung' },
  { li: 'Verarbeitung ausschließlich in der EU (außer spezifisch erwähnt)' },

  { h: 4, text: 'Unsere Auftragsverarbeiter im Detail:' },
  { p: '**1. Mistral AI** (15 rue des Halles, 75001 Paris, Frankreich)' },
  { li: 'Zweck: Text- und Sprachverarbeitung (KI-Textmodelle, Voxtral für Spracherkennung)' },
  { li: 'Server: EU (Frankreich)' },
  { li: 'Im Echtzeit-Sprachdialog: Live-Stream-Verarbeitung ohne Persistierung bei netzbegrünung; keine Nutzung zu Trainingszwecken; keine Erstellung von Stimmprofilen' },
  { li: 'Besonderheit: Subunternehmer möglich (mit EU-Standardvertragsklauseln)' },
  { li: 'Details: [[Datenschutzerklärung|https://mistral.ai/privacy-policy/]] und [[Nutzungsbedingungen|https://mistral.ai/terms/]]' },

  { p: '**2. Black Forest Labs** (FLUX-Bildgenerierung)' },
  { li: 'Zweck: Bildbearbeitung und -generierung (FLUX-Modell im Grünerator Imagine)' },
  { li: 'Server: Ausschließlich EU – über die EU-API von Black Forest Labs (api.eu.bfl.ai) bzw. alternativ über bei Seeweb/Regolo AI (Italien) betriebene FLUX-Modelle' },
  { li: 'Besonderheit: Keine Speicherung auf unseren Servern, direkte Weiterleitung' },
  { li: 'Verarbeitete Daten: Eingabebilder, Prompts, Ausgabebilder, Metadaten' },
  { li: 'Kontakt: support@blackforestlabs.ai' },

  { p: '**3. Seeweb S.r.l. / Regolo AI** (C.so Lazio 9/a, 03100 Frosinone, Italien)' },
  { li: 'Zweck: Audio-/Videotranskription (Reel-Grünerator, Sprachaufnahme) sowie KI-Textmodelle und semantische Aufbereitung (Reranking)' },
  { li: 'Server: EU (Italien)' },
  { li: 'Transkriptionsmodell: faster-whisper-large-v3' },
  { li: 'Zero Data Retention: Bei der Transkription werden Input- und Output-Daten am Ende jeder Session gelöscht' },
  { li: 'DSGVO-konform: Italienisches Unternehmen mit ausschließlicher EU-Datenverarbeitung' },
  { li: 'Details: [[Datenschutzerklärung|https://regolo.ai/docs/compliance-and-privacy/privacy-policy/]]' },

  { p: '**4. netzbegrünung e.V.** (Deutschland)' },
  { li: 'Zweck: Kerninfrastruktur des GRUENERATOR' },
  { li: 'Server: Eigene Server in Finnland (EU)' },
  { li: 'Bereitgestellte Dienste:' },
  { li: 'PostgreSQL-Datenbank (Benutzerprofile, Einstellungen)', level: 1 },
  { li: 'Keycloak-Authentifizierung (Login, Benutzerverwaltung)', level: 1 },
  { li: 'Redis (Session-Speicher, max. 24h Speicherdauer)', level: 1 },
  { li: 'Qdrant-Vektorsuche (semantische Suche in Parteiprogrammen, anonymisiert)', level: 1 },
  { li: 'Textbegrünung/Etherpad (kollaboratives Schreiben, Pad-IDs ohne Personenbezug)', level: 1 },
  { li: 'KI-Modelle der netzbegrünung (selbst gehostete Open-Source-Modelle)', level: 1 },
  { li: 'Besonderheit: Vollständige Datenkontrolle durch grüne Netzkultur, keine kommerzielle Datennutzung' },

  { p: '**5. SearXNG (selbstgehostet)**' },
  { li: 'Zweck: Suchfunktion (Metasuchmaschine für Web-Informationen)' },
  { li: 'Server: Eigene Server (Deutschland)' },
  { li: 'Besonderheit: Keine Weitergabe an externe Suchanbieter, vollständige Datenkontrolle' },

  { p: '**6. Linkup Technologies** (Linkup Technologies SAS, 28 avenue des Pépinières, 94260 Fresnes, Frankreich; Handelsregister Créteil 930 910 740)' },
  { li: 'Zweck: Agentische Web-Recherche mit Quellenangaben (Suche-Modus, Tiefenrecherche)' },
  { li: 'Server: EU (Frankreich)' },
  { li: 'Verarbeitete Daten: Suchanfrage' },
  { li: 'Besonderheit: Französischer Anbieter mit ausschließlicher EU-Datenverarbeitung — keine Drittlandübermittlung; ausdrückliche DSGVO-Compliance laut Anbieter' },
  { li: 'Details: [[Datenschutzerklärung|https://www.linkup.so/privacy-policy]] und [[Nutzungsbedingungen|https://www.linkup.so/terms-of-use]]' },

  { p: '**7. GlitchTip (selbstgehostet)**' },
  { li: 'Zweck: Fehlerüberwachung und Anwendungsmonitoring (Error Tracking)' },
  { li: 'Server: Eigene bzw. von der netzbegrünung betriebene Server in der EU' },
  { li: 'Verarbeitete Daten: Fehlerberichte, Stack-Traces, Browserinformationen, IP-Adressen' },
  { li: 'Speicherdauer: Automatische Löschung nach 90 Tagen' },
  { li: 'Sicherheit: TLS 1.2+, Verschlüsselung im Ruhezustand' },
  { li: 'Besonderheit: Selbst gehostete Open-Source-Software (Alternative zu Sentry); keine Weitergabe an Dritte, keine Drittlandübermittlung, keine Nutzung zum KI-Training' },
  { li: 'Details: [[Datenschutzerklärung|https://glitchtip.com/legal/privacy/]]' },

  { p: '**8. KugelAudio** (KugelAudio GmbH, Rosenthaler Str. 36, 10178 Berlin, Deutschland; Amtsgericht Charlottenburg, HRB 277989 B)' },
  { li: 'Zweck: Sprachausgabe (Text-to-Speech) — Vorlesen von Antworten und Sprachausgabe im Echtzeit-Sprachdialog' },
  { li: 'Server: EU (Verarbeitung über den EU-Endpunkt des Anbieters)' },
  { li: 'Verarbeitete Daten: der vorzulesende Antworttext' },
  { li: 'Speicherdauer: keine — Inhalte werden nur für die Dauer der Anfrage im Arbeitsspeicher verarbeitet (Zero Data Retention laut Anbieter)' },
  { li: 'Besonderheit: deutscher Anbieter mit EU-Verarbeitung; kein KI-Training mit Inhalten; erzeugte Audiodateien tragen ein Wasserzeichen und einen Kennzeichnungs-Header nach Art. 50 KI-VO' },
  { li: 'Unterauftragnehmer laut Trust Center des Anbieters: Verda AI (FI), Hetzner (DE), Nebius (FI/FR), Contabo (DE), OVH (FR/DE), Scaleway (FR/NL/PL), Supabase (EU)' },
  { li: 'Details: [[Nutzungsbedingungen|https://www.kugelaudio.com/AGB-ToS%20-%20KugelAudio%20-%202026-07-21.pdf]] und [[EU-Auftragsverarbeitungsvertrag|https://www.kugelaudio.com/AVV-DPA%20-%20KugelAudio%20-%20EU%20-%202026-08-19.pdf]]' },

  { h: 3, text: 'Webanalyse mit Umami' },
  {
    p: 'Diese Website nutzt den Open-Source-Webanalysedienst Umami zur statistischen Auswertung der Besucherzugriffe. Umami wird vom Grünerator selbst auf eigenen Servern in Europa gehostet und betrieben.',
  },
  { p: '**Einwilligung:** Die Webanalyse wird erst aktiviert, nachdem Du bei Deinem ersten Besuch zugestimmt hast. Ohne Deine Einwilligung findet keine Analyse statt.' },
  { p: '**Erfasste Daten (nur nach Einwilligung):**' },
  { li: 'Besuchte Seiten und Verweildauer' },
  { li: 'Referrer (von welcher Seite Du kamst)' },
  { li: 'Browsertyp und Betriebssystem' },
  { li: 'Anonymisierte IP-Adresse (keine vollständige IP-Speicherung)' },
  { li: 'Ungefährer Standort (Land/Region)' },
  { p: '**Datenschutz-Eigenschaften:**' },
  { li: 'Server ausschließlich in Europa' },
  { li: 'Keine Weitergabe an Dritte' },
  { li: 'Keine Verknüpfung mit anderen Datenquellen' },
  { li: 'Keine personenbezogenen Daten oder eindeutige Identifikatoren' },
  { li: 'Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)' },
  { p: '**Widerruf:** Du kannst Deine Einwilligung jederzeit widerrufen. Lösche dazu den Eintrag „analyticsConsent" in Deinen Browser-Einstellungen (Websitedaten/Cookies) oder lade die Seite nach dem Widerruf neu.' },

  { h: 3, text: 'Cookies und Einwilligung' },
  { p: 'Diese Website verwendet Cookies. Technisch notwendige Cookies werden ohne Einwilligung gesetzt. Analyse-Cookies (Umami) werden erst nach Deiner ausdrücklichen Einwilligung aktiviert.' },
  { p: '**Verwendete Cookies:**' },
  { li: '**Session-Cookie:** Zur Authentifizierung und Aufrechterhaltung Deiner Sitzung (technisch notwendig, Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO)' },
  { li: '**Umami-Tracking:** Zur anonymisierten Webanalyse (nur nach Einwilligung, Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO)' },

  { h: 3, text: 'Lokale Speicherung im Browser' },
  { p: 'Wir nutzen den lokalen Speicher Deines Browsers (localStorage, sessionStorage) für folgende Zwecke:' },
  { li: '**Authentifizierungsdaten:** Speicherung des Login-Status und der Sitzungsinformationen' },
  { li: '**Benutzereinstellungen:** Deine persönlichen Präferenzen wie Dark Mode, Spracheinstellungen' },
  { li: '**Temporäre Zwischenspeicherung:** Entwürfe und ungesendete Eingaben, damit nichts verloren geht' },
  { li: '**Einwilligungsstatus:** Ob Du den Nutzungsbedingungen und der Webanalyse zugestimmt hast' },
  { p: '**Hinweis:** Diese Daten werden ausschließlich lokal in Deinem Browser gespeichert und nicht an unsere Server übertragen. Du kannst sie jederzeit über die Browser-Einstellungen (Websitedaten/Cookies löschen) entfernen.' },
  { p: '**Wichtiger Hinweis zur Datenverarbeitung:** Wir verarbeiten ausschließlich die von Dir bewusst eingegebenen Texte. Eine automatische Erhebung oder Analyse Deiner politischen Ansichten findet nicht statt. Ob und welche politischen Inhalte verarbeitet werden, liegt vollständig in Deiner Entscheidung. Bitte achte darauf, keine personenbezogenen oder vertraulichen Daten in die Eingabefelder einzugeben, für deren Verarbeitung Du keine Rechtsgrundlage hast.' },

  { h: 4, text: 'd. Wie lange werden die Daten gespeichert?' },
  { p: 'Die Daten werden gelöscht, sobald sie für die Erreichung des Zwecks ihrer Erhebung nicht mehr erforderlich sind. Bei der Bereitstellung der Website ist dies der Fall, wenn die jeweilige Sitzung beendet ist.' },

  { h: 3, text: 'Medienverarbeitung (Video/Audio/Sprache)' },
  { p: '**Verarbeitung auf unseren Servern:**' },
  { li: 'Sprachaufnahme & Reel-Videos: FFmpeg (Videobearbeitung) und Orchestrierung' },
  { li: 'Sofortlöschung der Original-Dateien nach Verarbeitung' },
  { li: 'Keine dauerhafte Speicherung' },
  { li: 'Keine manuelle Sichtung oder Anhörung' },
  { li: 'Keine Nutzung zu Trainingszwecken' },
  { p: '**Externe Verarbeitung durch Dienstleister (Transkription):**' },
  { li: 'Sprache-zu-Text (primär): Regolo / Seeweb (EU-Server, Zero Data Retention, Modell faster-whisper-large-v3)' },
  { li: 'Sprache-zu-Text (Fallback): Mistral Voxtral (EU-Server, max. 30 Tage)' },
  { li: 'Details zu externen Dienstleistern: siehe Auftragsverarbeiter-Sektion oben' },

  { h: 3, text: 'Echtzeit-Sprachdialog (Voice Agent)' },
  { p: 'Der GRUENERATOR bietet einen bidirektionalen Sprachdialog mit der KI an. Du startest die Sitzung über einen sichtbaren Klick auf das Mikrofon-/Voice-Symbol in der Eingabezeile. Eine Sitzung beginnt nur nach Deinem ausdrücklichen, aktiven Einverständnis.' },
  { p: '**Datenfluss:**' },
  { li: 'Dein Mikrofon-Audio wird im Browser auf 16 kHz (PCM) heruntergerechnet und über eine verschlüsselte WebSocket-Verbindung an unseren Server der netzbegrünung e.V. (EU) gesendet.' },
  { li: 'Unser Server leitet den Audiostream zur Spracherkennung an **Mistral AI Voxtral** (EU, Frankreich) weiter.' },
  { li: 'Das erkannte Transkript wird in unserer Chat-Pipeline (ChatGraph) mit dem von Dir gewählten KI-Modell verarbeitet (siehe „Hinweis zu den KI-Anbietern" oben).' },
  { li: 'Die Textantwort des Agenten wird satzweise an **KugelAudio** (EU-Endpunkt) gesendet und als Audio-Stream zurück in Deinen Browser geliefert, wo sie lokal über Deine Lautsprecher abgespielt wird.' },
  { p: '**Mikrofon-Freigabe:** Das Mikrofon bleibt nur so lange aktiv, wie die Sprachsitzung läuft. Es wird automatisch und unverzüglich freigegeben (MediaStreamTrack.stop), sobald einer dieser Auslöser eintritt:' },
  { li: 'Du klickst auf das Voice-Symbol oder den Hintergrund des Sprachdialog-Fensters' },
  { li: 'Du wechselst den Browser-Tab oder minimierst das Fenster (Visibility Change)' },
  { li: 'Du verlässt die Seite, lädst neu oder schließt den Tab (pagehide / beforeunload)' },
  { li: 'Du wechselst innerhalb der Anwendung in einen anderen Bereich (Route-Navigation)' },
  { li: 'Der Browser-Tab gerät in den Hintergrund (z. B. iOS-bfcache)' },
  { p: '**Speicherung & Training:** Audio-Frames werden ausschließlich im Arbeitsspeicher unseres Servers durchgereicht (Live-Stream, keine Persistenz). Weder wir noch Mistral AI oder KugelAudio verwenden Deinen Audiostream zum Training von KI-Modellen. Es werden keine Sprachprofile (Voice Prints) erstellt.' },
  { p: '**Rechtsgrundlage:** [[Art. 6 Abs. 1 lit. a DSGVO|https://dejure.org/gesetze/DSGVO/6.html]] (Einwilligung durch aktive Aktivierung der Sprachsitzung). Du kannst Deine Einwilligung jederzeit durch das Beenden der Sitzung widerrufen.' },
  { p: '**Deine Verantwortung:** Sprache kann unbeabsichtigt sensible Informationen enthalten — politische Meinungen, Gesundheitsangaben, religiöse Überzeugungen, Identifikationsmerkmale Dritter ([[Art. 9 DSGVO|https://dejure.org/gesetze/DSGVO/9.html]]). Bitte nutze den Echtzeit-Sprachdialog nur in einer Umgebung, in der sich keine weiteren Personen ohne deren Einwilligung in Hörweite Deines Mikrofons befinden, und sprich keine Daten Dritter aus, für deren Verarbeitung Du keine Rechtsgrundlage hast. Die Funktion ist nicht für die Nutzung durch Minderjährige unter 16 Jahren ohne Einwilligung der Erziehungsberechtigten bestimmt.' },

  { h: 3, text: 'Zweck und Dauer der Datenspeicherung' },
  { p: 'Die Speicherung Deiner Daten dient dazu, Dir die Funktionen unserer Anwendung zur Verfügung zu stellen, insbesondere das Erstellen, Bearbeiten und Abrufen Deiner Inhalte. Deine Daten werden so lange gespeichert, wie sie für die Bereitstellung unserer Dienste erforderlich sind oder bis Du eine Löschung beantragst. Nach Beendigung der Nutzung unserer Dienste werden Deine Daten für weitere 30 Tage aufbewahrt und anschließend gelöscht, es sei denn, gesetzliche Aufbewahrungspflichten erfordern eine längere Speicherung. Deine Rechte auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung sind im Abschnitt „Betroffenenrechte" beschrieben.' },

  { h: 4, text: 'Übersicht der Speicherfristen' },
  {
    table: {
      head: ['Datenart', 'Speicherdauer'],
      rows: [
        ['Sitzungsdaten (Redis)', 'Bis Sitzungsende, max. 24 Stunden'],
        ['Benutzerprofile', 'Bis zur Löschung durch Nutzer'],
        ['KI-Anfragen (KI-Dienstleister)', 'Max. 30 Tage (Missbrauchserkennung)'],
        ['Fehlerberichte (GlitchTip)', '90 Tage (automatische Löschung)'],
        ['Audio-/Video-Transkription (Regolo)', 'Zero Retention – Löschung am Ende der Session'],
        ['Echtzeit-Sprachdialog (Mikrofon-Stream, TTS-Audio)', 'Live-Stream ohne Persistierung; Mikrofon-Freigabe bei Sitzungsende'],
        ['Umami-Analysen', '13 Monate'],
        ['Server-Logs', '7 Tage'],
      ],
    },
  },
  { spacer: true },

  { h: 3, text: '3. Betroffenenrechte' },
  { h: 4, text: 'a. Recht auf Auskunft' },
  { p: 'Du kannst Auskunft nach [[Art. 15 DS-GVO|https://dejure.org/gesetze/DSGVO/15.html]] über Deine personenbezogenen Daten verlangen, die wir verarbeiten.' },
  { p: '**Audiodaten beim Reel-Grünerator:** Deine Betroffenenrechte bezüglich der an Regolo/Seeweb übermittelten Audiodaten kannst Du über uns geltend machen. Direktkontakt: privacy@seeweb.it. Die Daten werden am Ende der Session automatisch gelöscht (Zero Data Retention).' },
  { p: '**Bilder im Grünerator Imagine:** Da wir Deine Bilder nicht speichern, sondern nur durchleiten, können wir keine Auskunft über oder Löschung von Bilddaten vornehmen, die sich möglicherweise bei Black Forest Labs befinden. Hierfür kontaktiere bitte direkt Black Forest Labs unter support@blackforestlabs.ai.' },

  { h: 4, text: 'b. Recht auf Widerspruch' },
  { p: 'Du hast ein Recht auf Widerspruch aus besonderen Gründen (siehe Abschnitt „Recht auf Widerspruch gemäß Art. 21 Abs. 1 DS-GVO").' },

  { h: 4, text: 'c. Recht auf Berichtigung' },
  { p: 'Sollten die Dich betreffenden Angaben nicht (mehr) zutreffend sein, kannst Du nach [[Art. 16 DS-GVO|https://dejure.org/gesetze/DSGVO/16.html]] eine Berichtigung verlangen. Sollten Deine Daten unvollständig sein, kannst Du eine Vervollständigung verlangen.' },

  { h: 4, text: 'd. Recht auf Löschung' },
  { p: 'Du kannst nach [[Art. 17 DS-GVO|https://dejure.org/gesetze/DSGVO/17.html]] die Löschung Deiner personenbezogenen Daten verlangen.' },

  { h: 4, text: 'e. Recht auf Einschränkung der Verarbeitung' },
  { p: 'Du hast nach [[Art. 18 DS-GVO|https://dejure.org/gesetze/DSGVO/18.html]] das Recht, eine Einschränkung der Verarbeitung Deiner personenbezogenen Daten zu verlangen.' },

  { h: 4, text: 'f. Recht auf Beschwerde' },
  { p: 'Wenn Du der Ansicht bist, dass die Verarbeitung Deiner personenbezogenen Daten gegen Datenschutzrecht verstößt, hast Du nach [[Art. 77 Abs. 1 DS-GVO|https://dejure.org/gesetze/DSGVO/77.html]] das Recht, Dich bei einer Datenschutzaufsichtsbehörde eigener Wahl zu beschweren. Die für den Verantwortlichen zuständige Aufsichtsbehörde ist die Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW), Kavalleriestr. 2-4, 40213 Düsseldorf.' },

  { h: 4, text: 'g. Recht auf Datenübertragbarkeit' },
  { p: 'Die Erfassung der Daten zur Bereitstellung der Website und die Speicherung der Protokolldateien sind für den Betrieb der Internetseite zwingend erforderlich. Sie beruhen daher nicht auf einer Einwilligung nach [[Art. 6 Abs. 1 Buchstabe a DS-GVO|https://dejure.org/gesetze/DSGVO/6.html]] oder auf einem Vertrag [[nach Art. 6 Abs. 1 Buchstabe b DS-GVO|https://dejure.org/gesetze/DSGVO/6.html]], sondern sind [[nach Art. 6 Abs. 1 Buchstabe f DS-GVO|https://dejure.org/gesetze/DSGVO/6.html]] gerechtfertigt. Die Voraussetzungen des [[Art. 20 Abs. 1 DSGVO|https://dejure.org/gesetze/DSGVO/20.html]] sind demnach insoweit nicht erfüllt.' },

  { h: 3, text: 'Recht auf Widerspruch gemäß Art. 21 Abs. 1 DS-GVO' },
  { p: 'Du hast das Recht, aus Gründen, die sich aus Deiner besonderen Situation ergeben, jederzeit gegen die Verarbeitung Deiner personenbezogenen Daten, die aufgrund von [[Artikel 6 Abs. 1 Buchstabe f DS-GVO|https://dejure.org/gesetze/DSGVO/6.html]] erfolgt, Widerspruch einzulegen. Der Verantwortliche verarbeitet die personenbezogenen Daten dann nicht mehr, es sei denn, er kann zwingende schutzwürdige Gründe für die Verarbeitung nachweisen, die die Interessen, Rechte und Freiheiten der betroffenen Person überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen. Die Erfassung der Daten zur Bereitstellung der Website und die Speicherung der Protokolldateien sind für den Betrieb der Internetseite zwingend erforderlich.' },

  { h: 2, text: 'Sicherheitsmaßnahmen' },
  { p: 'Wir treffen nach Maßgabe der gesetzlichen Vorgaben unter Berücksichtigung des Stands der Technik, der Implementierungskosten und der Art, des Umfangs, der Umstände und der Zwecke der Verarbeitung sowie der unterschiedlichen Eintrittswahrscheinlichkeiten und des Ausmaßes der Bedrohung der Rechte und Freiheiten natürlicher Personen geeignete technische und organisatorische Maßnahmen, um ein dem Risiko angemessenes Schutzniveau zu gewährleisten.' },
  { p: 'Zu den Maßnahmen gehören insbesondere die Sicherung der Vertraulichkeit, Integrität und Verfügbarkeit von Daten durch Kontrolle des physischen und elektronischen Zugangs zu den Daten als auch des sie betreffenden Zugriffs, der Eingabe, der Weitergabe, der Sicherung der Verfügbarkeit und ihrer Trennung. Des Weiteren haben wir Verfahren eingerichtet, die eine Wahrnehmung von Betroffenenrechten, die Löschung von Daten und Reaktionen auf die Gefährdung der Daten gewährleisten. Ferner berücksichtigen wir den Schutz personenbezogener Daten bereits bei der Entwicklung bzw. Auswahl von Hardware, Software sowie Verfahren entsprechend dem Prinzip des Datenschutzes, durch Technikgestaltung und durch datenschutzfreundliche Voreinstellungen.' },

  { h: 2, text: 'Übermittlung von personenbezogenen Daten' },
  { p: 'Im Rahmen unserer Verarbeitung von personenbezogenen Daten kommt es vor, dass diese an andere Stellen, Unternehmen, rechtlich selbstständige Organisationseinheiten oder Personen übermittelt beziehungsweise ihnen gegenüber offengelegt werden. Zu den Empfängern dieser Daten können z. B. mit IT-Aufgaben beauftragte Dienstleister gehören oder Anbieter von Diensten und Inhalten, die in eine Website eingebunden sind. In solchen Fällen beachten wir die gesetzlichen Vorgaben und schließen insbesondere entsprechende Verträge bzw. Vereinbarungen, die dem Schutz Deiner Daten dienen, mit den Empfängern Deiner Daten ab.' },

  { h: 2, text: 'Internationale Datentransfers' },
  { p: 'Datenverarbeitung in Drittländern: Sofern wir Daten in einem Drittland (d. h., außerhalb der Europäischen Union (EU), des Europäischen Wirtschaftsraums (EWR)) verarbeiten oder die Verarbeitung im Rahmen der Inanspruchnahme von Diensten Dritter oder der Offenlegung bzw. Übermittlung von Daten an andere Personen, Stellen oder Unternehmen stattfindet, erfolgt dies nur im Einklang mit den gesetzlichen Vorgaben. Sofern das Datenschutzniveau in dem Drittland mittels eines Angemessenheitsbeschlusses anerkannt wurde (Art. 45 DSGVO), dient dieser als Grundlage des Datentransfers. Im Übrigen erfolgen Datentransfers nur dann, wenn das Datenschutzniveau anderweitig gesichert ist, insbesondere durch Standardvertragsklauseln (Art. 46 Abs. 2 lit. c) DSGVO), ausdrückliche Einwilligung oder im Fall vertraglicher oder gesetzlich erforderlicher Übermittlung (Art. 49 Abs. 1 DSGVO). Im Übrigen teilen wir Dir die Grundlagen der Drittlandübermittlung bei den einzelnen Anbietern aus dem Drittland mit, wobei die Angemessenheitsbeschlüsse als Grundlagen vorrangig gelten. Informationen zu Drittlandtransfers und vorliegenden Angemessenheitsbeschlüssen kannst Du dem Informationsangebot der EU-Kommission entnehmen.' },
  { p: 'EU-US Trans-Atlantic Data Privacy Framework: Im Rahmen des sogenannten Data Privacy Framework (DPF) hat die EU-Kommission das Datenschutzniveau ebenfalls für bestimmte Unternehmen aus den USA im Rahmen des Angemessenheitsbeschlusses vom 10.07.2023 als sicher anerkannt. Die Liste der zertifizierten Unternehmen sowie weitere Informationen zu dem DPF kannst Du der Website des Handelsministeriums der USA unter [[https://www.dataprivacyframework.gov/|https://www.dataprivacyframework.gov/]] (in Englisch) entnehmen. Wir informieren Dich im Rahmen der Datenschutzhinweise, welche von uns eingesetzten Diensteanbieter unter dem Data Privacy Framework zertifiziert sind.' },

  { h: 2, text: 'Allgemeine Informationen zur Datenspeicherung und Löschung' },
  { p: 'Wir löschen personenbezogene Daten, die wir verarbeiten, gemäß den gesetzlichen Bestimmungen, sobald die zugrundeliegenden Einwilligungen widerrufen werden oder keine weiteren rechtlichen Grundlagen für die Verarbeitung bestehen. Dies betrifft Fälle, in denen der ursprüngliche Verarbeitungszweck entfällt oder die Daten nicht mehr benötigt werden. Ausnahmen von dieser Regelung bestehen, wenn gesetzliche Pflichten oder besondere Interessen eine längere Aufbewahrung oder Archivierung der Daten erfordern.' },
  { p: 'Insbesondere müssen Daten, die aus handels- oder steuerrechtlichen Gründen aufbewahrt werden müssen oder deren Speicherung notwendig ist zur Rechtsverfolgung oder zum Schutz der Rechte anderer natürlicher oder juristischer Personen, entsprechend archiviert werden.' },
  { p: 'Unsere Datenschutzhinweise enthalten zusätzliche Informationen zur Aufbewahrung und Löschung von Daten, die speziell für bestimmte Verarbeitungsprozesse gelten.' },
  { p: 'Bei mehreren Angaben zur Aufbewahrungsdauer oder Löschungsfristen eines Datums, ist stets die längste Frist maßgeblich.' },
  { p: 'Beginnt eine Frist nicht ausdrücklich zu einem bestimmten Datum und beträgt sie mindestens ein Jahr, so startet sie automatisch am Ende des Kalenderjahres, in dem das fristauslösende Ereignis eingetreten ist. Im Fall laufender Vertragsverhältnisse, in deren Rahmen Daten gespeichert werden, ist das fristauslösende Ereignis der Zeitpunkt des Wirksamwerdens der Kündigung oder sonstige Beendigung des Rechtsverhältnisses.' },
  { p: 'Daten, die nicht mehr für den ursprünglich vorgesehenen Zweck, sondern aufgrund gesetzlicher Vorgaben oder anderer Gründe aufbewahrt werden, verarbeiten wir ausschließlich zu den Gründen, die ihre Aufbewahrung rechtfertigen.' },

  { h: 3, text: 'Weitere Hinweise zu Verarbeitungsprozessen, Verfahren und Diensten:' },
  { li: '**Aufbewahrung und Löschung von Daten:** Die folgenden allgemeinen Fristen gelten für die Aufbewahrung und Archivierung nach deutschem Recht:' },
  { li: '10 Jahre - Aufbewahrungsfrist für Bücher und Aufzeichnungen, Jahresabschlüsse, Inventare, Lageberichte, Eröffnungsbilanz sowie die zu ihrem Verständnis erforderlichen Arbeitsanweisungen und sonstigen Organisationsunterlagen, Buchungsbelege und Rechnungen (§ 147 Abs. 3 i. V. m. Abs. 1 Nr. 1, 4 und 4a AO, § 14b Abs. 1 UStG, § 257 Abs. 1 Nr. 1 u. 4, Abs. 4 HGB).', level: 1 },
  { li: '6 Jahre - Übrige Geschäftsunterlagen: empfangene Handels- oder Geschäftsbriefe, Wiedergaben der abgesandten Handels- oder Geschäftsbriefe, sonstige Unterlagen, soweit sie für die Besteuerung von Bedeutung sind, z. B. Stundenlohnzettel, Betriebsabrechnungsbögen, Kalkulationsunterlagen, Preisauszeichnungen, aber auch Lohnabrechnungsunterlagen, soweit sie nicht bereits Buchungsbelege sind und Kassenstreifen (§ 147 Abs. 3 i. V. m. Abs. 1 Nr. 2, 3, 5 AO, § 257 Abs. 1 Nr. 2 u. 3, Abs. 4 HGB).', level: 1 },
  { li: '3 Jahre - Daten, die erforderlich sind, um potenzielle Gewährleistungs- und Schadensersatzansprüche oder ähnliche vertragliche Ansprüche und Rechte zu berücksichtigen sowie damit verbundene Anfragen zu bearbeiten, basierend auf früheren Geschäftserfahrungen und üblichen Branchenpraktiken, werden für die Dauer der regulären gesetzlichen Verjährungsfrist von drei Jahren gespeichert (§§ 195, 199 BGB).', level: 1 },
];

// --- Nutzungsbedingungen (AGB) content ------------------------------------
const nutzungsbedingungen = [
  { title: 'Nutzungsbedingungen' },
  { p: 'Stand: 2. September 2026' },

  { h: 2, text: '§ 1 Geltungsbereich' },
  { p: `(1) Diese Nutzungsbedingungen gelten für die Nutzung der Plattform **GRUENERATOR** (erreichbar unter [[${PRIMARY_URL}|${PRIMARY_URL}]]), betrieben von Moritz Wächter, Villestr. 6-8, 53347 Alfter (nachfolgend „Betreiber").` },
  { p: '(2) Mit der Registrierung oder Nutzung der Plattform erklärst Du Dich mit diesen Nutzungsbedingungen einverstanden. Sofern Du die Nutzungsbedingungen nicht akzeptierst, ist eine Nutzung der Plattform nicht gestattet.' },
  { p: '(3) Der Betreiber stellt die Plattform im Auftrag und in Zusammenarbeit mit der [[netzbegrünung – Verein für grüne Netzkultur e.V.|https://netzbegruenung.de/]] bereit.' },

  { h: 2, text: '§ 2 Leistungsbeschreibung' },
  { p: '(1) Der GRUENERATOR ist eine KI-gestützte Content-Erstellungsplattform. Die Plattform bietet insbesondere folgende Funktionen:' },
  { li: '**KI-Textgenerierung:** Erstellung von Pressemitteilungen, Social-Media-Beiträgen, Reden und weiteren Texten mithilfe künstlicher Intelligenz' },
  { li: '**Bildbearbeitung und -generierung:** Erstellung und Bearbeitung von Sharepics und Grafiken (Grünerator Imagine)' },
  { li: '**Audio- und Videotranskription:** Umwandlung von Sprach- und Videoaufnahmen in Text (Reel-Grünerator)' },
  { li: '**Notebooks:** KI-gestützte Frage-Antwort-Funktion zu Parteiprogrammen, Beschlüssen und weiteren Dokumenten' },
  { li: '**Kollaborative Dokumentenbearbeitung:** Gemeinsames Erstellen und Bearbeiten von Texten in Echtzeit' },
  { li: '**Sprachverarbeitung:** Diktat und einmalige Spracheingabe über Mistral Voxtral' },
  { li: '**Echtzeit-Sprachdialog (Voice Agent):** Bidirektionales, freihändiges Gespräch mit der KI mit kontinuierlich aktivem Mikrofon für die Dauer der Sitzung sowie Sprachausgabe der Antworten (Voxtral für die Erkennung, KugelAudio für die Ausgabe, EU)' },
  { p: '(2) Der Betreiber ist berechtigt, den Funktionsumfang der Plattform jederzeit zu erweitern, einzuschränken oder zu verändern, sofern dies für Dich zumutbar ist.' },
  { p: '(3) Die Nutzung der Plattform ist derzeit unentgeltlich. Ein Anspruch auf dauerhafte kostenlose Bereitstellung besteht nicht.' },

  { h: 2, text: '§ 3 Registrierung und Benutzerkonto' },
  { p: '(1) Die Nutzung der Plattform setzt eine Registrierung voraus. Die Registrierung erfolgt über den zentralen Anmeldedienst (Keycloak) der netzbegrünung e.V.' },
  { p: '(2) Du bist verpflichtet, bei der Registrierung wahrheitsgemäße und vollständige Angaben zu machen und diese aktuell zu halten.' },
  { p: '(3) Dein Benutzerkonto ist persönlich und darf nicht an Dritte weitergegeben werden. Du bist für alle Aktivitäten verantwortlich, die unter Deinem Konto stattfinden.' },
  { p: '(4) Du kannst Dein Benutzerkonto jederzeit löschen. Nach der Löschung werden Deine personenbezogenen Daten gemäß unserer [[Datenschutzerklärung|/datenschutz]] behandelt.' },
  { p: '(5) Die Registrierung setzt voraus, dass Du das nach dem Recht Deines Aufenthaltsstaates für die Einwilligung erforderliche Mindestalter erreicht hast (in Deutschland 16, in Österreich 14 Jahre) oder die Einwilligung der Erziehungsberechtigten vorliegt.' },

  { h: 2, text: '§ 4 Nutzungsregeln' },
  { p: '(1) Bei der Nutzung der Plattform ist Folgendes untersagt:' },
  { li: 'Die Eingabe rechtswidriger, beleidigender, diskriminierender oder gewaltverherrlichender Inhalte' },
  { li: 'Die Eingabe personenbezogener Daten Dritter, für deren Verarbeitung keine Rechtsgrundlage besteht' },
  { li: 'Der Upload von Bildern mit erkennbaren Personen ohne deren ausdrückliche Einwilligung' },
  { li: 'Der Upload von Bildern mit Minderjährigen' },
  { li: 'Die Nutzung der Plattform zur Erzeugung von Desinformation, Spam oder automatisierten Masseninhalten' },
  { li: 'Jeder Versuch, die technische Infrastruktur der Plattform zu stören, zu überlasten oder unbefugt auf Daten zuzugreifen' },
  { li: 'Die Aktivierung der Sprachfunktionen (insbesondere des Echtzeit-Sprachdialogs) in Umgebungen, in denen Stimmen oder Äußerungen Dritter ohne deren Einwilligung erfasst werden könnten – etwa in öffentlichen Räumen, Großraumbüros oder im familiären Umfeld mit Anwesenden, die nicht zugestimmt haben' },
  { li: 'Das Aussprechen von Daten Dritter, besonderen Datenkategorien gemäß [[Art. 9 DSGVO|https://dejure.org/gesetze/DSGVO/9.html]] oder vertraulichen Informationen, für deren Verarbeitung Du keine Rechtsgrundlage hast' },
  { li: 'Die Nutzung der Sprachfunktionen durch Minderjährige unter 16 Jahren ohne Einwilligung der Erziehungsberechtigten' },
  { p: '(2) Der Betreiber behält sich vor, bei Verstößen gegen diese Nutzungsregeln den Zugang zur Plattform vorübergehend oder dauerhaft zu sperren.' },

  { h: 2, text: '§ 5 KI-generierte Inhalte' },
  { p: '(1) Die Plattform nutzt verschiedene KI-Modelle zur Inhaltserstellung. Du kannst pro Anfrage selbst wählen, welches Modell und damit welcher Anbieter Deine Eingaben verarbeitet. Es kommen ausschließlich Anbieter mit Verarbeitung in der EU zum Einsatz:' },
  { li: 'Mistral AI (EU-Server, Frankreich)' },
  { li: 'KI-Modelle der netzbegrünung e.V. (eigene Server, EU)' },
  { li: 'Seeweb/Regolo AI (EU-Server, Italien)' },
  { p: '(2) **KI-generierte Inhalte können fehlerhaft, unvollständig oder irreführend sein.** Der Betreiber übernimmt keine Gewähr für die Richtigkeit, Vollständigkeit oder Aktualität der von der KI erzeugten Texte, Bilder oder Transkriptionen.' },
  { p: '(3) Du bist allein verantwortlich für die Prüfung und Verwendung der KI-generierten Inhalte. Vor einer Veröffentlichung oder Weiterverwendung bist Du verpflichtet, die Inhalte auf Richtigkeit und Angemessenheit zu überprüfen.' },
  { p: '(4) Deine Eingaben werden zur Verarbeitung an die jeweiligen KI-Dienstleister weitergeleitet. Deine Daten werden dort nicht zum Training der KI verwendet. Einzelheiten findest Du in unserer [[Datenschutzerklärung|/datenschutz]].' },

  { h: 2, text: '§ 6 Geistiges Eigentum' },
  { p: '(1) Die Rechte an der Plattform (Software, Design, Quellcode, Markenzeichen) liegen beim Betreiber. Dir wird ein einfaches, nicht übertragbares Nutzungsrecht für die Dauer der Nutzung eingeräumt.' },
  { p: '(2) Die von Dir erstellten Inhalte (Texte, Bilder, Dokumente) verbleiben in Deinem Eigentum bzw. unterliegen den jeweils geltenden Urheberrechtsbestimmungen. Durch die Nutzung der Plattform räumst Du dem Betreiber keine Rechte an Deinen Inhalten ein.' },
  { p: '(3) Bei KI-generierten Inhalten gelten die jeweils anwendbaren urheberrechtlichen Bestimmungen. Der Betreiber übernimmt keine Gewähr dafür, dass KI-generierte Inhalte frei von Rechten Dritter sind.' },

  { h: 2, text: '§ 7 Verfügbarkeit' },
  { p: '(1) Der Betreiber bemüht sich um eine möglichst unterbrechungsfreie Verfügbarkeit der Plattform. Ein Anspruch auf ständige Verfügbarkeit besteht nicht.' },
  { p: '(2) Wartungsarbeiten, technische Störungen oder höhere Gewalt können zu vorübergehenden Einschränkungen führen. Der Betreiber haftet nicht für Schäden, die durch vorübergehende Nichtverfügbarkeit entstehen.' },

  { h: 2, text: '§ 8 Haftung' },
  { p: '(1) Der Betreiber haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit.' },
  { p: '(2) Bei leichter Fahrlässigkeit haftet der Betreiber nur bei der Verletzung wesentlicher Vertragspflichten (Kardinalpflichten), begrenzt auf den vorhersehbaren, vertragstypischen Schaden.' },
  { p: '(3) Der Betreiber haftet nicht für die inhaltliche Richtigkeit KI-generierter Inhalte. Die Verantwortung für die Prüfung und Verwendung liegt bei Dir (siehe § 5 Abs. 2 und 3).' },
  { p: '(4) Der Betreiber haftet nicht für Inhalte, die Du oder andere Nutzer*innen über die Plattform erstellen, hochladen oder teilen.' },

  { h: 2, text: '§ 9 Datenschutz' },
  { p: 'Die Verarbeitung personenbezogener Daten erfolgt gemäß unserer [[Datenschutzerklärung|/datenschutz]]. Diese ist Bestandteil dieser Nutzungsbedingungen.' },
  { p: '**Wichtiger Hinweis:** Bitte gib keine personenbezogenen oder vertraulichen Daten in die Eingabefelder ein, für deren Verarbeitung Du keine Rechtsgrundlage hast. Die eingegebenen Texte werden zur Verarbeitung an KI-Dienstleister in der EU weitergeleitet.' },

  { h: 2, text: '§ 10 Änderungen der Nutzungsbedingungen' },
  { p: '(1) Der Betreiber behält sich vor, diese Nutzungsbedingungen jederzeit mit Wirkung für die Zukunft zu ändern.' },
  { p: '(2) Über wesentliche Änderungen wirst Du in geeigneter Form informiert (z. B. per E-Mail oder durch einen Hinweis auf der Plattform).' },
  { p: '(3) Über Änderungen informieren wir Dich mindestens sechs Wochen vor ihrem Inkrafttreten in Textform (z. B. per E-Mail oder durch einen Hinweis auf der Plattform). Wesentliche Änderungen – insbesondere solche, die Kernfunktionen, die Haftung oder die Rechte und Pflichten der Parteien betreffen – werden nur mit Deiner ausdrücklichen Zustimmung wirksam. Stimmst Du nicht zu, kannst Du die Nutzung jederzeit beenden und Dein Konto löschen; bis dahin gelten die bisherigen Bedingungen fort. Bei unwesentlichen Änderungen genügt die fortgesetzte Nutzung der Plattform nach Inkrafttreten, worauf wir Dich in der Änderungsmitteilung gesondert hinweisen.' },

  { h: 2, text: '§ 11 Schlussbestimmungen' },
  { p: '(1) Es gilt das Recht der Bundesrepublik Deutschland. Zwingende verbraucherschützende Vorschriften des Staates, in dem Du als Verbraucher Deinen gewöhnlichen Aufenthalt hast (z. B. Österreich), bleiben hiervon unberührt (Art. 6 Rom-I-VO).' },
  { p: '(2) Gerichtsstand ist, soweit gesetzlich zulässig, Bonn.' },
  { p: '(3) Sollten einzelne Bestimmungen dieser Nutzungsbedingungen unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.' },
  { p: 'Bei Fragen zu diesen Nutzungsbedingungen wende Dich bitte an: [[info@moritz-waechter.de|mailto:info@moritz-waechter.de]]' },
];

// --- Impressum content ----------------------------------------------------
const impressum = [
  { title: 'Impressum' },

  { h: 2, text: 'Angaben gemäß § 5 DDG:' },
  { p: 'Moritz Wächter\nVillestr. 6-8\n53347 Alfter' },

  { h: 2, text: 'Kontakt:' },
  { p: 'Telefon: +49 176 64168661\nE-Mail: info@moritz-waechter.de' },

  { h: 2, text: 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:' },
  { p: 'Moritz Wächter' },

  { h: 2, text: 'Haftung für Inhalte' },
  { p: 'Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.' },
  { p: 'Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.' },

  { h: 2, text: 'Haftung für Links' },
  { p: 'Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar.' },
  { p: 'Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.' },

  { h: 2, text: 'Urheberrecht' },
  { p: 'Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet.' },
  { p: 'Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte Dritter beachtet. Insbesondere werden Inhalte Dritter als solche gekennzeichnet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Inhalte umgehend entfernen.' },

  { h: 2, text: 'Verbraucherstreitbeilegung' },
  { p: 'Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.' },

  { p: 'Eine Website von Moritz Wächter.' },
];

// Paragraphs may contain newlines -> split into line breaks within one block.
function expandNewlines(blocks) {
  return blocks.flatMap((b) => {
    if (b.p !== undefined && b.p.includes('\n')) {
      return b.p.split('\n').map((line) => ({ p: line }));
    }
    return [b];
  });
}

async function buildDoc(blocks) {
  return new Document({
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
    },
    sections: [{ children: render(expandNewlines(blocks)) }],
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const jobs = [
    ['Datenschutz.docx', datenschutz],
    ['Impressum.docx', impressum],
    ['Nutzungsbedingungen.docx', nutzungsbedingungen],
  ];
  for (const [name, blocks] of jobs) {
    const doc = await buildDoc(blocks);
    const buffer = await Packer.toBuffer(doc);
    const target = resolve(OUT_DIR, name);
    await writeFile(target, buffer);
    console.log(`✓ ${name} (${(buffer.length / 1024).toFixed(1)} KB) -> ${target}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
