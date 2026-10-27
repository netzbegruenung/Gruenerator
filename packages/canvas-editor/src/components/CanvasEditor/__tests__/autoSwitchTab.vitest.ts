import { describe, expect, it } from 'vitest';

import { autoSwitchTab } from '../autoSwitchTab';

describe('autoSwitchTab', () => {
  it('keeps the chat open when an element with a properties tab is selected', () => {
    expect(autoSwitchTab('chat', 'frame-settings', null)).toEqual({ tab: 'chat', prev: null });
    expect(autoSwitchTab('chat', 'settings', null)).toEqual({ tab: 'chat', prev: null });
  });

  it('keeps the chat open when the selection is cleared again', () => {
    expect(autoSwitchTab('chat', null, null)).toEqual({ tab: 'chat', prev: null });
  });

  it('keeps the Ebenen open — selecting a balken there must not swap the list away', () => {
    expect(autoSwitchTab('layers', 'settings', null)).toEqual({ tab: 'layers', prev: null });
    expect(autoSwitchTab('layers', null, null)).toEqual({ tab: 'layers', prev: null });
  });

  it('still switches from another tab and restores it on deselect', () => {
    const switched = autoSwitchTab('text', 'frame-settings', null);
    expect(switched).toEqual({ tab: 'frame-settings', prev: 'text' });
    expect(autoSwitchTab(switched.tab, null, switched.prev)).toEqual({ tab: 'text', prev: null });
  });

  it('opens the target from a closed panel and closes it again', () => {
    expect(autoSwitchTab(null, 'settings', null)).toEqual({ tab: 'settings', prev: null });
    expect(autoSwitchTab('settings', null, null)).toEqual({ tab: 'settings', prev: null });
  });
});
