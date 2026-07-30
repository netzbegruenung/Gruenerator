import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setSkillFavoritesPersister, useSkillFavoritesStore } from './skillFavoritesStore';

const reset = (favorites: string[] = []) =>
  useSkillFavoritesStore.setState({ favorites, isHydrated: false });

describe('skillFavoritesStore', () => {
  beforeEach(() => {
    setSkillFavoritesPersister(() => {});
    reset();
  });

  it('toggles a mention on and off, lowercased', () => {
    const { toggleFavorite, isFavorite } = useSkillFavoritesStore.getState();
    toggleFavorite('Presse-Berlin');
    expect(useSkillFavoritesStore.getState().favorites).toEqual(['presse-berlin']);
    expect(isFavorite('PRESSE-BERLIN')).toBe(true);

    toggleFavorite('presse-berlin');
    expect(useSkillFavoritesStore.getState().favorites).toEqual([]);
  });

  it('persists every change', () => {
    const persist = vi.fn();
    setSkillFavoritesPersister(persist);
    useSkillFavoritesStore.getState().toggleFavorite('presse');
    expect(persist).toHaveBeenCalledWith(['presse']);
  });

  describe('hydrate', () => {
    it('keeps local stars the server has not seen yet and writes the union back', () => {
      const persist = vi.fn();
      setSkillFavoritesPersister(persist);
      reset(['insta-berlin']);

      useSkillFavoritesStore.getState().hydrate(['presse-berlin']);

      expect(useSkillFavoritesStore.getState().favorites).toEqual([
        'presse-berlin',
        'insta-berlin',
      ]);
      expect(persist).toHaveBeenCalledWith(['presse-berlin', 'insta-berlin']);
      expect(useSkillFavoritesStore.getState().isHydrated).toBe(true);
    });

    it('does not write back when the server list already matches', () => {
      const persist = vi.fn();
      setSkillFavoritesPersister(persist);
      reset(['presse-berlin']);

      useSkillFavoritesStore.getState().hydrate(['presse-berlin']);

      expect(persist).not.toHaveBeenCalled();
    });

    it('applies the seed only when the server has never stored a list', () => {
      const persist = vi.fn();
      setSkillFavoritesPersister(persist);

      useSkillFavoritesStore.getState().hydrate(null, ['presse-berlin', 'insta-berlin']);

      expect(useSkillFavoritesStore.getState().favorites).toEqual([
        'presse-berlin',
        'insta-berlin',
      ]);
      expect(persist).toHaveBeenCalledWith(['presse-berlin', 'insta-berlin']);
    });

    it('never re-adds a seeded recipe the user has since removed', () => {
      // The server now holds a list — the user kept one recipe and dropped the
      // other. Seeding must not undo that on the next load.
      reset();
      useSkillFavoritesStore
        .getState()
        .hydrate(['presse-berlin'], ['presse-berlin', 'insta-berlin']);
      expect(useSkillFavoritesStore.getState().favorites).toEqual(['presse-berlin']);
    });
  });

  describe('addFavorites', () => {
    it('adds only what is missing and persists once', () => {
      const persist = vi.fn();
      setSkillFavoritesPersister(persist);
      reset(['presse-berlin']);

      useSkillFavoritesStore.getState().addFavorites(['PRESSE-BERLIN', 'insta-berlin']);

      expect(useSkillFavoritesStore.getState().favorites).toEqual([
        'presse-berlin',
        'insta-berlin',
      ]);
      expect(persist).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when everything is already starred', () => {
      const persist = vi.fn();
      setSkillFavoritesPersister(persist);
      reset(['presse-berlin']);

      useSkillFavoritesStore.getState().addFavorites(['presse-berlin']);

      expect(persist).not.toHaveBeenCalled();
    });
  });
});
