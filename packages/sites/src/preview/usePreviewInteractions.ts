import { useEffect } from 'react';

import { useEditorStore, SECTION_ORDER, type SectionType } from '../stores/editorStore';

import { panelForPath } from './fieldPaths';

const SCROLL_UNLOCK_MS = 500;

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isSectionId = (id: string | null): id is SectionType =>
  id !== null && (SECTION_ORDER as string[]).includes(id);

export function usePreviewClickToEdit(doc: Document | null): void {
  useEffect(() => {
    if (!doc) return;
    const onClick = (event: Event) => {
      const target = event.target as Element | null;
      const path = target?.closest?.('[data-field]')?.getAttribute('data-field');
      if (!path) return;
      const panel = panelForPath(path);
      if (!panel) return;
      // A field edited in place keeps the focus; the sidebar only follows to its section.
      if (target?.closest?.('[data-inline-edit]')) {
        useEditorStore.getState().setActiveSection(panel);
        return;
      }
      event.preventDefault();
      useEditorStore.getState().focusPath(panel, path);
    };
    doc.addEventListener('click', onClick);
    return () => doc.removeEventListener('click', onClick);
  }, [doc]);
}

export function usePreviewScrollSync(doc: Document | null): void {
  useEffect(() => {
    if (!doc) return;
    const visible = new Set<SectionType>();
    const observed = new Set<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-section');
          if (!isSectionId(id)) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const state = useEditorStore.getState();
        if (state.isScrollLocked || state.scrollSource === 'sidebar') return;
        const top = SECTION_ORDER.find((id) => visible.has(id));
        if (top && top !== state.activeSection) state.setActiveSection(top);
      },
      { root: doc, rootMargin: '-10% 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    const sync = () => {
      const current = new Set(doc.querySelectorAll('[data-section]'));
      for (const element of observed) {
        if (current.has(element)) continue;
        observer.unobserve(element);
        observed.delete(element);
        const id = element.getAttribute('data-section');
        if (isSectionId(id)) visible.delete(id);
      }
      for (const element of current) {
        if (observed.has(element)) continue;
        observer.observe(element);
        observed.add(element);
      }
    };

    sync();
    const mutations = new MutationObserver(sync);
    mutations.observe(doc.body, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [doc]);

  const pendingScrollTo = useEditorStore((s) => s.pendingScrollTo);
  useEffect(() => {
    if (!doc || !pendingScrollTo) return;
    const state = useEditorStore.getState();
    const element = doc.querySelector(`[data-section="${pendingScrollTo}"]`);
    state.clearPendingScroll();
    if (!element) return;
    state.setScrollLocked(true);
    state.setScrollSource('sidebar');
    element.scrollIntoView?.({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
    setTimeout(() => {
      const latest = useEditorStore.getState();
      latest.setScrollLocked(false);
      latest.setScrollSource(null);
    }, SCROLL_UNLOCK_MS);
  }, [doc, pendingScrollTo]);
}

export function usePreviewHighlight(doc: Document | null): void {
  const path = useEditorStore((s) => s.highlightedElement?.path ?? null);
  useEffect(() => {
    if (!doc) return;
    const apply = () => {
      for (const element of doc.querySelectorAll('[data-field]')) {
        if (path !== null && element.getAttribute('data-field') === path) {
          element.setAttribute('data-editor-active', '');
        } else {
          element.removeAttribute('data-editor-active');
        }
      }
    };
    apply();
    const mutations = new MutationObserver(apply);
    mutations.observe(doc.body, { childList: true, subtree: true });
    return () => mutations.disconnect();
  }, [doc, path]);
}
