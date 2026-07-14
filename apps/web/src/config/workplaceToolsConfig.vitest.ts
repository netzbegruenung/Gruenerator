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

// The catalog currently has no external-link entries, so build one to exercise
// the `href` branch of the favouritable guard.
const externalTool: WorkplaceToolItem = {
  id: 'external-fixture',
  title: 'External',
  description: '',
  href: 'https://example.com',
  icon: byId('vorlagen').icon,
};

describe('isFavouritableTool', () => {
  it('accepts internal-route tools', () => {
    expect(isFavouritableTool(byId('vorlagen'))).toBe(true);
  });

  it('rejects external-link tools', () => {
    expect(isFavouritableTool(externalTool)).toBe(false);
  });
});

describe('sortToolsByFavourites', () => {
  const tools = [byId('agents'), byId('vorlagen'), byId('scanner')];

  it('keeps curated order when nothing is favourited', () => {
    expect(sortToolsByFavourites(tools, []).map((t) => t.id)).toEqual([
      'agents',
      'vorlagen',
      'scanner',
    ]);
  });

  it('floats favourites to the front in pin order', () => {
    expect(sortToolsByFavourites(tools, ['scanner', 'vorlagen']).map((t) => t.id)).toEqual([
      'scanner',
      'vorlagen',
      'agents',
    ]);
  });

  it('ignores favourite ids that are not in the list', () => {
    expect(sortToolsByFavourites(tools, ['notebooks', 'scanner']).map((t) => t.id)).toEqual([
      'scanner',
      'agents',
      'vorlagen',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [...tools];
    sortToolsByFavourites(input, ['scanner']);
    expect(input.map((t) => t.id)).toEqual(['agents', 'vorlagen', 'scanner']);
  });
});

describe('sidebar favourites registration', () => {
  it('registers internal workplace tools as favouritable', () => {
    expect(isFavouritableItem('vorlagen')).toBe(true);
    expect(getFavouriteItemsById(['vorlagen'])).toHaveLength(1);
  });

  it('does not register unknown tool ids', () => {
    expect(isFavouritableItem('external-fixture')).toBe(false);
  });
});
