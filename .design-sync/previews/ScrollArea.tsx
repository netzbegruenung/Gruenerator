import { ScrollArea, Separator, Badge } from '@gruenerator/ui';

// A fixed-height scroll area listing recent activity — the ScrollBar is
// composed inside ScrollArea automatically and appears on overflow.
export function ActivityFeed() {
  const items = [
    { titel: 'Antrag „Kommunaler Wärmeplan" eingereicht', zeit: 'vor 5 Min.' },
    { titel: 'Pressemitteilung Klimaschutz veröffentlicht', zeit: 'vor 1 Std.' },
    { titel: 'Newsletter Juni geplant', zeit: 'vor 3 Std.' },
    { titel: 'Veranstaltung „Bürgerdialog" angelegt', zeit: 'gestern' },
    { titel: 'Kampagne Radwege gestartet', zeit: 'gestern' },
    { titel: 'Mitgliederliste aktualisiert', zeit: 'vor 2 Tagen' },
    { titel: 'Antrag „Tempo 30" abgelehnt', zeit: 'vor 3 Tagen' },
    { titel: 'AG Klima Protokoll hochgeladen', zeit: 'letzte Woche' },
  ];
  return (
    <ScrollArea style={{ height: 220, width: 340, borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.7, marginBottom: 8 }}>Aktivität</div>
        {items.map((it, i) => (
          <div key={it.titel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', gap: 12 }}>
              <span style={{ fontSize: 14 }}>{it.titel}</span>
              <span style={{ fontSize: 12, opacity: 0.6, whiteSpace: 'nowrap' }}>{it.zeit}</span>
            </div>
            {i < items.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// A scrollable list of Themen-Tags to pick from.
export function TagList() {
  const tags = ['Klimaschutz', 'Mobilität', 'Bildung', 'Soziales', 'Energie', 'Landwirtschaft', 'Digitalisierung', 'Gesundheit', 'Kultur', 'Wirtschaft'];
  return (
    <ScrollArea style={{ height: 160, width: 260, borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tags.map((t) => (
          <Badge key={t} variant="outline">{t}</Badge>
        ))}
      </div>
    </ScrollArea>
  );
}
