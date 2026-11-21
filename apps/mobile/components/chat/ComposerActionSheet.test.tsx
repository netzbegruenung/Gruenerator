import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform, View as MockView } from 'react-native';

import { ComposerActionSheet } from './ComposerActionSheet';

// The worklets runtime does not load under jest; the sheet's drag animation is
// not what these tests are about.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: MockView, createAnimatedComponent: (c: unknown) => c },
  useSharedValue: (v: unknown) => ({ get: () => v, set: () => {} }),
  useAnimatedStyle: () => ({}),
  withSpring: (v: unknown) => v,
}));
// Records the sheet's `onDismiss`: on device it fires after the slide-out,
// which a test renderer has no way to play.
const mockModal: { onDismiss?: () => void } = {};
jest.mock('react-native/Libraries/Modal/Modal', () => ({
  __esModule: true,
  default: ({
    visible,
    onDismiss,
    children,
  }: {
    visible: boolean;
    onDismiss?: () => void;
    children: unknown;
  }) => {
    mockModal.onDismiss = onDismiss;
    return visible ? children : null;
  },
}));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: () => {} }));
jest.mock('react-native-gesture-handler', () => {
  const pan = {
    activeOffsetY: () => pan,
    onStart: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: MockView,
  };
});
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAvoidingView: MockView }));
jest.mock('expo-haptics', () => ({ impactAsync: () => {}, ImpactFeedbackStyle: {} }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// The real package pulls in ESM-only assistant-stream; the sheet needs only its
// store and lists, and none of them matter for the attach tiles.
jest.mock('@gruenerator/chat', () => {
  const state = {
    selectedAgentId: null,
    selectedModel: null,
    searchMode: 'fast',
    threadMode: 'chat',
    pinnedConnector: null,
    customSystemPrompt: null,
    enabledTools: {},
    setSelectedModel: () => {},
    setSearchMode: () => {},
    setThreadMode: () => {},
    setPinnedConnector: () => {},
    toggleTool: () => {},
  };
  return {
    useAgentStore: (select: (s: typeof state) => unknown) => select(state),
    AUTO_MODEL_ID: 'auto',
    AUTO_MODEL_OPTION: { id: 'auto', name: 'Auto' },
    COMPOSER_MODES: [{ mode: 'chat', label: 'Chat', icon: 'chat' }],
    COMPOSER_MODES_TITLE: 'Modus',
    visibleComposerModels: () => [],
    SEARCH_DEPTHS: [{ mode: 'fast', label: 'Schnell', icon: 'fast' }],
    showsSearchDepth: () => false,
    quickSkillMentionables: () => [],
    functionMentionables: () => [],
    connectorMentionables: () => [],
    connectorId: () => null,
    COMPOSER_TOOLS: [],
    resolveMentionable: () => null,
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: () => {} }) }));
jest.mock('../../hooks/agents/useUserLibrary', () => ({ useUserLibrary: () => ({ items: [] }) }));
jest.mock('../../hooks/useEnabledModelIds', () => ({ useEnabledModelIds: () => [] }));

function Harness({ onPickFile }: { onPickFile: () => void }) {
  const [visible, setVisible] = useState(true);
  return (
    <ComposerActionSheet
      visible={visible}
      onClose={() => setVisible(false)}
      onPickFile={onPickFile}
    />
  );
}

describe('ComposerActionSheet attach tiles', () => {
  it('on iOS opens the picker only after the sheet has been dismissed', async () => {
    Platform.OS = 'ios';
    const onPickFile = jest.fn();
    await render(<Harness onPickFile={onPickFile} />);
    await fireEvent.press(screen.getByLabelText('Dateien'));
    // The Modal is still sliding out: presenting the picker now is the call
    // iOS swallows, leaving expo-document-picker stuck "in progress".
    expect(onPickFile).not.toHaveBeenCalled();

    await act(() => mockModal.onDismiss?.());
    expect(onPickFile).toHaveBeenCalledTimes(1);
  });

  it('on Android opens the picker as soon as the sheet closes', async () => {
    Platform.OS = 'android';
    const onPickFile = jest.fn();
    await render(<Harness onPickFile={onPickFile} />);

    await fireEvent.press(screen.getByLabelText('Dateien'));
    expect(onPickFile).toHaveBeenCalledTimes(1);
  });
});
