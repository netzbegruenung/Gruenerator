/**
 * Simplified template HTML for server-side Yjs injection.
 * Intentionally stripped-down: inline marks (bold, italic), blockquotes,
 * checkboxes, and tables are converted to plain text by htmlToYjsXml.ts.
 * Full rich templates live in packages/docs/src/lib/templates.ts (frontend only).
 */
export const TEMPLATE_CONTENT: Record<string, string> = {
  antrag: `
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
<p>Der Verkehrssektor ist für einen erheblichen Teil der lokalen Treibhausgasemissionen verantwortlich. Gleichzeitig zeigen Erhebungen, dass viele Alltagswege unter fünf Kilometer lang sind und problemlos mit dem Fahrrad zurückgelegt werden könnten — sofern die Infrastruktur sicher und attraktiv gestaltet ist.</p>`,

  pressemitteilung: `
<h1>Grüne Musterstadt fordern verbindlichen Hitzeschutzplan</h1>
<h2>Steigende Temperaturen erfordern sofortiges Handeln zum Schutz vulnerabler Gruppen</h2>
<p>Musterstadt, 15. Juni 2026 — Angesichts der erneut prognostizierten Rekordtemperaturen fordern die Grünen Musterstadt einen verbindlichen Hitzeschutzplan für die Kommune.</p>
<p>Bereits im vergangenen Sommer mussten Rettungsdienste deutlich mehr hitzebedingte Notfälle versorgen.</p>
<h3>Kontakt</h3>
<p>Robin Beispiel, Pressesprecher*in Grüne Musterstadt</p>`,

  protokoll: `
<h1>Protokoll — Vorstandssitzung OV Musterstadt</h1>
<p>Datum: 10.06.2026</p>
<p>Ort: Grünes Büro, Hauptstr. 12 / Videokonferenz</p>
<p>Anwesend: Maxi Mustermensch, Robin Beispiel, Kim Vorlage, Alex Entwurf</p>
<p>Protokollführung: Kim Vorlage</p>
<h2>TOP 1: Begrüßung und Genehmigung der Tagesordnung</h2>
<p>Maxi Mustermensch eröffnet die Sitzung um 19:05 Uhr und begrüßt alle Anwesenden.</p>
<h2>TOP 2: Vorbereitung Aktionstag Klimaschutz</h2>
<p>Robin Beispiel stellt den Entwurf für den Aktionstag am 28. Juni vor.</p>
<h2>Verschiedenes</h2>
<p></p>
<h2>Nächster Termin</h2>
<p></p>`,

  notizen: `
<h1>Notizen</h1>
<h2>Wichtige Punkte</h2>
<ul>
  <li>Punkt 1</li>
  <li>Punkt 2</li>
  <li>Punkt 3</li>
</ul>
<h2>Notizen</h2>
<p></p>
<h2>Nächste Schritte</h2>
<ul>
  <li></li>
</ul>`,

  redaktionsplan: `
<h1>Redaktionsplan</h1>
<h2>Woche 1</h2>
<ul>
  <li>Montag: Thema — Verantwortlich: — Status: offen</li>
  <li>Mittwoch: Thema — Verantwortlich: — Status: offen</li>
  <li>Freitag: Thema — Verantwortlich: — Status: offen</li>
</ul>
<h2>Woche 2</h2>
<ul>
  <li>Montag: Thema — Verantwortlich: — Status: offen</li>
  <li>Mittwoch: Thema — Verantwortlich: — Status: offen</li>
  <li>Freitag: Thema — Verantwortlich: — Status: offen</li>
</ul>
<h2>Ideen-Pool</h2>
<ul>
  <li></li>
</ul>`,

  checkliste: `
<h1>Checkliste</h1>
<h2>Aufgaben</h2>
<ul>
  <li>Aufgabe 1</li>
  <li>Aufgabe 2</li>
  <li>Aufgabe 3</li>
</ul>`,

  einladung: `
<h1>Einladung zur Sitzung</h1>
<p>Liebe Mitglieder,</p>
<p>hiermit lade ich euch herzlich zur nächsten Sitzung ein:</p>
<p>Datum:</p>
<p>Ort:</p>
<h2>Tagesordnung</h2>
<ol>
  <li>Begrüßung und Feststellung der Beschlussfähigkeit</li>
  <li>Genehmigung der Tagesordnung</li>
  <li>Genehmigung des Protokolls der letzten Sitzung</li>
  <li>Verschiedenes</li>
</ol>
<p>Grüne Grüße</p>`,

  tabelle: `
<h1>Neue Tabelle</h1>
<p>Thema | Verantwortlich | Status | Frist</p>
<p> | | | </p>
<p> | | | </p>`,
};
