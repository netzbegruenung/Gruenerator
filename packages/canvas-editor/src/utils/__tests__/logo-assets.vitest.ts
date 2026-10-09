import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { buildAssetCapability, filterAssetOptionsForLocale } from '../../ai/assetCapability';
import { LOGO_ASSETS, hasDarkPreview, sortLogoAssets } from '../canvasAssets';

const PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../apps/web/public'
);

const DE_WORDMARKS = ['gruene-de-logo', 'gruene-de-logo-weiss', 'gruene-de-logo-schwarz'];

describe('Logos im Elemente-Katalog', () => {
  it('zeigt deutschen Nutzer*innen die Wortmarke und die Sonnenblumen', () => {
    const ids = sortLogoAssets([], 'de-DE').map((a) => a.id);
    expect(ids).toEqual([
      ...DE_WORDMARKS,
      'sunflower',
      'sunflower-green',
      'sunflower-weiss',
      'sunflower-schwarz',
    ]);
  });

  it('zeigt österreichischen Nutzer*innen nur das AT-Logo', () => {
    const ids = sortLogoAssets([], 'de-AT').map((a) => a.id);
    expect(ids).toEqual(['gruene-at-logo-weiss', 'gruene-at-logo-gruen']);
  });

  it('legt helle Logos auf eine dunkle Kachel', () => {
    const dark = LOGO_ASSETS.filter(hasDarkPreview).map((a) => a.id);
    expect(dark).toEqual([
      'gruene-de-logo',
      'gruene-de-logo-weiss',
      'sunflower-weiss',
      'gruene-at-logo-weiss',
    ]);
  });

  it.each(LOGO_ASSETS.map((a) => [a.id, a.src] as const))(
    '%s liegt unter apps/web/public',
    (_id, src) => {
      expect(existsSync(path.join(PUBLIC_DIR, src)), `${src} fehlt`).toBe(true);
    }
  );
});

describe('Asset-Optionen für die KI', () => {
  const options = buildAssetCapability('freeform');
  const ids = (locale: 'de-DE' | 'de-AT') =>
    filterAssetOptionsForLocale(options, locale).map((o) => o.id);

  it('bietet deutschen Nutzer*innen keine AT-Logos an', () => {
    expect(ids('de-DE')).toEqual(expect.arrayContaining([...DE_WORDMARKS, 'sunflower']));
    expect(ids('de-DE').some((id) => id.startsWith('gruene-at-'))).toBe(false);
  });

  it('bietet österreichischen Nutzer*innen keine DE-Logos und Sonnenblumen an', () => {
    expect(ids('de-AT')).toEqual(
      expect.arrayContaining(['gruene-at-logo-weiss', 'gruene-at-logo-gruen'])
    );
    expect(
      ids('de-AT').some((id) => id.startsWith('gruene-de-') || id.startsWith('sunflower'))
    ).toBe(false);
  });

  it('behält sprachunabhängige Assets für beide', () => {
    expect(ids('de-DE')).toEqual(expect.arrayContaining(['quote-mark', 'arrow']));
    expect(ids('de-AT')).toEqual(expect.arrayContaining(['quote-mark', 'arrow']));
  });
});
