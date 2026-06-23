# Grünerator UI (@gruenerator/ui) — how to build with this design system

A React + Tailwind v4 component library (shadcn/Radix + Base UI under the hood) for **Die Grünen / Grünerator**. Brand color is **Eucalyptus green**; headings are **Raleway**, body is **PT Sans** (both load automatically from `styles.css` — never set font-family yourself).

## Setup & wrapping
- **Components are styled out of the box** — the bundle's `styles.css` defines all design tokens (`:root`) and `@font-face`s. Just import and compose; no theme provider is needed for styling.
- **Dark mode**: set `data-theme="dark"` on a wrapping element (every token has a dark value).
- **A few components need a context provider** (wrap once, near the root):
  - `Tooltip` and `NotificationBell` → wrap in `<TooltipProvider>`.
  - `useConfirm()` (confirm dialogs) → wrap in `<ConfirmDialogProvider>`.
  - Toasts → render `<Toaster />` once at the root, then call `toast(...)` from `sonner`.

## Styling idiom — compose, don't restyle
- **Drive appearance through component props, not custom CSS.** Buttons/Badges/etc. expose `variant` and `size`. The brand CTA is the rounded green pill: `<Button variant="brand">`. Other Button variants: `default` (green), `secondary`, `outline`, `ghost`, `destructive`, `link`, plus `brand-outline` / `brand-ghost` / `brand-danger`.
- **The shipped stylesheet only contains the Tailwind utility classes the library itself uses** (the design environment serves static CSS — there is no Tailwind compiler). So:
  - For the components: use them as-is — their classes are present and styled.
  - For **your own layout glue** (wrappers, rows, grids, spacing): prefer **inline `style={{}}`** or the CSS-variable tokens below. Common layout utilities the library uses ARE available (`flex`, `grid`, `items-center`, `gap-2/3/4`, `p-4`, `rounded-md`, `rounded-lg`, `text-sm`, `font-medium`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border`) — but anything outside the library's vocabulary won't exist, so don't reach for arbitrary classes.
  - ⚠️ **`max-w-sm`/`md`/`lg` resolve to tiny spacing tokens (~12–16px), not container widths** (a repo quirk, faithful to the app). For a max content width use `max-w-[640px]` or inline `style={{maxWidth:640}}`.
- **Design tokens** (CSS custom properties in `:root`, usable in inline styles as `var(--token)` or via utilities):
  - Color: `--color-primary` (#52907A green), `--color-secondary` (#5F8575 Eucalyptus), `--color-primary-50…950`, `--color-secondary-50…950`, `--color-grey-50…950`, `--color-background`, `--color-background-alt`, `--color-foreground`, `--color-muted-foreground`, `--color-border`, `--color-destructive`, `--color-card`, `--color-ring`.
  - Spacing: `--spacing-xs|sm|md|lg|xl|2xl`. Radius: `--radius-sm|md|lg`. Shadow: `--shadow-sm|md|lg|xl`.

## Where the real truth lives
Before composing a component, read its bound docs: `<Name>.d.ts` (the exact prop interface — variant/size unions, required props) and `<Name>.prompt.md` (usage). For the full token/class vocabulary, read the bound `styles.css`. Compound components (Card, Dialog, Select, Accordion, Table, DropdownMenu, …) are composed from sub-parts — e.g. `Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`; `Select` + `SelectTrigger`/`SelectContent`/`SelectItem`.

## Idiomatic example
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, Badge } from '@gruenerator/ui';

export function PressReleaseCard() {
  return (
    <Card style={{ maxWidth: 440 }}>
      <CardHeader>
        <CardTitle>Klimaschutz vor Ort stärken</CardTitle>
        <CardDescription>Pressemitteilung · heute</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge>Veröffentlicht</Badge>
          <span style={{ color: 'var(--color-muted-foreground)', fontSize: 14 }}>3 Min. Lesezeit</span>
        </div>
      </CardContent>
      <CardFooter style={{ gap: 8 }}>
        <Button variant="brand">Weiterlesen</Button>
        <Button variant="ghost">Teilen</Button>
      </CardFooter>
    </Card>
  );
}
```
