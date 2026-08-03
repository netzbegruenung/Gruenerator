# Framework Integration Differences

## Node.js / Headless

For server-side rendering, automated testing, or data pipelines where no browser
DOM exists, use the headless template in `assets/templates/node/`.

Key differences from browser integration:
- **No** `UniverRenderEnginePlugin`, `UniverUIPlugin`, or any `*UIPlugin`
- **No** CSS imports (`@univerjs/design`, `@univerjs/themes`)
- **No** facade imports from UI packages
- Formula engine is still required for Sheets
- Use `workbook.save()` to export JSON snapshots

## React

```tsx
import { useEffect, useRef } from 'react';
import { LocaleType, LogLevel, Univer, UniverInstanceType } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import { defaultTheme } from '@univerjs/themes';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';

// Register Facade side-effects — import only what you need.
import '@univerjs/core/facade';
import '@univerjs/sheets/facade';
import '@univerjs/sheets-ui/facade';

export default function UniverSheet() {
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<Univer | null>(null);

  useEffect(() => {
    const univer = new Univer({
      theme: defaultTheme,
      locale: LocaleType.EN_US,
      logLevel: LogLevel.VERBOSE,
    });

    // Order: engines → UI infra → unit core → unit UI
    univer.registerPlugins([
      [UniverRenderEnginePlugin],
      [UniverUIPlugin, { container: containerRef.current! }],
      [UniverDocsPlugin],
      [UniverDocsUIPlugin],
      [UniverSheetsPlugin],
      [UniverSheetsUIPlugin],
    ]);

    univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
      id: 'workbook-1',
      name: 'Demo',
      sheetOrder: ['sheet-1'],
      sheets: {
        'sheet-1': {
          id: 'sheet-1',
          name: 'Sheet1',
          rowCount: 100,
          columnCount: 20,
        },
      },
    });

    const univerAPI = FUniver.newAPI(univer);
    (window as any).univerAPI = univerAPI;
    univerRef.current = univer;

    return () => {
      univer.dispose();
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
}
```

Key points:
- The `container` of `UniverUIPlugin` can directly accept a DOM node reference
- Initialize and destroy inside `useEffect` to avoid SSR issues
- Univer's CSS needs to be imported globally (`@univerjs/design/lib/index.css` or `@univerjs/ui/lib/index.css`)

## Vue 3

```vue
<template>
  <div ref="container" style="width: 100%; height: 100vh;" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { LocaleType, Univer, UniverInstanceType } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverVue3AdapterPlugin } from '@univerjs/ui-adapter-vue3';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';

import '@univerjs/core/facade';
import '@univerjs/sheets/facade';

const container = ref<HTMLDivElement>();
let univer: Univer | null = null;

onMounted(() => {
  univer = new Univer({ locale: LocaleType.EN_US });
  univer.registerPlugins([
    [UniverRenderEnginePlugin],
    [UniverUIPlugin, { container: container.value! }],
    [UniverVue3AdapterPlugin],
    [UniverSheetsPlugin],
    [UniverSheetsUIPlugin],
  ]);
  univer.createUnit(UniverInstanceType.UNIVER_SHEET, { /* ... */ });
  (window as any).univerAPI = FUniver.newAPI(univer);
});

onUnmounted(() => {
  univer?.dispose();
});
</script>
```

Key points:
- Must register `UniverVue3AdapterPlugin`
- Otherwise same as React

## Web Component

```ts
import { Univer, UniverInstanceType, LocaleType } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverWebComponentAdapterPlugin } from '@univerjs/ui-adapter-web-component';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';

import '@univerjs/core/facade';
import '@univerjs/sheets/facade';

const univer = new Univer({ locale: LocaleType.EN_US });
univer.registerPlugins([
  [UniverRenderEnginePlugin],
  [UniverUIPlugin, { container: 'app' }],
  [UniverWebComponentAdapterPlugin],
  [UniverSheetsPlugin],
  [UniverSheetsUIPlugin],
]);
univer.createUnit(UniverInstanceType.UNIVER_SHEET, { /* ... */ });
(window as any).univerAPI = FUniver.newAPI(univer);
```

Key points:
- Register `UniverWebComponentAdapterPlugin`
- Container can be a string selector (e.g. `'app'`) or a DOM node

## Mobile / Touch

Univer has built-in touch support for mobile browsers. No extra plugin is required, but you should configure the viewport and container appropriately:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

```ts
// Use a full-screen container for mobile
univer.registerPlugin(UniverUIPlugin, {
  container: document.getElementById('app')!,
  // Mobile-optimized config
  toolbar: {
    // Use collapsed toolbar on small screens
    hidden: window.innerWidth < 768,
  },
});
```

Key behaviors on mobile:
- **Touch scrolling** — single finger scrolls the sheet; two-finger pinch zooms
- **Column/row resize** — long-press header then drag
- **Cell selection** — tap to select, double-tap to enter edit mode
- **Virtual keyboard** — automatically adjusts viewport when the native keyboard opens

> For a dedicated mobile UI, refer to the official `examples/src/sheets-mobile/` in the Univer repository.

## iframe Embedding

To embed Univer inside an iframe (e.g. for sandboxing or cross-origin embedding):

```ts
// Parent page
const iframe = document.createElement('iframe');
iframe.src = '/univer-editor.html';
iframe.sandbox = 'allow-scripts allow-same-origin';
iframe.style.cssText = 'width:100%;height:100%;border:none;';
document.body.appendChild(iframe);

// Communicate via postMessage
iframe.onload = () => {
  iframe.contentWindow!.postMessage(
    { type: 'INIT', data: workbookSnapshot },
    '*'
  );
};

// Receive updates from iframe
window.addEventListener('message', (e) => {
  if (e.data.type === 'SAVE') {
    saveToServer(e.data.snapshot);
  }
});
```

```ts
// Inside iframe (univer-editor.html)
window.addEventListener('message', (e) => {
  if (e.data.type === 'INIT') {
    const univer = new Univer({ ... });
    univer.createUnit(UniverInstanceType.UNIVER_SHEET, e.data.data);
  }
});

// Auto-save every 5s
setInterval(() => {
  const snapshot = univerAPI.getActiveWorkbook()!.save();
  parent.postMessage({ type: 'SAVE', snapshot }, '*');
}, 5000);
```

Key points:
- Use `sandbox="allow-scripts allow-same-origin"` for security
- Always validate `event.origin` in production before processing messages
- Keep iframe and parent on the same origin to avoid CORS issues with Web Workers

## CSS Import

All browser integrations must import Univer's global styles:

```ts
// Entry file
import '@univerjs/design/lib/index.css';
// or
import '@univerjs/ui/lib/index.css';
```

If using themes:

```ts
import { defaultTheme } from '@univerjs/themes';
import { ThemeSwitcherService } from '@univerjs/ui';
new ThemeSwitcherService().injectThemeToHead(defaultTheme);
```
