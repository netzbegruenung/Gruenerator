import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import VorlagenReviewCard from './VorlagenReviewCard';

import type { AdminVorlage } from '../hooks/useAdminVorlagen';

const base: AdminVorlage = {
  id: 'v1',
  title: 'Mobilitätswende',
  description: '',
  template_type: 'gruenerator',
  thumbnail_url: 'https://media.example/1.png',
  external_url: null,
  images: [],
  categories: [],
  tags: [],
  content_data: {},
  metadata: {},
  is_private: false,
  status: 'pending_review',
  creator_name: 'Timo',
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
};

const renderCard = (vorlage: AdminVorlage) =>
  render(
    <VorlagenReviewCard
      vorlage={vorlage}
      onApprove={() => {}}
      onReject={() => {}}
      isApproving={false}
      isRejecting={false}
    />
  );

describe('VorlagenReviewCard', () => {
  it('zeigt bei nur einem Bild keinen Pager', () => {
    renderCard(base);
    expect(screen.queryByRole('button', { name: 'Nächste Seite' })).toBeNull();
  });

  it('blättert durch jede Seite einer mehrseitigen Vorlage', async () => {
    renderCard({
      ...base,
      images: [
        { url: 'https://media.example/2.png', display_order: 1 },
        { url: 'https://media.example/1.png', display_order: 0 },
        { url: 'https://media.example/3.png', display_order: 2 },
      ],
    });

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.example/1.png');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nächste Seite' }));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.example/2.png');

    await userEvent.click(screen.getByRole('button', { name: 'Vorherige Seite' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vorherige Seite' }));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.example/3.png');
  });
});
