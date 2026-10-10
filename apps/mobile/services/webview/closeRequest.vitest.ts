import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCloseRequest } from './closeRequest';

function setup() {
  const requestClose = vi.fn();
  const close = vi.fn();
  const closeRequest = createCloseRequest({ requestClose, close, timeoutMs: 1500 });
  return { requestClose, close, closeRequest };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createCloseRequest', () => {
  it('leaves back to the router while the page has nothing to flush', () => {
    // Non-editor pages and older deploys: no announcement, no 1.5 s delay.
    const { requestClose, close, closeRequest } = setup();

    expect(closeRequest.onHardwareBack()).toBe(false);
    expect(requestClose).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('asks the page and closes on its CLOSE', () => {
    const { requestClose, close, closeRequest } = setup();
    closeRequest.setPageHandles(true);

    expect(closeRequest.onHardwareBack()).toBe(true);
    expect(requestClose).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();

    closeRequest.onPageClose();
    expect(close).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes after the deadline when the page never answers', () => {
    const { close, closeRequest } = setup();
    closeRequest.setPageHandles(true);
    closeRequest.onHardwareBack();

    vi.advanceTimersByTime(1499);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ignores a late CLOSE after the deadline closed — it would pop the screen below', () => {
    const { close, closeRequest } = setup();
    closeRequest.setPageHandles(true);
    closeRequest.onHardwareBack();
    vi.advanceTimersByTime(1500);

    closeRequest.onPageClose();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes at once on a second press while waiting', () => {
    const { requestClose, close, closeRequest } = setup();
    closeRequest.setPageHandles(true);
    closeRequest.onHardwareBack();

    expect(closeRequest.onHardwareBack()).toBe(true);
    expect(requestClose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1500);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('stops intercepting once the page withdraws its handler', () => {
    const { requestClose, closeRequest } = setup();
    closeRequest.setPageHandles(true);
    closeRequest.setPageHandles(false);

    expect(closeRequest.onHardwareBack()).toBe(false);
    expect(requestClose).not.toHaveBeenCalled();
  });

  it('dispose cancels a pending deadline', () => {
    const { close, closeRequest } = setup();
    closeRequest.setPageHandles(true);
    closeRequest.onHardwareBack();

    closeRequest.dispose();
    vi.advanceTimersByTime(1500);
    expect(close).not.toHaveBeenCalled();
  });
});
