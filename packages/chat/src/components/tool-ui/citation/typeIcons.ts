import { FileText, Globe, Code2, Newspaper, Database, File } from 'lucide-react';

import type { CitationType } from './schema';
import type { LucideIcon } from 'lucide-react';

export const CITATION_TYPE_ICONS: Record<CitationType, LucideIcon> = {
  webpage: Globe,
  document: FileText,
  article: Newspaper,
  api: Database,
  code: Code2,
  other: File,
};
