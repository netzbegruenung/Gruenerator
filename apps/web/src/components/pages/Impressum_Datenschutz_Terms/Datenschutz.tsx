/**
 * Grundlage ist die kanzleifinale Fassung (datenschutz frankfurt · Schönberger &
 * Dielmann, 09.07.2026). Abweichend davon ist die Liste der Auftragsverarbeiter
 * an den tatsächlichen Stand des Codes angeglichen — sie benannte IONOS, das
 * hier seit Längerem nicht mehr angebunden ist („the IONOS backend is retired",
 * `routes/flux/imaginePure.ts`), und nannte Scaleway, GreenPT und Langfuse
 * nicht, über die tatsächlich Daten laufen. Ein fehlender Auftragsverarbeiter
 * ist der schwerere Fehler von beiden, deshalb die Korrektur vor der nächsten
 * Kanzleirunde.
 *
 * Die Formulierung zur Anbieterwahl („von Dir je Anfrage gewählt") war ebenfalls
 * falsch — sie trifft nur auf den Chat zu, sonst routet `selectProviderAndModel`
 * (`services/providers/providerSelector.ts`) nach Anfragetyp. Der zweite Ort mit
 * freier Modellwahl war der Playground; dessen Route ist stillgelegt
 * (`config/routes.ts`), deshalb nennt der Absatz ihn nicht.
 * Der Absatz steht jetzt in der Nachbesserung der Kanzlei
 * (Rückmeldung vom 11.08.2026), die die Zuordnung funktionsabhängig offenlegt,
 * wie Art. 13 DSGVO es für bestimmbare Empfänger verlangt. Einzige Abweichung
 * davon ist die Anbieterliste: die Kanzlei führt dort weiterhin IONOS, das hier
 * nicht mehr angebunden ist, und kennt GreenPT und Scaleway noch nicht.
 *
 * Firmierungen und Anschriften stammen aus den Rechtsseiten der Anbieter selbst
 * (Scaleway: mentions-legales; GreenPT: docs.greenpt.ai/privacy/terms), nicht
 * aus Firmendatenbanken.
 *
 * Wer hier etwas ändert, prüft zuerst den Code: `ProviderName` in
 * `services/ai/providers.ts`, `TRANSCRIPTION_CHAIN` in
 * `services/transcription/providerPolicy.ts` und — für die Sprachausgabe —
 * `services/voice/ttsService.ts` sind die Quelle der Wahrheit darüber, wohin
 * Eingaben tatsächlich gehen.
 *
 * KugelAudio kam am 02.09.2026 für die Sprachausgabe hinzu und ersetzte Mistral
 * Speech vollständig. Firmierung und Anschrift stammen aus dem Impressum des
 * Anbieters, die Zusagen zu Speicherung und Training aus seinem Trust Center
 * (Stand 10.08.2026) und dem EU-AVV vom 19.08.2026. Polen steht seitdem in der
 * Länderliste: KugelAudio führt Scaleway mit den Standorten FR/NL/PL als
 * Unterauftragnehmer.
 */

