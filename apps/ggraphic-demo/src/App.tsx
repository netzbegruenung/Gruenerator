import { ConfigCanvas } from '@gruenerator/canvas-editor';

import { demoTemplate } from './demoTemplate';

const INITIAL_PROPS = { headline: 'Hello from the neutral brand' };

export function App() {
  return (
    <main style={{ maxWidth: 540, margin: '32px auto', padding: '0 16px' }}>
      <h1 style={{ fontFamily: 'system-ui, sans-serif', fontSize: 20 }}>ggraphic demo</h1>
      <ConfigCanvas config={demoTemplate} initialProps={INITIAL_PROPS} />
    </main>
  );
}
