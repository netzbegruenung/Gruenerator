# Univer Command System

Univer uses a three-layer command model: Command → Mutation / Operation.

## CommandType Enum

```ts
enum CommandType {
  COMMAND = 0,   // Business logic entry, orchestrates Mutation/Operation
  MUTATION = 1,  // Data changes, persisted to snapshot, supports undo
  OPERATION = 2, // UI state changes, not persisted, no undo support
}
```

## COMMAND

Responsible for creating and executing Mutations and Operations based on business logic. For example, a "delete row" command generates:
- A Mutation to delete the row
- An undo Mutation to insert the row
- A Mutation to set cell contents

```ts
import type { ICommand, IAccessor } from '@univerjs/core';
import { CommandType, ICommandService } from '@univerjs/core';
import { SetRangeValuesMutation } from '@univerjs/sheets';

export interface IMyCommandParams {
  unitId: string;
  subUnitId: string;
  range: IRange;
  value: ICellData;
}

export const MyCommand: ICommand<IMyCommandParams> = {
  id: 'my.command.id',
  type: CommandType.COMMAND,
  handler: (accessor: IAccessor, params: IMyCommandParams) => {
    const commandService = accessor.get(ICommandService);

    // Execute business logic, typically dispatch a Mutation
    const result = commandService.executeCommand(SetRangeValuesMutation.id, {
      unitId: params.unitId,
      subUnitId: params.subUnitId,
      range: params.range,
      value: params.value,
    });

    return result.result;
  },
};
```

## MUTATION

Atomic operations that directly modify the data model. All Mutations are recorded in the undo/redo stack.

```ts
import type { IMutation, IAccessor } from '@univerjs/core';
import { CommandType, IUniverInstanceService, UniverInstanceType } from '@univerjs/core';
import type { Workbook } from '@univerjs/core';

export interface IMyMutationParams {
  unitId: string;
  subUnitId: string;
  rowIndex: number;
  color: string;
}

export const MyMutation: IMutation<IMyMutationParams> = {
  id: 'my.mutation.id',
  type: CommandType.MUTATION,
  handler: (accessor: IAccessor, params: IMyMutationParams) => {
    const instanceService = accessor.get(IUniverInstanceService);
    const workbook = instanceService.getUnit<Workbook>(
      params.unitId,
      UniverInstanceType.UNIVER_SHEET
    );
    if (!workbook) return false;

    const worksheet = workbook.getSheetBySheetId(params.subUnitId);
    if (!worksheet) return false;

    // Directly modify the model
    const rowData = worksheet.getRowData(params.rowIndex);
    if (rowData) {
      rowData.hd = BooleanNumber.FALSE; // ensure row is visible
      // ... modify model
    }

    return true;
  },
};
```

## OPERATION

Modifies state that is not saved to the document snapshot, such as scroll position, sidebar state, selection, etc.

```ts
import type { ICommand, IAccessor } from '@univerjs/core';
import { CommandType } from '@univerjs/core';

export interface IMyOperationParams {
  unitId: string;
  scrollX: number;
  scrollY: number;
}

export const MyOperation: ICommand<IMyOperationParams> = {
  id: 'my.operation.id',
  type: CommandType.OPERATION,
  handler: (accessor: IAccessor, params: IMyOperationParams) => {
    // Modify UI state, e.g. scroll position
    const scrollService = accessor.get(IScrollManagerService);
    scrollService.setScroll(params.unitId, { scrollX: params.scrollX, scrollY: params.scrollY });
    return true;
  },
};
```

## Complete Example: COMMAND with Undo/Redo

Below is a complete "set row background color" command with undo support:

```ts
import type { ICommand, IAccessor, IMutationInfo } from '@univerjs/core';
import {
  CommandType,
  ICommandService,
  IUndoRedoService,
  IUniverInstanceService,
  sequenceExecute,
  UniverInstanceType,
} from '@univerjs/core';
import type { Workbook } from '@univerjs/core';
import {
  SetRangeValuesMutation,
  SetRangeValuesUndoMutationFactory,
} from '@univerjs/sheets';

export interface ISetRowBackgroundParams {
  unitId: string;
  subUnitId: string;
  rowIndex: number;
  color: string;
}

export const SetRowBackgroundCommand: ICommand<ISetRowBackgroundParams> = {
  id: 'custom.command.set-row-background',
  type: CommandType.COMMAND,

  handler: (accessor: IAccessor, params: ISetRowBackgroundParams) => {
    const commandService = accessor.get(ICommandService);
    const undoRedoService = accessor.get(IUndoRedoService);
    const instanceService = accessor.get(IUniverInstanceService);

    const workbook = instanceService.getUnit<Workbook>(
      params.unitId,
      UniverInstanceType.UNIVER_SHEET
    );
    if (!workbook) return false;

    const worksheet = workbook.getSheetBySheetId(params.subUnitId);
    if (!worksheet) return false;

    const maxCol = worksheet.getColumnCount();
    const range: IRange = {
      startRow: params.rowIndex,
      endRow: params.rowIndex,
      startColumn: 0,
      endColumn: maxCol - 1,
    };

    // Construct new cellValue object
    const cellValue: IObjectMatrixPrimitiveType<ICellData> = {};
    for (let c = 0; c < maxCol; c++) {
      if (!cellValue[c]) cellValue[c] = {};
      cellValue[c][params.rowIndex] = { s: { bg: { rgb: params.color } } };
    }

    const redoParams: ISetRangeValuesMutationParams = {
      unitId: params.unitId,
      subUnitId: params.subUnitId,
      cellValue,
      range,
    };

    // Generate undo parameters
    const undoParams: ISetRangeValuesMutationParams = SetRangeValuesUndoMutationFactory(
      accessor,
      redoParams
    );

    const redoMutations: IMutationInfo[] = [
      { id: SetRangeValuesMutation.id, params: redoParams },
    ];
    const undoMutations: IMutationInfo[] = [
      { id: SetRangeValuesMutation.id, params: undoParams },
    ];

    const result = sequenceExecute(redoMutations, commandService);

    if (result.result) {
      undoRedoService.pushUndoRedo({
        unitID: params.unitId,
        undoMutations,
        redoMutations,
      });
      return true;
    }

    return false;
  },
};
```