const Datenschutz = () => {
  return (
    <div className="page-container">
      <h1>Datenschutzerklärung</h1>
      <p>Stand: 2. September 2026</p>

      <h2>Einleitung</h2>
      <p>
        Wir freuen uns über Dein Interesse am GRÜNERATOR. Der Schutz Deiner personenbezogenen Daten
        und die Wahrung Deiner Privatsphäre haben für uns einen hohen Stellenwert. Gerade weil über
        den GRÜNERATOR politische Inhalte erstellt werden, ist uns bewusst, dass ein
        vertrauensvoller und datensparsamer Umgang mit Deinen Eingaben die Grundlage unseres
        Angebots ist.
      </p>
      <p>
        Mit dieser Datenschutzerklärung informieren wir Dich umfassend, transparent und in
        verständlicher Form darüber, welche personenbezogenen Daten (nachfolgend „Daten") wir im
        Zusammenhang mit dem Besuch unserer Website und der Nutzung des GRÜNERATOR verarbeiten, zu
        welchen Zwecken und auf welcher Rechtsgrundlage dies geschieht und welche Rechte Dir als
        betroffener Person zustehen. Der GRÜNERATOR ist eine KI-gestützte
        Content-Erstellungsplattform; wir verarbeiten grundsätzlich nur die Inhalte, die Du aktiv in
        die Eingabefelder eingibst.
      </p>

      <h2>Verantwortlicher</h2>
      <p>Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
      <p>
        Moritz Wächter (GRÜNERATOR)
        <br />
        Villestraße 6–8
        <br />
        53347 Alfter
        <br />
        Deutschland
      </p>
      <p>
        E-Mail: <a href="mailto:info@moritz-waechter.de">info@moritz-waechter.de</a>
        <br />
        Website: <a href="https://gruenerator.eu">https://gruenerator.eu</a>
      </p>
      <p>
        Der GRÜNERATOR wird in technischer Zusammenarbeit mit der netzbegrünung – Verein für grüne
        Netzkultur e.V. bereitgestellt, die als Auftragsverarbeiter Teile der Infrastruktur
        betreibt.
      </p>

      <h2>Kategorien der verarbeiteten Daten</h2>
      <p>Wir unterteilen die von uns verarbeiteten Daten in folgende Kategorien:</p>
      <ul>
        <li>
          <strong>Bestands- und Anmeldedaten:</strong> z. B. Name und Login-Daten des über den
          zentralen Anmeldedienst (Keycloak) verwalteten Benutzerkontos.
        </li>
        <li>
          <strong>Inhaltsdaten (Deine Eingaben):</strong> Texte, Prompts und sonstige Inhalte, die
          Du in die Plattform eingibst, sowie die in ein Notebook eingelesenen Dokumente.
        </li>
        <li>
          <strong>Hochgeladene Medien:</strong> Bilder zur Bearbeitung sowie Audio- und
          Videoaufnahmen zur Transkription.
        </li>
        <li>
          <strong>Kommunikations- und Sprachdaten:</strong> Audiostream bei Nutzung des
          Echtzeit-Sprachdialogs.
        </li>
        <li>
          <strong>Metadaten und technische Nutzungsdaten:</strong> IP-Adresse,
          Geräte-/Browserangaben, Zeitstempel, Session- und Protokolldaten.
        </li>
        <li>
          <strong>Besondere Kategorien personenbezogener Daten (Art. 9 DSGVO):</strong> Insbesondere
          können sich aus Deinen Eingaben politische Meinungen ergeben. Ob und welche solcher
          Inhalte verarbeitet werden, liegt vollständig in Deiner Entscheidung.
        </li>
      </ul>

      <h2>Kategorien der betroffenen Personen</h2>
      <ul>
        <li>Nutzer*innen des GRÜNERATOR.</li>
        <li>Besucher*innen unserer Website.</li>
      </ul>

      <h2>Zwecke, zu deren Verfolgung die Verarbeitung erfolgt</h2>
      <ul>
        <li>
          Bereitstellung der Website und des GRÜNERATOR sowie seiner Funktionen (Textgenerierung,
          Bildbearbeitung, Transkription, Notebooks, Web-Recherche, Sprachverarbeitung).
        </li>
        <li>Verwaltung des Benutzerkontos und Authentifizierung.</li>
        <li>
          Sicherheit und Stabilität der technischen Infrastruktur, Missbrauchsabwehr und
          Fehleranalyse.
        </li>
        <li>Kommunikation und Bearbeitung von Anfragen.</li>
        <li>Statistische Reichweitenmessung (nur nach Einwilligung).</li>
      </ul>

      <h2>Übersicht und Erklärung der Rechtsgrundlagen</h2>
      <p>
        Im Folgenden informieren wir Dich über die Rechtsgrundlagen der DSGVO, auf deren Basis wir
        Daten verarbeiten. Zusätzlich können nationale Regelungen Deines Wohn- bzw.
        Aufenthaltslandes gelten.
      </p>
      <ul>
        <li>
          <strong>
            Vertragserfüllung und vorvertragliche Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO):
          </strong>{' '}
          Verarbeitung zur Bereitstellung des Nutzungsverhältnisses und der Funktionen.
        </li>
        <li>
          <strong>Berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO):</strong> insbesondere
          IT-Sicherheit, Missbrauchsabwehr, Stabilität und Fehleranalyse.
        </li>
        <li>
          <strong>Einwilligung (Art. 6 Abs. 1 lit. a DSGVO):</strong> z. B. Reichweitenmessung,
          Echtzeit-Sprachdialog sowie – soweit einschlägig – die Verarbeitung besonderer Kategorien.
        </li>
        <li>
          <strong>Verarbeitung besonderer Kategorien (Art. 9 Abs. 2 lit. a DSGVO):</strong>{' '}
          ausdrückliche Einwilligung, soweit Deine Eingaben besondere Kategorien (z. B. politische
          Meinungen) enthalten.
        </li>
        <li>
          <strong>Speicherung/Zugriff auf Endgeräte (§ 25 Abs. 1, Abs. 2 Nr. 2 TDDDG):</strong>{' '}
          technisch notwendige Speicherung ohne Einwilligung; einwilligungsbedürftige Speicherung
          nur mit Deiner Zustimmung.
        </li>
      </ul>

      <h2>Sicherheitsmaßnahmen</h2>
      <p>
        Wir treffen nach Maßgabe des Art. 32 DSGVO unter Berücksichtigung des Stands der Technik,
        der Implementierungskosten sowie der Art, des Umfangs, der Umstände und der Zwecke der
        Verarbeitung geeignete technische und organisatorische Maßnahmen, um ein dem Risiko
        angemessenes Schutzniveau zu gewährleisten. Dazu zählen insbesondere die verschlüsselte
        Übertragung der Daten mittels SSL/TLS (mind. Version 1.2), die verschlüsselte Speicherung
        ruhender Daten, Zugriffsbeschränkungen nach dem Need-to-know-Prinzip,
        Zwei-Faktor-Authentifizierung für administrative Zugänge sowie Datenschutz durch
        Technikgestaltung und datenschutzfreundliche Voreinstellungen (Art. 25 DSGVO).
      </p>

      <h2>Übermittlung und Offenbarung von personenbezogenen Daten gegenüber Dritten</h2>
      <p>
        Im Rahmen der Bereitstellung des GRÜNERATOR setzen wir spezialisierte technische
        Dienstleister ein, die für uns als Auftragsverarbeiter nach Art. 28 DSGVO tätig werden. Mit
        allen Auftragsverarbeitern bestehen entsprechende Verträge; eine Nutzung Deiner Daten zu
        Trainings- oder Modellentwicklungszwecken ist vertraglich ausgeschlossen bzw. per Opt-out
        deaktiviert. Eine Weitergabe an sonstige Dritte erfolgt nur, wenn Du eingewilligt hast, dies
        gesetzlich vorgeschrieben ist oder es zur Geltendmachung, Ausübung oder Verteidigung von
        Rechtsansprüchen erforderlich ist.
      </p>

      <p>
        <strong>Übersicht der eingesetzten Auftragsverarbeiter:</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th>Dienstleister</th>
            <th>Sitz / Verarbeitungsort</th>
            <th>Leistung</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hetzner Online GmbH</td>
            <td>Deutschland (EU)</td>
            <td>Hosting der Webanwendung und Server (ISO 27001)</td>
          </tr>
          <tr>
            <td>netzbegrünung e.V.</td>
            <td>Deutschland / Finnland (EU)</td>
            <td>
              Kerninfrastruktur, Datenbank (PostgreSQL), Keycloak-Authentifizierung, Redis,
              Vektorsuche (Qdrant, pseudonymisiert), kollaboratives Schreiben (Etherpad, Pad-IDs
              ohne Personenbezug), eigene KI-Modelle
            </td>
          </tr>
          <tr>
            <td>Mistral AI</td>
            <td>Frankreich (EU)</td>
            <td>KI-Text- und Sprachverarbeitung (Textmodelle, Voxtral-Spracherkennung)</td>
          </tr>
          <tr>
            <td>KugelAudio GmbH</td>
            <td>Deutschland (Sitz), EU (Verarbeitung)</td>
            <td>
              Sprachausgabe (Vorlesen von Antworten, Echtzeit-Sprachdialog); keine dauerhafte
              Speicherung der Inhalte, kein KI-Training
            </td>
          </tr>
          <tr>
            <td>Scaleway SAS</td>
            <td>Frankreich (EU)</td>
            <td>
              Rechenleistung für das KI-Textmodell Mistral Medium 3.5 (das Modell selbst stammt von
              Mistral AI)
            </td>
          </tr>
          <tr>
            <td>GreenPT BV</td>
            <td>Niederlande (Sitz), Frankreich (Verarbeitung, EU)</td>
            <td>KI-Textmodelle sowie Audio-/Videotranskription (keine dauerhafte Speicherung)</td>
          </tr>
          <tr>
            <td>Seeweb S.r.l. / Regolo AI</td>
            <td>Italien (EU)</td>
            <td>
              KI-Textmodelle, Reranking sowie – wenn Du sie wählst – Bildgenerierung mit dem Modell
              Qwen-Image (Zero Data Retention)
            </td>
          </tr>
          <tr>
            <td>Black Forest Labs</td>
            <td>EU (EU-API api.eu.bfl.ai)</td>
            <td>Bildgenerierung (FLUX)</td>
          </tr>
          <tr>
            <td>Linkup Technologies SAS</td>
            <td>Frankreich (EU)</td>
            <td>agentische Web-Recherche mit Quellenangaben</td>
          </tr>
          <tr>
            <td>SearXNG (selbst gehostet)</td>
            <td>Deutschland (EU)</td>
            <td>Metasuche für die Suchfunktion</td>
          </tr>
          <tr>
            <td>GlitchTip (selbst gehostet)</td>
            <td>EU</td>
            <td>Fehler- und Anwendungsmonitoring</td>
          </tr>
          <tr>
            <td>Langfuse (selbst gehostet)</td>
            <td>Deutschland (EU)</td>
            <td>Qualitätssicherung und Fehleranalyse der KI-Chat-Funktion</td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>Ladungsfähige Anschriften:</strong> Hetzner Online GmbH, Industriestr. 25, 91710
        Gunzenhausen, Deutschland · netzbegrünung – Verein für grüne Netzkultur e.V., Deutschland ·
        Mistral AI, 15 rue des Halles, 75001 Paris, Frankreich · Scaleway SAS, 8 rue de la
        Ville-l&apos;Évêque, 75008 Paris, Frankreich (RCS Paris 433 115 904) · GreenPT BV,
        Plompetorengracht 4, 3512 CC Utrecht, Niederlande (KvK 97084360) · KugelAudio GmbH,
        Rosenthaler Str. 36, 10178 Berlin, Deutschland (Amtsgericht Charlottenburg, HRB 277989 B) ·
        Seeweb S.r.l., C.so Lazio 9/a, 03100 Frosinone, Italien · Linkup Technologies SAS, 28 avenue
        des Pépinières, 94260 Fresnes, Frankreich (RCS Créteil 930 910 740).
      </p>

      <p>
        <strong>Gemeinsame Grundsätze aller Dienstleister:</strong> Verarbeitung ausschließlich in
        der EU, Auftragsverarbeitungsverträge nach Art. 28 DSGVO, kein KI-Training mit Deinen Daten,
        kurze Speicherfristen (bei den KI-Dienstleistern in der Regel maximal 30 Tage zur
        Missbrauchserkennung).
      </p>

      <h2>Datenverarbeitung in Drittländern</h2>
      <p>
        Die Verarbeitung Deiner Daten findet ausschließlich auf dem Gebiet der Europäischen Union
        bzw. des Europäischen Wirtschaftsraums statt (insbesondere Deutschland, Frankreich,
        Finnland, Italien, die Niederlande und Polen). Eine Übermittlung personenbezogener Daten in
        Drittländer außerhalb der EU/des EWR findet nicht statt. Sollte künftig ausnahmsweise eine
        Drittlandübermittlung erfolgen, geschieht dies nur auf Grundlage eines
        Angemessenheitsbeschlusses (Art. 45 DSGVO) oder geeigneter Garantien wie der
        EU-Standardvertragsklauseln (Art. 46 DSGVO); wir informieren Dich hierüber gesondert.
      </p>

      <h2>Allgemeiner Hinweis zur Löschung von Daten</h2>
      <p>
        Wir löschen personenbezogene Daten, sobald die zugrunde liegende Einwilligung widerrufen
        wird oder keine sonstige Rechtsgrundlage mehr besteht, insbesondere wenn der
        Verarbeitungszweck entfällt. Werden Daten aus gesetzlichen Gründen (z. B. handels- oder
        steuerrechtliche Aufbewahrungspflichten: 10 Jahre für Buchungsbelege und Rechnungen gemäß §
        147 AO, § 257 HGB; 6 Jahre für Geschäftsbriefe; 3 Jahre für Daten zur Geltendmachung oder
        Abwehr vertraglicher Ansprüche gemäß §§ 195, 199 BGB) weiter benötigt, beschränken wir die
        Verarbeitung entsprechend. Nach Beendigung der Nutzung werden Deine Daten für weitere 30
        Tage aufbewahrt und anschließend gelöscht, soweit keine gesetzliche Aufbewahrungspflicht
        entgegensteht.
      </p>

      <p>
        <strong>Übersicht der wichtigsten Speicherfristen:</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th>Datenart</th>
            <th>Speicherdauer</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Sitzungsdaten (Redis)</td>
            <td>bis Sitzungsende, max. 24 Stunden</td>
          </tr>
          <tr>
            <td>Benutzerprofile</td>
            <td>bis zur Löschung durch die Nutzer*in</td>
          </tr>
          <tr>
            <td>KI-Anfragen bei KI-Dienstleistern</td>
            <td>max. 30 Tage (Missbrauchserkennung)</td>
          </tr>
          <tr>
            <td>Audio-/Videotranskription (Voxtral, GreenPT)</td>
            <td>keine dauerhafte Speicherung – Verarbeitung nur im Arbeitsspeicher</td>
          </tr>
          <tr>
            <td>KI-Chat-Protokolle (Langfuse, Qualitätssicherung)</td>
            <td>30 Tage</td>
          </tr>
          <tr>
            <td>Echtzeit-Sprachdialog (Mikrofon-/TTS-Stream)</td>
            <td>Live-Stream ohne Persistierung</td>
          </tr>
          <tr>
            <td>Fehlerberichte (GlitchTip)</td>
            <td>90 Tage</td>
          </tr>
          <tr>
            <td>Reichweitenmessung (Umami)</td>
            <td>13 Monate</td>
          </tr>
          <tr>
            <td>Server-Logs</td>
            <td>7 Tage</td>
          </tr>
        </tbody>
      </table>

      <h2>Verarbeitungen im Einzelnen</h2>

      <h3>Bereitstellung der Website und Server-Logfiles</h3>
      <p>
        Beim Aufruf der Website verarbeiten wir die technisch erforderlichen Daten (u. a.
        IP-Adresse, Zeitpunkt, angefragte Ressource, Browsertyp), um die Auslieferung der Website zu
        ermöglichen und ihre Stabilität und Sicherheit zu gewährleisten. Rechtsgrundlage ist Art. 6
        Abs. 1 lit. f DSGVO. Die Logfiles werden nach 7 Tagen gelöscht. Das Hosting erfolgt durch
        die Hetzner Online GmbH (Deutschland) als Auftragsverarbeiter.
      </p>

      <h3>Registrierung und Benutzerkonto</h3>
      <p>
        Die Nutzung setzt eine Registrierung über den zentralen Anmeldedienst (Keycloak) der
        netzbegrünung e.V. voraus. Wir verarbeiten die dabei angegebenen Bestands- und Anmeldedaten
        zur Bereitstellung und Verwaltung des Kontos. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b
        DSGVO. Du kannst Dein Konto jederzeit löschen. Die Bereitstellung Deiner Daten ist weder
        gesetzlich noch vertraglich vorgeschrieben; ohne die für die Registrierung erforderlichen
        Angaben kann das Benutzerkonto und damit der GRÜNERATOR jedoch nicht genutzt werden.
      </p>

      <h3 id="ki-textgenerierung">KI-Textgenerierung und Chat</h3>
      <p>
        Die von Dir eingegebenen Texte werden zur Bearbeitung an KI-Dienstleister mit Verarbeitung
        in der EU weitergeleitet (Mistral AI/FR, KI-Modelle der netzbegrünung/EU, Seeweb/Regolo
        AI/IT, GreenPT/NL mit Verarbeitung in FR). Welcher Dienstleister eingesetzt wird, richtet
        sich nach der genutzten Funktion: Im Chat kannst Du das Modell selbst wählen; voreingestellt
        ist „Automatisch“, bei dieser Einstellung wählt die Plattform den Dienstleister anhand von
        Funktion und Verfügbarkeit. Bei allen übrigen Funktionen (u. a. Anträge, Reden,
        Sharepic-Texte, Notebooks, Präsentationen) ist der Dienstleister je Funktionstyp fest
        vorgegeben. Das Modell Mistral Medium 3.5 läuft dabei auf Rechenleistung von Scaleway/FR;
        fällt Scaleway aus, geht dieselbe Anfrage direkt an Mistral AI. Eine Nutzung Deiner Eingaben
        zum Training der KI findet nicht statt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO;
        enthalten Deine Eingaben besondere Kategorien (z. B. politische Meinungen), stützt sich
        deren Verarbeitung auf Art. 9 Abs. 2 lit. a DSGVO (Deine ausdrückliche Einwilligung, die wir
        vor der ersten Nutzung der KI-Funktionen gesondert einholen).
      </p>

      <h3>Bildbearbeitung und -generierung (Grünerator Imagine)</h3>
      <p>
        Bei Nutzung des Grünerator Imagine werden Deine hochgeladenen Bilder und Prompts unmittelbar
        an den Anbieter des gewählten Bildmodells weitergeleitet und dort ausschließlich zur
        Bearbeitung verwendet. Im Bild-Studio ist Black Forest Labs (FLUX, EU-API api.eu.bfl.ai)
        voreingestellt; wählst Du dort das Regolo-Bildmodell, verarbeitet stattdessen Seeweb/Regolo
        AI (Italien) Deine Eingaben mit dem Modell Qwen-Image. Die Funktion „KI-Bild erstellen“ im
        Sharepic-Editor nutzt immer Seeweb/Regolo AI mit Qwen-Image; dort gibt es keine Modellwahl.
        Wir speichern die Bilder nicht auf unseren Servern; eine Nutzung zum KI-Training findet
        nicht statt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h3>Audio- und Videotranskription (Reel-Grünerator, Sprachaufnahme)</h3>
      <p>
        Zur Transkription werden Deine Audio- und Videodaten auf unseren Servern verarbeitet (u. a.
        Zuschnitt/Orchestrierung) und zur Sprache-zu-Text-Umwandlung vorrangig an Mistral AI Voxtral
        (Frankreich, EU) und ersatzweise an GreenPT (Verarbeitung in Frankreich, EU; Audio-Eingaben
        werden dort nicht dauerhaft gespeichert) übermittelt. Die Originaldateien werden nach der
        Verarbeitung sofort gelöscht; eine dauerhafte Speicherung, manuelle Sichtung oder Nutzung zu
        Trainingszwecken findet nicht statt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h3 id="echtzeit-sprachdialog">Echtzeit-Sprachdialog (Voice Agent)</h3>
      <p>
        Der GRÜNERATOR bietet einen bidirektionalen Sprachdialog. Eine Sitzung beginnt nur nach
        Deinem ausdrücklichen, aktiven Start über das Mikrofon-Symbol. Dein Mikrofon-Audio wird im
        Browser auf 16&nbsp;kHz heruntergerechnet und über eine verschlüsselte Verbindung an unseren
        Server (netzbegrünung, EU) und von dort zur Spracherkennung an Mistral AI Voxtral (EU)
        übermittelt; die Sprachausgabe erfolgt über KugelAudio (EU). Audio-Frames werden
        ausschließlich im Arbeitsspeicher durchgereicht (Live-Stream, keine Persistierung); es
        werden keine Sprachprofile erstellt. Das Mikrofon wird automatisch freigegeben, sobald Du
        die Sitzung beendest, den Tab wechselst oder minimierst, die Seite verlässt oder neu lädst,
        innerhalb der Anwendung in einen anderen Bereich navigierst oder das Fenster schließt.
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung durch aktive Aktivierung); Du
        kannst die Einwilligung jederzeit durch Beenden der Sitzung widerrufen.
      </p>
      <p>
        <strong>Deine Verantwortung:</strong> Sprache kann unbeabsichtigt sensible Informationen
        enthalten. Bitte nutze den Sprachdialog nur in einer Umgebung, in der sich keine weiteren
        Personen ohne deren Einwilligung in Hörweite befinden, und sprich keine Daten Dritter aus,
        für deren Verarbeitung Du keine Rechtsgrundlage hast. Die Funktion ist nicht für
        Minderjährige unter 16 Jahren ohne Einwilligung der Erziehungsberechtigten bestimmt.
      </p>

      <h3>Notebooks und Web-Recherche</h3>
      <p>
        Für die Notebook-Funktion werden vom Verantwortlichen bereitgestellte oder von benannten
        Webseiten automatisiert ausgelesene (gescrapte) Inhalte eingelesen, indexiert und für eine
        KI-gestützte Frage-Antwort-Funktion (Vektorsuche) vorgehalten. Für die Web-Recherche werden
        Deine Suchanfragen über die selbst gehostete Metasuche (SearXNG) sowie über Linkup
        Technologies (Frankreich, EU) verarbeitet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b und lit.
        f DSGVO.
      </p>

      <h3>Fehler- und Anwendungsmonitoring (GlitchTip)</h3>
      <p>
        Zur Erkennung und Behebung technischer Fehler nutzen wir die selbst gehostete
        Open-Source-Software GlitchTip auf eigenen bzw. von der netzbegrünung betriebenen Servern in
        der EU. Verarbeitet werden Fehlerberichte, Stack-Traces, Browserinformationen und
        IP-Adressen; eine Weitergabe an Dritte findet nicht statt. Löschung nach 90 Tagen.
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.
      </p>

      <h3>Qualitätssicherung der KI-Chat-Funktion (Langfuse)</h3>
      <p>
        Zur Fehleranalyse und Qualitätssicherung der Chat-Funktion nutzen wir die selbst gehostete
        Open-Source-Software Langfuse auf eigenen Servern in Deutschland. Verarbeitet werden
        Chat-Eingaben und -Ausgaben, das verwendete KI-Modell, Token-Zahlen, eine pseudonyme Nutzer-
        und Thread-Kennung, Zeitstempel sowie – sofern Du sie abgibst – Deine Bewertung einer
        Antwort (Daumen hoch/runter). Eine Weitergabe an Dritte findet nicht statt, ebenso wenig
        eine Nutzung zum KI-Training. Löschung nach 30 Tagen. Rechtsgrundlage ist Art. 6 Abs. 1 lit.
        f DSGVO (berechtigtes Interesse an der Qualitätssicherung).
      </p>

      <h3>Cookies und lokale Speicherung im Browser</h3>
      <p>
        Technisch notwendige Cookies (insbesondere ein Session-Cookie zur Authentifizierung) setzen
        wir auf Grundlage von § 25 Abs. 2 Nr. 2 TDDDG i. V. m. Art. 6 Abs. 1 lit. b DSGVO ohne
        Einwilligung. Zusätzlich nutzen wir den lokalen Speicher Deines Browsers
        (localStorage/sessionStorage) für den Login-Status, Deine Einstellungen (z. B. Dark Mode),
        die Zwischenspeicherung von Entwürfen sowie den Einwilligungsstatus. Diese Daten werden
        ausschließlich lokal in Deinem Browser gespeichert und nicht an unsere Server übertragen; Du
        kannst sie jederzeit über die Browsereinstellungen löschen.
      </p>

      <h3 id="webanalyse">Reichweitenmessung mit Umami</h3>
      <p>
        Zur statistischen Auswertung der Zugriffe nutzen wir den Open-Source-Webanalysedienst Umami,
        den wir selbst auf eigenen Servern in Europa betreiben. Die Analyse wird erst nach Deiner
        ausdrücklichen Einwilligung aktiviert. Erfasst werden – nur nach Einwilligung – besuchte
        Seiten und Verweildauer, Referrer, Browsertyp und Betriebssystem, eine anonymisierte
        IP-Adresse sowie ein ungefährer Standort (Land/Region); es werden keine personenbezogenen
        Identifikatoren gebildet und keine Daten an Dritte weitergegeben. Rechtsgrundlage ist § 25
        Abs. 1 TDDDG i. V. m. Art. 6 Abs. 1 lit. a DSGVO. Speicherdauer 13 Monate. Deine
        Einwilligung kannst Du jederzeit mit Wirkung für die Zukunft widerrufen – über die
        Datenschutz-Einstellungen der Plattform oder durch Löschen des Eintrags „analyticsConsent"
        in Deinen Browser-Einstellungen.
      </p>

      <h2>Rechte der betroffenen Personen</h2>
      <p>
        Eine automatisierte Entscheidungsfindung im Einzelfall einschließlich Profiling im Sinne des
        Art. 22 DSGVO findet nicht statt. Als betroffene Person stehen Dir die folgenden Rechte zu:
      </p>
      <ul>
        <li>
          <strong>Auskunft</strong> (Art. 15 DSGVO) über die von uns verarbeiteten Daten.
        </li>
        <li>
          <strong>Berichtigung</strong> unrichtiger und Vervollständigung unvollständiger Daten
          (Art. 16 DSGVO).
        </li>
        <li>
          <strong>Löschung</strong> (Art. 17 DSGVO) und Einschränkung der Verarbeitung (Art. 18
          DSGVO).
        </li>
        <li>
          <strong>Datenübertragbarkeit</strong> (Art. 20 DSGVO), soweit die Verarbeitung auf
          Einwilligung oder Vertrag beruht und automatisiert erfolgt.
        </li>
        <li>
          <strong>Widerruf</strong> erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7
          Abs. 3 DSGVO).
        </li>
        <li>
          <strong>Widerspruch</strong> aus Gründen Deiner besonderen Situation gegen Verarbeitungen
          auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (Art. 21 DSGVO).
        </li>
        <li>
          <strong>Beschwerde</strong> bei einer Aufsichtsbehörde (Art. 77 DSGVO). Die für uns
          zuständige Aufsichtsbehörde ist die Landesbeauftragte für Datenschutz und
          Informationsfreiheit Nordrhein-Westfalen (LDI NRW), Kavalleriestr. 2–4, 40213 Düsseldorf.
        </li>
      </ul>

      <p>
        <strong>Besonderheiten bei externer Verarbeitung:</strong> Deine Rechte hinsichtlich der zur
        Transkription an Mistral AI Voxtral bzw. GreenPT übermittelten Audiodaten kannst Du über uns
        geltend machen; die Audiodaten werden dort nicht dauerhaft gespeichert. Bilder im Grünerator
        Imagine speichern wir nicht, sondern leiten sie nur durch; Deine Rechte hinsichtlich
        etwaiger bei Black Forest Labs oder bei Seeweb/Regolo AI befindlicher Bilddaten kannst Du
        dennoch jederzeit über uns geltend machen. Zusätzlich erreichst Du Black Forest Labs direkt
        unter <a href="mailto:support@blackforestlabs.ai">support@blackforestlabs.ai</a>.
      </p>
    </div>
  );
};

export default Datenschutz;
