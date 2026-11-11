import { bundestagWrappedSource } from './bundestagWrapped.js';
import { type RemoteSourceId } from './ids.js';
import { type RemoteNotebookSource } from './types.js';

const REMOTE_NOTEBOOK_SOURCES: Record<RemoteSourceId, RemoteNotebookSource> = {
  'bundestag-wrapped': bundestagWrappedSource,
};

export function getRemoteSource(id: RemoteSourceId): RemoteNotebookSource {
  return REMOTE_NOTEBOOK_SOURCES[id];
}
