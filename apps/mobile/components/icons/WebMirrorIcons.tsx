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
