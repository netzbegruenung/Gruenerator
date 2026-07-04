import { z } from 'zod';

import { GUEST_ANIMALS } from './GuestBadge';

const GUEST_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2',
  '#F8B739',
  '#52B788',
];

const guestIdentitySchema = z.object({
  guestId: z.string(),
  guestName: z.string(),
  guestColor: z.string(),
  guestAnimalIndex: z.number(),
});

export type GuestIdentity = z.infer<typeof guestIdentitySchema>;

/**
 * Persistent anonymous identity for guests on shared collaborative documents
 * (docs, sheets). One identity per browser, shared across document kinds so
 * guests keep their animal name everywhere.
 */
export function getOrCreateGuestIdentity(): GuestIdentity {
  const stored = localStorage.getItem('docs-guest-identity');
  if (stored) {
    try {
      const parsed = guestIdentitySchema.safeParse(JSON.parse(stored));
      if (parsed.success) return parsed.data;
    } catch {
      /* malformed JSON — fall through to regenerate */
    }
  }

  const animalIndex = Math.floor(Math.random() * GUEST_ANIMALS.length);
  const identity: GuestIdentity = {
    guestId: `guest-${crypto.randomUUID().slice(0, 8)}`,
    guestName: GUEST_ANIMALS[animalIndex].name,
    guestColor: GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)],
    guestAnimalIndex: animalIndex,
  };

  localStorage.setItem('docs-guest-identity', JSON.stringify(identity));
  return identity;
}
