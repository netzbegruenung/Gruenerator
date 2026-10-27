import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
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
          // createInitialState frisch. Der Asset-Katalog des Hosts ist das eine
          // Modul-Register: das Setup trägt den des Grünerators ein, und
          // `assetCatalog.vitest.ts` setzt ihn nach seinem Probe-Katalog sofort
          // zurück.
          isolate: false,
          maxWorkers: 1,
          setupFiles: ['./vitest.setup.assets.ts'],
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
        // @tanstack/react-query ships a nested older react; without one copy a
        // hook under QueryClientProvider dies at "reading 'useEffect'". Same
        // fix as apps/web/vitest.config.ts.
        resolve: {
          dedupe: ['react', 'react-dom'],
          alias: {
            react: path.resolve(import.meta.dirname, '../../node_modules/react'),
            'react-dom': path.resolve(import.meta.dirname, '../../node_modules/react-dom'),
          },
        },
        test: {
          name: 'dom',
          server: { deps: { inline: ['@tanstack/react-query'] } },
          include: ['**/*.vitest.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.assets.ts', './vitest.setup.kinds.ts', './vitest.setup.ts'],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
