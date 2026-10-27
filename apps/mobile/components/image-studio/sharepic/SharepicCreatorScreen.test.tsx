import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSharepicCreator } from '../../../hooks/useSharepicCreator';

import { SharepicCreatorScreen } from './SharepicCreatorScreen';

jest.mock('../../../hooks/useSharepicCreator', () => ({ useSharepicCreator: jest.fn() }));
jest.mock('../../../services/sharepicRender', () => ({ composeForMint: jest.fn() }));
jest.mock('@gruenerator/shared/api', () => ({ getContractsClient: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => children,
}));
// The chat chrome around the conversation; the screen's own behaviour is the
// list and the composer.
jest.mock('../../chat/ChatBackdrop', () => ({ ChatBackdrop: () => null }));
jest.mock('../../chat/AssistantThread', () => {
  const { Text: MockText } = jest.requireActual<{ Text: typeof Text }>('react-native');
  return {
    useComposerDockPadding: () => null,
    ThreadWelcomeBlock: ({ subtitle }: { subtitle: string }) => <MockText>{subtitle}</MockText>,
  };
});
// The libraries' own jest mocks rather than a hand-written stub: the slide menu
// is a BottomSheet with a drag gesture, and Gesture Handler calls into
// Reanimated as soon as a GestureDetector renders.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('../../chat/ShimmerStatusLine', () => {
  const { Text: MockText } = jest.requireActual<{ Text: typeof Text }>('react-native');
  return { ShimmerStatusLine: ({ label }: { label: string }) => <MockText>{label}</MockText> };
});
jest.mock('../../navigation/ScreenScaffold', () => ({
  ScreenScaffold: ({ children }: { children: ReactNode }) => children,
}));
// The real composer reaches into the global chat runtime; a plain field with a
// send button is all this screen relies on.
jest.mock('../../common/Composer', () => ({
  useComposerEdge: () => null,
  Composer: MockComposer,
}));

function MockComposer({
  onSubmit,
  placeholder,
  busy,
}: {
  onSubmit: (text: string) => void;
  placeholder: string;
  busy: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <View>
      <TextInput
        placeholder={placeholder}
        value={text}
        onChangeText={setText}
        accessibilityLabel={placeholder}
        accessibilityHint="Eingabe"
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => onSubmit(text)}
        disabled={busy}
        accessibilityState={{ disabled: busy, busy }}
      >
        <Text>Senden</Text>
      </Pressable>
    </View>
  );
}

const useCreator = useSharepicCreator as jest.MockedFunction<typeof useSharepicCreator>;
const send = jest.fn<(text: string) => Promise<void>>(() => Promise.resolve());

function state(overrides: Partial<ReturnType<typeof useSharepicCreator>> = {}) {
  return {
    messages: [],
    phase: 'idle',
    design: null,
    send,
    tweaks: [],
    tweak: jest.fn(() => Promise.resolve()),
    reset: jest.fn(() => Promise.resolve()),
    tweaked: false,
    spec: null,
    attributions: [],
    ...overrides,
  } as ReturnType<typeof useSharepicCreator>;
}

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen() {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SharepicCreatorScreen />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  send.mockClear();
});

describe('SharepicCreatorScreen', () => {
  it('introduces itself and sends what is typed', async () => {
    useCreator.mockReturnValue(state());
    renderScreen();
    expect(screen.getByText(/Beschreib dein Sharepic/)).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Schreibe …'), 'Mehr Radwege');
    await fireEvent.press(screen.getByText('Senden'));
    expect(send).toHaveBeenCalledWith('Mehr Radwege');
    expect(screen.getByRole('button', { name: 'Senden' })).not.toBeDisabled();
  });

  it('does not send while a turn is running and says what it is doing', async () => {
    useCreator.mockReturnValue(
      state({ phase: 'drafting', messages: [{ id: 0, role: 'user', text: 'x', error: false }] })
    );
    renderScreen();
    expect(screen.getByText('Entwirft …')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Senden' })).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText('Schreibe …'), 'noch was');
    await fireEvent.press(screen.getByText('Senden'));
    expect(send).not.toHaveBeenCalled();
  });

  it('shows every slide under the message the design belongs to', () => {
    useCreator.mockReturnValue(
      state({
        phase: 'ready',
        design: { images: ['data:image/png;base64,A', 'data:image/png;base64,B'] },
        messages: [
          { id: 0, role: 'user', text: 'Karussell', error: false },
          { id: 1, role: 'assistant', text: 'Hier ist dein Karussell.', error: false },
          { id: 2, role: 'assistant', text: 'Der Text ist zu lang.', error: true },
        ],
      })
    );
    renderScreen();
    expect(screen.getByLabelText('Folie 1 von 2')).toBeTruthy();
    expect(screen.getByLabelText('Folie 2 von 2')).toBeTruthy();
    expect(screen.getByText('Der Text ist zu lang.')).toBeTruthy();
  });

  it('offers editing when a slide is held', async () => {
    useCreator.mockReturnValue(
      state({
        phase: 'ready',
        design: { images: ['data:image/png;base64,A'] },
        messages: [
          { id: 0, role: 'user', text: 'Radwege', error: false },
          { id: 1, role: 'assistant', text: 'Hier ist dein Sharepic.', error: false },
        ],
      })
    );
    renderScreen();
    expect(screen.queryByText('Bearbeiten')).toBeNull();
    await fireEvent(screen.getByLabelText('Folie 1 von 1'), 'longPress');
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Feinschliff' })).toBeTruthy();
  });
});
