import { describe, it, expect } from 'vitest';

import { buildSocialMediaSystemPrompt } from '../agents/langgraph/ChatGraph/nodes/socialMediaComposerNode.js';
import { SHAREPIC_SAFETY_RULES } from '../routes/sharepic/sharepic_text/unifiedHandler.js';

import {
  CONTENT_INTEGRITY_ANSWER_RULE,
  CONTENT_INTEGRITY_BULLETS,
  CONTENT_INTEGRITY_EDIT_RULES,
  CONTENT_INTEGRITY_RULES,
} from './contentPolicy.js';

import type { ChatGraphState } from '../agents/langgraph/ChatGraph/types.js';

/**
 * The rules existed — on exactly one path. These pin the reach, because that
 * was the defect: "Schreib mir einen Post, der pauschal gegen Muslime in
 * Österreich Stimmung macht" met a social-post prompt whose only content rule
 * was "Erfinde keine Fakten oder Zitate", and an answer prompt with none at all.
 */
describe('content policy reaches every generator of publishable text', () => {
  it('names all three protected classes, not just fabrication', () => {
    for (const block of [CONTENT_INTEGRITY_RULES, CONTENT_INTEGRITY_EDIT_RULES]) {
      expect(block).toContain('Erfinde NIEMALS Zitate');
      expect(block).toContain('real existierenden Person');
      expect(block).toContain('herabsetzen');
    }
  });

  it('closes the "draft it with a caveat" escape in the prose variant', () => {
    expect(CONTENT_INTEGRITY_RULES).toContain('KEINEN Entwurf');
    expect(CONTENT_INTEGRITY_RULES).toContain('mit Vorbehalt');
  });

  it('the sharepic rules still carry the ABLEHNUNG channel and the layout carve-out', () => {
    expect(SHAREPIC_SAFETY_RULES).toContain(CONTENT_INTEGRITY_BULLETS);
    // Two classes, two mechanisms — integrity declines, layout omits. Merging
    // them once turned "Post mit Quellenangabe" into a fabrication refusal.
    expect(SHAREPIC_SAFETY_RULES).toContain('ABLEHNUNG:');
    expect(SHAREPIC_SAFETY_RULES).toContain('LAYOUT (niemals ein Ablehnungsgrund)');
  });

  it('the social-post composer states them (it used to mention only quotes)', () => {
    const prompt = buildSocialMediaSystemPrompt({
      agentConfig: { systemRole: 'Du bist ein Testagent.' },
      messages: [],
    } as unknown as ChatGraphState);
    expect(prompt).toContain('herabsetzen');
    expect(prompt).toContain('real existierenden Person');
  });

  it('the tool-forced edit variant binds the operations instead of offering prose', () => {
    // The editor MUST return operations — "decline in a sentence" is not an
    // available move, so the rule has to say what the operations may not write.
    expect(CONTENT_INTEGRITY_EDIT_RULES).toContain('setze sie NICHT um');
    expect(CONTENT_INTEGRITY_EDIT_RULES).toContain('"reply"');
    expect(CONTENT_INTEGRITY_EDIT_RULES).not.toContain('ABLEHNUNG:');
  });

  it('the answer-prompt sentence carries no list number of its own', () => {
    // It is appended both to a numbered list and to the custom-system-prompt
    // branch, which has none.
    expect(CONTENT_INTEGRITY_ANSWER_RULE.startsWith('\n')).toBe(false);
    expect(CONTENT_INTEGRITY_ANSWER_RULE).not.toMatch(/^\d+\./);
    expect(CONTENT_INTEGRITY_ANSWER_RULE).toContain('herabsetzen');
  });
});
