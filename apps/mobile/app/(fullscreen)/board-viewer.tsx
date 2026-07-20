import { type BoardState } from '@gruenerator/contracts';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { BoardKanbanView } from '../../components/boards/BoardKanbanView';
import { officeWebUrl } from '../../components/office/officeItem';
import { ReadOnlyTopBar } from '../../components/office/ReadOnlyTopBar';
import { ViewerError, ViewerLoading } from '../../components/office/ViewerStates';
import { officeApi } from '../../services/office/officeApi';
import { darkTheme, lightTheme } from '../../theme';
import { officeTypeColor } from '../../theme/officeColors';

export default function BoardViewerScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const accent = officeTypeColor('board', colorScheme === 'dark').icon;

  const [state, setState] = useState<BoardState | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    officeApi
      .fetchBoardState(id)
      .then((s) => {
        if (!active) return;
        setState(s);
        setStatus('ready');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ReadOnlyTopBar
        title={state?.title || title || 'Board'}
        webUrl={officeWebUrl('board', id)}
        accent={accent}
      />
      {status === 'loading' ? (
        <ViewerLoading />
      ) : status === 'error' || !state ? (
        <ViewerError />
      ) : state.boardType === 'whiteboard' ? (
        <ScrollView contentContainerStyle={styles.whiteboard}>
          {(state.whiteboardTexts ?? []).map((text, i) => (
            <View
              key={i}
              style={[styles.note, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            >
              <Text style={[styles.noteText, { color: theme.text }]}>{text}</Text>
            </View>
          ))}
          {(state.whiteboardTexts ?? []).length === 0 && (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Dieses Whiteboard ist leer.
            </Text>
          )}
        </ScrollView>
      ) : (
        <BoardKanbanView state={state} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  whiteboard: {
    padding: 16,
    gap: 10,
  },
  note: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  noteText: {
    fontSize: 15,
    lineHeight: 21,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
});
