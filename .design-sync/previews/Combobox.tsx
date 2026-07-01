import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@gruenerator/ui';

// Overlay component (Base UI): render in the open state so the card shows the
// filterable popup list. `items` feeds the list; `open` keeps the popup up so the
// single-mode card captures the surface.
const themen = [
  'Klimaschutz',
  'Verkehrswende',
  'Bezahlbares Wohnen',
  'Energiepreise',
  'Bürgergeld',
  'Artenschutz',
];

export function ThemaSuchen() {
  return (
    <Combobox open items={themen} defaultValue="Klimaschutz">
      <ComboboxInput placeholder="Thema suchen…" style={{ width: 260 }} />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>Kein Thema gefunden</ComboboxEmpty>
          <ComboboxGroup>
            <ComboboxLabel>Schwerpunktthemen</ComboboxLabel>
            {themen.map((thema) => (
              <ComboboxItem key={thema} value={thema}>
                {thema}
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
