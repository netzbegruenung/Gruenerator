# Network Layer and Other Extensions

## Network Layer (@univerjs/network)

`@univerjs/network` provides infrastructure for HTTP requests and WebSocket. Exposed through Facade extension:

```ts
import '@univerjs/network/facade';

const network = univerAPI.getNetwork();
```

### HTTP Requests

```ts
const network = univerAPI.getNetwork();

// GET
const response = await network.fetch('https://api.example.com/data');
const data = await response.json();

// POST
const result = await network.fetch('https://api.example.com/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: 'value' }),
});
```

### WebSocket

```ts
const ws = univerAPI.createSocket('wss://example.com/ws');

ws.open$.subscribe(() => {
  console.log('WebSocket opened');
  ws.send(JSON.stringify({ type: 'hello' }));
});

ws.message$.subscribe((message) => {
  console.log('Received:', message.data);
});

ws.close$.subscribe(() => {
  console.log('WebSocket closed');
});

ws.error$.subscribe((error) => {
  console.error('WebSocket error:', error);
});

// Close connection
ws.close();
```

### Request Interceptors

Plugins can register interceptors via `IHTTPService` or `WebSocketService`:

```ts
import { IHTTPService } from '@univerjs/network';

const httpService = accessor.get(IHTTPService);

// Add request headers
httpService.interceptors.request.use((config) => {
  config.headers = {
    ...config.headers,
    Authorization: `Bearer ${getToken()}`,
  };
  return config;
});

// Response handling
httpService.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.status === 401) {
      // Handle unauthorized
    }
    return Promise.reject(error);
  }
);
```

## Watermark (@univerjs/watermark)

```ts
import { UniverWatermarkPlugin } from '@univerjs/watermark';
import '@univerjs/watermark/facade'; // Side-effect import

// Register plugin
univer.registerPlugin(UniverWatermarkPlugin);

// Add text watermark
univerAPI.addWatermark('text', {
  content: 'Confidential',
  fontSize: 20,
  color: '#000000',
  opacity: 0.1,
  repeat: true,
  rotate: -45,
  x: 0,
  y: 0,
  width: 300,
  height: 200,
});

// Add image watermark
univerAPI.addWatermark('image', {
  url: 'https://example.com/logo.png',
  width: 100,
  height: 100,
  opacity: 0.2,
  repeat: true,
  x: 0,
  y: 0,
});

// Delete watermark
univerAPI.deleteWatermark();
```

### Watermark Configuration Options

Text watermark (`ITextWatermarkConfig`):
- `content`: string — Watermark text
- `fontSize`: number — Font size
- `color`: string — Color
- `opacity`: number — Opacity 0-1
- `repeat`: boolean — Whether to repeat/tile
- `rotate`: number — Rotation angle (degrees)
- `x` / `y`: number — Starting position
- `width` / `height`: number — Width and height occupied by a single watermark

Image watermark (`IImageWatermarkConfig`):
- `url`: string — Image URL
- `width` / `height`: number — Image dimensions
- `opacity`: number
- `repeat`: boolean
- `x` / `y`: number

## Action Recorder (@univerjs/action-recorder)

Record user operation sequences, which can be used for playback, automated testing, or macro generation.

```ts
import { UniverActionRecorderPlugin } from '@univerjs/action-recorder';

// Register plugin
univer.registerPlugin(UniverActionRecorderPlugin);

// Get recorder via service
const recorderService = univer.__getInjector().get(ActionRecorderService);

// Start recording
recorderService.startRecording();

// User operations...

// Stop recording and get action list
const actions = recorderService.stopRecording();
console.log(actions); // [{ commandId, params, timestamp }, ...]

// Playback (manual execution)
for (const action of actions) {
  commandService.executeCommand(action.commandId, action.params);
}
```

### Using with Facade

```ts
// Record a segment of operations
recorderService.startRecording();

// Operations executed via API will also be recorded
const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!;
sheet.getRange('A1').setValue('Hello');
sheet.getRange('A1').setBackground('#ff0000');

const actions = recorderService.stopRecording();

// Save action sequence
localStorage.setItem('my-macro', JSON.stringify(actions));

// Replay later
const savedActions = JSON.parse(localStorage.getItem('my-macro')!);
recorderService.replay(savedActions); // If the service supports replay
```

> Note: Action Recorder mainly records COMMAND and MUTATION level operations. Operations that directly modify the underlying model will not be recorded.

## Telemetry (@univerjs/telemetry)

Telemetry and performance monitoring plugin:

```ts
import { UniverTelemetryPlugin } from '@univerjs/telemetry';

univer.registerPlugin(UniverTelemetryPlugin, {
  // Configure reporting endpoint or callback
  reporter: (event) => {
    console.log('[Telemetry]', event.name, event.data);
    // Send to analytics platform
    // analytics.track(event.name, event.data);
  },
});
```

Telemetry automatically collects:
- Command execution frequency
- Rendering performance metrics
- Memory usage (with debugger)
- User interaction paths

## Debugger Plugin (@univerjs/debugger)

Very useful in development environment:

```ts
import { UniverDebuggerPlugin } from '@univerjs/debugger';

univer.registerPlugin(UniverDebuggerPlugin, {
  fab: true,              // Show floating debug button
  performanceMonitor: {
    enabled: true,        // Performance monitoring panel
  },
});
```

Debugger provides:
- Command execution log
- Performance analysis (FPS, memory, render time)
- Mutation history viewing
- Dependency injection container inspection
