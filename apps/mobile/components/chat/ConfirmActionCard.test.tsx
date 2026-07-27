/* eslint-disable import-x/order -- `@jest/globals` MUST stay the first import.
   babel-plugin-jest-hoist lifts the `jest.mock` call below above the other
   requires; only a `@jest/globals` require that already precedes it survives
   that move. Sorted alphabetically (after `@gruenerator/*`) the factory blows up
   with "Cannot read properties of undefined (reading 'jest')". */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { confirmChatAction } from '@gruenerator/chat';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { lightTheme } from '../../theme/colors';

import { ConfirmActionCard } from './ConfirmActionCard';

import type { ConfirmActionData, ConfirmActionOutcome } from '@gruenerator/chat';

jest.mock('@gruenerator/chat', () => ({ confirmChatAction: jest.fn() }));

const mockConfirm = confirmChatAction as jest.MockedFunction<typeof confirmChatAction>;

/**
 * The card is a small state machine over the outcome of one POST. The states are
 * mutually exclusive by construction, and the one that has bitten before is a
 * spinner rendering next to an error — so "loading" and "error" are asserted to
 * never coexist.
 */

const ACTION: ConfirmActionData = {
  actionId: 'a1',
  type: 'save_as_doc',
  title: 'Als Dokument speichern',
  description: 'Der Text wird in deinen Dokumenten abgelegt.',
  icon: 'document',
  metadata: [{ key: 'Titel', value: 'Kampagnenplan' }],
  confirmLabel: 'Speichern',
  cancelLabel: 'Abbrechen',
  threadId: 't1',
};

const renderCard = (action: ConfirmActionData = ACTION) =>
  render(<ConfirmActionCard action={action} theme={lightTheme} />);

/**
 * Settle the confirmChatAction promise and let React commit the state it sets.
 *
 * Needed because `waitFor(() => expect(queryByText(…)).toBeNull())` — waiting for
 * something to *disappear* — does not reliably recover here: when the press's own
 * act scope happens to flush the promise, the first check passes and the test is
 * green; when it does not, the poll loop never observes the flip and the test
 * hangs until the timeout. That coin flip was the whole flakiness. Measured: one
 * flush is always enough, so the wait can be explicit and the assertion plain.
 */
const settle = () => act(async () => {});

/** Resolve the pending confirmChatAction call by hand, so "loading" is observable. */
const deferOutcome = (): { resolve: (outcome: ConfirmActionOutcome) => void } => {
  let resolve!: (outcome: ConfirmActionOutcome) => void;
  mockConfirm.mockReturnValueOnce(
    new Promise<ConfirmActionOutcome>((r) => {
      resolve = r;
    })
  );
  return { resolve };
};

beforeEach(() => {
  // clearAllMocks() does NOT drain the mockResolvedValueOnce queue. A test that
  // queues an outcome without consuming it would then hand that outcome to the
  // next test, and the failure would surface several tests later.
  jest.resetAllMocks();
});

describe('idle state', () => {
  it('renders the title, description, metadata and both labels', () => {
    renderCard();

    expect(screen.getByText('Als Dokument speichern')).toBeTruthy();
    expect(screen.getByText('Der Text wird in deinen Dokumenten abgelegt.')).toBeTruthy();
    expect(screen.getByText('Kampagnenplan')).toBeTruthy();
    expect(screen.getByText('Speichern')).toBeTruthy();
    expect(screen.getByText('Abbrechen')).toBeTruthy();
  });

  it('omits the description when there is none', () => {
    renderCard({ ...ACTION, description: '' });

    expect(screen.queryByText('Der Text wird in deinen Dokumenten abgelegt.')).toBeNull();
  });

  it('renders without a metadata row when metadata is empty', () => {
    renderCard({ ...ACTION, metadata: [] });

    expect(screen.queryByText('Kampagnenplan')).toBeNull();
    expect(screen.getByText('Als Dokument speichern')).toBeTruthy();
  });

  it.each([
    'save_as_doc',
    'modify_doc',
    'modify_board',
    'share_doc',
    'create_group',
    'join_group',
  ] as const)('renders every action type without a missing-icon crash: %s', (type) => {
    expect(() => renderCard({ ...ACTION, type })).not.toThrow();
  });
});

