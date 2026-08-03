# Event System

## Facade Events (Recommended)

Listen to high-level events via `univerAPI.addEvent()`:

```ts
// Lifecycle
univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, ({ stage }) => {
  if (stage === univerAPI.Enum.LifecycleStages.Steady) {
    // All initialization complete
  }
});

// Command execution
univerAPI.addEvent(univerAPI.Event.CommandExecuted, ({ id, params }) => {
  console.log('Command executed:', id);
});

univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
  console.log('Before command:', event.id);
  // event.cancel = true; // Prevent command execution
});

// Cell value changes (indirectly monitored via underlying commands)
univerAPI.addEvent(univerAPI.Event.CommandExecuted, ({ id, params }) => {
  if (id === SetRangeValuesMutation.id) {
    console.log('Cell values changed:', params);
  }
});
```

Common event names (accessed via `univerAPI.Event`):
- `LifeCycleChanged` — Lifecycle stage changes
- `BeforeCommandExecute` — Before command execution
- `CommandExecuted` — After command execution
- `DocCreated` / `DocDisposed` — Document created/destroyed
- `SheetCreated` / `SheetDisposed` — Worksheet created/destroyed
- `WorkbookCreated` / `WorkbookDisposed` — Workbook created/destroyed

## FSheetHooks

Sheet-specific lifecycle hooks:

```ts
import { FSheetHooks } from '@univerjs/sheets/facade';

// Get hooks for the current worksheet
const hooks = univerAPI.getActiveWorkbook()!.getActiveSheet()!.getHooks();

hooks.onCellChange((cell, workbook, worksheet) => {
  console.log('Cell changed:', cell);
});

hooks.onRowInsert((rowIndex, count, workbook, worksheet) => {
  console.log('Row inserted:', rowIndex, count);
});

hooks.onColumnInsert((colIndex, count, workbook, worksheet) => {
  console.log('Column inserted:', colIndex, count);
});
```

## Custom Events

Plugins can emit custom events for Facade consumption:

```ts
// Inside plugin
import { IEventService } from '@univerjs/core';

const eventService = accessor.get(IEventService);
eventService.fireEvent('MyCustomEvent', { data: 42 });

// Facade side
univerAPI.addEvent('MyCustomEvent', (params) => {
  console.log(params.data);
});
```

## Underlying RxJS Streams

If you need finer-grained control, subscribe to underlying services directly:

```ts
import { ICommandService } from '@univerjs/core';

const commandService = accessor.get(ICommandService);
commandService.onCommandExecuted((commandInfo) => {
  console.log(commandInfo);
});
```

## Event Cleanup

`addEvent` returns `IDisposable`. You must call dispose or use the `Disposable` pattern:

```ts
const disposable = univerAPI.addEvent(univerAPI.Event.CommandExecuted, handler);
disposable.dispose(); // Manual removal

// Or use in a plugin
this.disposeWithMe(univerAPI.addEvent(...));
```
