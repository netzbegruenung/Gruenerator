import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@gruenerator/ui';

const Pencil = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const Share = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
  </svg>
);
const Trash = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);

// Overlay: render open so the card shows the menu surface. cfg pins single-mode
// + viewport so the portalled content renders inside the card.
export function BeitragAktionen() {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>Aktionen</DropdownMenuTrigger>
      <DropdownMenuContent style={{ width: 240 }}>
        <DropdownMenuLabel>Pressemitteilung</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Pencil />
            Bearbeiten
            <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Share />
            Teilen
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Veröffentlichen auf</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Website</DropdownMenuItem>
              <DropdownMenuItem>Newsletter</DropdownMenuItem>
              <DropdownMenuItem>Mastodon</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Entwurf automatisch speichern</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Sichtbarkeit</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="team">
          <DropdownMenuRadioItem value="privat">Nur ich</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="team">Kreisverband</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash />
          Löschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
