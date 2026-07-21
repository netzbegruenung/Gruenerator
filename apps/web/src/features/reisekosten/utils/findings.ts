/** Maps a finding's dot-path to the wizard step that owns it. */
export function stepForField(field: string): number {
  if (field.startsWith('stammdaten.')) return 1;
  if (field.startsWith('fahrt.')) return 2;
  if (field.startsWith('uebernachtung') || field.startsWith('verpflegung')) return 3;
  return 0; // reise.* and anything else
}
