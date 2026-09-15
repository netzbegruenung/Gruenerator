'use client';

import { memo } from 'react';

import { useCitations } from '../../context/CitationContext';

import { CitationBadge } from './CitationPopover';

/**
 * Renders a `<citation n="…">` element emitted by `rewriteCitationMarkers`
 * (Streamdown path) as a CitationBadge. Resolves the backing citation from
 * CitationContext at render time, so the badge needs no closure over the
 * citation map and the Streamdown components map can stay a module-level
 * constant.
 *
 * While streaming, citations only arrive at `done`, so `citation` is usually
 * undefined here — CitationBadge then renders the numberless placeholder dot,
 * the same inline-reserved box the react-markdown path uses.
 */
export const CitationMarker = memo(function CitationMarker({ n }: { n?: string | number }) {
  const citations = useCitations();
  const citationId = typeof n === 'string' ? parseInt(n, 10) : n;
  if (typeof citationId !== 'number' || !Number.isFinite(citationId)) return null;
  const citation = citations.find((c) => c.id === citationId);
  return <CitationBadge citationId={citationId} citation={citation} />;
});
