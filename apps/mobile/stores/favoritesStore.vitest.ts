import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetAsyncStorage } from '../test/stubs/async-storage';

import { useFavoritesStore } from './favoritesStore';

const STORAGE_KEY = 'notebook-favourites';

const reset = (): void => {
  __resetAsyncStorage();
  useFavoritesStore.setState({ favouriteIds: [], loaded: false });
};

beforeEach(() => {
  reset();
  vi.restoreAllMocks();
});

describe('toggle', () => {
  it('adds a favourite at the front, so the newest is first in the sidebar', () => {
    const { toggle } = useFavoritesStore.getState();
    toggle('a');
    toggle('b');
    expect(useFavoritesStore.getState().favouriteIds).toEqual(['b', 'a']);
  });

  it('removes an existing favourite', () => {
    const { toggle } = useFavoritesStore.getState();
    toggle('a');
    toggle('b');
    toggle('a');
    expect(useFavoritesStore.getState().favouriteIds).toEqual(['b']);
  });

  it('caps at three and drops the oldest', () => {
    const { toggle } = useFavoritesStore.getState();
    ['a', 'b', 'c', 'd'].forEach(toggle);
    expect(useFavoritesStore.getState().favouriteIds).toEqual(['d', 'c', 'b']);
  });

  it('does not drop anything when removing while at the cap', () => {
    const { toggle } = useFavoritesStore.getState();
    ['a', 'b', 'c'].forEach(toggle);
    toggle('b');
    expect(useFavoritesStore.getState().favouriteIds).toEqual(['c', 'a']);
  });

  it('persists after every toggle', async () => {
    useFavoritesStore.getState().toggle('a');
    await vi.waitFor(async () => {
      expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(['a']));
    });
  });
});

describe('isFavourite', () => {
  it('reflects the current list', () => {
    const { toggle, isFavourite } = useFavoritesStore.getState();
    expect(isFavourite('a')).toBe(false);
    toggle('a');
    expect(useFavoritesStore.getState().isFavourite('a')).toBe(true);
  });
});

describe('load', () => {
  it('reads the persisted list once', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(['x', 'y']));

    await useFavoritesStore.getState().load();

    expect(useFavoritesStore.getState().favouriteIds).toEqual(['x', 'y']);
    expect(useFavoritesStore.getState().loaded).toBe(true);
  });

  it('is a no-op once loaded, so a second screen mount cannot clobber toggles', async () => {
    await useFavoritesStore.getState().load();
    useFavoritesStore.getState().toggle('a');

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(['stale']));
    await useFavoritesStore.getState().load();

    expect(useFavoritesStore.getState().favouriteIds).toEqual(['a']);
  });

  it('marks itself loaded when storage throws', async () => {
    vi.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('unavailable'));

    await useFavoritesStore.getState().load();

    expect(useFavoritesStore.getState().loaded).toBe(true);
    expect(useFavoritesStore.getState().favouriteIds).toEqual([]);
  });

  it('marks itself loaded when the stored JSON is corrupt', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');

    await useFavoritesStore.getState().load();

    expect(useFavoritesStore.getState().loaded).toBe(true);
    expect(useFavoritesStore.getState().favouriteIds).toEqual([]);
  });
});
