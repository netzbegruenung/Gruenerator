import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadDataUrl } from '../../../utils/downloadFile';

import { ToolResultCard } from './ToolResultCard';

vi.mock('../../../utils/downloadFile', () => ({ downloadDataUrl: vi.fn() }));

const props = { beforeSrc: 'data:before', afterSrc: 'data:after', downloadName: 'x.png' };

describe('ToolResultCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('toggles between before and after', () => {
    render(<ToolResultCard {...props} />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:after');
    fireEvent.click(screen.getByRole('button', { name: 'Vorher' }));
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:before');
    expect(screen.getByRole('button', { name: 'Vorher' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('downloads the result', () => {
    render(<ToolResultCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    expect(downloadDataUrl).toHaveBeenCalledWith('data:after', 'x.png');
  });

  it('shows the canvas button only when a handler is given', async () => {
    const { rerender } = render(<ToolResultCard {...props} />);
    expect(screen.queryByRole('button', { name: 'In Canvas bearbeiten' })).toBeNull();
    const onEdit = vi.fn().mockResolvedValue(undefined);
    rerender(<ToolResultCard {...props} onEditInCanvas={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'In Canvas bearbeiten' }));
    await waitFor(() => expect(onEdit).toHaveBeenCalled());
  });

  it('surfaces canvas errors', async () => {
    const onEdit = vi.fn().mockRejectedValue(new Error('kaputt'));
    render(<ToolResultCard {...props} onEditInCanvas={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'In Canvas bearbeiten' }));
    expect((await screen.findByRole('alert')).textContent).toContain('kaputt');
  });

  it('shows a German error when the download fails', async () => {
    vi.mocked(downloadDataUrl).mockRejectedValueOnce(new Error('weg'));
    render(<ToolResultCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    expect((await screen.findByRole('alert')).textContent).toContain('weg');
  });
});
