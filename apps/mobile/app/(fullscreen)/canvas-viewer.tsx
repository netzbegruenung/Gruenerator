import { type CanvasDocument } from '@gruenerator/contracts';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';

import { CanvasImageView } from '../../components/canvas/CanvasImageView';
import { officeWebUrl } from '../../components/office/officeItem';
import { ReadOnlyTopBar } from '../../components/office/ReadOnlyTopBar';
import { ViewerError, ViewerLoading } from '../../components/office/ViewerStates';
import { officeApi } from '../../services/office/officeApi';
import { darkTheme, lightTheme } from '../../theme';
import { officeTypeColor } from '../../theme/officeColors';

export default function CanvasViewerScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const accent = officeTypeColor('canvas', colorScheme === 'dark').icon;

  const [canvas, setCanvas] = useState<CanvasDocument | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    officeApi
      .fetchCanvas(id)
      .then((doc) => {
        if (!active) return;
        setCanvas(doc);
        setStatus('ready');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [id]);

  const handleDownload = useCallback(async () => {
    const url = canvas?.thumbnail_url;
    if (!url) return;
    try {
      const { status: perm } = await MediaLibrary.requestPermissionsAsync(true);
      if (perm !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlaube den Zugriff auf die Galerie.');
        return;
      }
      const safeTitle = (canvas?.title || 'Sharepic').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '_');
      const destination = new File(Paths.cache, `${safeTitle}_${Date.now()}.png`);
      const downloaded = await File.downloadFileAsync(url, destination);
      await MediaLibrary.Asset.create(downloaded.uri);
      downloaded.delete();
      Alert.alert('Gespeichert', 'Das Sharepic wurde in der Galerie gespeichert.');
    } catch (error) {
      console.error('[CanvasViewer] Download error:', error);
      Alert.alert('Fehler', 'Das Sharepic konnte nicht gespeichert werden.');
    }
  }, [canvas]);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ReadOnlyTopBar
        title={canvas?.title || title || 'Sharepic'}
        webUrl={officeWebUrl('canvas', id)}
        onDownload={canvas?.thumbnail_url ? handleDownload : undefined}
        accent={accent}
      />
      {status === 'loading' ? (
        <ViewerLoading />
      ) : status === 'error' ? (
        <ViewerError />
      ) : (
        <CanvasImageView thumbnailUrl={canvas?.thumbnail_url} pageCount={canvas?.page_count} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
