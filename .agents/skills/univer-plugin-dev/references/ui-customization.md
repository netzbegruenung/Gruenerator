# UI Customization

## Menus and Toolbar Buttons

Use `IMenuManagerService` to register menu items. Univer's menu system is a nested structure:

```ts
import { IMenuManagerService, MenuItemType, RibbonStartGroup } from '@univerjs/ui';

const menuItemFactory = () => ({
  id: 'my-button',
  title: 'My Button',
  tooltip: 'Do something',
  icon: 'MyIcon',
  type: MenuItemType.BUTTON,
});

this._menuManagerService.mergeMenu({
  [RibbonStartGroup.START]: {
    ['my-button']: {
      order: 10,
      menuItemFactory,
    },
  },
});
```

Menu group constants (Ribbon top tabs):

| Constant | Tab |
|----------|-----|
| `RibbonStartGroup.START` | Home |
| `RibbonInsertGroup.INSERT` | Insert |
| `RibbonFormulaGroup.FORMULA` | Formula |
| `RibbonDataGroup.DATA` | Data |
| `RibbonViewGroup.VIEW` | View |
| `RibbonOthersGroup.OTHERS` | Others / Custom area |

### Menu Items with Submenus

```ts
const menuItemFactory = () => ({
  id: 'my-menu',
  title: 'My Menu',
  icon: 'MyIcon',
  type: MenuItemType.SUBMENU,
  children: {
    ['child-1']: {
      order: 1,
      menuItemFactory: () => ({
        id: 'child-1',
        title: 'Action 1',
        type: MenuItemType.BUTTON,
      }),
    },
    ['child-2']: {
      order: 2,
      menuItemFactory: () => ({
        id: 'child-2',
        title: 'Action 2',
        type: MenuItemType.BUTTON,
      }),
    },
  },
});
```

### Binding Buttons to Commands

Menu items themselves do not execute logic. When clicked, they find the registered command by id:

```ts
// 1. Register command
this._commandService.registerCommand({
  id: 'my-button',  // Must match the menuItem id
  type: CommandType.OPERATION,
  handler: (accessor) => {
    // Execute logic
    return true;
  },
});

// 2. Register menu
this._menuManagerService.mergeMenu({
  [RibbonOthersGroup.OTHERS]: {
    ['my-button']: {
      order: 10,
      menuItemFactory: () => ({
        id: 'my-button',
        title: 'Click Me',
        type: MenuItemType.BUTTON,
      }),
    },
  },
});
```

## Registering Icon Components

Icons must be React function components that receive SVG props:

```ts
import { ComponentManager } from '@univerjs/ui';

function MyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" {...props}>
      <circle cx="8" cy="8" r="6" />
    </svg>
  );
}

this._componentManager.register('MyIcon', MyIcon);
```

## Shortcuts

Use `IShortcutService` to register shortcuts:

```ts
import { IShortcutService } from '@univerjs/ui';
import { whenSheetEditorFocused } from '@univerjs/sheets-ui';

const shortcutItem = {
  id: 'my-shortcut',
  description: 'Clear selection content',
  binding: KeyCode.DELETE,
  priority: 100,
  preconditions: whenSheetEditorFocused,
  handler: (accessor) => {
    return accessor.get(ICommandService).executeCommand('custom.command.clear');
  },
};

this._shortcutService.registerShortcut(shortcutItem);
```

Common preconditions:
- `whenSheetEditorFocused` — When the spreadsheet editor is focused
- `whenDocEditorFocused` — When the document editor is focused
- `whenSlideEditorFocused` — When the slide editor is focused
- `whenEditorNotActivated` — When the cell inline editor is not activated

Combination key syntax:

```ts
KeyCode.KEY_S | MetaKeys.CTRL_CMD           // Ctrl+S / Cmd+S
KeyCode.KEY_K | MetaKeys.CTRL_CMD | MetaKeys.SHIFT  // Ctrl+Shift+K
```

## Context Menus

```ts
import { IContextMenuService } from '@univerjs/ui';

this._contextMenuService.addContextMenuItem({
  id: 'my-context-action',
  title: 'My Action',
  icon: 'MyIcon',
  action: () => {
    this._commandService.executeCommand('my.command.id');
  },
});
```

### Registering Context Menus by Position

```ts
// Cell right-click
this._contextMenuService.addContextMenuItem({
  id: 'cell-context-action',
  title: 'Cell Action',
  selector: SHEET_VIEW_KEY.MAIN, // Restrict to sheet main area
  action: () => { /* ... */ },
});
```

