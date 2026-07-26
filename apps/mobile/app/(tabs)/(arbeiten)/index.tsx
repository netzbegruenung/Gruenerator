import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, useColorScheme, Alert } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomComposerBar } from '../../../components/common/BottomComposerBar';
import { DocumentsView } from '../../../components/docs/DocumentsView';
import { FloatingBadgeTabs, type TabDefinition } from '../../../components/navigation';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { TOOLS } from '../../../components/tools/toolsConfig';
import { ToolSquareGrid } from '../../../components/tools/ToolSquareGrid';
import { useTabSwipe } from '../../../hooks/useTabSwipe';
import { useDocsStore } from '../../../stores/docsStore';
import { spacing } from '../../../theme';
import { FLOATING_TAB_BAR_HEIGHT } from '../../../theme/layout';
import { route } from '../../../types/routes';

const SECTIONS: TabDefinition[] = [
  { key: 'werkzeuge', label: 'Werkzeuge' },
  { key: 'dokumente', label: 'Dokumente' },
];

/**
 * "Arbeiten": the work hub, split into two badge-tabbed sections — the coloured
 * tool tiles and the document list. They used to share one scroll with the tools
 * riding in as the list header, which buried the documents behind a full screen
 * of tiles once the tile grid went square.
 *
 * The document composer (the web Arbeiten intelligent creator) belongs to the
 * Dokumente section only; on Werkzeuge a "Dokument beschreiben…" bar would be
 * noise, so that section pads for the floating tab bar itself instead.
 */
export default function ArbeitenScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const generateDocument = useDocsStore((s) => s.generateDocument);
  const [isCreating, setIsCreating] = useState(false);
  const [section, setSection] = useState<string>('werkzeuge');

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
          <FloatingBadgeTabs
            inline
            tabs={SECTIONS}
            activeTab={section}
            onTabPress={setSection}
            style={styles.sectionTabs}
          />

          {section === 'werkzeuge' ? (
            <ScrollView
              contentContainerStyle={[
                styles.toolsContent,
                { paddingBottom: insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.medium },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <ToolSquareGrid tools={TOOLS} />
            </ScrollView>
          ) : (
            <>
              <View style={styles.flex}>
                <DocumentsView showSearch={false} showFab={false} />
              </View>
              <BottomComposerBar placeholder="Dokument beschreiben…" onSend={handleCreate} />
            </>
          )}
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
  sectionTabs: {
    paddingTop: spacing.xsmall,
  },
  toolsContent: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
  },
});
