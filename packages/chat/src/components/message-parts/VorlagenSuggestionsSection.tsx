'use client';

import { type SharepicVorlagenSuggestions } from '@gruenerator/contracts';
import { memo, useState } from 'react';

import { useChatNavigation } from '../../context/ChatNavigationContext';
import { stashVorlageBeitrag } from '../../lib/vorlageBeitragHandoff';

/**
 * The gallery `vorlagen_vorschlagen` sends: catalogue Vorlagen picked for the
 * post, each with the one line why. A Vorlage opens in the studio — with the
 * post when the model passed one along, as the plain copy otherwise.
 *
 * Thumbnails come from our own `/api/sharepic-vorlagen/:id/thumb`, never a
 * third-party host (the same rule `SearchImagesSection` follows).
 */
export const VorlagenSuggestionsSection = memo(function VorlagenSuggestionsSection({
  data,
}: {
  data: SharepicVorlagenSuggestions;
}) {
  const nav = useChatNavigation();
  const go = (path: string) => (nav ? nav.navigate(path) : window.location.assign(path));

  const open = (id: string) => {
    if (data.beitrag) stashVorlageBeitrag(id, data.beitrag);
    go(`/studio/vorlage/${encodeURIComponent(id)}${data.beitrag ? '?mitBeitrag=1' : ''}`);
  };

  return (
    <section className="my-3 w-full" aria-label="Passende Sharepic-Vorlagen">
      <p className="mb-2 text-xs font-medium text-foreground">
        Diese Design-Optionen passen zu deinem Beitrag
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.vorlagen.map((v) => (
          <li key={v.id} className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => open(v.id)}
              className="group overflow-hidden rounded-xl border border-border bg-surface text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`${v.titel}: ${data.beitrag ? 'mit meinem Text erstellen' : 'Kopie bearbeiten'}`}
            >
              <Thumb src={v.thumbUrl} tall={v.format === 'post-portrait-tall'} />
            </button>
            <span className="text-sm font-medium leading-tight text-foreground">
              {v.titel}
              {v.seiten > 1 && (
                <span className="font-normal text-foreground-muted"> · {v.seiten} Seiten</span>
              )}
            </span>
            <span className="text-xs leading-snug text-foreground-muted">{v.grund}</span>
            <button
              type="button"
              onClick={() => open(v.id)}
              className="self-start text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {data.beitrag ? 'Mit meinem Text erstellen' : 'Kopie bearbeiten'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
});

function Thumb({ src, tall }: { src: string; tall: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`${tall ? 'aspect-[3/4]' : 'aspect-[4/5]'} w-full bg-muted`}>
      {!failed && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError reacts to a failed image load, not a user interaction.
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
      )}
    </div>
  );
}
