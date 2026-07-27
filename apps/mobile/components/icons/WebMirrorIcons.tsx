import { type ToolIconKey } from '@gruenerator/shared/icons';
import { type ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Web-mirrored icons rendered as exact SVG glyphs (not Ionicons look-alikes).
 *
 * react-icons (used across apps/web) are DOM-only, but each glyph is just SVG
 * path data — so mobile renders the identical vector via react-native-svg. To
 * mirror another web icon: import it from react-icons in a node one-liner, copy
 * its viewBox + path here, and add a component. This keeps web/mobile visually
 * unified without shipping react-icons (which RN cannot render) to the app.
 */

interface IconProps {
  /** Fill colour; tab bar passes the active/inactive tint (ColorValue). */
  color: ColorValue;
  size: number;
}

// react-icons/sl → SlNotebook (the icon apps/web uses for the Notebooks nav).
const SL_NOTEBOOK_PATH =
  'M849.152 0H211.153c-46 0-66.032 34-66.032 66v127.312h-34.928c-17.311 0-31.344 14.032-31.344 31.345 0 17.311 14.033 31.343 31.344 31.343h34.928v128.752h-31.936c-17.312 0-31.344 14.033-31.344 31.344 0 17.313 14.032 31.345 31.343 31.345h31.936v129.44h-32.624c-17.312 0-31.344 14.032-31.344 31.344s14.032 31.344 31.344 31.344h32.624v128.464h-32.624c-17.312 0-31.344 14.032-31.344 31.343s14.032 31.344 31.344 31.344h32.624V960c0 53.025 41.536 64 64.528 64h639.504c53.025 0 96-42.975 96-96V96c0-53.024-42.96-96-96-96zM209.121 960l-.001-129.279h33.344c17.311 0 31.344-14.032 31.344-31.344s-14.033-31.344-31.344-31.344H209.12V639.569h33.344c17.311 0 31.344-14.033 31.344-31.344s-14.033-31.344-31.344-31.344H209.12V447.44h34.032c17.313 0 31.345-14.032 31.345-31.345 0-17.311-14.032-31.344-31.344-31.344h-34.032V256h31.024c17.312 0 31.344-14.032 31.344-31.343 0-17.313-14.032-31.345-31.344-31.345h-31.024V66c0-.752.064-1.376.16-1.936a28.23 28.23 0 0 1 1.872-.064h510v896H209.121zm672.031-31.999c0 17.664-14.336 32-32 32h-64v-896h64c17.664 0 32 14.336 32 32v832z';

export function NotebookIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill={color}>
      <Path d={SL_NOTEBOOK_PATH} />
    </Svg>
  );
}

// react-icons/pi → PiDetective, the glyph apps/web puts on the Agentura header.
// Ionicons has no detective; the nearest candidates (glasses, eye, search) all
// say something else, so this one is mirrored rather than approximated.
const PI_DETECTIVE_PATH =
  'M248,112H220.08l-47.5-65.41a16,16,0,0,0-25.31-.72l-12.85,14.9-.2.23a7.95,7.95,0,0,1-12.44,0l-.2-.23-12.85-14.9a16,16,0,0,0-25.31.72L35.92,112H8a8,8,0,0,0,0,16H248a8,8,0,0,0,0-16ZM96.34,56l.19.23,12.85,14.89a24,24,0,0,0,37.24,0l12.85-14.89c.06-.08.1-.15.17-.23l40.66,56H55.69ZM180,144a36,36,0,0,0-35.77,32H111.77a36,36,0,1,0-1.83,16h36.12A36,36,0,1,0,180,144ZM76,200a20,20,0,1,1,20-20A20,20,0,0,1,76,200Zm104,0a20,20,0,1,1,20-20A20,20,0,0,1,180,200Z';

export function DetectiveIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill={color}>
      <Path d={PI_DETECTIVE_PATH} />
    </Svg>
  );
}

/**
 * react-icons/hi → HiOutlineMenuAlt2, the drawer button's hamburger.
 *
 * A stroked glyph, not a filled one — Heroicons' outline set draws its lines
 * rather than describing their outlines — which is why this one carries stroke
 * props instead of a `fill`, and why its path is three short segments.
 *
 * Its shortened bottom stroke is the point. Ionicons' `menu` draws three equal
 * bars, 2.49dp thick and 5.33dp apart as measured on the S24; at size 26 this
 * one draws 2.17dp thick and 6.5dp apart, with the last line at 7/16 the width.
 * Thinner, airier and tapered — the shape Claude's Android app wears (1.42dp /
 * 7.11dp, with a half-length bottom bar), and the glyph web already renders.
 */
export function MenuAlt2Icon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6h16M4 12h16M4 18h7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Menu glyphs ────────────────────────────────────────────────────────────
// The icons the drawer and the tool grids wear, mirrored from the exact
// react-icons glyphs apps/web renders. Which tool gets which is decided once,
// in `@gruenerator/shared/icons` — this file only knows how to draw them.
//
// Ionicons look-alikes were the previous answer and were not close enough: web's
// Agentura wears RiSpyLine, and `people` is a different idea, not a variant.

