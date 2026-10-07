import { CARRIED_INSTANCE_KEYS } from '../configs/factory/carryInstanceState';

/**
 * Die Zustandsschlüssel, die eine Seite selbst nach außen tragen muss.
 *
 * Textfelder einer Vorlage erreichen `pages[i].state` über ihr `on<Key>Change`
 * beim Host (siehe `wrapCallbacksWithPageSync`). Freie Elemente tun das nicht:
 * `createActions` ändert sie ausschließlich über `setState` im
 * Komponentenzustand, kein Host erklärt je einen Callback dafür. Bis #3416 gab
 * es deshalb keinen einzigen Pfad aus dem Editor in das Dokument — die Elemente
 * standen auf der Fläche und waren nach dem Neuladen weg.
 *
 * Die Liste ist bewusst `CARRIED_INSTANCE_KEYS` selbst, nicht eine zweite
 * handgepflegte Aufzählung: `carryInstanceState` ist die Stelle, die beim
 * Wiederaufbau (`createInitialState`) genau diese Sammlungen zurückliest. Was
 * hier stünde und dort fehlte, wäre ein toter Schreibvorgang; umgekehrt ein
 * stiller Datenverlust. Genau so war es bis #3420 für `layerOrder`, das hier
 * von Hand angehängt war und das nur zwei Vorlagen zurücklasen.
 */
export const PAGE_ELEMENT_STATE_KEYS = CARRIED_INSTANCE_KEYS;

/**
 * Scalar style fields the template actions change only via `setState` (the
 * AI's set-background-color / set-color-scheme / set-font-size /
 * toggle-sunflower appliers and their manual counterparts). Each one is read
 * back by its template's `createInitialState`; without a writer here a kept
 * edit was gone after reload.
 */
const PAGE_STYLE_STATE_KEYS = [
  'backgroundColor',
  'colorSchemeId',
  'colorScheme',
  'fontSize',
  'customPrimaryFontSize',
  'customSecondaryFontSize',
  'customLabelFontSize',
  'customHeadlineFontSize',
  'customSubtextFontSize',
  'customSubtext2FontSize',
  'customEventTitleFontSize',
  'customBeschreibungFontSize',
  'sunflowerVisible',
] as const;

/** Everything a page writes into `pages[i].state` itself. */
export const PAGE_PERSISTED_STATE_KEYS = [...PAGE_ELEMENT_STATE_KEYS, ...PAGE_STYLE_STATE_KEYS];

// Background-image state keys that must be synced back to the host (and thus
// persisted to the collaborative document) when changed in-editor. Each maps to
// an `on<Key>Change` callback wired per canvas type in CanvasEditorRouter.
const SYNCED_IMAGE_KEYS = [
  'currentImageSrc',
  'backgroundMode',
  'imageAttribution',
  'imageOffset',
  'imageScale',
  'backgroundImageOpacity',
  'hasBackgroundImage',
] as const;

/**
 * Everything a mounted page pushes back out itself (useEmitHostStateChanges)
 * — also after it rebuilt a received state, which is the canvas echo a deck
 * undo must see through. The image keys ride on the host callbacks
 * CanvasEditorRouter wires per canvas type; the element keys have no host
 * callback anywhere and are served by the writers CanvasEditor mints in
 * createPageSyncedCallbacks.
 */
export const HOST_EMITTED_STATE_KEYS = [...SYNCED_IMAGE_KEYS, ...PAGE_PERSISTED_STATE_KEYS];
