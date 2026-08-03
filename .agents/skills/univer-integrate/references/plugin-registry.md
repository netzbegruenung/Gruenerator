# Official Plugin Registry

Univer adopts a plugin-based architecture. Plugins must be registered in the correct order during integration.

## Core Layer (Must Register First)

| Plugin | Package | Description | Required |
|--------|---------|-------------|----------|
| Univer | `@univerjs/core` | Core instance, created via `new Univer(config)` | ✓ |
| UniverRenderEnginePlugin | `@univerjs/engine-render` | Rendering engine | ✓ (browser UI only) |
| UniverFormulaEnginePlugin | `@univerjs/engine-formula` | Formula engine | ✓ (Sheets) |
| UniverRPCMainThreadPlugin | `@univerjs/rpc` | Web Worker RPC (Browser) | Recommended |
| UniverRPCNodeMainPlugin | `@univerjs/rpc-node` | Node.js RPC | Node side |

> **Headless / Node.js**: Omit `UniverRenderEnginePlugin` and all `*UIPlugin`s.
> Formula engine is still required for Sheets. See Node.js template in `assets/templates/node/`.

### Base CSS / Theme Packages (Browser only)

These packages have no plugin registration step, but are required for browser UI:

| Package | Description |
|---------|-------------|
| `@univerjs/design` | Base CSS tokens and component styles. Import `lib/index.css` in bundler projects. |
| `@univerjs/themes` | Default light/dark theme objects. Pass `theme: defaultTheme` to `new Univer()`. |

> **Headless / Node.js**: Omit `UniverRenderEnginePlugin` and all `*UIPlugin`s.
> Formula engine is still required for Sheets. See Node.js template in `assets/templates/node/`.

## Sheets Feature Layer

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverSheetsPlugin | `@univerjs/sheets` | Spreadsheet core |
| UniverSheetsUIPlugin | `@univerjs/sheets-ui` | Spreadsheet UI |
| UniverSheetsFormulaPlugin | `@univerjs/sheets-formula` | Formula calculation |
| UniverSheetsFormulaUIPlugin | `@univerjs/sheets-formula-ui` | Formula editor UI |
| UniverSheetsNumfmtPlugin | `@univerjs/sheets-numfmt` | Number format |
| UniverSheetsNumfmtUIPlugin | `@univerjs/sheets-numfmt-ui` | Number format UI |
| UniverSheetsDataValidationPlugin | `@univerjs/sheets-data-validation` | Data validation |
| UniverSheetsDataValidationUIPlugin | `@univerjs/sheets-data-validation-ui` | Data validation UI |
| UniverSheetsConditionalFormattingPlugin | `@univerjs/sheets-conditional-formatting` | Conditional formatting |
| UniverSheetsConditionalFormattingUIPlugin | `@univerjs/sheets-conditional-formatting-ui` | Conditional formatting UI |
| UniverSheetsFilterPlugin | `@univerjs/sheets-filter` | Filter |
| UniverSheetsFilterUIPlugin | `@univerjs/sheets-filter-ui` | Filter UI |
| UniverSheetsSortPlugin | `@univerjs/sheets-sort` | Sort |
| UniverSheetsSortUIPlugin | `@univerjs/sheets-sort-ui` | Sort UI |
| UniverSheetsHyperLinkPlugin | `@univerjs/sheets-hyper-link` | Hyperlink |
| UniverSheetsHyperLinkUIPlugin | `@univerjs/sheets-hyper-link-ui` | Hyperlink UI |
| UniverSheetsDrawingPlugin | `@univerjs/sheets-drawing` | Floating images / Drawing |
| UniverSheetsDrawingUIPlugin | `@univerjs/sheets-drawing-ui` | Drawing UI |
| UniverSheetsThreadCommentPlugin | `@univerjs/sheets-thread-comment` | Thread comment |
| UniverSheetsThreadCommentUIPlugin | `@univerjs/sheets-thread-comment-ui` | Thread comment UI |
| UniverSheetsTablePlugin | `@univerjs/sheets-table` | Table |
| UniverSheetsTableUIPlugin | `@univerjs/sheets-table-ui` | Table UI |
| UniverSheetsNotePlugin | `@univerjs/sheets-note` | Note |
| UniverSheetsNoteUIPlugin | `@univerjs/sheets-note-ui` | Note UI |
| UniverSheetsFindReplacePlugin | `@univerjs/sheets-find-replace` | Find & Replace |
| UniverSheetsZenEditorPlugin | `@univerjs/sheets-zen-editor` | Zen editor |
| UniverSheetsCrosshairHighlightPlugin | `@univerjs/sheets-crosshair-highlight` | Crosshair highlight |

