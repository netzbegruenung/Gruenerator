(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var collection = script.getAttribute('data-collection') || 'gruene-de-system';
  var position = script.getAttribute('data-position') || 'bottom-right';
  var color = script.getAttribute('data-color') || '#316049';
  var title = script.getAttribute('data-title') || 'Grün-O-Mat';
  var mode = script.getAttribute('data-mode') || 'widget';
  var container = script.getAttribute('data-container');
  var baseUrl = script.src.replace(/\/embed\.js(\?.*)?$/, '');

  var iframeSrc = baseUrl + '/embed/' + encodeURIComponent(collection);

  // Inline mode: render iframe directly into a container element
  if (mode === 'inline') {
    var target = container ? document.querySelector(container) : null;
    if (!target) {
      console.warn('[Grün-O-Mat] data-mode="inline" requires a valid data-container selector.');
      return;
    }
    var inlineIframe = document.createElement('iframe');
    inlineIframe.src = iframeSrc;
    inlineIframe.style.cssText = 'width:100%;height:100%;border:none;';
    inlineIframe.setAttribute('allow', 'clipboard-write');
    inlineIframe.setAttribute('title', title);
    target.appendChild(inlineIframe);
    return;
  }

  var isOpen = false;
  var iframeLoaded = false;

  var host = document.createElement('div');
  host.id = 'gruen-o-mat-embed';
  var shadow = host.attachShadow({ mode: 'closed' });

  var posRight = position === 'bottom-right';

  var styles = document.createElement('style');
  styles.textContent = [
    ':host { all: initial; }',
    '.gom-bubble {',
    '  position: fixed;',
    '  ' + (posRight ? 'right' : 'left') + ': 20px;',
    '  bottom: 20px;',
    '  width: 56px;',
    '  height: 56px;',
    '  border-radius: 50%;',
    '  background: ' + color + ';',
    '  color: #fff;',
    '  border: none;',
    '  cursor: pointer;',
    '  box-shadow: 0 4px 12px rgba(0,0,0,0.15);',
    '  z-index: 2147483646;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  transition: transform 0.2s ease, box-shadow 0.2s ease;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '}',
    '.gom-bubble:hover {',
    '  transform: scale(1.08);',
    '  box-shadow: 0 6px 20px rgba(0,0,0,0.2);',
    '}',
    '.gom-bubble svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }',
    '.gom-overlay {',
    '  position: fixed;',
    '  inset: 0;',
    '  background: rgba(0,0,0,0.4);',
    '  z-index: 2147483646;',
    '  opacity: 0;',
    '  transition: opacity 0.2s ease;',
    '  pointer-events: none;',
    '}',
    '.gom-overlay.open { opacity: 1; pointer-events: auto; }',
    '.gom-modal {',
    '  position: fixed;',
    '  ' + (posRight ? 'right' : 'left') + ': 20px;',
    '  bottom: 88px;',
    '  width: 400px;',
    '  height: 600px;',
    '  max-height: calc(100dvh - 108px);',
    '  background: #fff;',
    '  border-radius: 16px;',
    '  box-shadow: 0 8px 32px rgba(0,0,0,0.2);',
    '  z-index: 2147483647;',
    '  display: flex;',
    '  flex-direction: column;',
    '  overflow: hidden;',
    '  transform: translateY(16px) scale(0.96);',
    '  opacity: 0;',
    '  transition: transform 0.25s ease, opacity 0.25s ease;',
    '  pointer-events: none;',
    '}',
    '.gom-modal.open {',
    '  transform: translateY(0) scale(1);',
    '  opacity: 1;',
    '  pointer-events: auto;',
    '}',
    // Modal mode: centered dialog variant
    '.gom-modal.centered {',
    '  position: fixed;',
    '  top: 50%;',
    '  left: 50%;',
    '  right: auto;',
    '  bottom: auto;',
    '  transform: translate(-50%, -50%) scale(0.96);',
    '  opacity: 0;',
    '  width: 480px;',
    '  height: 680px;',
    '  max-height: calc(100dvh - 64px);',
    '  max-width: calc(100vw - 32px);',
    '}',
    '.gom-modal.centered.open {',
    '  transform: translate(-50%, -50%) scale(1);',
    '  opacity: 1;',
    '}',
    '.gom-header {',
    '  display: flex;',
    '  align-items: center;',
    '  padding: 12px 16px;',
    '  background: ' + color + ';',
    '  color: #fff;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  font-size: 15px;',
    '  font-weight: 600;',
    '}',
    '.gom-header-title { flex: 1; }',
    '.gom-close {',
    '  background: none;',
    '  border: none;',
    '  color: #fff;',
    '  cursor: pointer;',
    '  padding: 4px;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  border-radius: 4px;',
    '  opacity: 0.8;',
    '  transition: opacity 0.15s;',
    '}',
    '.gom-close:hover { opacity: 1; }',
    '.gom-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }',
    '.gom-iframe { flex: 1; border: none; width: 100%; height: 100%; }',
    '@media (max-width: 480px) {',
    '  .gom-modal, .gom-modal.centered {',
    '    inset: 0;',
    '    width: 100%;',
    '    height: 100%;',
    '    max-height: 100%;',
    '    max-width: 100%;',
    '    border-radius: 0;',
    '    bottom: 0;',
    '    top: 0;',
    '    left: 0;',
    '    transform: translateY(16px);',
    '  }',
    '  .gom-modal.open, .gom-modal.centered.open {',
    '    transform: translateY(0);',
    '  }',
    '}',
  ].join('\n');

  shadow.appendChild(styles);

  var chatIcon =
    '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var closeIcon =
    '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  var isCentered = mode === 'modal';

  // Overlay
  var overlay = document.createElement('div');
  overlay.className = 'gom-overlay';
  shadow.appendChild(overlay);

  // Modal panel
  var modal = document.createElement('div');
  modal.className = isCentered ? 'gom-modal centered' : 'gom-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', title);

  var header = document.createElement('div');
  header.className = 'gom-header';

  var headerTitle = document.createElement('span');
  headerTitle.className = 'gom-header-title';
  headerTitle.textContent = title;
  header.appendChild(headerTitle);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'gom-close';
  closeBtn.innerHTML = closeIcon;
  closeBtn.setAttribute('aria-label', 'Schließen');
  header.appendChild(closeBtn);

  modal.appendChild(header);

  // Iframe (lazy — src set on first open)
  var iframe = document.createElement('iframe');
  iframe.className = 'gom-iframe';
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('title', title);
  modal.appendChild(iframe);

  shadow.appendChild(modal);
  document.body.appendChild(host);

  function open() {
    if (isOpen) return;
    isOpen = true;
    if (!iframeLoaded) {
      iframe.src = iframeSrc;
      iframeLoaded = true;
    }
    overlay.classList.add('open');
    modal.classList.add('open');
    if (bubble) {
      bubble.innerHTML = closeIcon;
      bubble.setAttribute('aria-label', title + ' schließen');
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('open');
    modal.classList.remove('open');
    if (bubble) {
      bubble.innerHTML = chatIcon;
      bubble.setAttribute('aria-label', title + ' öffnen');
    }
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // Bubble button (only in widget mode)
  var bubble = null;
  if (mode === 'widget') {
    bubble = document.createElement('button');
    bubble.className = 'gom-bubble';
    bubble.innerHTML = chatIcon;
    bubble.setAttribute('aria-label', title + ' öffnen');
    shadow.appendChild(bubble);
    bubble.addEventListener('click', toggle);
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) close();
  });

  // Public API for modal mode (and widget mode)
  window.GruenOMat = {
    open: open,
    close: close,
    toggle: toggle,
  };
})();
