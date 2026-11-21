import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ImageUpload } from './ImageUpload';

const upload = vi.fn();
let uploading = false;

vi.mock('@gruenerator/shared/media-library', () => ({
  useMediaPicker: () => ({ openImagePicker: vi.fn() }),
  useMediaUpload: () => ({ upload, isUploading: uploading, progress: 42 }),
}));

describe('ImageUpload', () => {
  it('no interactive element contains another', () => {
    const { container } = render(<ImageUpload value="/a.png" onChange={vi.fn()} />);
    expect(container.querySelector('button button')).toBeNull();
    expect(container.querySelector('[role=button] button')).toBeNull();
    expect(container.querySelector('[role=button]')).toBeNull();
    expect(container.querySelector('[tabindex="0"]:not(button)')).toBeNull();
  });

  it('Entfernen clears the value', async () => {
    const onChange = vi.fn();
    render(<ImageUpload value="/a.png" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('offers Entfernen only with a value', () => {
    render(<ImageUpload value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Entfernen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hochladen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aus Mediathek' })).toBeInTheDocument();
  });

  it('Hochladen opens the hidden file input', async () => {
    const { container } = render(<ImageUpload value="" onChange={vi.fn()} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await userEvent.click(screen.getByRole('button', { name: 'Hochladen' }));
    expect(click).toHaveBeenCalled();
    expect(input).toHaveClass('sr-only');
    expect(input.tabIndex).toBe(-1);
  });

  it('shows progress as a progressbar', () => {
    uploading = true;
    render(<ImageUpload value="" onChange={vi.fn()} />);
    uploading = false;
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('names the group by the field label and keeps the visible button names', async () => {
    const { container } = render(
      <>
        <span id="lbl">Hintergrundbild</span>
        <ImageUpload value="/a.png" onChange={vi.fn()} labelledBy="lbl" />
      </>
    );
    expect(screen.getByRole('group', { name: 'Hintergrundbild' })).toBeInTheDocument();
    for (const name of ['Hochladen', 'Aus Mediathek', 'Entfernen']) {
      expect(screen.getByRole('button', { name })).toHaveTextContent(name);
    }
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ImageUpload value="/a.png" onChange={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
    const empty = render(<ImageUpload value="" onChange={vi.fn()} />);
    expect(await axe(empty.container)).toHaveNoViolations();
  });
});
