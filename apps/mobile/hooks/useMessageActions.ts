import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';

import { secureStorage } from '../services/storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export interface MessageActionTarget {
  role: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export type MessageExportKind = 'docx' | 'docs';

/**
 * Copy / download-as-Word / open-in-editor for an assistant message — the
 * mobile counterpart of web's MessageActions handlers. Shared so the inline
 * action bar (and any other surface) drive identical behaviour instead of
 * each re-implementing the export fetch.
 */
export function useMessageActions(message: MessageActionTarget | null) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<MessageExportKind | null>(null);

  const copy = useCallback(async () => {
    if (!message?.text) return;
    await Clipboard.setStringAsync(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message]);

  const exportDocx = useCallback(async () => {
    if (!message?.text || exporting) return;
    setExporting('docx');
    try {
      const token = await secureStorage.getToken();
      if (!token) return;

      const res = await fetch(`${API_BASE_URL}/exports/chat-message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message.text,
          role: message.role,
          timestamp: new Date().toISOString(),
          metadata: message.metadata,
        }),
      });
      if (!res.ok) throw new Error('Export fehlgeschlagen');

      const bytes = new Uint8Array(await res.arrayBuffer());
      const file = new File(Paths.cache, 'Chat-Nachricht.docx');
      file.write(bytes);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    } catch {
      /* silent — matches the previous sheet behaviour */
    } finally {
      setExporting(null);
    }
  }, [message, exporting]);

  const openInDocs = useCallback(async () => {
    if (!message?.text || exporting) return;
    setExporting('docs');
    try {
      const token = await secureStorage.getToken();
      if (!token) return;

      const res = await fetch(`${API_BASE_URL}/docs/from-export`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message.text, title: 'Chat-Nachricht' }),
      });
      if (!res.ok) throw new Error('Fehler');

      const data = (await res.json()) as { documentId?: string };
      if (data.documentId) {
        // doc-editor reads `id` from useLocalSearchParams.
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: data.documentId } });
      }
    } catch {
      /* silent */
    } finally {
      setExporting(null);
    }
  }, [message, exporting, router]);

  return { copied, exporting, copy, exportDocx, openInDocs };
}
