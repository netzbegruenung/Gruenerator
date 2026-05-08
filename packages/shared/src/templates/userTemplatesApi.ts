/**
 * Client for user_templates that span multiple kinds (canvas/board/doc).
 * Backend reads/writes share the user_templates table; the kind discriminator
 * is `template_type` (`canvas` | `board` | `doc`).
 */

import { apiRequest } from '../api/client.js';

export type TemplateKind = 'canvas' | 'board' | 'doc';

export interface UserTemplateSummary {
  id: string;
  title: string;
  description: string | null;
  template_type: TemplateKind | string;
  preview_image_url: string | null;
  is_private: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  content_data: { yjs?: string; subtype?: string; preview?: Record<string, unknown> } | null;
}

interface ListResponse {
  success: boolean;
  data: UserTemplateSummary[];
}

interface SaveResponse {
  success: boolean;
  data: {
    id: string;
    title: string;
    template_type: string;
    is_private: boolean;
    status: string;
    created_at: string;
  };
  message?: string;
}

interface InstantiateResponse {
  success: boolean;
  data: { documentId: string; subtype: string };
}

export async function listUserTemplates(
  params: { kind?: TemplateKind } = {}
): Promise<UserTemplateSummary[]> {
  const query = params.kind ? `?template_type=${encodeURIComponent(params.kind)}` : '';
  const response = await apiRequest<ListResponse>('get', `/user-templates${query}`);
  return response.data ?? [];
}

export async function saveCollaborativeDocAsTemplate(args: {
  documentId: string;
  title: string;
  description?: string;
  isPrivate?: boolean;
  preview?: Record<string, unknown>;
}): Promise<SaveResponse['data']> {
  const response = await apiRequest<SaveResponse>(
    'post',
    `/docs/${args.documentId}/save-as-template`,
    {
      title: args.title,
      description: args.description,
      is_private: args.isPrivate ?? true,
      preview: args.preview,
    }
  );
  return response.data;
}

export async function instantiateUserTemplate(args: {
  templateId: string;
  title: string;
}): Promise<InstantiateResponse['data']> {
  const response = await apiRequest<InstantiateResponse>(
    'post',
    `/user-templates/${args.templateId}/instantiate`,
    { title: args.title }
  );
  return response.data;
}
