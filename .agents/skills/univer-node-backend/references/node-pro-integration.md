# Pro Node.js Integration

Using Univer Pro features in Node.js backend environments.

> **Prerequisites**: A valid Univer Pro license is required for full feature access. See the `univer-pro-integrate` skill for license setup.

## Required Pro Packages

```bash
npm install @univerjs-pro/license @univerjs-pro/engine-formula
npm install @univerjs-pro/sheets-pivot @univerjs-pro/sheets-chart
npm install @univerjs-pro/sheets-shape @univerjs-pro/sheets-sparkline
```

For Pro collaboration in Node.js:
```bash
npm install @univerjs-pro/collaboration @univerjs-pro/collaboration-client @univerjs-pro/collaboration-client-node
```

## Pro Setup in Node.js

```ts
import path from 'node:path';
import { LocaleType, Univer } from '@univerjs/core';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverRPCNodeMainPlugin } from '@univerjs/rpc-node';
import { UniverSheetsPlugin } from '@univerjs/sheets';

// Pro packages
import { UniverLicensePlugin } from '@univerjs-pro/license';
import { UniverProFormulaEnginePlugin } from '@univerjs-pro/engine-formula';
import { UniverSheetsPivotTablePlugin } from '@univerjs-pro/sheets-pivot';
import { UniverSheetsChartPlugin } from '@univerjs-pro/sheets-chart';
import { UniverSheetsShapePlugin } from '@univerjs-pro/sheets-shape';

// Facade imports
import '@univerjs/core/facade';
import '@univerjs/sheets/facade';
import '@univerjs/engine-formula/facade';
import '@univerjs/sheets-formula/facade';
import '@univerjs-pro/sheets-pivot/facade';
import '@univerjs-pro/sheets-chart/facade';
import '@univerjs-pro/sheets-shape/facade';
import '@univerjs-pro/engine-formula/facade';

const univer = new Univer({
  locale: LocaleType.EN_US,
});

// License first
univer.registerPlugin(UniverLicensePlugin, {
  license: process.env.UNIVER_LICENSE,
});

// Engine
univer.registerPlugin(UniverProFormulaEnginePlugin, { notExecuteFormula: true });

// Worker
const workerPath = path.join(__dirname, 'worker.js');
univer.registerPlugin(UniverRPCNodeMainPlugin, { workerSrc: workerPath });

// Sheets core
univer.registerPlugin(UniverSheetsPlugin);
univer.registerPlugin(UniverSheetsFormulaPlugin);

// Pro features
univer.registerPlugin(UniverSheetsPivotTablePlugin, { notExecuteFormula: true });
univer.registerPlugin(UniverSheetsChartPlugin);
univer.registerPlugin(UniverSheetsShapePlugin);
```

### Pro Worker

```ts
// worker.js
import { LocaleType, Univer } from '@univerjs/core';
import { UniverProFormulaEnginePlugin } from '@univerjs-pro/engine-formula';
import { UniverRPCNodeWorkerPlugin } from '@univerjs/rpc-node';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsPivotTablePlugin } from '@univerjs-pro/sheets-pivot';

const univer = new Univer({ locale: LocaleType.EN_US });

univer.registerPlugin(UniverSheetsPlugin, { onlyRegisterFormulaRelatedMutations: true });
univer.registerPlugin(UniverProFormulaEnginePlugin);
univer.registerPlugin(UniverRPCNodeWorkerPlugin);
univer.registerPlugin(UniverSheetsPivotTablePlugin, { notExecuteFormula: false });
```

## Collaboration in Node.js

Univer Pro supports loading collaborative units in Node.js via `@univerjs-pro/collaboration-client-node`:

