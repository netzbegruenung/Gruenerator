---
name: univer-pro-integrate
description: Integrate Univer Pro (enterprise-grade spreadsheet, document, and presentation engine) into frontend projects. Use when the user needs Univer Pro features including real-time collaboration, XLSX/DOCX import-export, printing, pivot tables, charts, sparklines, shapes, live share, or license management. Also use for setting up UniverLicensePlugin, UniverExchangeClientPlugin, collaboration client plugins, UniverSheetsPrintPlugin, or any Pro-specific integration error. Triggers include "Univer Pro", "collaboration", "import xlsx", "export docx", "print", "pivot table", "chart", "sparkline", "shape", "license", "watermark removal", "UniverLicensePlugin", or "exchange client".
---

# Univer Pro Integrate

Guide for embedding Univer Pro into existing web applications. Univer Pro extends open-source Univer with enterprise features including collaboration, import/export, printing, pivot tables, charts, sparklines, shapes, and license management.

> **Compatibility**: This skill is written for Univer Pro `v0.20.x`. Core concepts remain stable across minor versions, but specific method signatures may shift. Check the user's installed `@univerjs-pro/*` versions and prefer their project's existing API patterns.

> **Prerequisites**: Univer Pro requires the open-source Univer core. See the `univer-integrate` skill for base integration patterns (initialization, Facade API, plugin architecture) before applying Pro features.

## Quick Start

### 1. Install Pro dependencies

```bash
npm install @univerjs-pro/license @univerjs-pro/engine-formula @univerjs-pro/sheets-pivot @univerjs-pro/sheets-pivot-ui @univerjs-pro/sheets-chart @univerjs-pro/sheets-chart-ui @univerjs-pro/sheets-sparkline @univerjs-pro/sheets-sparkline-ui @univerjs-pro/sheets-shape @univerjs-pro/sheets-shape-ui @univerjs-pro/sheets-print @univerjs-pro/exchange-client @univerjs-pro/sheets-exchange-client
```

For collaboration:
```bash
npm install @univerjs-pro/collaboration @univerjs-pro/collaboration-client @univerjs-pro/collaboration-client-ui
```

### 2. Register core Pro plugins

```ts
import { LocaleType, Univer, UniverInstanceType } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';
import { UniverRPCMainThreadPlugin } from '@univerjs/rpc';
import { defaultTheme } from '@univerjs/themes';

// Pro plugins
import { UniverLicensePlugin } from '@univerjs-pro/license';
import { UniverProFormulaEnginePlugin } from '@univerjs-pro/engine-formula';
import { UniverSheetsPivotTablePlugin } from '@univerjs-pro/sheets-pivot';
import { UniverSheetsPivotTableUIPlugin } from '@univerjs-pro/sheets-pivot-ui';
import { UniverSheetsChartPlugin } from '@univerjs-pro/sheets-chart';
import { UniverSheetsChartUIPlugin } from '@univerjs-pro/sheets-chart-ui';
import { UniverSheetSparklinePlugin } from '@univerjs-pro/sheets-sparkline';
import { UniverSheetSparklineUIPlugin } from '@univerjs-pro/sheets-sparkline-ui';
import { UniverSheetsShapePlugin } from '@univerjs-pro/sheets-shape';
import { UniverSheetsShapeUIPlugin } from '@univerjs-pro/sheets-shape-ui';
import { UniverSheetsPrintPlugin } from '@univerjs-pro/sheets-print';
import { UniverExchangeClientPlugin } from '@univerjs-pro/exchange-client';
import { UniverSheetsExchangeClientPlugin } from '@univerjs-pro/sheets-exchange-client';

// Facade side-effect imports (Pro)
import '@univerjs-pro/sheets-pivot/facade';
import '@univerjs-pro/engine-formula/facade';
import '@univerjs-pro/sheets-chart/facade';
import '@univerjs-pro/sheets-sparkline/facade';
import '@univerjs-pro/sheets-shape/facade';
import '@univerjs-pro/sheets-print/facade';
import '@univerjs-pro/exchange-client/facade';

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

const univer = new Univer({
  theme: defaultTheme,
  locale: LocaleType.ZH_CN,
});

// License first
univer.registerPlugin(UniverLicensePlugin, {
  license: process.env.CLIENT_LICENSE_TEXT, // or your license string
});

univer.registerPlugins([
  [UniverRenderEnginePlugin],
  [UniverProFormulaEnginePlugin, { notExecuteFormula: true }],
  [UniverUIPlugin, { container: 'app' }],
  [UniverRPCMainThreadPlugin, { workerURL: worker }],
  [UniverSheetsPlugin, { notExecuteFormula: true }],
  [UniverSheetsUIPlugin],
  // Pro features
  [UniverSheetsPivotTablePlugin, { notExecuteFormula: true }],
  [UniverSheetsPivotTableUIPlugin],
  [UniverSheetsChartPlugin],
  [UniverSheetsChartUIPlugin],
  [UniverSheetSparklinePlugin],
  [UniverSheetSparklineUIPlugin],
  [UniverSheetsShapePlugin],
  [UniverSheetsShapeUIPlugin],
  [UniverSheetsPrintPlugin],
  [UniverExchangeClientPlugin, {
    uploadFileServerUrl: 'https://your-server/universer-api/stream/file/upload',
    getTaskServerUrl: 'https://your-server/universer-api/exchange/task/{taskID}',
    signUrlServerUrl: 'https://your-server/universer-api/file/{fileID}/sign-url',
    importServerUrl: 'https://your-server/universer-api/exchange/{type}/import',
    exportServerUrl: 'https://your-server/universer-api/exchange/{type}/export',
    downloadEndpointUrl: 'https://your-server/',
  }],
  [UniverSheetsExchangeClientPlugin],
]);

univer.createUnit(UniverInstanceType.UNIVER_SHEET, {});
const univerAPI = FUniver.newAPI(univer);
```

