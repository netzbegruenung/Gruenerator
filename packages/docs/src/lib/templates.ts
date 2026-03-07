export type TemplateType =
  | 'blank'
  | 'antrag'
  | 'pressemitteilung'
  | 'protokoll'
  | 'notizen'
  | 'redaktionsplan'
  | 'checkliste'
  | 'einladung';

export interface DocumentTemplate {
  id: TemplateType;
  name: string;
  description: string;
  icon: string;
  defaultTitle: string;
  content: string;
}

export const templates: DocumentTemplate[] = [
  {
    id: 'blank',
    name: 'Leeres Dokument',
    description: 'Starte mit einem leeren Dokument',
    icon: '📄',
    defaultTitle: 'Neues Dokument',
    content: '',
  },
  {
    id: 'antrag',
    name: 'Antrag',
    description: 'Vorlage für Partei- und Fraktionsanträge',
    icon: '📋',
    defaultTitle: 'Neuer Antrag',
    content: `
<h1>Klimaneutrale Mobilität in Musterstadt bis 2035</h1>

<h2>Antragstellende</h2>
<p>OV Musterstadt, vertreten durch Maxi Mustermensch</p>

<h2>Antragstext</h2>
<p>Die Mitgliederversammlung möge beschließen:</p>
<ol>
  <li>Der Vorstand wird beauftragt, ein Konzept für den Ausbau sicherer Radwege im gesamten Stadtgebiet zu erarbeiten und bis zur nächsten Mitgliederversammlung vorzulegen.</li>
  <li>Die Fraktion wird aufgefordert, sich im Gemeinderat für die Einführung eines kostengünstigen ÖPNV-Tickets für alle Einwohnenden einzusetzen.</li>
  <li>Die lokale Arbeitsgruppe Verkehr soll Gespräche mit Nachbargemeinden über eine gemeinsame Radschnellverbindung aufnehmen.</li>
</ol>

<h2>Begründung</h2>
<p>Der Verkehrssektor ist für einen erheblichen Teil der lokalen Treibhausgasemissionen verantwortlich. Gleichzeitig zeigen Erhebungen, dass viele Alltagswege unter fünf Kilometer lang sind und problemlos mit dem Fahrrad zurückgelegt werden könnten — sofern die Infrastruktur sicher und attraktiv gestaltet ist. Ein bezahlbarer ÖPNV ergänzt dieses Angebot und schafft eine echte Alternative zum Auto, insbesondere für Menschen mit geringem Einkommen. Durch die Zusammenarbeit mit Nachbargemeinden lassen sich Synergien nutzen und größere Mobilitätskorridore erschließen.</p>
`,
  },
  {
    id: 'pressemitteilung',
    name: 'Pressemitteilung',
    description: 'Vorlage für Pressemitteilungen',
    icon: '📰',
    defaultTitle: 'Neue Pressemitteilung',
    content: `
<h1>Grüne Musterstadt fordern verbindlichen Hitzeschutzplan</h1>

<h2>Steigende Temperaturen erfordern sofortiges Handeln zum Schutz vulnerabler Gruppen</h2>

<p><strong>Musterstadt, 15. Juni 2026</strong> — Angesichts der erneut prognostizierten Rekordtemperaturen fordern die Grünen Musterstadt einen verbindlichen Hitzeschutzplan für die Kommune. Das Konzept soll Trinkwasserbrunnen im öffentlichen Raum, begrünte Aufenthaltsflächen und ein Warnsystem für besonders gefährdete Bevölkerungsgruppen umfassen.</p>

<p>Bereits im vergangenen Sommer mussten Rettungsdienste deutlich mehr hitzebedingte Notfälle versorgen. Besonders ältere Menschen, Kinder und wohnungslose Personen sind betroffen. Ein präventiver Hitzeschutzplan kann Leben retten und die Gesundheitskosten für die Allgemeinheit senken.</p>

<blockquote>
<p>„Klimaanpassung ist kein Luxus, sondern kommunale Daseinsvorsorge. Wir brauchen kühle Orte in jedem Stadtteil, die für alle zugänglich sind."</p>
</blockquote>
<p><em>— Maxi Mustermensch, Fraktionsvorsitz Grüne Musterstadt</em></p>

<p>Die Grüne Fraktion wird in der nächsten Gemeinderatssitzung einen entsprechenden Antrag einbringen und lädt alle demokratischen Fraktionen ein, gemeinsam an einer schnellen Umsetzung zu arbeiten.</p>

<hr>

<h3>Kontakt</h3>
<p>Robin Beispiel<br>Pressesprecher*in Grüne Musterstadt<br>presse@gruene-musterstadt.example<br>+49 123 456 789</p>
`,
  },
  {
    id: 'protokoll',
    name: 'Protokoll',
    description: 'Vorlage für Sitzungsprotokolle',
    icon: '📝',
    defaultTitle: 'Neues Protokoll',
    content: `
<h1>Protokoll — Vorstandssitzung OV Musterstadt</h1>

<p><strong>Datum:</strong> 10.06.2026<br>
<strong>Ort:</strong> Grünes Büro, Hauptstr. 12 / Videokonferenz<br>
<strong>Anwesend:</strong> Maxi Mustermensch, Robin Beispiel, Kim Vorlage, Alex Entwurf<br>
<strong>Protokollführung:</strong> Kim Vorlage</p>

<hr>

<h2>TOP 1: Begrüßung und Genehmigung der Tagesordnung</h2>
<p>Maxi Mustermensch eröffnet die Sitzung um 19:05 Uhr und begrüßt alle Anwesenden. Die Tagesordnung wird ohne Änderungen angenommen.</p>

<h2>TOP 2: Vorbereitung Aktionstag Klimaschutz</h2>
<p>Robin Beispiel stellt den Entwurf für den Aktionstag am 28. Juni vor. Geplant sind ein Infostand in der Fußgängerzone, eine Fahrrad-Sternfahrt und ein Workshop zu urbaner Begrünung. Die Diskussion ergibt, dass zusätzlich ein Repair-Café-Stand organisiert werden soll.</p>
<ul>
  <li><strong>Beschluss:</strong> Der Aktionstag wird wie vorgestellt mit Ergänzung des Repair-Cafés durchgeführt.</li>
  <li><strong>Verantwortlich:</strong> Robin Beispiel (Koordination), Alex Entwurf (Repair-Café)</li>
  <li><strong>Frist:</strong> 21.06.2026 — Materialbestellung abschließen</li>
</ul>

<h2>TOP 3: Antrag zur Mitgliederversammlung</h2>
<p>Maxi Mustermensch informiert über den geplanten Antrag zur klimaneutralen Mobilität. Der Vorstand diskutiert die Formulierung und beschließt, den Antrag nach einer letzten Überarbeitung einzureichen.</p>

<h2>Verschiedenes</h2>
<p>Kim Vorlage weist auf die anstehende Schulung zum Thema Social Media am 15. Juni hin. Alle Interessierten sollen sich bis Freitag anmelden.</p>

<h2>Nächster Termin</h2>
<p>24. Juni 2026, 19:00 Uhr, Grünes Büro / Videokonferenz</p>
`,
  },
  {
    id: 'notizen',
    name: 'Notizen',
    description: 'Schnelle Notizen und Gedanken festhalten',
    icon: '💡',
    defaultTitle: 'Neue Notiz',
    content: `
<h1>Notizen — AG Energie</h1>

<p><em>5. Juni 2026</em></p>

<h2>Wichtige Punkte</h2>
<ul>
  <li>Förderung für kommunale Solaranlagen läuft Ende September aus — Antrag zeitnah stellen</li>
  <li>Bürgerenergie-Genossenschaft hat Interesse an gemeinsamer Veranstaltung signalisiert</li>
  <li>Neue Studie zu Wärmepumpen in Altbauten als Argumentationsgrundlage nutzen</li>
</ul>

<h2>Notizen</h2>
<p>Gespräch mit der Energieberatung ergab, dass viele Eigentümer*innen unsicher sind, welche Fördermittel kombinierbar sind. Idee: Gemeinsam mit der Verbraucherzentrale einen Infoabend organisieren. Eventuell Räumlichkeiten im Gemeindezentrum anfragen.</p>

<h2>Nächste Schritte</h2>
<ul>
  <li>Maxi fragt bei der Verbraucherzentrale wegen Kooperation an</li>
  <li>Robin erstellt Entwurf für Social-Media-Post zum Förderprogramm</li>
  <li>Bis nächste Woche: Daten zu lokalem Energieverbrauch zusammentragen</li>
</ul>
`,
  },
  {
    id: 'redaktionsplan',
    name: 'Redaktionsplan',
    description: 'Social-Media- und Redaktionsplanung',
    icon: '📅',
    defaultTitle: 'Neuer Redaktionsplan',
    content: `
<h1>Redaktionsplan — Juni 2026</h1>

<h2>Woche 1</h2>
<ul>
  <li><strong>Montag:</strong> Instagram — Sharepic: Ergebnisse der letzten Gemeinderatssitzung — Verantwortlich: Robin — Status: offen</li>
  <li><strong>Mittwoch:</strong> Facebook — Einladung zum offenen Stammtisch am Freitag — Verantwortlich: Kim — Status: offen</li>
  <li><strong>Freitag:</strong> Instagram Story — Rückblick Stammtisch mit Fotos — Verantwortlich: Robin — Status: offen</li>
</ul>

<h2>Woche 2</h2>
<ul>
  <li><strong>Montag:</strong> Instagram — Faktengrafik: Radverkehr in Musterstadt in Zahlen — Verantwortlich: Alex — Status: offen</li>
  <li><strong>Mittwoch:</strong> Facebook — Vorstellung Antrag klimaneutrale Mobilität — Verantwortlich: Maxi — Status: offen</li>
  <li><strong>Freitag:</strong> Instagram Reel — Kurzinterview: Warum brauchen wir sichere Radwege? — Verantwortlich: Robin — Status: offen</li>
</ul>

<h2>Woche 3</h2>
<ul>
  <li><strong>Montag:</strong> Instagram — Sharepic: Einladung zum Aktionstag Klimaschutz — Verantwortlich: Kim — Status: offen</li>
  <li><strong>Mittwoch:</strong> Facebook — Hintergrund: Was bringt ein Hitzeschutzplan? — Verantwortlich: Alex — Status: offen</li>
  <li><strong>Freitag:</strong> Instagram Story — Countdown zum Aktionstag — Verantwortlich: Robin — Status: offen</li>
</ul>

<h2>Woche 4</h2>
<ul>
  <li><strong>Montag:</strong> Instagram + Facebook — Fotorückblick Aktionstag Klimaschutz — Verantwortlich: Robin — Status: offen</li>
  <li><strong>Mittwoch:</strong> Instagram — Zitat-Kachel: Stimmen der Teilnehmenden — Verantwortlich: Kim — Status: offen</li>
  <li><strong>Freitag:</strong> Facebook — Monatsrückblick und Ausblick Juli — Verantwortlich: Maxi — Status: offen</li>
</ul>

<h2>Ideen-Pool</h2>
<ul>
  <li>Portrait-Reihe: Grüne Köpfe in Musterstadt vorstellen</li>
  <li>Erklärvideo: Wie funktioniert ein Bürgerbegehren?</li>
  <li>Mitmach-Aktion: Lieblingsorte in der Natur rund um Musterstadt</li>
</ul>
`,
  },
  {
    id: 'checkliste',
    name: 'Checkliste',
    description: 'Aufgaben mit Häkchen abhaken',
    icon: '☑️',
    defaultTitle: 'Neue Checkliste',
    content: `
<h1>Checkliste — Vorbereitung Aktionstag</h1>

<h2>Organisation</h2>
<ul>
  <li><input type="checkbox">Standort und Genehmigung klären</li>
  <li><input type="checkbox">Helfer*innen einteilen und Schichtplan erstellen</li>
  <li><input type="checkbox">Auf- und Abbauzeiten mit der Gemeinde abstimmen</li>
</ul>

<h2>Material</h2>
<ul>
  <li><input type="checkbox">Pavillon / Zelt reservieren</li>
  <li><input type="checkbox">Flyer und Infomaterial drucken lassen</li>
  <li><input type="checkbox">Banner und Roll-Ups einpacken</li>
  <li><input type="checkbox">Tische, Stühle und Klemmbrett organisieren</li>
</ul>

<h2>Kommunikation</h2>
<ul>
  <li><input type="checkbox">Social-Media-Posts vorbereiten und einplanen</li>
  <li><input type="checkbox">Pressemitteilung verschicken</li>
  <li><input type="checkbox">Einladung an Mitglieder per E-Mail senden</li>
</ul>

<h2>Am Tag selbst</h2>
<ul>
  <li><input type="checkbox">Aufbau vor Ort</li>
  <li><input type="checkbox">Fotos und Videos für Social Media machen</li>
  <li><input type="checkbox">Unterschriftenlisten und Kontaktformulare bereitlegen</li>
  <li><input type="checkbox">Abbau und Material zurückbringen</li>
</ul>

<h2>Nachbereitung</h2>
<ul>
  <li><input type="checkbox">Fotos sichten und Social-Media-Rückblick posten</li>
  <li><input type="checkbox">Gesammelte Kontakte in Verteiler übernehmen</li>
  <li><input type="checkbox">Kurzes Feedback-Gespräch im Team</li>
</ul>
`,
  },
  {
    id: 'einladung',
    name: 'Einladung',
    description: 'Einladung zu Sitzungen und Versammlungen',
    icon: '✉️',
    defaultTitle: 'Neue Einladung',
    content: `
<h1>Einladung zur Sitzung des Ortsvorstandes Bad Musterdorf</h1>

<p>Liebe Vorstandsmitglieder,</p>

<p>hiermit lade ich euch herzlich zur nächsten Sitzung des Ortsvorstandes ein:</p>

<p><strong>Datum:</strong> Donnerstag, 19. Juni 2026, 19:00 Uhr<br>
<strong>Ort:</strong> Grünes Büro, Hauptstr. 12, 12345 Bad Musterdorf<br>
<strong>Videokonferenz:</strong> Link folgt per E-Mail</p>

<hr>

<h2>Tagesordnung</h2>
<ol>
  <li>Begrüßung und Feststellung der Beschlussfähigkeit</li>
  <li>Genehmigung der Tagesordnung</li>
  <li>Genehmigung des Protokolls der letzten Sitzung</li>
  <li>Bericht der Sprecher*innen</li>
  <li>Bericht aus der Fraktion</li>
  <li>Vorbereitung der Mitgliederversammlung am 10. Juli</li>
  <li>Planung Infostand Wochenmarkt</li>
  <li>Finanzbericht und Haushaltslage</li>
  <li>Verschiedenes</li>
</ol>

<hr>

<p>Anträge zur Tagesordnung bitte bis spätestens <strong>17. Juni 2026</strong> an vorstand@gruene-bad-musterdorf.example senden.</p>

<p>Bitte gebt kurz Bescheid, ob ihr teilnehmen könnt.</p>

<p>Grüne Grüße<br>
Maxi Mustermensch<br>
<em>Sprecher*in OV Bad Musterdorf</em></p>
`,
  },
];

export function getTemplateContent(subtype: string): string {
  const template = templates.find((t) => t.id === subtype);
  return template?.content || '';
}
