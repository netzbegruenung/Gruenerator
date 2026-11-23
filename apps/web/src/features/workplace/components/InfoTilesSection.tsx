import { DOKU_URL } from '@gruenerator/shared/links';

import {
  BookIllustration,
  ExchangeIllustration,
  IllustratedTileGrid,
  type IllustratedTileProps,
  PadlockIllustration,
  WindTurbineIllustration,
} from '../../../components/common/IllustratedTile';

import { ArbeitenSection } from './ArbeitenSections';

const TILES: IllustratedTileProps[] = [
  { title: 'Dokumentation', illustration: <BookIllustration />, href: DOKU_URL },
  { title: 'Transparenz', illustration: <WindTurbineIllustration />, to: '/transparenz' },
  { title: 'MCP-Server', illustration: <ExchangeIllustration />, to: '/apps' },
  { title: 'Datenschutz', illustration: <PadlockIllustration />, to: '/datenschutz' },
];

/** Where the Grünerator explains itself: docs, transparency, MCP and privacy. */
export function InfoTilesSection() {
  return (
    <ArbeitenSection title="Transparenz, MCP & Co">
      <IllustratedTileGrid tiles={TILES} />
    </ArbeitenSection>
  );
}
