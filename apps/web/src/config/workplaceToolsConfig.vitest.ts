import { describe, expect, it } from 'vitest';

import { getFavouriteItemsById, isFavouritableItem } from './sidebarFavouritesConfig';
import {
  WORKPLACE_TOOLS,
  isFavouritableTool,
  sortToolsByFavourites,
  type WorkplaceToolItem,
} from './workplaceToolsConfig';

const byId = (id: string): WorkplaceToolItem => {
  const tool = WORKPLACE_TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`fixture missing tool ${id}`);
  return tool;
};

const ICON = byId('agents').icon;
const mk = (id: string): WorkplaceToolItem => ({
  id,
  title: id,
  description: '',
  path: `/${id}`,
  icon: ICON,
});

// The link-tile catalog has no external-link entries, so build one to exercise
// the `href` branch of the favouritable guard.
const externalTool: WorkplaceToolItem = {
  id: 'external-fixture',
  title: 'External',
  description: '',
  href: 'https://example.com',
  icon: ICON,
};

describe('isFavouritableTool', () => {
  it('accepts internal-route tools', () => {
    expect(isFavouritableTool(byId('agents'))).toBe(true);
  });

  it('rejects external-link tools', () => {
    expect(isFavouritableTool(externalTool)).toBe(false);
  });
});

describe('sortToolsByFavourites', () => {
  const tools = [mk('a'), mk('b'), mk('c')];

  it('keeps curated order when nothing is favourited', () => {
    expect(sortToolsByFavourites(tools, []).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('floats favourites to the front in pin order', () => {
    expect(sortToolsByFavourites(tools, ['c', 'b']).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('ignores favourite ids that are not in the list', () => {
    expect(sortToolsByFavourites(tools, ['notebooks', 'c']).map((t) => t.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [...tools];
    sortToolsByFavourites(input, ['c']);
    expect(input.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sidebar favourites registration', () => {
  it('registers internal workplace tools as favouritable', () => {
    expect(isFavouritableItem('agents')).toBe(true);
    expect(getFavouriteItemsById(['agents'])).toHaveLength(1);
  });

  it('does not register unknown tool ids', () => {
    expect(isFavouritableItem('external-fixture')).toBe(false);
  });
});
