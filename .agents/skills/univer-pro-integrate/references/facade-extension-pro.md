# Pro Facade API Extensions

Univer Pro extends the base Facade API with new methods on `FUniver`, `FWorkbook`, `FWorksheet`, and introduces `FCollaboration`.

> **Important**: All Pro facade imports are side-effect imports. Without them, methods will be `undefined` at runtime.

## FUniver Extensions

### Exchange (Import / Export)

Requires: `import '@univerjs-pro/exchange-client/facade'`

```ts
// XLSX
const unitId = await univerAPI.importXLSXToUnitIdAsync(fileOrUrl);
const snapshot = await univerAPI.importXLSXToSnapshotAsync(fileOrUrl);
const file = await univerAPI.exportXLSXByUnitIdAsync(unitId);
const file = await univerAPI.exportXLSXBySnapshotAsync(workbookData);

// DOCX
const unitId = await univerAPI.importDOCXToUnitIdAsync(fileOrUrl);
const snapshot = await univerAPI.importDOCXToSnapshotAsync(fileOrUrl);
const file = await univerAPI.exportDOCXByUnitIdAsync(unitId);
const file = await univerAPI.exportDOCXBySnapshotAsync(documentData);
```

### Collaboration

Requires: `import '@univerjs-pro/collaboration-client/facade'`

```ts
const collaboration = univerAPI.getCollaboration();

// Load server units
const unitModel = await univerAPI.loadServerUnit(unitId, unitType);
const unitModel = await univerAPI.loadServerUnitOfRevision(unitId, unitType, revision);

// Collaboration events
univerAPI.Event.CollaborationStatusChanged
```

### Pivot Table (Generic)

Requires: `import '@univerjs-pro/sheets-pivot/facade'`

```ts
// Create a standalone pivot table from raw data
const pivot = univerAPI.generatePivotTable(dataArray);
const result = pivot.getResultByCalculate();
```

### Print Events

Requires: `import '@univerjs-pro/sheets-print/facade'`

```ts
univerAPI.Event.BeforeSheetPrintOpen
univerAPI.Event.SheetPrintOpen
univerAPI.Event.BeforeSheetPrintConfirm
univerAPI.Event.SheetPrintConfirmed
univerAPI.Event.BeforeSheetPrintCanceled
univerAPI.Event.SheetPrintCanceled
```

## FWorkbook Extensions

### Print

Requires: `import '@univerjs-pro/sheets-print/facade'`

```ts
const fWorkbook = univerAPI.getActiveWorkbook();

fWorkbook.updatePrintConfig({
  area: univerAPI.Enum.PrintArea.CurrentSheet,
  subUnitIds: [sheetId],
  paperSize: univerAPI.Enum.PrintPaperSize.A4,
  scale: univerAPI.Enum.PrintScale.FitPage,
  orientation: univerAPI.Enum.PrintOrientation.Portrait,
  freeze: [univerAPI.Enum.PrintFreeze.Row],
  margin: univerAPI.Enum.PrintPaperMargin.Normal,
});

fWorkbook.updatePrintRenderConfig({
  gridlines: true,
  hAlign: univerAPI.Enum.PrintAlign.Middle,
  vAlign: univerAPI.Enum.PrintAlign.Middle,
  headerFooter: [
    univerAPI.Enum.PrintHeaderFooter.PageNumber,
    univerAPI.Enum.PrintHeaderFooter.WorksheetTitle,
  ],
});

fWorkbook.print();
fWorkbook.openPrintDialog();
fWorkbook.closePrintDialog();

const ok = await fWorkbook.saveScreenshotToClipboard();
```

## FWorksheet Extensions

### Chart

Requires: `import '@univerjs-pro/sheets-chart/facade'`

