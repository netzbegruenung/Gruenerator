import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, StyleSheet, useColorScheme, Alert } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { BottomComposerBar } from '../../../components/common/BottomComposerBar';
import { DocumentsView } from '../../../components/docs/DocumentsView';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { useOfficeExtraItems } from '../../../components/office/useOfficeExtraItems';
import { useTabSwipe } from '../../../hooks/useTabSwipe';
import { useDocsStore } from '../../../stores/docsStore';
import { route } from '../../../types/routes';

/**
 * "Arbeiten": everything the user has made — documents, presentations, sheets,
 * boards and canvases in one list, plus the bottom composer that generates a new
 * document from a prompt (the web Arbeiten intelligent creator).
 *
 * This screen absorbed the former Office tab. On mobile the two were the same
 * list with different chrome, so Office is gone and its `extraItems` (boards +
 * canvases, which the /docs endpoint does not return) are fetched here instead.
 */
export default function ArbeitenScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const generateDocument = useDocsStore((s) => s.generateDocument);
  const [isCreating, setIsCreating] = useState(false);
  const { items } = useOfficeExtraItems();

  // Flat near-white tint mirrors the web Arbeiten tab (bg-[#F7FBF8]); dark keeps the
  // app gradient.
  const backdrop = isDark ? undefined : (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flatBg]} />
  );

  const handleCreate = useCallback(
    async (text: string) => {
      if (isCreating) return;
      setIsCreating(true);
      try {
        const doc = await generateDocument(text);
        if (doc) {
          router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: doc.id } });
        }
      } catch {
        Alert.alert('Fehler', 'Dokument konnte nicht generiert werden.');
      } finally {
        setIsCreating(false);
      }
    },
    [generateDocument, isCreating, router]
  );

  // Swipe right → back to Chat, the mirror of Chat's swipe-left. The drawer does
  // not contend for it here (AppDrawer disables swipe-to-open outside Chat).
  const swipe = useTabSwipe({
    onSwipeRight: () => router.navigate(route('/start')),
  });

  return (
    <ScreenScaffold title="Arbeiten" backdrop={backdrop}>
      <GestureDetector gesture={swipe}>
        <View style={styles.flex}>
          <View style={styles.flex}>
            <DocumentsView extraItems={items} showFab={false} />
          </View>
          <BottomComposerBar placeholder="Dokument beschreiben…" onSend={handleCreate} />
        </View>
      </GestureDetector>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flatBg: {
    backgroundColor: '#F7FBF8',
  },
});
