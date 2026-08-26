import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Subpath resolved via vite alias in the apps (no exports-map entry) —
      // mirror it here so configs importing runtime values from it load.
      '@gruenerator/shared/canvas-editor': path.resolve(
        __dirname,
        '../shared/src/canvas-editor/index.ts'
      ),
    },
  },
  test: {
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
  },
});
