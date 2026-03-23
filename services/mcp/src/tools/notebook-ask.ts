import { z } from 'zod';

import { config } from '../config.ts';

export const notebookAskTool = {
  name: 'gruenerator_notebook_ask',
  description: `Beantwortet Fragen zu Notebook-Sammlungen mit KI-generierten Antworten und Quellenangaben.

Notebooks sind benutzerdefinierte Dokumentsammlungen im Grünerator. Dieses Tool fragt die Notebook-QA-API ab und gibt Antworten mit Zitaten und Quellen zurück.

## Zugang
- Öffentliche Notebooks: Nutze den öffentlichen Sharing-Token
- Die Notebook-ID und den Token erhältst du vom Benutzer

## Antwort
- Enthält eine KI-generierte Antwort mit [1], [2] Quellenverweisen
- Citations mit Dokumenttitel, URL, Textausschnitt und Relevanzscore
- Metadaten zur Sammlung und Antwortzeit`,

  inputSchema: {
    question: z.string().describe('Frage auf Deutsch'),
    token: z.string().describe('Öffentlicher Sharing-Token des Notebooks'),
    mode: z
      .enum(['detailed', 'fast'])
      .default('detailed')
      .describe('detailed = mit Quellenangaben, fast = schnelle Antwort ohne Zitate'),
  },

  async handler({
    question,
    token,
    mode = 'detailed',
  }: {
    question: string;
    token: string;
    mode?: 'detailed' | 'fast';
  }) {
    if (!question || question.trim().length === 0) {
      return { error: true, message: 'Frage darf nicht leer sein' };
    }

    if (!token || token.trim().length === 0) {
      return { error: true, message: 'Token darf nicht leer sein' };
    }

    const apiUrl = config.api.url;
    if (!apiUrl) {
      return {
        error: true,
        message:
          'GRUENERATOR_API_URL nicht konfiguriert. Setze die Umgebungsvariable auf die API-URL (z.B. https://beta.gruenerator.eu).',
      };
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${apiUrl}/api/qa/public/${token}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          fastMode: mode === 'fast',
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            error: true,
            message: `Notebook nicht gefunden. Prüfe den Token: ${token}`,
          };
        }
        const errorText = await response.text();
        return {
          error: true,
          message: `API-Fehler ${response.status}: ${errorText.slice(0, 200)}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;

      if (!data.success) {
        return {
          error: true,
          message: (data.error as string) || 'Unbekannter Fehler bei der Notebook-Abfrage',
        };
      }

      const responseTimeMs = Date.now() - startTime;

      console.error(
        `[NotebookAsk] Answer generated (${String(data.answer || '').length} chars, ${responseTimeMs}ms)`
      );

      return {
        answer: data.answer,
        citations: data.citations || [],
        sources: data.sources || [],
        allSources: data.allSources || [],
        metadata: {
          ...(data.metadata as Record<string, unknown>),
          responseTimeMs,
          mode,
          token,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[NotebookAsk] Error:', message);
      return {
        error: true,
        message: `Verbindungsfehler: ${message}`,
      };
    }
  },
};
