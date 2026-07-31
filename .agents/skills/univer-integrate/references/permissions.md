# Permission System

Univer's open-source edition provides workbook/worksheet/range three-level permission control, as well as role-based permission modes.

## Three-Level Permission Objects

| Level | How to Obtain | Typical Use |
|-------|---------------|-------------|
| Workbook | `workbook.getWorkbookPermission()` → `FWorkbookPermission` | Global read-only / edit, print, export |
| Worksheet | `worksheet.getWorksheetPermission()` → `FWorksheetPermission` | Sheet protection, row/column insert/delete permissions |
| Range | `worksheet.getWorksheetPermission().protectRanges(...)` | Lock specific cell ranges |

## Workbook Permissions

```ts
const workbook = univerAPI.getActiveWorkbook()!;
const permission = workbook.getWorkbookPermission();

// Set by role (one-click setting of multiple permission points)
await permission.setMode('owner');   // Owner: all permissions
await permission.setMode('editor');  // Editor: edit + view + print + export
await permission.setMode('viewer');  // Viewer: view only
await permission.setMode('commenter'); // Commenter: view + comment

// Shortcuts
await permission.setEditable();   // Equivalent to setMode('editor')
await permission.setReadOnly();   // Equivalent to setMode('viewer')

// Fine-grained control of individual permission points
await permission.setPoint(univerAPI.Enum.WorkbookPermissionPoint.Edit, false);
await permission.setPoint(univerAPI.Enum.WorkbookPermissionPoint.Print, true);
```

### Workbook Permission Points

Accessed via `univerAPI.Enum.WorkbookPermissionPoint`:

- `Edit` — Edit workbook
- `View` — View workbook
- `Print` — Print
- `Export` — Export
- `Copy` — Copy content

## Worksheet Permissions

```ts
const sheet = workbook.getActiveSheet()!;
const permission = sheet.getWorksheetPermission();

// Check if protected
if (permission.isProtected()) {
  console.log('Sheet is protected');
}

// Protect worksheet (set password and options)
await permission.protect({
  password: '123456',
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
  formatColumns: false,
  formatRows: false,
  insertColumns: false,
  insertRows: false,
  insertHyperlinks: false,
  deleteColumns: false,
  deleteRows: false,
  sort: false,
  useAutoFilter: true,
  usePivotTable: false,
  editObjects: false,
  editScenarios: false,
});

// Unprotect
await permission.unprotect('123456');

// Set by role
await permission.setMode('editable');   // Editable
await permission.setMode('readOnly');   // Read-only

// Shortcuts
await permission.setEditable();
await permission.setReadOnly();

// Fine-grained control
await permission.setPoint(univerAPI.Enum.WorksheetPermissionPoint.InsertRow, false);
await permission.setPoint(univerAPI.Enum.WorksheetPermissionPoint.DeleteColumn, false);
```

### Worksheet Permission Points

Accessed via `univerAPI.Enum.WorksheetPermissionPoint`:

- `Edit` — Edit cells
- `View` — View worksheet
- `InsertRow` / `InsertColumn` — Insert rows/columns
- `DeleteRow` / `DeleteColumn` — Delete rows/columns
- `SetCellStyle` — Set cell style
- `SetRowStyle` / `SetColumnStyle` — Set row/column style
- `Sort` — Sort
- `Filter` — Filter
- `UseAutoFilter` — Use auto filter
- `FormatCells` — Format cells
- `FormatColumns` / `FormatRows` — Format rows/columns
- `InsertHyperlink` — Insert hyperlink
- `EditObject` — Edit object
- `SelectLockedCells` / `SelectUnlockedCells` — Selection permissions

## Range Permissions (Range Protection)

Lock specific cell ranges, allowing different users to have different permissions:

```ts
const sheet = workbook.getActiveSheet()!;
const permission = sheet.getWorksheetPermission();

// Protect ranges
const rules = await permission.protectRanges([
  {
    ranges: [
      { startRow: 0, endRow: 0, startColumn: 0, endColumn: 10 }, // Row 1
      { startRow: 0, endRow: 100, startColumn: 0, endColumn: 0 }, // Column A
    ],
    options: {
      allowEdit: false,
      allowViewByOthers: true,
    },
  },
  {
    ranges: [{ startRow: 1, endRow: 10, startColumn: 1, endColumn: 5 }],
    options: {
      allowEdit: true, // This range allows editing
    },
  },
]);

// List all range protection rules
const list = await permission.listRangeProtectionRules();
for (const rule of list) {
  console.log(rule.getId(), rule.getRanges());
}

// Remove range protection
await permission.unprotectRules([rules[0].getId()]);

// Debug: check permission status of a cell
const cellPermission = await permission.debugCellPermission(2, 3);
console.log(cellPermission);
```

