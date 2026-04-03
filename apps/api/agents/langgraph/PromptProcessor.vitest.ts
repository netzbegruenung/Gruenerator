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
    expect(result).toContain('Thema');
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

  it('renders with thema only', () => {
    const result = SimpleTemplateEngine.render(template, {
      thema: 'Rede über erneuerbare Energien',
    });
    expect(result).toContain('<thema>');
    expect(result).toContain('Rede über erneuerbare Energien');
    expect(result).not.toContain('<redezeit>');
  });

  it('renders with thema and redezeit', () => {
    const result = SimpleTemplateEngine.render(template, {
      thema: 'Energiewende',
      redezeit: '15',
    });
    expect(result).toContain('<thema>');
    expect(result).toContain('Energiewende');
    expect(result).toContain('<redezeit>');
    expect(result).toContain('15');
  });

  it('renders with all fields', () => {
    const result = SimpleTemplateEngine.render(template, {
      thema: 'Klimaschutzgesetz',
      redezeit: '10',
      currentDate: '2026-03-31',
    });
    expect(result).toContain('<thema>');
    expect(result).toContain('Klimaschutzgesetz');
    expect(result).toContain('<redezeit>');
    expect(result).toContain('Aktuelles Datum: 2026-03-31');
  });

  it('renders gracefully with no optional fields', () => {
    const result = SimpleTemplateEngine.render(template, {});
    expect(result).toContain('<thema>');
    expect(result).not.toContain('<redezeit>');
    expect(result).toContain('Aktuelles Datum:');
  });
});
