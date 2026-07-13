import { useEffect, useRef } from 'react';

import { TESTSOMMER_MARKUP, TESTSOMMER_STYLES } from './testsommerContent';

/**
 * XXL-Testsommer — öffentliche Kampagnen-Landingpage (`/testsommer`, layoutMode
 * "noChrome"). Das Design stammt 1:1 aus dem Claude-Design-Projekt und wird als
 * fertiges Markup eingesetzt; hier lebt nur das Scroll-Verhalten (Reveal,
 * Fortschrittsbalken, Sonnen-Parallax, Feedback-Formular, sanftes Ankerscrollen).
 */
export default function TestsommerPage() {
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const root = scope.querySelector<HTMLElement>('#dc-root');
    const progress = scope.querySelector<HTMLElement>('#dc-progress');
    const sun = scope.querySelector<HTMLElement>('#dc-sun');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Reveal on scroll
    const nodes = Array.from(root?.querySelectorAll<HTMLElement>('[data-reveal]') ?? []);
    const reveal = (n: HTMLElement) => {
      n.style.opacity = '1';
      n.style.transform = 'none';
    };
    let io: IntersectionObserver | null = null;
    if (reduce || !('IntersectionObserver' in window)) {
      nodes.forEach(reveal);
    } else {
      nodes.forEach((n) => {
        if (n.getBoundingClientRect().top < window.innerHeight * 0.92) reveal(n);
      });
      io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) {
              reveal(e.target as HTMLElement);
              io?.unobserve(e.target);
            }
          }),
        { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
      );
      nodes.forEach((n) => io?.observe(n));
    }

    // Progress bar + sun parallax
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight || 1;
      const y = window.scrollY || doc.scrollTop || 0;
      if (progress) progress.style.width = `${Math.min(100, (y / max) * 100)}%`;
      if (sun && !reduce) {
        sun.style.transform = `translateY(${y * 0.28}px) scale(${1 - Math.min(0.18, y / 4200)})`;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Feedback form → POST to /api/feedback, then thank-you state
    const form = scope.querySelector<HTMLFormElement>('#fb-form');
    const submitBtn = scope.querySelector<HTMLButtonElement>('#fb-submit');
    const errorEl = scope.querySelector<HTMLElement>('#fb-error');
    const showError = (msg: string) => {
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = '';
      }
    };
    const onSubmit = (e: Event) => {
      e.preventDefault();
      if (!form) return;
      const data = new FormData(form);
      const email = String(data.get('email') ?? '').trim();
      const message = String(data.get('message') ?? '').trim();
      if (!email || !message) return;
      const name = String(data.get('name') ?? '').trim();
      const track = String(data.get('track') ?? '').trim();
      if (errorEl) errorEl.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Wird gesendet …';
      }
      void fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          message,
          ...(name && { name }),
          source: track ? `Testsommer · ${track}` : 'Testsommer',
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          const wrap = scope.querySelector<HTMLElement>('#fb-form-wrap');
          const sent = scope.querySelector<HTMLElement>('#fb-sent-wrap');
          if (wrap) wrap.style.display = 'none';
          if (sent) sent.style.display = '';
          scope
            .querySelector('#feedback')
            ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        })
        .catch(() => {
          showError('Das hat leider nicht geklappt. Bitte versuch es später noch einmal.');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Feedback senden →';
          }
        });
    };
    form?.addEventListener('submit', onSubmit);

    // Smooth in-page anchor scrolling (hero CTA etc.)
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href')?.slice(1);
      const target = id && scope.querySelector(`#${CSS.escape(id)}`);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    };
    scope.addEventListener('click', onClick);

    return () => {
      io?.disconnect();
      window.removeEventListener('scroll', onScroll);
      form?.removeEventListener('submit', onSubmit);
      scope.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <>
      <style>{TESTSOMMER_STYLES}</style>
      <div
        ref={scopeRef}
        className="ts-scope"
        dangerouslySetInnerHTML={{ __html: TESTSOMMER_MARKUP }}
      />
    </>
  );
}
