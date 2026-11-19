/** The KI-Schnitt's prompt files (`prompts/video-ai/`), read once per process. */
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPT_DIR = path.join(dirname(fileURLToPath(import.meta.url)), '../../prompts/video-ai');
const prompts = new Map<string, string>();

export function videoAiPrompt(file: string): string {
  let text = prompts.get(file);
  if (text === undefined) {
    text = readFileSync(path.join(PROMPT_DIR, file), 'utf8');
    prompts.set(file, text);
  }
  return text;
}
