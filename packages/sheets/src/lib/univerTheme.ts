import { defaultTheme } from '@univerjs/presets';

/**
 * Univer's chrome palette, remapped onto the Grünerator design tokens.
 *
 * Why a theme object and not CSS overrides: Univer's `ThemeSwitcherService`
 * turns this object into a `:root { --univer-<group>-<shade> }` block, so every
 * `--univer-*` consumer is covered — including the popups/dropdowns that render
 * in portals outside our container. The same object is ALSO read from JS
 * (`themeService.getCurrentTheme()`) to paint canvas elements such as the
 * selection outline and the freeze lines, which is why the values must be
 * literal hex and cannot be `var(--primary-600)` — ColorKit parses them.
 * Overriding the compiled `@univerjs` CSS with selector hacks was rejected: it
 * ships generated Tailwind utility classes without semantic selectors, so any
 * such rule would break on the next minor.
 *
 * Both scales stay monotonic light → dark ramps because Univer has ONE palette
 * for both modes and picks the shade per mode (`dark:!univer-bg-gray-900` vs
 * `univer-bg-white`). There is deliberately no second, dark-mode-specific set.
 *
 * Only `primary` (accents, active/focus states) and `gray` (surfaces, borders,
 * icon/text colours) are remapped — the semantic red/green/yellow scales keep
 * Univer's values so error/warning affordances stay recognisable.
 *
 * Values mirror `--primary-*` / `--grey-*` in
 * `apps/web/src/assets/styles/common/variables.css`. They are duplicated as hex
 * on purpose (see the canvas note above); keep them in sync when the tokens
 * move. Our greys are neutral where Univer's carry a blue tint — that tint was
 * the main reason the ribbon read as foreign.
 */
export const gruenatorUniverTheme = {
  ...defaultTheme,
  primary: {
    50: '#F0F8F4',
    100: '#D8F0E6',
    200: '#B1E0C9',
    300: '#8AC9B0',
    400: '#6BAA91',
    500: '#52907A',
    600: '#316049',
    700: '#285040',
    800: '#1F3F33',
    900: '#1A332A',
  },
  gray: {
    50: '#f9f9f9',
    100: '#efefef',
    200: '#dcdcdc',
    300: '#bdbdbd',
    400: '#989898',
    500: '#7c7c7c',
    600: '#656565',
    700: '#525252',
    800: '#3a3a3a',
    900: '#2e2e2e',
  },
};
