import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLeaveWarning } from './useLeaveWarning';

function fireBeforeUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('useLeaveWarning', () => {
  it('beforeunload is cancelled only while active', () => {
    const { rerender, unmount } = renderHook(({ active }) => useLeaveWarning(active), {
      initialProps: { active: false },
    });
    expect(fireBeforeUnload()).toBe(false);
    rerender({ active: true });
    expect(fireBeforeUnload()).toBe(true);
    rerender({ active: false });
    expect(fireBeforeUnload()).toBe(false);
    rerender({ active: true });
    unmount();
    expect(fireBeforeUnload()).toBe(false);
  });
});