## Floating Panel / Range Popup

Display a custom React component near the selection:

```ts
import { IRangePopupService } from '@univerjs/sheets-ui';

this._rangePopupService.showPopup({
  unitId,
  subUnitId,
  range,
  componentKey: 'MyPopupComponent',
  direction: 'bottom',
  offset: [0, 4],
});
```

You need to register the component first:

```ts
this._componentManager.register('MyPopupComponent', MyPopupComponent);
```

## Component Replacement

Replace built-in components via `ComponentManager`:

```ts
this._componentManager.register('DefaultCellEditor', MyCustomCellEditor);
```

Common replaceable component keys:
- `DefaultCellEditor` — Cell editor
- `DefaultFormulaEditor` — Formula editor
- `DefaultDocEditor` — Document editor
- `SHEET_VIEW_KEY.MAIN` — Spreadsheet main view

## Style Overrides

Univer uses CSS variables and `univer-` prefixed class names. You can override them with regular CSS:

```css
/* Modify toolbar background */
.univer-toolbar {
  background-color: #f0f0f0;
}

/* Modify cell selection border */
.univer-selection {
  border-color: #00bfff !important;
}
```

Or inject theme tokens:

```ts
const customTheme = {
  ...defaultTheme,
  color: {
    ...defaultTheme.color,
    primary: '#ff6b6b',
  },
};

const univer = new Univer({ theme: customTheme });
```

## Complete Example: Toolbar Button + Command + Shortcut

```ts
import { Plugin, Inject, Injector, UniverInstanceType } from '@univerjs/core';
import { ICommandService, CommandType } from '@univerjs/core';
import { IMenuManagerService, IShortcutService, ComponentManager, MenuItemType, RibbonOthersGroup } from '@univerjs/ui';
import { whenSheetEditorFocused } from '@univerjs/sheets-ui';
import { SetRangeValuesMutation } from '@univerjs/sheets';

// 1. Define command
const HighlightCommand = {
  id: 'custom.command.highlight-selection',
  type: CommandType.COMMAND,
  handler: (accessor) => {
    const commandService = accessor.get(ICommandService);
    const instanceService = accessor.get(IUniverInstanceService);
    const workbook = instanceService.getCurrentUnitOfType(UniverInstanceType.UNIVER_SHEET);
    if (!workbook) return false;

    const worksheet = workbook.getActiveSheet();
    const selections = accessor.get(SheetsSelectionsService).getCurrentSelections();
    if (!selections.length) return false;

    const range = selections[0].range;
    const result = commandService.executeCommand(SetRangeValuesMutation.id, {
      unitId: workbook.getUnitId(),
      subUnitId: worksheet.getSheetId(),
      range,
      cellValue: {
        [range.startColumn]: {
          [range.startRow]: { s: { bg: { rgb: '#FFFF00' } } },
        },
      },
    });

    return result.result;
  },
};

// 2. Define plugin
class HighlightPlugin extends Plugin {
  static override pluginName = 'highlight-plugin';
  static override type = UniverInstanceType.UNIVER_SHEET;

  constructor(
    @Inject(Injector) readonly _injector: Injector,
    @ICommandService private readonly _commandService: ICommandService,
    @Inject(IMenuManagerService) private readonly _menuService: IMenuManagerService,
    @Inject(IShortcutService) private readonly _shortcutService: IShortcutService,
    @Inject(ComponentManager) private readonly _componentManager: ComponentManager,
  ) {
    super();
  }

  override onStarting() {
    // Register command
    this.disposeWithMe(this._commandService.registerCommand(HighlightCommand));

    // Register menu
    this.disposeWithMe(this._menuService.mergeMenu({
      [RibbonOthersGroup.OTHERS]: {
        ['highlight-btn']: {
          order: 10,
          menuItemFactory: () => ({
            id: HighlightCommand.id,
            title: 'Highlight',
            tooltip: 'Highlight selection yellow',
            icon: 'HighlightIcon',
            type: MenuItemType.BUTTON,
          }),
        },
      },
    }));

    // Register shortcut
    this.disposeWithMe(this._shortcutService.registerShortcut({
      id: 'highlight-shortcut',
      description: 'Highlight selection',
      binding: KeyCode.KEY_H | MetaKeys.CTRL_CMD | MetaKeys.SHIFT,
      priority: 100,
      preconditions: whenSheetEditorFocused,
      handler: (accessor) => accessor.get(ICommandService).executeCommand(HighlightCommand.id),
    }));
  }
}
```