## Docs Feature Layer

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverDocsPlugin | `@univerjs/docs` | Document core |
| UniverDocsUIPlugin | `@univerjs/docs-ui` | Document UI |
| UniverDocsDrawingPlugin | `@univerjs/docs-drawing` | Document drawing |
| UniverDocsDrawingUIPlugin | `@univerjs/docs-drawing-ui` | Document drawing UI |
| UniverDocsHyperLinkPlugin | `@univerjs/docs-hyper-link` | Document hyperlink |
| UniverDocsHyperLinkUIPlugin | `@univerjs/docs-hyper-link-ui` | Document hyperlink UI |
| UniverDocsMentionUIPlugin | `@univerjs/docs-mention-ui` | Mention UI |
| UniverDocsQuickInsertUIPlugin | `@univerjs/docs-quick-insert-ui` | Quick insert UI |
| UniverDocsThreadCommentUIPlugin | `@univerjs/docs-thread-comment-ui` | Document thread comment UI |

## Slides Feature Layer

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverSlidesPlugin | `@univerjs/slides` | Slide core |
| UniverSlidesUIPlugin | `@univerjs/slides-ui` | Slide UI |

## UI Infrastructure Layer

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverUIPlugin | `@univerjs/ui` | UI framework infrastructure |
| UniverVue3AdapterPlugin | `@univerjs/ui-adapter-vue3` | Vue 3 adapter |
| UniverWebComponentAdapterPlugin | `@univerjs/ui-adapter-web-component` | Web Component adapter |

## Universal Service Layer

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverNetworkPlugin | `@univerjs/network` | Network layer |
| UniverThreadCommentPlugin | `@univerjs/thread-comment` | Thread comment base service |
| UniverThreadCommentUIPlugin | `@univerjs/thread-comment-ui` | Thread comment UI base |
| UniverDrawingPlugin | `@univerjs/drawing` | Drawing base service |
| UniverDrawingUIPlugin | `@univerjs/drawing-ui` | Drawing UI base |
| UniverDataValidationPlugin | `@univerjs/data-validation` | Data validation base |
| UniverActionRecorderPlugin | `@univerjs/action-recorder` | Action recorder |
| UniverWatermarkPlugin | `@univerjs/watermark` | Watermark |
| UniverFindReplacePlugin | `@univerjs/find-replace` | Find & replace base service |

## Infrastructure / Protocol

| Package | Description |
|---------|-------------|
| `@univerjs/protocol` | Collaboration protocol definitions |
| `@univerjs/rpc` | Browser-side RPC (Web Worker) |
| `@univerjs/rpc-node` | Node.js RPC (Worker thread) |

## Recommended Registration Order

### Browser (with UI)

```ts
univer.registerPlugins([
  // 1. Base engines
  [UniverRenderEnginePlugin],
  [UniverFormulaEnginePlugin],
  [UniverRPCMainThreadPlugin, { workerURL: worker }], // Browser

  // 2. UI infrastructure
  [UniverUIPlugin, { container: 'app' }],
  [UniverVue3AdapterPlugin], // or WebComponent

  // 3. Doc/Sheet/Slide core
  // Note: unit cores may be registered before the render engine;
  // Univer wires them up lazily. UI plugins, however, MUST come after engines.
  [UniverDocsPlugin],
  [UniverDocsUIPlugin],
  [UniverSheetsPlugin, { notExecuteFormula: true }],
  [UniverSheetsUIPlugin],

  // 4. Feature plugins (can be lazily loaded on demand)
  [UniverSheetsFormulaPlugin],
  [UniverSheetsNumfmtPlugin],
  [UniverSheetsDataValidationPlugin],
  [UniverSheetsConditionalFormattingPlugin],
  [UniverSheetsFilterPlugin],
  [UniverSheetsHyperLinkPlugin],
  [UniverSheetsThreadCommentPlugin],
  [UniverSheetsTablePlugin],
  [UniverSheetsDrawingPlugin],
  [UniverSheetsNotePlugin],
  [UniverNetworkPlugin],
]);
```

### Node.js (headless, no UI)

```ts
// No render engine, no UI plugins, no CSS imports.
univer.registerPlugins([
  [UniverFormulaEnginePlugin],
  [UniverSheetsPlugin],
  [UniverSheetsFormulaPlugin],
  // Add non-UI feature plugins as needed:
  // [UniverSheetsDataValidationPlugin],
  // [UniverSheetsFilterPlugin],
  // [UniverSheetsSortPlugin],
]);
```

## Lazy Loading Strategy

UI-heavy plugins can be deferred to optimize first paint:

```ts
setTimeout(() => {
  import('./lazy-plugins').then((m) => {
    univer.registerPlugins(m.default());
  });
}, 50);
```

Typical lazy-loaded plugins: all `*UIPlugin` (except core `UniverSheetsUIPlugin` and `UniverDocsUIPlugin`).
