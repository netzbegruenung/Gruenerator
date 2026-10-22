import { useState } from 'react';

import { MarketplaceSheet } from '../marketplace/MarketplaceSheet';

import { NotebookTile } from './NotebookTile';

/**
 * „Zum Marktplatz" — what others list publicly lives in the Marktplatz; this
 * tile opens it on the notebooks. Gated on `enabled` (auth), so a signed-out
 * screen never asks the auth-only endpoint.
 */
export function MarketplaceNotebooksTile({ enabled, size }: { enabled: boolean; size: number }) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <NotebookTile
        icon="storefront-outline"
        title="Zum Marktplatz"
        meta="Öffentliche Notebooks entdecken."
        size={size}
        onPress={() => setOpen(true)}
      />
      <MarketplaceSheet
        visible={open}
        onClose={() => setOpen(false)}
        kinds={['notebook']}
        title="Notebooks im Marktplatz"
      />
    </>
  );
}