```ts
const fWorksheet = univerAPI.getActiveWorkbook().getActiveSheet();

// Insert chart
const chartInfo = fWorksheet.newChart()
  .setChartType(univerAPI.Enum.ChartType.Column)
  .addRange('A1:D6')
  .setPosition(1, 1, 0, 0)
  .setWidth(600)
  .setHeight(400)
  .build();
const chart = await fWorksheet.insertChart(chartInfo);

// Update chart
const charts = fWorksheet.getCharts();
const newInfo = fWorksheet.newChart(charts[0])
  .asLineChart()
  .setOptions('legend.position', univerAPI.Enum.LegendPositionEnum.Right)
  .build();
fWorksheet.updateChart(newInfo);

// Remove chart
await fWorksheet.removeChart(chart);

// Register custom ECharts theme
fWorksheet.registerChartTheme('myTheme', echartsThemeObject);
```

### Shape

Requires: `import '@univerjs-pro/sheets-shape/facade'`

```ts
// Insert basic shape
const shapeInfo = fWorksheet.newShape()
  .setShapeType(univerAPI.Enum.ShapeTypeEnum.Rect)
  .setPosition(1, 1, 0, 0)
  .setWidth(200)
  .setHeight(200)
  .setStrokeColor('#000000')
  .setStrokeWidth(2)
  .build();
await fWorksheet.insertShape(shapeInfo);

// Insert connector
const connectorInfo = fWorksheet.newConnector()
  .setShapeType(univerAPI.Enum.ShapeTypeEnum.StraightConnector1)
  .setPosition(1, 1, 0, 0)
  .setWidth(200)
  .setHeight(100)
  .setStartArrowType(univerAPI.Enum.ShapeArrowTypeEnum.Arrow)
  .setEndArrowType(univerAPI.Enum.ShapeArrowTypeEnum.Arrow)
  .build();
await fWorksheet.insertShape(connectorInfo);

// Connect shapes
await fWorksheet.connectShapes({
  connector: connectorShape,
  startTarget: { shape: shapeA, connectionSiteIndex: 0 },
  endTarget: { shape: shapeB, connectionSiteIndex: 2 },
});

// Update / remove
const shapes = fWorksheet.getShapes();
const newInfo = fWorksheet.newShape(shapes[0])
  .setStrokeColor('#ff0000')
  .build();
await fWorksheet.updateShape(newInfo);
await fWorksheet.removeShape(shapes[0]);
```

### Sparkline

Requires: `import '@univerjs-pro/sheets-sparkline/facade'`

Sparklines are configured via the worksheet's range/facade APIs. The facade mainly adds `SparklineTypeEnum`:

```ts
// Available types via univerAPI.Enum.SparklineTypeEnum
// Line, Column, WinLoss, etc.
```

## FCollaboration

Requires: `import '@univerjs-pro/collaboration-client/facade'`

```ts
const collaboration = univerAPI.getCollaboration();

// Load a sheet from the collaboration server
const workbook = await collaboration.loadSheetAsync('unit-id');

// Subscribe to online members
const disposable = collaboration.subscribeCollaborators('unit-id', (members) => {
  console.log(members);
});

// Get sync status
const status = collaboration.getCollaborationStatus('unit-id');
// CollaborationStatus.NOT_COLLAB
// CollaborationStatus.SYNCED
// CollaborationStatus.PENDING
// CollaborationStatus.AWAITING
// CollaborationStatus.AWAITING_WITH_PENDING
// CollaborationStatus.FETCH_MISS
// CollaborationStatus.CONFLICT
// CollaborationStatus.OFFLINE
```

## Enums Added by Pro

