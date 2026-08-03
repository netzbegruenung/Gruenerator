# Multi-Unit Instance Management

A single `Univer` instance can manage multiple workbooks, documents, or slides simultaneously. Unit-level operations are performed via `IUniverInstanceService` or the Facade API.

## Creating Multiple Units

```ts
import { UniverInstanceType } from '@univerjs/core';

// Create the first workbook
const workbookId1 = univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
  id: 'wb-1',
  name: 'Workbook 1',
  sheetOrder: ['s1'],
  sheets: { 's1': { id: 's1', name: 'Sheet1', rowCount: 100, columnCount: 20 } },
});

// Create the second workbook
const workbookId2 = univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
  id: 'wb-2',
  name: 'Workbook 2',
  sheetOrder: ['s1'],
  sheets: { 's1': { id: 's1', name: 'Sheet1', rowCount: 100, columnCount: 20 } },
});

// Create a document
const docId = univer.createUnit(UniverInstanceType.UNIVER_DOC, {
  id: 'doc-1',
  body: { dataStream: 'Hello World\r\n' },
});
```

## Switching the Current Unit

```ts
// Facade side: get the currently active unit
const wb1 = univerAPI.getActiveWorkbook(); // Returns the currently focused workbook
const doc = univerAPI.getActiveDocument(); // Returns the currently focused document

// Switch focus via underlying service
const instanceService = univer.__getInjector().get(IUniverInstanceService);
instanceService.focusUnit(workbookId2); // Switch to the second workbook
instanceService.focusUnit(null);        // Unfocus
```

## Getting a Specific Unit

```ts
// Indirectly via Facade (can only get the currently focused one)
const currentWb = univerAPI.getActiveWorkbook();

// Get any unit via IUniverInstanceService
const instanceService = univer.__getInjector().get(IUniverInstanceService);

const wb1 = instanceService.getUnit(workbookId1, UniverInstanceType.UNIVER_SHEET);
const wb2 = instanceService.getUnit(workbookId2, UniverInstanceType.UNIVER_SHEET);
const doc = instanceService.getUnit(docId, UniverInstanceType.UNIVER_DOC);

// Get the current unit of a specific type
const currentSheet = instanceService.getCurrentUnitOfType(UniverInstanceType.UNIVER_SHEET);
const currentDoc = instanceService.getCurrentUnitOfType(UniverInstanceType.UNIVER_DOC);

// Get all units of a type
const allWorkbooks = instanceService.getAllUnitsForType(UniverInstanceType.UNIVER_SHEET);
const allDocs = instanceService.getAllUnitsForType(UniverInstanceType.UNIVER_DOC);

// Get the type of a unit
const type = instanceService.getUnitType(workbookId1); // UniverInstanceType.UNIVER_SHEET
```

## Destroying Units

```ts
// Destroy a specific workbook (does not destroy the entire Univer instance)
univer.disposeUnit(workbookId1);

// After destruction, Facade side access will return null
console.log(univerAPI.getActiveWorkbook()?.getName()); // If the focused one was destroyed, returns undefined
```

## Multi-Workbook Scenario Examples

### Scenario 1: Tab Switching Between Multiple Workbooks

```ts
const workbookIds: string[] = [];

function createWorkbook(name: string) {
  const id = univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
    id: `wb-${name}`,
    name,
    sheetOrder: ['s1'],
    sheets: { 's1': { id: 's1', name: 'Sheet1', rowCount: 100, columnCount: 20 } },
  });
  workbookIds.push(id);
  return id;
}

function switchWorkbook(id: string) {
  const instanceService = univer.__getInjector().get(IUniverInstanceService);
  instanceService.focusUnit(id);
}

// Create two workbooks
const wbA = createWorkbook('Sales');
const wbB = createWorkbook('Inventory');

// Default focus on the first one
switchWorkbook(wbA);

// Switch when user clicks tab
// switchWorkbook(wbB);
```

### Scenario 2: Display Sheets and Docs on the Same Page

```ts
// Create Sheet
const sheetId = univer.createUnit(UniverInstanceType.UNIVER_SHEET, sheetData);

// Create Doc
const docId = univer.createUnit(UniverInstanceType.UNIVER_DOC, docData);

// Use two containers to render separately
// UniverUIPlugin's container can be a specific DOM node
// But by default one Univer instance only corresponds to one main container
// To achieve multi-container, usually multiple Univer instances are needed
```

> Note: One `Univer` instance is usually bound to one `UniverUIPlugin` container. To display multiple independent editors on the same page, **it is recommended to create multiple Univer instances** rather than creating multiple units in a single instance.

### Scenario 3: Multiple Univer Instances (Recommended Multi-Editor Solution)

```ts
function createEditor(container: HTMLElement, data: IWorkbookData) {
  const univer = new Univer({ locale: LocaleType.EN_US });
  univer.registerPlugins([
    [UniverRenderEnginePlugin],
    [UniverFormulaEnginePlugin],
    [UniverUIPlugin, { container }],
    [UniverSheetsPlugin],
    [UniverSheetsUIPlugin],
  ]);
  univer.createUnit(UniverInstanceType.UNIVER_SHEET, data);
  return { univer, api: FUniver.newAPI(univer) };
}

const editor1 = createEditor(containerA, dataA);
const editor2 = createEditor(containerB, dataB);

// Independent, non-interfering
editor1.api.getActiveWorkbook()!.getActiveSheet()!.getRange('A1').setValue('A');
editor2.api.getActiveWorkbook()!.getActiveSheet()!.getRange('A1').setValue('B');
```

## Listening for Unit Creation and Destruction

```ts
univerAPI.addEvent(univerAPI.Event.WorkbookCreated, (params) => {
  console.log('Workbook created:', params.workbook);
});

univerAPI.addEvent(univerAPI.Event.WorkbookDisposed, (params) => {
  console.log('Workbook disposed:', params.workbook);
});

univerAPI.addEvent(univerAPI.Event.SheetCreated, (params) => {
  console.log('Sheet created:', params.worksheet);
});

univerAPI.addEvent(univerAPI.Event.SheetDisposed, (params) => {
  console.log('Sheet disposed:', params.worksheet);
});
```

## Cross-Unit Data Reference

Different workbooks **cannot directly reference each other via formulas** (requires collaboration layer support). But under the same Facade instance, data can be synchronized via JS code:

```ts
const wb1 = instanceService.getUnit('wb-1', UniverInstanceType.UNIVER_SHEET);
const wb2 = instanceService.getUnit('wb-2', UniverInstanceType.UNIVER_SHEET);

// Read from wb1, write to wb2
const value = wb1!.getSnapshot().sheets['s1']?.cellData?.[0]?.[0]?.v;
wb2!.getSnapshot().sheets['s1']!.cellData ??= {};
wb2!.getSnapshot().sheets['s1']!.cellData![0] ??= {};
wb2!.getSnapshot().sheets['s1']!.cellData![0]![0] = { v: value };
```

## Common Pitfalls

1. **Multi-unit ≠ multi-tab** — `createUnit` creates independent workbooks, not worksheet tabs. Use `workbook.create()` for worksheet tabs
2. **`focusUnit` does not automatically switch UI** — If using `UniverUIPlugin`, after focus switching you need to ensure the UI container is correctly associated
3. **Clean up references after `disposeUnit`** — Holding FWorkbook / FWorksheet references and using them after dispose will cause errors
4. **Multiple Univer instances are more stable** — For multiple editors on the same page, multiple instances are less prone to rendering issues than a single instance with multiple units
