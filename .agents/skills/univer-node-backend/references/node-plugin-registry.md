# Node.js Plugin Registry

Univer's plugin architecture works identically in Node.js and browsers, but UI-dependent plugins must be excluded in headless environments.

## Core Layer (Always Register)

| Plugin | Package | Node.js Required | Notes |
|--------|---------|------------------|-------|
| Univer | `@univerjs/core` | ✓ | `new Univer(config)` |
| UniverFormulaEnginePlugin | `@univerjs/engine-formula` | ✓ (Sheets) | Use `UniverProFormulaEnginePlugin` for Pro |
| UniverSheetsPlugin | `@univerjs/sheets` | ✓ (Sheets) | Core spreadsheet engine |
| UniverDocsPlugin | `@univerjs/docs` | ✓ (Docs) | Core document engine |

## RPC Layer (Node.js Specific)

| Plugin | Package | Role | Config |
|--------|---------|------|--------|
| UniverRPCNodeMainPlugin | `@univerjs/rpc-node` | Main thread | `{ workerSrc: './worker.js' }` |
| UniverRPCNodeWorkerPlugin | `@univerjs/rpc-node` | Worker thread | No config needed |

The main thread uses `node:child_process.fork()` to spawn the worker. The worker communicates via `process.send()` / `process.on('message')`.

## Sheets Feature Layer (Node.js Safe)

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverSheetsFormulaPlugin | `@univerjs/sheets-formula` | Formula calculation |
| UniverSheetsNumfmtPlugin | `@univerjs/sheets-numfmt` | Number format |
| UniverSheetsDataValidationPlugin | `@univerjs/sheets-data-validation` | Data validation |
| UniverSheetsConditionalFormattingPlugin | `@univerjs/sheets-conditional-formatting` | Conditional formatting |
| UniverSheetsFilterPlugin | `@univerjs/sheets-filter` | Filter |
| UniverSheetsSortPlugin | `@univerjs/sheets-sort` | Sort |
| UniverSheetsHyperLinkPlugin | `@univerjs/sheets-hyper-link` | Hyperlink |
| UniverSheetsDrawingPlugin | `@univerjs/sheets-drawing` | Drawing model (no UI) |
| UniverSheetsThreadCommentPlugin | `@univerjs/sheets-thread-comment` | Thread comment |
| UniverSheetsTablePlugin | `@univerjs/sheets-table` | Table |
| UniverSheetsNotePlugin | `@univerjs/sheets-note` | Note |
| UniverDrawingPlugin | `@univerjs/drawing` | Drawing base (no UI) |
| UniverThreadCommentPlugin | `@univerjs/thread-comment` | Comment base |

## Browser-Only Plugins (Never Register in Node.js)

These plugins depend on `window`, `document`, `Canvas`, or other browser APIs:

| Plugin | Package | Why Excluded |
|--------|---------|--------------|
| UniverUIPlugin | `@univerjs/ui` | React/DOM rendering |
| UniverRenderEnginePlugin | `@univerjs/engine-render` | Canvas/WebGL (unless using chart/shape) |
| UniverSheetsUIPlugin | `@univerjs/sheets-ui` | Sheet UI components |
| UniverDocsUIPlugin | `@univerjs/docs-ui` | Doc UI components |
| UniverSheetsFormulaUIPlugin | `@univerjs/sheets-formula-ui` | Formula bar/editor |
| UniverSheetsDataValidationUIPlugin | `@univerjs/sheets-data-validation-ui` | Validation UI |
| UniverSheetsConditionalFormattingUIPlugin | `@univerjs/sheets-conditional-formatting-ui` | CF UI |
| UniverSheetsFilterUIPlugin | `@univerjs/sheets-filter-ui` | Filter UI |
| UniverSheetsDrawingUIPlugin | `@univerjs/sheets-drawing-ui` | Drawing UI |
| UniverDrawingUIPlugin | `@univerjs/drawing-ui` | Drawing toolbar |
| UniverSheetsNumfmtUIPlugin | `@univerjs/sheets-numfmt-ui` | Number format UI |
| UniverSheetsSortUIPlugin | `@univerjs/sheets-sort-ui` | Sort UI |
| UniverSheetsHyperLinkUIPlugin | `@univerjs/sheets-hyper-link-ui` | Hyperlink UI |
| UniverSheetsThreadCommentUIPlugin | `@univerjs/sheets-thread-comment-ui` | Comment UI |
| UniverSheetsTableUIPlugin | `@univerjs/sheets-table-ui` | Table UI |
| UniverSheetsNoteUIPlugin | `@univerjs/sheets-note-ui` | Note UI |

> **Exception**: If you need chart/shape rendering in Node.js (e.g., for server-side image generation), `UniverRenderEnginePlugin` may be required. Most headless data-processing tasks do not need it.

