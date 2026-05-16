import { callGrueneratorApi } from '../api-client.ts';

export const notebooksListTool = {
  name: 'notebooks_list',
  description: `Listet die Landesverbände auf, die mit dem aktuellen API-Key abgefragt werden dürfen.

Verwende dies, um zu sehen, welche \`landesverband\`-Codes (z.B. "HH", "BY") du an
\`notebooks_ask\` und \`notebooks_search\` übergeben kannst.

Erfordert einen Bearer API-Key — wird automatisch aus dem Request-Header weitergeleitet.`,

  inputSchema: {},

  async handler(_params: Record<string, unknown>, apiKey: string) {
    if (!apiKey) {
      return {
        error: true,
        message: 'No API key forwarded — set Authorization: Bearer header on the MCP request.',
      };
    }
    const result = await callGrueneratorApi('/api/v1/notebooks', { apiKey });
    if (!result.ok) {
      return { error: true, status: result.status, message: result.message };
    }
    return result.data;
  },
};
