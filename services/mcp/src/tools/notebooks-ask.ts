import { z } from 'zod';

import { callGrueneratorApi } from '../api-client.ts';

export const notebooksAskTool = {
  name: 'notebooks_ask',
  description: `Beantwortet eine Frage zu einem Landesverband mit synthetisierter Antwort und Quellenangaben.

Erfordert einen Bearer API-Key, dessen Scope den angefragten \`landesverband\`-Code abdeckt.
Bei nicht erlaubtem Landesverband antwortet der Server mit 403.

## Parameter
- \`question\`: deutschsprachige Frage
- \`landesverband\`: Code wie "HH", "BY", "BE" — siehe \`notebooks_list\`
- \`fastMode\`: optional, true für schnellere Antwort ohne aufwendige Re-Ranking-Schritte`,

  inputSchema: {
    question: z.string().describe('Frage auf Deutsch'),
    landesverband: z.string().describe('Landesverband-Code (z.B. HH, BY, BE)'),
    fastMode: z.boolean().optional().describe('Schnellmodus ohne Re-Ranking'),
  },

  async handler(
    {
      question,
      landesverband,
      fastMode,
    }: { question: string; landesverband: string; fastMode?: boolean },
    apiKey: string
  ) {
    if (!apiKey) {
      return { error: true, message: 'No API key forwarded — set Authorization: Bearer header on the MCP request.' };
    }
    const result = await callGrueneratorApi(
      '/api/v1/notebooks/ask',
      {
        apiKey,
        method: 'POST',
        body: { question, landesverband, ...(fastMode !== undefined && { fastMode }) },
      }
    );
    if (!result.ok) {
      return { error: true, status: result.status, message: result.message };
    }
    return result.data;
  },
};
