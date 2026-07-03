/**
 * A run_python result that "succeeded" but is semantically broken: nan/empty
 * values from a wrong column or missing dropna (beta: "Produkt mit höchstem
 * Gewinn: nan"). Rules learned from real data:
 * - figures/files ARE results — an empty text entry alongside them is fine
 *   (export-only runs where the model skipped the print).
 * - Isolated NaN among real values is NORMAL spreadsheet data (missing
 *   entries) — only at least half nan-ish values indicate broken code. The
 *   beta case (nan product + one number) is 1 of 2 and still triggers.
 *
 * Pure and dependency-free so the resume regression tests stay lightweight.
 */
export function hasBrokenComputeValues(payload: {
  entries: Array<{ value: string }>;
  figures?: string[] | undefined;
  files?: Array<{ name: string; b64: string }> | undefined;
  figureUrls?: string[] | undefined;
  fileAssets?: Array<{ name: string; url: string }> | undefined;
}): boolean {
  if (
    payload.figures?.length ||
    payload.files?.length ||
    payload.figureUrls?.length ||
    payload.fileAssets?.length
  ) {
    return false;
  }
  const values = payload.entries.map((e) => e.value.trim());
  if (values.length === 0) return true;
  const NANISH = /^(nan|nat|none|null)$/i;
  const broken = values.filter((v) => v === '' || NANISH.test(v)).length;
  return broken * 2 >= values.length;
}
