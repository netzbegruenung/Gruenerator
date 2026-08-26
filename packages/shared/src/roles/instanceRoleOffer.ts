/**
 * What the role wizard offers on a given instance.
 *
 * The narrowing itself lives on the instance (`InstanceDefinition.offeredRoles`)
 * so a deployment is configured in one place; these helpers are the read side
 * every surface shares, which is what keeps the rule out of the wizard's JSX.
 *
 * **Offer, not access.** Nothing here is a permission check: a role a user
 * already saved keeps working, keeps its Baustein and keeps its entitlements —
 * `services/roles/roleSystemPrompt.ts` never asks which instance it is on. This
 * is the same posture as `hide` on content: gone from the picker, still valid
 * where it already exists.
 */
import { getInstance, type InstanceId } from '../instances/index.js';

import { type EbeneConfig } from './rolesConfig.js';

/** The Ebenen this instance offers, in registry order. */
export function offeredEbenen(
  ebenen: readonly EbeneConfig[],
  instanceId: InstanceId
): EbeneConfig[] {
  const allowed = getInstance(instanceId).offeredRoles?.ebenen;
  if (!allowed) return [...ebenen];
  return ebenen.filter((ebene) => allowed.includes(ebene.id));
}

/**
 * The roles this instance offers within one Ebene.
 *
 * An Ebene the instance does not offer yields nothing, so a caller that reaches
 * a role list through a stale Ebene id cannot hand out a role the instance meant
 * to drop.
 */
export function offeredRollen(
  ebeneId: string,
  rollen: readonly string[],
  instanceId: InstanceId
): string[] {
  const policy = getInstance(instanceId).offeredRoles;
  if (!policy) return [...rollen];
  if (policy.ebenen && !policy.ebenen.includes(ebeneId)) return [];
  if (!policy.rollen) return [...rollen];
  return rollen.filter((rolle) => policy.rollen?.includes(rolle));
}

/** Does this instance offer the "Sonstige" free-text role? */
export function isCustomRolleOffered(instanceId: InstanceId): boolean {
  return getInstance(instanceId).offeredRoles?.allowCustom !== false;
}
