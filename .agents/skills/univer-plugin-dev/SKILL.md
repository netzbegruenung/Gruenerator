---
name: univer-plugin-dev
description: Develop custom plugins for Univer (spreadsheet/document/presentation engine). Use when writing a plugin, registering commands/mutations/operations, extending Facade API classes (FUniver, FWorkbook, FWorksheet, FRange), adding toolbar buttons or context menus, binding shortcuts, or listening to workbook/sheet/cell events. Triggers include 'write a plugin', 'custom command', 'extend FRange', 'toolbar button', 'shortcut', 'menu item', 'Facade extension', or any plugin development error.
---

# Univer Plugin Development

Guide for building custom plugins that extend Univer's functionality.

> **Compatibility**: This skill is written for Univer `v0.21.x`. Core plugin patterns (lifecycle, DI, commands) remain stable, but specific service tokens and facade classes may shift. Prefer the user's existing codebase patterns when they differ from examples here.

## Quick Start

### Scaffold a new plugin

Use the bundled script to generate a minimal plugin skeleton:

```bash
# If installed to ~/.codex/skills/
npx tsx ~/.codex/skills/univer-plugin-dev/scripts/scaffold-plugin.ts my-plugin --path ./src/plugins

# Or from this repo directly
npx tsx ~/univer-sdk-skills/skills/univer-plugin-dev/scripts/scaffold-plugin.ts my-plugin --path ./src/plugins
```

This creates:
```
my-plugin/
├── src/
│   ├── index.ts
│   ├── plugin.ts
│   ├── commands/
│   │   └── commands.my-command.ts
│   ├── controllers/
│   │   └── my-menu.controller.ts
│   └── facade/
│       └── f-univer.ts
├── package.json
└── tsconfig.json
```

### Register the plugin in your app

```ts
import { MyPlugin } from './plugins/my-plugin/src';
import './plugins/my-plugin/src/facade/f-univer'; // side-effect import for Facade extension

univer.registerPlugin(MyPlugin);
```

## Core Concepts

### Plugin Lifecycle

Plugins inherit from `Plugin` and override lifecycle hooks:

| Hook | When | What to do |
|------|------|------------|
| `onStarting()` | Plugin mounted, no unit yet | Register commands, services, menus, shortcuts |
| `onReady()` | Business unit created | Access workbook/doc instance |
| `onRendered()` | UI rendered | DOM-dependent initialization |
| `onSteady()` | Everything stable | Background tasks |

Always use `disposeWithMe()` to register disposable resources so they auto-cleanup when the plugin is destroyed.

### Command System

Three command types:

- **COMMAND** — Business entry point. Orchestrates mutations and operations. Supports undo/redo if you manually push to `IUndoRedoService`.
- **MUTATION** — Atomic data change. Persisted to snapshot. Automatically undoable.
- **OPERATION** — UI state change. Not persisted. Not undoable.

See `references/command-system.md` for full examples of each type and undo/redo construction.

### Dependency Injection

Univer uses a custom DI container (`Injector`). Services are retrieved by:

```ts
// Constructor injection
@Inject(IMenuManagerService) private readonly _menuService: IMenuManagerService

// Accessor injection (in command handlers)
const service = accessor.get(IMenuManagerService);
```

Common service tokens:
- `ICommandService` — register/execute commands
- `IMenuManagerService` — add menus/toolbar items
- `IShortcutService` — register keyboard shortcuts
- `IContextMenuService` — context menus
- `ComponentManager` — register React components/icons
- `IUniverInstanceService` — get current workbook/doc/slide
- `IUndoRedoService` — push undo/redo entries

### Facade Extension

Extend Facade classes to expose plugin capabilities to end users:

```ts
import { FWorksheet } from '@univerjs/sheets/facade';

class FWorksheetMyMixin extends FWorksheet {
  myMethod(): this {
    // implementation
    return this;
  }
}

FWorksheet.extend(FWorksheetMyMixin);

declare module '@univerjs/sheets/facade' {
  interface FWorksheet extends FWorksheetMyMixin {}
}
```

## Common Tasks

For full examples (submenus, context menus, Range Popup, component replacement, complete toolbar+command+shortcut pipeline), see `references/ui-customization.md`.

### Add a Toolbar Button

```ts
this._menuManagerService.mergeMenu({
  [RibbonOthersGroup.OTHERS]: {
    ['my-button']: {
      order: 10,
      menuItemFactory: () => ({
        id: 'my-button',
        title: 'My Button',
        type: MenuItemType.BUTTON,
      }),
    },
  },
});
```

### Register a Command

```ts
const MyCommand: ICommand = {
  id: 'my.command.id',
  type: CommandType.COMMAND,
  handler: (accessor) => {
    // business logic
    return true;
  },
};

this._commandService.registerCommand(MyCommand);
```

### Extend Facade

```ts
class FWorksheetMyMixin extends FWorksheet {
  myMethod(): this { return this; }
}
FWorksheet.extend(FWorksheetMyMixin);
declare module '@univerjs/sheets/facade' {
  interface FWorksheet extends FWorksheetMyMixin {}
}
```

## References

- **Plugin architecture**: `references/plugin-architecture.md` — lifecycle, DI, service registration, controller pattern
- **Command system**: `references/command-system.md` — COMMAND / MUTATION / OPERATION, undo/redo, mutation factories, custom mutations
- **Facade extension**: `references/facade-extension.md` — extend FUniver, FWorkbook, FWorksheet, FRange, multiple extensions merge strategy
- **UI customization**: `references/ui-customization.md` — menus, submenus, shortcuts, context menus, popups, component replacement
- **Event system**: `references/event-system.md` — events, hooks, custom events, RxJS streams

Also see `univer-integrate` skill for:
- Custom formula functions (`univer-integrate` skill)
- Permissions (`univer-integrate` skill)
- Network layer (`univer-integrate` skill)

## Scripts

- **Scaffold**: `scripts/scaffold-plugin.ts` — generate a new plugin skeleton
