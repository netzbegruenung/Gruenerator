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

export function waitForOAuthPopup(popup: Window): Promise<McpOAuthResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: McpOAuthResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
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

    // Cross-origin-navigated popups often can't be `.close()`d by us; poll for
    // the user dismissing it so we don't hang forever.
    const poll = window.setInterval(() => {
      if (popup.closed) finish({ status: 'dismissed' });
    }, 800);
  });
}
