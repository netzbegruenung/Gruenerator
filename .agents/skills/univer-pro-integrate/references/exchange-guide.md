# Exchange Guide (Import / Export)

Univer Pro supports importing and exporting XLSX and DOCX files via server-side conversion.

> **Prerequisite**: A running Univer Pro server with exchange endpoints, and a valid license for full import/export size limits.

## Required Packages

```bash
npm install @univerjs-pro/exchange-client @univerjs-pro/sheets-exchange-client
```

## Setup

Register the exchange plugins with your server URLs:

```ts
import { UniverExchangeClientPlugin } from '@univerjs-pro/exchange-client';
import { UniverSheetsExchangeClientPlugin } from '@univerjs-pro/sheets-exchange-client';

import '@univerjs-pro/exchange-client/facade';

const httpProtocol = 'https';
const host = 'your-univer-server.com';

univer.registerPlugin(UniverExchangeClientPlugin, {
  uploadFileServerUrl: `${httpProtocol}://${host}/universer-api/stream/file/upload`,
  getTaskServerUrl: `${httpProtocol}://${host}/universer-api/exchange/task/{taskID}`,
  signUrlServerUrl: `${httpProtocol}://${host}/universer-api/file/{fileID}/sign-url`,
  importServerUrl: `${httpProtocol}://${host}/universer-api/exchange/{type}/import`,
  exportServerUrl: `${httpProtocol}://${host}/universer-api/exchange/{type}/export`,
  downloadEndpointUrl: `${httpProtocol}://${host}/`,
});
univer.registerPlugin(UniverSheetsExchangeClientPlugin);
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `uploadFileServerUrl` | Endpoint for uploading files before conversion |
| `getTaskServerUrl` | Endpoint for polling conversion task status (`{taskID}` placeholder) |
| `signUrlServerUrl` | Endpoint for signed download URLs (`{fileID}` placeholder) |
| `importServerUrl` | Import endpoint (`{type}` placeholder: `xlsx`, `docx`, etc.) |
| `exportServerUrl` | Export endpoint (`{type}` placeholder) |
| `downloadEndpointUrl` | Base URL for downloads |
| `maxTimeoutTime` | Maximum wait time for async tasks |
| `options.minSheetRowCount` | Minimum rows in imported worksheet |
| `options.minSheetColumnCount` | Minimum columns in imported worksheet |
| `options.enableServerSideComputing` | Enable server-side formula calculation on export |
| `options.disableCellImageConversion` | Disable converting cell images to URLs on export (default `true`) |
| `options.ignoreTableExport` | Ignore tables when exporting (default `false`) |

## XLSX Import

### Import to Unit ID (creates a server-side unit)

```ts
// File object from <input type="file">
const unitId = await univerAPI.importXLSXToUnitIdAsync(file);

// Or from a remote URL
const unitId = await univerAPI.importXLSXToUnitIdAsync('https://example.com/data.xlsx');
```

After importing, redirect to the unit for collaborative editing:

```ts
const url = new URL(window.location.href);
url.searchParams.set('unit', unitId);
url.searchParams.set('type', String(UniverInstanceType.UNIVER_SHEET)); // "2"
window.open(url.toString(), '_blank');
```

### Import to Workbook Data (local use)

```ts
const snapshot = await univerAPI.importXLSXToSnapshotAsync(file);
univerAPI.createWorkbook(snapshot);
```

## XLSX Export

### Export by Unit ID

```ts
import { downloadFile } from '@univerjs-pro/exchange-client';

const fWorkbook = univerAPI.getActiveWorkbook();
const unitId = fWorkbook.getId();
const file = await univerAPI.exportXLSXByUnitIdAsync(unitId);
// With server-side calculation:
// const file = await univerAPI.exportXLSXByUnitIdAsync(unitId, { enableServerCalculation: true });

downloadFile(file, 'workbook', 'xlsx');
```

### Export by Workbook Data

```ts
const fWorkbook = univerAPI.getActiveWorkbook();
const snapshot = fWorkbook.save();
const file = await univerAPI.exportXLSXBySnapshotAsync(snapshot);
downloadFile(file, 'workbook', 'xlsx');
```

## DOCX Import / Export

### DOCX Import

```ts
const unitId = await univerAPI.importDOCXToUnitIdAsync(file);
// type "1" = UNIVER_DOC
```

### DOCX Export

```ts
const snapshot = univerAPI.getActiveDocument().save();
const file = await univerAPI.exportDOCXBySnapshotAsync(snapshot);
downloadFile(file, 'document', 'docx');

// Or by unit ID
const file = await univerAPI.exportDOCXByUnitIdAsync(unitId);
downloadFile(file, 'document', 'docx');
```

## Utilities

### Download Helper

```ts
import { downloadFile } from '@univerjs-pro/exchange-client';

downloadFile(file, 'filename-without-extension', 'xlsx');
```

### Snapshot Conversion

Convert between Univer snapshot JSON and workbook/document data:

```ts
import {
  transformWorkbookDataToSnapshotJson,
  transformSnapshotJsonToWorkbookData,
  transformDocumentDataToSnapshotJson,
  transformSnapshotJsonToDocumentData,
} from '@univerjs-pro/exchange-client';

const snapshotJson = transformWorkbookDataToSnapshotJson(workbookData);
const workbookData = transformSnapshotJsonToWorkbookData(snapshotJson);
```

### File Type Detection

```ts
import { getUniverInstanceTypeByFile } from '@univerjs-pro/exchange-client';

const type = getUniverInstanceTypeByFile(file); // UniverInstanceType.UNIVER_SHEET or UNIVER_DOC
```
