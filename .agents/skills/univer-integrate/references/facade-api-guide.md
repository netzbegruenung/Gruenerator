# Univer Facade API Quick Reference

## Contents

- [Side-Effect Imports](#side-effect-imports-must-be-done-first-otherwise-methods-wont-exist)
- [FUniver](#funiver)
- [FWorkbook](#fworkbook)
- [FWorksheet](#fworksheet)
- [FRange](#frange)
- [FSelection](#fselection)
- [Complete Code Examples by Scenario](#complete-code-examples-by-scenario)
- [Common Pitfalls](#common-pitfalls)

Univer's Facade API design is inspired by Google AppScripts. Core object hierarchy:

```
FUniver
  ├── getActiveWorkbook() → FWorkbook
  │     ├── getActiveSheet() → FWorksheet
  │     │     ├── getRange('A1:B2') → FRange
  │     │     ├── getRange(0, 0, 2, 2) → FRange  // row, col, numRows, numCols
  │     │     ├── createConditionalFormattingRule() → builder
  │     │     └── ...
  │     ├── getWorksheets() → FWorksheet[]
  │     └── ...
  ├── addEvent(event, callback) → IDisposable
  ├── Enum → All enum values
  └── Util → Utility functions
```

## Side-Effect Imports (Must Be Done First, Otherwise Methods Won't Exist)

Facade capabilities are registered via side-effect imports. Missing any of them will cause the corresponding package extension methods to be `undefined` at runtime:

```ts
// Core
import '@univerjs/core/facade';

// UI infrastructure
import '@univerjs/ui/facade';

// Sheets
import '@univerjs/sheets/facade';
import '@univerjs/sheets-ui/facade';
import '@univerjs/sheets-formula/facade';
import '@univerjs/sheets-formula-ui/facade';
import '@univerjs/sheets-filter/facade';
import '@univerjs/sheets-numfmt/facade';
import '@univerjs/sheets-data-validation/facade';
import '@univerjs/sheets-conditional-formatting/facade';
import '@univerjs/sheets-hyper-link/facade';
import '@univerjs/sheets-hyper-link-ui/facade';
import '@univerjs/sheets-thread-comment/facade';
import '@univerjs/sheets-drawing/facade';
import '@univerjs/sheets-drawing-ui/facade';
import '@univerjs/sheets-find-replace/facade';
import '@univerjs/sheets-zen-editor/facade';
import '@univerjs/sheets-crosshair-highlight/facade';
import '@univerjs/sheets-sort/facade';
import '@univerjs/sheets-table/facade';
import '@univerjs/sheets-note/facade';

// Docs
import '@univerjs/docs-ui/facade';

// Engine, Network & Watermark
import '@univerjs/engine-formula/facade';
import '@univerjs/network/facade';
import '@univerjs/watermark/facade';
```

## FUniver

```ts
static newAPI(wrapped: Univer | Injector): FUniver

getActiveWorkbook(): FWorkbook | null
getActiveDocument(): FDoc | null
getActiveSlide(): FSlide | null

createUnit(type: UniverInstanceType, data: IWorkbookData | IDocumentData | ISlideData): string
// Returns unitId

disposeUnit(unitId: string): boolean

addEvent<T extends keyof IEventParamConfig>(
  event: T,
  callback: (params: IEventParamConfig[T]) => void
): IDisposable

getEventRegistry(): FEventRegistry

get Enum(): FEnum
get Util(): FUtil

// RichText / Paragraph / TextStyle builders
newRichText(): RichTextBuilder
newParagraphStyle(config: IParagraphStyleConfig): ParagraphStyleBuilder
newTextStyle(config: ITextStyleConfig): TextStyleBuilder
newTextDecoration(config?: ITextDecorationConfig): TextDecorationBuilder
newBlob(): FBlob

// User management
getUserManager(): FUserManager
```

## FWorkbook

```ts
readonly id: string

getWorkbook(): Workbook
getName(): string
setName(name: string): this

getActiveSheet(): FWorksheet | null
setActiveSheet(sheet: FWorksheet): this

getWorksheets(): FWorksheet[]
getSheetBySheetId(sheetId: string): FWorksheet | null
getSheetByName(name: string): FWorksheet | null

create(name: string, rows: number, columns: number): FWorksheet
copy(name: string): FWorksheet

insertSheet(index?: number): FWorksheet
deleteSheet(sheet: FWorksheet): boolean

hideSheet(sheet: FWorksheet): this
showSheet(sheet: FWorksheet): this

moveSheet(fromIndex: number, toIndex: number): this

undo(): this
redo(): this

// Permission
getPermission(): FWorkbookPermission
setEditable(editable: boolean): this

// Defined names (named ranges)
getDefinedName(name: string): FDefinedName | null
getDefinedNames(): FDefinedName[]
addDefinedName(name: string, formulaOrRange: string): FDefinedName
removeDefinedName(name: string): boolean
```

## FWorksheet

```ts
getSheet(): Worksheet
getWorkbook(): Workbook
getSheetId(): string

getName(): string
setName(name: string): this

getRange(a1Notation: string): FRange
getRange(row: number, column: number, numRows?: number, numColumns?: number): FRange
getRangeList(a1Notations: string[]): FRange[]

getMaxRows(): number
getMaxColumns(): number
setRowCount(count: number): this
setColumnCount(count: number): this

show(): this
hide(): this
isSheetHidden(): boolean

setTabColor(color: string | IColorStyle): this
getTabColor(): Nullable<IColorStyle>

// Row / Column manipulation
insertRow(rowIndex: number, numRows?: number): this
insertColumn(columnIndex: number, numColumns?: number): this
insertRowBefore(rowIndex: number): this
insertColumnBefore(columnIndex: number): this
insertRowAfter(rowIndex: number): this
insertColumnAfter(columnIndex: number): this

deleteRow(rowIndex: number, numRows?: number): this
deleteColumn(columnIndex: number, numColumns?: number): this

hideRow(rowIndex: number, numRows?: number): this
hideColumn(columnIndex: number, numColumns?: number): this
showRow(rowIndex: number, numRows?: number): this
showColumn(columnIndex: number, numColumns?: number): this

setRowHeight(rowIndex: number, height: number): this
setColumnWidth(columnIndex: number, width: number): this
getRowHeight(rowIndex: number): number
getColumnWidth(columnIndex: number): number

setRowAutoHeight(rowIndex: number, autoHeight: boolean): this

// Freeze panes
setFrozen(row: number, column: number): this
cancelFrozen(): this
getFreeze(): IFreeze

// Merge
mergeRange(range: FRange | IRange): this
unmergeRange(range: FRange | IRange): this

// Gridlines
showGridlines(): this
hideGridlines(): this
setGridlinesColor(color: string): this

// Selection
getSelection(): FSelection

// Data validation
newDataValidation(): FDataValidationBuilder
getDataValidations(): FDataValidation[]
setDataValidations(validations: FDataValidation[]): this
addDataValidation(validation: FDataValidation): this
removeDataValidation(range: FRange | IRange): this

// Conditional formatting
newConditionalFormattingRule(): FConditionalFormattingBuilder
getConditionalFormattingRules(): IConditionFormattingRule[]
addConditionalFormattingRule(rule: IConditionFormattingRule): this
removeConditionalFormattingRule(rule: IConditionFormattingRule): this
moveConditionalFormattingRule(from: number, to: number): this

// Filter
getFilter(): FFilter | null
createFilter(range: FRange | IRange): FFilter
removeFilter(): this

// Sort
getSort(): FSort
sort(specs: ISortSpec[]): this

// Defined names scoped to this sheet
getDefinedName(name: string): FDefinedName | null

// Drawing / Images
getDrawings(): FDrawing[]
addDrawing(drawing: IDrawingParam): FDrawing
removeDrawing(drawingId: string): this

// Note / Comment
getNote(cell: FRange | IRange): FNote | null
getNotes(): FNote[]
addNote(cell: FRange | IRange, content: IDocumentData | string): FNote
deleteNote(cell: FRange | IRange): this

// Permission
getPermission(): FWorksheetPermission
setEditable(editable: boolean): this

// Hooks
getHooks(): FSheetHooks
```

## FRange

```ts
getRange(): IRange  // { startRow, endRow, startColumn, endColumn, rangeType }
getWorkbook(): FWorkbook
getWorksheet(): FWorksheet

getValue(): CellValue
getValues(): CellValue[][]
getRawValue(): Nullable<ICellData>  // { v, f, s, p, custom }
getDisplayValue(): string | null

setValue(value: CellValue | ICellData | RichTextValue | TextStyleValue): this
setValues(values: (CellValue | ICellData | RichTextValue | TextStyleValue)[][]): this
clear(options?: IFacadeClearOptions): this
// options: { contentsOnly?: boolean; formatOnly?: boolean }

copyTo(target: FRange | IRange, pasteType?: PasteType): this

// Position helpers
getRow(): number
getColumn(): number
getRowIndex(): number
getColumnIndex(): number
getLastRow(): number
getLastColumn(): number
getWidth(): number
getHeight(): number
getCellCount(): number
isSingleCell(): boolean
getA1Notation(): string

// Merge
merge(): this
unmerge(): this
isMerged(): boolean
breakApart(): this  // split text to columns

// Styles
getBackground(): string | undefined
setBackground(color: string): this
getFontColor(): string | undefined
setFontColor(color: string): this
getFontWeight(): FontWeight   // 'normal' | 'bold'
setFontWeight(weight: FontWeight): this
getFontStyle(): FontStyle     // 'normal' | 'italic'
setFontStyle(style: FontStyle): this
getFontLine(): FontLine       // 'none' | 'underline' | 'line-through'
setFontLine(line: FontLine): this
getFontSize(): number
setFontSize(size: number): this
getFontFamily(): string
setFontFamily(family: string): this

getHorizontalAlignment(): FHorizontalAlignment
setHorizontalAlignment(align: FHorizontalAlignment): this
// 'left' | 'center' | 'right' | 'justify'

getVerticalAlignment(): FVerticalAlignment
setVerticalAlignment(align: FVerticalAlignment): this
// 'top' | 'middle' | 'bottom' | 'justify'

getTextWrap(): BooleanNumber
setTextWrap(wrap: BooleanNumber | boolean): this

getTextRotation(): number | ITextRotation
setTextRotation(rotation: number | ITextRotation): this

getIndent(): number
setIndent(indent: number): this

// Border
setBorder(style: BorderStyleTypes, type: BorderType, color: string, radius?: number): this
getBorder(): IBorderData | undefined

// Number format
getNumberFormat(): string
setNumberFormat(format: string): this
setNumberFormats(formats: string[][]): this

// Formula
getFormula(): string | null
setFormula(formula: string): this
getFormulas(): (string | null)[][]
setFormulas(formulas: (string | null)[][]): this
hasFormula(): boolean

// Custom metadata
getCustomMetadata(): Nullable<CustomData>
setCustomMetadata(metadata: CustomData): this

// Hyperlink
getHyperlink(): Nullable<IHyperLink>
setHyperlink(url: string, label?: string): this
removeHyperlink(): this

// Data validation (applied to this range)
getDataValidation(): FDataValidation | null
setDataValidation(rule: FDataValidation): this
removeDataValidation(): this

// Conditional formatting
getConditionalFormattingRules(): IConditionFormattingRule[]

// Drawing
getDrawings(): FDrawing[]
addDrawing(drawing: IDrawingParam): FDrawing
removeDrawing(drawingId: string): this

// Note
getNote(): FNote | null
addNote(content: IDocumentData | string): FNote
deleteNote(): this

// Permission
getPermission(): FRangePermission
setEditable(editable: boolean): this
```

## FSelection

```ts
getActiveRange(): FRange | null
getActiveRanges(): FRange[]
setActiveRange(range: FRange | IRange): this
setActiveRanges(ranges: (FRange | IRange)[]): this

moveTo(range: FRange | IRange): this

// Listen for selection changes
onSelectionChange(callback: (selections: ISelectionWithStyle[]) => void): IDisposable
```

## Complete Code Examples by Scenario

### Scenario 1: Create and Populate a Worksheet

```ts
const workbook = univerAPI.getActiveWorkbook()!;
const sheet = workbook.create('Sales', 100, 10);
workbook.setActiveSheet(sheet);

// Header row
sheet.getRange('A1:D1')
  .setValues([['Product', 'Qty', 'Price', 'Total']])
  .setBackground('#4472C4')
  .setFontColor('#FFFFFF')
  .setFontWeight('bold');

// Data rows
sheet.getRange('A2:D4').setValues([
  ['Apple', 10, 2.5, '=B2*C2'],
  ['Banana', 20, 1.5, '=B3*C3'],
  ['Cherry', 15, 3.0, '=B4*C4'],
]);

// Set number format
sheet.getRange('C2:D10').setNumberFormat('$#,##0.00');
```

### Scenario 2: Conditional Formatting

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
const range = sheet.getRange('A1:D10');

const rule = sheet.newConditionalFormattingRule()
  .whenNumberGreaterThan(100)
  .setRanges([range.getRange()])
  .setBackground('red')
  .setFontColor('white')
  .build();

sheet.addConditionalFormattingRule(rule);
```

### Scenario 3: Data Validation

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
const range = sheet.getRange('B2:B100');

const validation = sheet.newDataValidation()
  .requireNumberBetween(1, 100)
  .setHelpText('Please enter a number between 1 and 100')
  .setAllowInvalid(false)
  .build();

range.setDataValidation(validation);
```

### Scenario 4: Filter

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
const filter = sheet.createFilter(sheet.getRange('A1:D100'));

// Filter by column
filter.getColumnFilterCriteria(0)?.setVisibleValues(['Apple', 'Banana']);
filter.apply();

// Remove filter
sheet.removeFilter();
```

### Scenario 5: Sort

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
sheet.sort([
  { column: 2, ascending: true },   // Column 3 ascending
  { column: 3, ascending: false },  // Column 4 descending
]);
```

### Scenario 6: Insert Image

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
const imageId = await univerAPI.getBlob()
  .newBlob(imageBase64, 'image/png')
  .toImage();

sheet.addDrawing({
  unitId: sheet.getWorkbook().getUnitId(),
  subUnitId: sheet.getSheetId(),
  drawingType: DrawingType.DRAWING_IMAGE,
  imageProperties: {
    imageId,
    source: imageId,
    width: 200,
    height: 150,
  },
  transform: {
    positionH: { relativeFrom: 'column', posOffset: 0 },
    positionV: { relativeFrom: 'row', posOffset: 0 },
  },
});
```

### Scenario 7: Listen for Cell Changes

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
const hooks = sheet.getHooks();

const disposable = hooks.onCellChange((cell, workbook, worksheet) => {
  const range = worksheet.getRange(cell.row, cell.col);
  console.log(`Cell ${range.getA1Notation()} changed to ${range.getValue()}`);
});

// Remember to dispose when component unmounts
disposable.dispose();
```

### Scenario 8: Export Data

```ts
const workbook = univerAPI.getActiveWorkbook()!;
const worksheet = workbook.getActiveSheet()!;

// Export as JSON
const data = worksheet.getRange('A1:D10').getValues();
console.log(JSON.stringify(data));

// Export entire workbook snapshot
const snapshot = workbook.getWorkbook().getSnapshot();
console.log(JSON.stringify(snapshot));
```

## Facade Import Quick Reference

When a method throws `is not a function`, you are missing the corresponding facade side-effect import.

| Class / Feature | Required facade import |
|---|---|
| `FUniver` base methods (`newAPI`, `addEvent`, `createUnit`) | `import '@univerjs/core/facade'` |
| `FWorkbook`, `FWorksheet`, `FRange` base (read/write cells, styles, undo/redo) | `import '@univerjs/sheets/facade'` |
| `FWorksheet` filter methods (`createFilter`, `getFilter`) | `import '@univerjs/sheets-filter/facade'` |
| `FWorksheet` sort methods (`sort`) | `import '@univerjs/sheets-sort/facade'` |
| `FRange` conditional formatting (`setConditionalFormattingRule`) | `import '@univerjs/sheets-conditional-formatting/facade'` |
| `FRange` data validation (`addDataValidation`) | `import '@univerjs/sheets-data-validation/facade'` |
| `FRange` hyperlink (`addHyperlink`, `updateHyperlink`) | `import '@univerjs/sheets-hyper-link/facade'` |
| `FRange` drawing / images (`addDrawing`, `getDrawings`) | `import '@univerjs/sheets-drawing/facade'` |
| `FWorkbook` thread comment | `import '@univerjs/sheets-thread-comment/facade'` |
| `FWorksheet` table (`addTable`) | `import '@univerjs/sheets-table/facade'` |
| `FWorksheet` note (`addNote`) | `import '@univerjs/sheets-note/facade'` |
| `FWorkbook` watermark | `import '@univerjs/watermark/facade'` |
| `FDoc` (document facade) | `import '@univerjs/docs-ui/facade'` |
| Formula API (`calculate`, `setFormula`) | `import '@univerjs/engine-formula/facade'` |
| Network API | `import '@univerjs/network/facade'` |
| `FEnum`, `FHooks`, `FMenuBuilder` | `import '@univerjs/ui/facade'` |
| Formula editor UI facade | `import '@univerjs/sheets-formula-ui/facade'` |

> **Rule of thumb**: If the method belongs to a feature that requires a separate plugin (e.g. `UniverSheetsFilterPlugin`), it almost certainly needs a matching `/facade` import from the same package.

## Common Pitfalls

1. **Forgot side-effect imports** — If `range.setBackground` throws `is not a function`, check whether you missed `import '@univerjs/sheets/facade'`. Use the quick reference table above to find the correct import.
2. **Wrong plugin order** — `UniverSheetsPlugin` must be registered before `UniverSheetsUIPlugin`
3. **Formulas not calculating** — In the browser, you must use Web Worker (`UniverRPCMainThreadPlugin`), or set `{ notExecuteFormula: false }` in `UniverFormulaEnginePlugin` / `UniverSheetsPlugin`
4. **Selection is not FRange** — `FSelection.getActiveRange()` returns `FRange | null`, you need to check for null before using
5. **Undo/redo stack lost** — Directly modifying the underlying model (`Worksheet.setCellValue`) won't enter the undo stack; you must operate through Command/Mutation or Facade API
