import { PRIMARY_URL } from '../../../config/domains';

const Nutzungsbedingungen = () => {
  return (
    <div className="page-container">
      <h1>Nutzungsbedingungen</h1>
      <p>Stand: 2. September 2026</p>

      <h2>§ 1 Geltungsbereich</h2>
      <p>
        (1) Diese Nutzungsbedingungen gelten für die Nutzung der Plattform{' '}
        <strong>GRUENERATOR</strong> (erreichbar unter <a href={PRIMARY_URL}>{PRIMARY_URL}</a>),
        betrieben von Moritz Wächter, Villestr. 6-8, 53347 Alfter (nachfolgend „Betreiber").
      </p>
      <p>
        (2) Mit der Registrierung oder Nutzung der Plattform erklärst Du Dich mit diesen
        Nutzungsbedingungen einverstanden. Sofern Du die Nutzungsbedingungen nicht akzeptierst, ist
        eine Nutzung der Plattform nicht gestattet.
      </p>
      <p>
        (3) Der Betreiber stellt die Plattform im Auftrag und in Zusammenarbeit mit der{' '}
        <a href="https://netzbegruenung.de/">netzbegrünung – Verein für grüne Netzkultur e.V.</a>{' '}
        bereit.
      </p>

      <h2>§ 2 Leistungsbeschreibung</h2>
      <p>
        (1) Der GRUENERATOR ist eine KI-gestützte Content-Erstellungsplattform. Die Plattform bietet
        insbesondere folgende Funktionen:
      </p>
      <ul>
        <li>
          <strong>KI-Textgenerierung:</strong> Erstellung von Pressemitteilungen,
          Social-Media-Beiträgen, Reden und weiteren Texten mithilfe künstlicher Intelligenz
        </li>
        <li>
          <strong>Bildbearbeitung und -generierung:</strong> Erstellung und Bearbeitung von
          Sharepics und Grafiken (Grünerator Imagine)
        </li>
        <li>
          <strong>Audio- und Videotranskription:</strong> Umwandlung von Sprach- und Videoaufnahmen
          in Text (Reel-Grünerator)
        </li>
        <li>
          <strong>Notebooks:</strong> KI-gestützte Frage-Antwort-Funktion zu Parteiprogrammen,
          Beschlüssen und weiteren Dokumenten
        </li>
        <li>
          <strong>Kollaborative Dokumentenbearbeitung:</strong> Gemeinsames Erstellen und Bearbeiten
          von Texten in Echtzeit
        </li>
        <li>
          <strong>Sprachverarbeitung:</strong> Diktat und einmalige Spracheingabe über Mistral
          Voxtral
        </li>
        <li>
          <strong>Echtzeit-Sprachdialog (Voice Agent):</strong> Bidirektionales, freihändiges
          Gespräch mit der KI mit kontinuierlich aktivem Mikrofon für die Dauer der Sitzung sowie
          Sprachausgabe der Antworten (KugelAudio, EU)
        </li>
      </ul>
      <p>
        (2) Der Betreiber ist berechtigt, den Funktionsumfang der Plattform jederzeit zu erweitern,
        einzuschränken oder zu verändern, sofern dies für Dich zumutbar ist.
      </p>
      <p>
        (3) Die Nutzung der Plattform ist derzeit unentgeltlich. Ein Anspruch auf dauerhafte
        kostenlose Bereitstellung besteht nicht.
      </p>

      <h2>§ 3 Registrierung und Benutzerkonto</h2>
      <p>
        (1) Die Nutzung der Plattform setzt eine Registrierung voraus. Die Registrierung erfolgt
        über den zentralen Anmeldedienst (Keycloak) der netzbegrünung e.V.
      </p>
      <p>
        (2) Du bist verpflichtet, bei der Registrierung wahrheitsgemäße und vollständige Angaben zu
        machen und diese aktuell zu halten.
      </p>
      <p>
        (3) Dein Benutzerkonto ist persönlich und darf nicht an Dritte weitergegeben werden. Du bist
        für alle Aktivitäten verantwortlich, die unter Deinem Konto stattfinden.
      </p>
      <p>
        (4) Du kannst Dein Benutzerkonto jederzeit löschen. Nach der Löschung werden Deine
        personenbezogenen Daten gemäß unserer <a href="/datenschutz">Datenschutzerklärung</a>{' '}
        behandelt.
      </p>
      <p>
        (5) Die Registrierung setzt voraus, dass Du das nach dem Recht Deines Aufenthaltsstaates für
        die Einwilligung erforderliche Mindestalter erreicht hast (in Deutschland 16, in Österreich
        14 Jahre) oder die Einwilligung der Erziehungsberechtigten vorliegt.
      </p>

      <h2>§ 4 Nutzungsregeln</h2>
      <p>(1) Bei der Nutzung der Plattform ist Folgendes untersagt:</p>
      <ul>
        <li>
          Die Eingabe rechtswidriger, beleidigender, diskriminierender oder gewaltverherrlichender
          Inhalte
        </li>
        <li>
          Die Eingabe personenbezogener Daten Dritter, für deren Verarbeitung keine Rechtsgrundlage
          besteht
        </li>
        <li>
          Der Upload von Bildern mit erkennbaren Personen ohne deren ausdrückliche Einwilligung
        </li>
        <li>Der Upload von Bildern mit Minderjährigen</li>
        <li>
          Die Nutzung der Plattform zur Erzeugung von Desinformation, Spam oder automatisierten
          Masseninhalten
        </li>
        <li>
          Jeder Versuch, die technische Infrastruktur der Plattform zu stören, zu überlasten oder
          unbefugt auf Daten zuzugreifen
        </li>
        <li>
          Die Aktivierung der Sprachfunktionen (insbesondere des Echtzeit-Sprachdialogs) in
          Umgebungen, in denen Stimmen oder Äußerungen Dritter ohne deren Einwilligung erfasst
          werden könnten – etwa in öffentlichen Räumen, Großraumbüros oder im familiären Umfeld mit
          Anwesenden, die nicht zugestimmt haben
        </li>
        <li>
          Das Aussprechen von Daten Dritter, besonderen Datenkategorien gemäß{' '}
          <a href="https://dejure.org/gesetze/DSGVO/9.html">Art. 9 DSGVO</a> oder vertraulichen
          Informationen, für deren Verarbeitung Du keine Rechtsgrundlage hast
        </li>
        <li>
          Die Nutzung der Sprachfunktionen durch Minderjährige unter 16 Jahren ohne Einwilligung der
          Erziehungsberechtigten
        </li>
      </ul>
      <p>
        (2) Der Betreiber behält sich vor, bei Verstößen gegen diese Nutzungsregeln den Zugang zur
        Plattform vorübergehend oder dauerhaft zu sperren.
      </p>

      <h2 id="nutzung-ki-generierter-inhalte">§ 5 Nutzung KI-generierter Inhalte</h2>
      <p>
        (1) Die Plattform nutzt verschiedene KI-Modelle zur Inhaltserstellung. Du kannst pro Anfrage
        selbst wählen, welches Modell und damit welcher Anbieter Deine Eingaben verarbeitet. Es
        kommen ausschließlich Anbieter mit Verarbeitung in der EU zum Einsatz:
      </p>
      <ul>
        <li>Mistral AI (EU-Server, Frankreich)</li>
        <li>KI-Modelle der netzbegrünung e.V. (eigene Server, EU)</li>
        <li>Seeweb/Regolo AI (EU-Server, Italien)</li>
        <li>KugelAudio (Sprachausgabe; Sitz Berlin, Verarbeitung in der EU)</li>
      </ul>
      <p>
        (2){' '}
        <strong>
          KI-generierte Inhalte können fehlerhaft, unvollständig oder irreführend sein.
        </strong>{' '}
        Der Betreiber übernimmt keine Gewähr für die Richtigkeit, Vollständigkeit oder Aktualität
        der von der KI erzeugten Texte, Bilder oder Transkriptionen.
      </p>
      <p>
        (3) Du bist allein verantwortlich für die Prüfung und Verwendung der KI-generierten Inhalte.
        Vor einer Veröffentlichung oder Weiterverwendung bist Du verpflichtet, die Inhalte auf
        Richtigkeit und Angemessenheit zu überprüfen.
      </p>
      <p>
        (4) Deine Eingaben werden zur Verarbeitung an die jeweiligen KI-Dienstleister
        weitergeleitet. Deine Daten werden dort nicht zum Training der KI verwendet. Einzelheiten
        findest Du in unserer <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>
      <p>
        (5) Wie wir KI-generierte Inhalte kennzeichnen (insbesondere die sichtbare Kennzeichnung von
        Bildern) und welche Pflichten nach Art. 50 KI-VO bestehen, erläutern wir auf der Seite{' '}
        <a href="/ki-transparenz">KI-Transparenz</a>.
      </p>

      <h2>§ 6 Geistiges Eigentum</h2>
      <p>
        (1) Die Rechte an der Plattform (Software, Design, Quellcode, Markenzeichen) liegen beim
        Betreiber. Dir wird ein einfaches, nicht übertragbares Nutzungsrecht für die Dauer der
        Nutzung eingeräumt.
      </p>
      <p>
        (2) Die von Dir erstellten Inhalte (Texte, Bilder, Dokumente) verbleiben in Deinem Eigentum
        bzw. unterliegen den jeweils geltenden Urheberrechtsbestimmungen. Durch die Nutzung der
        Plattform räumst Du dem Betreiber keine Rechte an Deinen Inhalten ein.
      </p>
      <p>
        (3) Bei KI-generierten Inhalten gelten die jeweils anwendbaren urheberrechtlichen
        Bestimmungen. Der Betreiber übernimmt keine Gewähr dafür, dass KI-generierte Inhalte frei
        von Rechten Dritter sind.
      </p>

      <h2>§ 7 Verfügbarkeit</h2>
      <p>
        (1) Der Betreiber bemüht sich um eine möglichst unterbrechungsfreie Verfügbarkeit der
        Plattform. Ein Anspruch auf ständige Verfügbarkeit besteht nicht.
      </p>
      <p>
        (2) Wartungsarbeiten, technische Störungen oder höhere Gewalt können zu vorübergehenden
        Einschränkungen führen. Der Betreiber haftet nicht für Schäden, die durch vorübergehende
        Nichtverfügbarkeit entstehen.
      </p>

      <h2>§ 8 Haftung</h2>
      <p>
        (1) Der Betreiber haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie für Schäden
        aus der Verletzung des Lebens, des Körpers oder der Gesundheit.
      </p>
      <p>
        (2) Bei leichter Fahrlässigkeit haftet der Betreiber nur bei der Verletzung wesentlicher
        Vertragspflichten (Kardinalpflichten), begrenzt auf den vorhersehbaren, vertragstypischen
        Schaden.
      </p>
      <p>
        (3) Der Betreiber haftet nicht für die inhaltliche Richtigkeit KI-generierter Inhalte. Die
        Verantwortung für die Prüfung und Verwendung liegt bei Dir (siehe § 5 Abs. 2 und 3).
      </p>
      <p>
        (4) Der Betreiber haftet nicht für Inhalte, die Du oder andere Nutzer*innen über die
        Plattform erstellen, hochladen oder teilen.
      </p>

      <h2>§ 9 Datenschutz</h2>
      <p>
        Die Verarbeitung personenbezogener Daten erfolgt gemäß unserer{' '}
        <a href="/datenschutz">Datenschutzerklärung</a>. Diese ist Bestandteil dieser
        Nutzungsbedingungen.
      </p>
      <p>
        <strong>Wichtiger Hinweis:</strong> Bitte gib keine personenbezogenen oder vertraulichen
        Daten in die Eingabefelder ein, für deren Verarbeitung Du keine Rechtsgrundlage hast. Die
        eingegebenen Texte werden zur Verarbeitung an KI-Dienstleister in der EU weitergeleitet.
      </p>

      <h2>§ 10 Änderungen der Nutzungsbedingungen</h2>
      <p>
        (1) Der Betreiber behält sich vor, diese Nutzungsbedingungen jederzeit mit Wirkung für die
        Zukunft zu ändern.
      </p>
      <p>
        (2) Über wesentliche Änderungen wirst Du in geeigneter Form informiert (z. B. per E-Mail
        oder durch einen Hinweis auf der Plattform).
      </p>
      <p>
        (3) Über Änderungen informieren wir Dich mindestens sechs Wochen vor ihrem Inkrafttreten in
        Textform (z. B. per E-Mail oder durch einen Hinweis auf der Plattform). Wesentliche
        Änderungen – insbesondere solche, die Kernfunktionen, die Haftung oder die Rechte und
        Pflichten der Parteien betreffen – werden nur mit Deiner ausdrücklichen Zustimmung wirksam.
        Stimmst Du nicht zu, kannst Du die Nutzung jederzeit beenden und Dein Konto löschen; bis
        dahin gelten die bisherigen Bedingungen fort. Bei unwesentlichen Änderungen genügt die
        fortgesetzte Nutzung der Plattform nach Inkrafttreten, worauf wir Dich in der
        Änderungsmitteilung gesondert hinweisen.
      </p>

      <h2>§ 11 Schlussbestimmungen</h2>
      <p>
        (1) Es gilt das Recht der Bundesrepublik Deutschland. Zwingende verbraucherschützende
        Vorschriften des Staates, in dem Du als Verbraucher Deinen gewöhnlichen Aufenthalt hast (z.
        B. Österreich), bleiben hiervon unberührt (Art. 6 Rom-I-VO).
      </p>
      <p>(2) Gerichtsstand ist, soweit gesetzlich zulässig, Bonn.</p>
      <p>
        (3) Sollten einzelne Bestimmungen dieser Nutzungsbedingungen unwirksam sein oder werden,
        bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
      </p>
      <p>
        Bei Fragen zu diesen Nutzungsbedingungen wende Dich bitte an:{' '}
        <a href="mailto:info@moritz-waechter.de">info@moritz-waechter.de</a>
      </p>
    </div>
  );
};

export default Nutzungsbedingungen;
