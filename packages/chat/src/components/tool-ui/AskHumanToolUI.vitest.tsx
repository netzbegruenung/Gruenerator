import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AskHumanToolUI } from './AskHumanToolUI';

describe('AskHumanToolUI', () => {
  it('renders the question and falls back to a default when args.question is missing', () => {
    render(<AskHumanToolUI args={{}} addResult={vi.fn()} />);
    expect(screen.getByText('Wie kann ich dir helfen?')).toBeInTheDocument();
  });

  it('renders an option button per entry and calls addResult with the clicked option', async () => {
    const user = userEvent.setup();
    const addResult = vi.fn();
    render(
      <AskHumanToolUI
        args={{ question: 'Welches Format?', options: ['PDF', 'Word'] }}
        addResult={addResult}
      />
    );
    expect(screen.getByText('Welches Format?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'PDF' }));
    expect(addResult).toHaveBeenCalledWith('PDF');
  });

  it('submits a trimmed custom answer via the send button', async () => {
    const user = userEvent.setup();
    const addResult = vi.fn();
    render(<AskHumanToolUI args={{ question: 'Frage' }} addResult={addResult} />);
    const input = screen.getByPlaceholderText('Oder eigene Antwort eingeben...');
    await user.type(input, '  Meine Antwort  ');
    // The send button has no accessible name — select the remaining button (options render none here).
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);
    expect(addResult).toHaveBeenCalledWith('Meine Antwort');
  });

  it('disables the send button while the custom input is empty', () => {
    render(<AskHumanToolUI args={{ question: 'Frage' }} addResult={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });

  it('submits the custom answer on Enter', async () => {
    const user = userEvent.setup();
    const addResult = vi.fn();
    render(<AskHumanToolUI args={{ question: 'Frage' }} addResult={addResult} />);
    const input = screen.getByPlaceholderText('Oder eigene Antwort eingeben...');
    await user.type(input, 'Enter-Antwort{Enter}');
    expect(addResult).toHaveBeenCalledWith('Enter-Antwort');
  });

  it('renders the resolved-answer summary instead of the form once a result exists', () => {
    render(<AskHumanToolUI args={{ question: 'Frage' }} result="PDF" addResult={vi.fn()} />);
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Oder eigene Antwort eingeben...')
    ).not.toBeInTheDocument();
  });

  it('ignores a non-array options value instead of crashing', () => {
    render(
      <AskHumanToolUI args={{ question: 'Frage', options: 'not-an-array' }} addResult={vi.fn()} />
    );
    // Only the custom-input button renders — no option buttons from the malformed value.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
