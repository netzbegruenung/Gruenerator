import {
  ListCard,
  ListCardIcon,
  ListCardContent,
  ListCardTitle,
  ListCardDescription,
  ListCardMeta,
  ListCardActions,
  Badge,
  Button,
} from '@gruenerator/ui';

const Newspaper = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
    <path d="M18 14h-8M15 18h-5M10 6h8v4h-8Z" />
  </svg>
);
const Dots = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
  </svg>
);

// The canonical list row-card: leading icon, title with a status badge, a
// description, and a meta line. Composes every sub-part in one cell.
export function BriefingAgent() {
  return (
    <ListCard interactive={false} style={{ maxWidth: 520 }}>
      <ListCardIcon>
        <Newspaper />
      </ListCardIcon>
      <ListCardContent>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListCardTitle>INSM Lobby-Monitor</ListCardTitle>
          <Badge variant="default">Aktiv</Badge>
        </div>
        <ListCardDescription>
          Wöchentliche kritische Analyse der INSM-Veröffentlichungen mit Vergleich zu grünen Positionen.
        </ListCardDescription>
        <ListCardMeta>
          <span>Wöchentlich</span>
          <span>·</span>
          <span>3 Quellen</span>
        </ListCardMeta>
      </ListCardContent>
    </ListCard>
  );
}

// Row with a pinned actions slot (icon button) and an inactive-state badge.
export function MitActionen() {
  return (
    <ListCard interactive={false} style={{ maxWidth: 520 }}>
      <ListCardIcon>
        <Newspaper />
      </ListCardIcon>
      <ListCardContent>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListCardTitle>Grüne Pressespiegel — Top 10 Zeitungen</ListCardTitle>
          <Badge variant="outline">Inaktiv</Badge>
        </div>
        <ListCardDescription>
          Tägliche Zusammenfassung aller Artikel über Die Grünen in den zehn größten deutschen Zeitungen.
        </ListCardDescription>
        <ListCardMeta>
          <span>Täglich · 20:00 Uhr</span>
          <span>·</span>
          <span>RSS-Feed</span>
        </ListCardMeta>
      </ListCardContent>
      <ListCardActions style={{ opacity: 1 }}>
        <Button variant="ghost" size="icon-sm" aria-label="Aktionen"><Dots /></Button>
      </ListCardActions>
    </ListCard>
  );
}
