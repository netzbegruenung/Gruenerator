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
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => children,
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
}: {
  onSubmit: (text: string) => void;
  placeholder: string;
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
      <Pressable accessibilityRole="button" onPress={() => onSubmit(text)}>
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
  it('introduces itself and sends what is typed', () => {
    useCreator.mockReturnValue(state());
    renderScreen();
    expect(screen.getByText(/Beschreib dein Sharepic/)).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Nachricht'), 'Mehr Radwege');
    fireEvent.press(screen.getByText('Senden'));
    expect(send).toHaveBeenCalledWith('Mehr Radwege');
  });

  it('does not send while a turn is running and says what it is doing', () => {
    useCreator.mockReturnValue(
      state({ phase: 'drafting', messages: [{ id: 0, role: 'user', text: 'x', error: false }] })
    );
    renderScreen();
    expect(screen.getByText('Entwirft …')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Nachricht'), 'noch was');
    fireEvent.press(screen.getByText('Senden'));
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
    expect(screen.getByLabelText('Slide 1 von 2')).toBeTruthy();
    expect(screen.getByLabelText('Slide 2 von 2')).toBeTruthy();
    expect(screen.getByText('Der Text ist zu lang.')).toBeTruthy();
  });
});
