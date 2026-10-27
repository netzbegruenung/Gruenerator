# Canva brand assets (official)

These files are required for Canva brand compliance. They are Canva trademarks,
copied **byte for byte** from the official logo kit
(<https://www.canva.dev/assets/connect/Canva-logos.zip>, linked from Canva's brand
guidelines, fetched 27.10.2026):
`svg/Canva Icon logo.svg` → `canva-icon.svg`, `svg/Canva type logo.svg` →
`canva-logo.svg`. Replace them only with a newer official file, never an edited one.

| File             | Use              | Brand rule                         |
| ---------------- | ---------------- | ---------------------------------- |
| `canva-icon.svg` | Square icon mark | Use for surfaces **below 50px**    |
| `canva-logo.svg` | Script wordmark  | Use for surfaces **at/above 50px** |

Rules (from Canva's brand guidelines — enforced by `CanvaLogo.tsx`):

- Do **not** recolor, stretch, compress, distort, or change the aspect ratio.
- Keep at least **8px** clear space on all sides.
- Do not combine with other logos without Canva's permission.

The app references these via `apps/web/src/features/canva/components/CanvaLogo.tsx`.
Should a file go missing, the `CanvaLogo` component renders a labelled fallback
box instead of a broken image.
