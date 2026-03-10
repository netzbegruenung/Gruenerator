import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, useColorScheme, ActivityIndicator, Animated, Text } from 'react-native';

import { NativeFloatingToolbar } from '../../components/canvas-editor/NativeFloatingToolbar';
import { NativeTabBar } from '../../components/canvas-editor/NativeTabBar';
import CanvasEditorDOM from '../../components/dom/CanvasEditorDOM';
import { useCanvasEditorBridgeStore } from '../../stores/canvasEditorBridgeStore';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../theme';

import type {
  HistoryState,
  SelectedElementInfo,
  SidebarTabId,
  TabInfo,
} from '../../components/canvas-editor/types';

export default function WebViewEditorScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { type, formData, modifications, uploadedImageBase64, setGeneratedImage } =
    useImageStudioStore();

  const [isLoading, setIsLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Bridge store
  const store = useCanvasEditorBridgeStore;
  const activeTab = store((s) => s.activeTab);
  const pendingAction = store((s) => s.pendingAction);
  const actionCounter = store((s) => s.actionCounter);

  const handleExport = useCallback(
    async (base64: string) => {
      setGeneratedImage(base64);
      router.back();
    },
    [setGeneratedImage]
  );

  const handleCancel = useCallback(async () => {
    router.back();
  }, []);

  const handleReady = useCallback(async () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIsLoading(false);
    });
  }, [fadeAnim]);

  // Bridge callbacks: DOM → Native
  // Types are widened to match Expo DOM serialization boundary (string, Record)
  const handleSelectedElementChange = useCallback(async (info: Record<string, unknown> | null) => {
    store.getState().setSelectedElement(info as SelectedElementInfo | null);
  }, []);

  const handleHistoryChange = useCallback(async (state: { canUndo: boolean; canRedo: boolean }) => {
    store.getState().setHistory(state);
  }, []);

  const handleTabsChange = useCallback(
    async (tabs: Array<{ id: string; label: string; disabled: boolean }>) => {
      store.getState().setTabs(tabs as TabInfo[]);
    },
    []
  );

  const handleActiveTabChange = useCallback(async (tabId: string | null) => {
    store.getState().setActiveTab(tabId as SidebarTabId | null);
  }, []);

  const initialState = {
    ...formData,
    ...modifications,
  } as Record<string, unknown>;

  if (!type) {
    router.back();
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar hidden />

      {/* Native floating toolbar (absolute positioned top) */}
      <NativeFloatingToolbar />

      {/* DOM canvas editor (flex: 1) */}
      <View style={styles.canvasContainer}>
        <CanvasEditorDOM
          type={type}
          initialState={initialState}
          imageSrc={uploadedImageBase64 ?? undefined}
          onExport={handleExport}
          onCancel={handleCancel}
          onReady={handleReady}
          activeTab={activeTab}
          toolbarAction={pendingAction}
          toolbarActionId={actionCounter}
          onSelectedElementChange={handleSelectedElementChange}
          onHistoryChange={handleHistoryChange}
          onTabsChange={handleTabsChange}
          onActiveTabChange={handleActiveTabChange}
          dom={{ matchContents: true }}
        />
      </View>

      {/* Native tab bar (bottom) */}
      <NativeTabBar />

      {/* Loading overlay */}
      {isLoading && (
        <Animated.View
          style={[styles.loadingOverlay, { backgroundColor: theme.background, opacity: fadeAnim }]}
          pointerEvents="none"
        >
          <ActivityIndicator size="large" color="#005538" />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Lädt Editor...</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  canvasContainer: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
});
