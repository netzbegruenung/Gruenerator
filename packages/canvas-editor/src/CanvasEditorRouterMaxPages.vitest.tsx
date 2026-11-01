import { render, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const captured: { maxPages: number | null } = { maxPages: null };

vi.mock('./components/CanvasEditor', () => ({
  CanvasEditor: (props: { maxPages: number }) => {
    captured.maxPages = props.maxPages;
    return null;
  },
}));

import { ControllableCanvasWrapper } from './CanvasEditorRouter';

import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';

const renderWith = (type: 'freeform' | 'freeform-at', formatId: string) =>
  render(
    <ControllableCanvasWrapper
      type={type}
      formatId={formatId}
      initialState={{}}
      onExport={vi.fn()}
      onCancel={vi.fn()}
    />
  );

describe('ControllableCanvasWrapper Seitendeckel', () => {
  // Der kalte Import der Freeform-Configs dauert unter Last länger als waitFor
  beforeAll(async () => {
    await Promise.all([loadCanvasConfig('freeform'), loadCanvasConfig('freeform-at')]);
  }, 120_000);

  it.each(['freeform', 'freeform-at'] as const)(
    'gibt %s-Präsentationen 60 Seiten',
    async (type) => {
      captured.maxPages = null;
      renderWith(type, 'slide-16-9');
      await waitFor(() => expect(captured.maxPages).toBe(60), { timeout: 5000 });
    }
  );

  it('lässt andere Formate bei 10', async () => {
    captured.maxPages = null;
    renderWith('freeform', 'post-portrait');
    await waitFor(() => expect(captured.maxPages).toBe(10), { timeout: 5000 });
  });
});
