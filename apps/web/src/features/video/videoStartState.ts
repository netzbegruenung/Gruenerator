/** Files picked on /video, handed to the page of the chosen way as router state. */
export interface VideoStartState {
  videoStartFiles: File[];
  /** Subtitler only: go straight to the video editor once the captions are done. */
  openInEditor?: boolean;
}

export function videoStartFiles(state: unknown): VideoStartState | null {
  if (!state || typeof state !== 'object' || !('videoStartFiles' in state)) return null;
  const { videoStartFiles: files, openInEditor } = state as VideoStartState;
  if (!Array.isArray(files) || !files.every((f) => f instanceof File) || files.length === 0) {
    return null;
  }
  return { videoStartFiles: files, openInEditor: openInEditor === true };
}
