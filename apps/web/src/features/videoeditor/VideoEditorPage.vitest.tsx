import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import VideoEditorPage, {
  BETA_NOTICE_SEEN_KEY,
  editorAppSrc,
  VIDEO_EDITOR_APP_PATH,
} from './VideoEditorPage';

import { axe, render, screen } from '@/test-utils';

describe('VideoEditorPage', () => {
  beforeEach(() => {
    localStorage.setItem(BETA_NOTICE_SEEN_KEY, '1');
  });

  it('embeds the editor app under its own path with an accessible name', async () => {
    const { container } = render(<VideoEditorPage />);
    const frame = screen.getByTitle('Grünerator Video-Editor');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/videoeditor/app/');
    expect(VIDEO_EDITOR_APP_PATH).toBe('/videoeditor/app/');
    // The frame's content is a separate app; jsdom cannot message into it.
    expect(await axe(container, { iframes: false })).toHaveNoViolations();
  });

  it('shows the beta notice on the first visit only', async () => {
    localStorage.removeItem(BETA_NOTICE_SEEN_KEY);
    const { unmount } = render(<VideoEditorPage />);

    const dialog = screen.getByRole('dialog', { name: 'Der neue Video-Editor' });
    expect(await axe(dialog)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: "Los geht's" }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(BETA_NOTICE_SEEN_KEY)).toBe('1');

    unmount();
    render(<VideoEditorPage />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('passes only the KI-Schnitt parameters on to the editor app', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(editorAppSrc(`?ki=${id}&v=2&evil=1`)).toBe(`/videoeditor/app/?ki=${id}&v=2`);
    expect(editorAppSrc('?foo=bar')).toBe('/videoeditor/app/');
  });
});
