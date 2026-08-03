# Univer Pro Features Guide

Complete registry of Univer Pro plugins, configuration, and worker setup.

## Pro Plugin Registry

### License (Required First)

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverLicensePlugin | `@univerjs-pro/license` | License validation and feature entitlement |

### Engine

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverProFormulaEnginePlugin | `@univerjs-pro/engine-formula` | Pro formula engine (replaces open-source engine) |

### Sheets Pro Features

| Plugin | Package | Description | UI Pair |
|--------|---------|-------------|---------|
| UniverSheetsPivotTablePlugin | `@univerjs-pro/sheets-pivot` | Pivot tables | UniverSheetsPivotTableUIPlugin |
| UniverSheetsChartPlugin | `@univerjs-pro/sheets-chart` | Charts (ECharts-based) | UniverSheetsChartUIPlugin |
| UniverSheetSparklinePlugin | `@univerjs-pro/sheets-sparkline` | Sparklines | UniverSheetSparklineUIPlugin |
| UniverSheetsShapePlugin | `@univerjs-pro/sheets-shape` | Shapes & connectors | UniverSheetsShapeUIPlugin |
| UniverSheetsPrintPlugin | `@univerjs-pro/sheets-print` | Print & screenshot | — |
| UniverExchangeClientPlugin | `@univerjs-pro/exchange-client` | Import/export client | UniverSheetsExchangeClientPlugin |

### Collaboration

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverCollaborationPlugin | `@univerjs-pro/collaboration` | Shared types & transform |
| UniverCollaborationClientPlugin | `@univerjs-pro/collaboration-client` | Client OT & sync |
| UniverCollaborationClientUIPlugin | `@univerjs-pro/collaboration-client-ui` | Collaboration UI |
| UniverLiveSharePlugin | `@univerjs-pro/live-share` | Live Share sessions |
| UniverThreadCommentDataSourcePlugin | `@univerjs-pro/thread-comment-datasource` | Thread comment data source |

### Other Pro Packages

| Plugin | Package | Description |
|--------|---------|-------------|
| UniverDocsExchangeClientPlugin | `@univerjs-pro/docs-exchange-client` | Doc import/export |
| UniverDocsPrintPlugin | `@univerjs-pro/docs-print` | Doc printing |
| UniverRangePreprocessPlugin | `@univerjs-pro/range-preprocess` | Range preprocessing |
| UniverTelemetryPlugin | `@univerjs-pro/telemetry` | Telemetry & analytics |
| UniverEditHistoryLoaderPlugin | `@univerjs-pro/edit-history-loader` | Edit history loader |
| UniverEditHistoryViewerPlugin | `@univerjs-pro/edit-history-viewer` | Edit history viewer |

## Facade Side-Effect Imports (Pro)

Every Pro package extends Facade classes via `extend()`. You must import the `/facade` subpath:

```ts
// Pivot table
import '@univerjs-pro/sheets-pivot/facade';

// Chart
import '@univerjs-pro/sheets-chart/facade';

// Sparkline
import '@univerjs-pro/sheets-sparkline/facade';

// Shape
import '@univerjs-pro/sheets-shape/facade';

// Print
import '@univerjs-pro/sheets-print/facade';

// Exchange
import '@univerjs-pro/exchange-client/facade';

// Collaboration
import '@univerjs-pro/collaboration-client/facade';

// Live Share
import '@univerjs-pro/live-share/facade';

// Range preprocess
import '@univerjs-pro/range-preprocess/facade';

// Pro formula engine
import '@univerjs-pro/engine-formula/facade';
```

## Worker Configuration (Pro)

The Web Worker must register Pro plugins for formula computation and pivot table support:

```ts
import { LocaleType, LogLevel, Univer } from '@univerjs/core';
import { UniverRPCWorkerThreadPlugin } from '@univerjs/rpc';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverRemoteSheetsFormulaPlugin } from '@univerjs/sheets-formula';
import { UniverSheetsFilterPlugin } from '@univerjs/sheets-filter';

import { UniverLicensePlugin } from '@univerjs-pro/license';
import { UniverProFormulaEnginePlugin } from '@univerjs-pro/engine-formula';
import { UniverSheetsPivotTablePlugin } from '@univerjs-pro/sheets-pivot';

const univer = new Univer({
  locale: LocaleType.ZH_CN,
  logLevel: LogLevel.VERBOSE,
});

univer.registerPlugin(UniverLicensePlugin, {
  license: process.env.CLIENT_LICENSE_TEXT,
});
univer.registerPlugin(UniverSheetsPlugin, { onlyRegisterFormulaRelatedMutations: true });
univer.registerPlugin(UniverProFormulaEnginePlugin);
univer.registerPlugin(UniverRPCWorkerThreadPlugin);
univer.registerPlugin(UniverRemoteSheetsFormulaPlugin);
univer.registerPlugin(UniverSheetsFilterPlugin);
univer.registerPlugin(UniverSheetsPivotTablePlugin, { notExecuteFormula: false });

self.univer = univer;
```

