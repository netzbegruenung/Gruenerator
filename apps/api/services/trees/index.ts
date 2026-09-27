/**
 * The process-wide tree budget, over the shared Redis client.
 *
 * Lazy so that importing a cost constant does not construct the counter, and a
 * single instance so every door books against the same object.
 */

import { redisClient } from '../../utils/redis/index.js';

import { allowanceFor } from './treeAllowance.js';
import { TreeBudget } from './treeBudget.js';

let budget: TreeBudget | null = null;

export function getTreeBudget(): TreeBudget {
  if (!budget) budget = new TreeBudget(redisClient, { allowanceFor });
  return budget;
}

export * from './treeAllowance.js';
export * from './treeBudget.js';
export * from './treeCosts.js';
