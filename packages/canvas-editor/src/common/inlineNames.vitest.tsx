/**
 * Task 3: Namen für Inline-Editoren, Speicherstatus als Text, Lightbox als Dialog.
 */
import { RichTextField } from '@ggraphic/editor/components/RichTextField';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AutoSaveIndicator } from '../components/TopBar/AutoSaveIndicator';
import { axe } from '../test-utils';

import { Lightbox } from './Lightbox';

const mockState = vi.hoisted(() => ({ status: null as string | null }));
vi.mock('@ggraphic/editor/stores/useAutoSaveStore', () => ({
  useAutoSaveStore: (selector: (s: unknown) => unknown) =>
    selector({ autoSaveStatus: mockState.status, retryAutoSave: () => {} }),
}));

describe('RichTextField', () => {
  it('ist ein benanntes mehrzeiliges Textfeld', async () => {
    const { container } = render(<RichTextField value="Hallo" onChange={() => {}} />);
    const box = screen.getByRole('textbox', { name: 'Text bearbeiten' });
    expect(box).toHaveAttribute('aria-multiline', 'true');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('AutoSaveIndicator', () => {
  it.each([
    ['saving', 'Speichert …'],
    ['saved', 'Gespeichert'],
    ['error', 'Fehler beim Speichern'],
  ] as const)('%s steht als Text im Status', async (status, text) => {
    mockState.status = status;
    const { container } = render(<AutoSaveIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Lightbox', () => {
  it('ist ein benannter Dialog und schließt mit Escape', async () => {
    const onClose = vi.fn();
    render(
      <Lightbox isOpen onClose={onClose} imageSrc="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
    );
    expect(screen.getByRole('dialog', { name: 'Bildvorschau' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('rendert nichts, solange er zu ist', () => {
    render(<Lightbox isOpen={false} onClose={() => {}} imageSrc="x.png" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
