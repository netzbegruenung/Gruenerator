import { type SharepicVorlage } from '@gruenerator/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SharepicVorlageDialog } from './SharepicVorlageDialog';

import { renderWithProviders } from '@/test-utils';

vi.mock('@/features/auth/hooks/useProfileData', () => ({
  useUserTemplates: () => ({ query: { data: [] } }),
}));

const credit = {
  photographer: 'Erika Muster',
  profileUrl: 'https://unsplash.com/@erika',
  photoUrl: 'https://unsplash.com/photos/abc',
};

const vorlage = (extra: Partial<SharepicVorlage>): SharepicVorlage => ({
  id: 'de-zitat',
  titel: 'Zitat',
  beschreibung: 'Ein Zitat auf Foto.',
  form: 'einzelbild',
  herkunft: 'alt-template',
  chat: { prompts: ['Erstelle ein Zitat-Sharepic'] },
  locale: 'de-DE',
  spec: { locale: 'de-DE', slides: [{}] } as never,
  attributions: [credit],
  ...extra,
});

describe('SharepicVorlageDialog', () => {
  it('credits the stock photo the preview shows', () => {
    renderWithProviders(<SharepicVorlageDialog vorlage={vorlage({})} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Erika Muster' })).toBeInTheDocument();
  });

  it('credits nobody under a stand-in preview, though the copy keeps the stock credit', () => {
    renderWithProviders(
      <SharepicVorlageDialog vorlage={vorlage({ previewAttributions: [null] })} onClose={vi.fn()} />
    );
    expect(screen.queryByText(/Foto:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Erika Muster' })).not.toBeInTheDocument();
  });
});
