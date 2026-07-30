# Common Tasks Quick Reference

## 1. Initialize and Create a Workbook

```ts
import { LocaleType, mergeLocales, Univer, UniverInstanceType } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import DesignEnUS from '@univerjs/design/locale/en-US';
import SheetsEnUS from '@univerjs/sheets/locale/en-US';
import UIEnUS from '@univerjs/ui/locale/en-US';

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(DesignEnUS, UIEnUS, SheetsEnUS),
  },
});

// Register plugins...

const unitId = univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
  id: 'workbook-1',
  name: 'My Workbook',
  sheetOrder: ['sheet-1'],
  sheets: {
    'sheet-1': {
      id: 'sheet-1',
      name: 'Sheet1',
      rowCount: 1000,
      columnCount: 100,
      cellData: {
        0: {
          0: { v: 'Hello' },
          1: { v: 'World' },
        },
      },
    },
  },
});

const univerAPI = FUniver.newAPI(univer);
```

## 2. Load Existing Data (JSON Deserialization)

```ts
import type { IWorkbookData } from '@univerjs/core';

const snapshot: IWorkbookData = JSON.parse(savedJson);
univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot);
```

## 3. Save Workbook Data

```ts
const workbook = univerAPI.getActiveWorkbook()!;
const snapshot = workbook.getWorkbook().getSnapshot();
const json = JSON.stringify(snapshot);
localStorage.setItem('my-workbook', json);
```

## 4. Batch Write Data (Best Performance)

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;

// Method 1: setValues (recommended for small data)
sheet.getRange('A1:D10').setValues([
  ['A', 'B', 'C', 'D'],
  [1, 2, 3, 4],
  // ...
]);

// Method 2: Write via IWorkbookData during initialization (recommended for large data)
// Avoid calling Facade API cell-by-cell
```

## 5. Set Number Format

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;

// Currency
sheet.getRange('B2:B100').setNumberFormat('$#,##0.00');

// Percentage
sheet.getRange('C2:C100').setNumberFormat('0.00%');

// Date
sheet.getRange('D2:D100').setNumberFormat('yyyy-mm-dd');

// Custom
sheet.getRange('E2:E100').setNumberFormat('[Red]#,##0;[Green]-#,##0');
```

Common format codes:
- `#,##0` — Thousand-separated integer
- `#,##0.00` — Two decimal places
- `0.00%` — Percentage
- `$#,##0.00` — Currency
- `yyyy-mm-dd hh:mm:ss` — Date and time
- `yyyy-mm-dd` — ISO date format

## 6. Set Column Width and Row Height

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;

// Single column
sheet.setColumnWidth(0, 120);  // Column A 120px
sheet.setRowHeight(0, 30);     // Row 1 30px

// Via FRange
sheet.getRange('A1:D1').setRowHeight(40);
// FRange does not have direct setColumnWidth, set column by column
```

## 7. Copy and Paste

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
const source = sheet.getRange('A1:D10');
const target = sheet.getRange('F1');

source.copyTo(target);
source.copyTo(target, PasteType.VALUES_ONLY);  // Values only
source.copyTo(target, PasteType.FORMAT_ONLY);  // Format only
```

PasteType enum:
- `PasteType.ALL` — All
- `PasteType.VALUES_ONLY` — Values only
- `PasteType.FORMAT_ONLY` — Format only
- `PasteType.FORMULA_ONLY` — Formula only
- `PasteType.TRANSPOSE` — Transpose

## 8. Find and Replace

```ts
import { FindReplaceController } from '@univerjs/sheets-find-replace';

const controller = accessor.get(FindReplaceController);
controller.findNext('searchText');
controller.replace('replacement');
controller.replaceAll('searchText', 'replacement');
```

Facade side:

```ts
univerAPI.addEvent(univerAPI.Event.CommandExecuted, ({ id, params }) => {
  if (id === 'sheets.command.find-replace') {
    // handle find/replace
  }
});
```

## 9. Print

**Open source**: Use the browser's Print API or `html2canvas` + `jsPDF`.

