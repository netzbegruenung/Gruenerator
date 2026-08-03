# Web Worker / RPC Configuration

## Browser-Side Worker (Recommended)

Offload formula calculation to a Web Worker to avoid blocking the main thread:

**worker.ts**

```ts
import { WebWorkerEngine } from '@univerjs/rpc';

const worker = new WebWorkerEngine();
worker.listen();
```

**main.ts**

```ts
import { UniverRPCMainThreadPlugin } from '@univerjs/rpc';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

univer.registerPlugin(UniverRPCMainThreadPlugin, { workerURL: worker });
```

## No-Worker Mode

If you don't need a Worker, register the formula engine directly on the main thread:

```ts
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula';

univer.registerPlugins([
  [UniverFormulaEnginePlugin],
  [UniverSheetsFormulaPlugin],
]);
```

Notes:
- Without Worker, `UniverSheetsPlugin`'s `notExecuteFormula` should be `false` (or omitted)
- With Worker, `UniverSheetsPlugin` and `UniverFormulaEnginePlugin` usually pass `{ notExecuteFormula: true }`, because calculation is performed on the Worker side

## Node.js Worker

Offload formula calculation to a dedicated Node.js worker thread:

**main.ts**

```ts
import path from 'node:path';
import { UniverRPCNodeMainPlugin } from '@univerjs/rpc-node';

const childPath = path.join(__dirname, 'worker.js');
univer.registerPlugin(UniverRPCNodeMainPlugin, { workerSrc: childPath });
```

**worker.js**

```ts
import { LocaleType, Univer } from '@univerjs/core';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverRPCNodeWorkerPlugin } from '@univerjs/rpc-node';
import { UniverSheetsPlugin } from '@univerjs/sheets';

const univer = new Univer({ locale: LocaleType.EN_US });

// Worker only needs formula-related plugins
univer.registerPlugin(UniverSheetsPlugin, { onlyRegisterFormulaRelatedMutations: true });
univer.registerPlugin(UniverFormulaEnginePlugin);
univer.registerPlugin(UniverRPCNodeWorkerPlugin);
```

> **Note**: In headless mode, set `notExecuteFormula: true` on the main thread's
> `UniverFormulaEnginePlugin` and `UniverSheetsPlugin` when using a worker,
> because execution happens on the worker side.

## Cleanup

Terminate the Worker when the component unmounts:

```ts
univer.onDispose(() => {
  worker.terminate();
});
```
