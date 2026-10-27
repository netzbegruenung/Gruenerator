/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type TranslationLanguagesResponse } from '@gruenerator/contracts';
import {
  TranslationNotConfiguredError,
  TranslationRequestError,
  useTranslateText,
  useTranslationLanguages,
} from '@gruenerator/shared/translation';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UebersetzerScreen } from './UebersetzerScreen';

jest.mock('@gruenerator/shared/translation', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/translation'),
  useTranslationLanguages: jest.fn(),
  useTranslateText: jest.fn(),
  useDocumentStatus: () => ({ data: undefined, error: null }),
}));
jest.mock('../../hooks/translation/useDocumentTranslation', () => ({
  useUploadDocument: () => ({ isPending: false, error: null, mutate: jest.fn(), reset: jest.fn() }),
  shareTranslatedDocument: jest.fn(),
}));
jest.mock('../../services/documentPicker', () => ({
  pickDocument: jest.fn(),
  pickImageFromLibrary: jest.fn(),
  takePhoto: jest.fn(),
  uploadDocumentToScanner: jest.fn(),
}));
// The real sheet is a Modal with keyboard handling; only its content matters here.
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

type LanguagesQuery = ReturnType<typeof useTranslationLanguages>;

const DATA: TranslationLanguagesResponse = {
  languages: [
    {
      code: 'de',
      name: 'Deutsch',
      usableAsSource: true,
      usableAsTarget: true,
      formality: true,
      glossary: true,
    },
    {
      code: 'en',
      name: 'Englisch',
      usableAsSource: true,
      usableAsTarget: false,
      formality: false,
      glossary: true,
    },
    {
      code: 'en-GB',
      name: 'Englisch (britisch)',
      usableAsSource: false,
      usableAsTarget: true,
      formality: false,
      glossary: true,
    },
    {
      code: 'fr',
      name: 'Französisch',
      usableAsSource: true,
      usableAsTarget: true,
      formality: true,
      glossary: true,
    },
  ],
  glossaryPairs: ['de>en'],
  quota: {
    used: 0,
    limit: null,
    remaining: null,
    resetsAt: '2026-10-16T00:00:00.000Z',
    newsletterBonus: false,
  },
};

const languages = useTranslationLanguages as jest.MockedFunction<typeof useTranslationLanguages>;
const mutate = jest.fn();

function query(state: Partial<LanguagesQuery>): LanguagesQuery {
  return {
    data: undefined,
    error: null,
    isPending: false,
    refetch: jest.fn(),
    ...state,
  } as unknown as LanguagesQuery;
}
const pending = () => query({ isPending: true });
const loaded = () => query({ data: DATA });
const failed = (error: Error) => query({ error });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function tree() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <UebersetzerScreen />
    </SafeAreaProvider>
  );
}

const renderScreen = async () => render(tree());

beforeEach(() => {
  jest.useFakeTimers();
  mutate.mockReset();
  (useTranslateText as jest.MockedFunction<typeof useTranslateText>).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useTranslateText>);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('UebersetzerScreen', () => {
  it('is usable before the language list has arrived', async () => {
    languages.mockReturnValue(pending());
    await renderScreen();

    expect(screen.getByLabelText('Ausgangstext')).toBeOnTheScreen();
    expect(screen.getByLabelText('Art der Übersetzung')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Von: Lade Sprachen').length).toBeGreaterThan(0);
    // No target yet: the sheet button names no language rather than an empty one.
    expect(screen.getAllByLabelText('Nach: alle Sprachen').length).toBeGreaterThan(0);
  });

  it('translates text typed while loading once the list lands', async () => {
    languages.mockReturnValue(pending());
    const view = await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Ausgangstext'), 'Guten Morgen');
    await act(() => jest.advanceTimersByTime(2000));
    expect(mutate).not.toHaveBeenCalled();

    languages.mockReturnValue(loaded());
    await view.rerender(tree());
    await act(() => jest.advanceTimersByTime(1000));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[0]).toEqual({
      text: 'Guten Morgen',
      targetLang: 'en-GB',
      sourceLang: null,
      formality: null,
    });
    expect(screen.getAllByText('Englisch (britisch)').length).toBeGreaterThan(0);
  });

  it('keeps the typed text when the list fails to load', async () => {
    languages.mockReturnValue(pending());
    const view = await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Ausgangstext'), 'Guten Morgen');

    languages.mockReturnValue(
      failed(new TranslationRequestError('Sprachen konnten nicht geladen werden.', 502))
    );
    await view.rerender(tree());

    expect(screen.getByText('Sprachen konnten nicht geladen werden.')).toBeOnTheScreen();
    expect(screen.getByText('Erneut versuchen')).toBeOnTheScreen();
    expect(screen.getByLabelText('Ausgangstext').props.value).toBe('Guten Morgen');
  });

  it('shows only the notice when this server has no DeepL key', async () => {
    languages.mockReturnValue(failed(new TranslationNotConfiguredError()));
    await renderScreen();

    expect(
      screen.getByText('Die Übersetzung ist auf diesem Server nicht eingerichtet.')
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Ausgangstext')).toBeNull();
    expect(screen.queryByText('Erneut versuchen')).toBeNull();
  });
});