| Enum | Source Import | Values |
|------|---------------|--------|
| `ChartType` | `@univerjs-pro/sheets-chart/facade` | Column, Line, Pie, Bar, Area, Scatter, etc. |
| `LegendPositionEnum` | `@univerjs-pro/sheets-chart/facade` | Top, Bottom, Left, Right, Inside |
| `ShapeTypeEnum` | `@univerjs-pro/sheets-shape/facade` | Rect, RoundRect, Oval, Triangle, etc. |
| `ShapeArrowTypeEnum` | `@univerjs-pro/sheets-shape/facade` | None, Arrow, Stealth, Diamond, etc. |
| `SparklineTypeEnum` | `@univerjs-pro/sheets-sparkline/facade` | Line, Column, WinLoss |
| `PrintArea` | `@univerjs-pro/sheets-print/facade` | CurrentSheet, SpecificRange, EntireWorkbook |
| `PrintPaperSize` | `@univerjs-pro/sheets-print/facade` | A4, Letter, Legal, A3, etc. |
| `PrintScale` | `@univerjs-pro/sheets-print/facade` | FitPage, FitWidth, FitHeight, Percentage |
| `PrintOrientation` | `@univerjs-pro/sheets-print/facade` | Portrait, Landscape |
| `PrintFreeze` | `@univerjs-pro/sheets-print/facade` | None, Row, Column, Both |
| `PrintPaperMargin` | `@univerjs-pro/sheets-print/facade` | Normal, Narrow, Wide |
| `PrintAlign` | `@univerjs-pro/sheets-print/facade` | Left, Middle, Right / Top, Bottom |
| `PrintHeaderFooter` | `@univerjs-pro/sheets-print/facade` | PageNumber, PageSize, WorksheetTitle, Date, Time, etc. |
| `CollaborationStatus` | `@univerjs-pro/collaboration-client/facade` | NOT_COLLAB, SYNCED, PENDING, AWAITING, etc. |

## Events Added by Pro

| Event | Source Import | Params |
|-------|---------------|--------|
| `BeforeSheetPrintOpen` | `@univerjs-pro/sheets-print/facade` | `{ workbook, worksheet, cancel? }` |
| `SheetPrintOpen` | `@univerjs-pro/sheets-print/facade` | `{ workbook, worksheet }` |
| `BeforeSheetPrintConfirm` | `@univerjs-pro/sheets-print/facade` | `{ layoutConfig, renderConfig, cancel? }` |
| `SheetPrintConfirmed` | `@univerjs-pro/sheets-print/facade` | `{ layoutConfig, renderConfig }` |
| `BeforeSheetPrintCanceled` | `@univerjs-pro/sheets-print/facade` | `{ layoutConfig, renderConfig, cancel? }` |
| `SheetPrintCanceled` | `@univerjs-pro/sheets-print/facade` | `{ layoutConfig, renderConfig }` |
| `CollaborationStatusChanged` | `@univerjs-pro/collaboration-client/facade` | `{ unitId, status }` |
| `PivotTableAdded` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, subUnitId, pivotTableId, ... }` |
| `PivotTableMoved` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, pivotTableId, ... }` |
| `PivotTableRemoved` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, pivotTableId }` |
| `PivotTableFieldAdded` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, subUnitId, pivotTableId, dataFieldId, fieldArea, index }` |
| `PivotTableFieldRemoved` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, subUnitId, pivotTableId, fieldIds }` |
| `PivotTableFieldMoved` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, subUnitId, pivotTableId, fieldId, area, index }` |
| `PivotTableFieldCollapseChanged` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, subUnitId, row, col, collapse }` |
| `PivotTableFieldFilterChanged` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, subUnitId, pivotTableId, tableFieldId, items, isAll }` |
| `PivotTableFieldSortChanged` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, subUnitId, pivotTableId, tableFieldId, info }` |
| `PivotTableFieldSettingChanged` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, subUnitId, pivotTableId, tableFieldId, displayName, format, subtotalType, ... }` |
| `PivotTableValuePositionChanged` | `@univerjs-pro/sheets-pivot/facade` | `{ pivotTableId, position, index }` |
| `PivotTableRendered` | `@univerjs-pro/sheets-pivot/facade` | `{ unitId, subUnitId, pivotTableId, changeType, isEmpty, rangeInfo }` |
