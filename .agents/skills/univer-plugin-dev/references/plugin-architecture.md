# Univer Plugin Architecture

## Plugin Base Class

All plugins must inherit from `Plugin`:

```ts
import { Plugin, Inject, Injector, UniverInstanceType } from '@univerjs/core';

class MyPlugin extends Plugin {
  static override pluginName = 'my-plugin';
  static override type = UniverInstanceType.UNIVER_SHEET; // or UNIVER_DOC / UNIVER_SLIDE / UNIVER_UNKNOWN

  constructor(
    _config: any,
    @Inject(Injector) readonly _injector: Injector,
  ) {
    super();
  }

  override onStarting(): void {
    // Register services, commands, menus, etc.
  }

  override onReady(): void {
    // Univer business instance has been created
  }

  override onRendered(): void {
    // UI rendering complete
  }

  override onSteady(): void {
    // Enter steady state
  }
}
```

## Lifecycle Details

### onStarting

- Timing: Called immediately after the plugin is mounted to the Univer instance
- State: DI container is ready, but business units (workbook/doc) have not yet been created
- Uses:
  - Register commands (`registerCommand`)
  - Register menus (`mergeMenu`)
  - Register shortcuts (`registerShortcut`)
  - Register services to DI (`injector.add`)
  - Register icon components (`componentManager.register`)
- Note: Do not access workbook or DOM here

### onReady

- Timing: Business unit has been created (e.g. workbook is instantiated)
- Uses:
  - Read workbook configuration
  - Initialize plugin state based on existing data
  - Register workbook-level listeners

### onRendered

- Timing: UI has been rendered to DOM
- Uses:
  - DOM-dependent initialization (e.g. canvas operations)
  - Acquire rendering layer services

### onSteady

- Timing: All plugins have completed onRendered
- Uses:
  - Background sync tasks
  - Lazy-loaded resources

## Dependency Injection

Univer uses a custom DI container (`Injector`). Services are registered and retrieved via tokens:

### Constructor Injection

```ts
class MyPlugin extends Plugin {
  constructor(
    @Inject(Injector) readonly _injector: Injector,
    @ICommandService private readonly _commandService: ICommandService,
    @Inject(IMenuManagerService) private readonly _menuService: IMenuManagerService,
    @Inject(ComponentManager) private readonly _componentManager: ComponentManager,
  ) {
    super();
  }
}
```

### Accessor Injection (in command handlers)

```ts
const MyCommand: ICommand = {
  id: 'my.command',
  type: CommandType.COMMAND,
  handler: (accessor) => {
    const commandService = accessor.get(ICommandService);
    const instanceService = accessor.get(IUniverInstanceService);
    // ...
  },
};
```

### Common Service Tokens

| Token | Package | Purpose |
|-------|---------|---------|
| `ICommandService` | `@univerjs/core` | Register/execute commands |
| `IMenuManagerService` | `@univerjs/ui` | Menu/toolbar management |
| `IShortcutService` | `@univerjs/ui` | Shortcut registration |
| `IContextMenuService` | `@univerjs/ui` | Context menu |
| `ComponentManager` | `@univerjs/ui` | React component/icon registration |
| `IUniverInstanceService` | `@univerjs/core` | Get current workbook/doc |
| `IUndoRedoService` | `@univerjs/core` | Undo/redo stack operations |
| `IRenderManagerService` | `@univerjs/engine-render` | Render management |
| `SheetsSelectionsService` | `@univerjs/sheets` | Selection management |
| `LocaleService` | `@univerjs/core` | Internationalization |
| `ThemeService` | `@univerjs/core` | Theme |
| `ILogService` | `@univerjs/core` | Logging |

## Plugin Dependencies

Use `DependentOnSymbol` to declare plugin dependencies, ensuring correct loading order:

```ts
import { DependentOnSymbol } from '@univerjs/core';
import { UniverSheetsPlugin } from '@univerjs/sheets';

class MyPlugin extends Plugin {
  static override [DependentOnSymbol] = [UniverSheetsPlugin];
}
```

## Registering Plugins

```ts
// Single
univer.registerPlugin(MyPlugin, config);

// Batch
univer.registerPlugins([
  [MyPlugin, config],
  [AnotherPlugin],
]);
```

## Plugin Configuration

Configuration is passed via the first constructor parameter:

```ts
interface IMyPluginConfig {
  enabled: boolean;
  apiEndpoint?: string;
}

class MyPlugin extends Plugin {
  constructor(
    private _config: IMyPluginConfig,
    @Inject(Injector) readonly _injector: Injector,
  ) {
    super();
  }

  override onStarting() {
    if (!this._config.enabled) return;
    // ...
  }
}

// Pass at registration
univer.registerPlugin(MyPlugin, { enabled: true, apiEndpoint: '/api' });
```

## Disposable Pattern

Use `disposeWithMe` to automatically clean up registered resources:

```ts
override onStarting() {
  this.disposeWithMe(this._commandService.registerCommand(myCommand));
  this.disposeWithMe(this._menuService.mergeMenu(myMenu));
  this.disposeWithMe(this._shortcutService.registerShortcut(myShortcut));
}
```

When the plugin is destroyed (calling `univer.dispose()`), all resources registered via `disposeWithMe` are automatically released.

## Service Registration

Register custom services in a plugin:

```ts
override onStarting() {
  this._injector.add([MyService, { useClass: MyService }]);
}
```

Then retrieve in other plugins or commands via accessor/injection:

```ts
const myService = accessor.get(MyService);
```

## Controller Pattern

Complex plugins typically adopt the Controller pattern to organize code:

```ts
// plugin.ts
class MyPlugin extends Plugin {
  override onStarting() {
    this._initCommands();
    this._initControllers();
  }

  private _initCommands() {
    [MyCommand].forEach(cmd =>
      this.disposeWithMe(this._commandService.registerCommand(cmd))
    );
  }

  private _initControllers() {
    const controller = this._injector.createInstance(MyMenuController);
    this.disposeWithMe(controller);
  }
}

// controllers/my-menu.controller.ts
class MyMenuController extends Disposable {
  constructor(
    @Inject(Injector) private _injector: Injector,
    @ICommandService private _commandService: ICommandService,
    @Inject(IMenuManagerService) private _menuService: IMenuManagerService,
  ) {
    super();
    this._initMenus();
  }

  private _initMenus() {
    this.disposeWithMe(this._menuService.mergeMenu({ ... }));
  }
}
```

Controllers inherit from `Disposable`, and also use `disposeWithMe` to manage lifecycle.
