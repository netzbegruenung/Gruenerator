/**
 * The audio rule both compute cards label themselves from.
 *
 * It lives in its own module because web and native render the same payload
 * from two different files: while the regex was private to web's card, native
 * went on calling a finished recording a calculation.
 */
import { describe, expect, it } from 'vitest';

import { audioAssetsOf } from './computeAssets';

const asset = (name: string) => ({ name, url: `/api/share/tok/${name}` });

describe('audioAssetsOf', () => {
  it('picks recordings out of mixed assets, in payload order', () => {
    const audio = audioAssetsOf([asset('bericht.pdf'), asset('ansage.mp3'), asset('ansage.wav')]);

    expect(audio.map((f) => f.name)).toEqual(['ansage.mp3', 'ansage.wav']);
  });

  it('ignores the case of the extension', () => {
    expect(audioAssetsOf([asset('ANSAGE.MP3')])).toHaveLength(1);
  });

  it('matches the extension, not the name', () => {
    // A CSV about mp3 files is not a recording.
    expect(audioAssetsOf([asset('mp3-statistik.csv'), asset('wav.txt')])).toEqual([]);
  });

  it('treats a payload without file assets as having no audio', () => {
    expect(audioAssetsOf(undefined)).toEqual([]);
    expect(audioAssetsOf([])).toEqual([]);
  });
});
