import { describe, expect, it } from 'vitest';

import { formatHasVorlagen, withVorlagenTab } from './vorlagenTab';

import type { SidebarTab, SidebarTabId } from '../../sidebar/types';

const tab = (id: SidebarTabId): SidebarTab => ({ id, icon: () => null, label: id, ariaLabel: id });

describe('withVorlagenTab', () => {
  it('sits right above Text', () => {
    const tabs = ['background', 'text', 'elements', 'chat'].map((id) => tab(id as SidebarTabId));
    expect(withVorlagenTab(tabs).map((t) => t.id)).toEqual([
      'background',
      'vorlagen',
      'text',
      'elements',
      'chat',
    ]);
  });

  it('comes first where a template has no Text tab', () => {
    expect(withVorlagenTab([tab('background')]).map((t) => t.id)).toEqual([
      'vorlagen',
      'background',
    ]);
  });
});

describe('formatHasVorlagen', () => {
  it('knows the sharepic formats, the default included', () => {
    expect(formatHasVorlagen('post-portrait')).toBe(true);
    expect(formatHasVorlagen('post-portrait-tall')).toBe(true);
    expect(formatHasVorlagen(undefined)).toBe(true);
  });

  it('has none for the profile picture', () => {
    expect(formatHasVorlagen('profile-square')).toBe(false);
  });
});
