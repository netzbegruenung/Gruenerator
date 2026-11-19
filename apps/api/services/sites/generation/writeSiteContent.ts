import { type WebsiteContent, websiteContentSchema } from '@gruenerator/contracts';

import { aiObject, type StructuredResult } from '../../ai/generate.js';
import { toolInputJsonSchema } from '../../ai/toolJsonSchema.js';
import { type Locale } from '../../localization/index.js';

import { validateWebsiteContent } from './content.js';
import { buildWebsiteSystemPrompt, buildWebsiteUserPrompt, type FlyerHints } from './prompt.js';

const CONTENT_TOOL_SCHEMA = toolInputJsonSchema(websiteContentSchema);

export interface WriteSiteContentInput {
  description: string;
  hints: FlyerHints | null;
  email: string;
  locale: Locale;
  signal: AbortSignal;
}

export async function writeSiteContent(
  input: WriteSiteContentInput
): Promise<StructuredResult<WebsiteContent>> {
  const result = await aiObject<WebsiteContent>({
    lane: 'website',
    system: buildWebsiteSystemPrompt(input.locale),
    prompt: buildWebsiteUserPrompt(input.description, input.hints),
    toolName: 'create_site_content',
    toolDescription: 'Erzeugt die Texte einer Kandidat*innen-Website.',
    schema: CONTENT_TOOL_SCHEMA,
    validate: validateWebsiteContent(input.locale),
    temperature: 0.7,
    label: 'site-content',
    signal: input.signal,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: { ...result.data, contact: { ...result.data.contact, email: input.email } },
  };
}
