import { screen } from '@testing-library/react-native';

/**
 * The rendered host elements of one native type. Testing Library 14 renders
 * host elements only and dropped the `UNSAFE_*ByType` queries; the few tests
 * that check a native prop (an image's source, a blur surface, the stack
 * screen's options) find the host by its name instead. Expo views are mocked as
 * `ViewManagerAdapter_<Name>` (`ViewManagerAdapter_ExpoImage`, …).
 */
export function hostsOfType(type: string) {
  return screen.container.queryAll((node) => node.type === type);
}

/** expo-image hands its `source` to the native view as an array. */
export function imageSources(): { uri?: string; headers?: Record<string, string> }[] {
  return hostsOfType('ViewManagerAdapter_ExpoImage').map((node) => {
    const source = node.props.source as
      | { uri?: string; headers?: Record<string, string> }[]
      | { uri?: string; headers?: Record<string, string> }
      | undefined;
    return (Array.isArray(source) ? source[0] : source) ?? {};
  });
}
