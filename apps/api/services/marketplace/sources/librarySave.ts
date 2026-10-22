/**
 * „Speichern" für Agents und Rezepte heißt „Zu meinen Grüneratoren"
 * (`user_library_items`). Die Tabelle führt den Verweis, den die Übersicht
 * auflöst — bei einem eigenen Nutzer-Agent der Identifier, nicht die uuid —,
 * deshalb übersetzt `toLibraryRef` den Marktplatz-`ref` vorher.
 */
import { type UserLibraryItemKind } from '@gruenerator/contracts';

import {
  addToUserLibrary,
  listUserLibrary,
  removeFromUserLibrary,
} from '../../user/userLibraryService.js';
import { type MarketplaceContext } from '../context.js';

import { type MarketplaceSource } from './types.js';

type ToLibraryRefs = (ctx: MarketplaceContext, refs: string[]) => Promise<Map<string, string>>;

const identity: ToLibraryRefs = async (_ctx, refs) => new Map(refs.map((r) => [r, r]));

export function librarySave(
  kind: UserLibraryItemKind,
  toLibraryRefs: ToLibraryRefs = identity
): MarketplaceSource<'agent' | 'recipe'>['save'] {
  return {
    async has(ctx, refs) {
      if (refs.length === 0) return new Set();
      const [library, mapped] = await Promise.all([
        listUserLibrary(ctx.userId),
        toLibraryRefs(ctx, refs),
      ]);
      const held = new Set(library.filter((i) => i.kind === kind).map((i) => i.ref));
      return new Set(refs.filter((ref) => held.has(mapped.get(ref) ?? ref)));
    },
    async add(ctx, ref) {
      const libraryRef = (await toLibraryRefs(ctx, [ref])).get(ref) ?? ref;
      return (await addToUserLibrary(ctx.userId, kind, libraryRef)) ? 'ok' : 'full';
    },
    async remove(ctx, ref) {
      const libraryRef = (await toLibraryRefs(ctx, [ref])).get(ref) ?? ref;
      await removeFromUserLibrary(ctx.userId, kind, libraryRef);
    },
  };
}
