import { DEFAULT_IMAGE_FORMAT, DEFAULT_STYLE_VARIANT } from '@gruenerator/shared/image-studio';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BevComposer } from './BevComposer';
import { type BildEditorV2 } from './useBildEditorV2';

// The composer reads a handful of fields; the full hook needs a router and stores.
function fakeBev(patch: Partial<BildEditorV2> = {}): BildEditorV2 {
  return {
    mode: 'erstellen',
    active: null,
    generating: false,
    error: null,
    settings: {
      variant: DEFAULT_STYLE_VARIANT,
      kiLabel: 'full',
      format: DEFAULT_IMAGE_FORMAT,
      aspect: '1:1',
    },
    setSettings: vi.fn(),
    submit: vi.fn().mockResolvedValue(true),
    ...patch,
  } as unknown as BildEditorV2;
}

const field = () => screen.getByPlaceholderText('Beschreibe dein Bild …');

describe('BevComposer', () => {
  it('keeps typing local to the composer', () => {
    const bev = fakeBev();
    render(<BevComposer bev={bev} />);
    fireEvent.change(field(), { target: { value: 'Ein Wald' } });
    expect(field()).toHaveValue('Ein Wald');
    expect(bev.submit).not.toHaveBeenCalled();
  });

  it('submits the typed text and clears it once a version is committed', async () => {
    const bev = fakeBev();
    render(<BevComposer bev={bev} />);
    fireEvent.change(field(), { target: { value: 'Ein Wald' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(bev.submit).toHaveBeenCalledWith('Ein Wald');
    await waitFor(() => expect(field()).toHaveValue(''));
  });

  it('keeps the text when the submit did not commit', async () => {
    const bev = fakeBev({ submit: vi.fn().mockResolvedValue(false) });
    render(<BevComposer bev={bev} />);
    fireEvent.change(field(), { target: { value: 'Ein Wald' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(bev.submit).toHaveBeenCalled());
    expect(field()).toHaveValue('Ein Wald');
  });
});
