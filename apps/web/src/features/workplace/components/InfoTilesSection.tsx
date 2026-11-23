import { DOKU_URL } from '@gruenerator/shared/links';

import {
  BookIllustration,
  ExchangeIllustration,
  PadlockIllustration,
  WindTurbineIllustration,
} from '../../../components/common/IllustratedTile';

import { type ToolCard, ToolCardsSection } from './ArbeitenSections';

/** Four hues, none shared with a neighbour; the picture plays on hover and focus. */
const TILES: ToolCard[] = [
  {
    id: 'info-doku',
    title: 'Dokumentation',
    theme: 'docs',
    href: DOKU_URL,
    visual: <BookIllustration />,
  },
  {
    id: 'info-transparenz',
    title: 'Transparenz',
    theme: 'boards',
    path: '/transparenz',
    visual: <WindTurbineIllustration />,
  },
  {
    id: 'info-mcp',
    title: 'MCP-Server',
    theme: 'canvas-ki',
    path: '/apps',
    visual: <ExchangeIllustration />,
  },
  {
    id: 'info-datenschutz',
    title: 'Datenschutz',
    theme: 'projekte',
    path: '/datenschutz',
    visual: <PadlockIllustration />,
  },
];

/** Where the Grünerator explains itself: docs, transparency, MCP and privacy. */
export function InfoTilesSection() {
  return (
    <ToolCardsSection
      title="Transparenz, MCP & Co"
      tools={TILES}
      gridClassName="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
    />
  );
}
