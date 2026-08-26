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
import { getInstance, type InstanceId, type InstanceRoleOffer } from '../instances/index.js';

import {
  type EbeneConfig,
  AT_ROLLEN,
  DE_ROLLEN,
  NEEDS_BUNDESLAND,
  NEEDS_LOCAL_NAME,
  needsAbgeordneteName,
} from './rolesConfig.js';
import { type UserRole } from './types.js';

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

/**
 * Die Rolle, die diese Instanz von selbst vergibt — oder `null`, wenn sie fragt.
 *
 * Wahr für eine Instanz, deren Angebot ein Singleton ist: **eine** Ebene, **eine**
 * Rolle, kein Freitext. Dann ist „Was machst du bei den Grünen?" eine Frage mit
 * genau einer möglichen Antwort, und der Assistent lässt die Person drei Knöpfe
 * drücken, um das Einzige zu bestätigen, was er anbietet.
 *
 * **Drei Ausschlüsse, und jeder verhindert eine erfundene Rolle.** Eine Ebene, die
 * ein Bundesland (`NEEDS_BUNDESLAND`) oder einen Gliederungsnamen
 * (`NEEDS_LOCAL_NAME`) verlangt, und eine Rolle, die nach einem*r Abgeordneten
 * fragt (`needsAbgeordneteName`), sind aus der Konfiguration nicht beantwortbar —
 * dort bleibt der Assistent zuständig. Dazu die Registry-Prüfung: `offeredRoles`
 * trägt aus gutem Grund nackte Strings (die Instanz-Registry darf `rolesConfig`
 * nicht importieren, sonst schließt sich der Zyklus), und ein Tippfehler dort darf
 * niemandem eine Rolle zuweisen, die es nicht gibt.
 *
 * Geprüft wird gegen die gepinnte Locale der Instanz, sonst DE: Rollennamen sind
 * länderspezifisch („Mitarbeiter*in Bundespartei" gibt es nur in AT), und eine
 * Instanz, die eine einzige Rolle vergibt, legt ihr Land damit ohnehin fest.
 */
export function autoAssignedRole(instanceId: InstanceId): UserRole | null {
  const instance = getInstance(instanceId);
  return roleAssignedByPolicy(instance.offeredRoles, instance.defaultLocale ?? 'de-DE');
}

/**
 * Die Entscheidung selbst, ohne Instanz drumherum — damit die Ausschlüsse oben
 * prüfbar sind, obwohl die Registry heute nur einen Fall enthält, der sie gar
 * nicht auslöst.
 */
export function roleAssignedByPolicy(
  policy: InstanceRoleOffer | undefined,
  locale: 'de-DE' | 'de-AT'
): UserRole | null {
  if (!policy || policy.allowCustom !== false) return null;
  if (policy.ebenen?.length !== 1 || policy.rollen?.length !== 1) return null;

  const ebene = policy.ebenen[0];
  const rolle = policy.rollen[0];
  if (!ebene || !rolle) return null;

  if (NEEDS_BUNDESLAND.has(ebene) || NEEDS_LOCAL_NAME.has(ebene)) return null;
  if (needsAbgeordneteName(rolle)) return null;

  const registry = locale === 'de-AT' ? AT_ROLLEN : DE_ROLLEN;
  if (!(registry[ebene] ?? []).includes(rolle)) return null;

  return { ebene, rolle };
}
