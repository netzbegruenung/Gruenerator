import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, StyleSheet, useColorScheme, Alert } from 'react-native';

import { BottomComposerBar } from '../../../components/common/BottomComposerBar';
import { DocumentsView } from '../../../components/docs/DocumentsView';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { TOOLS } from '../../../components/tools/toolsConfig';
import { ToolSectionHeading, ToolTileGrid } from '../../../components/tools/ToolTileGrid';
import { useDocsStore } from '../../../stores/docsStore';
import { spacing } from '../../../theme';

/**
 * "Arbeiten": one scrolling work hub (no sub-tabs), mirroring the web ArbeitenTab
 * — the Werkzeuge tool grid on top, the document grid below — plus a bottom-pinned
 * composer that generates a document from a prompt (the web Arbeiten intelligent
 * creator). The tools ride in as the document list's header so it all scrolls as one
 * page.
 */
function ArbeitenHeader() {
  return (
    <View style={styles.header}>
      <ToolSectionHeading title="Werkzeuge" badge={`${TOOLS.length}`} />
      <ToolTileGrid tools={TOOLS} />
      <View style={styles.docsHeading}>
        <ToolSectionHeading title="Dokumente" />
      </View>
    </View>
  );
}

export default function ArbeitenScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const generateDocument = useDocsStore((s) => s.generateDocument);
  const [isCreating, setIsCreating] = useState(false);

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

  return (
    <ScreenScaffold title="Arbeiten" backdrop={backdrop}>
      <View style={styles.flex}>
        <View style={styles.flex}>
          <DocumentsView header={<ArbeitenHeader />} showSearch={false} showFab={false} />
        </View>
        <BottomComposerBar placeholder="Dokument beschreiben…" onSend={handleCreate} />
      </View>
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
  header: {
    paddingTop: spacing.small,
  },
  docsHeading: {
    marginTop: spacing.xlarge,
  },
});
