import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VideoEditorPage, { VIDEO_EDITOR_APP_PATH } from './VideoEditorPage';

import { axe, render, screen } from '@/test-utils';

let isAdmin = true;
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'u1', email: 'person@example.org', is_admin: isAdmin } }),
}));

describe('VideoEditorPage', () => {
  beforeEach(() => {
    isAdmin = true;
  });

  it('embeds the editor app under its own path with an accessible name', async () => {
    const { container } = render(<VideoEditorPage />);
    const frame = screen.getByTitle('Gruenerator Video Editor');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/videoeditor/app/');
    expect(VIDEO_EDITOR_APP_PATH).toBe('/videoeditor/app/');
    // The frame's content is a separate app; jsdom cannot message into it.
    expect(await axe(container, { iframes: false })).toHaveNoViolations();
  });

  it('is open to instance admins only while it is being tried out', () => {
    isAdmin = false;
    render(
      <MemoryRouter>
        <VideoEditorPage />
      </MemoryRouter>
    );
    expect(screen.queryByTitle('Gruenerator Video Editor')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Kein Zugriff' })).toBeInTheDocument();
  });
});
