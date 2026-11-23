export const VERTONEN_MODES = ['text-zu-audio', 'audio-zu-text'] as const;
export type VertonenMode = (typeof VERTONEN_MODES)[number];
export const DEFAULT_VERTONEN_MODE: VertonenMode = 'text-zu-audio';

export function parseVertonenMode(value: string | null): VertonenMode {
  return VERTONEN_MODES.find((m) => m === value) ?? DEFAULT_VERTONEN_MODE;
}