### FRangeProtectionRule API

```ts
const rule = list[0];
rule.getId(): string
rule.getRanges(): IRange[]
rule.getUnitId(): string
rule.getSubUnitId(): string
rule.setPoint(point, value): Promise<void>
rule.getPermissionDefinitions(): IPermissionDefinition[]
```

## Collaborator Management (Workbook Level)

> Note: Collaborator management depends on `IAuthzIoService` (permission IO service) at the underlying layer. The open-source edition provides the interface but no default implementation; you need to integrate your own backend permission system, or implement a local mock of `IAuthzIoService`.

```ts
// Simple example: local mock (when no backend)
import { IAuthzIoService } from '@univerjs/core';

class LocalAuthzIoService implements IAuthzIoService {
  async putCollaborators() {}
  async deleteCollaborators() {}
  async listCollaborators() { return []; }
  async verify() { return true; }
}

univer.__getInjector().add([IAuthzIoService, { useClass: LocalAuthzIoService }]);

// Collaborator API
const permission = workbook.getWorkbookPermission();

await permission.addCollaborator(
  { userID: 'user-1', name: 'Alice' },
  univerAPI.Enum.UnitRole.Editor
);

await permission.updateCollaborator(
  { userID: 'user-1', name: 'Alice' },
  univerAPI.Enum.UnitRole.Viewer
);

await permission.removeCollaborator('user-1');
await permission.removeCollaborators(['user-1', 'user-2']);

const collaborators = await permission.listCollaborators();
console.log(collaborators);

await permission.setCollaborators([
  { user: { userID: 'user-1', name: 'Alice' }, role: univerAPI.Enum.UnitRole.Editor },
  { user: { userID: 'user-2', name: 'Bob' }, role: univerAPI.Enum.UnitRole.Viewer },
]);
```

### Role Enum

Accessed via `univerAPI.Enum.UnitRole`:

- `Owner` — Owner
- `Editor` — Editor
- `Viewer` — Viewer
- `Commenter` — Commenter

## Custom Permission Points (Plugin Development)

Plugins can register custom permission points:

```ts
import { IPermissionService, PermissionService } from '@univerjs/core';

// Define permission point
const MY_PERMISSION_ID = 'my-plugin.permission.custom-action';

// Register
permissionService.addPermissionPoint({
  id: MY_PERMISSION_ID,
  value: true, // Allow by default
});

// Check permission
const point = permissionService.getPermissionPoint(MY_PERMISSION_ID);
if (point.value) {
  // Allowed to execute
}

// Listen for permission changes
permissionService.getPermissionPoint$(MY_PERMISSION_ID).subscribe((point) => {
  console.log('Permission changed:', point.value);
});

// Update permission
permissionService.updatePermissionPoint(MY_PERMISSION_ID, false);
```

### Disable Menu in UI Based on Permission

```ts
import { getCurrentRangeDisable$ } from '@univerjs/sheets';

const disabled$ = getCurrentRangeDisable$(accessor, {
  workbookTypes: [WorkbookEditablePermission],
  worksheetTypes: [WorksheetEditPermission, WorksheetSetCellStylePermission],
  rangeTypes: [RangeProtectionPermissionEditPoint],
});

this._menuService.mergeMenu({
  [RibbonOthersGroup.OTHERS]: {
    ['my-button']: {
      order: 10,
      menuItemFactory: () => ({
        id: 'my-button',
        title: 'My Action',
        type: MenuItemType.BUTTON,
        disabled$,
      }),
    },
  },
});
```

## Common Permission Combinations

### Read-Only Workbook

```ts
await workbook.getWorkbookPermission().setMode('viewer');
```

### Protect Formula Cells

```ts
// 1. Protect entire sheet
await sheet.getWorksheetPermission().protect({
  password: '123',
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
});

// 2. Set data entry areas to unlocked
sheet.getRange('B2:D10').setLocked(false);

// 3. Formula areas remain locked (default is locked)
// Formula areas = A1, E1:H10 etc.
```

### Different Permissions for Multiple Users

```ts
// Workbook set to read-only
await workbook.getWorkbookPermission().setMode('viewer');

// But certain worksheets allow editing
for (const sheet of workbook.getWorksheets()) {
  if (sheet.getName() === 'EditableSheet') {
    await sheet.getWorksheetPermission().setEditable();
  }
}
```
