import manifestJson from '@site/src/generated/models.json';

export type Role = 'primary' | 'fallback' | 'overflow';

export interface ModelEntry {
  /** The model id exactly as the code spells it. */
  model: string;
  /** The same id, trimmed for display. */
  code: string;
  label: string;
  provider: string;
  host: string;
  flag: string;
  role: Role;
}

export interface Row {
  id: string;
  task: string;
  models: ModelEntry[];
}

export interface Manifest {
  rows: Row[];
  hosts: string[];
}

/**
 * The routing manifest that `models:generate` writes from the routing code —
 * shared source for `<ModelTable />` and `<ProviderTasks />`, so both render
 * the same shape instead of re-declaring it.
 */
export const manifest = manifestJson as unknown as Manifest;
