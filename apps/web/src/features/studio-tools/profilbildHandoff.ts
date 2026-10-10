export const PROFILBILD_HANDOFF_STATE = { profilbildHandoff: true } as const;

let slot: string | null = null;

export function setProfilbildHandoff(cutoutDataUrl: string) {
  slot = cutoutDataUrl;
}

export function takeProfilbildHandoff(): string | null {
  const url = slot;
  slot = null;
  return url;
}

export function hasProfilbildHandoffMarker(state: unknown): boolean {
  return (state as { profilbildHandoff?: unknown } | null)?.profilbildHandoff === true;
}
