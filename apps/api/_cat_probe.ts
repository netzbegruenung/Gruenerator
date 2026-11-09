import { buildRecipeCatalog } from './routes/chat/agents/recipeCatalog.js';
const c = await buildRecipeCatalog({ userLocale: 'de-DE', userId: null, roles: [] });
console.log(
  c.length,
  ['beschlusslage', 'rechtsstand', 'bundestagsrecherche', 'wahlpruefstein', 'aktion']
    .map((m) => m + ':' + c.some((e) => e.mention === m))
    .join(' ')
);
