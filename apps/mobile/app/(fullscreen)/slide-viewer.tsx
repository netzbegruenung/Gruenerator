import { type PresentationContentResponse } from '@gruenerator/contracts';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { officeWebUrl } from '../../components/office/officeItem';
import { ReadOnlyTopBar } from '../../components/office/ReadOnlyTopBar';
import { ViewerError, ViewerLoading } from '../../components/office/ViewerStates';
import { SlideDeckView } from '../../components/presentations/SlideDeckView';
import { officeApi } from '../../services/office/officeApi';
import { darkTheme, lightTheme } from '../../theme';
import { officeTypeColor } from '../../theme/officeColors';

export default function SlideViewerScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const accent = officeTypeColor('presentation', colorScheme === 'dark').icon;

  const [deck, setDeck] = useState<PresentationContentResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    officeApi
      .fetchPresentationContent(id)
      .then((d) => {
        if (!active) return;
        setDeck(d);
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
        title={deck?.title || title || 'Präsentation'}
        webUrl={officeWebUrl('presentation', id)}
        accent={accent}
      />
      {status === 'loading' ? (
        <ViewerLoading />
      ) : status === 'error' || !deck ? (
        <ViewerError />
      ) : (
        <SlideDeckView slides={deck.slides} accent={deck.accentColor} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
