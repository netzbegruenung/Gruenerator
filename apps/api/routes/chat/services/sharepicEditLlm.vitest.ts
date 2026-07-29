/**
 * The sharepic-edit LLM writes the chat `reply` in the same call that emits the
 * operations — so it used to invent precise values ("Schriftgröße auf 80px
 * erhöht") the ops never contained. The system prompt must forbid that; this
 * pins the guard so a prompt edit can't silently drop it.
 */
import {
  buildSharepicSnapshot,
  getSharepicTemplateDescriptor,
  type SharepicTemplateDescriptor,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from './sharepicEditLlm.js';

const descriptor = getSharepicTemplateDescriptor('dreizeilen') as SharepicTemplateDescriptor;

describe('sharepic edit reply guard', () => {
  const prompt = buildSystemPrompt(
    descriptor,
    buildSharepicSnapshot(descriptor, descriptor.defaultState),
    []
  );

  it('forbids inventing concrete numeric values in the reply', () => {
    expect(prompt).toMatch(/KEINE konkreten Zahlenwerte/);
    // The exact "80px" anti-example from the live bug must be named.
    expect(prompt).toMatch(/80px/);
  });

  it('still asks for a short chat confirmation reply', () => {
    expect(prompt).toMatch(/"reply"/);
  });

  // Creation is guarded by SHAREPIC_SAFETY_RULES, so a fabricated quote is
  // declined up front — but this prompt had no content rule at all, which left
  // the edit path as a way to the same card: build a benign quote sharepic,
  // then edit its text into an attribution to a real politician.
  it('carries the content rules the creation path has', () => {
    expect(prompt).toContain('real existierenden Person');
    expect(prompt).toContain('herabsetzen');
    expect(prompt).toContain('setze sie NICHT um');
  });
});
