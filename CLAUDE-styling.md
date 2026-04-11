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
