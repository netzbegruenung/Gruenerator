import { type ExplainableContent, type ExplainableSection } from '@gruenerator/contracts';
import { Skeleton } from '@gruenerator/ui';
import { Fragment, type ReactNode } from 'react';

interface ExplainableViewProps {
  content: ExplainableContent;
  /** URL of the illustration for section `index`; only asked for finished images. */
  imageUrl: (sectionIndex: number) => string;
  /** Rendered between the summary and the first section (toolbar, download). */
  actions?: ReactNode;
}

const MARKER_RE = /\[(\d+)\]/g;

export function sourceAnchorId(index: number): string {
  return `quelle-${index}`;
}

/**
 * Turns `[n]` markers into superscript links to the source list. A marker
 * without a matching source stays plain text — the model wrote it, the server
 * never vouched for it.
 */
function renderWithMarkers(text: string, sourceIndexes: ReadonlySet<number>): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKER_RE)) {
    const n = Number(match[1]);
    if (!sourceIndexes.has(n)) continue;
    const start = match.index;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <sup key={`m-${start}`} className="ml-px">
        <a
          href={`#${sourceAnchorId(n)}`}
          aria-label={`Quelle ${n}`}
          className="rounded-sm px-0.5 text-xs font-semibold text-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-600"
        >
          [{n}]
        </a>
      </sup>
    );
    last = start + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function SectionImage({ section, src }: { section: ExplainableSection; src: string | null }) {
  const image = section.image;
  if (!image || image.status === 'failed') return null;

  if (image.status === 'pending' || !src) {
    return (
      <div aria-busy="true" className="my-lg">
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        <span className="sr-only">Illustration wird erstellt …</span>
      </div>
    );
  }

  return (
    <figure className="my-lg">
      <img
        src={src}
        alt={image.alt}
        loading="lazy"
        className="w-full rounded-lg bg-background-alt"
      />
      <figcaption className="mt-xs text-xs text-grey-500">KI-generierte Illustration</figcaption>
    </figure>
  );
}

/**
 * The explainable as a reader sees it — owner page and share link render the
 * same template, so what the owner checks before sharing is what others get.
 */
export function ExplainableView({ content, imageUrl, actions }: ExplainableViewProps) {
  const sourceIndexes = new Set(content.sources.map((s) => s.index));
  const sources = [...content.sources].sort((a, b) => a.index - b.index);
  const glossary = content.glossary ?? [];

  return (
    <article className="mx-auto w-full max-w-[68ch] text-foreground">
      <header className="mb-xl">
        <p className="mb-xs text-sm font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-300">
          Einfach erklärt
        </p>
        <h1 className="text-4xl font-semibold leading-tight text-foreground-heading text-balance max-md:text-3xl">
          {content.title}
        </h1>
        <p className="mt-md text-xl leading-relaxed max-md:text-lg">{content.summary}</p>
        {actions && <div className="mt-lg">{actions}</div>}
      </header>

      {content.sections.map((section, i) => (
        <section key={section.heading} className="mb-xl">
          <h2 className="mb-sm text-2xl font-semibold leading-snug text-foreground-heading max-md:text-xl">
            {section.heading}
          </h2>
          {section.paragraphs.map((p) => (
            <p key={p} className="mb-md text-lg leading-relaxed">
              {renderWithMarkers(p, sourceIndexes)}
            </p>
          ))}
          <SectionImage
            section={section}
            src={section.image?.status === 'done' ? imageUrl(i) : null}
          />
        </section>
      ))}

      {content.keyTakeaways.length > 0 && (
        <section
          aria-labelledby="explainable-takeaways"
          className="mb-xl rounded-lg border-l-4 border-primary-600 bg-background-alt px-lg py-md dark:border-primary-400"
        >
          <h2
            id="explainable-takeaways"
            className="mb-sm text-xl font-semibold text-foreground-heading"
          >
            Das Wichtigste
          </h2>
          <ul className="list-disc space-y-xs pl-lg text-lg leading-relaxed">
            {content.keyTakeaways.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {glossary.length > 0 && (
        <section aria-labelledby="explainable-glossary" className="mb-xl">
          <h2
            id="explainable-glossary"
            className="mb-sm text-xl font-semibold text-foreground-heading"
          >
            Begriffe
          </h2>
          <dl className="space-y-sm">
            {glossary.map((g) => (
              <Fragment key={g.term}>
                <dt className="font-semibold text-foreground-heading">{g.term}</dt>
                <dd className="mb-sm leading-relaxed">{g.definition}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      )}

      {sources.length > 0 && (
        <section aria-labelledby="explainable-sources" className="mb-xl">
          <h2
            id="explainable-sources"
            className="mb-sm text-xl font-semibold text-foreground-heading"
          >
            Quellen
          </h2>
          <ol className="space-y-xs text-sm leading-relaxed">
            {sources.map((s) => (
              <li key={s.index} id={sourceAnchorId(s.index)} className="flex gap-xs scroll-mt-lg">
                <span className="shrink-0 tabular-nums text-grey-500">[{s.index}]</span>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-words text-link underline underline-offset-2"
                  >
                    {s.title}
                  </a>
                ) : (
                  <span className="break-words">{s.title}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="border-t border-grey-200 pt-md text-sm text-grey-500 dark:border-grey-700">
        Erstellt mit dem Grünerator. Die Bilder wurden mit KI erzeugt und dienen nur der
        Veranschaulichung.
      </footer>
    </article>
  );
}
