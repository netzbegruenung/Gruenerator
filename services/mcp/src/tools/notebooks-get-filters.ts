import { z } from 'zod';

import { callGrueneratorApi, notebooksApiError } from '../api-client.ts';

export const notebooksGetFiltersTool = {
  name: 'notebooks_get_filters',
  description: `Liefert die verfügbaren Filterwerte (Facetten) für einen Landesverband.

Hilfreich, wenn du in \`notebooks_ask\` oder \`notebooks_search\` mit \`filters\` einschränken willst —
z.B. nach Datum, Kategorie oder Inhaltstyp.

Erfordert einen Bearer API-Key, dessen Scope den \`landesverband\` abdeckt.`,

  inputSchema: {
    landesverband: z.string().describe('Landesverband-Code (z.B. HH, BY, BE)'),
  },

  async handler({ landesverband }: { landesverband: string }, apiKey: string) {
    if (!apiKey) {
      return {
        error: true,
        message: 'No API key forwarded — set Authorization: Bearer header on the MCP request.',
      };
    }
    const result = await callGrueneratorApi('/api/v1/notebooks/filters', {
      apiKey,
      query: { landesverband },
    });
    if (!result.ok) {
      return notebooksApiError(result.status, result.message);
    }
    return result.data;
  },
};
