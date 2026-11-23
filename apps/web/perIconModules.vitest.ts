import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { iconModuleSource, rewritePackImports } from './perIconModules';

const require = createRequire(import.meta.url);
const piSource = readFileSync(
  path.join(path.dirname(require.resolve('react-icons/pi')), 'index.mjs'),
  'utf8'
);

describe('rewritePackImports', () => {
  it('splits a named pack import into one virtual module per icon', () => {
    expect(rewritePackImports("import { PiHouse, PiGear } from 'react-icons/pi';")).toBe(
      "import { PiHouse } from 'virtual:react-icon/pi/PiHouse'; import { PiGear } from 'virtual:react-icon/pi/PiGear';"
    );
  });

  it('keeps aliases and the line count of multi-line imports', () => {
    const out = rewritePackImports(
      "import {\n  FiX as Close,\n  FiPlus,\n} from 'react-icons/fi';\nfoo();"
    );
    expect(out).toBe(
      "import { FiX as Close } from 'virtual:react-icon/fi/FiX'; import { FiPlus } from 'virtual:react-icon/fi/FiPlus';\n\n\n\nfoo();"
    );
  });

  it('moves type-only specifiers into an erased type import', () => {
    expect(rewritePackImports("import { PiHouse, type IconType } from 'react-icons/pi';")).toBe(
      "import { PiHouse } from 'virtual:react-icon/pi/PiHouse'; import type { IconType } from 'react-icons/pi';"
    );
  });

  it('leaves namespace imports, queries, type imports and the package root alone', () => {
    for (const code of [
      "import * as Pi from 'react-icons/pi';",
      "import { PiHouse } from 'react-icons/pi?all';",
      "import type { IconType } from 'react-icons/pi';",
      "import { type IconType } from 'react-icons';",
      "import { GenIcon } from 'react-icons/lib';",
    ]) {
      const out = rewritePackImports(code);
      expect(out === null || out === code, code).toBe(true);
    }
  });
});

describe('iconModuleSource', () => {
  it('cuts one icon out of the pack and renders the same element tree', async () => {
    const source = iconModuleSource(piSource, 'PiHouse');
    expect(source).toContain("from 'react-icons/lib'");
    expect(source).toContain('export function PiHouse(props)');
    expect(source).not.toContain('PiHouseLine');
    const pack = (await import('react-icons/pi')) as Record<string, (p: object) => unknown>;
    const { GenIcon } = await import('react-icons/lib');
    const body = source.slice(source.indexOf('return ') + 7, source.lastIndexOf('(props)'));
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fromCut = new Function('GenIcon', `return ${body};`)(GenIcon) as (p: object) => unknown;
    expect(JSON.stringify(fromCut({}))).toBe(JSON.stringify(pack.PiHouse({})));
  });

  it('throws for an icon the pack does not have', () => {
    expect(() => iconModuleSource(piSource, 'PiDoesNotExist')).toThrow(/PiDoesNotExist/);
  });
});
