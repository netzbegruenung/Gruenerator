import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useEditorStore } from '../../stores/editorStore';

import { EditorLayout } from './EditorLayout';

describe('EditorLayout mobile toggle', () => {
  it('exposes expanded state and the controlled sheet', async () => {
    useEditorStore.setState({ isMobileEditorOpen: false });
    const user = userEvent.setup();
    render(<EditorLayout sidebar={<p>Seitenleiste</p>} preview={<p>Vorschau</p>} />);
    const toggle = screen.getByRole('button', { name: 'Editor-Bereich ein-/ausblenden' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveTextContent(
      'Seitenleiste'
    );
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
