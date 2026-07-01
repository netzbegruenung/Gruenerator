import { IconButton, IconButtonRow } from '@gruenerator/ui';

// Icons size via the parent span's font-size, so use 1em dimensions.
const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
);
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
);
const DeleteIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);
const NewsletterIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
);

// A row of icon buttons — the typical action set on a content card.
export function ActionRow() {
  return (
    <IconButtonRow>
      <IconButton icon={<EditIcon />} label="Bearbeiten" />
      <IconButton icon={<ShareIcon />} label="Teilen" />
      <IconButton icon={<NewsletterIcon />} label="Newsletter" />
      <IconButton icon={<DeleteIcon />} label="Löschen" />
    </IconButtonRow>
  );
}

// The size axis — sm / default / lg circles.
export function Sizes() {
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
      <IconButton size="sm" icon={<EditIcon />} label="Antrag" />
      <IconButton size="default" icon={<ShareIcon />} label="Kampagne" />
      <IconButton size="lg" icon={<NewsletterIcon />} label="Newsletter" />
    </div>
  );
}