Key points:
- `sequenceExecute` executes multiple Mutations in sequence
- `SetRangeValuesUndoMutationFactory` is a built-in Univer factory that automatically generates the undo state
- `undoRedoService.pushUndoRedo` pushes the operation onto the stack
- The order of undoMutations must be the **opposite** of redoMutations

## Registering Commands

```ts
override onStarting() {
  this.disposeWithMe(this._commandService.registerCommand(MyCommand));
  this.disposeWithMe(this._commandService.registerCommand(MyMutation));
  this.disposeWithMe(this._commandService.registerCommand(SetRowBackgroundCommand));
}
```

## Executing Commands

```ts
commandService.executeCommand('custom.command.set-row-background', {
  unitId: workbook.id,
  subUnitId: worksheet.getSheetId(),
  rowIndex: 2,
  color: '#FFFF00',
});
```

## Listening to Command Execution

```ts
univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
  console.log(event.id, event.params);
});

univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
  // event.cancel = true to prevent
});
```

## Executing Built-in Commands from a Plugin

The examples above show executing a custom command by its string ID. In real-world plugins and controllers, you more often need to invoke **built-in** commands (mutations or operations) that are exported by `@univerjs/*` packages.

### Inject `ICommandService`

Inside a plugin, controller, or service, inject `ICommandService` via the constructor:

```ts
import { ICommandService } from '@univerjs/core';
import { SetRangeValuesMutation } from '@univerjs/sheets';
import { ScrollCommand } from '@univerjs/sheets-ui';

class MyController extends Disposable {
  constructor(
    @Inject(ICommandService) private readonly _commandService: ICommandService,
  ) {
    super();
  }

  updateCellValue(unitId: string, subUnitId: string, row: number, col: number, value: ICellData) {
    const result = this._commandService.executeCommand(SetRangeValuesMutation.id, {
      unitId,
      subUnitId,
      cellValue: { [row]: { [col]: value } },
    });

    if (!result.result) {
      console.warn('Failed to set cell value');
    }
  }

  scrollTo(offsetX: number, offsetY: number) {
    this._commandService.executeCommand(ScrollCommand.id, { offsetX, offsetY });
  }
}
```

Key points:
- Import the **command/mutation class** from its package, then use `.id`
- Never hard-code the string ID — always reference the exported constant
- `ICommandService` is available as soon as the plugin reaches `onStarting()`

### Where Built-in Command IDs Live

| Package | Common Exports |
|---|---|
| `@univerjs/core` | `UndoCommand.id`, `RedoCommand.id` |
| `@univerjs/sheets` | `SetRangeValuesMutation.id`, `InsertRowMutation.id`, `RemoveRowMutation.id`, `InsertColumnMutation.id`, `RemoveColumnMutation.id`, `AddWorksheetMergeMutation.id`, `SetWorksheetRowCountMutation.id` ... |
| `@univerjs/sheets-ui` | `ScrollCommand.id`, `SetZoomRatioCommand.id`, `SetFrozenCommand.id`, `MoveRangeCommand.id`, `ApplyFormatPainterCommand.id` ... |
| `@univerjs/sheets-filter` | `SetSheetsFilterCriteriaMutation.id` |
| `@univerjs/sheets-sort` | `SortRangeCommand.id` |
| `@univerjs/sheets-data-validation` | `AddDataValidationMutation.id`, `RemoveDataValidationMutation.id` |
| `@univerjs/sheets-conditional-formatting` | `AddConditionalRuleMutation.id`, `SetConditionalRuleMutation.id` |
| `@univerjs/docs` | `RichTextEditingMutation.id` |

---

## Filtering Command Listeners

The global `CommandExecuted` event fires for **every** command. In practice you usually care about a specific subset.

### Filter inside the event handler

