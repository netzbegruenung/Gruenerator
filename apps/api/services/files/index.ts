/**
 * Die Anbieter-Registry der Dateiablagen.
 *
 * Total über `CloudProviderId` (CLAUDE.md, *Registry-Pflicht für neue
 * ID-Mengen`): ein zweiter Anbieter — IceWarp — bekommt seinen Eintrag in der
 * Union und MUSS hier auftauchen, sonst bricht der Build. Das ist billiger als
 * ein Anbieter, den niemand erreicht, weil eine Zuordnung fehlt.
 */

import { nextcloudShareProvider } from './nextcloudShareProvider.js';
import { type CloudFileProvider, type CloudProviderId, type CloudRoot } from './types.js';

export const CLOUD_FILE_PROVIDERS: Record<CloudProviderId, CloudFileProvider> = {
  'nextcloud-share': nextcloudShareProvider,
};

export function getCloudProvider(id: CloudProviderId): CloudFileProvider {
  return CLOUD_FILE_PROVIDERS[id];
}

/** Alle Wurzeln über alle Anbieter — die Antwort auf „welche Ordner gibt es". */
export async function listAllCloudRoots(userId: string): Promise<CloudRoot[]> {
  const perProvider = await Promise.all(
    Object.values(CLOUD_FILE_PROVIDERS).map((provider) =>
      provider.listRoots(userId).catch(() => [] as CloudRoot[])
    )
  );
  return perProvider.flat();
}

export {
  CLOUD_BROWSE_MAX_DEPTH,
  CLOUD_BROWSE_MAX_FILES,
  NextcloudShareProvider,
  hrefToRootRelativePath,
  nextcloudShareProvider,
} from './nextcloudShareProvider.js';

export type {
  CloudConnectionErrorCode,
  CloudConnectionTest,
  CloudDownload,
  CloudEntry,
  CloudFileProvider,
  CloudFindQuery,
  CloudListing,
  CloudListOptions,
  CloudProviderId,
  CloudRoot,
  CloudRootOrigin,
} from './types.js';
