/**
 * System notebooks as marketplace items: which registry ids a link, a like, a
 * save or a comment may reach. The multi-source „Grünerator" notebook only had
 * a page on `/wissen`, which is gone; it lives on as the chat's `@alle`
 * mention, not as a notebook to open.
 */
import { type InstanceId } from '@gruenerator/shared/instances';
import { isNotebookResolvableIn, NOTEBOOK_REGISTRY } from '@gruenerator/shared/notebooks';

export const AGGREGATE_NOTEBOOK_ID = 'gruenerator-notebook';

/** Also true for one the instance merely hides (`isNotebookResolvableIn`). */
export function isResolvableSystemNotebook(id: string, instanceId: InstanceId): boolean {
  return (
    id !== AGGREGATE_NOTEBOOK_ID &&
    NOTEBOOK_REGISTRY.some((nb) => nb.id === id) &&
    isNotebookResolvableIn(id, instanceId)
  );
}
