# Facade Extension

The Facade API implements mixin extension via the `extend()` static method. This is the primary way Univer plugins expose APIs to developers.

## Extension Pattern

```ts
import { FRange } from '@univerjs/sheets/facade';

// 1. Define extension interface
export interface IFRangeMyMixin {
  myCustomMethod(): string;
}

// 2. Implement mixin class
export class FRangeMyMixin extends FRange implements IFRangeMyMixin {
  myCustomMethod(): string {
    return `Custom data for ${this.getRange().startRow}`;
  }
}

// 3. Register extension
FRange.extend(FRangeMyMixin);

// 4. Type augmentation (let TypeScript know about the new methods)
declare module '@univerjs/sheets/facade' {
  interface FRange extends IFRangeMyMixin {}
}
```

## Extensible Facade Classes

| Class | Package | Typical Extension Scenario |
|-------|---------|---------------------------|
| FUniver | `@univerjs/core/facade` | Global API, cross-unit-type operations |
| FWorkbook | `@univerjs/sheets/facade` | Workbook-level features |
| FWorksheet | `@univerjs/sheets/facade` | Worksheet-level features |
| FRange | `@univerjs/sheets/facade` | Cell range operations |
| FDoc | `@univerjs/core/facade` | Document operations |
| FEventRegistry | `@univerjs/core/facade` | Custom events |

## Registering Initializers with InitializerSymbol

If the extension needs initialization logic executed when each Facade instance is created (e.g. registering event listeners):

```ts
import { FUniver } from '@univerjs/core/facade';

const InitializerSymbol = Symbol('initializers');

class FUniverMyMixin extends FUniver {
  // _initialize is automatically executed on every FUniver instantiation
  static override _initialize(injector: Injector): void {
    // Global initialization can be done here
  }
}

FUniver.extend(FUniverMyMixin);
```

Internally, `extend()` collects `_initialize` methods into an array and calls them sequentially in the `FUniver` constructor.

## Complete Example 1: Add Custom Methods to FWorksheet

```ts
import { FWorksheet } from '@univerjs/sheets/facade';

export interface IFWorksheetMyMixin {
  highlightHeader(color: string): this;
  getDataAsArray(): any[][];
}

export class FWorksheetMyMixin extends FWorksheet implements IFWorksheetMyMixin {
  highlightHeader(color: string): this {
    const maxCol = this.getMaxColumns();
    this.getRange(0, 0, 1, maxCol)
      .setBackground(color)
      .setFontWeight('bold');
    return this;
  }

  getDataAsArray(): any[][] {
    return this.getRange(0, 0, this.getMaxRows(), this.getMaxColumns()).getValues();
  }
}

FWorksheet.extend(FWorksheetMyMixin);

declare module '@univerjs/sheets/facade' {
  interface FWorksheet extends IFWorksheetMyMixin {}
}
```

## Complete Example 2: Extend FRange with Batch Style Methods

```ts
import { FRange } from '@univerjs/sheets/facade';

export interface IFRangeBatchStyleMixin {
  setHeaderStyle(): this;
  setDataStyle(): this;
}

export class FRangeBatchStyleMixin extends FRange implements IFRangeBatchStyleMixin {
  setHeaderStyle(): this {
    return this
      .setBackground('#4472C4')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
  }

  setDataStyle(): this {
    return this
      .setFontSize(11)
      .setFontFamily('Arial')
      .setVerticalAlignment('middle');
  }
}

FRange.extend(FRangeBatchStyleMixin);

declare module '@univerjs/sheets/facade' {
  interface FRange extends IFRangeBatchStyleMixin {}
}
```

## Complete Example 3: Extend FUniver with Global Utility Methods

```ts
import { FUniver } from '@univerjs/core/facade';

export interface IFUniverUtilsMixin {
  exportToCSV(): string;
}

export class FUniverUtilsMixin extends FUniver implements IFUniverUtilsMixin {
  exportToCSV(): string {
    const sheet = this.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return '';
    const values = sheet.getRange(0, 0, sheet.getMaxRows(), sheet.getMaxColumns()).getValues();
    return values.map(row => row.map(cell => {
      const v = cell?.v ?? cell ?? '';
      const s = String(v);
      if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(',')).join('\n');
  }
}

FUniver.extend(FUniverUtilsMixin);

declare module '@univerjs/core/facade' {
  interface FUniver extends IFUniverUtilsMixin {}
}
```

## Complete Example 4: Extend FWorkbook with Batch Worksheet Operations

```ts
import { FWorkbook } from '@univerjs/sheets/facade';

export interface IFWorkbookBatchMixin {
  hideAllSheetsExcept(activeSheet: FWorksheet): this;
}

export class FWorkbookBatchMixin extends FWorkbook implements IFWorkbookBatchMixin {
  hideAllSheetsExcept(activeSheet: FWorksheet): this {
    this.getWorksheets().forEach(sheet => {
      if (sheet.getSheetId() !== activeSheet.getSheetId()) {
        this.hideSheet(sheet);
      }
    });
    this.setActiveSheet(activeSheet);
    return this;
  }
}

FWorkbook.extend(FWorkbookBatchMixin);

declare module '@univerjs/sheets/facade' {
  interface FWorkbook extends IFWorkbookBatchMixin {}
}
```

## Merging Multiple Extensions

If multiple plugins need to extend the same Facade class, you must merge them into a single mixin class, or ensure only one `extend()` call is made:

```ts
// Recommended: merge all extensions in one file
class FRangeCombinedMixin extends FRange
  implements IFRangePluginAMixin, IFRangePluginBMixin {
  // Plugin A methods
  pluginAMethod() { ... }
  // Plugin B methods
  pluginBMethod() { ... }
}

FRange.extend(FRangeCombinedMixin);

declare module '@univerjs/sheets/facade' {
  interface FRange extends IFRangePluginAMixin, IFRangePluginBMixin {}
}
```

## Notes

1. **Mixin classes must inherit from the target Facade class** (e.g. `extends FRange`)
2. **`extend()` can only be called once per target class** — multiple calls will overwrite previous extensions. If you need extensions from multiple sources, merge them into one mixin class
3. **Type declaration `declare module` must be in the global scope** (top level of the module)
4. **`this` in mixin methods can access all protected members of the parent class** (such as `_workbook`, `_worksheet`, `_injector`, `_commandService`)
5. **Do not use constructor parameter injection in extension classes** — mixin instances are created by the Facade base class, and parameters are controlled by the base class
6. **`_initialize` is a static method** — used for global one-time initialization, not an instance method
