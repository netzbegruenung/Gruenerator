# Node.js Common Tasks

Practical recipes for headless spreadsheet processing in Node.js.

## Batch Report Generation

Populate a workbook from database results and export:

```ts
import { FUniver } from '@univerjs/core/facade';

function generateSalesReport(univer: Univer, salesData: Array<{ date: string; amount: number; region: string }>) {
  const api = FUniver.newAPI(univer);
  const workbook = api.createWorkbook({});
  const sheet = workbook.getActiveSheet();

  // Header
  sheet.getRange('A1').setValue('Date');
  sheet.getRange('B1').setValue('Amount');
  sheet.getRange('C1').setValue('Region');

  // Data rows
  salesData.forEach((row, i) => {
    const r = i + 1; // 0-based row index
    sheet.getRange(r, 0).setValue(row.date);
    sheet.getRange(r, 1).setValue(row.amount);
    sheet.getRange(r, 2).setValue(row.region);
  });

  // Summary formulas
  const lastRow = salesData.length;
  sheet.getRange(lastRow + 1, 0).setValue('Total');
  sheet.getRange(lastRow + 1, 1).setValue({ f: `=SUM(B2:B${lastRow})` });
  sheet.getRange(lastRow + 1, 2).setValue({ f: `=COUNTA(C2:C${lastRow})` });

  return workbook.save();
}
```

## JSON Import / Export

Univer workbooks can be serialized to/from plain JSON:

```ts
import fs from 'node:fs';
import { FUniver } from '@univerjs/core/facade';

// Load from JSON file
const raw = JSON.parse(fs.readFileSync('workbook.json', 'utf8'));
const api = FUniver.newAPI(univer);
const workbook = api.createWorkbook(raw);

// Modify
workbook.getActiveSheet().getRange('A1').setValue('Modified in Node.js');

// Save back to JSON
fs.writeFileSync('output.json', JSON.stringify(workbook.save(), null, 2));
```

## Server-Side Formula Calculation

### Inline Calculation (No Worker)

Best for simple workbooks or when worker overhead is not justified:

```ts
univer.registerPlugin(UniverFormulaEnginePlugin);
univer.registerPlugin(UniverSheetsPlugin);
univer.registerPlugin(UniverSheetsFormulaPlugin);

const api = FUniver.newAPI(univer);
const workbook = api.createWorkbook({});
const sheet = workbook.getActiveSheet();

sheet.getRange('A1').setValue(10);
sheet.getRange('A2').setValue(20);
sheet.getRange('A3').setValue({ f: '=SUM(A1:A2)' });

// Formulas execute automatically in the main thread
console.log(sheet.getRange('A3').getValue()); // 30
```

### Worker-Based Calculation

Best for heavy workloads or when formula execution must not block the event loop:

```ts
// main.ts
import path from 'node:path';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverRPCNodeMainPlugin } from '@univerjs/rpc-node';

univer.registerPlugin(UniverFormulaEnginePlugin, { notExecuteFormula: true });
univer.registerPlugin(UniverSheetsPlugin);
univer.registerPlugin(UniverSheetsFormulaPlugin);

const workerPath = path.join(__dirname, 'worker.js');
univer.registerPlugin(UniverRPCNodeMainPlugin, { workerSrc: workerPath });

const api = FUniver.newAPI(univer);
const workbook = api.createWorkbook({});
const sheet = workbook.getActiveSheet();

sheet.getRange('A1').setValue(10);
sheet.getRange('A2').setValue(20);
sheet.getRange('A3').setValue({ f: '=SUM(A1:A2)' });

// Formula executes in the forked worker process
// Use await or event listeners for async results
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

## Custom Functions on Server

Register domain-specific functions for backend calculations:

```ts
const formulaEngine = univerAPI.getFormula();

// Synchronous custom function
formulaEngine.registerFunction(
  'TAX',
  (amount, rate) => amount * rate,
  'Calculate tax amount'
);

// Async custom function
formulaEngine.registerAsyncFunction(
  'FETCH_RATE',
  async (currencyCode) => {
    const rate = await exchangeRateService.getRate(currencyCode);
    return rate;
  },
  'Fetch exchange rate from API'
);

// Use in cells
sheet.getRange('B1').setValue(1000);
sheet.getRange('B2').setValue({ f: '=TAX(B1, 0.08)' });
sheet.getRange('B3').setValue({ f: '=FETCH_RATE("USD")' });
```

## Headless Event Handling

Subscribe to workbook changes without a UI:

```ts
// Listen to cell value changes
univerAPI.addEvent(univerAPI.Event.SheetCellChanged, (params) => {
  console.log(`Cell ${params.row},${params.col} changed to`, params.value);
});

// Listen to sheet edits
univerAPI.addEvent(univerAPI.Event.SheetEdited, (params) => {
  console.log('Sheet edited:', params.unitId, params.subUnitId);
});

// Formula calculation finished
const formulaEngine = univerAPI.getFormula();
formulaEngine.calculationEnd((state) => {
  if (state === 3) { // all formulas executed
    const snapshot = univerAPI.getActiveWorkbook().save();
    fs.writeFileSync('result.json', JSON.stringify(snapshot));
  }
});
```

## Multi-Workbook Processing

Process multiple files in sequence:

```ts
async function processFiles(filePaths: string[]) {
  const results: Array<{ file: string; total: unknown }> = [];

  for (const file of filePaths) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const workbook = univerAPI.createWorkbook(raw);
    const sheet = workbook.getActiveSheet();

    // Add summary row
    const dataRange = sheet.getDataRange();
    const lastRow = dataRange.getRow() + dataRange.getHeight();
    sheet.getRange(lastRow, 0).setValue('Grand Total');
    sheet.getRange(lastRow, 1).setValue({ f: `=SUM(B1:B${lastRow - 1})` });

    results.push({
      file,
      total: sheet.getRange(lastRow, 1).getValue(),
    });

    fs.writeFileSync(`processed-${path.basename(file)}`, JSON.stringify(workbook.save()));
  }

  return results;
}
```

## Cleanup and Resource Management

Dispose workbooks and the Univer instance to free memory:

```ts
const workbook = univerAPI.createWorkbook({});
// ... process ...

// Dispose a single workbook
univerAPI.disposeUnit(workbook.getId());

// Or dispose the entire Univer instance (also kills worker child process)
univer.dispose();
```

> `UniverRPCNodeMainPlugin` automatically kills the forked child process when `univer.dispose()` is called.
