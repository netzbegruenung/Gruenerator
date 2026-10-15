import { agentKey } from '@gruenerator/shared/agents';
import { useOwnRecipes, usePublicRecipes } from '@gruenerator/shared/grueneratoren';
import { useMemo } from 'react';

import {
  usePublicUserAgents,
  useSharedSystemAgents,
  useSharedUserAgents,
  useUserAgents,
  type SharedAgentEntry,
} from '../../agents/api';
import { recipeFromForm, type RecipeEntry } from '../lib/marketItems';
import { recipeOriginLine } from '../recipes/recipeMeta';

/**
 * Die Datenpools, aus denen Hauptseite und Marktplatz zusammenstellen: eigene,
 * geteilte und öffentliche Agents und Rezepte. Die Öffentlich-Filter stehen
 * hier, weil sie von den eigenen und geteilten Pools abhängen — eine Kopie je
 * Seite würde auseinanderlaufen.
 */
export function useAgenturaPools() {
  const {
    data: userAgents = [],
    isSuccess: userAgentsLoaded,
    isError: userAgentsFailed,
  } = useUserAgents();
  const { data: sharedSystemAgents = [] } = useSharedSystemAgents();
  const { data: sharedUserAgents = [] } = useSharedUserAgents();
  const { data: publicAgents = [], isSuccess: publicAgentsLoaded } = usePublicUserAgents();
  const {
    data: ownAndSharedRecipes = [],
    isSuccess: recipesLoaded,
    isError: recipesFailed,
  } = useOwnRecipes(true);
  const { data: publicRecipes = [], isSuccess: publicRecipesLoaded } = usePublicRecipes();

  // Group-shared agents are system + user-created agents, deduped by
  // `agentKey` — a user agent's identifier is only unique per owner.
  const sharedAgents = useMemo<SharedAgentEntry[]>(() => {
    const byKey = new Map<string, SharedAgentEntry>();
    for (const entry of [...sharedSystemAgents, ...sharedUserAgents]) {
      const key = agentKey(entry.agent);
      if (!byKey.has(key)) byKey.set(key, entry);
    }
    return [...byKey.values()];
  }, [sharedSystemAgents, sharedUserAgents]);

  const ownAgentKeys = useMemo(() => new Set(userAgents.map(agentKey)), [userAgents]);

  // Shared agents minus the caller's own: sharing an own agent into an own
  // group puts it in both lists, and „Meine" would show it twice. Compared by
  // `agentKey`, not identifier — a colleague's agent under the same identifier
  // is a different agent and stays.
  const sharedForeignAgents = useMemo(
    () => sharedAgents.filter((e) => !ownAgentKeys.has(agentKey(e.agent))),
    [sharedAgents, ownAgentKeys]
  );

  // Public community agents („Marktplatz"): owners still see their own listing,
  // but drop agents only reachable via a group share (and not owned).
  const communityAgents = useMemo(() => {
    const sharedKeys = new Set(sharedAgents.map((e) => agentKey(e.agent)));
    return publicAgents.filter(
      (a) => ownAgentKeys.has(agentKey(a)) || !sharedKeys.has(agentKey(a))
    );
  }, [publicAgents, ownAgentKeys, sharedAgents]);

  // Own recipes ("Meine Rezepte"): genuinely own, custom-mention rows — a
  // preset/recipe override (`kind !== 'custom'`) has no identity of its own,
  // it just adjusts the matching catalogue skill and stays out of this list.
  // `useOwnRecipes` returns own AND shared-into-a-group rows in one list; the
  // two are told apart by `sharedFromGroup`.
  const ownRecipes = useMemo(
    () => ownAndSharedRecipes.filter((f) => f.kind === 'custom' && !f.sharedFromGroup),
    [ownAndSharedRecipes]
  );
  const sharedRecipes = useMemo(
    () => ownAndSharedRecipes.filter((f) => f.sharedFromGroup),
    [ownAndSharedRecipes]
  );

  // Mirrors `communityAgents` exactly — owners still see their own public
  // listing, but a recipe only reachable via a group share (not owned) is
  // dropped: it already shows once as shared. Ownership goes by row id, not
  // mention — a mention is only unique per owner. The owner's own listing is
  // editable, so the shop offers „Bearbeiten" instead of „Zu meinen Grüneratoren".
  const communityRecipeEntries = useMemo<RecipeEntry[]>(() => {
    const ownIds = new Set(ownRecipes.map((f) => f.id));
    const sharedMentions = new Set(sharedRecipes.map((f) => f.mention));
    return publicRecipes
      .filter((f) => ownIds.has(f.id) || !sharedMentions.has(f.mention))
      .map((f) =>
        recipeFromForm(f, {
          editable: ownIds.has(f.id),
          shareLabel: recipeOriginLine(f, 'public'),
        })
      );
  }, [publicRecipes, ownRecipes, sharedRecipes]);

  return {
    userAgents,
    userAgentsLoaded,
    /** Eigene Agents und Rezepte sind da — erst dann heißt eine leere Liste „nichts angelegt". */
    ownLoaded: userAgentsLoaded && recipesLoaded,
    ownFailed: userAgentsFailed || recipesFailed,
    /** Öffentliche Agents und Rezepte sind da — erst dann ist der Shop vollständig. */
    publicLoaded: publicAgentsLoaded && publicRecipesLoaded,
    sharedAgents,
    sharedForeignAgents,
    communityAgents,
    ownRecipes,
    sharedRecipes,
    communityRecipeEntries,
  };
}
