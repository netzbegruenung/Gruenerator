import type { BelegTyp, ExtractBelegResponse } from '@gruenerator/contracts';

/** Most recently extracted receipt of a given type, or null. */
export function latestBeleg(
  belege: ExtractBelegResponse[],
  type: BelegTyp
): ExtractBelegResponse | null {
  for (let i = belege.length - 1; i >= 0; i -= 1) if (belege[i].type === type) return belege[i];
  return null;
}
