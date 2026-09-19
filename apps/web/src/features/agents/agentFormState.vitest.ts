import { type Agent } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

import { EMPTY_FORM, formToPayload, hydrateFormState, type FormState } from './agentFormState';

const AGENT: Agent = {
  identifier: 'mein-agent',
  title: 'Mein Agent',
  description: 'Ein Testagent',
  systemRole: 'Du bist ein Testagent.',
  avatar: '✨',
  backgroundColor: '#587C6D',
  tags: ['klima'],
  model: 'mistral-large-latest',
  provider: 'mistral',
  params: { max_tokens: 3000, temperature: 0.5 },
  openingMessage: '',
  openingQuestions: [],
  locale: 'de-DE',
  author: 'Eigene*r Agent*in',
  defaultRecipeMention: 'presse',
  defaultRecipeId: 'a1b2c3d4-0000-0000-0000-000000000000',
};

describe('hydrateFormState', () => {
  it('carries the default-recipe binding through', () => {
    const form = hydrateFormState(AGENT);
    expect(form.defaultRecipeMention).toBe('presse');
    expect(form.defaultRecipeId).toBe('a1b2c3d4-0000-0000-0000-000000000000');
  });

  it('falls back to null when the agent has no default recipe', () => {
    const { defaultRecipeMention: _mention, defaultRecipeId: _id, ...rest } = AGENT;
    const form = hydrateFormState(rest as Agent);
    expect(form.defaultRecipeMention).toBeNull();
    expect(form.defaultRecipeId).toBeNull();
  });
});

describe('formToPayload', () => {
  it('passes both default-recipe fields through', () => {
    const form: FormState = {
      ...EMPTY_FORM,
      defaultRecipeMention: 'presse',
      defaultRecipeId: null,
    };
    const payload = formToPayload(form);
    expect(payload.defaultRecipeMention).toBe('presse');
    expect(payload.defaultRecipeId).toBeNull();
  });

  it('sending null clears a previously set default recipe', () => {
    const form: FormState = {
      ...EMPTY_FORM,
      defaultRecipeMention: null,
      defaultRecipeId: null,
    };
    const payload = formToPayload(form);
    expect(payload.defaultRecipeMention).toBeNull();
    expect(payload.defaultRecipeId).toBeNull();
  });

  it('round-trips a hydrated agent unchanged', () => {
    const payload = formToPayload(hydrateFormState(AGENT));
    expect(payload.defaultRecipeMention).toBe(AGENT.defaultRecipeMention);
    expect(payload.defaultRecipeId).toBe(AGENT.defaultRecipeId);
  });

  it('never emits the removed skillMentions field', () => {
    const payload = formToPayload(hydrateFormState(AGENT));
    expect(payload).not.toHaveProperty('skillMentions');
    expect(EMPTY_FORM).not.toHaveProperty('skillMentions');
  });
});
