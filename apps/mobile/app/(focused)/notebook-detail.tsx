import { Redirect, useLocalSearchParams } from 'expo-router';

import { routeWithParams } from '../../types/routes';

/**
 * The notebook page moved to `/notebook/<id>` (#4017). This path stays
 * forever: shipped binaries, OTA-updated apps and links still open it. Its
 * `kind` param is dropped — the page derives it from the id.
 */
export default function LegacyNotebookDetailRoute() {
  const { notebookId, title } = useLocalSearchParams<{ notebookId: string; title?: string }>();
  return (
    <Redirect
      href={routeWithParams('/notebook/[id]', { id: notebookId, ...(title && { title }) })}
    />
  );
}
