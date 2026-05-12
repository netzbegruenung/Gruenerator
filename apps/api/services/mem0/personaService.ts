import { generateText } from 'ai';

import { createLogger } from '../../utils/logger.js';
import { parseJSON } from '../../utils/parseJSON.js';
import { redisClient } from '../../utils/redis/index.js';
import { getIntermediateModel } from '../ai/providers.js';

import { formatMemoriesByCategory, normalizeCategory } from './categories.js';
import { getMem0Instance } from './Mem0Service.js';

import type { Mem0Memory } from './types.js';

const log = createLogger('PersonaService');

const PERSONA_TTL = 24 * 60 * 60;
const RECOMPILE_THRESHOLD = 3;

function personaKey(userId: string): string {
  return `persona:${userId}`;
}

function personaCountKey(userId: string): string {
  return `persona:count:${userId}`;
}

interface CachedPersona {
  persona: string;
  memoryCount: number;
  compiledAt: string;
}

const PERSONA_SYSTEM_PROMPT = `Du bist ein Profil-Zusammenfasser für den Grünerator, eine KI-Plattform für Die Grünen.

Deine Aufgabe: Fasse alle Erinnerungen zu einem kurzen, kohärenten Nutzerprofil zusammen (max. 150 Wörter).

## Format

Schreibe in der dritten Person als Beschreibung für einen KI-Assistenten:
"Der/Die Nutzer*in ist [Rolle/Funktion]. [Wichtigste Fakten]. [Arbeitsschwerpunkte]. [Präferenzen für die Zusammenarbeit]."

## Regeln

- Fasse zusammen, was DU über diese Person wissen musst, um ihr optimal zu helfen
- Nenne konkrete Fakten (Wahlkreis, Funktion, Themen), nicht vage Beschreibungen
- Integriere Schreibstil-Präferenzen natürlich in den Text
- Lasse Aktivitäten/Termine weg, die veraltet sein könnten
- Wenn wenige Erinnerungen vorhanden sind: kurz fassen (2-3 Sätze)
- Verwende Genderstern (*) für geschlechtergerechte Sprache
- Schreibe auf Deutsch`;

export async function getCachedPersona(userId: string): Promise<string | null> {
  try {
    const data = await redisClient.get(personaKey(userId));
    if (!data) return null;

    const cached = parseJSON<CachedPersona>(data);
    return cached.persona;
  } catch (error) {
    log.warn('[Persona] Failed to read cache:', error);
    return null;
  }
}

async function needsRecompilation(userId: string, currentMemoryCount: number): Promise<boolean> {
  try {
    const countStr = await redisClient.get(personaCountKey(userId));
    if (!countStr) return true;

    const lastCount = parseInt(countStr, 10);
    return Math.abs(currentMemoryCount - lastCount) >= RECOMPILE_THRESHOLD;
  } catch {
    return true;
  }
}

/**
 * Compile a persona from memories. Accepts pre-fetched memories to avoid redundant fetches.
 */
export async function compilePersona(
  userId: string,
  prefetchedMemories?: Mem0Memory[]
): Promise<string | null> {
  try {
    let memories = prefetchedMemories;
    if (!memories) {
      const mem0 = getMem0Instance();
      if (!mem0) return null;
      memories = await mem0.getAllMemories(userId);
    }

    if (memories.length < 2) {
      log.info(`[Persona] Too few memories (${memories.length}) for user ${userId}, skipping`);
      return null;
    }

    const formattedInput = formatMemoriesByCategory(
      memories.map((m) => ({
        memory: m.memory,
        category: normalizeCategory(m.metadata?.memoryType),
      }))
    );

    const model = getIntermediateModel();
    const result = await generateText({
      model,
      system: PERSONA_SYSTEM_PROMPT,
      prompt: `## Erinnerungen (${memories.length} gesamt)\n\n${formattedInput}`,
      maxOutputTokens: 400,
      temperature: 0.3,
    });

    const persona = result.text.trim();
    if (!persona) {
      log.warn('[Persona] Empty persona generated');
      return null;
    }

    const cached: CachedPersona = {
      persona,
      memoryCount: memories.length,
      compiledAt: new Date().toISOString(),
    };
    await redisClient.setEx(personaKey(userId), PERSONA_TTL, JSON.stringify(cached));
    await redisClient.setEx(personaCountKey(userId), PERSONA_TTL, String(memories.length));

    log.info(
      `[Persona] Compiled persona for user ${userId} (${memories.length} memories → ${persona.length} chars)`
    );
    return persona;
  } catch (error) {
    log.error('[Persona] Compilation failed:', { error });
    return null;
  }
}

export async function getOrCompilePersona(userId: string): Promise<string | null> {
  const cached = await getCachedPersona(userId);
  if (cached) return cached;
  return compilePersona(userId);
}

/**
 * Trigger async persona recompilation if memory count drifted enough.
 * Fetches memories once and passes them through to avoid double-fetch.
 */
export async function maybeRecompilePersona(userId: string): Promise<void> {
  try {
    const mem0 = getMem0Instance();
    if (!mem0) return;

    const memories = await mem0.getAllMemories(userId);
    const shouldRecompile = await needsRecompilation(userId, memories.length);

    if (!shouldRecompile) {
      log.debug(`[Persona] No recompilation needed for user ${userId}`);
      return;
    }

    log.info(`[Persona] Triggering recompilation for user ${userId}`);
    await compilePersona(userId, memories);
  } catch (error) {
    log.warn('[Persona] Async recompilation failed:', error);
  }
}

export async function invalidatePersona(userId: string): Promise<void> {
  try {
    await redisClient.del(personaKey(userId));
    await redisClient.del(personaCountKey(userId));
    log.info(`[Persona] Invalidated cache for user ${userId}`);
  } catch (error) {
    log.warn('[Persona] Failed to invalidate cache:', error);
  }
}
