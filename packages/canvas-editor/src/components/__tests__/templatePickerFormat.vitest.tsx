/**
 * Der Seiten-Picker bietet nur noch die freie Seite an — sie folgt jedem
 * Format. Die alten Vorlagentypen (3 Zeilen, Zitat, Info …) gibt es für neue
 * Seiten nicht mehr.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TemplatePickerFlyout } from '../TemplatePickerFlyout';

const picker = (mode: 'add' | 'replace', formatId?: string) =>
  render(
    <TemplatePickerFlyout
      isOpen
      mode={mode}
      currentTemplateId="freeform"
      onSelectTemplate={vi.fn()}
      onDuplicateCurrent={vi.fn()}
      onClose={vi.fn()}
      {...(formatId ? { formatId } : {})}
    />
  );

describe('template picker by document format', () => {
  it.each([
    ['add', 'post-portrait'],
    ['replace', 'post-portrait'],
    ['add', 'post-portrait-tall'],
    ['replace', 'post-portrait-tall'],
    ['add', 'print-visitenkarte-quer'],
    ['replace', 'print-a3-hoch'],
  ] as const)('offers only the free page (%s, %s)', (mode, formatId) => {
    picker(mode, formatId);
    expect(screen.getByRole('button', { name: /Leere Seite/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /3 Zeilen|Zitat|Info|Event/ })).toBeNull();
  });

  it('offers the free page on a print format, never an empty list', () => {
    picker('add', 'print-visitenkarte-hoch');
    expect(screen.getByRole('button', { name: /Leere Seite/ })).toBeTruthy();
    expect(screen.queryByText(/keine weiteren Vorlagen/)).toBeNull();
  });

  it('keeps duplicating the current page at 3:4', () => {
    picker('add', 'post-portrait-tall');
    expect(screen.getByRole('button', { name: /Aktuelle Seite duplizieren/ })).toBeTruthy();
  });
});
