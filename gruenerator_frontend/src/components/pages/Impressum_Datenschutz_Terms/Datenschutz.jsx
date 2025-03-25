import React from 'react';
const Datenschutz = () => {
  return (
    <div className="page-container">
      <h1>Datenschutzerklärung</h1>
      <p>Stand: 03. März 2025</p>
      
      <h2>Kurzzusammenfassung</h2>
      <p>
        <strong>Der <a href="https://gruenerator.de/">GRUENERATOR</a> erhebt keine Daten von Dir.
        Die von Dir getätigten Eingaben werden im Hintergrund an
        <a href="https://www.anthropic.com/">ANTHROPIC</a> weitergeleitet. Wenn Du die Suchfunktion des GRUENERATORs nutzt, 
        werden Deine Suchanfragen zusätzlich an <a href="https://tavily.com/">TAVILY</a> weitergeleitet. Bei Nutzung der Sprachverarbeitung werden deine Audiodaten an OpenAI in den USA weitergeleitet. Die Daten werden dort verarbeitet
        und für 28 Tage gespeichert. Bitte achte also darauf, dass Du keine
        personenbezogenen oder vertraulichen Daten eingibst oder sprichst.</strong>
      </p>
      <p>
        <strong>Wenn Du die Sprachaufnahme-Funktion oder den Reel-Grünerator nutzt, werden Deine Audio- und Videodaten ausschließlich auf unserem Server mit Whisper und FFmpeg verarbeitet und nicht an Dritte weitergegeben. Die Audio- und Videodaten werden nur für die Verarbeitung verwendet und direkt nach Abschluss des Vorgangs gelöscht. Die verarbeiteten Daten werden ebenfalls nicht dauerhaft gespeichert. Sie werden weder von Menschen angehört/angesehen noch zu Trainingszwecken genutzt.</strong>
      </p>
      <p>
        Ausführliche Informationen zur Datenschutzerklärung und Deinen Rechten
        findest Du unten auf dieser Seite. Weiterführende Informationen dazu,
        wie ANTHROPIC Deine Eingaben verarbeitet und behandelt, findest Du in
        der <a href="https://www.anthropic.com/legal/privacy">Datenschutzerklärung</a>
        sowie in den <a href="https://www.anthropic.com/legal/aup">Nutzungsbedingungen</a>
        von Anthropic.
      </p>
      <p>
        <u>Hinweis:</u><br />
        Die <a href="https://netzbegruenung.de/">netzbegrünung – Verein für grüne Netzkultur
        e.V.</a> arbeitet daran alle Daten selbst zu verarbeiten, damit Du den GRUENERATOR schon bald komplett sorg- und
        bedenklos nutzen kannst. Falls Du dieses Ziel unterstützen willst,
        kannst Du das mit einer
        <a href="https://netzbegruenung.de/verein/spenden/">Spende</a> oder einer
        <a href="https://netzbegruenung.de/verein/mitgliedsantrag/">Mitgliedschaft.</a>
      </p>

      <h2 id="nutzungsbedingungen">Nutzungsbedingungen</h2>
      <p>
        Die von Dir getätigten Eingaben werden im Hintergrund an ANTHROPIC
        weitergeleitet, dort verarbeitet und für 28 Tage gespeichert. Mit dem
        Absenden Deiner Eingabe sicherst Du zu, keine personenbezogenen oder
        vertraulichen Daten eingegeben zu haben und die <a href="https://www.anthropic.com/legal/aup">Nutzungsbedingungen von
        Anthropic</a>, die Deine Daten empfangen und verarbeiten, zu beachten.
      </p>

      <h2>Datenschutzhinweise</h2>
      <p>
        Informationen über die Verarbeitung Ihrer Daten gemäß <a href="https://dejure.org/gesetze/DSGVO/13.html">Art. 13 der
        Datenschutz-Grundverordnung (DS-GVO)</a>
      </p>

      <h3>1. Verantwortlicher und Datenschutzbeauftragter</h3>
      <p>
        Verantwortlich für diese Website ist Moritz Wächter, Villestr. 6-8, 53347 Alfter,
       info@moritz-waechter.de. 
      </p>

      <h3>2. Daten, die für die Bereitstellung der Website und die Erstellung der Protokolldateien verarbeitet werden</h3>
      <h4>a. Welche Daten werden für welchen Zweck verarbeitet?</h4>
      <p>
        Wir verarbeiten personenbezogene Daten unserer Nutzer*innen
        grundsätzlich nur, soweit dies zur Bereitstellung einer
        funktionsfähigen Website erforderlich ist. Die Verarbeitung
        personenbezogener Daten unserer Nutzer*innen erfolgt regelmäßig nur
        nach Einwilligung der Nutzer*in. Eine Ausnahme gilt in solchen
        Fällen, in denen eine vorherige Einholung einer Einwilligung aus
        tatsächlichen Gründen nicht möglich ist und die Verarbeitung der
        Daten durch gesetzliche Vorschriften gestattet.
      </p>
      <p>
        Die vorübergehende Speicherung der Daten ist für den Ablauf eines
        Websitebesuchs erforderlich, um eine Auslieferung der Website zu
        ermöglichen.
      </p>

      <h3>Verarbeitung von Video- und Audiodaten</h3>
      <p>
        Wenn Du den Reel-Grünerator oder die Sprachaufnahme-Funktion nutzt, werden Deine hochgeladenen Video- und Audiodaten wie folgt verarbeitet:
        <ul>
          <li>Die Daten werden ausschließlich auf unseren eigenen Servern verarbeitet</li>
          <li>Für die Verarbeitung verwenden wir Whisper (Spracherkennung) und FFmpeg (Videobearbeitung)</li>
          <li>Die Daten werden nicht an externe Dienste weitergeleitet</li>
          <li>Die Original-Dateien werden direkt nach der Verarbeitung gelöscht</li>
          <li>Die verarbeiteten Daten werden nicht dauerhaft gespeichert</li>
          <li>Es erfolgt keine manuelle Sichtung oder Anhörung der Daten</li>
          <li>Die Daten werden nicht zu Trainingszwecken verwendet</li>
        </ul>
      </p>

      <p>
        Wenn Du die Sprachverarbeitung nutzt, werden deine Audiodaten zusätzlich wie folgt verarbeitet:
        <ul>
          <li>Die Audiodaten werden zur Transkription an OpenAI in den USA übermittelt</li>
          <li>Die Verarbeitung erfolgt durch OpenAI's Whisper-API</li>
          <li>Die Daten werden bei OpenAI für 28 Tage gespeichert</li>
          <li>OpenAI verwendet die Daten nicht zum Training ihrer Modelle</li>
          <li>Die Datenübermittlung erfolgt auf Grundlage des EU-US Data Privacy Framework</li>
          <li>Nach der Verarbeitung werden die lokalen Kopien der Audiodaten sofort gelöscht</li>
          <li>Die generierten Transkripte werden nur temporär gespeichert</li>
        </ul>
      </p>

      <h4>b. Auf welcher Rechtsgrundlage werden diese Daten verarbeitet?</h4>
      <p>
        Die Daten werden auf der Grundlage <a href="https://dejure.org/gesetze/DSGVO/6.html">des Art. 6 Abs. 1 Buchstabe f
        DS-GVO</a> verarbeitet.
      </p>

      <h4>c. Gibt es neben dem Verantwortlichen weitere Empfänger der personenbezogenen Daten?</h4>
      <p>
        Die Website wird bei [Name, Postadresse, E-Mail-Adresse des
        Hosters] gehostet. Der Hoster empfängt die oben genannten Daten als
        Auftragsverarbeiter.
      </p>
      <p>
        Darüber hinaus werden Deine Eingaben im Hintergrund an ANTHROPIC weitergeleitet. 
        Bei Nutzung der Suchfunktion werden Deine Suchanfragen zusätzlich an TAVILY
        weitergeleitet. Die Daten werden dort verarbeitet und für 28 Tage gespeichert. Mit
        dem Absenden Deiner Eingabe sicherst Du zu, keine personenbezogenen
        oder vertraulichen Daten eingegeben zu haben und die
        <a href="https://www.anthropic.com/legal/aup">Nutzungsbedingungen von Anthropic</a> sowie bei Nutzung der Suchfunktion die 
        <a href="https://tavily.com/terms">Nutzungsbedingungen von Tavily</a>, die Deine Daten
        empfangen und verarbeiten, zu beachten. Weitere Informationen dazu sowie zu Deinen Rechten findest Du in der
        <a href="https://www.anthropic.com/legal/privacy">Datenschutzerklärung von Anthropic</a> und der
        <a href="https://www.tavily.com/privacy">Datenschutzerklärung von Tavily</a>.
      </p>

      <h4>d. Wie lange werden die Daten gespeichert?</h4>
      <p>
        Die Daten werden gelöscht, sobald sie für die Erreichung des Zwecks
        ihrer Erhebung nicht mehr erforderlich sind. Bei der Bereitstellung
        der Website ist dies der Fall, wenn die jeweilige Sitzung beendet
        ist.
      </p>

      <h3>Art der gespeicherten Daten</h3>
      <p>
        Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer gespeicherten Daten. Zur Ausübung dieser Rechte können Sie sich jederzeit an uns wenden.
      </p>

      <h3>Zweck der Datenspeicherung</h3>
      <p>
        Die Speicherung dieser Daten dient dazu, Ihnen die Funktionen unserer Anwendung zur Verfügung zu stellen, insbesondere das Erstellen, Bearbeiten und Abrufen Ihrer Inhalte.
      </p>

      <h3>Dauer der Datenspeicherung</h3>
      <p>
        Ihre Daten werden so lange in Supabase gespeichert, wie sie für die Bereitstellung unserer Dienste erforderlich sind oder bis Sie eine Löschung beantragen. Nach Beendigung der Nutzung unserer Dienste werden Ihre Daten für weitere [X] Tage aufbewahrt und anschließend gelöscht, es sei denn, gesetzliche Aufbewahrungspflichten erfordern eine längere Speicherung.
      </p>

      <h3>Standort der Datenverarbeitung</h3>
      <p>
        Supabase verarbeitet Daten in Rechenzentren innerhalb der Europäischen Union. [Falls zutreffend: In einigen Fällen können Daten auch in Rechenzentren außerhalb der EU verarbeitet werden. In diesen Fällen stellen wir sicher, dass ein angemessenes Datenschutzniveau gemäß Art. 44 ff. DSGVO gewährleistet ist.]
      </p>

      <h3>Rechtsgrundlage</h3>
      <p>
        Die Verarbeitung Ihrer Daten in Supabase erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung bzw. Durchführung vorvertraglicher Maßnahmen) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der effizienten und sicheren Bereitstellung unserer Dienste).
      </p>

      <h3>3. Betroffenenrechte</h3>
      <h4>a. Recht auf Auskunft</h4>
      <p>
        Du kannst Auskunft nach <a href="https://dejure.org/gesetze/DSGVO/15.html">Art. 15
        DS-GVO</a> über Deine personenbezogenen Daten verlangen, die wir verarbeiten.
      </p>

      <p>
        Bezüglich der Verarbeitung von Sprachdaten durch OpenAI haben Sie das Recht:
        <ul>
          <li>Auskunft über die verarbeiteten Daten zu erhalten</li>
          <li>Die Löschung der Daten vor Ablauf der 28-Tage-Frist zu verlangen</li>
          <li>Der Verarbeitung zu widersprechen</li>
          <li>Ihre Einwilligung jederzeit zu widerrufen</li>
        </ul>
      </p>

      <h4>b. Recht auf Widerspruch</h4>
      <p>
        Du hast ein Recht auf Widerspruch aus besonderen Gründen (siehe
        unter Punkt II).
      </p>

      <h4>c. Recht auf Berichtigung</h4>
      <p>
        Sollten die Sie betreffenden Angaben nicht (mehr) zutreffend sein,
        kannst Du nach <a href="https://dejure.org/gesetze/DSGVO/16.html">Art. 16
        DS-GVO</a> eine Berichtigung verlangen. Sollten Deine Daten unvollständig sein, kannst Du eine
        Vervollständigung verlangen.
      </p>

      <h4>d. Recht auf Löschung</h4>
      <p>
        Du kannst nach <a href="https://dejure.org/gesetze/DSGVO/17.html">Art. 17
        DS-GVO</a> die Löschung Deiner personenbezogenen Daten verlangen.
      </p>

      <h4>e. Recht auf Einschränkung der Verarbeitung</h4>
      <p>
        Du hast nach <a href="https://dejure.org/gesetze/DSGVO/18.html">Art. 18
        DS-GVO</a> das Recht, eine Einschränkung der Verarbeitung Deiner personenbezogenen Daten zu
        verlangen.
      </p>

      <h4>f. Recht auf Beschwerde</h4>
      <p>
        Wenn Du der Ansicht bist, dass die Verarbeitung Deiner
        personenbezogenen Daten gegen Datenschutzrecht verstößt, hast Du
        nach <a href="https://dejure.org/gesetze/DSGVO/77.html">Art. 77 Abs. 1
        DS-GVO</a> das Recht, Dich bei einer Datenschutzaufsichtsbehörde eigener Wahl zu beschweren.
      </p>

      <h4>g. Recht auf Datenübertragbarkeit</h4>
      <p>
        Die Erfassung der Daten zur Bereitstellung der Website und die
        Speicherung der Protokolldateien sind für den Betrieb der
        Internetseite zwingend erforderlich. Sie beruhen daher nicht auf
        einer Einwilligung nach <a href="https://dejure.org/gesetze/DSGVO/6.html">Art. 6 Abs. 1 Buchstabe a
        DS-GVO</a> oder auf einem Vertrag <a href="https://dejure.org/gesetze/DSGVO/6.html">nach Art. 6 Abs. 1 Buchstabe b
        DS-GVO</a>, sondern sind <a href="https://dejure.org/gesetze/DSGVO/6.html">nach Art. 6 Abs. 1 Buchstabe f
        DS-GVO</a> gerechtfertigt. Die Voraussetzungen des <a href="https://dejure.org/gesetze/DSGVO/20.html">Art. 20 Abs. 1
        DSGVO</a> sind demnach insoweit nicht erfüllt.
      </p>

      <h3>II. Recht auf Widerspruch gemäß Art. 21 Abs. 1 DS-GVO</h3>
      <p>
        Du hast das Recht, aus Gründen, die sich aus Deiner besonderen
        Situation ergeben, jederzeit gegen die Verarbeitung Deiner
        personenbezogenen Daten, die aufgrund von <a href="https://dejure.org/gesetze/DSGVO/6.html">Artikel 6 Abs. 1
        Buchstabe f DS-GVO</a> erfolgt, Widerspruch einzulegen. Der Verantwortliche verarbeitet die
        personenbezogenen Daten dann nicht mehr, es sei denn, er kann
        zwingende schutzwürdige Gründe für die Verarbeitung nachweisen, die
        die Interessen, Rechte und Freiheiten der betroffenen Person
        überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung
        oder Verteidigung von Rechtsansprüchen. Die Erfassung der Daten zur
        Bereitstellung der Website und die Speicherung der Protokolldateien
        sind für den Betrieb der Internetseite zwingend erforderlich.
      </p>

      <h2>Sicherheitsmaßnahmen</h2>
      <p>
        Wir treffen nach Maßgabe der gesetzlichen Vorgaben unter
        Berücksichtigung des Stands der Technik, der Implementierungskosten und
        der Art, des Umfangs, der Umstände und der Zwecke der Verarbeitung sowie
        der unterschiedlichen Eintrittswahrscheinlichkeiten und des Ausmaßes der
        Bedrohung der Rechte und Freiheiten natürlicher Personen geeignete
        technische und organisatorische Maßnahmen, um ein dem Risiko
        angemessenes Schutzniveau zu gewährleisten.
      </p>
      <p>
        Zu den Maßnahmen gehören insbesondere die Sicherung der Vertraulichkeit,
        Integrität und Verfügbarkeit von Daten durch Kontrolle des physischen
        und elektronischen Zugangs zu den Daten als auch des sie betreffenden
        Zugriffs, der Eingabe, der Weitergabe, der Sicherung der Verfügbarkeit
        und ihrer Trennung. Des Weiteren haben wir Verfahren eingerichtet, die
        eine Wahrnehmung von Betroffenenrechten, die Löschung von Daten und
        Reaktionen auf die Gefährdung der Daten gewährleisten. Ferner
        berücksichtigen wir den Schutz personenbezogener Daten bereits bei der
        Entwicklung bzw. Auswahl von Hardware, Software sowie Verfahren
        entsprechend dem Prinzip des Datenschutzes, durch Technikgestaltung und
        durch datenschutzfreundliche Voreinstellungen.
      </p>

      <h2>Übermittlung von personenbezogenen Daten</h2>
      <p>
        Im Rahmen unserer Verarbeitung von personenbezogenen Daten kommt es vor,
        dass diese an andere Stellen, Unternehmen, rechtlich selbstständige
        Organisationseinheiten oder Personen übermittelt beziehungsweise ihnen
        gegenüber offengelegt werden. Zu den Empfängern dieser Daten können
        z. B. mit IT-Aufgaben beauftragte Dienstleister gehören oder Anbieter
        von Diensten und Inhalten, die in eine Website eingebunden sind. In
        solchen Fällen beachten wir die gesetzlichen Vorgaben und schließen
        insbesondere entsprechende Verträge bzw. Vereinbarungen, die dem Schutz
        Ihrer Daten dienen, mit den Empfängern Ihrer Daten ab.
      </p>

      <h2>Internationale Datentransfers</h2>
      <p>
        Datenverarbeitung in Drittländern: Sofern wir Daten in einem Drittland
        (d. h.,außerhalb der Europäischen Union (EU), des Europäischen
        Wirtschaftsraums (EWR)) verarbeiten oder die Verarbeitung im Rahmen der
        Inanspruchnahme von Diensten Dritter oder der Offenlegung bzw.
        Übermittlung von Daten an andere Personen, Stellen oder Unternehmen
        stattfindet, erfolgt dies nur im Einklang mit den gesetzlichen Vorgaben.
        Sofern das Datenschutzniveau in dem Drittland mittels eines
        Angemessenheitsbeschlusses anerkannt wurde (Art. 45 DSGVO), dient dieser
        als Grundlage des Datentransfers. Im Übrigen erfolgen Datentransfers nur
        dann, wenn das Datenschutzniveau anderweitig gesichert ist, insbesondere
        durch Standardvertragsklauseln (Art. 46 Abs. 2 lit. c) DSGVO),
        ausdrückliche Einwilligung oder im Fall vertraglicher oder gesetzlich
        erforderlicher Übermittlung (Art. 49 Abs. 1 DSGVO). Im Übrigen teilen
        wir Ihnen die Grundlagen der Drittlandübermittlung bei den einzelnen
        Anbietern aus dem Drittland mit, wobei die Angemessenheitsbeschlüsse als
        Grundlagen vorrangig gelten. Informationen zu Drittlandtransfers und
        vorliegenden Angemessenheitsbeschlüssen können dem Informationsangebot
        der EU-Kommission entnommen werden.
      </p>

      <p>
        Für die Übermittlung von Audiodaten an OpenAI (USA) gilt:
        <ul>
          <li>Die Übermittlung erfolgt auf Basis des EU-US Data Privacy Framework</li>
          <li>OpenAI Ireland Limited ist der verantwortliche Vertragspartner für EU-Nutzer</li>
          <li>Es besteht ein Datenverarbeitungsvertrag (DPA) gemäß Art. 28 DSGVO</li>
          <li>Technische und organisatorische Maßnahmen zum Schutz der Daten sind vertraglich festgelegt</li>
          <li>Die Speicherdauer bei OpenAI ist auf 28 Tage begrenzt</li>
        </ul>
      </p>

      <p>
        EU-US Trans-Atlantic Data Privacy Framework: Im Rahmen des sogenannten
        Data Privacy Framework (DPF) hat die EU-Kommission das Datenschutzniveau
        ebenfalls für bestimmte Unternehmen aus den USA im Rahmen der
        Angemessenheitsbeschlusses vom 10.07.2023 als sicher anerkannt. Die
        Liste der zertifizierten Unternehmen als auch weitere Informationen zu
        dem DPF können Sie der Website des Handelsministeriums der USA
        unter <a href="https://www.dataprivacyframework.gov/">https://www.dataprivacyframework.gov/</a> (in Englisch) entnehmen.
        Wir informieren Sie im Rahmen der Datenschutzhinweise, welche von uns
        eingesetzten Diensteanbieter unter dem Data Privacy Framework
        zertifiziert sind.
      </p>

      <h2>Allgemeine Informationen zur Datenspeicherung und Löschung</h2>
      <p>
        Wir löschen personenbezogene Daten, die wir verarbeiten, gemäß den
        gesetzlichen Bestimmungen, sobald die zugrundeliegenden Einwilligungen
        widerrufen werden oder keine weiteren rechtlichen Grundlagen für die
        Verarbeitung bestehen. Dies betrifft Fälle, in denen der ursprüngliche
        Verarbeitungszweck entfällt oder die Daten nicht mehr benötigt werden.
        Ausnahmen von dieser Regelung bestehen, wenn gesetzliche Pflichten oder
        besondere Interessen eine längere Aufbewahrung oder Archivierung der
        Daten erfordern.
      </p>
      <p>
        Insbesondere müssen Daten, die aus handels- oder steuerrechtlichen
        Gründen aufbewahrt werden müssen oder deren Speicherung notwendig ist
        zur Rechtsverfolgung oder zum Schutz der Rechte anderer natürlicher oder
        juristischer Personen, entsprechend archiviert werden.
      </p>
      <p>
        Unsere Datenschutzhinweise enthalten zusätzliche Informationen zur
        Aufbewahrung und Löschung von Daten, die speziell für bestimmte
        Verarbeitungsprozesse gelten.
      </p>
      <p>
        Bei mehreren Angaben zur Aufbewahrungsdauer oder Löschungsfristen eines
        Datums, ist stets die längste Frist maßgeblich.
      </p>
      <p>
        Beginnt eine Frist nicht ausdrücklich zu einem bestimmten Datum und
        beträgt sie mindestens ein Jahr, so startet sie automatisch am Ende des
        Kalenderjahres, in dem das fristauslösende Ereignis eingetreten ist. Im
        Fall laufender Vertragsverhältnisse, in deren Rahmen Daten gespeichert
        werden, ist das fristauslösende Ereignis der Zeitpunkt des
        Wirksamwerdens der Kündigung oder sonstige Beendigung des
        Rechtsverhältnisses.
      </p>
      <p>
        Daten, die nicht mehr für den ursprünglich vorgesehenen Zweck, sondern
        aufgrund gesetzlicher Vorgaben oder anderer Gründe aufbewahrt werden,
        verarbeiten wir ausschließlich zu den Gründen, die ihre Aufbewahrung
        rechtfertigen.
      </p>

      <h3>Weitere Hinweise zu Verarbeitungsprozessen, Verfahren und Diensten:</h3>
      <ul>
        <li>
          <strong>Aufbewahrung und Löschung von Daten:</strong> Die folgenden allgemeinen
          Fristen gelten für die Aufbewahrung und Archivierung nach
          deutschem Recht:
          <ul>
            <li>
              10 Jahre - Aufbewahrungsfrist für Bücher und Aufzeichnungen,
              Jahresabschlüsse, Inventare, Lageberichte, Eröffnungsbilanz
              sowie die zu ihrem Verständnis erforderlichen
              Arbeitsanweisungen und sonstigen Organisationsunterlagen,
              Buchungsbelege und Rechnungen (§ 147 Abs. 3 i. V. m. Abs. 1
              Nr. 1, 4 und 4a AO, § 14b Abs. 1 UStG, § 257 Abs. 1 Nr. 1 u.
              4, Abs. 4 HGB).
            </li>
            <li>
              6 Jahre - Übrige Geschäftsunterlagen: empfangene Handels- oder
              Geschäftsbriefe, Wiedergaben der abgesandten Handels- oder
              Geschäftsbriefe, sonstige Unterlagen, soweit sie für die
              Besteuerung von Bedeutung sind, z. B. Stundenlohnzettel,
              Betriebsabrechnungsbögen, Kalkulationsunterlagen,
              Preisauszeichnungen, aber auch Lohnabrechnungsunterlagen,
              soweit sie nicht bereits Buchungsbelege sind und
              Kassenstreifen (§ 147 Abs. 3 i. V. m. Abs. 1 Nr. 2, 3, 5 AO, §
              257 Abs. 1 Nr. 2 u. 3, Abs. 4 HGB).
            </li>
            <li>
              3 Jahre - Daten, die erforderlich sind, um potenzielle
              Gewährleistungs- und Schadensersatzansprüche oder ähnliche
              vertragliche Ansprüche und Rechte zu berücksichtigen sowie
              damit verbundene Anfragen zu bearbeiten, basierend auf
              früheren Geschäftserfahrungen und üblichen Branchenpraktiken,
              werden für die Dauer der regulären gesetzlichen
              Verjährungsfrist von drei Jahren gespeichert (§§ 195, 199
              BGB).
            </li>
          </ul>
        </li>
      </ul>

     
    </div>
  );
};

export default Datenschutz;