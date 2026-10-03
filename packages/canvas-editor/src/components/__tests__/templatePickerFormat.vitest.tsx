/**
 * Im 3:4-Dokument bietet der Seiten-Picker nur Vorlagen an, die dem Format
 * folgen. Eine feste 4:5-Vorlage würde auf die 1440 hohe Bühne gestreckt.
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
  it.each(['add', 'replace'] as const)(
    'offers the 4:5 templates in a 4:5 document (%s)',
    (mode) => {
      picker(mode, 'post-portrait');
      expect(screen.getByRole('button', { name: /3 Zeilen/ })).toBeTruthy();
      expect(screen.queryByText('Für dieses Format gibt es keine weiteren Vorlagen.')).toBeNull();
    }
  );

  it.each(['add', 'replace'] as const)('offers no fixed 4:5 template at 3:4 (%s)', (mode) => {
    picker(mode, 'post-portrait-tall');
    expect(screen.queryByRole('button', { name: /3 Zeilen|Zitat|Info|Event/ })).toBeNull();
    expect(screen.getByText('Für dieses Format gibt es keine weiteren Vorlagen.')).toBeTruthy();
  });

  it('keeps duplicating the current page at 3:4', () => {
    picker('add', 'post-portrait-tall');
    expect(screen.getByRole('button', { name: /Aktuelle Seite duplizieren/ })).toBeTruthy();
  });
});
