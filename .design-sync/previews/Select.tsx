import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@gruenerator/ui';

// Overlay component: render in the open state so the card shows the popup list.
// cfg pins Select to cardMode:single + viewport so the portalled content renders
// inside the card.
export function KanalAuswahl() {
  return (
    <Select defaultOpen defaultValue="instagram">
      <SelectTrigger style={{ width: 240 }}>
        <SelectValue placeholder="Kanal wählen" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Soziale Netzwerke</SelectLabel>
          <SelectItem value="instagram">Instagram</SelectItem>
          <SelectItem value="mastodon">Mastodon</SelectItem>
          <SelectItem value="bluesky">Bluesky</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Direkt</SelectLabel>
          <SelectItem value="newsletter">Newsletter</SelectItem>
          <SelectItem value="presseverteiler">Presseverteiler</SelectItem>
          <SelectItem value="website" disabled>
            Website (kein Zugriff)
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
