/**
 * Which compute file assets are recordings.
 *
 * One definition for both platforms on purpose. The rule started as a private
 * regex inside web's ComputeCard, and native kept calling a finished `vertonen`
 * recording a calculation ("Berechnung: …" / "BERECHNET") because nothing
 * carried the knowledge across — the two cards render the same payload from two
 * files, so anything they must agree on lives here.
 */

const AUDIO_FILE = /\.(mp3|wav)$/i;

export interface ComputeFileAsset {
  name: string;
  url: string;
}

/** The recordings among a compute payload's file assets, in payload order. */
export function audioAssetsOf(
  fileAssets: readonly ComputeFileAsset[] | undefined
): ComputeFileAsset[] {
  return fileAssets?.filter((file) => AUDIO_FILE.test(file.name)) ?? [];
}
