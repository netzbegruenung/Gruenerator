/**
 * Label und Wirkung des Sichtbarkeits-Knopfs müssen zusammenpassen.
 *
 * Die Ableitung war einmal negiert: der Knopf sagte „Privat machen" und schickte
 * `is_private: false`. Ein Test, der nur „updateTemplateVisibility wurde
 * gerufen" prüft, hätte das nicht gesehen — deshalb wird hier der übergebene
 * Wert gegen die angezeigte Beschriftung geprüft, in allen vier Zuständen.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Template } from '../types';

import { useTemplateActions } from './useTemplateActions';

import { renderWithProviders } from '@/test-utils';

const updateTemplateVisibility = vi.fn(() => Promise.resolve());

vi.mock('@/features/auth/hooks/useProfileData', () => ({
  useUserTemplates: () => ({
    query: { data: [], isLoading: false },
    deleteTemplate: vi.fn(),
    updateTemplateVisibility,
    updateTemplate: vi.fn(),
  }),
}));

const template = (overrides: Partial<Template>): Template =>
  ({ id: 'tpl-1', title: 'Meine Vorlage', template_type: 'gruenerator', ...overrides }) as Template;

/** Renders the actions as plain buttons so label and click sit on one element. */
function Harness({ t }: { t: Template }) {
  const { getActions } = useTemplateActions({ onEdit: () => {} });
  return (
    <>
      {getActions(t).map((a) => (
        <button key={a.label} type="button" onClick={a.onClick}>
          {a.label}
        </button>
      ))}
    </>
  );
}

beforeEach(() => {
  updateTemplateVisibility.mockClear();
});

describe('useTemplateActions visibility toggle', () => {
  it.each([
    ['draft', { is_private: true, status: 'draft' }, 'Zur Galerie einreichen', false],
    ['rejected', { is_private: false, status: 'rejected' }, 'Zur Galerie einreichen', false],
    ['pending_review', { is_private: false, status: 'pending_review' }, 'Privat machen', true],
    ['published', { is_private: false, status: 'published' }, 'Privat machen', true],
  ] as const)(
    'sendet aus %s heraus, was der Knopf verspricht',
    async (_name, state, label, sent) => {
      renderWithProviders(<Harness t={template(state)} />);

      await userEvent.click(screen.getByRole('button', { name: label }));

      expect(updateTemplateVisibility).toHaveBeenCalledWith('tpl-1', sent);
    }
  );
});
