# Newsletter Writing Style

> Referenced from `CLAUDE.md`. Newsletters are sent via Brevo (Sendinblue) and archived in Docusaurus at `documentation/docs/newsletter/`.

## Tone & Voice

- **Personal "du"-Ansprache** — direct, informal, like talking to a friend
- **Mix of "ich" (Moritz) and "wir" (the project/community)** — personal voice for decisions and plans, collective voice for shared goals
- **Conversational, almost spoken language** — short sentences, rhetorical pauses, sentence fragments for emphasis ("Und dann? Fand TikTok ohne uns statt.")
- **Sign-off**: First name only ("Moritz"), no formal closing

## Structure

- **Rhetorical question headers** — section titles are questions ("Was heißt das?", "Wie machen wir das?", "Warum so schnell?")
- **Short paragraphs** — many single-sentence paragraphs for dramatic effect
- **Vision first, then practical** — lead with big-picture motivation, follow with concrete how-to
- **Clear call-to-action** — each newsletter has a specific ask (beta testing, feedback, conversations)

## Content Patterns

- **Political urgency as motivator** — connect features to democratic values and Green principles
- **Balanced tech optimism** — pro-innovation but acknowledges risks (CO2, KI-Bloat, data privacy)
- **Technical concepts explained simply** — no jargon without plain-language explanation
- **Green values woven naturally** — European sovereignty, data privacy, open source, sustainability
- **Self-aware about project status** — honest about being a "Freizeit-Projekt", acknowledges early-stage bugs
- **Branded language** — "Grünerieren" as a verb, "Grünerierung" as a noun

## Formatting

- **Brevo template variables**: `{{ contact.VORNAME | default : " " }}` for personalization
- **Emoji**: Used sparingly, only for CTAs (e.g., `👉` before a link)
- **Links**: Inline where relevant, newsletter subscription at `fax.gruenerator.de`
- **Archive filename convention**: `YYYY-MM-thema-in-kebab-case.md` (e.g., `2026-01-jahr-der-daten.md`)