```ts
import { SetRangeValuesMutation } from '@univerjs/sheets';

univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
  if (event.id === SetRangeValuesMutation.id) {
    console.log('Cell value changed:', event.params);
  }
});
```

### Filter using `ICommandService` directly (plugin/controller)

When you need more control (e.g. access to `options` or earlier lifecycle), subscribe to the RxJS-style observable:

```ts
import { ICommandService } from '@univerjs/core';
import { SetRangeValuesMutation } from '@univerjs/sheets';

class MyController extends Disposable {
  constructor(@Inject(ICommandService) private _commandService: ICommandService) {
    super();

    // Listen only to SetRangeValuesMutation
    const disposable = this._commandService.onCommandExecuted((commandInfo) => {
      if (commandInfo.id === SetRangeValuesMutation.id) {
        this.handleCellChange(commandInfo.params);
      }
    });

    // MUST dispose when the plugin is destroyed
    this.disposeWithMe(disposable);
  }
}
```

---

## Dispose Lifecycle for Command Listeners

Command listeners registered via `ICommandService` return an `IDisposable`. **Always** pair them with `disposeWithMe` inside a `Disposable` subclass (plugin, controller, or service) so they are cleaned up automatically when the unit unmounts.

```ts
import { Disposable, ICommandService } from '@univerjs/core';

class MyPlugin extends Plugin {
  constructor(
    @Inject(Injector) protected readonly _injector: Injector,
    @ICommandService private readonly _commandService: ICommandService,
  ) {
    super('my.plugin');
  }

  override onStarting(): void {
    // 1. Register custom commands
    this.disposeWithMe(this._commandService.registerCommand(MyCommand));
    this.disposeWithMe(this._commandService.registerCommand(MyMutation));

    // 2. Register listeners
    this.disposeWithMe(
      this._commandService.onCommandExecuted((cmd) => {
        console.log('[Executed]', cmd.id);
      })
    );

    this.disposeWithMe(
      this._commandService.beforeCommandExecuted((cmd) => {
        if (cmd.id === SomeDangerousCommand.id) {
          console.warn('Blocking dangerous command');
          // Note: beforeCommandExecuted cannot be cancelled via return value.
          // Use univerAPI.Event.BeforeCommandExecute if you need cancellation.
        }
      })
    );
  }
}
```

Anti-pattern — **do NOT** forget to dispose:

```ts
// ❌ Bad: listener leaks when the plugin is destroyed
this._commandService.onCommandExecuted(() => { ... });

// ✅ Good: auto-cleanup on plugin dispose
this.disposeWithMe(this._commandService.onCommandExecuted(() => { ... }));
```

---

## executeCommand Return Value

`executeCommand` returns a `Promise<boolean>` by default (or `boolean` for the synchronous `syncExecuteCommand`):

```ts
// Async (most commands)
const result = await this._commandService.executeCommand(SetRangeValuesMutation.id, params);
if (!result) {
  // The command was rejected (e.g. permission denied, invalid params)
  return false;
}

// Sync (mutations are usually sync)
const result = this._commandService.syncExecuteCommand(SetRangeValuesMutation.id, params);
```

> **Note**: The generic return type can be customized if the command handler returns a non-boolean value, but the vast majority of built-in commands return `boolean` to indicate success/failure.

---

## Common Mutation Factory Functions

Univer provides undo factories for many built-in Mutations:

| Mutation | Undo Factory |
|----------|-------------|
| `SetRangeValuesMutation` | `SetRangeValuesUndoMutationFactory` |
| `SetWorksheetRowCountMutation` | `SetWorksheetRowCountUndoMutationFactory` |
| `SetWorksheetColumnCountMutation` | `SetWorksheetColumnCountUndoMutationFactory` |
| `InsertRowMutation` | `InsertRowUndoMutationFactory` |
| `InsertColumnMutation` | `InsertColumnUndoMutationFactory` |
| `RemoveRowMutation` | `RemoveRowUndoMutationFactory` |
| `RemoveColumnMutation` | `RemoveColumnUndoMutationFactory` |
| `AddWorksheetMergeMutation` | `AddWorksheetMergeUndoMutationFactory` |
| `RemoveWorksheetMergeMutation` | `RemoveWorksheetMergeUndoMutationFactory` |

Usage pattern:

```ts
const undoParams = SetRangeValuesUndoMutationFactory(accessor, redoParams);
```

## Custom Mutation Undo Strategy

If there is no built-in factory, you need to manually save the old state:

```ts
// 1. Read old values
const oldValues: IObjectMatrixPrimitiveType<ICellData> = {};
for (let r = range.startRow; r <= range.endRow; r++) {
  for (let c = range.startColumn; c <= range.endColumn; c++) {
    const cell = worksheet.getCell(r, c);
    if (!oldValues[r]) oldValues[r] = {};
    oldValues[r][c] = cell || {};
  }
}

// 2. redo: write new values
const redoParams = { unitId, subUnitId, cellValue: newValues };
// 3. undo: write back old values
const undoParams = { unitId, subUnitId, cellValue: oldValues };
```
