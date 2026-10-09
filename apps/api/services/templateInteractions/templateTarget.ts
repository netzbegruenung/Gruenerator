/**
 * Gibt es diese Vorlage für diese Person? Prüfung für Likes, Merken und
 * Reaktionen auf `template`-ids, die zwei Herkünfte haben:
 *
 * - UUID → `user_templates`-Zeile, nicht im Papierkorb, und entweder in der
 *   Galerie (öffentlich + veröffentlicht) oder die eigene.
 * - sonst → Grünerator-Vorlage aus dem Katalog (`getSharepicVorlage`).
 *
 * Fremde private Vorlagen melden `not_found`, nicht `forbidden` — sonst verriete
 * die Antwort, dass es sie gibt.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getSharepicVorlage } from '../sharepicVorlagen/catalog.js';

import type { PostgresService } from '../../database/services/PostgresService.js';

export interface TemplateTargetDeps {
  postgres: Pick<PostgresService, 'queryOne'>;
  getSharepicVorlage: (id: string) => unknown;
}

function defaultDeps(): TemplateTargetDeps {
  return { postgres: getPostgresInstance(), getSharepicVorlage };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function templateExistsFor(
  userId: string,
  templateId: string,
  deps: TemplateTargetDeps = defaultDeps()
): Promise<boolean> {
  if (!UUID_RE.test(templateId)) return deps.getSharepicVorlage(templateId) !== null;
  const row = await deps.postgres.queryOne(
    `SELECT 1 AS ok FROM user_templates
      WHERE id = $1 AND deleted_at IS NULL
        AND ((is_private = false AND status = 'published') OR user_id = $2)`,
    [templateId, userId],
    { table: 'user_templates' }
  );
  return row !== null;
}