```ts
import { UniverCollaborationPlugin } from '@univerjs-pro/collaboration';
import { UniverCollaborationClientPlugin } from '@univerjs-pro/collaboration-client';
import { NodeCollaborationSocketService, UniverCollaborationClientNodePlugin } from '@univerjs-pro/collaboration-client-node';

import '@univerjs-pro/collaboration-client/facade';

univer.registerPlugin(UniverNetworkPlugin);
univer.registerPlugin(UniverCollaborationPlugin);
univer.registerPlugin(UniverCollaborationClientPlugin, {
  socketService: NodeCollaborationSocketService,
  enableOfflineEditing: false,
  enableSingleActiveInstanceLock: false,
  snapshotServerUrl: 'https://your-server/universer-api/snapshot',
  collabSubmitChangesetUrl: 'https://your-server/universer-api/comb',
  collabWebSocketUrl: 'https://your-server/universer-api/comb/connect',
  wsSessionTicketUrl: 'https://your-server/universer-api/user/session-ticket',
  sendChangesetTimeout: 200,
  retryConnectingInterval: 1000,
});
univer.registerPlugin(UniverCollaborationClientNodePlugin);
```

### Loading a Collaborative Unit

```ts
const api = FUniver.newAPI(univer);
const collaboration = api.getCollaboration();

// Load a server sheet
const workbook = await collaboration.loadSheetAsync('unit-id');

// Subscribe to collaborators
const disposable = collaboration.subscribeCollaborators('unit-id', (members) => {
  console.log('Online members:', members);
});

// Check sync status
const status = collaboration.getCollaborationStatus('unit-id');
```

### Node Collaboration Socket Service

`NodeCollaborationSocketService` from `@univerjs-pro/collaboration-client-node` provides a WebSocket implementation for Node.js environments. It replaces the browser-specific `BrowserCollaborationSocketService`.

## Pro Features in Headless Mode

Most Pro features work in Node.js without UI plugins:

| Feature | Core Plugin | Node.js Compatible | Notes |
|---------|-------------|-------------------|-------|
| Pivot Table | `UniverSheetsPivotTablePlugin` | ✅ | No UI needed for data analysis |
| Chart | `UniverSheetsChartPlugin` | ⚠️ | Model only; rendering requires canvas |
| Shape | `UniverSheetsShapePlugin` | ⚠️ | Model only; rendering requires canvas |
| Sparkline | `UniverSheetSparklinePlugin` | ✅ | Data model only |
| Print | `UniverSheetsPrintPlugin` | ❌ | Depends on browser print APIs |
| Exchange | `UniverExchangeClientPlugin` | ✅ | HTTP-based, works in Node.js |
| Collaboration | `UniverCollaborationClientPlugin` | ✅ | With `collaboration-client-node` |

### Pivot Table on Server

```ts
const api = FUniver.newAPI(univer);
const workbook = api.createWorkbook({});
const sheet = workbook.getActiveSheet();

// Populate source data
// ...

// Create pivot table via Facade
// (Pivot table creation APIs are available via the sheets-pivot facade)
```

### Server-Side XLSX Exchange

The exchange client works in Node.js if you provide a file buffer or URL:

```ts
import { FUniver } from '@univerjs/core/facade';
import { downloadFile } from '@univerjs-pro/exchange-client';

import '@univerjs-pro/exchange-client/facade';

const api = FUniver.newAPI(univer);

// Import from URL
const unitId = await api.importXLSXToUnitIdAsync('https://example.com/data.xlsx');

// Export by unit ID
const file = await api.exportXLSXByUnitIdAsync(unitId);
downloadFile(file, 'report', 'xlsx');
```

## License in Node.js

The license plugin must be registered in both the main process and the worker:

```ts
// main.ts
univer.registerPlugin(UniverLicensePlugin, {
  license: process.env.UNIVER_LICENSE,
});
```

```ts
// worker.js
import { WORKER_INIT_LICENSE } from '@univerjs-pro/license';

univer.registerPlugin(UniverLicensePlugin, {
  license: WORKER_INIT_LICENSE, // reads from global if injected before fork
});
```

## Anti-Patterns

- **Do not** register `*-ui` plugins in Node.js. They will crash on `window` / `document` access.
- **Do not** register `UniverSheetsPrintPlugin` in headless mode. It depends on browser print APIs.
- **Do not** forget to call `univer.dispose()` when done. The worker child process is not killed automatically until disposal.
- **Do not** use browser-only facade imports (`@univerjs/ui/facade`, `@univerjs/sheets-ui/facade`) in Node.js.
