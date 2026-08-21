import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type Template } from '../types';

import VorlagenListSection from './VorlagenListSection';

import { renderWithProviders } from '@/test-utils';

const template = (overrides: Partial<Template>): Template =>
  ({
    id: 'tpl-1',
    title: 'Meine Vorlage',
    template_type: 'gruenerator',
    ...overrides,
  }) as Template;

function renderWith(t: Template) {
  return renderWithProviders(
    <VorlagenListSection
      title="Grünerator-Vorlagen"
      items={[t]}
      loading={false}
      emptyMessage="Keine Vorlagen"
      getActions={() => []}
      onOpen={() => {}}
    />
  );
}

describe('VorlagenListSection status badge', () => {
  it('shows no badge for a private draft', () => {
    renderWith(template({ is_private: true, status: 'draft' }));
    expect(screen.queryByText(/In Prüfung|Abgelehnt|Veröffentlicht/)).not.toBeInTheDocument();
  });

  it('marks a submitted template as in review', () => {
    renderWith(template({ is_private: false, status: 'pending_review' }));
    expect(screen.getByText('In Prüfung')).toBeInTheDocument();
  });

  it('marks a rejected template as rejected rather than published', () => {
    renderWith(template({ is_private: false, status: 'rejected' }));
    expect(screen.getByText('Abgelehnt')).toBeInTheDocument();
  });

  it('marks an approved template as published', () => {
    renderWith(template({ is_private: false, status: 'published' }));
    expect(screen.getByText('Veröffentlicht')).toBeInTheDocument();
  });
});
