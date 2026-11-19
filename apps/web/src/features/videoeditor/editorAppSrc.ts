export const VIDEO_EDITOR_APP_PATH = '/videoeditor/app/';

/**
 * The editor app's URL. Only known parameters go through: `parteitagRede`
 * opens a party-conference speech, `ki` (project id) and `v` (version) open a
 * KI-Schnitt as the editor's own project instead of the free one.
 */
export function editorAppSrc(search: string): string {
  const from = new URLSearchParams(search);
  const to = new URLSearchParams();
  for (const key of ['parteitagRede', 'ki', 'v']) {
    const value = from.get(key);
    if (value) to.set(key, value);
  }
  const query = to.toString();
  return query ? `${VIDEO_EDITOR_APP_PATH}?${query}` : VIDEO_EDITOR_APP_PATH;
}
