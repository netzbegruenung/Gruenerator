import { stickerDiscoverToMarketplaceHref } from '@gruenerator/shared/marketplace';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * „Entdecken" ist im Marktplatz aufgegangen; der alte Pfad leitet für immer
 * weiter (URL-Sonderrecht, CLAUDE.md), samt Suche. Eigene Datei, damit der
 * Marktplatz-Filtercode (Schemas, Agent-Kataloge) nicht über routes.ts im
 * Entry landet (#5891).
 */
export function StickerDiscoverRedirectComponent() {
  const { search } = useLocation();
  return <Navigate to={stickerDiscoverToMarketplaceHref(new URLSearchParams(search))} replace />;
}

export default StickerDiscoverRedirectComponent;
