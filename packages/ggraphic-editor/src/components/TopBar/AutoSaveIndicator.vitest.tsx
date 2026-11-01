// SPDX-License-Identifier: MPL-2.0
import { render, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { messages, registerMessages } from '@ggraphic/editor/i18n/messages';
import {
  defaultAutoSaveStore,
  type AutoSaveStatus,
} from '@ggraphic/editor/stores/createAutoSaveStore';

import { AutoSaveIndicator } from './AutoSaveIndicator.js';

function setStatus(status: AutoSaveStatus) {
  act(() => defaultAutoSaveStore.setState({ autoSaveStatus: status }));
}

afterEach(() => {
  registerMessages('de');
  setStatus('idle');
});

describe('AutoSaveIndicator', () => {
  it('announces no error for idle', () => {
    setStatus('idle');
    const { container } = render(<AutoSaveIndicator />);
    const t = messages();
    const text = container.textContent ?? '';
    expect(text).not.toContain(t.topBar.saveErrorShort);
    expect(text).not.toContain(t.topBar.saveErrorRetry);
    expect(container.querySelector('[title]')?.getAttribute('title') ?? '').not.toContain(
      t.topBar.saveErrorRetry
    );
  });

  it.each([
    ['en', 'Saved'],
    ['de', 'Gespeichert'],
  ] as const)('shows the saved label in %s', (locale, label) => {
    registerMessages(locale);
    setStatus('saved');
    render(<AutoSaveIndicator />);
    expect(screen.getByRole('status').textContent).toContain(label);
  });

  it('keeps the error text and retry button for error', () => {
    setStatus('error');
    render(<AutoSaveIndicator />);
    expect(screen.getByRole('status').textContent).toContain(messages().topBar.saveErrorShort);
    expect(screen.getByRole('button', { name: messages().topBar.saveRetry })).toBeTruthy();
  });
});
