import { describe, expect, it, jest } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';

import { InitialTurnSender } from './InitialTurnSender';

const mockComposer = {
  addAttachment: jest.fn(async () => undefined),
  setText: jest.fn(),
  send: jest.fn(),
};
jest.mock('@assistant-ui/react-native', () => ({ useAui: () => ({ composer: mockComposer }) }));
jest.mock('../../stores/pendingAttachmentStore', () => ({
  usePendingAttachmentStore: { getState: () => ({ drain: () => [] }) },
}));

describe('InitialTurnSender', () => {
  it('sends the opening message once, even when re-rendered with a new one', async () => {
    const view = await render(<InitialTurnSender message="Erste" />);
    await waitFor(() => expect(mockComposer.send).toHaveBeenCalledTimes(1));
    await view.rerender(<InitialTurnSender message="Zweite" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockComposer.send).toHaveBeenCalledTimes(1);
    expect(mockComposer.setText).toHaveBeenCalledWith('Erste');
    expect(mockComposer.setText).not.toHaveBeenCalledWith('Zweite');
  });

  it('creates the Projekt thread before it sends', async () => {
    mockComposer.send.mockClear();
    const beforeSend = jest.fn(async () => {
      expect(mockComposer.send).not.toHaveBeenCalled();
    });
    await render(<InitialTurnSender message="Im Projekt" beforeSend={beforeSend} />);
    await waitFor(() => expect(mockComposer.send).toHaveBeenCalledTimes(1));
    expect(beforeSend).toHaveBeenCalledTimes(1);
  });

  it('hands the text back to the composer when the thread could not be created', async () => {
    mockComposer.send.mockClear();
    mockComposer.setText.mockClear();
    const beforeSend = jest.fn(async () => {
      throw new Error('offline');
    });
    await render(<InitialTurnSender message="Verloren?" beforeSend={beforeSend} />);
    await waitFor(() => expect(mockComposer.setText).toHaveBeenCalledWith('Verloren?'));
    expect(mockComposer.send).not.toHaveBeenCalled();
  });
});
