import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreDeDE from '@univerjs/preset-sheets-core/locales/de-DE';
import { createUniver, defaultTheme, LocaleType, mergeLocales } from '@univerjs/presets';

import type { FUniver, Univer } from '@univerjs/presets';

export interface CreateUniverInstanceOptions {
  container: HTMLElement;
  darkMode?: boolean;
}

/**
 * Creates a Univer sheets instance with our chrome decisions baked in: no
 * Univer header/toolbar (our EditorTopBar owns the top; formatting lives in
 * the context menu for V1), formula bar and sheet tabs kept, footer menus
 * hidden. No formula web worker in V1 — the main-thread engine is fine for
 * the sheet sizes we expect (see `sheets-no-worker` upstream example).
 */
export function createUniverInstance({ container, darkMode }: CreateUniverInstanceOptions): {
  univer: Univer;
  univerAPI: FUniver;
} {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.DE_DE,
    locales: {
      [LocaleType.DE_DE]: mergeLocales(UniverPresetSheetsCoreDeDE),
    },
    theme: defaultTheme,
    darkMode,
    presets: [
      UniverSheetsCorePreset({
        container,
        header: false,
        toolbar: false,
        formulaBar: true,
        footer: {
          sheetBar: true,
          statisticBar: true,
          menus: false,
          zoomSlider: true,
        },
      }),
    ],
  });

  return { univer, univerAPI };
}
