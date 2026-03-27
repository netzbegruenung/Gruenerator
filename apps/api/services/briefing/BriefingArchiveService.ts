import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { BriefingAgent, CollectedItem } from './types.js';

const log = createLogger('BriefingArchive');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARCHIVE_DIR = path.resolve(__dirname, '../../../../documentation/docs/briefings');

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/[ß]/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function archiveBriefing(
  agent: BriefingAgent,
  summary: string,
  items: CollectedItem[]
): Promise<void> {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) {
      log.warn(`Archive directory not found: ${ARCHIVE_DIR}`);
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const slug = slugify(agent.name);
    const filename = `${dateStr}-${slug}.md`;
    const filepath = path.join(ARCHIVE_DIR, filename);

    const displayDate = now.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const sourceSummary = agent.config.sources
      .map((s) => {
        switch (s.type) {
          case 'web':
            return `Web: "${s.query}"${s.domains?.length ? ` (${s.domains.join(', ')})` : ''}`;
          case 'rss':
            return `RSS: ${s.url}`;
          case 'instagram':
            return `Instagram: @${s.username}`;
          case 'twitter':
            return `Twitter: @${s.username}`;
          case 'documents':
            return `Dokumente: ${s.collection}`;
          case 'scrape':
            return `Scrape: ${s.url}`;
          default:
            return s.type;
        }
      })
      .join(', ');

    const sourcesTable = items
      .map(
        (item, i) =>
          `${i + 1}. [${item.title.slice(0, 80).replace(/\|/g, '\\|')}](${item.url}) — ${item.source}`
      )
      .join('\n');

    const content = `---
title: '${displayDate}: ${agent.name.replace(/'/g, "''")}'
agent: '${agent.id}'
articles: ${items.length}
---

**Agent:** \`${agent.id}\` · **Artikel:** ${items.length}

${summary}

---

## Quellen

${sourcesTable}
`;

    fs.writeFileSync(filepath, content, 'utf-8');
    log.info(`Archived briefing to ${filename}`);
  } catch (error) {
    log.error(`Failed to archive briefing for ${agent.id}: ${toError(error).message}`);
  }
}
