import { UserManagerService } from '@univerjs/core';
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/preset-sheets-conditional-formatting';
import UniverPresetSheetsConditionalFormattingDeDE from '@univerjs/preset-sheets-conditional-formatting/locales/de-DE';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreDeDE from '@univerjs/preset-sheets-core/locales/de-DE';
import { UniverSheetsDataValidationPreset } from '@univerjs/preset-sheets-data-validation';
import UniverPresetSheetsDataValidationDeDE from '@univerjs/preset-sheets-data-validation/locales/de-DE';
import { UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing';
import UniverPresetSheetsDrawingDeDE from '@univerjs/preset-sheets-drawing/locales/de-DE';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import UniverPresetSheetsFilterDeDE from '@univerjs/preset-sheets-filter/locales/de-DE';
import { UniverSheetsFindReplacePreset } from '@univerjs/preset-sheets-find-replace';
import UniverPresetSheetsFindReplaceDeDE from '@univerjs/preset-sheets-find-replace/locales/de-DE';
import { UniverSheetsHyperLinkPreset } from '@univerjs/preset-sheets-hyper-link';
import UniverPresetSheetsHyperLinkDeDE from '@univerjs/preset-sheets-hyper-link/locales/de-DE';
import { UniverSheetsNotePreset } from '@univerjs/preset-sheets-note';
import UniverPresetSheetsNoteDeDE from '@univerjs/preset-sheets-note/locales/de-DE';
import { UniverSheetsSortPreset } from '@univerjs/preset-sheets-sort';
import UniverPresetSheetsSortDeDE from '@univerjs/preset-sheets-sort/locales/de-DE';
import { UniverSheetsTablePreset } from '@univerjs/preset-sheets-table';
import UniverPresetSheetsTableDeDE from '@univerjs/preset-sheets-table/locales/de-DE';
import { UniverSheetsThreadCommentPreset } from '@univerjs/preset-sheets-thread-comment';
import UniverPresetSheetsThreadCommentDeDE from '@univerjs/preset-sheets-thread-comment/locales/de-DE';
import { createUniver, defaultTheme, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCrosshairHighlightPlugin } from '@univerjs/sheets-crosshair-highlight';
import '@univerjs/sheets-crosshair-highlight/facade';
import UniverSheetsCrosshairHighlightDeDE from '@univerjs/sheets-crosshair-highlight/locale/de-DE';
import { UniverSheetsZenEditorPlugin } from '@univerjs/sheets-zen-editor';
import '@univerjs/sheets-zen-editor/facade';
import UniverSheetsZenEditorDeDE from '@univerjs/sheets-zen-editor/locale/de-DE';

import type { FUniver, Univer } from '@univerjs/presets';

/** Univer's current-user shape (drives comment/note authorship). */
export interface SheetCurrentUser {
  userID: string;
  name: string;
  avatar?: string;
}

export interface CreateUniverInstanceOptions {
  container: HTMLElement;
  darkMode?: boolean;
  /** Logged-in user; attributes thread comments instead of "Unknown". */
  currentUser?: SheetCurrentUser | null;
}

/**
 * Creates a Univer sheets instance with our chrome decisions baked in: no
 * Univer header/toolbar (our EditorTopBar owns the top; feature entry points
 * live in the native right-click context menu, keyboard shortcuts, and the
 * compact `SheetFormatMenu` in the top bar), formula bar and sheet tabs kept,
 * footer menus hidden. No formula web worker in V1 — the main-thread engine is
 * fine for the sheet sizes we expect (see `sheets-no-worker` upstream example).
 *
 * All free sheet presets are registered here. Their per-unit state (filters,
 * conditional formats, data validation, tables, comments, notes, hyperlinks)
 * persists via `workbook.save()` resources and live-syncs as unit-scoped
 * MUTATION commands through the Yjs collab bridge — no bridge changes needed.
 * Crosshair-highlight and the zen editor have no preset, so they are registered
 * as plain plugins after `createUniver`.
 */
export function createUniverInstance({
  container,
  darkMode,
  currentUser,
}: CreateUniverInstanceOptions): {
  univer: Univer;
  univerAPI: FUniver;
  /** Update the comment/note author after creation (e.g. once auth resolves). */
  setCurrentUser: (user: SheetCurrentUser) => void;
} {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.DE_DE,
    locales: {
      [LocaleType.DE_DE]: mergeLocales(
        UniverPresetSheetsCoreDeDE,
        UniverPresetSheetsDrawingDeDE,
        UniverPresetSheetsFilterDeDE,
        UniverPresetSheetsSortDeDE,
        UniverPresetSheetsDataValidationDeDE,
        UniverPresetSheetsConditionalFormattingDeDE,
        UniverPresetSheetsHyperLinkDeDE,
        UniverPresetSheetsFindReplaceDeDE,
        UniverPresetSheetsThreadCommentDeDE,
        UniverPresetSheetsNoteDeDE,
        UniverPresetSheetsTableDeDE,
        UniverSheetsCrosshairHighlightDeDE,
        UniverSheetsZenEditorDeDE
      ),
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
      // Float DOM support (embedded React charts anchored to a range). Univer's
      // native charts are Pro-only; we render Recharts into a float DOM instead.
      UniverSheetsDrawingPreset(),
      UniverSheetsFilterPreset(),
      UniverSheetsSortPreset(),
      UniverSheetsDataValidationPreset(),
      UniverSheetsConditionalFormattingPreset(),
      UniverSheetsHyperLinkPreset(),
      UniverSheetsFindReplacePreset(),
      UniverSheetsThreadCommentPreset(),
      UniverSheetsNotePreset(),
      UniverSheetsTablePreset(),
    ],
  });

  // No preset ships these two; register as plain plugins. Safe here because the
  // workbook is created later by the collab bridge, not during createUniver.
  univer.registerPlugin(UniverSheetsCrosshairHighlightPlugin);
  univer.registerPlugin(UniverSheetsZenEditorPlugin);

  // Attribute thread comments/notes to the real user. The Facade exposes only
  // getCurrentUser(), so set it through the injected service. Exposed as a
  // setter too, so the caller can re-apply it once auth resolves post-mount.
  const setCurrentUser = (user: SheetCurrentUser) =>
    univer.__getInjector().get(UserManagerService).setCurrentUser(user);
  if (currentUser) setCurrentUser(currentUser);

  return { univer, univerAPI, setCurrentUser };
}
