/**
 * Eine Remote-Sammlung nur für Tests. Solange keine echte Sammlung auf
 * `remote` steht, ist das der einzige Weg, die Remote-Zweige zu fahren.
 */
import { SYSTEM_COLLECTIONS } from '../../../config/systemCollectionsConfig.js';

export const REMOTE_TEST_ID = 'remote-test-system';

/** Trägt die Sammlung ein; der Rückgabewert trägt sie wieder aus. */
export function registerRemoteTestCollection(): () => void {
  SYSTEM_COLLECTIONS[REMOTE_TEST_ID] = {
    id: REMOTE_TEST_ID,
    key: 'remote-test',
    remote: 'bundestag-wrapped',
    name: 'Remote-Test',
    description: 'Testsammlung hinter einer HTTP-API',
    minQuality: 0,
    recallLimit: 60,
    filterableFields: [{ field: 'party', label: 'Fraktion', type: 'keyword' }],
    mcpExposed: false,
  };
  return () => {
    delete SYSTEM_COLLECTIONS[REMOTE_TEST_ID];
  };
}
