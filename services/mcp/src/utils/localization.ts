export type Country = 'DE' | 'AT';

const PARTY_NAMES: Record<
  Country,
  { partyName: string; partyNameGenitive: string; partyNameShort: string }
> = {
  DE: {
    partyName: 'Bündnis 90/Die Grünen',
    partyNameGenitive: 'von Bündnis 90/Die Grünen',
    partyNameShort: 'Die Grünen',
  },
  AT: {
    partyName: 'Die Grünen – Die Grüne Alternative',
    partyNameGenitive: 'von Die Grünen – Die Grüne Alternative',
    partyNameShort: 'Die Grünen',
  },
};

export function localizePlaceholders(text: string, country: Country): string {
  const mappings = PARTY_NAMES[country];
  let result = text;
  for (const [key, value] of Object.entries(mappings)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export function getPartyName(country: Country): string {
  return PARTY_NAMES[country].partyName;
}
