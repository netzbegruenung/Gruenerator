import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The drawer lists threads from the root layout's first render, so the chat
// store must be configured by then. Until the call lived here, it ran as a side
// effect of importing services/chatConfig, and once nothing at the root
// imported that module any more, a release bundle — which loads routes lazily —
// configured chat only when a conversation opened: the drawer fetched
// `/api/chat-service/threads` relative, React Native rejected it, and the
// drawer said "Noch keine Unterhaltungen". A dev bundle cannot show this,
// because expo-router requires every route at startup to validate its exports.
//
// Module scope, not a component or effect: configuring during render warns
// (8a6a854ee5), and the drawer's effects run before the root layout's own.

const layout = readFileSync(path.resolve(import.meta.dirname, '../app/_layout.tsx'), 'utf8');

describe('app/_layout', () => {
  it('configures chat at module scope', () => {
    expect(layout).toMatch(/^configureMobileChat\(\);$/m);
  });
});
