import { decodeSiteDraft, getBlockFragment } from '@gruenerator/contracts/site-ydoc';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { BASE_DRAFT, seededDoc } from '../../../draft/testDoc';

const ABOUT = BASE_DRAFT.blocks.find((block) => block.type === 'about')!.id;

import RichTextEditor from './RichTextEditor';

describe('RichTextEditor', () => {
  it('typing writes into the fragment', async () => {
    const ydoc = seededDoc();
    render(<RichTextEditor fragment={getBlockFragment(ydoc, ABOUT)} maxLength={500} id="about" />);
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox');
    act(() => box.focus());
    await user.keyboard('Hallo Welt');
    expect(JSON.stringify(decodeSiteDraft(ydoc).blocks.find((b) => b.id === ABOUT))).toContain(
      'Hallo Welt'
    );
  });

  it('shows text that arrives in the fragment from elsewhere', async () => {
    const ydoc = seededDoc();
    render(<RichTextEditor fragment={getBlockFragment(ydoc, ABOUT)} maxLength={500} />);
    await screen.findByRole('textbox');
    const source = seededDoc({
      blocks: BASE_DRAFT.blocks.map((block) =>
        block.type === 'about'
          ? {
              ...block,
              content: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Von außen' }] }],
              },
            }
          : block
      ),
    });
    const { applyUpdate, encodeStateAsUpdate } = await import('yjs');
    act(() => {
      applyUpdate(ydoc, encodeStateAsUpdate(source));
    });
    expect(await screen.findByText(/Von außen/)).toBeInTheDocument();
  });
});
