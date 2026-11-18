/**
 * Tool-building helpers shared by both connector loaders — `mcpCatalog` (servers
 * a person added) and `managedMcpCatalog` (known connectors). Their own file so
 * the two loaders do not import each other: `loadMcpCatalog` hands known
 * connectors to `loadManagedMcpCatalog`.
 */
import { type JSONSchema7 } from 'ai';

/** Anthropic/tool-name regex is ^[a-zA-Z0-9_-]{1,64}$. */
export function sanitizeToolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

/** Required-param names of a sanitized MCP schema (drops non-string entries). */
export function requiredParams(schema: JSONSchema7): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((r): r is string => typeof r === 'string')
    : [];
}

/** Planner catalog annotation: "(keine Pflichtfelder)" or "(benötigt: a|b)". */
export function requiredParamsAnnotation(required: string[]): string {
  return required.length === 0 ? '(keine Pflichtfelder)' : `(benötigt: ${required.join('|')})`;
}

/** Per-client mutex: serialize callTool on one MCP session (no p-limit dep). */
export function createSerializer(): <T>(fn: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn) as Promise<T>;
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
