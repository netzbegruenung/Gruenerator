/**
 * Tests for lookupMeinungsbild tool
 *
 * Verifies schema validation and tool output format.
 * Run with: pnpm --filter @gruenerator/api vitest run lookupMeinungsbild
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

vi.mock('../../../../services/monitor/MeinungsbildService.js', () => ({
  lookupMeinungsbildByTopic: vi.fn(async (topic: string) => {
    if (topic === 'Bürgergeld') {
      return (
        'Meinungsbild Deutschland (MRP-Schätzung basierend auf ~118.000 Befragten)\n' +
        'Quelle: Heddesheimer, Hilbig, Sichart & Wiedemann (2025).\n\n' +
        'Thema: Bürgergeld senken\n' +
        'Deutschland gesamt: 45.3%\n' +
        'Höchste Zustimmung: Sachsen 50.5%\n' +
        'Niedrigste Zustimmung: Hamburg 36.8%'
      );
    }
    return null;
  }),
}));

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createLookupMeinungsbildTool } from './lookupMeinungsbild.js';

import type { ToolDependencies } from './registry.js';

const mockDeps: ToolDependencies = {
  agentConfig: {
    id: 'test',
    name: 'Test Agent',
    systemRole: 'test',
  } as any,
  aiWorkerPool: {},
  enabledTools: {},
};

describe('lookupMeinungsbild tool', () => {
  const tool = createLookupMeinungsbildTool(mockDeps);

  it('has correct tool name', () => {
    expect(tool.name).toBe('lookup_meinungsbild');
  });

  it('has a German description mentioning key topics', () => {
    expect(tool.description).toContain('Meinungsumfragen');
    expect(tool.description).toContain('Bürgergeld');
    expect(tool.description).toContain('Klimaschutz');
  });

  it('has a valid Zod schema with topic field', () => {
    const shape = (tool.schema as z.ZodObject<any>).shape;
    expect(shape.topic).toBeDefined();
  });

  it('converts to JSON Schema for LangChain/Mistral', () => {
    const jsonSchema = zodToJsonSchema(tool.schema as z.ZodType);
    expect(jsonSchema.type).toBe('object');
    expect((jsonSchema as any).properties?.topic?.type).toBe('string');
  });

  it('returns formatted data for matching topic', async () => {
    const result = await tool.invoke({ topic: 'Bürgergeld' });
    expect(result).toContain('Meinungsbild Deutschland');
    expect(result).toContain('Bürgergeld senken');
    expect(result).toContain('45.3%');
    expect(result).toContain('Heddesheimer');
  });

  it('returns fallback message for unmatched topic', async () => {
    const result = await tool.invoke({ topic: 'Weltraumprogramm' });
    expect(result).toContain('Keine Meinungsbild-Daten');
    expect(result).toContain('Verfügbare Themen');
  });

  it('schema parses valid input', () => {
    const result = (tool.schema as z.ZodType).safeParse({ topic: 'Klimaschutz' });
    expect(result.success).toBe(true);
  });

  it('schema rejects empty input', () => {
    const result = (tool.schema as z.ZodType).safeParse({});
    expect(result.success).toBe(false);
  });
});