## Registration Order (Node.js)

```ts
// 1. License (Pro only)
univer.registerPlugin(UniverLicensePlugin, { license: '...' });

// 2. Formula engine
univer.registerPlugin(UniverFormulaEnginePlugin, { notExecuteFormula: useWorker });

// 3. RPC (if using worker)
if (useWorker) {
  univer.registerPlugin(UniverRPCNodeMainPlugin, { workerSrc: './worker.js' });
}

// 4. Unit core
univer.registerPlugin(UniverDocsPlugin);
univer.registerPlugin(UniverSheetsPlugin);

// 5. Feature plugins
univer.registerPlugin(UniverSheetsFormulaPlugin);
univer.registerPlugin(UniverSheetsNumfmtPlugin);
univer.registerPlugin(UniverSheetsFilterPlugin);
univer.registerPlugin(UniverSheetsSortPlugin);
univer.registerPlugin(UniverSheetsDataValidationPlugin);
univer.registerPlugin(UniverSheetsConditionalFormattingPlugin);
univer.registerPlugin(UniverSheetsHyperLinkPlugin);
univer.registerPlugin(UniverSheetsDrawingPlugin);
univer.registerPlugin(UniverSheetsThreadCommentPlugin);
univer.registerPlugin(UniverSheetsTablePlugin);
univer.registerPlugin(UniverSheetsNotePlugin);
univer.registerPlugin(UniverDrawingPlugin);
```

## Worker Configuration (Node.js)

The worker file is a standalone Node.js script spawned via `fork()`:

```ts
// worker.js
import { LocaleType, Univer } from '@univerjs/core';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverRPCNodeWorkerPlugin } from '@univerjs/rpc-node';
import { UniverSheetsPlugin } from '@univerjs/sheets';

const univer = new Univer({ locale: LocaleType.ZH_CN });

univer.registerPlugin(UniverSheetsPlugin, { onlyRegisterFormulaRelatedMutations: true });
univer.registerPlugin(UniverFormulaEnginePlugin);
univer.registerPlugin(UniverRPCNodeWorkerPlugin);
```

### Worker Notes

- `onlyRegisterFormulaRelatedMutations: true` optimizes the worker for formula-only tasks
- The worker path must be resolvable from the main process (`__dirname` or absolute path)
- The main process automatically kills the child on dispose
- Pro features (pivot, etc.) can also run in the worker by adding their plugins

## Pro Plugins in Node.js

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverLicensePlugin | `@univerjs-pro/license` | License validation |
| UniverProFormulaEnginePlugin | `@univerjs-pro/engine-formula` | Pro formula engine |
| UniverSheetsPivotTablePlugin | `@univerjs-pro/sheets-pivot` | Pivot table |
| UniverSheetsChartPlugin | `@univerjs-pro/sheets-chart` | Chart model (no UI) |
| UniverSheetsShapePlugin | `@univerjs-pro/sheets-shape` | Shape model (no UI) |
| UniverSheetSparklinePlugin | `@univerjs-pro/sheets-sparkline` | Sparkline |
| UniverCollaborationPlugin | `@univerjs-pro/collaboration` | Collaboration types |
| UniverCollaborationClientPlugin | `@univerjs-pro/collaboration-client` | Collaboration client |
| UniverCollaborationClientNodePlugin | `@univerjs-pro/collaboration-client-node` | Node.js socket adapter |

## Facade Imports for Node.js

Only import facade modules that do not depend on browser APIs:

```ts
// Core & Sheets (safe)
import '@univerjs/core/facade';
import '@univerjs/sheets/facade';
import '@univerjs/engine-formula/facade';
import '@univerjs/sheets-formula/facade';
import '@univerjs/sheets-filter/facade';
import '@univerjs/sheets-numfmt/facade';
import '@univerjs/sheets-data-validation/facade';
import '@univerjs/sheets-conditional-formatting/facade';
import '@univerjs/sheets-hyper-link/facade';
import '@univerjs/sheets-thread-comment/facade';
import '@univerjs/sheets-drawing/facade';
import '@univerjs/sheets-sort/facade';
import '@univerjs/sheets-table/facade';
import '@univerjs/sheets-note/facade';
import '@univerjs/network/facade';

// Pro (safe)
import '@univerjs-pro/sheets-pivot/facade';
import '@univerjs-pro/sheets-chart/facade';
import '@univerjs-pro/sheets-shape/facade';
import '@univerjs-pro/sheets-sparkline/facade';
import '@univerjs-pro/collaboration-client/facade';
import '@univerjs-pro/engine-formula/facade';

// Docs (safe)
import '@univerjs/docs/facade';
```
