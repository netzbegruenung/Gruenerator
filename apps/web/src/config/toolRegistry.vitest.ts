import { describe, expect, it } from 'vitest';

import { getToolCatalog } from '../features/global-search/toolCatalog';

import {
  LEGACY_TOOL_ID_ALIASES,
  TOOLS,
  officeSuiteTools,
  toolMenus,
  toolSearchCatalog,
  toolsWithTile,
  type ToolDefinition,
} from './toolRegistry';
import {
  CANVAS_TOOLS,
  OFFICE_SUITE_TOOLS,
  OFFICE_TOOLS,
  TOOL_MENUS,
  WORKPLACE_TOOLS,
} from './workplaceToolsConfig';

// Widened view: iterating the as-const union directly would reject access to
// surface blocks that not every member declares.
const tools: readonly ToolDefinition[] = TOOLS;

describe('toolRegistry invariants', () => {
  it('tool ids are unique, including the office create tiles', () => {
    const ids = [...tools.map((t) => t.id), ...officeSuiteTools().map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every legacy alias points at an existing tool id', () => {
    const ids = new Set(tools.map((t) => t.id));
    for (const [alias, target] of Object.entries(LEGACY_TOOL_ID_ALIASES)) {
      expect(ids.has(target), `alias ${alias} → ${target}`).toBe(true);
    }
  });

  it('no tool id collides with a legacy alias key', () => {
    const aliasKeys = new Set(Object.keys(LEGACY_TOOL_ID_ALIASES));
    for (const tool of tools) {
      expect(aliasKeys.has(tool.id), `tool id ${tool.id} is also an alias key`).toBe(false);
    }
  });

  it('favouritable and tiled tools have a rooted path', () => {
    for (const tool of tools) {
      if (tool.favourite || tool.tile) {
        expect(tool.path?.startsWith('/'), `${tool.id} needs a path starting with '/'`).toBe(true);
      }
      if (tool.menuItem) {
        const rooted = tool.path?.startsWith('/') === true;
        expect(rooted || tool.href != null, `${tool.id} needs a rooted path or an href`).toBe(true);
      }
    }
  });

  it('search entries are unique and each searchable tool has a path', () => {
    const searchIds = tools.filter((t) => t.search).map((t) => t.search?.id ?? t.id);
    expect(new Set(searchIds).size).toBe(searchIds.length);
    for (const tool of tools) {
      if (tool.search) {
        expect(tool.path?.startsWith('/'), `${tool.id} search entry needs a path`).toBe(true);
      }
    }
  });
});

// The two AST-parsed config files cannot derive their arrays at runtime (the
// docs generators need literals), so this is the lockstep guarantee: every
// mirror array must deep-equal its registry-derived counterpart — including
// icon component identity and element order.
describe('literal mirrors stay in lockstep with the registry', () => {
  it('workplaceToolsConfig mirrors the registry tiles', () => {
    expect(OFFICE_TOOLS).toEqual(toolsWithTile('bereiche'));
    expect(WORKPLACE_TOOLS).toEqual(toolsWithTile('organisieren'));
    expect(CANVAS_TOOLS).toEqual(toolsWithTile('studio'));
    expect(OFFICE_SUITE_TOOLS).toEqual(officeSuiteTools());
    expect(TOOL_MENUS).toEqual(toolMenus());
  });

  it('toolCatalog mirrors the registry search blocks', () => {
    expect(getToolCatalog(true)).toEqual(toolSearchCatalog());
  });

  it('search catalog covers exactly the search-enabled tools', () => {
    const derived = toolSearchCatalog().map((entry) => entry.id);
    const declared = tools.filter((t) => t.search).map((t) => t.search?.id ?? t.id);
    expect([...derived].sort()).toEqual([...declared].sort());
  });
});
