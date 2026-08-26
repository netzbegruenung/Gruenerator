/**
 * Dev-only harness for `notebook-card-click.spec.ts`.
 *
 * Mounts the two cover variants of `NotebookGalleryCard` side by side — the
 * designed webp (`coverImage`, wie Landesverbände) und die gerenderte Cover-Art
 * (`coverNode`, wie „Von der Basis" und die eigenen Notebooks) — plus die
 * dauerhaft sichtbare Aktion. Die /wissen-Seite selbst bräuchte Anmeldung,
 * Backend und öffentliche Notebooks, und keines davon sagt etwas über die
 * Stapelreihenfolge der Karte.
 *
 * Served by the Vite dev server at /tests/e2e/harness/notebook-card.html. It is
 * NOT part of the production build: `vite build` only walks index.html's graph.
 */
import { createRoot } from 'react-dom/client';

import NotebookCoverArt from '../../../src/features/notebook/components/NotebookCoverArt';
import NotebookGalleryCard from '../../../src/features/notebook/components/NotebookGalleryCard';

import './notebookCardHarness';

import '../../../src/assets/styles/index.css';

// 1×1-Pixel, damit der webp-Zweig ein echtes <img> rendert, ohne eine Datei zu
// laden — geprüft wird die Stapelreihenfolge, nicht das Motiv.
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

const record = (what: string) => {
  window.__notebookCardHarness ??= { hits: [] };
  window.__notebookCardHarness.hits.push(what);
};

function Harness() {
  return (
    <div className="flex gap-8 p-8">
      <div data-testid="card-cover-image" className="w-[220px]">
        <NotebookGalleryCard
          title="Landesverbände"
          meta="16 Landesverbände"
          coverImage={PIXEL}
          accent="pink"
          onActivate={() => record('cover-image')}
        />
      </div>
      <div data-testid="card-cover-node" className="w-[220px]">
        <NotebookGalleryCard
          title="Von der Basis"
          coverNode={<NotebookCoverArt title="Von der Basis" subtitle="3 öffentliche Notebooks" />}
          accent="pink"
          onActivate={() => record('cover-node')}
          action={
            <button type="button" aria-label="Gefällt mir" onClick={() => record('action')}>
              ♥
            </button>
          }
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
