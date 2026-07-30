# Collaboration Guide

Univer Pro provides real-time collaborative editing via OT (Operational Transformation). This guide covers client-side integration.

> **Prerequisite**: A running Univer Pro server (universer). See the official docs for server deployment.

## Required Packages

```bash
npm install @univerjs-pro/collaboration @univerjs-pro/collaboration-client @univerjs-pro/collaboration-client-ui
```

## Basic Setup

```ts
import { UniverCollaborationPlugin } from '@univerjs-pro/collaboration';
import { ICollaborationSocketService, ISingleActiveUnitService, UniverCollaborationClientPlugin } from '@univerjs-pro/collaboration-client';
import { BrowserCollaborationSocketService, DesktopCollaborationStatusDisplayController, UniverCollaborationClientUIPlugin, WebBrowserSingleActiveUnitService } from '@univerjs-pro/collaboration-client-ui';

import '@univerjs-pro/collaboration-client/facade';

const httpProtocol = 'https';
const host = 'your-univer-server.com';
const wsProtocol = 'wss';

univer.registerPlugin(UniverCollaborationPlugin);
univer.registerPlugin(UniverCollaborationClientPlugin, {
  enableOfflineEditing: false,
  enableSingleActiveInstanceLock: false,
  socketService: BrowserCollaborationSocketService,
  override: [
    [ICollaborationSocketService, { useClass: BrowserCollaborationSocketService }],
    [ISingleActiveUnitService, { useClass: WebBrowserSingleActiveUnitService }],
  ],
  snapshotServerUrl: `${httpProtocol}://${host}/universer-api/snapshot`,
  collabSubmitChangesetUrl: `${httpProtocol}://${host}/universer-api/comb`,
  collabWebSocketUrl: `${wsProtocol}://${host}/universer-api/comb/connect`,
  sendChangesetTimeout: 200,
  retryConnectingInterval: 1000,
});
univer.registerPlugin(UniverCollaborationClientUIPlugin, {
  override: [
    [DesktopCollaborationStatusDisplayController, null], // optional: disable default status UI
  ],
});
```

## Loading a Collaborative Unit

Instead of `createUnit`, load a server unit by ID:

```ts
const unitId = 'your-unit-id';
const unitType = UniverInstanceType.UNIVER_SHEET;

// Load from server
const unitModel = await univerAPI.loadServerUnit(unitId, unitType);
```

Or use the collaboration facade:

```ts
const collaboration = univerAPI.getCollaboration();
const workbook = await collaboration.loadSheetAsync(unitId);
```

## Creating a New Collaborative Unit

```ts
const res = await fetch(`${httpProtocol}://${host}/universer-api/snapshot/2/unit/-/create`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 2, // 1 = doc, 2 = sheet
    name: 'New Sheet',
    creator: 'anonymous',
    templateID: null,
  }),
});
const { unitID } = await res.json();
```

## Monitoring Collaboration Status

```ts
const collaboration = univerAPI.getCollaboration();

// Get sync status
const status = collaboration.getCollaborationStatus(unitId);
// Possible values:
// NOT_COLLAB, SYNCED, PENDING, AWAITING, AWAITING_WITH_PENDING,
// FETCH_MISS, CONFLICT, OFFLINE

// Subscribe to status changes
univerAPI.addEvent(univerAPI.Event.CollaborationStatusChanged, (params) => {
  console.log('Unit:', params.unitId, 'Status:', params.status);
});

// Subscribe to collaborators
const disposable = collaboration.subscribeCollaborators(unitId, (members) => {
  console.log('Online members:', members);
});
// disposable.dispose(); // cleanup
```

## Custom Socket Service

For advanced use cases (e.g., testing, custom transport), implement `ICollaborationSocketService`:

```ts
import { ICollaborationSocketService } from '@univerjs-pro/collaboration-client';

class MySocketService implements ICollaborationSocketService {
  connect(url: string): void { /* ... */ }
  disconnect(): void { /* ... */ }
  send(message: Uint8Array): void { /* ... */ }
  onMessage(callback: (message: Uint8Array) => void): IDisposable { /* ... */ }
  onDisconnect(callback: () => void): IDisposable { /* ... */ }
}

univer.registerPlugin(UniverCollaborationClientPlugin, {
  socketService: MySocketService,
  override: [
    [ICollaborationSocketService, { useClass: MySocketService }],
  ],
  // ... other URLs
});
```

## Offline Editing

Enable offline editing so users can continue working when disconnected:

```ts
univer.registerPlugin(UniverCollaborationClientPlugin, {
  enableOfflineEditing: true,
  // ...
});
```

## Thread Comments with Data Source

For collaborative thread comments, register the data source plugin:

```ts
import { UniverThreadCommentDataSourcePlugin } from '@univerjs-pro/thread-comment-datasource';

univer.registerPlugin(UniverThreadCommentDataSourcePlugin);
```

## Retry Interceptor

Register an HTTP retry interceptor for resilience:

```ts
import { HTTPService, RetryInterceptorFactory } from '@univerjs/network';

const httpService = univer.__getInjector().get(HTTPService);
httpService.registerHTTPInterceptor({
  priority: 0,
  interceptor: RetryInterceptorFactory({ maxRetryAttempts: 3 }),
});
```