```ts
// Browser print (prints the entire page; target a specific container for better results)
window.print();

// Or capture the Univer container with html2canvas, then export to PDF
// npm install html2canvas jspdf
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const element = document.getElementById('univer-container')!;
const canvas = await html2canvas(element);
const imgData = canvas.toDataURL('image/png');
const pdf = new jsPDF('l', 'mm', 'a4');
pdf.addImage(imgData, 'PNG', 0, 0, 297, 210);
pdf.save('sheet.pdf');
```

**Univer Pro** provides built-in print / PDF export.

## 10. Set Theme and Dark Mode

```ts
import { defaultTheme } from '@univerjs/themes';
import { ThemeSwitcherService } from '@univerjs/ui';

// During initialization
const univer = new Univer({
  theme: defaultTheme,
  darkMode: true,
});

// Switch at runtime
const themeService = univer.__getInjector().get(ThemeService);
themeService.setDarkMode(true);
```

## 11. Language Switching

Import locale files from each package's `/locale/` subpath and merge them with `mergeLocales`:

```ts
import { LocaleType, mergeLocales } from '@univerjs/core';
import DesignEnUS from '@univerjs/design/locale/en-US';
import DesignZhCN from '@univerjs/design/locale/zh-CN';
import UIEnUS from '@univerjs/ui/locale/en-US';
import UIZhCN from '@univerjs/ui/locale/zh-CN';
import SheetsEnUS from '@univerjs/sheets/locale/en-US';
import SheetsZhCN from '@univerjs/sheets/locale/zh-CN';

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(DesignEnUS, UIEnUS, SheetsEnUS),
    [LocaleType.ZH_CN]: mergeLocales(DesignZhCN, UIZhCN, SheetsZhCN),
  },
});

// Switch at runtime
import { LocaleService } from '@univerjs/core';
const localeService = univer.__getInjector().get(LocaleService);
localeService.setLocale(LocaleType.ZH_CN);
```

## 12. Set Current User

```ts
import { UserManagerService } from '@univerjs/core';

const injector = univer.__getInjector();
const userManager = injector.get(UserManagerService);
userManager.setCurrentUser({
  userID: 'user-1',
  name: 'Alice',
  avatar: 'https://...',
  anonymous: false,
});
```

## 13. Read-Only Mode

```ts
const workbook = univerAPI.getActiveWorkbook()!;
workbook.setEditable(false);

const sheet = workbook.getActiveSheet()!;
sheet.setEditable(false);

const range = sheet.getRange('A1:D10');
range.setEditable(false);
```

## 14. Insert Hyperlink

```ts
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
sheet.getRange('A1').setHyperlink('https://example.com', 'Click here');

// Remove
sheet.getRange('A1').removeHyperlink();
```

## 15. Rich Text Cell

```ts
const rt = univerAPI.newRichText()
  .insertText('Hello ')
  .setTextStyle(univerAPI.newTextStyle({ ff: 'Arial', fs: 14, bl: univerAPI.Enum.BooleanNumber.TRUE }))
  .insertText('World')
  .setTextStyle(univerAPI.newTextStyle({ ff: 'Arial', fs: 14, it: univerAPI.Enum.BooleanNumber.TRUE, cl: { rgb: '#FF0000' } }));

sheet.getRange('A1').setValue(rt);
```

## 16. Listen for Workbook Changes and Auto-Save

```ts
let saveTimer: ReturnType<typeof setTimeout>;

univerAPI.addEvent(univerAPI.Event.CommandExecuted, ({ id }) => {
  if (id === SetRangeValuesMutation.id || id === InsertRowMutation.id) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const snapshot = univerAPI.getActiveWorkbook()!.getWorkbook().getSnapshot();
      fetch('/api/save', {
        method: 'POST',
        body: JSON.stringify(snapshot),
      });
    }, 1000);
  }
});
```

## 17. Import Data from CSV

```ts
async function importCSV(csvText: string) {
  const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
  const rows = csvText.split(/\r?\n/);
  const data = rows.map(row => row.split(','));

  const maxCols = data.reduce((max, row) => Math.max(max, row.length), 0);
  sheet.setRowCount(Math.max(data.length, sheet.getMaxRows()));
  sheet.setColumnCount(Math.max(maxCols, sheet.getMaxColumns()));

  sheet.getRange(0, 0, data.length, maxCols).setValues(data);
}
```

