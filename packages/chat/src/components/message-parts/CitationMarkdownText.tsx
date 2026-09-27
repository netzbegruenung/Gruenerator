'use client';

import { memo } from 'react';

import { isStreamdownRendererEnabled } from '../../lib/streamdownRenderer';

import { LegacyCitationMarkdownText } from './LegacyCitationMarkdownText';
import { StreamdownMarkdownText } from './StreamdownMarkdownText';

/**
 * Renderer switch for assistant text parts: Streamdown when the localStorage
 * flag opts in, legacy react-markdown otherwise (default until validated).
 * See streamdownRenderer.ts for how to flip it.
 */
function CitationMarkdownTextImpl() {
  return isStreamdownRendererEnabled() ? (
    <StreamdownMarkdownText />
  ) : (
    <LegacyCitationMarkdownText />
  );
}

export const CitationMarkdownText = memo(CitationMarkdownTextImpl);
