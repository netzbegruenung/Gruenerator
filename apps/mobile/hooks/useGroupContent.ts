import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export type GroupContentKind =
  | 'doc'
  | 'board'
  | 'generator'
  | 'notebook'
  | 'text'
  | 'template'
  | 'document';

interface CollabDocRow {
  id: string;
  title: string | null;
  document_subtype: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  shared_at?: string;
  shared_by_name?: string;
}

interface GeneratorRow {
  id: string;
  name: string;
  title: string | null;
  description: string | null;
  slug?: string;
  updated_at: string;
  shared_at?: string;
  shared_by_name?: string;
}

interface NotebookRow {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  shared_at?: string;
  shared_by_name?: string;
}

interface TextRow {
  id: string;
  title: string | null;
  document_type: string | null;
  word_count?: number;
  updated_at: string;
  shared_at?: string;
  shared_by_name?: string;
}

interface TemplateRow {
  id: string;
  title: string;
  description: string | null;
  external_url?: string;
  thumbnail_url?: string | null;
  updated_at: string;
  shared_at?: string;
  shared_by_name?: string;
}

interface DocumentRow {
  id: string;
  title: string | null;
  filename: string;
  file_size: number;
  status: string;
  updated_at: string;
  shared_at?: string;
  shared_by_name?: string;
}

interface ContentApiResponse {
  success: boolean;
  content: {
    collaborative_documents?: CollabDocRow[];
    generators?: GeneratorRow[];
    notebooks?: NotebookRow[];
    texts?: TextRow[];
    templates?: TemplateRow[];
    documents?: DocumentRow[];
  };
}

export interface GroupContentItem {
  id: string;
  kind: GroupContentKind;
  title: string;
  subtitle?: string;
  updatedAt: string;
  sharedAt?: string;
  sharedByName?: string;
  slug?: string;
}

export interface GroupedContent {
  docs: GroupContentItem[];
  boards: GroupContentItem[];
  generators: GroupContentItem[];
  notebooks: GroupContentItem[];
  texts: GroupContentItem[];
  templates: GroupContentItem[];
  documents: GroupContentItem[];
  totalCount: number;
}

function emptyGroupedContent(): GroupedContent {
  return {
    docs: [],
    boards: [],
    generators: [],
    notebooks: [],
    texts: [],
    templates: [],
    documents: [],
    totalCount: 0,
  };
}

export function useGroupContent(groupId: string | null | undefined) {
  return useQuery({
    queryKey: ['groupContent', groupId],
    queryFn: async (): Promise<GroupedContent> => {
      const res = await getGlobalApiClient().get<ContentApiResponse>(
        `/auth/groups/${groupId}/content`
      );
      const raw = res.data.content ?? {};
      const grouped = emptyGroupedContent();

      (raw.collaborative_documents ?? []).forEach((row) => {
        const isBoard = row.document_subtype === 'boards';
        const item: GroupContentItem = {
          id: row.id,
          kind: isBoard ? 'board' : 'doc',
          title: row.title?.trim() || (isBoard ? 'Unbenanntes Board' : 'Unbenanntes Dokument'),
          updatedAt: row.updated_at,
          ...(row.shared_at ? { sharedAt: row.shared_at } : {}),
          ...(row.shared_by_name ? { sharedByName: row.shared_by_name } : {}),
        };
        if (isBoard) grouped.boards.push(item);
        else grouped.docs.push(item);
      });

      (raw.generators ?? []).forEach((row) => {
        grouped.generators.push({
          id: row.id,
          kind: 'generator',
          title: row.title?.trim() || row.name || 'Grünerator',
          ...(row.description ? { subtitle: row.description } : {}),
          updatedAt: row.updated_at,
          ...(row.shared_at ? { sharedAt: row.shared_at } : {}),
          ...(row.shared_by_name ? { sharedByName: row.shared_by_name } : {}),
          ...(row.slug ? { slug: row.slug } : {}),
        });
      });

      (raw.notebooks ?? []).forEach((row) => {
        grouped.notebooks.push({
          id: row.id,
          kind: 'notebook',
          title: row.name || 'Notizbuch',
          ...(row.description ? { subtitle: row.description } : {}),
          updatedAt: row.updated_at,
          ...(row.shared_at ? { sharedAt: row.shared_at } : {}),
          ...(row.shared_by_name ? { sharedByName: row.shared_by_name } : {}),
        });
      });

      (raw.texts ?? []).forEach((row) => {
        grouped.texts.push({
          id: row.id,
          kind: 'text',
          title: row.title?.trim() || 'Unbenannter Text',
          ...(row.word_count ? { subtitle: `${row.word_count} Wörter` } : {}),
          updatedAt: row.updated_at,
          ...(row.shared_at ? { sharedAt: row.shared_at } : {}),
          ...(row.shared_by_name ? { sharedByName: row.shared_by_name } : {}),
        });
      });

      (raw.templates ?? []).forEach((row) => {
        grouped.templates.push({
          id: row.id,
          kind: 'template',
          title: row.title || 'Vorlage',
          ...(row.description ? { subtitle: row.description } : {}),
          updatedAt: row.updated_at,
          ...(row.shared_at ? { sharedAt: row.shared_at } : {}),
          ...(row.shared_by_name ? { sharedByName: row.shared_by_name } : {}),
        });
      });

      (raw.documents ?? []).forEach((row) => {
        grouped.documents.push({
          id: row.id,
          kind: 'document',
          title: row.title?.trim() || row.filename || 'Datei',
          subtitle: row.filename,
          updatedAt: row.updated_at,
          ...(row.shared_at ? { sharedAt: row.shared_at } : {}),
          ...(row.shared_by_name ? { sharedByName: row.shared_by_name } : {}),
        });
      });

      grouped.totalCount =
        grouped.docs.length +
        grouped.boards.length +
        grouped.generators.length +
        grouped.notebooks.length +
        grouped.texts.length +
        grouped.templates.length +
        grouped.documents.length;

      return grouped;
    },
    enabled: !!groupId,
    staleTime: 30_000,
  });
}
