/**
 * Which instance the host app runs as, for the parts of this package that need
 * to know.
 *
 * Injected by the host rather than read from the environment: this package is
 * built into the web bundle and the React Native binary alike, and neither
 * shares a way to read the other's config. Defaults to the conservative
 * production selection, so a host that never calls the setter behaves as it did
 * before instances existed.
 *
 * It sits in its own module because both `mentionables.ts` and `agents.ts` need
 * it and `mentionables.ts` already imports `agents.ts` — keeping it in either
 * would close an import cycle, and the one that closed it left `agentsList`
 * undefined at module-init time.
 */
import { DEFAULT_INSTANCE_ID, type InstanceId } from '@gruenerator/shared/instances';

let mentionInstance: InstanceId = DEFAULT_INSTANCE_ID;

export function setMentionInstance(instanceId: InstanceId): void {
  mentionInstance = instanceId;
}

export function getMentionInstance(): InstanceId {
  return mentionInstance;
}
