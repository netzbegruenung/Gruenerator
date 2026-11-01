import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { type ReactNode } from 'react';

import { type SharepicPreviewStatus, useSharepicPreview } from '../../hooks/useSharepicPreview';
import { saveImageToGallery } from '../../services/imageStudio';
import { shareBase64Image } from '../../services/share';
import { lightTheme } from '../../theme/colors';

import { SharepicVariantCard } from './SharepicVariantCard';

import type { SharepicData } from '@gruenerator/chat';

// The drawing state animates, and the action sheet is a BottomSheet with a
// drag gesture — both reach into Reanimated as soon as they render.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@gruenerator/chat', () => {
  const state = { entries: {}, upsertEntry: jest.fn() };
  const useSharepicLiveStore = (selector: (s: typeof state) => unknown) => selector(state);
  useSharepicLiveStore.getState = () => state;
  return {
    useSharepicLiveStore,
    useAgentStore: { getState: () => ({ currentThreadId: 'thread-1' }) },
  };
});
jest.mock('@gruenerator/shared/api', () => ({ getContractsClient: jest.fn() }));
jest.mock('../../hooks/useSharepicPreview', () => ({ useSharepicPreview: jest.fn() }));
jest.mock('../../services/imageStudio', () => ({
  saveImageToGallery: jest.fn(async () => undefined),
}));
jest.mock('../../services/share', () => ({ shareBase64Image: jest.fn(async () => undefined) }));
jest.mock('../../services/sharepicRender', () => ({ composeForMint: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPreview = useSharepicPreview as jest.MockedFunction<typeof useSharepicPreview>;

const IMAGE = 'data:image/png;base64,AAAA';

function data(canvasId: string | null = 'canvas-1'): SharepicData {
  return {
    variants: [
      {
        id: 'v1',
        canvasType: 'dreizeilen',
        initialProps: {},
        altText: 'Sharepic zur Verkehrswende',
        ...(canvasId !== null && { canvasId }),
      },
    ],
  } as unknown as SharepicData;
}

function preview(status: SharepicPreviewStatus) {
  mockPreview.mockReturnValue({
    image: status === 'ready' ? IMAGE : null,
    status,
  } as ReturnType<typeof useSharepicPreview>);
}

const sharepic = () => screen.getByTestId('chat-sharepic');

/** Let a save or a studio hand-off settle — both reset their busy flag after. */
const settle = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SharepicVariantCard', () => {
  it('shows no buttons under the picture any more', async () => {
    preview('ready');
    await render(<SharepicVariantCard data={data()} theme={lightTheme} />);
    expect(screen.queryByText('Teilen')).toBeNull();
    expect(screen.queryByText('Im Studio öffnen')).toBeNull();
  });

  it('opens the actions as a sheet on a long press, with a haptic', async () => {
    preview('ready');
    await render(<SharepicVariantCard data={data()} theme={lightTheme} />);
    await fireEvent(sharepic(), 'longPress');

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Teilen'));
    expect(shareBase64Image).toHaveBeenCalledWith(IMAGE, 'Sharepic teilen');
  });

  it('saves from the sheet', async () => {
    preview('ready');
    await render(<SharepicVariantCard data={data()} theme={lightTheme} />);
    await fireEvent(sharepic(), 'longPress');
    await fireEvent.press(screen.getByText('In Galerie speichern'));
    await settle();
    expect(saveImageToGallery).toHaveBeenCalledWith(IMAGE);
  });

  it('opens the picture full screen on a tap, with the same actions in its toolbar', async () => {
    preview('ready');
    await render(<SharepicVariantCard data={data()} theme={lightTheme} />);
    await fireEvent.press(sharepic());

    expect(screen.getByLabelText('Vollbildansicht schließen')).toBeTruthy();
    await fireEvent.press(screen.getByText('Im Studio bearbeiten'));
    await settle();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(fullscreen)/web-viewer',
      params: { path: '/studio/canvas/canvas-1', title: 'Sharepic' },
    });
  });

  it('goes straight to the studio on a tap when there is no picture', async () => {
    preview('unavailable');
    await render(<SharepicVariantCard data={data()} theme={lightTheme} />);
    await fireEvent.press(sharepic());
    await settle();
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('still opens the studio on a tap while a sharepic with a canvas is redrawn', async () => {
    preview('rendering');
    await render(<SharepicVariantCard data={data('canvas-1')} theme={lightTheme} />);
    await fireEvent.press(sharepic());
    await settle();
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('does nothing while a new sharepic is first drawn', async () => {
    preview('rendering');
    await render(<SharepicVariantCard data={data(null)} theme={lightTheme} />);
    await fireEvent.press(sharepic());
    await fireEvent(sharepic(), 'longPress');

    expect(router.push).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(screen.queryByText('Im Studio bearbeiten')).toBeNull();
  });

  it('offers the actions to screen readers, which cannot rely on a long press', async () => {
    preview('ready');
    await render(<SharepicVariantCard data={data()} theme={lightTheme} />);
    expect(sharepic().props.accessibilityActions).toEqual([
      { name: 'share', label: 'Teilen' },
      { name: 'save', label: 'In Galerie speichern' },
      { name: 'open-studio', label: 'Im Studio bearbeiten' },
    ]);

    await fireEvent(sharepic(), 'accessibilityAction', { nativeEvent: { actionName: 'save' } });
    await settle();
    expect(saveImageToGallery).toHaveBeenCalledWith(IMAGE);
  });
});
