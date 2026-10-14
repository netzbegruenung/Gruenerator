// Canvas autosave stamps a sharepicType on every share it writes (freeform,
// decks …), so only these keys mark a share made by the retired template wizard.
const LEGACY_WIZARD_SHAREPIC_TYPES: ReadonlySet<string> = new Set([
  'dreizeilen',
  'zitat',
  'zitat-pure',
  'info',
  'headline',
  'Dreizeilen',
  'Zitat',
  'Zitat_Pure',
  'Info',
  'Headline',
]);

export function isLegacyWizardShare(sharepicType: string | null | undefined): boolean {
  return sharepicType != null && LEGACY_WIZARD_SHAREPIC_TYPES.has(sharepicType);
}
