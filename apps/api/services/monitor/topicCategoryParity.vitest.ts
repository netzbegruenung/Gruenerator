/**
 * The NLP service and the contract must list the same topic categories (#5670).
 *
 * A category the NLP service emits but `topicCategorySchema` lacks is dropped
 * without a word: `deriveThemes` filters on `TOPIC_CATEGORIES`, and the
 * notebook overview `safeParse`s every value. The other way round, a contract
 * value the service never emits is a dead filter chip. The two lists live in
 * different languages, so only a test that reads the Python source sees both.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { topicCategorySchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

const LEXICONS = fileURLToPath(
  new URL('../../../../services/nlp/src/topic_classifier/lexicons.py', import.meta.url)
);

function pythonTopicCategories(): string[] {
  const source = readFileSync(LEXICONS, 'utf8');
  const body = /class TopicCategory\(Enum\):\n((?:\s+\w+ = "[a-z_]+"\n)+)/.exec(source);
  if (!body?.[1]) throw new Error('TopicCategory enum not found in lexicons.py');
  return [...body[1].matchAll(/= "([a-z_]+)"/g)].map((m) => m[1] as string);
}

describe('topic categories', () => {
  it('match between the NLP service and topicCategorySchema', () => {
    expect([...pythonTopicCategories()].sort()).toEqual([...topicCategorySchema.options].sort());
  });
});
