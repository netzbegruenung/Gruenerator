import { describe, expect, it } from 'vitest';

import VideoEditorPage, { VIDEO_EDITOR_APP_PATH } from './VideoEditorPage';

import { axe, render, screen } from '@/test-utils';

describe('VideoEditorPage', () => {
  it('embeds the editor app under its own path with an accessible name', async () => {
    const { container } = render(<VideoEditorPage />);
    const frame = screen.getByTitle('Gruenerator Video Editor');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/videoeditor/app/');
    expect(VIDEO_EDITOR_APP_PATH).toBe('/videoeditor/app/');
    // The frame's content is a separate app; jsdom cannot message into it.
    expect(await axe(container, { iframes: false })).toHaveNoViolations();
  });
});
