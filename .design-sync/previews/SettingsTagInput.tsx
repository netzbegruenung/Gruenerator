import { SettingsTagInput } from '@gruenerator/ui';

// SettingsTagInput renders a pill trigger ("+ Label (n)") that opens a Popover
// with a text field and the already-entered tags. The open state is internal
// `useState` with no `open`/`defaultOpen` prop, so a static screenshot shows the
// resting trigger pill: active (primary fill) with a count badge when items
// exist, inactive when empty. The tag chips themselves live inside the popover
// and so are not visible statically. Handlers are no-ops.

const row: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
};

// Filled: realistic Themen-Tags entered → active pill with count.
export function MitThemenTags() {
  return (
    <div style={row}>
      <SettingsTagInput
        items={['Klimaschutz', 'Verkehrswende', 'Bezahlbares Wohnen']}
        onChange={() => {}}
        triggerLabel="Themen"
        placeholder="Thema eingeben + Enter…"
      />
    </div>
  );
}

// Empty vs. filled trigger states side by side.
export function ZitatgeberInnen() {
  return (
    <div style={row}>
      <SettingsTagInput
        items={['Dr. Anna Berger', 'Jonas Klein']}
        onChange={() => {}}
        triggerLabel="Wer wird zitiert"
        placeholder="Name der*des Zitatgeber*in…"
      />
      <SettingsTagInput
        items={[]}
        onChange={() => {}}
        triggerLabel="Hashtags"
        placeholder="Hashtag + Enter…"
      />
    </div>
  );
}
