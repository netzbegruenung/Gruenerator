import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';

import { BottomSheet } from '../common/BottomSheet';
import { secureStorage } from '../../services/storage';
import { lightTheme, darkTheme, colors } from '../../theme';

interface MessageData {
  role: string;
  text: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  message: MessageData | null;
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export function MessageActionsSheet({ visible, onClose, message }: Props) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();

  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<'docx' | 'docs' | null>(null);

  const handleCopy = useCallback(async () => {
    if (!message) return;
    await Clipboard.setStringAsync(message.text);
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 1000);
  }, [message, onClose]);

  const handleExportDocx = useCallback(async () => {
    if (!message || exporting) return;
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
      onClose();
    } catch {} finally {
      setExporting(null);
    }
  }, [message, exporting, onClose]);

  const handleOpenInDocs = useCallback(async () => {
    if (!message || exporting) return;
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
      const data = await res.json();
      onClose();
      if (data.documentId) {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: data.documentId } } as never);
      }
    } catch {} finally {
      setExporting(null);
    }
  }, [message, exporting, onClose, router]);

  if (!message) return null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <TouchableOpacity style={styles.row} onPress={handleCopy} activeOpacity={0.6}>
        <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={20} color={copied ? colors.primary[600] : theme.text} />
        <Text style={[styles.rowLabel, { color: copied ? colors.primary[600] : theme.text }]}>
          {copied ? 'Kopiert!' : 'Kopieren'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={handleExportDocx} disabled={!!exporting} activeOpacity={0.6}>
        <Ionicons name="document-outline" size={20} color={theme.text} />
        <Text style={[styles.rowLabel, { color: theme.text }]}>Als Word herunterladen</Text>
        {exporting === 'docx' && <ActivityIndicator size="small" color={colors.primary[600]} />}
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={handleOpenInDocs} disabled={!!exporting} activeOpacity={0.6}>
        <Ionicons name="create-outline" size={20} color={theme.text} />
        <Text style={[styles.rowLabel, { color: theme.text }]}>Im Editor öffnen</Text>
        {exporting === 'docs' && <ActivityIndicator size="small" color={colors.primary[600]} />}
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
});
