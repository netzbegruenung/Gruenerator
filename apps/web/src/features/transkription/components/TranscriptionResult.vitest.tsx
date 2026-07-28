import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import TranscriptionResult from './TranscriptionResult';

const DIARIZED = '[speaker_0] Guten Abend. [speaker_0] TOP 1. [speaker_1] Einspruch.';

function renderDiarized(props: Partial<Parameters<typeof TranscriptionResult>[0]> = {}) {
  return render(
    <TranscriptionResult text={DIARIZED} segments={[]} hasTimestamps={false} {...props} />
  );
}

describe('TranscriptionResult — diarized view', () => {
  it('shows one label per speaker turn rather than one per segment', () => {
    renderDiarized();
    // speaker_0 speaks twice in a row, so it must be labelled once.
    expect(screen.getAllByText('Sprecher*in 1')).toHaveLength(1);
    expect(screen.getByText('Guten Abend. TOP 1.')).toBeInTheDocument();
    expect(screen.getByText('Einspruch.')).toBeInTheDocument();
  });

  it('applies the speaker map, so user corrections show up', () => {
    renderDiarized({ speakerMap: { speaker_1: 'Katja Hoyer' } });
    expect(screen.getByText('Katja Hoyer')).toBeInTheDocument();
    expect(screen.queryByText('Sprecher*in 2')).not.toBeInTheDocument();
  });

  it('renders labels as plain text when renaming is not offered', () => {
    renderDiarized();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reports the clicked speaker id and its current label when renaming is offered', async () => {
    const onRenameSpeaker = vi.fn();
    renderDiarized({ speakerMap: { speaker_1: 'Katja Hoyer' }, onRenameSpeaker });

    await userEvent.click(screen.getByRole('button', { name: 'Katja Hoyer' }));

    expect(onRenameSpeaker).toHaveBeenCalledWith('speaker_1', 'Katja Hoyer');
  });

  it('has no axe violations', async () => {
    const { container } = renderDiarized({ onRenameSpeaker: vi.fn() });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('TranscriptionResult — other views', () => {
  // Asserts the branch choice, not the Markdown rendering: the shared Markdown
  // component does not parse under jsdom, so it emits the source text verbatim.
  it('shows the Protokoll instead of the speaker blocks when one is passed', () => {
    render(
      <TranscriptionResult
        text={DIARIZED}
        segments={[]}
        hasTimestamps={false}
        formattedText={'# Sitzungsprotokoll\n\nBeschluss angenommen.'}
      />
    );
    expect(screen.getByText(/Beschluss angenommen\./)).toBeInTheDocument();
    expect(screen.queryByText('Sprecher*in 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Einspruch.')).not.toBeInTheDocument();
  });

  it('falls back to timecoded segments when there are no speaker markers', () => {
    render(
      <TranscriptionResult
        text="Ein Satz ohne Marker."
        segments={[{ start: 0, end: 61, text: 'Ein Satz ohne Marker.' }]}
        hasTimestamps
      />
    );
    expect(screen.getByText('0:00 – 1:01')).toBeInTheDocument();
  });

  it('renders plain text when there are neither markers nor timestamps', () => {
    render(<TranscriptionResult text="Nur Text." segments={[]} hasTimestamps={false} />);
    expect(screen.getByText('Nur Text.')).toBeInTheDocument();
  });
});
