/**
 * Scaffold a minimal Univer plugin directory
 * Usage: npx tsx scaffold-plugin.ts <plugin-name> [--path <dir>]
 *
 * Requires: Node.js >= 18, and tsx (npm install -g tsx)
 * Or run via: node --loader ts-node/esm scaffold-plugin.ts ...
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const nameArg = args.find((_, i) => i === 0 && !args[i].startsWith('--')) || 'my-univer-plugin';
const pathFlagIndex = args.indexOf('--path');
const baseDir = pathFlagIndex >= 0 ? args[pathFlagIndex + 1] : '.';
const pluginName = nameArg.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
const className = pluginName
  .split('-')
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
  .join('');
const pluginClass = `Univer${className}Plugin`;
const outDir = path.resolve(baseDir, pluginName);

const files: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: pluginName,
      version: '0.0.1',
      main: './src/index.ts',
      peerDependencies: {
        '@univerjs/core': 'latest',
        '@univerjs/sheets': 'latest',
        '@univerjs/ui': 'latest',
      },
    },
    null,
    2
  ),

  'tsconfig.json': JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        declaration: true,
      },
      include: ['src'],
    },
    null,
    2
  ),

  'src/index.ts': `export { ${pluginClass} } from './plugin';\n`,

  'src/plugin.ts': `import { Plugin, Inject, Injector, UniverInstanceType } from '@univerjs/core';
import { ICommandService } from '@univerjs/core';
import { MyCommand } from './commands/commands.my-command';
import { MyMenuController } from './controllers/my-menu.controller';

export const ${pluginClass.replace(/Plugin$/, '').toUpperCase()}_PLUGIN_NAME = '${pluginName}';

export class ${pluginClass} extends Plugin {
  static override pluginName = ${pluginClass.replace(/Plugin$/, '').toUpperCase()}_PLUGIN_NAME;
  static override type = UniverInstanceType.UNIVER_SHEET;

  constructor(
    _config = undefined,
    @Inject(Injector) protected readonly _injector: Injector,
    @ICommandService private readonly _commandService: ICommandService,
  ) {
    super();
  }

  override onStarting(): void {
    this._initCommands();
    this._initControllers();
  }

  private _initCommands(): void {
    [MyCommand].forEach((cmd) =>
      this.disposeWithMe(this._commandService.registerCommand(cmd))
    );
  }

  private _initControllers(): void {
    const controller = this._injector.createInstance(MyMenuController);
    this.disposeWithMe(controller);
  }
}
`,

  'src/commands/commands.my-command.ts': `import type { IAccessor, ICommand } from '@univerjs/core';
import { CommandType } from '@univerjs/core';

export interface IMyCommandParams {
  value: string;
}

export const MyCommand: ICommand<IMyCommandParams> = {
  id: '${pluginName}.command.my-command',
  type: CommandType.COMMAND,

  handler: (accessor: IAccessor, params: IMyCommandParams) => {
    console.log('MyCommand executed with:', params.value);
    return true;
  },
};
`,

  'src/controllers/my-menu.controller.ts': `import { Disposable, Inject, Injector } from '@univerjs/core';
import { ICommandService } from '@univerjs/core';
import { ComponentManager, IMenuManagerService, MenuItemType, RibbonOthersGroup } from '@univerjs/ui';
import { MyCommand } from '../commands/commands.my-command';

export class MyMenuController extends Disposable {
  constructor(
    @Inject(Injector) private readonly _injector: Injector,
    @ICommandService private readonly _commandService: ICommandService,
    @Inject(IMenuManagerService) private readonly _menuManagerService: IMenuManagerService,
    @Inject(ComponentManager) private readonly _componentManager: ComponentManager,
  ) {
    super();
    this._initUI();
  }

  private _initUI(): void {
    const buttonId = MyCommand.id;

    this.disposeWithMe(
      this._menuManagerService.mergeMenu({
        [RibbonOthersGroup.OTHERS]: {
          [buttonId]: {
            order: 10,
            menuItemFactory: () => ({
              id: buttonId,
              title: 'My Action',
              tooltip: 'Run my action',
              type: MenuItemType.BUTTON,
            }),
          },
        },
      })
    );
  }
}
`,

  'src/facade/f-univer.ts': `import { FUniver } from '@univerjs/core/facade';

export interface IFUniver${className}Mixin {
  helloPlugin(): string;
}

export class FUniver${className}Mixin extends FUniver implements IFUniver${className}Mixin {
  helloPlugin(): string {
    return 'Hello from ${pluginName}!';
  }
}

FUniver.extend(FUniver${className}Mixin);

declare module '@univerjs/core/facade' {
  interface FUniver extends IFUniver${className}Mixin {}
}
`,
};

if (fs.existsSync(outDir)) {
  console.error(`Directory already exists: ${outDir}`);
  process.exit(1);
}

Object.entries(files).forEach(([filePath, content]) => {
  const fullPath = path.join(outDir, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
});

console.log(`Scaffolded ${pluginName} at ${outDir}`);
