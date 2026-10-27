// Parse stored document HTML for reading only. `content` can carry raw HTML
// (Markdown import, `/api/docs/from-export`), and innerHTML on an element of the
// live document starts image loads and fires `onerror` handlers even while the
// element is detached. A DOMParser document has no browsing context and stays
// inert, so every preview parser reads through this.
export const parseInertHtml = (html: string): HTMLElement =>
  new DOMParser().parseFromString(html, 'text/html').body;
