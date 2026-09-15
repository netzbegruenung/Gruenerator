import { USER_SELECTABLE_TOOL_KEYS, isUserSelectableTool } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

import {
  RAW_TOOL_NAME_TO_PICKER_KEY,
  agentAllowsTool,
  applyAgentToolWhitelist,
  resolveAgentToolKeys,
  shouldApplyAgentToolWhitelist,
} from './agentToolWhitelist.js';

import type { AgentConfig } from './types.js';

const withTools = (enabledTools?: string[]): Pick<AgentConfig, 'enabledTools'> =>
  ({ enabledTools }) as Pick<AgentConfig, 'enabledTools'>;

describe('resolveAgentToolKeys', () => {
  it('returns null for an agent that declares nothing — absence is "unconfigured"', () => {
    expect(resolveAgentToolKeys(withTools())).toBeNull();
  });

  it('returns an empty set for an empty declaration — nothing allowed', () => {
    expect(resolveAgentToolKeys(withTools([]))?.size).toBe(0);
  });

  it('maps every raw tool name the editor agents declare onto its picker key', () => {
    const keys = resolveAgentToolKeys(withTools(Object.keys(RAW_TOOL_NAME_TO_PICKER_KEY)));
    expect([...(keys ?? [])].sort()).toEqual(
      [
        'web',
        'research',
        'scrape',
        'image',
        'image_edit',
        'vision',
        'search',
        'examples',
        'user_content',
      ].sort()
    );
  });

  it('treats web and research as one capability in both directions', () => {
    expect(resolveAgentToolKeys(withTools(['research']))?.has('web')).toBe(true);
    expect(resolveAgentToolKeys(withTools(['web']))?.has('research')).toBe(true);
  });

  it('passes unknown keys through untouched', () => {
    const keys = resolveAgentToolKeys(withTools(['memory', 'pressemitteilung_examples']));
    expect(keys?.has('memory')).toBe(true);
    expect(keys?.has('pressemitteilung_examples')).toBe(true);
  });

  it('every alias target is a picker key — the map cannot drift from the closed set', () => {
    for (const target of Object.values(RAW_TOOL_NAME_TO_PICKER_KEY)) {
      expect(isUserSelectableTool(target), target).toBe(true);
    }
  });
});

describe('agentAllowsTool', () => {
  it('keeps everything when the agent declares nothing at all', () => {
    expect(agentAllowsTool(withTools(), 'web')).toBe(true);
    expect(agentAllowsTool(withTools(), 'pdf_form')).toBe(true);
  });

  it('honours the picker key', () => {
    expect(agentAllowsTool(withTools(['search', 'web']), 'web')).toBe(true);
  });

  it('honours the persisted legacy "research" key for web, and web for research', () => {
    expect(agentAllowsTool(withTools(['research']), 'web')).toBe(true);
    expect(agentAllowsTool(withTools(['web']), 'research')).toBe(true);
  });

  it('honours the raw tool names', () => {
    expect(agentAllowsTool(withTools(['gruenerator_search', 'web_search']), 'web')).toBe(true);
    expect(agentAllowsTool(withTools(['scrape_url']), 'scrape')).toBe(true);
    expect(agentAllowsTool(withTools(['find_content']), 'user_content')).toBe(true);
  });

  it('closes a tool the agent declares nothing for', () => {
    expect(agentAllowsTool(withTools(['search', 'memory', 'self_review']), 'web')).toBe(false);
    expect(agentAllowsTool(withTools(['search', 'web']), 'image')).toBe(false);
  });

  it('treats an empty declaration as "nothing allowed"', () => {
    expect(agentAllowsTool(withTools([]), 'web')).toBe(false);
  });
});

describe('applyAgentToolWhitelist', () => {
  it('returns the request record untouched (same reference) for an undeclared agent', () => {
    const request = { search: true, web: true };
    expect(applyAgentToolWhitelist(withTools(), request)).toBe(request);
  });

  it('writes an explicit false for every closed-set key the agent did not choose', () => {
    const out = applyAgentToolWhitelist(withTools(['search', 'web']), {
      search: true,
      web: true,
      examples: true,
      image: true,
    });
    expect(out.search).toBe(true);
    expect(out.web).toBe(true);
    expect(out.examples).toBe(false);
    expect(out.image).toBe(false);
    for (const key of [
      'image_edit',
      'vision',
      'scrape',
      'meinungsbild',
      'user_content',
      'search_threads',
      'pdf_form',
      'cloud_files',
    ]) {
      expect(out[key], key).toBe(false);
    }
  });

  it('never widens: a key the agent allows but the request omits stays absent', () => {
    const out = applyAgentToolWhitelist(withTools(['search', 'web']), { search: true, web: true });
    expect(out.research).toBeUndefined();
    expect(applyAgentToolWhitelist(withTools(['image']), {}).image).toBeUndefined();
  });

  it('lets a request false win — the composer toggle still counts', () => {
    expect(applyAgentToolWhitelist(withTools(['search', 'web']), { web: false }).web).toBe(false);
  });

  it('closes both web and research when the agent has neither', () => {
    const out = applyAgentToolWhitelist(withTools(['search']), {});
    expect(out.web).toBe(false);
    expect(out.research).toBe(false);
  });

  it('keeps web, research and scrape open for raw tool names', () => {
    const out = applyAgentToolWhitelist(
      withTools(['gruenerator_search', 'web_search', 'scrape_url']),
      { search: true, web: true, research: true }
    );
    expect(out.search).toBe(true);
    expect(out.web).toBe(true);
    expect(out.research).toBe(true);
    expect(out.scrape).toBeUndefined();
    expect(out.image).toBe(false);
  });

  it('leaves keys outside the closed set exactly as requested', () => {
    const request = {
      hilfe: true,
      edit_current_doc: true,
      pressemitteilung_examples: true,
      rezept_laden: false,
      person: true,
    };
    const out = applyAgentToolWhitelist(withTools(['search']), request);
    for (const [key, value] of Object.entries(request)) {
      expect(out[key], key).toBe(value);
    }
  });

  it('closes every closed-set key for an empty declaration', () => {
    const out = applyAgentToolWhitelist(withTools([]), { search: true });
    for (const key of USER_SELECTABLE_TOOL_KEYS) {
      expect(out[key], key).toBe(false);
    }
  });

  it('does not mutate the request record', () => {
    const request = { search: true, web: true, image: true };
    applyAgentToolWhitelist(withTools(['search']), request);
    expect(request).toEqual({ search: true, web: true, image: true });
  });
});

describe('shouldApplyAgentToolWhitelist', () => {
  it('binds agents the loader marked as user-created', () => {
    expect(shouldApplyAgentToolWhitelist({ isUserAgent: true })).toBe(true);
  });

  it('leaves system agents alone — their arrays stay web/scrape gates only', () => {
    expect(shouldApplyAgentToolWhitelist({})).toBe(false);
  });
});
