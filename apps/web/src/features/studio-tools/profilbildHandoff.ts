export type ProfilbildHandoffState = { cutoutDataUrl: string };

export function readProfilbildHandoff(state: unknown): ProfilbildHandoffState | null {
  const url = (state as Partial<ProfilbildHandoffState> | null)?.cutoutDataUrl;
  return typeof url === 'string' && url ? { cutoutDataUrl: url } : null;
}
