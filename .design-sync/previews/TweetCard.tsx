import { TweetCard } from '@gruenerator/ui';

// The canonical generated post: author header, body text with brand-coloured
// hashtags, a topic pill, char counter and copy action in the footer.
export function GenerierterPost() {
  return (
    <div style={{ maxWidth: 460 }}>
      <TweetCard
        authorName="Bündnis 90/Die Grünen"
        authorHandle="@Die_Gruenen"
        authorAvatar="B90"
        text="Klimaschutz entscheidet sich vor Ort. Wir fordern ein kommunales Förderprogramm für Wärmepumpen und Dachbegrünung — schnell, sozial gerecht und für alle erreichbar."
        hashtags={['Klimaschutz', 'Wärmewende']}
        topicLabel="Klima & Energie"
        topicColor="#52907A"
      />
    </div>
  );
}

// A real post with avatar image, repost line, timestamp and an "Ansehen" link.
export function RepostMitLink() {
  return (
    <div style={{ maxWidth: 460 }}>
      <TweetCard
        authorName="Grüne Berlin"
        authorHandle="@gruene_berlin"
        authorAvatar="GB"
        repostedBy="Grüne Jugend Berlin"
        text="Über 2.000 Menschen beim Bürgerdialog zur Wärmewende. Danke für eure Fragen und Ideen — genau so geht Beteiligung vor Ort."
        topicLabel="Veranstaltung"
        topicColor="#5F8575"
        timestamp="vor 3 Std."
        href="https://bsky.app/profile/gruene-berlin"
        showCharCount={false}
      />
    </div>
  );
}
