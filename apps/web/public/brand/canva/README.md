# Canva brand assets (official)

These files are required for Canva Connect brand compliance and are **not** checked
in by default because they are Canva trademarks that must be downloaded from the
official source.

Download the approved logo kit from the Canva Developer Portal / brand guidelines
ZIP (<https://www.canva.dev/docs/connect/guidelines/brand/>) and place the
following **unmodified** SVGs here:

| File | Use | Brand rule |
|---|---|---|
| `canva-icon.svg` | Square icon mark | Use for surfaces **below 50px** |
| `canva-logo.svg` | Script wordmark | Use for surfaces **at/above 50px** |

Rules (from Canva's brand guidelines — enforced by `CanvaLogo.tsx`):

- Do **not** recolor, stretch, compress, distort, or change the aspect ratio.
- Keep at least **8px** clear space on all sides.
- Do not combine with other logos without Canva's permission.

The app references these via `apps/web/src/features/canva/components/CanvaLogo.tsx`.
Until the files are added, the `CanvaLogo` component renders a labelled fallback
box instead of a broken image.
