# CLAUDE-styling.md

Styling, theming, and UI component conventions.

## Tailwind CSS v4

Use for all new code. Import `cn()` from `@/utils/cn` for conditional classes.

**Tokens**: Colors (`bg-primary-500`, `text-foreground`, `bg-background`), Spacing (`p-xs`–`p-2xl`), Shadows (`shadow-sm`–`shadow-xl`), Radius (`rounded-sm`/`md`/`lg`).

### v4 Gotchas

- **`max-w-*` uses spacing scale**, not legacy named sizes. `max-w-md` = 16px (not 28rem). Always use `max-w-[28rem]`. Affected: `max-w-sm` through `max-w-2xl`.
- **`fixed` does not set `inset: 0`.** Use `fixed inset-0 m-auto h-fit w-full max-w-[32rem]` for centered dialogs.
- **`mx-auto` in flex column collapses width.** Add `w-full` alongside `mx-auto` inside `flex flex-col` parents.

### Legacy Code & Migration

- Design tokens: `apps/web/src/assets/styles/common/variables.css`
- Opportunistic migration: convert CSS to Tailwind when touching files. New features use Tailwind exclusively.

## Theme & Dark Mode

- Dark mode: `[data-theme="dark"]` on `<html>`. Toggled by `useDarkMode.ts`. Always test both modes.
- **Use semantic tokens**: `text-foreground` (not `text-grey-800 dark:text-grey-100`), `text-foreground-heading`, `bg-background`, `bg-background-alt`, `bg-background-pure`.
- **Color architecture**: Values in `variables.css` as `-val` CSS vars with light/dark pairs. `@theme` in `index.css` is a pure mapping layer. Never hardcode hex in `@theme`.
- **`@layer` order**: `base < legacy < components < utilities`. Package CSS with `:root` defaults → `layer(legacy)`, not `layer(components)`.
- **`dark:` variant**: Configured via `@custom-variant dark` in `index.css`. For gradients, always add `dark:from-*` explicitly.

## CSS Variable Names — Do NOT Invent

| Wrong (undefined)       | Correct (defined)                                      |
|-------------------------|--------------------------------------------------------|
| `--text-primary`        | `--font-color` or `text-foreground`                    |
| `--text-tertiary`       | `--font-color-muted` or `text-grey-400`                |
| `--border-default/color`| `--border-subtle` / `--card-border` or Tailwind border tokens |
| `--border-radius*`      | Use `rounded-lg` directly                              |
| `--background-hover`    | `--hover-color-alt` or `bg-hover-alt`                  |
| `--background-active/subtle` | Use `bg-grey-100 dark:bg-grey-800`                |
| `--bg-color`            | `--background-color` or `bg-background`                |
| `--primary-color`       | `--primary-600` or `text-primary-600`                  |

Prefer Tailwind utilities over `var(--)`. Only use variables confirmed in `variables.css`.

## Design System Building Blocks (`@gruenerator/ui`)

**Do NOT hand-roll page chrome, buttons, inputs, cards, or section headers.** Reach for the shared components first — match the patterns `apps/web/src/features/workplace/WorkplacePage.tsx` and `apps/web/src/features/agents/*` use. Hand-rolled `<button className="rounded bg-primary-600 …">`, raw `<input className="border …">`, or bespoke `<h2>+count` headers are a smell; reviewers push back.

| Need | Use | Notes |
|------|-----|-------|
| Page wrapper | `PageContainer` (`@/components/common/PageContainer`) | `maxWidth="sm\|md\|lg"`, optional `title`/`subtitle` render the centered page header. Gives consistent padding + gradient. |
| Section header | `SectionHeader` from `@gruenerator/ui` | `title` + optional `actions`/`onCreate`/`searchQuery`. Never hand-roll `<h2>+button`. |
| Buttons | `Button` from `@gruenerator/ui` | Variants: `brand` (primary pill), `brand-outline`, `brand-ghost`, `brand-danger`, plus `default`/`outline`/`ghost`/`destructive`/`link`. Sizes `sm`/`default`/`lg`/`icon`. |
| Text / number fields | `Input` from `@gruenerator/ui` | Forwards all `<input>` props. `bg-input-bg`, h-11. |
| Multi-line | `Textarea` from `@gruenerator/ui` | |
| Cards | `Card` / `CardGrid` / `CardActionsMenu` | Card list items: clickable card + hover-lift + `DropdownMenu` kebab (see `features/workplace/components/TextCard.tsx`, `features/agents/AgentCard.tsx`). |
| Dialogs | `Dialog` + `DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` | Confirm/edit modals. |
| Dropdown menus | `DropdownMenu*` | Card actions; `DropdownMenuItem variant="destructive"` for delete. |
| AI prompt box | `AIPromptInput` | One-shot "describe it" entry points; pass `useDictation={useVoxtralDictation}` + `examples`. |
| Multi-step form | `MultiStepForm` + `MultiStepForm.Step` | Wizards (see `features/agents/AgentBuilderForm.tsx`). |
| Avatars / icons | `Avatar`; agent icons via the Phosphor picker pattern (`features/agents/icons/`) | |

Native `<select>` is acceptable when the shadcn `Select` is overkill — style it to match `Input`: `h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50` (the `selectCls` convention in the agents feature). For a richer/searchable select, use `Select` from `@gruenerator/ui`.

Reference implementation for a full feature using these: the agent creator/editor at `apps/web/src/features/agents/` (`AgentStartScreen`, `AgentBuilderForm`, `AgentSettingsPage`, `AgentCard`).

## shadcn/ui Components

Prefer shadcn/ui for new UI. For chat, prefer Assistant UI (`@assistant-ui/react`) first. Always add via CLI:

```bash
cd apps/web && npx shadcn@latest add <component-name>
cd packages/chat && npx shadcn@latest add <component-name>
```

**Post-CLI adaptations:** (1) Fix import order (external before `react`). (2) Replace tokens: `bg-popover` → `bg-background-pure`, `border` → `border border-grey-200 dark:border-grey-700`, `shadow-md` → `shadow-lg`. (3) Remove `"use client"`. (4) Reference `dropdown-menu.tsx`/`dialog.tsx` as style guide.

**`apps/web` config**: `aliases.utils` → `@/utils/cn`, `style` → `new-york`, components in `src/components/ui/`.

**`packages/chat` caveat**: Replace `@/` path aliases with relative imports — Vite resolves `@/` from the consuming app.

## Docs App

`apps/docs` and `packages/docs` use `@blocknote/shadcn` for editor UI. Dark mode via `data-theme`.

- **Avatars**: Use `getAvatarDisplayProps()` and `getRobotAvatarPath()` from `@gruenerator/shared/avatar`.
