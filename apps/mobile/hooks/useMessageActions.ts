import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { secureStorage } from '../services/storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export interface MessageActionTarget {
  role: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export type MessageExportKind = 'docx' | 'docs';

/**
 * The backend names the file after the answer's first heading and sends both
 * an ASCII `filename="…"` and the RFC 5987 `filename*=UTF-8''…`. Prefer the
 * latter — the ASCII fallback replaces every Umlaut with `_`.
 */
function filenameFromResponse(res: Response): string {
  const header = res.headers.get('Content-Disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  const name = encoded ? safeDecode(encoded) : /filename="([^"]+)"/.exec(header)?.[1];
  return name?.endsWith('.docx') ? name : 'Chat-Nachricht.docx';
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Download-as-Word / open-in-editor for an assistant message — the
 * mobile counterpart of web's MessageActions handlers. Shared so the inline
 * action bar (and any other surface) drive identical behaviour instead of
 * each re-implementing the export fetch.
 */
export function useMessageActions(message: MessageActionTarget | null) {
  const router = useRouter();
  const [exporting, setExporting] = useState<MessageExportKind | null>(null);

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
          role: message.role === 'user' ? 'user' : 'assistant',
          // Epoch millis. An ISO string was rejected by the endpoint's schema,
          // so the button 400'd on every tap and the empty catch below hid it.
          timestamp: Date.now(),
          metadata: message.metadata,
        }),
      });
      if (!res.ok) throw new Error(`Export fehlgeschlagen (HTTP ${res.status})`);

      const bytes = new Uint8Array(await res.arrayBuffer());
      const file = new File(Paths.cache, filenameFromResponse(res));
      file.write(bytes);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    } catch {
      // Used to be silent, which is how a schema mismatch went unnoticed: the
      // request 400'd on every tap and the button just stopped spinning.
      Alert.alert('Export fehlgeschlagen', 'Die Nachricht konnte nicht heruntergeladen werden.');
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

  return { exporting, exportDocx, openInDocs };
}
