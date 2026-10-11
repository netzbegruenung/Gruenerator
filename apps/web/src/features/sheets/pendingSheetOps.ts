import { sheetOperationSchema, type SheetOperation } from '@gruenerator/contracts';

export interface ClaimedSheetBatch {
  id: string;
  operations: unknown[];
  summary: string;
}

export type DrainResult =
  { status: 'locked' } | { status: 'applied'; applied: number; skipped: string[] };

interface DrainParams {
  claim: () => Promise<ClaimedSheetBatch[]>;
  apply: (ops: SheetOperation[]) => Promise<{ applied: number; skipped: string[] }>;
  aiEditEnabled: boolean;
}

let running: Promise<DrainResult> | null = null;
let rerun = false;

async function drainOnce({ claim, apply, aiEditEnabled }: DrainParams): Promise<DrainResult> {
  if (!aiEditEnabled) return { status: 'locked' };
  const batches = await claim();
  let applied = 0;
  const skipped: string[] = [];
  for (const batch of batches) {
    const ops: SheetOperation[] = [];
    for (const raw of batch.operations) {
      const parsed = sheetOperationSchema.safeParse(raw);
      if (parsed.success) ops.push(parsed.data);
    }
    if (ops.length === 0) continue;
    const result = await apply(ops);
    applied += result.applied;
    skipped.push(...result.skipped);
  }
  return { status: 'applied', applied, skipped };
}

/**
 * Claims queued chat edits and applies them. Overlapping calls coalesce: while
 * a drain runs, further calls only flag one more pass and share its promise,
 * so a batch queued mid-drain is still picked up without parallel claims.
 */
export function drainPendingSheetOps(params: DrainParams): Promise<DrainResult> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    try {
      let result = await drainOnce(params);
      while (rerun && result.status === 'applied') {
        rerun = false;
        const next = await drainOnce(params);
        if (next.status === 'applied' && result.status === 'applied') {
          next.applied += result.applied;
          next.skipped.unshift(...result.skipped);
        }
        result = next;
      }
      return result;
    } finally {
      rerun = false;
      running = null;
    }
  })();
  return running;
}
