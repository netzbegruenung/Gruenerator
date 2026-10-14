import { alphaBounds } from '@gruenerator/shared/profilbild';

import type { Rect } from '@gruenerator/shared/profilbild';

export function trimBounds(data: ArrayLike<number>, width: number, height: number): Rect | null {
  const b = alphaBounds(data, width, height);
  if (!b) return null;
  const x = Math.max(0, b.x - 1);
  const y = Math.max(0, b.y - 1);
  const right = Math.min(width, b.x + b.width + 1);
  const bottom = Math.min(height, b.y + b.height + 1);
  return { x, y, width: right - x, height: bottom - y };
}
