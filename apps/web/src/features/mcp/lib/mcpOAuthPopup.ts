/**
 * Browser side of the MCP OAuth flow.
 *
 * The popup must be opened synchronously in the click handler (before any
 * await), otherwise the browser's popup blocker kills it. The backend callback
 * postMessages the result (origin-locked) into the opener; we also poll
 * `popup.closed` so a user who dismisses the window resolves as `dismissed`.
 */

export interface McpOAuthResult {
  status: 'success' | 'error' | 'dismissed';
  serverId?: string;
  error?: string;
}

interface OAuthMessage {
  type?: string;
  success?: boolean;
  serverId?: string;
  error?: string;
}

export function openOAuthPopup(): Window | null {
  return window.open('about:blank', 'gruenerator-mcp-oauth', 'width=600,height=760');
}

export function waitForOAuthPopup(
  popup: Window,
  // Backend truth probe ("is the server authorized by now?"). Providers whose
  // login pages send Cross-Origin-Opener-Policy sever window.opener — the
  // callback page then can't postMessage us, so without this fallback a
  // completed authorization would look stale/dismissed.
  isAuthorized?: () => Promise<boolean>
): Promise<McpOAuthResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: McpOAuthResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      if (authPoll !== null) clearInterval(authPoll);
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as OAuthMessage;
      if (!data || data.type !== 'gruenerator-mcp-oauth') return;
      finish(
        data.success
          ? { status: 'success', ...(data.serverId ? { serverId: data.serverId } : {}) }
          : { status: 'error', ...(data.error ? { error: data.error } : {}) }
      );
    };
    window.addEventListener('message', onMessage);

    const authPoll = isAuthorized
      ? window.setInterval(() => {
          isAuthorized()
            .then((ok) => {
              if (!ok || settled) return;
              try {
                popup.close();
              } catch {
                // COOP-swapped popups may refuse close(); harmless.
              }
              finish({ status: 'success' });
            })
            .catch(() => {});
        }, 2500)
      : null;

    // Cross-origin-navigated popups often can't be `.close()`d by us; poll for
    // the user dismissing it so we don't hang forever. Before reporting
    // "dismissed", check the backend once — the auth may have completed without
    // the postMessage ever reaching us.
    const poll = window.setInterval(() => {
      if (!popup.closed) return;
      if (!isAuthorized) {
        finish({ status: 'dismissed' });
        return;
      }
      isAuthorized()
        .then((ok) => finish(ok ? { status: 'success' } : { status: 'dismissed' }))
        .catch(() => finish({ status: 'dismissed' }));
    }, 800);
  });
}
