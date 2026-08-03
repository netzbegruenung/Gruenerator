# Print Guide

Univer Pro provides advanced printing capabilities for spreadsheets, including print preview, layout configuration, and screenshot to clipboard.

> **License note**: Screenshot to clipboard requires a valid license. Without a license, `saveScreenshotToClipboard()` returns `false`.

## Required Packages

```bash
npm install @univerjs-pro/sheets-print
```

## Setup

```ts
import { UniverSheetsPrintPlugin } from '@univerjs-pro/sheets-print';

import '@univerjs-pro/sheets-print/facade';

univer.registerPlugin(UniverSheetsPrintPlugin, {
  enforceWatermark: false, // set true to force watermark on print
});
```

## Print Configuration

### Layout Config

```ts
const fWorkbook = univerAPI.getActiveWorkbook();
const fWorksheet = fWorkbook.getActiveSheet();
const subUnitId = fWorksheet.getSheetId();

fWorkbook.updatePrintConfig({
  area: univerAPI.Enum.PrintArea.CurrentSheet, // or SpecificRange, EntireWorkbook
  subUnitIds: [subUnitId],
  paperSize: univerAPI.Enum.PrintPaperSize.A4,
  scale: univerAPI.Enum.PrintScale.FitPage, // or FitWidth, FitHeight, Percentage
  scaleValue: 100, // when scale is Percentage
  orientation: univerAPI.Enum.PrintOrientation.Portrait, // or Landscape
  freeze: [univerAPI.Enum.PrintFreeze.Row], // or Column, Both, None
  margin: univerAPI.Enum.PrintPaperMargin.Normal, // or Narrow, Wide
  centerHorizontal: false,
  centerVertical: false,
  printTitles: {
    rowTitle: { startRow: 0, endRow: 0 },
    columnTitle: { startColumn: 0, endColumn: 0 },
  },
  pageOrder: univerAPI.Enum.PrintPageOrder.DownThenOver,
  printGridlines: true,
  printHeading: true,
});
```

### Render Config

```ts
fWorkbook.updatePrintRenderConfig({
  gridlines: true,
  hAlign: univerAPI.Enum.PrintAlign.Middle, // or Left, Right
  vAlign: univerAPI.Enum.PrintAlign.Middle, // or Top, Bottom
  headerFooter: [
    univerAPI.Enum.PrintHeaderFooter.PageSize,
    univerAPI.Enum.PrintHeaderFooter.WorksheetTitle,
    univerAPI.Enum.PrintHeaderFooter.PageNumber,
    univerAPI.Enum.PrintHeaderFooter.Date,
    univerAPI.Enum.PrintHeaderFooter.Time,
  ],
});
```

### Print

```ts
// Direct print
fWorkbook.print();

// Open print preview dialog
fWorkbook.openPrintDialog();

// Close print preview dialog
fWorkbook.closePrintDialog();
```

## Screenshot to Clipboard

```ts
const result = await fWorkbook.saveScreenshotToClipboard();
console.log(result); // true or false
```

This uses the Clipboard API and may fail in insecure contexts or unsupported browsers.

## Print Events

```ts
// Before print dialog opens
univerAPI.addEvent(univerAPI.Event.BeforeSheetPrintOpen, (params) => {
  console.log('Workbook:', params.workbook, 'Worksheet:', params.worksheet);
  // params.cancel = true; // to cancel
});

// After print dialog opens
univerAPI.addEvent(univerAPI.Event.SheetPrintOpen, (params) => {
  console.log('Print dialog opened');
});

// Before confirm print
univerAPI.addEvent(univerAPI.Event.BeforeSheetPrintConfirm, (params) => {
  console.log('Layout:', params.layoutConfig, 'Render:', params.renderConfig);
  // params.cancel = true;
});

// After confirm print
univerAPI.addEvent(univerAPI.Event.SheetPrintConfirmed, (params) => {
  console.log('Print confirmed');
});

// Before cancel
univerAPI.addEvent(univerAPI.Event.BeforeSheetPrintCanceled, (params) => {
  // params.cancel = true;
});

// After cancel
univerAPI.addEvent(univerAPI.Event.SheetPrintCanceled, (params) => {
  console.log('Print canceled');
});
```

## Enforce Watermark on Print

To ensure watermarked content is printed (useful for licensed deployments requiring traceability):

```ts
univer.registerPlugin(UniverSheetsPrintPlugin, {
  enforceWatermark: true,
});
```