## 18. Export as CSV

```ts
function exportCSV() {
  const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
  const values = sheet.getRange(0, 0, sheet.getMaxRows(), sheet.getMaxColumns()).getValues();
  return values.map(row => row.map(cell => {
    const v = cell?.v ?? cell ?? '';
    // Escape quotes and wrap in quotes if contains comma
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(',')).join('\n');
}
```

## 19. Custom Fonts

```ts
// During initialization
[UniverUIPlugin, {
  container: 'app',
  customFontFamily: {
    list: [
      { value: 'Inter', label: 'Inter', category: 'sans-serif' },
      { value: 'Fira Code', label: 'Fira Code', category: 'monospace' },
    ],
    override: false, // true = only display fonts in the list
  },
}]

// Add at runtime
univerAPI.addFonts([
  { value: 'CustomFont', label: 'Custom', category: 'sans-serif' },
]);
```

## 20. Destroy and Rebuild

```ts
// Destroy
univer.dispose();
worker?.terminate();
window.univerAPI = undefined;

// Recreate (note: a brand new DOM container is required)
const newUniver = new Univer({ ... });
```

## 21. Large Dataset Handling

Univer's Canvas rendering engine uses **viewport-based clipping** — only cells inside the visible area are drawn. Scrolling performance is therefore not the bottleneck for large datasets. The real constraint is **data-model memory**: all cell data in `IWorkbookData` resides in memory, and large JSON snapshots slow down initialization and serialization.

### Pre-populate via IWorkbookData (fastest)

Instead of calling `setValue()` in a loop, construct the data object upfront:

```ts
const rows: Record<number, IObjectMatrixPrimitiveType<ICellData>> = {};
for (let r = 0; r < 50000; r++) {
  rows[r] = {};
  for (let c = 0; c < 20; c++) {
    rows[r][c] = { v: r * 100 + c };
  }
}

const workbookData: IWorkbookData = {
  id: 'large-workbook',
  name: 'Large Dataset',
  sheetOrder: ['sheet-1'],
  sheets: {
    'sheet-1': {
      id: 'sheet-1',
      name: 'Data',
      rowCount: 50000,
      columnCount: 20,
      cellData: rows,
    },
  },
};

univer.createUnit(UniverInstanceType.UNIVER_SHEET, workbookData);
```

### Batch writes via Facade API

If you must write after initialization, batch operations to reduce mutations:

```ts
// ❌ Slow: triggers mutation for every cell
for (let r = 0; r < 1000; r++) {
  sheet.getRange(r, 0).setValue(r); // 1000 mutations
}

// ✅ Fast: single mutation for the whole range
const values: (string | number)[][] = [];
for (let r = 0; r < 1000; r++) {
  values.push([r, r + 1, r + 2]);
}
sheet.getRange(0, 0, 1000, 3).setValues(values);
```

### Server-side data slicing

For datasets larger than memory can hold, load only the viewport window from the server and replace `IWorkbookData` on demand:

```ts
async function loadViewportWindow(startRow: number, rowCount: number) {
  const data = await fetch(`/api/data?start=${startRow}&count=${rowCount}`);
  const workbookData = await data.json();
  // Replace the active sheet's data
  const workbook = univerAPI.getActiveWorkbook()!;
  const sheet = workbook.getActiveSheet();
  // Clear and repopulate via batch setValues
  sheet.getRange(startRow, 0, rowCount, sheet.getMaxColumns()).setValues(workbookData);
}
```

### Performance monitoring

Enable the debugger plugin to monitor FPS and memory during load:

```ts
import { UniverDebuggerPlugin } from '@univerjs/debugger';

univer.registerPlugin(UniverDebuggerPlugin, {
  performanceMonitor: { enabled: true },
});
```

Key limits (open-source v0.21.x):
- **Rendering**: Viewport-clipped Canvas drawing handles scrolling smoothly even for millions of rows
- **Memory**: All cell data lives in `IWorkbookData` client-side; 100k+ rows × many columns can exceed available RAM
- **Serialization**: `workbook.save()` stringifies the entire snapshot; large workbooks produce huge JSON
- For 100k+ rows, use server-side aggregation, lazy loading, or split into multiple workbooks
