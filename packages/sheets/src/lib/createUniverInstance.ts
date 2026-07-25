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
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCrosshairHighlightPlugin } from '@univerjs/sheets-crosshair-highlight';
import '@univerjs/sheets-crosshair-highlight/facade';
import UniverSheetsCrosshairHighlightDeDE from '@univerjs/sheets-crosshair-highlight/locale/de-DE';
import { UniverSheetsZenEditorPlugin } from '@univerjs/sheets-zen-editor';
import '@univerjs/sheets-zen-editor/facade';
import UniverSheetsZenEditorDeDE from '@univerjs/sheets-zen-editor/locale/de-DE';

import { gruenatorUniverTheme } from './univerTheme.js';

import type { FUniver, Univer } from '@univerjs/presets';

/**
 * Below this viewport width the footer is trimmed to the sheet tabs. Matches
 * the `useIsBreakpoint()` default (768) used elsewhere in the monorepo;
 * inlined as a `matchMedia` query because `@gruenerator/sheets` does not depend
 * on `@gruenerator/shared` and a single boolean does not justify adding it.
 */
const NARROW_VIEWPORT_QUERY = '(max-width: 767px)';

/**
 * Hide Univer's "Bereich/Blatt schützen" menu entries (context menu + sheet-bar
 * + toolbar). In our setup range/sheet protection is a landmine: the built-in
 * AuthzIoLocalService recognises the owner only by a userID string-prefix
 * (isDevRole), so a real user can never be re-granted style permission once a
 * range is protected — it locks background/CF/table edits for EVERYONE forever
 * (the "Der Bereich ist geschützt" error). We have no real owner/collaborator
 * authorization model, so the feature can never work correctly here; remove its
 * entry points. Keyed by the menu item id (= the command id each entry triggers).
 */
const HIDDEN_PROTECTION_MENU: Record<string, { hidden: boolean }> = Object.fromEntries(
  [
    'sheet.command.add-range-protection-from-context-menu',
    'sheet.command.set-range-protection-from-context-menu',
    'sheet.command.delete-range-protection-from-context-menu',
    'sheet.command.view-sheet-permission-from-context-menu',
    'sheet.command.add-range-protection-from-toolbar',
    'sheet.command.add-range-protection-from-sheet-bar',
    'sheet.command.change-sheet-protection-from-sheet-bar',
    'sheet.command.delete-worksheet-protection-from-sheet-bar',
    'sheet.command.view-sheet-permission-from-sheet-bar',
  ].map((id) => [id, { hidden: true }])
);

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
 * Creates a Univer sheets instance with our chrome decisions baked in: Univer's
 * native collapsed ribbon owns formatting, our `EditorTopBar` owns identity
 * (title, back, sharing, collaborators, chat); formula bar and sheet tabs kept,
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
  // Evaluated ONCE, at construction. Univer reads `footer` from the plugin
  // config when the container mounts and the instance then outlives every
  // resize — re-creating it on a breakpoint change would tear down the workbook
  // and the Yjs collab binding, i.e. drop the user's editing state mid-session.
  // A live switch would mean writing SHEETS_UI_PLUGIN_CONFIG_KEY through
  // `univer.__getInjector().get(IConfigService)`; that key is not part of any
  // public type export and `@univerjs/sheets-ui` is not a declared dependency
  // here, so it is deliberately not done. Consequence: rotating a phone or
  // resizing a desktop window across 768px keeps the footer it booted with
  // until the document is reopened — usable either way, only denser/sparser.
  const isNarrowViewport =
    typeof window !== 'undefined' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches;

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
    theme: gruenatorUniverTheme,
    darkMode,
    presets: [
      UniverSheetsCorePreset({
        container,
        // Univer's ribbon is the only entry point to cell formatting (bold,
        // colours, number formats, borders, alignment, merge). With it off those
        // were reachable through keyboard shortcuts and the right-click menu
        // only — i.e. not at all on a phone. `header` and `toolbar` must BOTH be
        // true: the ribbon does not render otherwise, and in sheets the header
        // slot is simply where the formula bar lives — Univer contributes no
        // filename or menu bar of its own, so nothing competes with our title.
        header: true,
        toolbar: true,
        // 'collapsed' is the single 40px row (tabs behind a dropdown); 'classic'
        // would stack another 36px tab strip on top, which we cannot afford
        // next to our own top bar on a phone.
        ribbonType: 'collapsed',
        menu: HIDDEN_PROTECTION_MENU,
        formulaBar: true,
        // On a phone the 36px footer competes with our top bar, the ribbon and
        // the formula bar for the little height there is. The sheet tabs are
        // the only part without an alternative, so they always stay; the zoom
        // slider is redundant next to native pinch-zoom and the statistics bar
        // (sum/average of the selection) is a desktop convenience.
        footer: {
          sheetBar: true,
          statisticBar: !isNarrowViewport,
          menus: false,
          zoomSlider: !isNarrowViewport,
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
  //
  // Grant the logged-in user OWNER rights: Univer's built-in AuthzIoLocalService
  // recognises "owner"/"editor" ONLY by whether the userID string starts with
  // "Owner"/"Editor" (isDevRole prefix match) — real user ids never match. So the
  // moment ANY range/sheet protection exists in a doc (e.g. via the native
  // right-click "Bereich/Blatt schützen" menu), STYLE edits (background,
  // conditional formatting, tables) are denied to EVERYONE forever — incl. the AI
  // and even the person who protected it ("Der Bereich ist geschützt …"). This app
  // has no real owner/collaborator authorization model — the logged-in user owns
  // their own sheet — so we prefix the userID to satisfy isDevRole. The display
  // `name` is untouched, so comment/note attribution still shows the real person.
  const OWNER_PREFIX = 'Owner_';
  const asOwner = (user: SheetCurrentUser): SheetCurrentUser =>
    user.userID.startsWith(OWNER_PREFIX)
      ? user
      : { ...user, userID: `${OWNER_PREFIX}${user.userID}` };
  const setCurrentUser = (user: SheetCurrentUser) =>
    univer.__getInjector().get(UserManagerService).setCurrentUser(asOwner(user));
  if (currentUser) setCurrentUser(currentUser);

  return { univer, univerAPI, setCurrentUser };
}
