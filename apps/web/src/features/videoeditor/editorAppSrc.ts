export const VIDEO_EDITOR_APP_PATH = '/videoeditor/app/';

export function editorAppSrc(search: string): string {
  const from = new URLSearchParams(search);
  const to = new URLSearchParams();
  for (const key of ['parteitagRede']) {
    const value = from.get(key);
    if (value) to.set(key, value);
  }
  const query = to.toString();
  return query ? `${VIDEO_EDITOR_APP_PATH}?${query}` : VIDEO_EDITOR_APP_PATH;
}
