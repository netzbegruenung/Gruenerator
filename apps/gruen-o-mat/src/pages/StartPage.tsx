import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  NOTEBOOKS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type NotebookEntry,
} from '../config/notebooks';

function NotebookCard({ notebook, index }: { notebook: NotebookEntry; index: number }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/chat/${notebook.collectionId}`)}
      className="group relative flex flex-col items-start gap-3 rounded-2xl border border-border
                 bg-card p-5 text-left transition-all duration-200
                 hover:-translate-y-1 hover:shadow-lg hover:border-primary/30
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                 animate-card-enter"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {notebook.featured && (
        <span
          className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5
                         text-xs font-semibold text-white shadow-sm"
        >
          Empfohlen
        </span>
      )}

      <div className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-xl
                         bg-primary/8 text-2xl transition-transform duration-200
                         group-hover:scale-110"
        >
          {notebook.emoji}
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-foreground leading-tight">{notebook.name}</h3>
          <span
            className="inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium leading-none"
            style={{ color: notebook.badgeColor, backgroundColor: notebook.badgeBg }}
          >
            {notebook.badgeLabel}
          </span>
        </div>
      </div>

      <p className="text-sm text-foreground-muted leading-relaxed">{notebook.description}</p>

      <div
        className="mt-auto flex items-center gap-1.5 pt-1 text-xs font-medium text-primary
                      opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        Fragen stellen
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

export function StartPage() {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    notebooks: NOTEBOOKS.filter((n) => n.category === cat),
  }));

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-16 pb-12 sm:pt-20 sm:pb-16">
        <div className="hero-glow" aria-hidden="true" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl
                          bg-primary text-white text-2xl font-bold shadow-lg
                          animate-card-enter"
          >
            G
          </div>
          <h1
            className="mb-3 font-heading text-4xl font-bold tracking-tight text-foreground
                         sm:text-5xl animate-card-enter"
            style={{ animationDelay: '80ms' }}
          >
            Grün-O-Mat
          </h1>
          <p
            className="mx-auto max-w-[28rem] text-base text-foreground-muted sm:text-lg
                        animate-card-enter"
            style={{ animationDelay: '160ms' }}
          >
            Frag die Grünen Dokumente — entdecke Positionen und Programme von
            Bündnis&nbsp;90/Die&nbsp;Grünen.
          </p>
        </div>
      </section>

      {/* Notebook sections */}
      <main className="w-full flex-1 px-4 pb-16">
        <div className="mx-auto w-full max-w-[72rem]">
          {grouped.map(({ category, label, notebooks }) => (
            <section key={category} className="mb-12">
              <h2
                className="mb-5 text-lg font-semibold text-foreground-muted tracking-wide uppercase
                             text-[13px]"
              >
                {label}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {notebooks.map((nb, i) => (
                  <NotebookCard key={nb.collectionId} notebook={nb} index={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-6 text-center">
        <p className="text-xs text-foreground-muted">
          Antworten basieren auf offiziellen Dokumenten und werden von KI generiert.
        </p>
        <p className="mt-1 text-xs text-foreground-muted">
          Ein Projekt von{' '}
          <a
            href="https://gruenerator.eu"
            className="underline underline-offset-2 transition-colors hover:text-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            Grünerator
          </a>
        </p>
      </footer>
    </div>
  );
}
