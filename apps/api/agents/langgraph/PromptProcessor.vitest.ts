/**
 * Tests for PromptProcessor validation and template engine
 *
 * Covers:
 * - validateRequest() with inhalt bypass for smart detection
 * - SimpleTemplateEngine {{#if}} conditional blocks
 * - rede.json template resilience to missing fields
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect } from 'vitest';

import { validateRequest, SimpleTemplateEngine, loadPromptConfig } from './PromptProcessor.js';

// ============================================================================
// validateRequest — inhalt bypass
// ============================================================================

describe('validateRequest', () => {
  const redeConfig = loadPromptConfig('rede');

  it('passes when customPrompt is provided', () => {
    const result = validateRequest({ customPrompt: 'Write a speech' }, redeConfig);
    expect(result).toBeNull();
  });

  it('passes when inhalt is provided (smart detection flow)', () => {
    const result = validateRequest({ inhalt: 'Rede über Klimaschutz in Berlin' }, redeConfig);
    expect(result).toBeNull();
  });

  it('passes when rolle and thema are provided (normal form flow)', () => {
    const result = validateRequest({ rolle: 'Bürgermeister', thema: 'Klimaschutz' }, redeConfig);
    expect(result).toBeNull();
  });

  it('fails when no fields are provided', () => {
    const result = validateRequest({}, redeConfig);
    expect(result).toBeTruthy();
    expect(result).toContain('Inhalt');
  });

  it('fails when only rolle is provided (thema missing)', () => {
    const result = validateRequest({ rolle: 'Bürgermeister' }, redeConfig);
    expect(result).toBeTruthy();
  });

  it('passes with inhalt even if rolle/thema are missing', () => {
    const result = validateRequest({ inhalt: 'Klimaschutz-Debatte' }, redeConfig);
    expect(result).toBeNull();
  });
});

// ============================================================================
// SimpleTemplateEngine — {{#if}} conditional blocks
// ============================================================================

describe('SimpleTemplateEngine conditional blocks', () => {
  it('renders content when field is present', () => {
    const template = '{{#if name}}Hello {{name}}{{/if}}';
    const result = SimpleTemplateEngine.render(template, { name: 'World' });
    expect(result).toBe('Hello World');
  });

  it('removes block when field is missing', () => {
    const template = 'Start {{#if name}}Hello {{name}}{{/if}}End';
    const result = SimpleTemplateEngine.render(template, {});
    expect(result).toBe('Start End');
  });

  it('removes block when field is empty string', () => {
    const template = '{{#if name}}Hello {{name}}{{/if}}';
    const result = SimpleTemplateEngine.render(template, { name: '' });
    expect(result).toBe('');
  });

  it('handles multiple conditional blocks', () => {
    const template = '{{#if a}}A:{{a}} {{/if}}{{#if b}}B:{{b}} {{/if}}{{#if c}}C:{{c}}{{/if}}';
    const result = SimpleTemplateEngine.render(template, { a: '1', c: '3' });
    expect(result).toBe('A:1 C:3');
  });

  it('preserves non-conditional content', () => {
    const template = 'Prefix {{#if x}}({{x}}){{/if}} Suffix';
    const result = SimpleTemplateEngine.render(template, { x: 'val' });
    expect(result).toBe('Prefix (val) Suffix');
  });
});

// ============================================================================
// rede.json template — resilience to missing fields
// ============================================================================

describe('rede requestTemplate', () => {
  const redeConfig = loadPromptConfig('rede');
  const template = redeConfig.requestTemplate!;

  it('renders with only inhalt (smart detection flow)', () => {
    const result = SimpleTemplateEngine.render(template, {
      inhalt: 'Rede über erneuerbare Energien',
    });
    expect(result).toContain('<inhalt>');
    expect(result).toContain('Rede über erneuerbare Energien');
    expect(result).not.toContain('<rolle>');
    expect(result).not.toContain('<thema>');
  });

  it('renders with rolle and thema (normal form flow)', () => {
    const result = SimpleTemplateEngine.render(template, {
      rolle: 'Fraktionsvorsitzende',
      thema: 'Energiewende',
    });
    expect(result).not.toContain('<inhalt>');
    expect(result).toContain('<rolle>');
    expect(result).toContain('Fraktionsvorsitzende');
    expect(result).toContain('<thema>');
    expect(result).toContain('Energiewende');
  });

  it('renders with all fields', () => {
    const result = SimpleTemplateEngine.render(template, {
      inhalt: 'Kernpunkte der Debatte',
      rolle: 'Bundestagsabgeordnete',
      thema: 'Klimaschutzgesetz',
      redezeit: '10',
    });
    expect(result).toContain('<inhalt>');
    expect(result).toContain('<rolle>');
    expect(result).toContain('<thema>');
    expect(result).toContain('<redezeit>');
  });

  it('renders gracefully with no optional fields', () => {
    const result = SimpleTemplateEngine.render(template, {});
    expect(result).not.toContain('<inhalt>');
    expect(result).not.toContain('<rolle>');
    expect(result).not.toContain('<thema>');
    expect(result).not.toContain('<redezeit>');
    expect(result).toContain('Aktuelles Datum:');
  });
});
