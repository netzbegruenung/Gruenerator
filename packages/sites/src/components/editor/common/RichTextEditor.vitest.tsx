import { decodeSiteDraft, getAboutFragment } from '@gruenerator/contracts/site-ydoc';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { seededDoc } from '../../../draft/testDoc';

import RichTextEditor from './RichTextEditor';

describe('RichTextEditor', () => {
  it('typing writes into the fragment', async () => {
    const ydoc = seededDoc();
    render(<RichTextEditor fragment={getAboutFragment(ydoc)} maxLength={500} id="about" />);
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox');
    act(() => box.focus());
    await user.keyboard('Hallo Welt');
    expect(JSON.stringify(decodeSiteDraft(ydoc).about.content)).toContain('Hallo Welt');
  });

  it('shows text that arrives in the fragment from elsewhere', async () => {
    const ydoc = seededDoc();
    render(<RichTextEditor fragment={getAboutFragment(ydoc)} maxLength={500} />);
    await screen.findByRole('textbox');
    const source = seededDoc({
      about: {
        title: 'x',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Von außen' }] }],
        },
      },
    });
    const { applyUpdate, encodeStateAsUpdate } = await import('yjs');
    act(() => {
      applyUpdate(ydoc, encodeStateAsUpdate(source));
    });
    expect(await screen.findByText(/Von außen/)).toBeInTheDocument();
  });
});
