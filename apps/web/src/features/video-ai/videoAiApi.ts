/**
 * KI-Schnitt calls from the page: queries, mutations and the upload of new
 * material. Errors carry the API's sentence for the person (every non-2xx body
 * of videoAiContract is `{ error }`).
 */
import {
  type ApplyVideoAiOpsBody,
  type CreateVideoAiProjectBody,
  type ReviseVideoAiBody,
  type VideoAiInputRole,
  type VideoAiProjectDto,
  type VideoAiStatus,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { uploadMedia } from '@gruenerator/shared/media-library';
import * as tus from 'tus-js-client';

import apiClient from '@/components/utils/apiClient';
import { getTusAuthOptions } from '@/utils/tusAuth';

export const projectsQueryKey = ['video-ai-projects'] as const;
export const projectQueryKey = (ref: string) => ['video-ai-projects', ref] as const;

const ACTIVE: readonly VideoAiStatus[] = ['queued', 'analyzing', 'cutting', 'designing'];
export const isActive = (status: VideoAiStatus | null | undefined): boolean =>
  status !== null && status !== undefined && ACTIVE.includes(status);

export const STATUS_LABEL: Record<VideoAiStatus, string> = {
  queued: 'Wartet auf den Start',
  analyzing: 'Material wird gesichtet und transkribiert',
  cutting: 'Die KI wählt die Sätze',
  designing: 'Die KI gestaltet Untertitel und Einblendungen',
  ready: 'Fertig',
  failed: 'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
};

function fail(body: unknown, fallback: string): never {
  const message =
    typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : fallback;
  throw new Error(message);
}

const client = () => getContractsClient().videoAi;

export async function listProjects() {
  const res = await client().list();
  if (res.status === 200) return res.body.projects;
  fail(res.body, 'Die KI-Schnitte konnten nicht geladen werden.');
}

export async function getProject(ref: string): Promise<VideoAiProjectDto | null> {
  const res = await client().get({ params: { ref } });
  if (res.status === 200) return res.body;
  if (res.status === 404) return null;
  fail(res.body, 'Der KI-Schnitt konnte nicht geladen werden.');
}

export async function createProject(body: CreateVideoAiProjectBody) {
  const res = await client().create({ body });
  if (res.status === 202) return res.body;
  fail(res.body, 'Der KI-Schnitt konnte nicht gestartet werden.');
}

export async function applyOps(id: string, body: ApplyVideoAiOpsBody) {
  const res = await client().applyOps({ params: { id }, body });
  if (res.status === 200) return res.body;
  fail(res.body, 'Die Änderung hat nicht geklappt.');
}

export async function revise(id: string, body: ReviseVideoAiBody) {
  const res = await client().revise({ params: { id }, body });
  if (res.status === 200) return res.body;
  fail(res.body, 'Die Korrektur hat nicht geklappt.');
}

export async function selectVersion(id: string, version: number) {
  const res = await client().selectVersion({ params: { id, version } });
  if (res.status === 200) return res.body;
  fail(res.body, 'Diese Version lässt sich nicht wählen.');
}

export async function handOff(id: string) {
  const res = await client().handOff({ params: { id } });
  if (res.status === 200) return res.body;
  fail(res.body, 'Die Übergabe an den Editor hat nicht geklappt.');
}

export async function cancelProject(id: string) {
  const res = await client().cancel({ params: { id } });
  if (res.status === 200) return;
  fail(res.body, 'Der KI-Schnitt ließ sich nicht abbrechen.');
}

export async function removeProject(id: string) {
  const res = await client().remove({ params: { id } });
  if (res.status === 200) return;
  fail(res.body, 'Der KI-Schnitt ließ sich nicht löschen.');
}

// --- new material ----------------------------------------------------------

export interface UploadedMaterial {
  mediaId: string;
  mediaType: 'video' | 'image' | 'audio';
  title: string;
  durationSeconds: number | null;
}

/** The multipart Mediathek upload stops at 50 MB and takes no audio. */
const MULTIPART_MAX_BYTES = 50 * 1024 * 1024;
const TUS_ENDPOINT = `${apiClient.defaults.baseURL}/audio/upload`;

async function tusUpload(file: File, onProgress: (percent: number) => void): Promise<string> {
  const auth = await getTusAuthOptions();
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: TUS_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 5 * 1024 * 1024,
      metadata: { filename: file.name, filetype: file.type || 'application/octet-stream' },
      ...auth,
      onError: () => reject(new Error(`„${file.name}“ konnte nicht hochgeladen werden.`)),
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(upload.url?.split('/').pop() ?? ''),
    });
    upload.start();
  });
}

export async function uploadMaterial(
  file: File,
  onProgress: (percent: number) => void
): Promise<UploadedMaterial> {
  if (file.type.startsWith('image/')) {
    if (file.size > MULTIPART_MAX_BYTES) throw new Error(`„${file.name}“ ist größer als 50 MB.`);
    const res = await uploadMedia(file, { title: file.name, onProgress });
    if (!res.success || !res.data)
      throw new Error(`„${file.name}“ konnte nicht hochgeladen werden.`);
    return { mediaId: res.data.id, mediaType: 'image', title: file.name, durationSeconds: null };
  }
  const uploadId = await tusUpload(file, onProgress);
  const res = await client().importUpload({ body: { uploadId, title: file.name } });
  if (res.status === 201) return res.body;
  fail(res.body, `„${file.name}“ konnte nicht übernommen werden.`);
}

export function defaultRole(mediaType: UploadedMaterial['mediaType']): VideoAiInputRole {
  return mediaType === 'video' ? 'footage' : mediaType === 'audio' ? 'audio' : 'image';
}