### Worker Notes

- `onlyRegisterFormulaRelatedMutations: true` optimizes the worker by only registering mutations needed for formula calculation
- `notExecuteFormula: false` on `UniverSheetsPivotTablePlugin` allows the worker to execute formulas for pivot tables
- Always include `UniverLicensePlugin` in the worker; use `WORKER_INIT_LICENSE` constant if loading from a global variable

## Lazy Loading Pro Features

Heavy UI plugins can be deferred to improve first paint:

```ts
setTimeout(() => {
  import('./lazy-pro-plugins').then((m) => {
    m.default().forEach(([plugin, config]) => univer.registerPlugin(plugin, config));
  });
}, 1000);

// lazy-pro-plugins.ts
import { UniverSheetsPivotTableUIPlugin } from '@univerjs-pro/sheets-pivot-ui';
import { UniverSheetsChartUIPlugin } from '@univerjs-pro/sheets-chart-ui';

export default function getLazyPlugins() {
  return [
    [UniverSheetsPivotTableUIPlugin],
    [UniverSheetsChartUIPlugin],
  ];
}
```

## Registration Order Example (Full Pro)

```ts
univer.registerPlugin(UniverLicensePlugin, { license: '...' });
univer.registerPlugin(UniverRenderEnginePlugin);
univer.registerPlugin(UniverProFormulaEnginePlugin, { notExecuteFormula: true });
univer.registerPlugin(UniverUIPlugin, { container: 'app' });
univer.registerPlugin(UniverRPCMainThreadPlugin, { workerURL: worker });

// Docs (if needed)
univer.registerPlugin(UniverDocsPlugin);
univer.registerPlugin(UniverDocsUIPlugin);

// Sheets base
univer.registerPlugin(UniverSheetsPlugin, { notExecuteFormula: true });
univer.registerPlugin(UniverSheetsUIPlugin);
univer.registerPlugin(UniverSheetsNumfmtPlugin);
univer.registerPlugin(UniverSheetsNumfmtUIPlugin);
univer.registerPlugin(UniverSheetsFormulaPlugin, { notExecuteFormula: true });
univer.registerPlugin(UniverSheetsFormulaUIPlugin);

// Sheets features
univer.registerPlugin(UniverSheetsDataValidationPlugin);
univer.registerPlugin(UniverSheetsConditionalFormattingPlugin);
univer.registerPlugin(UniverSheetsFilterPlugin);
univer.registerPlugin(UniverSheetsSortPlugin);
univer.registerPlugin(UniverSheetsDrawingPlugin);
univer.registerPlugin(UniverSheetsDrawingUIPlugin);
univer.registerPlugin(UniverSheetsThreadCommentPlugin);
univer.registerPlugin(UniverSheetsThreadCommentUIPlugin);
univer.registerPlugin(UniverSheetsTablePlugin);
univer.registerPlugin(UniverSheetsTableUIPlugin);

// Pro features
univer.registerPlugin(UniverSheetsPivotTablePlugin, { notExecuteFormula: true });
univer.registerPlugin(UniverSheetsPivotTableUIPlugin);
univer.registerPlugin(UniverSheetsChartPlugin);
univer.registerPlugin(UniverSheetsChartUIPlugin);
univer.registerPlugin(UniverSheetSparklinePlugin);
univer.registerPlugin(UniverSheetSparklineUIPlugin);
univer.registerPlugin(UniverSheetsShapePlugin);
univer.registerPlugin(UniverSheetsShapeUIPlugin);
univer.registerPlugin(UniverSheetsPrintPlugin);
univer.registerPlugin(UniverExchangeClientPlugin, { /* server URLs */ });
univer.registerPlugin(UniverSheetsExchangeClientPlugin);

// Collaboration (optional)
univer.registerPlugin(UniverCollaborationPlugin);
univer.registerPlugin(UniverCollaborationClientPlugin, { /* socket config */ });
univer.registerPlugin(UniverCollaborationClientUIPlugin);
```
