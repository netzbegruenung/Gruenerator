---
name: univer-node-backend
description: Use Univer (spreadsheet engine) in Node.js backend environments for headless data processing, batch report generation, server-side formula calculation, and automated workbook manipulation. Use when the user needs to create, read, or modify spreadsheets on the server without a browser, run Univer in Node.js, use createUniverOnNode, UniverRPCNodeMainPlugin, child_process fork for formula workers, server-side XLSX/JSON processing, or batch cell operations via Facade API in a backend context. Triggers include "Node.js", "server side", "backend", "headless", "batch generate", "automated report", "createUniverOnNode", "rpc-node", "formula worker", or "Univer in Node".
---

# Univer Node.js Backend

Guide for running Univer in Node.js environments without a browser. Use this for headless spreadsheet processing, automated report generation, server-side formula calculation, and batch data manipulation.

> **Compatibility**: This skill is written for Univer `v0.21.x` / Univer Pro `v0.20.x`. Node.js support is isomorphic with browser support per the Univer architecture.

> **Prerequisites**: Familiarity with the `univer-integrate` skill (base plugin architecture, Facade API, plugin registration order) is assumed. This skill only covers Node.js-specific differences.

## Quick Start

### 1. Install dependencies

```bash
npm install @univerjs/core @univerjs/engine-formula @univerjs/sheets @univerjs/sheets-formula @univerjs/rpc-node
```

For Pro features in Node.js:
```bash
npm install @univerjs-pro/license @univerjs-pro/engine-formula @univerjs-pro/sheets-pivot @univerjs-pro/collaboration-client-node
```

### 2. Create Univer instance on Node.js

```ts
import { LocaleType, Univer } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula';
import { UniverSheetsFilterPlugin } from '@univerjs/sheets-filter';

// Facade side-effect imports for Node.js
import '@univerjs/sheets/facade';
import '@univerjs/engine-formula/facade';
import '@univerjs/sheets-formula/facade';
import '@univerjs/sheets-filter/facade';
import '@univerjs/sheets-numfmt/facade';

const univer = new Univer({
  locale: LocaleType.ZH_CN,
});

univer.registerPlugin(UniverFormulaEnginePlugin);
univer.registerPlugin(UniverSheetsPlugin);
univer.registerPlugin(UniverSheetsFormulaPlugin);
univer.registerPlugin(UniverSheetsFilterPlugin);

const univerAPI = FUniver.newAPI(univer);
const workbook = univerAPI.createWorkbook({});
const sheet = workbook.getActiveSheet();

sheet.getRange('A1').setValue({ v: 123 });
sheet.getRange('B1').setValue({ f: '=SUM(A1) * 6' });

console.log(workbook.save());
```

### 3. Node.js worker for formula computing (optional)

For heavy formula workloads, offload to a forked process:

```ts
// main.ts
import path from 'node:path';
import { LocaleType, Univer } from '@univerjs/core';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverRPCNodeMainPlugin } from '@univerjs/rpc-node';
import { UniverSheetsPlugin } from '@univerjs/sheets';

const univer = new Univer({ locale: LocaleType.ZH_CN });

univer.registerPlugin(UniverFormulaEnginePlugin, { notExecuteFormula: true });
univer.registerPlugin(UniverSheetsPlugin);

const workerPath = path.join(__dirname, 'worker.js');
univer.registerPlugin(UniverRPCNodeMainPlugin, { workerSrc: workerPath });
```

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

## Core Concepts

### Browser vs Node.js Differences

| Concern | Browser | Node.js |
|---------|---------|---------|
| UI plugins | Required (`UniverUIPlugin`, `*-ui`) | **Omit all `*-ui` plugins** |
| Render engine | `UniverRenderEnginePlugin` | Omit unless using chart/shape |
| RPC | `UniverRPCMainThreadPlugin` + `Worker` | `UniverRPCNodeMainPlugin` + `fork()` |
| Worker plugin | `UniverRPCWorkerThreadPlugin` | `UniverRPCNodeWorkerPlugin` |
| CSS imports | Required | **Not needed** |
| Theme | `defaultTheme` from `@univerjs/themes` | **Not needed** |

### Plugin Registration Order (Node.js)

```
1. UniverLicensePlugin (Pro only)
2. Engine plugins (UniverFormulaEnginePlugin / UniverProFormulaEnginePlugin)
3. RPC (UniverRPCNodeMainPlugin, if using worker)
4. Unit core (UniverSheetsPlugin, UniverDocsPlugin)
5. Feature plugins (UniverSheetsFormulaPlugin, UniverSheetsFilterPlugin, etc.)
6. Pro features (UniverSheetsPivotTablePlugin, etc.)
```

### Node.js Facade Imports

Not all facade imports work in Node.js. Only import packages that do not depend on browser APIs:

```ts
// Safe in Node.js
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

// Pro (safe in Node.js)
import '@univerjs-pro/sheets-pivot/facade';
import '@univerjs-pro/sheets-chart/facade';
import '@univerjs-pro/sheets-shape/facade';
import '@univerjs-pro/sheets-sparkline/facade';
import '@univerjs-pro/collaboration-client/facade';

// Unsafe in Node.js (depend on browser APIs)
// import '@univerjs/ui/facade';
// import '@univerjs/sheets-ui/facade';
// import '@univerjs/sheets-drawing-ui/facade';
// import '@univerjs/sheets-formula-ui/facade';
```

## Common Tasks

### Batch Report Generation

```ts
const workbook = univerAPI.createWorkbook({});
const sheet = workbook.getActiveSheet();

// Populate data from database
const rows = await db.query('SELECT * sales');
rows.forEach((row, i) => {
  sheet.getRange(i + 1, 0).setValue(row.date);
  sheet.getRange(i + 1, 1).setValue(row.amount);
});

// Add formula summary
const lastRow = rows.length;
sheet.getRange(lastRow + 1, 1).setValue({ f: `=SUM(B2:B${lastRow})` });

// Export snapshot
const snapshot = workbook.save();
```

### Load and Modify Existing Workbook

```ts
const existingData = JSON.parse(fs.readFileSync('input.json', 'utf8'));
const workbook = univerAPI.createWorkbook(existingData);
const sheet = workbook.getActiveSheet();

sheet.getRange('A1').setValue('Updated');
fs.writeFileSync('output.json', JSON.stringify(workbook.save()));
```

### Server-Side Formula Calculation

```ts
// Without worker (simple workloads)
univer.registerPlugin(UniverFormulaEnginePlugin);

// With worker (heavy workloads)
univer.registerPlugin(UniverFormulaEnginePlugin, { notExecuteFormula: true });
univer.registerPlugin(UniverRPCNodeMainPlugin, { workerSrc: './worker.js' });
```

### Register Custom Function on Server

```ts
const formulaEngine = univerAPI.getFormula();
formulaEngine.registerFunction(
  'DISCOUNT',
  (price, percent) => price * (1 - percent / 100),
  'Calculate price after discount'
);
```

## Pro Node.js Integration

For using Univer Pro features (collaboration, pivot, chart, shape) in Node.js, see `references/node-pro-integration.md`.

## References

- **Node plugin registry**: `references/node-plugin-registry.md` — complete plugin list for Node.js, registration order, worker configuration, and browser-only exclusions
- **Node common tasks**: `references/node-common-tasks.md` — batch processing, JSON import/export, formula calculation patterns, custom functions, event handling in headless mode
- **Pro Node.js integration**: `references/node-pro-integration.md` — Pro formula engine, collaboration client node, pivot/chart/shape in backend, license setup for server
