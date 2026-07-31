import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import BackgroundTab from './BackgroundTab';

import { CHAT_BACKGROUND_GROUPS } from '@/features/workplace/chatBackgrounds';
import { useAuthStore } from '@/stores/authStore';
import { axe } from '@/test-utils';

/**
 * Die ARIA-Struktur ist hier von Hand geschrieben — eine Radiogruppe, deren
 * Kacheln in Abschnitte mit eigenen Überschriften zerfallen. Genau das prüft
 * dieser Test: dass es EINE Auswahl bleibt und die Gruppierung sie nicht
 * zerlegt.
 */

const seedUser = (chatBackground?: string) => {
  useAuthStore.setState({
    user: { id: 'u1', chat_background: chatBackground } as never,
  });
};

afterEach(() => {
  useAuthStore.setState({ user: null });
  vi.restoreAllMocks();
});

describe('BackgroundTab', () => {
  it('renders every preset as one radio inside a single radiogroup', () => {
    seedUser('sunrise');
    render(<BackgroundTab />);

    const total = CHAT_BACKGROUND_GROUPS.reduce((sum, g) => sum + g.presets.length, 0);
    const group = screen.getByRole('radiogroup', { name: 'Startseiten-Hintergrund' });
    expect(within(group).getAllByRole('radio')).toHaveLength(total);
  });

  it('groups the presets under their family headings', () => {
    seedUser('sunrise');
    render(<BackgroundTab />);

    for (const { label, presets } of CHAT_BACKGROUND_GROUPS) {
      const heading = screen.getByRole('heading', { name: label });
      const section = heading.closest('section');
      expect(section).not.toBeNull();
      expect(within(section as HTMLElement).getAllByRole('radio')).toHaveLength(presets.length);
    }
  });

  it('checks only the stored preset', () => {
    seedUser('tanne');
    render(<BackgroundTab />);

    const checked = screen.getAllByRole('radio', { checked: true });
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName(/Tanne/);
  });

  it('falls back to the default preset when the profile has none', () => {
    seedUser(undefined);
    render(<BackgroundTab />);

    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(/Sonnenaufgang/);
  });

  it('saves the clicked preset', async () => {
    seedUser('sunrise');
    const update = vi.fn().mockResolvedValue(true);
    useAuthStore.setState({ updateChatBackground: update });
    render(<BackgroundTab />);

    await userEvent.setup().click(screen.getByRole('radio', { name: /Himmel/ }));
    expect(update).toHaveBeenCalledWith('himmel');
  });

  it('has no axe violations', async () => {
    seedUser('sunrise');
    const { container } = render(<BackgroundTab />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
