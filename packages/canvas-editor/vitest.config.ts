import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Inline `test.projects` erben das `resolve` der Wurzel nicht — beide Lanes
// bekommen dasselbe Objekt, wie in apps/web.
const resolve = {
  alias: {
    // Subpath resolved via vite alias in the apps (no exports-map entry) —
    // mirror it here so configs importing runtime values from it load.
    '@gruenerator/shared/canvas-editor': path.resolve(
      import.meta.dirname,
      '../shared/src/canvas-editor/index.ts'
    ),
  },
};

export default defineConfig({
  resolve,
  test: {
    projects: [
      {
        resolve,
        test: {
          name: 'node',
          include: ['**/*.vitest.ts'],
          environment: 'node',
          // Fünf Dateien erreichen über loadCanvasConfig bzw. statische Config-
          // Imports denselben transitiven Graphen (sidebar-Barrel → recharts,
          // react-konva/konva, @iconify) — kalt 2–20 s je Fork (#2840). Mit den
          // Vorgaben (isolate:true, ein Worker je Kern) zahlte jeder Fork neu;
          // isolate:false allein hilft nicht, weil die fünf Dateien auf getrennten
          // Forks landen. Erst EIN geteilter Fork lädt den Graphen genau einmal:
          // gemessen fällt der Lauf allein von 3,1 s auf 2,1 s Wandzeit, die
          // kumulierte Arbeit von ~18 s auf ~2,5 s (import 6,6 s → 0,09 s) — und
          // Letztere ist der Maßstab, wenn 48 Turbo-Tasks die Maschine sättigen.
          // Sicher, solange keine Testdatei Modulzustand mutiert: hier gibt es
          // kein vi.mock, kein Global-/Env-Stubbing, keine Schreibzugriffe auf
          // die Config-Singletons — Tests lesen nur und erzeugen Zustand über
          // createInitialState frisch.
          isolate: false,
          maxWorkers: 1,
          // Getrennte Gruppen, weil die Lanes verschiedene `maxWorkers`
          // haben — vitest 4 lehnt sonst den ganzen Lauf ab. Die schnelle
          // Node-Lane zuerst.
          sequence: { groupOrder: 0 },
        },
      },
      {
        // React-Render-Lane, wie in apps/web: eigener jsdom-Zweig auf
        // `*.vitest.tsx`, damit die schnelle Node-Lane unberührt bleibt. Der
        // React-Compiler-Preset ist derselbe, den `vite build` fährt.
        plugins: [babel({ presets: [reactCompilerPreset()] })],
        resolve,
        test: {
          name: 'dom',
          include: ['**/*.vitest.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
