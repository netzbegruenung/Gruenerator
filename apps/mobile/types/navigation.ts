// expo-router 56 vendors React Navigation internally and no longer re-exports the
// drawer content types from a public subpath — the SDK 56 codemod explicitly flags
// `@react-navigation/drawer` imports as non-migratable. The vendored types are the
// ones expo-router's <Drawer> actually passes to `drawerContent`, and the external
// @react-navigation/drawer types are nominally incompatible (branded PrivateValueStore).
// Re-export the vendored types from their one location so drawer content props match.
export type {
  DrawerContentComponentProps,
  DrawerNavigationProp,
} from 'expo-router/build/react-navigation/drawer';
