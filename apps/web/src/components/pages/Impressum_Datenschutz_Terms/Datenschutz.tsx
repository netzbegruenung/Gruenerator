import { PRIMARY_URL } from '../../../config/domains';

const Datenschutz = () => {
  return (
    <div className="page-container">
      <h1>Datenschutzerklärung</h1>
      <p>Stand: 16. Juni 2026</p>

      <h2>Kurzzusammenfassung</h2>
      <p>
        <strong>
          Der <a href={PRIMARY_URL}>GRUENERATOR</a> verarbeitet nur die Texte, die Du aktiv in die
          Eingabefelder eingibst. Diese werden zur KI-Bearbeitung an einen unserer europäischen
          KI-Dienstleister weitergeleitet (insbesondere <a href="https://mistral.ai/">Mistral AI</a>{' '}
          in Frankreich, KI-Modelle der netzbegrünung e.V. sowie Seeweb/Regolo AI in Italien);
          welches Modell verwendet wird, kannst Du pro Anfrage selbst wählen. Deine Daten werden
          dort nicht zum Training der KI verwendet. Bei Nutzung des{' '}
          <strong>Grünerator Imagine</strong> zur Bildbearbeitung werden Deine hochgeladenen Bilder
          direkt an <strong>Black Forest Labs</strong> auf EU-Servern weitergeleitet und dort mit
          dem FLUX-Modell verarbeitet. Wir speichern die Bilder nicht auf unseren Servern. Die
          Bilder werden ausschließlich zur Bearbeitung verwendet und nicht zum Training der KI
          genutzt. Wenn Du die Suchfunktion des GRUENERATORs nutzt, werden Deine Suchanfragen über
          unsere KI-Dienstleister sowie spezialisierte Suchdienste (in der EU) verarbeitet. Bei
          Nutzung der Sprachverarbeitung werden deine Audiodaten an Mistral AI in der EU verarbeitet
          (Voxtral für Spracherkennung, Mistral TTS für die Sprachausgabe des KI-Agenten). Bei
          Aktivierung des <strong>Echtzeit-Sprachdialogs</strong> bleibt Dein Mikrofon für die Dauer
          der Sitzung aktiv und wird automatisch freigegeben, sobald Du die Sitzung beendest, den
          Browser-Tab wechselst, die Seite verlässt oder das Fenster schließt. Bitte achte also
          darauf, dass Du keine personenbezogenen oder vertraulichen Daten eingibst oder sprichst
          und dass sich keine weiteren Personen ohne deren Einwilligung in Hörweite Deines Mikrofons
          befinden.
        </strong>
      </p>
      <p>
        <strong>Hinweis zu den KI-Anbietern:</strong> Du kannst pro Anfrage selbst wählen, welches
        KI-Modell und damit welcher Anbieter Deine Eingaben verarbeitet (oder „Automatisch" wählen
        lassen). Es kommen ausschließlich Anbieter mit Verarbeitung in der EU zum Einsatz:
      </p>
      <ul>
        <li>Mistral AI (Frankreich)</li>
        <li>KI-Modelle der netzbegrünung e.V. (eigene Server, EU)</li>
        <li>Seeweb/Regolo AI (Italien)</li>
      </ul>
      <p>Die Auswahl triffst Du bei jeder einzelnen Anfrage selbst.</p>
      <p>
        <strong>
          Wenn Du die Sprachaufnahme-Funktion oder den Reel-Grünerator nutzt, werden Deine Audio-
          und Videodaten auf unserem Server verarbeitet. Die Audiodaten werden zur Transkription
          vorrangig an <strong>Regolo</strong> (EU, Zero Data Retention) oder alternativ an{' '}
          <strong>Mistral AI Voxtral</strong> (EU) übermittelt. Die verarbeiteten Daten werden nicht
          dauerhaft bei uns gespeichert.
        </strong>
      </p>
      <p>
        Ausführliche Informationen zur Datenschutzerklärung und Deinen Rechten findest Du unten auf
        dieser Seite. Weiterführende Informationen dazu, wie Mistral AI Deine Eingaben verarbeitet
        und behandelt, findest Du in der{' '}
        <a href="https://mistral.ai/privacy-policy/">Datenschutzerklärung</a> sowie in den{' '}
        <a href="https://mistral.ai/terms/">Nutzungsbedingungen</a> von Mistral AI.
      </p>
      <p>
        <u>Hinweis:</u>
        <br />
        Die{' '}
        <a href="https://netzbegruenung.de/">
          netzbegrünung – Verein für grüne Netzkultur e.V.
        </a>{' '}
        arbeitet daran alle Daten selbst zu verarbeiten, damit Du den GRUENERATOR schon bald
        komplett sorg- und bedenklos nutzen kannst. Falls Du dieses Ziel unterstützen willst, kannst
        Du das mit einer <a href="https://netzbegruenung.de/verein/spenden/">Spende</a> oder einer{' '}
        <a href="https://netzbegruenung.de/verein/mitgliedsantrag/">Mitgliedschaft</a> tun.
      </p>

      <h2 id="nutzungsbedingungen">Nutzungsbedingungen</h2>
      <p>
        Es gelten unsere <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>.
      </p>

      <h2>Datenschutzhinweise</h2>
      <p>
        Informationen über die Verarbeitung Deiner Daten gemäß{' '}
        <a href="https://dejure.org/gesetze/DSGVO/13.html">
          Art. 13 der Datenschutz-Grundverordnung (DS-GVO)
        </a>
      </p>

      <h3>1. Verantwortlicher</h3>
      <p>
        Verantwortlich für diese Website ist Moritz Wächter, Villestr. 6-8, 53347 Alfter,
        info@moritz-waechter.de.
      </p>

      <h3>
        2. Daten, die für die Bereitstellung der Website und die Erstellung der Protokolldateien
        verarbeitet werden
      </h3>
      <h4>a. Welche Daten werden für welchen Zweck verarbeitet?</h4>
      <p>
        Wir verarbeiten personenbezogene Daten unserer Nutzer*innen grundsätzlich nur, soweit dies
        zur Bereitstellung einer funktionsfähigen Website erforderlich ist. Die Verarbeitung
        personenbezogener Daten unserer Nutzer*innen erfolgt regelmäßig nur nach Einwilligung der
        Nutzer*in. Eine Ausnahme gilt in solchen Fällen, in denen eine vorherige Einholung einer
        Einwilligung aus tatsächlichen Gründen nicht möglich ist und die Verarbeitung der Daten
        durch gesetzliche Vorschriften gestattet.
      </p>
      <p>
        Die vorübergehende Speicherung der Daten ist für den Ablauf eines Websitebesuchs
        erforderlich, um eine Auslieferung der Website zu ermöglichen.
      </p>

      <h4>b. Auf welcher Rechtsgrundlage werden diese Daten verarbeitet?</h4>
      <p>
        Die Daten werden auf der Grundlage{' '}
        <a href="https://dejure.org/gesetze/DSGVO/6.html">des Art. 6 Abs. 1 Buchstabe f DS-GVO</a>{' '}
        verarbeitet.
      </p>

      <h4>c. Gibt es neben dem Verantwortlichen weitere Empfänger der personenbezogenen Daten?</h4>
      <p>
        Die Website wird bei Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Deutschland,
        info@hetzner.com gehostet. Der Hoster empfängt die oben genannten Daten als
        Auftragsverarbeiter. Bei Nutzung des Grünerator Imagine fungiert Black Forest Labs Inc. als
        Auftragsverarbeiter für die Bildbearbeitung mittels FLUX-KI. Beim Reel-Grünerator fungiert{' '}
        <strong>Regolo AI</strong> als Auftragsverarbeiter für die Audiotranskription mit Zero Data
        Retention (EU-Datenverarbeitung). Als Fallback wird <strong>Mistral AI Voxtral</strong> für
        die Transkription eingesetzt.
      </p>

      <p>
        Darüber hinaus nutzen wir für die Bereitstellung der KI-Funktionen und der Suchfunktion
        spezialisierte technische Dienstleister, die als unsere Auftragsverarbeiter agieren. Für die
        Anwendungsüberwachung nutzen wir die selbst gehostete Open-Source-Software{' '}
        <strong>GlitchTip</strong> auf eigenen Servern in der EU; eine Weitergabe an Dritte findet
        dabei nicht statt.
      </p>

      <h3>Auftragsverarbeitung durch technische Dienstleister</h3>

      <p>
        <strong>Gemeinsame Grundsätze für alle Dienstleister:</strong>
      </p>
      <ul>
        <li>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)</li>
        <li>Auftragsverarbeitungsverträge gemäß Art. 28 DSGVO vorhanden</li>
        <li>
          <strong>
            Kein KI-Training: Deine Daten werden bei keinem unserer Partner zum Training verwendet
          </strong>
        </li>
        <li>Maximale Speicherdauer: 30 Tage für technische Zwecke/Missbrauchserkennung</li>
        <li>Verarbeitung ausschließlich in der EU (außer spezifisch erwähnt)</li>
      </ul>

      <h4>Unsere Auftragsverarbeiter im Detail:</h4>

      <p>
        <strong>1. Mistral AI</strong> (15 rue des Halles, 75001 Paris, Frankreich)
      </p>
      <ul>
        <li>
          Zweck: Text- und Sprachverarbeitung (KI-Textmodelle, Voxtral für Spracherkennung, Mistral
          Speech/TTS für die Sprachausgabe im Echtzeit-Sprachdialog)
        </li>
        <li>Server: EU (Frankreich)</li>
        <li>
          Im Echtzeit-Sprachdialog: Live-Stream-Verarbeitung ohne Persistierung bei netzbegrünung;
          keine Nutzung zu Trainingszwecken; keine Erstellung von Stimmprofilen
        </li>
        <li>Besonderheit: Subunternehmer möglich (mit EU-Standardvertragsklauseln)</li>
        <li>
          Details: <a href="https://mistral.ai/privacy-policy/">Datenschutzerklärung</a> und{' '}
          <a href="https://mistral.ai/terms/">Nutzungsbedingungen</a>
        </li>
      </ul>

      <p>
        <strong>2. IONOS SE</strong> (Elgendorfer Str. 57, 56410 Montabaur, Deutschland)
      </p>
      <ul>
        <li>
          Zweck: Ergänzende KI-Textgenerierung für bestimmte Generator-/Overflow-Funktionen (nicht
          im Chat wählbar)
        </li>
        <li>Server: Deutschland</li>
        <li>
          Besonderheit: Deutscher Anbieter mit vollständiger EU-Datenverarbeitung, keine Nutzung zu
          Trainingszwecken
        </li>
        <li>
          Details:{' '}
          <a href="https://www.ionos.de/terms-gtc/datenschutzerklaerung/">Datenschutzerklärung</a>
        </li>
      </ul>

      <p>
        <strong>3. Black Forest Labs Inc.</strong>
      </p>
      <ul>
        <li>Zweck: Bildbearbeitung (FLUX-Modell im Grünerator Imagine)</li>
        <li>Server: Ausschließlich EU</li>
        <li>Besonderheit: Keine Speicherung auf unseren Servern, direkte Weiterleitung</li>
        <li>Verarbeitete Daten: Eingabebilder, Prompts, Ausgabebilder, Metadaten</li>
      </ul>

      <p>
        <strong>4. Seeweb S.r.l. / Regolo AI</strong> (C.so Lazio 9/a, 03100 Frosinone, Italien)
      </p>
      <ul>
        <li>
          Zweck: Audio-/Videotranskription (Reel-Grünerator, Sprachaufnahme) sowie KI-Textmodelle
          und semantische Aufbereitung (Reranking)
        </li>
        <li>Server: EU (Italien)</li>
        <li>Transkriptionsmodell: faster-whisper-large-v3</li>
        <li>
          Zero Data Retention: Bei der Transkription werden Input- und Output-Daten am Ende jeder
          Session gelöscht
        </li>
        <li>DSGVO-konform: Italienisches Unternehmen mit ausschließlicher EU-Datenverarbeitung</li>
        <li>
          Details:{' '}
          <a href="https://regolo.ai/docs/compliance-and-privacy/privacy-policy/">
            Datenschutzerklärung
          </a>
        </li>
      </ul>

      <p>
        <strong>5. netzbegrünung e.V.</strong> (Deutschland)
      </p>
      <ul>
        <li>Zweck: Kerninfrastruktur des GRUENERATOR</li>
        <li>Server: Eigene Server in Finnland (EU)</li>
        <li>
          Bereitgestellte Dienste:
          <ul>
            <li>PostgreSQL-Datenbank (Benutzerprofile, Einstellungen)</li>
            <li>Keycloak-Authentifizierung (Login, Benutzerverwaltung)</li>
            <li>Redis (Session-Speicher, max. 24h Speicherdauer)</li>
            <li>Qdrant-Vektorsuche (semantische Suche in Parteiprogrammen, anonymisiert)</li>
            <li>Textbegrünung/Etherpad (kollaboratives Schreiben, Pad-IDs ohne Personenbezug)</li>
            <li>
              KI-Modelle der netzbegrünung (KI-Verarbeitung bei aktivierter Datenschutz-Option)
            </li>
          </ul>
        </li>
        <li>
          Besonderheit: Vollständige Datenkontrolle durch grüne Netzkultur, keine kommerzielle
          Datennutzung
        </li>
      </ul>

      <p>
        <strong>6. SearXNG (selbstgehostet)</strong>
      </p>
      <ul>
        <li>Zweck: Suchfunktion (Metasuchmaschine für Web-Informationen)</li>
        <li>Server: Eigene Server (Deutschland)</li>
        <li>Besonderheit: Keine Weitergabe an externe Suchanbieter, vollständige Datenkontrolle</li>
      </ul>

      <p>
        <strong>7. Linkup Technologies</strong> (Linkup Technologies SAS, 28 avenue des Pépinières,
        94260 Fresnes, Frankreich; Handelsregister Créteil 930 910 740)
      </p>
      <ul>
        <li>Zweck: Agentische Web-Recherche mit Quellenangaben (Suche-Modus, Tiefenrecherche)</li>
        <li>Server: EU (Frankreich)</li>
        <li>Verarbeitete Daten: Suchanfrage</li>
        <li>
          Besonderheit: Französischer Anbieter mit ausschließlicher EU-Datenverarbeitung — keine
          Drittlandübermittlung; ausdrückliche DSGVO-Compliance laut Anbieter
        </li>
        <li>
          Details: <a href="https://www.linkup.so/privacy-policy">Datenschutzerklärung</a> und{' '}
          <a href="https://www.linkup.so/terms-of-use">Nutzungsbedingungen</a>
        </li>
      </ul>

      <p>
        <strong>8. GlitchTip (selbstgehostet)</strong>
      </p>
      <ul>
        <li>Zweck: Fehlerüberwachung und Anwendungsmonitoring (Error Tracking)</li>
        <li>Server: Eigene bzw. von der netzbegrünung betriebene Server in der EU</li>
        <li>Verarbeitete Daten: Fehlerberichte, Stack-Traces, Browserinformationen, IP-Adressen</li>
        <li>Speicherdauer: Automatische Löschung nach 90 Tagen</li>
        <li>Sicherheit: TLS 1.2+, Verschlüsselung im Ruhezustand</li>
        <li>
          Besonderheit: Selbst gehostete Open-Source-Software (Alternative zu Sentry); keine
          Weitergabe an Dritte, keine Drittlandübermittlung, keine Nutzung zum KI-Training
        </li>
        <li>
          Details: <a href="https://glitchtip.com/legal/privacy/">Datenschutzerklärung</a>
        </li>
      </ul>

      <h3 id="webanalyse">Webanalyse mit Umami</h3>
      <p>
        Diese Website nutzt den Open-Source-Webanalysedienst Umami zur statistischen Auswertung der
        Besucherzugriffe. Umami wird vom Grünerator selbst auf eigenen Servern in Europa gehostet
        und betrieben.
      </p>
      <p>
        <strong>Einwilligung:</strong> Die Webanalyse wird erst aktiviert, nachdem Du bei Deinem
        ersten Besuch zugestimmt hast. Ohne Deine Einwilligung findet keine Analyse statt.
      </p>
      <p>
        <strong>Erfasste Daten (nur nach Einwilligung):</strong>
      </p>
      <ul>
        <li>Besuchte Seiten und Verweildauer</li>
        <li>Referrer (von welcher Seite Du kamst)</li>
        <li>Browsertyp und Betriebssystem</li>
        <li>Anonymisierte IP-Adresse (keine vollständige IP-Speicherung)</li>
        <li>Ungefährer Standort (Land/Region)</li>
      </ul>
      <p>
        <strong>Datenschutz-Eigenschaften:</strong>
      </p>
      <ul>
        <li>Server ausschließlich in Europa</li>
        <li>Keine Weitergabe an Dritte</li>
        <li>Keine Verknüpfung mit anderen Datenquellen</li>
        <li>Keine personenbezogenen Daten oder eindeutige Identifikatoren</li>
        <li>Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</li>
      </ul>
      <p>
        <strong>Widerruf:</strong> Du kannst Deine Einwilligung jederzeit widerrufen. Lösche dazu
        den Eintrag „analyticsConsent" in Deinen Browser-Einstellungen (Websitedaten/Cookies) oder
        lade die Seite nach dem Widerruf neu.
      </p>

      <h3>Cookies und Einwilligung</h3>
      <p>
        Diese Website verwendet Cookies. Technisch notwendige Cookies werden ohne Einwilligung
        gesetzt. Analyse-Cookies (Umami) werden erst nach Deiner ausdrücklichen Einwilligung
        aktiviert.
      </p>
      <p>
        <strong>Verwendete Cookies:</strong>
      </p>
      <ul>
        <li>
          <strong>Session-Cookie:</strong> Zur Authentifizierung und Aufrechterhaltung Deiner
          Sitzung (technisch notwendig, Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO)
        </li>
        <li>
          <strong>Umami-Tracking:</strong> Zur anonymisierten Webanalyse (nur nach Einwilligung,
          Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO)
        </li>
      </ul>

      <h3>Lokale Speicherung im Browser</h3>
      <p>
        Wir nutzen den lokalen Speicher Deines Browsers (localStorage, sessionStorage) für folgende
        Zwecke:
      </p>
      <ul>
        <li>
          <strong>Authentifizierungsdaten:</strong> Speicherung des Login-Status und der
          Sitzungsinformationen
        </li>
        <li>
          <strong>Benutzereinstellungen:</strong> Deine persönlichen Präferenzen wie Dark Mode,
          Spracheinstellungen
        </li>
        <li>
          <strong>Temporäre Zwischenspeicherung:</strong> Entwürfe und ungesendete Eingaben, damit
          nichts verloren geht
        </li>
        <li>
          <strong>Einwilligungsstatus:</strong> Ob Du den Nutzungsbedingungen und der Webanalyse
          zugestimmt hast
        </li>
      </ul>
      <p>
        <strong>Hinweis:</strong> Diese Daten werden ausschließlich lokal in Deinem Browser
        gespeichert und nicht an unsere Server übertragen. Du kannst sie jederzeit über die
        Browser-Einstellungen (Websitedaten/Cookies löschen) entfernen.
      </p>

      <p>
        <strong>Wichtiger Hinweis zur Datenverarbeitung:</strong>
        Wir verarbeiten ausschließlich die von Dir bewusst eingegebenen Texte. Eine automatische
        Erhebung oder Analyse Deiner politischen Ansichten findet nicht statt. Ob und welche
        politischen Inhalte verarbeitet werden, liegt vollständig in Deiner Entscheidung. Bitte
        achte darauf, keine personenbezogenen oder vertraulichen Daten in die Eingabefelder
        einzugeben, für deren Verarbeitung Du keine Rechtsgrundlage hast.
      </p>

      <h4>d. Wie lange werden die Daten gespeichert?</h4>
      <p>
        Die Daten werden gelöscht, sobald sie für die Erreichung des Zwecks ihrer Erhebung nicht
        mehr erforderlich sind. Bei der Bereitstellung der Website ist dies der Fall, wenn die
        jeweilige Sitzung beendet ist.
      </p>

      <h3>Medienverarbeitung (Video/Audio/Sprache)</h3>

      <p>
        <strong>Verarbeitung auf unseren Servern:</strong>
      </p>
      <ul>
        <li>Sprachaufnahme & Reel-Videos: FFmpeg (Videobearbeitung) und Orchestrierung</li>
        <li>Sofortlöschung der Original-Dateien nach Verarbeitung</li>
        <li>Keine dauerhafte Speicherung</li>
        <li>Keine manuelle Sichtung oder Anhörung</li>
        <li>Keine Nutzung zu Trainingszwecken</li>
      </ul>

      <p>
        <strong>Externe Verarbeitung durch Dienstleister (Transkription):</strong>
      </p>
      <ul>
        <li>
          Sprache-zu-Text (primär): Regolo / Seeweb (EU-Server, Zero Data Retention, Modell
          faster-whisper-large-v3)
        </li>
        <li>Sprache-zu-Text (Fallback): Mistral Voxtral (EU-Server, max. 30 Tage)</li>
        <li>Details zu externen Dienstleistern: siehe Auftragsverarbeiter-Sektion oben</li>
      </ul>

      <h3 id="echtzeit-sprachdialog">Echtzeit-Sprachdialog (Voice Agent)</h3>
      <p>
        Der GRUENERATOR bietet einen bidirektionalen Sprachdialog mit der KI an. Du startest die
        Sitzung über einen sichtbaren Klick auf das Mikrofon-/Voice-Symbol in der Eingabezeile. Eine
        Sitzung beginnt nur nach Deinem ausdrücklichen, aktiven Einverständnis.
      </p>
      <p>
        <strong>Datenfluss:</strong>
      </p>
      <ul>
        <li>
          Dein Mikrofon-Audio wird im Browser auf 16&nbsp;kHz (PCM) heruntergerechnet und über eine
          verschlüsselte WebSocket-Verbindung an unseren Server der netzbegrünung e.V. (EU)
          gesendet.
        </li>
        <li>
          Unser Server leitet den Audiostream zur Spracherkennung an{' '}
          <strong>Mistral AI Voxtral</strong> (EU, Frankreich) weiter.
        </li>
        <li>
          Das erkannte Transkript wird in unserer Chat-Pipeline (ChatGraph) mit dem von Dir
          gewählten KI-Modell verarbeitet (siehe „Hinweis zu den KI-Anbietern" oben).
        </li>
        <li>
          Die Textantwort des Agenten wird satzweise an <strong>Mistral AI Speech (TTS)</strong>{' '}
          (EU, Frankreich) gesendet und als Audio-Stream zurück in Deinen Browser geliefert, wo sie
          lokal über Deine Lautsprecher abgespielt wird.
        </li>
      </ul>
      <p>
        <strong>Mikrofon-Freigabe:</strong> Das Mikrofon bleibt nur so lange aktiv, wie die
        Sprachsitzung läuft. Es wird automatisch und unverzüglich freigegeben (
        <code>MediaStreamTrack.stop</code>), sobald einer dieser Auslöser eintritt:
      </p>
      <ul>
        <li>Du klickst auf das Voice-Symbol oder den Hintergrund des Sprachdialog-Fensters</li>
        <li>Du wechselst den Browser-Tab oder minimierst das Fenster (Visibility Change)</li>
        <li>Du verlässt die Seite, lädst neu oder schließt den Tab (pagehide / beforeunload)</li>
        <li>Du wechselst innerhalb der Anwendung in einen anderen Bereich (Route-Navigation)</li>
        <li>Der Browser-Tab gerät in den Hintergrund (z. B. iOS-bfcache)</li>
      </ul>
      <p>
        <strong>Speicherung &amp; Training:</strong> Audio-Frames werden ausschließlich im
        Arbeitsspeicher unseres Servers durchgereicht (Live-Stream, keine Persistenz). Weder wir
        noch Mistral AI verwenden Deinen Audiostream zum Training von KI-Modellen. Es werden keine
        Sprachprofile (Voice Prints) erstellt.
      </p>
      <p>
        <strong>Rechtsgrundlage:</strong>{' '}
        <a href="https://dejure.org/gesetze/DSGVO/6.html">Art. 6 Abs. 1 lit. a DSGVO</a>{' '}
        (Einwilligung durch aktive Aktivierung der Sprachsitzung). Du kannst Deine Einwilligung
        jederzeit durch das Beenden der Sitzung widerrufen.
      </p>
      <p>
        <strong>Deine Verantwortung:</strong> Sprache kann unbeabsichtigt sensible Informationen
        enthalten — politische Meinungen, Gesundheitsangaben, religiöse Überzeugungen,
        Identifikationsmerkmale Dritter (
        <a href="https://dejure.org/gesetze/DSGVO/9.html">Art. 9 DSGVO</a>). Bitte nutze den
        Echtzeit-Sprachdialog nur in einer Umgebung, in der sich keine weiteren Personen ohne deren
        Einwilligung in Hörweite Deines Mikrofons befinden, und sprich keine Daten Dritter aus, für
        deren Verarbeitung Du keine Rechtsgrundlage hast. Die Funktion ist nicht für die Nutzung
        durch Minderjährige unter 16 Jahren ohne Einwilligung der Erziehungsberechtigten bestimmt.
      </p>

      <h3>Zweck und Dauer der Datenspeicherung</h3>
      <p>
        Die Speicherung Deiner Daten dient dazu, Dir die Funktionen unserer Anwendung zur Verfügung
        zu stellen, insbesondere das Erstellen, Bearbeiten und Abrufen Deiner Inhalte. Deine Daten
        werden so lange gespeichert, wie sie für die Bereitstellung unserer Dienste erforderlich
        sind oder bis Du eine Löschung beantragst. Nach Beendigung der Nutzung unserer Dienste
        werden Deine Daten für weitere 30 Tage aufbewahrt und anschließend gelöscht, es sei denn,
        gesetzliche Aufbewahrungspflichten erfordern eine längere Speicherung. Deine Rechte auf
        Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung sind im Abschnitt
        „Betroffenenrechte" beschrieben.
      </p>

      <h4>Übersicht der Speicherfristen</h4>
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
            <td>Bis Sitzungsende, max. 24 Stunden</td>
          </tr>
          <tr>
            <td>Benutzerprofile</td>
            <td>Bis zur Löschung durch Nutzer</td>
          </tr>
          <tr>
            <td>KI-Anfragen (KI-Dienstleister)</td>
            <td>Max. 30 Tage (Missbrauchserkennung)</td>
          </tr>
          <tr>
            <td>Fehlerberichte (GlitchTip)</td>
            <td>90 Tage (automatische Löschung)</td>
          </tr>
          <tr>
            <td>Audio-/Video-Transkription (Regolo)</td>
            <td>Zero Retention – Löschung am Ende der Session</td>
          </tr>
          <tr>
            <td>Echtzeit-Sprachdialog (Mikrofon-Stream, TTS-Audio)</td>
            <td>Live-Stream ohne Persistierung; Mikrofon-Freigabe bei Sitzungsende</td>
          </tr>
          <tr>
            <td>Umami-Analysen</td>
            <td>13 Monate</td>
          </tr>
          <tr>
            <td>Server-Logs</td>
            <td>7 Tage</td>
          </tr>
        </tbody>
      </table>

      <h3>3. Betroffenenrechte</h3>
      <h4>a. Recht auf Auskunft</h4>
      <p>
        Du kannst Auskunft nach{' '}
        <a href="https://dejure.org/gesetze/DSGVO/15.html">Art. 15 DS-GVO</a> über Deine
        personenbezogenen Daten verlangen, die wir verarbeiten.
      </p>

      <p>
        <strong>Audiodaten beim Reel-Grünerator:</strong>
        Deine Betroffenenrechte bezüglich der an Regolo/Seeweb übermittelten Audiodaten kannst Du
        über uns geltend machen. Direktkontakt: privacy@seeweb.it. Die Daten werden am Ende der
        Session automatisch gelöscht (Zero Data Retention).
      </p>

      <p>
        <strong>Bilder im Grünerator Imagine:</strong> Da wir Deine Bilder nicht speichern, sondern
        nur durchleiten, können wir keine Auskunft über oder Löschung von Bilddaten vornehmen, die
        sich möglicherweise bei Black Forest Labs befinden. Hierfür kontaktiere bitte direkt Black
        Forest Labs unter support@blackforestlabs.ai.
      </p>

      <h4>b. Recht auf Widerspruch</h4>
      <p>
        Du hast ein Recht auf Widerspruch aus besonderen Gründen (siehe Abschnitt „Recht auf
        Widerspruch gemäß Art. 21 Abs. 1 DS-GVO").
      </p>

      <h4>c. Recht auf Berichtigung</h4>
      <p>
        Sollten die Dich betreffenden Angaben nicht (mehr) zutreffend sein, kannst Du nach{' '}
        <a href="https://dejure.org/gesetze/DSGVO/16.html">Art. 16 DS-GVO</a> eine Berichtigung
        verlangen. Sollten Deine Daten unvollständig sein, kannst Du eine Vervollständigung
        verlangen.
      </p>

      <h4>d. Recht auf Löschung</h4>
      <p>
        Du kannst nach <a href="https://dejure.org/gesetze/DSGVO/17.html">Art. 17 DS-GVO</a> die
        Löschung Deiner personenbezogenen Daten verlangen.
      </p>

      <h4>e. Recht auf Einschränkung der Verarbeitung</h4>
      <p>
        Du hast nach <a href="https://dejure.org/gesetze/DSGVO/18.html">Art. 18 DS-GVO</a> das
        Recht, eine Einschränkung der Verarbeitung Deiner personenbezogenen Daten zu verlangen.
      </p>

      <h4>f. Recht auf Beschwerde</h4>
      <p>
        Wenn Du der Ansicht bist, dass die Verarbeitung Deiner personenbezogenen Daten gegen
        Datenschutzrecht verstößt, hast Du nach{' '}
        <a href="https://dejure.org/gesetze/DSGVO/77.html">Art. 77 Abs. 1 DS-GVO</a> das Recht, Dich
        bei einer Datenschutzaufsichtsbehörde eigener Wahl zu beschweren. Die für den
        Verantwortlichen zuständige Aufsichtsbehörde ist die Landesbeauftragte für Datenschutz und
        Informationsfreiheit Nordrhein-Westfalen (LDI NRW), Kavalleriestr. 2-4, 40213 Düsseldorf.
      </p>

      <h4>g. Recht auf Datenübertragbarkeit</h4>
      <p>
        Die Erfassung der Daten zur Bereitstellung der Website und die Speicherung der
        Protokolldateien sind für den Betrieb der Internetseite zwingend erforderlich. Sie beruhen
        daher nicht auf einer Einwilligung nach{' '}
        <a href="https://dejure.org/gesetze/DSGVO/6.html">Art. 6 Abs. 1 Buchstabe a DS-GVO</a> oder
        auf einem Vertrag{' '}
        <a href="https://dejure.org/gesetze/DSGVO/6.html">nach Art. 6 Abs. 1 Buchstabe b DS-GVO</a>,
        sondern sind{' '}
        <a href="https://dejure.org/gesetze/DSGVO/6.html">nach Art. 6 Abs. 1 Buchstabe f DS-GVO</a>{' '}
        gerechtfertigt. Die Voraussetzungen des{' '}
        <a href="https://dejure.org/gesetze/DSGVO/20.html">Art. 20 Abs. 1 DSGVO</a> sind demnach
        insoweit nicht erfüllt.
      </p>

      <h3>Recht auf Widerspruch gemäß Art. 21 Abs. 1 DS-GVO</h3>
      <p>
        Du hast das Recht, aus Gründen, die sich aus Deiner besonderen Situation ergeben, jederzeit
        gegen die Verarbeitung Deiner personenbezogenen Daten, die aufgrund von{' '}
        <a href="https://dejure.org/gesetze/DSGVO/6.html">Artikel 6 Abs. 1 Buchstabe f DS-GVO</a>{' '}
        erfolgt, Widerspruch einzulegen. Der Verantwortliche verarbeitet die personenbezogenen Daten
        dann nicht mehr, es sei denn, er kann zwingende schutzwürdige Gründe für die Verarbeitung
        nachweisen, die die Interessen, Rechte und Freiheiten der betroffenen Person überwiegen,
        oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von
        Rechtsansprüchen. Die Erfassung der Daten zur Bereitstellung der Website und die Speicherung
        der Protokolldateien sind für den Betrieb der Internetseite zwingend erforderlich.
      </p>

      <h2>Sicherheitsmaßnahmen</h2>
      <p>
        Wir treffen nach Maßgabe der gesetzlichen Vorgaben unter Berücksichtigung des Stands der
        Technik, der Implementierungskosten und der Art, des Umfangs, der Umstände und der Zwecke
        der Verarbeitung sowie der unterschiedlichen Eintrittswahrscheinlichkeiten und des Ausmaßes
        der Bedrohung der Rechte und Freiheiten natürlicher Personen geeignete technische und
        organisatorische Maßnahmen, um ein dem Risiko angemessenes Schutzniveau zu gewährleisten.
      </p>
      <p>
        Zu den Maßnahmen gehören insbesondere die Sicherung der Vertraulichkeit, Integrität und
        Verfügbarkeit von Daten durch Kontrolle des physischen und elektronischen Zugangs zu den
        Daten als auch des sie betreffenden Zugriffs, der Eingabe, der Weitergabe, der Sicherung der
        Verfügbarkeit und ihrer Trennung. Des Weiteren haben wir Verfahren eingerichtet, die eine
        Wahrnehmung von Betroffenenrechten, die Löschung von Daten und Reaktionen auf die Gefährdung
        der Daten gewährleisten. Ferner berücksichtigen wir den Schutz personenbezogener Daten
        bereits bei der Entwicklung bzw. Auswahl von Hardware, Software sowie Verfahren entsprechend
        dem Prinzip des Datenschutzes, durch Technikgestaltung und durch datenschutzfreundliche
        Voreinstellungen.
      </p>

      <h2>Übermittlung von personenbezogenen Daten</h2>
      <p>
        Im Rahmen unserer Verarbeitung von personenbezogenen Daten kommt es vor, dass diese an
        andere Stellen, Unternehmen, rechtlich selbstständige Organisationseinheiten oder Personen
        übermittelt beziehungsweise ihnen gegenüber offengelegt werden. Zu den Empfängern dieser
        Daten können z. B. mit IT-Aufgaben beauftragte Dienstleister gehören oder Anbieter von
        Diensten und Inhalten, die in eine Website eingebunden sind. In solchen Fällen beachten wir
        die gesetzlichen Vorgaben und schließen insbesondere entsprechende Verträge bzw.
        Vereinbarungen, die dem Schutz Deiner Daten dienen, mit den Empfängern Deiner Daten ab.
      </p>

      <h2>Internationale Datentransfers</h2>
      <p>
        Datenverarbeitung in Drittländern: Sofern wir Daten in einem Drittland (d. h.,außerhalb der
        Europäischen Union (EU), des Europäischen Wirtschaftsraums (EWR)) verarbeiten oder die
        Verarbeitung im Rahmen der Inanspruchnahme von Diensten Dritter oder der Offenlegung bzw.
        Übermittlung von Daten an andere Personen, Stellen oder Unternehmen stattfindet, erfolgt
        dies nur im Einklang mit den gesetzlichen Vorgaben. Sofern das Datenschutzniveau in dem
        Drittland mittels eines Angemessenheitsbeschlusses anerkannt wurde (Art. 45 DSGVO), dient
        dieser als Grundlage des Datentransfers. Im Übrigen erfolgen Datentransfers nur dann, wenn
        das Datenschutzniveau anderweitig gesichert ist, insbesondere durch Standardvertragsklauseln
        (Art. 46 Abs. 2 lit. c) DSGVO), ausdrückliche Einwilligung oder im Fall vertraglicher oder
        gesetzlich erforderlicher Übermittlung (Art. 49 Abs. 1 DSGVO). Im Übrigen teilen wir Dir die
        Grundlagen der Drittlandübermittlung bei den einzelnen Anbietern aus dem Drittland mit,
        wobei die Angemessenheitsbeschlüsse als Grundlagen vorrangig gelten. Informationen zu
        Drittlandtransfers und vorliegenden Angemessenheitsbeschlüssen kannst Du dem
        Informationsangebot der EU-Kommission entnehmen.
      </p>

      <p>
        EU-US Trans-Atlantic Data Privacy Framework: Im Rahmen des sogenannten Data Privacy
        Framework (DPF) hat die EU-Kommission das Datenschutzniveau ebenfalls für bestimmte
        Unternehmen aus den USA im Rahmen des Angemessenheitsbeschlusses vom 10.07.2023 als sicher
        anerkannt. Die Liste der zertifizierten Unternehmen sowie weitere Informationen zu dem DPF
        kannst Du der Website des Handelsministeriums der USA unter{' '}
        <a href="https://www.dataprivacyframework.gov/">https://www.dataprivacyframework.gov/</a>{' '}
        (in Englisch) entnehmen. Wir informieren Dich im Rahmen der Datenschutzhinweise, welche von
        uns eingesetzten Diensteanbieter unter dem Data Privacy Framework zertifiziert sind.
      </p>

      <h2>Allgemeine Informationen zur Datenspeicherung und Löschung</h2>
      <p>
        Wir löschen personenbezogene Daten, die wir verarbeiten, gemäß den gesetzlichen
        Bestimmungen, sobald die zugrundeliegenden Einwilligungen widerrufen werden oder keine
        weiteren rechtlichen Grundlagen für die Verarbeitung bestehen. Dies betrifft Fälle, in denen
        der ursprüngliche Verarbeitungszweck entfällt oder die Daten nicht mehr benötigt werden.
        Ausnahmen von dieser Regelung bestehen, wenn gesetzliche Pflichten oder besondere Interessen
        eine längere Aufbewahrung oder Archivierung der Daten erfordern.
      </p>
      <p>
        Insbesondere müssen Daten, die aus handels- oder steuerrechtlichen Gründen aufbewahrt werden
        müssen oder deren Speicherung notwendig ist zur Rechtsverfolgung oder zum Schutz der Rechte
        anderer natürlicher oder juristischer Personen, entsprechend archiviert werden.
      </p>
      <p>
        Unsere Datenschutzhinweise enthalten zusätzliche Informationen zur Aufbewahrung und Löschung
        von Daten, die speziell für bestimmte Verarbeitungsprozesse gelten.
      </p>
      <p>
        Bei mehreren Angaben zur Aufbewahrungsdauer oder Löschungsfristen eines Datums, ist stets
        die längste Frist maßgeblich.
      </p>
      <p>
        Beginnt eine Frist nicht ausdrücklich zu einem bestimmten Datum und beträgt sie mindestens
        ein Jahr, so startet sie automatisch am Ende des Kalenderjahres, in dem das fristauslösende
        Ereignis eingetreten ist. Im Fall laufender Vertragsverhältnisse, in deren Rahmen Daten
        gespeichert werden, ist das fristauslösende Ereignis der Zeitpunkt des Wirksamwerdens der
        Kündigung oder sonstige Beendigung des Rechtsverhältnisses.
      </p>
      <p>
        Daten, die nicht mehr für den ursprünglich vorgesehenen Zweck, sondern aufgrund gesetzlicher
        Vorgaben oder anderer Gründe aufbewahrt werden, verarbeiten wir ausschließlich zu den
        Gründen, die ihre Aufbewahrung rechtfertigen.
      </p>

      <h3>Weitere Hinweise zu Verarbeitungsprozessen, Verfahren und Diensten:</h3>
      <ul>
        <li>
          <strong>Aufbewahrung und Löschung von Daten:</strong> Die folgenden allgemeinen Fristen
          gelten für die Aufbewahrung und Archivierung nach deutschem Recht:
          <ul>
            <li>
              10 Jahre - Aufbewahrungsfrist für Bücher und Aufzeichnungen, Jahresabschlüsse,
              Inventare, Lageberichte, Eröffnungsbilanz sowie die zu ihrem Verständnis
              erforderlichen Arbeitsanweisungen und sonstigen Organisationsunterlagen,
              Buchungsbelege und Rechnungen (§ 147 Abs. 3 i. V. m. Abs. 1 Nr. 1, 4 und 4a AO, § 14b
              Abs. 1 UStG, § 257 Abs. 1 Nr. 1 u. 4, Abs. 4 HGB).
            </li>
            <li>
              6 Jahre - Übrige Geschäftsunterlagen: empfangene Handels- oder Geschäftsbriefe,
              Wiedergaben der abgesandten Handels- oder Geschäftsbriefe, sonstige Unterlagen, soweit
              sie für die Besteuerung von Bedeutung sind, z. B. Stundenlohnzettel,
              Betriebsabrechnungsbögen, Kalkulationsunterlagen, Preisauszeichnungen, aber auch
              Lohnabrechnungsunterlagen, soweit sie nicht bereits Buchungsbelege sind und
              Kassenstreifen (§ 147 Abs. 3 i. V. m. Abs. 1 Nr. 2, 3, 5 AO, § 257 Abs. 1 Nr. 2 u. 3,
              Abs. 4 HGB).
            </li>
            <li>
              3 Jahre - Daten, die erforderlich sind, um potenzielle Gewährleistungs- und
              Schadensersatzansprüche oder ähnliche vertragliche Ansprüche und Rechte zu
              berücksichtigen sowie damit verbundene Anfragen zu bearbeiten, basierend auf früheren
              Geschäftserfahrungen und üblichen Branchenpraktiken, werden für die Dauer der
              regulären gesetzlichen Verjährungsfrist von drei Jahren gespeichert (§§ 195, 199 BGB).
            </li>
          </ul>
        </li>
      </ul>
    </div>
  );
};

export default Datenschutz;
