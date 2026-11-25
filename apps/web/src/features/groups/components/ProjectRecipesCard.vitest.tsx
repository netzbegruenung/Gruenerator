/**
 * Die Rezepte-Karte im Projekt: „+ Rezept" und „Bearbeiten" öffnen denselben
 * Dialog. Bearbeiten darf nur, wem das Rezept gehört — ein geteiltes Rezept ist
 * ein Verweis auf die Zeile der teilenden Person, Projekt-Admins ändern es nicht.
 */
import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test-utils';

import { ProjectRecipesCard } from './ProjectRecipesCard';
import { type ShareActions } from './shareActions';

import { useAuthStore } from '@/stores/authStore';

const recipe = (over: Partial<GroupFeedItem> & { id: string; title: string }): GroupFeedItem => ({
  key: `user_text_forms:${over.id}`,
  contentType: 'user_text_forms',
  kind: 'recipe',
  excerpt: null,
  thumbnailUrl: null,
  slug: over.id,
  sharedByName: null,
  sharedById: null,
  sharedAt: null,
  share: null,
  projectWrite: null,
  post: null,
  ...over,
});

const adminActions: ShareActions = {
  canManage: () => true,
  canRemove: () => true,
  onSetWrite: vi.fn(),
  onRemove: vi.fn(),
};

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'me' } as never });
});

describe('ProjectRecipesCard', () => {
  it('bietet „Bearbeiten" nur für das eigene Rezept an — Admins nicht, mitgelieferte nie', async () => {
    const { user } = renderWithProviders(
      <ProjectRecipesCard
        groupId="g1"
        items={[
          recipe({ id: 'mein-rezept', title: 'Mein Rezept', sharedById: 'me' }),
          recipe({ id: 'fremdes', title: 'Fremdes Rezept', sharedById: 'other' }),
          // Selbst geteilt, aber mitgeliefert: gehört niemandem im Projekt.
          recipe({
            id: 'insta-berlin',
            title: 'Insta Berlin',
            sharedById: 'me',
            contentType: 'system_recipes',
            key: 'system_recipes:insta-berlin',
          }),
        ]}
        canAdd
        actions={adminActions}
        onDiscuss={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen für Mein Rezept' }));
    expect(await screen.findByRole('menuitem', { name: 'Bearbeiten' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    for (const title of ['Fremdes Rezept', 'Insta Berlin']) {
      await user.click(screen.getByRole('button', { name: `Weitere Aktionen für ${title}` }));
      expect(
        await screen.findByRole('menuitem', { name: /Aus dem Projekt entfernen/ })
      ).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      await user.keyboard('{Escape}');
    }
  });
});