describe('confirming', () => {
  it('posts confirmed=true and shows the title as a badge', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'confirmed', url: null });
    renderCard();

    fireEvent.press(screen.getByText('Speichern'));

    await settle();

    expect(screen.queryByText('Speichern')).toBeNull();
    expect(mockConfirm).toHaveBeenCalledWith(ACTION, true);
    expect(screen.getByText('Als Dokument speichern')).toBeTruthy();
  });

  it('offers "Dokument öffnen" only when the result URL resolves to a document', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'confirmed', url: '/document/abc123' });
    renderCard();

    fireEvent.press(screen.getByText('Speichern'));

    expect(await screen.findByText('Dokument öffnen')).toBeTruthy();
  });

  it('offers no open link when the result URL is not a document route', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'confirmed', url: '/gruppen/42' });
    renderCard();

    fireEvent.press(screen.getByText('Speichern'));

    await settle();

    expect(screen.queryByText('Speichern')).toBeNull();
    expect(screen.queryByText('Dokument öffnen')).toBeNull();
    expect(screen.queryByText('Gruppe öffnen')).toBeNull();
  });

  it('labels the link per action type', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'confirmed', url: '/document/abc123' });
    renderCard({ ...ACTION, type: 'modify_board' });

    fireEvent.press(screen.getByText('Speichern'));

    expect(await screen.findByText('Board öffnen')).toBeTruthy();
  });

  it('navigates to the doc editor with the extracted id', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'confirmed', url: '/office/abc123?tab=chat' });
    renderCard();

    fireEvent.press(screen.getByText('Speichern'));
    fireEvent.press(await screen.findByText('Dokument öffnen'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(fullscreen)/doc-editor',
      params: { id: 'abc123' },
    });
  });
});

describe('rejecting and expiry', () => {
  it('posts confirmed=false and shows "Abgebrochen"', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'rejected' });
    renderCard();

    fireEvent.press(screen.getByText('Abbrechen'));

    expect(await screen.findByText('Abgebrochen')).toBeTruthy();
    expect(mockConfirm).toHaveBeenCalledWith(ACTION, false);
  });

  it('shows "Aktion abgelaufen" when the backend reports expiry', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'expired' });
    renderCard();

    fireEvent.press(screen.getByText('Speichern'));

    expect(await screen.findByText('Aktion abgelaufen')).toBeTruthy();
  });
});

describe('error state', () => {
  it('surfaces the backend message and offers a retry', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'error', message: 'Speichern fehlgeschlagen' });
    renderCard();

    fireEvent.press(screen.getByText('Speichern'));

    expect(await screen.findByText('Speichern fehlgeschlagen')).toBeTruthy();
    expect(screen.getByText('Erneut versuchen')).toBeTruthy();
  });

  it('retry returns to idle and allows a second attempt', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'error', message: 'Netzwerkfehler' });
    renderCard();

    fireEvent.press(screen.getByText('Speichern'));
    fireEvent.press(await screen.findByText('Erneut versuchen'));

    expect(screen.getByText('Speichern')).toBeTruthy();
    expect(screen.queryByText('Netzwerkfehler')).toBeNull();

    mockConfirm.mockResolvedValueOnce({ status: 'confirmed', url: null });
    fireEvent.press(screen.getByText('Speichern'));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(2));
  });

  it('never shows a spinner and an error at the same time', async () => {
    const { resolve } = deferOutcome();
    renderCard();

    fireEvent.press(screen.getByText('Speichern'));

    // Mid-flight: spinner is up, no error text yet.
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1);
    expect(screen.queryByText('Netzwerkfehler')).toBeNull();

    resolve({ status: 'error', message: 'Netzwerkfehler' });

    // Settled: error is up, spinner is gone.
    expect(await screen.findByText('Netzwerkfehler')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  });
});

describe('double submission', () => {
  it('ignores further presses while the request is in flight', async () => {
    const { resolve } = deferOutcome();
    renderCard();

    fireEvent.press(screen.getByText('Speichern'));
    fireEvent.press(screen.getByText('Speichern'));
    fireEvent.press(screen.getByText('Abbrechen'));

    expect(mockConfirm).toHaveBeenCalledTimes(1);

    resolve({ status: 'confirmed', url: null });
    await settle();

    expect(screen.queryByText('Speichern')).toBeNull();
  });
});