### 3. Pro Worker Setup

The Pro worker must include `UniverProFormulaEnginePlugin`, `UniverLicensePlugin`, and `UniverSheetsPivotTablePlugin`:

```ts
// worker.js
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

## Core Concepts

### License-First Registration

`UniverLicensePlugin` must be registered **immediately after** creating the `Univer` instance, before any other Pro plugins. Without a valid license, Pro features run in evaluation mode (watermark, size limits, collaboration quotas).

### Pro Formula Engine

Univer Pro replaces the open-source formula engine with `UniverProFormulaEnginePlugin`. Register it instead of `UniverFormulaEnginePlugin` when using Pro. It supports advanced functions required by pivot tables and server-side computing.

### Plugin Registration Order

The order for Pro integrations is:
1. `UniverLicensePlugin`
2. Engine plugins (`UniverRenderEnginePlugin`, `UniverProFormulaEnginePlugin`)
3. UI infrastructure (`UniverUIPlugin`, `UniverRPCMainThreadPlugin`)
4. Unit core (`UniverSheetsPlugin`, `UniverDocsPlugin`)
5. Unit UI (`UniverSheetsUIPlugin`, `UniverDocsUIPlugin`)
6. Pro features (pivot, chart, sparkline, shape, print, exchange)
7. Collaboration features (if needed)

### Version Policy

All `@univerjs/*` and `@univerjs-pro/*` packages must be kept at the **same version**. Never mix different versions — this is the most common source of runtime errors.

## Pro Feature Overview

| Feature | Core Plugin | UI Plugin | Facade Import |
|---------|-------------|-----------|---------------|
| Pivot Table | `UniverSheetsPivotTablePlugin` | `UniverSheetsPivotTableUIPlugin` | `@univerjs-pro/sheets-pivot/facade` |
| Chart | `UniverSheetsChartPlugin` | `UniverSheetsChartUIPlugin` | `@univerjs-pro/sheets-chart/facade` |
| Sparkline | `UniverSheetSparklinePlugin` | `UniverSheetSparklineUIPlugin` | `@univerjs-pro/sheets-sparkline/facade` |
| Shape | `UniverSheetsShapePlugin` | `UniverSheetsShapeUIPlugin` | `@univerjs-pro/sheets-shape/facade` |
| Print | `UniverSheetsPrintPlugin` | — | `@univerjs-pro/sheets-print/facade` |
| Exchange (import/export) | `UniverExchangeClientPlugin` | `UniverSheetsExchangeClientPlugin` | `@univerjs-pro/exchange-client/facade` |
| Collaboration | `UniverCollaborationPlugin` + `UniverCollaborationClientPlugin` | `UniverCollaborationClientUIPlugin` | `@univerjs-pro/collaboration-client/facade` |
| Live Share | `UniverLiveSharePlugin` | — | `@univerjs-pro/live-share/facade` |
| License | `UniverLicensePlugin` | — | — |

## Common Tasks

### Import XLSX

```ts
const unitId = await univerAPI.importXLSXToUnitIdAsync(file);
// file can be a File object or a URL string
```

### Export XLSX

```ts
import { downloadFile } from '@univerjs-pro/exchange-client';

const fWorkbook = univerAPI.getActiveWorkbook();
const file = await univerAPI.exportXLSXByUnitIdAsync(fWorkbook.getId());
downloadFile(file, 'export', 'xlsx');
```

### Print

```ts
const fWorkbook = univerAPI.getActiveWorkbook();
fWorkbook.updatePrintConfig({
  area: univerAPI.Enum.PrintArea.CurrentSheet,
  paperSize: univerAPI.Enum.PrintPaperSize.A4,
  scale: univerAPI.Enum.PrintScale.FitPage,
});
fWorkbook.updatePrintRenderConfig({ gridlines: true });
fWorkbook.print();
```

### Insert Chart

```ts
const fWorksheet = univerAPI.getActiveWorkbook().getActiveSheet();
const chartInfo = fWorksheet.newChart()
  .setChartType(univerAPI.Enum.ChartType.Column)
  .addRange('A1:D6')
  .setPosition(1, 1, 0, 0)
  .build();
await fWorksheet.insertChart(chartInfo);
```

### Insert Shape

```ts
const shapeInfo = fWorksheet.newShape()
  .setShapeType(univerAPI.Enum.ShapeTypeEnum.Rect)
  .setPosition(1, 1, 0, 0)
  .setWidth(200)
  .setHeight(200)
  .build();
await fWorksheet.insertShape(shapeInfo);
```

## References

- **Pro features guide**: `references/pro-features-guide.md` — complete Pro plugin registry, worker configuration, and feature matrix
- **Collaboration guide**: `references/collaboration-guide.md` — real-time collaboration setup, socket service, loading server units, status monitoring
- **Exchange guide**: `references/exchange-guide.md` — XLSX/DOCX import-export, server URLs, snapshot conversion, download utilities
- **Print guide**: `references/print-guide.md` — print configuration, preview dialog, screenshot to clipboard, events
- **License guide**: `references/license-guide.md` — license acquisition, client/server configuration, evaluation limits, verification
- **Facade extension (Pro)**: `references/facade-extension-pro.md` — Pro-specific Facade methods on FUniver, FWorkbook, FWorksheet, FCollaboration
