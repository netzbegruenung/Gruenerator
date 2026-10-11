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

/** Where a saved Profilbild reopens with its editor state. */
export function profilbildReopenPath(shareToken: string): string {
  return `/studio/profilbild?share=${encodeURIComponent(shareToken)}`;
}
