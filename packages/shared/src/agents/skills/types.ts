import type { SystemAgentId } from '../system.js';
import type { Skill } from '../types.js';

export type SystemSkill = Skill & { identifier: SystemAgentId };
