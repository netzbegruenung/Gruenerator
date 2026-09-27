import { describe, expect, it } from 'vitest';

import { resolveStatusTransition } from './templateStatusTransition.js';

describe('resolveStatusTransition', () => {
  it('submits a private draft for review and makes it public', () => {
    expect(resolveStatusTransition('draft', 'pending_review')).toEqual({
      status: 'pending_review',
      is_private: false,
    });
  });

  it('lets a rejected template be resubmitted', () => {
    expect(resolveStatusTransition('rejected', 'pending_review')).toEqual({
      status: 'pending_review',
      is_private: false,
    });
  });

  it('does not push a published template back into the review queue', () => {
    expect(resolveStatusTransition('published', 'pending_review')).toEqual({
      status: 'published',
      is_private: false,
    });
  });

  it.each(['draft', 'pending_review', 'published', 'rejected'] as const)(
    'withdraws a %s template to a private draft',
    (current) => {
      expect(resolveStatusTransition(current, 'draft')).toEqual({
        status: 'draft',
        is_private: true,
      });
    }
  );

  it('never leaves is_private and status contradicting each other', () => {
    // The gallery reads both columns; a public draft is invisible everywhere.
    for (const current of ['draft', 'pending_review', 'published', 'rejected'] as const) {
      for (const requested of ['draft', 'pending_review'] as const) {
        const result = resolveStatusTransition(current, requested);
        expect(result.is_private).toBe(result.status === 'draft');
      }
    }
  });
});