const MENU_PATHS: Record<ToolIconKey, { viewBox: string; d: string }> = {
  // react-icons/ri → RiSpyLine
  spy: {
    viewBox: '0 0 24 24',
    d: 'M17 13C19.2091 13 21 14.7909 21 17C21 19.2091 19.2091 21 17 21C14.7909 21 13 19.2091 13 17H11C11 19.2091 9.20914 21 7 21C4.79086 21 3 19.2091 3 17C3 14.7909 4.79086 13 7 13C8.48052 13 9.77317 13.8043 10.4648 14.9999H13.5352C14.2268 13.8043 15.5195 13 17 13ZM7 15C5.89543 15 5 15.8954 5 17C5 18.1046 5.89543 19 7 19C8.10457 19 9 18.1046 9 17C9 15.8954 8.10457 15 7 15ZM17 15C15.8954 15 15 15.8954 15 17C15 18.1046 15.8954 19 17 19C18.1046 19 19 18.1046 19 17C19 15.8954 18.1046 15 17 15ZM16 3C18.2091 3 20 4.79086 20 7V10H22V12H2V10H4V7C4 4.79086 5.79086 3 8 3H16ZM16 5H8C6.94564 5 6 5.95 6 7V10H18V7C18 5.94564 17.05 5 16 5Z',
  },
  // react-icons/hi → HiUserGroup
  userGroup: {
    viewBox: '0 0 20 20',
    d: 'M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z',
  },
  // react-icons/pi → PiScan
  scan: {
    viewBox: '0 0 256 256',
    d: 'M224,40V80a8,8,0,0,1-16,0V48H176a8,8,0,0,1,0-16h40A8,8,0,0,1,224,40ZM80,208H48V176a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H80a8,8,0,0,0,0-16Zm136-40a8,8,0,0,0-8,8v32H176a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V176A8,8,0,0,0,216,168ZM40,88a8,8,0,0,0,8-8V48H80a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8V80A8,8,0,0,0,40,88ZM80,72h96a8,8,0,0,1,8,8v96a8,8,0,0,1-8,8H80a8,8,0,0,1-8-8V80A8,8,0,0,1,80,72Zm8,96h80V88H88Z',
  },
  // react-icons/pi → PiPaintBrush
  paintBrush: {
    viewBox: '0 0 256 256',
    d: 'M232,32a8,8,0,0,0-8-8c-44.08,0-89.31,49.71-114.43,82.63A60,60,0,0,0,32,164c0,30.88-19.54,44.73-20.47,45.37A8,8,0,0,0,16,224H92a60,60,0,0,0,57.37-77.57C182.3,121.31,232,76.08,232,32ZM92,208H34.63C41.38,198.41,48,183.92,48,164a44,44,0,1,1,44,44Zm32.42-94.45q5.14-6.66,10.09-12.55A76.23,76.23,0,0,1,155,121.49q-5.9,4.94-12.55,10.09A60.54,60.54,0,0,0,124.42,113.55Zm42.7-2.68a92.57,92.57,0,0,0-22-22c31.78-34.53,55.75-45,69.9-47.91C212.17,55.12,201.65,79.09,167.12,110.87Z',
  },
  // react-icons/ri → RiMagicLine
  magic: {
    viewBox: '0 0 24 24',
    d: 'M15.1986 9.94447C14.7649 9.5337 14.4859 8.98613 14.4085 8.39384L14.0056 5.31138L11.275 6.79724C10.7503 7.08274 10.1433 7.17888 9.55608 7.06948L6.49998 6.50015L7.06931 9.55625C7.17871 10.1435 7.08257 10.7505 6.79707 11.2751L5.31121 14.0057L8.39367 14.4086C8.98596 14.4861 9.53353 14.7651 9.94431 15.1987L12.0821 17.4557L13.4178 14.6486C13.6745 14.1092 14.109 13.6747 14.6484 13.418L17.4555 12.0823L15.1986 9.94447ZM15.2238 15.5079L13.0111 20.1581C12.8687 20.4573 12.5107 20.5844 12.2115 20.442C12.1448 20.4103 12.0845 20.3665 12.0337 20.3129L8.49229 16.5741C8.39749 16.474 8.27113 16.4096 8.13445 16.3918L3.02816 15.7243C2.69958 15.6814 2.46804 15.3802 2.51099 15.0516C2.52056 14.9784 2.54359 14.9075 2.5789 14.8426L5.04031 10.3192C5.1062 10.1981 5.12839 10.058 5.10314 9.92253L4.16 4.85991C4.09931 4.53414 4.3142 4.22086 4.63997 4.16017C4.7126 4.14664 4.78711 4.14664 4.85974 4.16017L9.92237 5.10331C10.0579 5.12855 10.198 5.10637 10.319 5.04048L14.8424 2.57907C15.1335 2.42068 15.4979 2.52825 15.6562 2.81931C15.6916 2.88421 15.7146 2.95507 15.7241 3.02833L16.3916 8.13462C16.4095 8.2713 16.4739 8.39766 16.5739 8.49245L20.3127 12.0338C20.5533 12.2617 20.5636 12.6415 20.3357 12.8821C20.2849 12.9357 20.2246 12.9795 20.1579 13.0112L15.5078 15.224C15.3833 15.2832 15.283 15.3835 15.2238 15.5079ZM16.0206 17.435L17.4348 16.0208L21.6775 20.2634L20.2633 21.6776L16.0206 17.435Z',
  },
  // react-icons/pi → PiVideoCamera
  videoCamera: {
    viewBox: '0 0 256 256',
    d: 'M251.77,73a8,8,0,0,0-8.21.39L208,97.05V72a16,16,0,0,0-16-16H32A16,16,0,0,0,16,72V184a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V159l35.56,23.71A8,8,0,0,0,248,184a8,8,0,0,0,8-8V80A8,8,0,0,0,251.77,73ZM192,184H32V72H192V184Zm48-22.95-32-21.33V116.28L240,95Z',
  },
};

/** Draws the glyph a tool's shared `ToolIconKey` names. */
export function MenuIcon({ name, color, size }: IconProps & { name: ToolIconKey }) {
  const glyph = MENU_PATHS[name];
  return (
    <Svg width={size} height={size} viewBox={glyph.viewBox} fill={color}>
      <Path d={glyph.d} />
    </Svg>
  );
}
