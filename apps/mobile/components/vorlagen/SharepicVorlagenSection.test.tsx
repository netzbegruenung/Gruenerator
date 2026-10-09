/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type SharepicVorlage } from '@gruenerator/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { type ReactNode } from 'react';

import { useSharepicVorlagen } from '../../hooks/useSharepicVorlagen';
import { openUrl } from '../../services/share';
import { secureStorage } from '../../services/storage';

import { SharepicVorlagenSection } from './SharepicVorlagenSection';

jest.mock('../../hooks/useSharepicVorlagen', () => ({ useSharepicVorlagen: jest.fn() }));
jest.mock('../../services/storage', () => ({ secureStorage: { getToken: jest.fn() } }));
jest.mock('../../services/share', () => ({ openUrl: jest.fn() }));
// The real sheet is a Modal with keyboard handling; only its content matters here.
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));

const mockVorlagen = useSharepicVorlagen as unknown as jest.MockedFunction<
  () => { data: SharepicVorlage[] | undefined }
>;
const mockGetToken = secureStorage.getToken as jest.MockedFunction<typeof secureStorage.getToken>;

// Only the fields the UI reads; the spec's element tree is irrelevant here.
const karussell = {
  id: 'klima-karussell',
  titel: 'Klimaschutz in drei Schritten',
  beschreibung: 'Ein Karussell, das erklärt, was vor Ort passiert.',
  form: 'karussell',
  herkunft: 'beispiel',
  locale: 'de-DE',
  chat: { prompts: ['Mach ein Karussell zu Radwegen in Köln'] },
  spec: { slides: [{}, {}, {}] },
  attributions: [
    {
      photographer: 'Anna Foto',
      profileUrl: 'https://unsplash.com/@anna',
      photoUrl: 'https://unsplash.com/photos/a',
    },
    null,
    null,
  ],
} as unknown as SharepicVorlage;

async function renderSection() {
  render(<SharepicVorlagenSection />);
  // The token effect resolves after the first render.
  await act(async () => {});
}

function imageSources() {
  return screen
    .UNSAFE_queryAllByType(Image)
    .map((node) => node.props.source as { uri: string; headers: Record<string, string> });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetToken.mockResolvedValue('tok');
});

describe('SharepicVorlagenSection', () => {
  it('renders nothing while there are no Vorlagen', async () => {
    mockVorlagen.mockReturnValue({ data: [] });
    render(<SharepicVorlagenSection />);
    expect(screen.toJSON()).toBeNull();
    await act(async () => {});
  });

  it('shows a card per Vorlage with an authenticated thumbnail', async () => {
    mockVorlagen.mockReturnValue({ data: [karussell] });
    await renderSection();

    expect(screen.getByText('Grünerator-Vorlagen')).toBeTruthy();
    expect(screen.getByText('3 Seiten')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    ).toBeTruthy();
    expect(imageSources()).toEqual([
      {
        uri: expect.stringMatching(/\/sharepic-vorlagen\/klima-karussell\/thumb$/),
        headers: { Authorization: 'Bearer tok' },
      },
    ]);
  });

  it('opens the detail with every slide, the chat prompts and the keywords', async () => {
    mockVorlagen.mockReturnValue({ data: [karussell] });
    await renderSection();

    fireEvent.press(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    );

    expect(screen.getByText(karussell.beschreibung)).toBeTruthy();
    const uris = imageSources().map((s) => s.uri);
    expect(uris.filter((u) => u.endsWith('/thumb?seite=2'))).toHaveLength(1);
    expect(uris.filter((u) => u.endsWith('/thumb?seite=3'))).toHaveLength(1);
    expect(screen.getByText('So erstellst du das im Chat')).toBeTruthy();
    expect(screen.getByText('Slider')).toBeTruthy();
    expect(screen.getByText(/Anna Foto/)).toBeTruthy();
  });

  it('opens the copy in the web viewer, never composing on the phone', async () => {
    mockVorlagen.mockReturnValue({ data: [karussell] });
    await renderSection();

    fireEvent.press(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    );
    fireEvent.press(screen.getByRole('button', { name: 'Kopie bearbeiten' }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(fullscreen)/web-viewer',
      params: { path: '/studio/vorlage/klima-karussell', title: karussell.titel },
    });
  });

  it('hands a prompt to the sharepic creator', async () => {
    mockVorlagen.mockReturnValue({ data: [karussell] });
    await renderSection();

    fireEvent.press(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    );
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Im Sharepic-Creator: Mach ein Karussell zu Radwegen in Köln',
      })
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/sharepic',
      params: { initialMessage: 'Mach ein Karussell zu Radwegen in Köln' },
    });
  });

  it('opens a photo credit', async () => {
    mockVorlagen.mockReturnValue({ data: [karussell] });
    await renderSection();

    fireEvent.press(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    );
    fireEvent.press(screen.getByRole('link', { name: 'Foto von Anna Foto auf Unsplash öffnen' }));

    expect(openUrl).toHaveBeenCalledWith('https://unsplash.com/photos/a');
  });

  it('labels every touchable', async () => {
    mockVorlagen.mockReturnValue({ data: [karussell] });
    await renderSection();
    fireEvent.press(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    );

    const touchables = screen.UNSAFE_root.findAll(
      (node) => typeof node.type === 'string' && typeof node.props.onClick === 'function'
    );
    expect(touchables.length).toBeGreaterThanOrEqual(4);
    for (const node of touchables) {
      expect(node.props.accessibilityLabel).toEqual(expect.any(String));
    }
  });
});
