import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  Button,
} from '@gruenerator/ui';

const FileIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);
const Download = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

// A single document row: icon medium + title/description + an action button.
export function DocumentRow() {
  return (
    <div style={{ maxWidth: 460 }}>
      <Item variant="outline">
        <ItemMedia variant="icon">
          <FileIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Wahlprogramm 2026 – Entwurf.pdf</ItemTitle>
          <ItemDescription>Zuletzt bearbeitet vor 2 Stunden · 1,4 MB</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="icon-sm" aria-label="Herunterladen">
            <Download />
          </Button>
        </ItemActions>
      </Item>
    </div>
  );
}

// A grouped list with separators — the variant axis (outline rows in a group).
export function DocumentList() {
  return (
    <div style={{ maxWidth: 460 }}>
      <ItemGroup>
        <Item>
          <ItemMedia variant="icon">
            <FileIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Antrag: Radwegenetz ausbauen</ItemTitle>
            <ItemDescription>Eingereicht für den Kreisparteitag</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm">
              Öffnen
            </Button>
          </ItemActions>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemMedia variant="icon">
            <FileIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Newsletter Juni 2026</ItemTitle>
            <ItemDescription>Geplant für Montag, 09:00 Uhr</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm">
              Öffnen
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>
    </div>
  );
}
