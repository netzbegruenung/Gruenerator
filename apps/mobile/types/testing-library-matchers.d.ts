// Testing Library 14 registers its matchers (`toBeDisabled`, `toBeOnTheScreen`,
// …) at runtime itself, but types them by augmenting `@jest/expect`, which is
// where jest 29 kept `Matchers`. Since jest 30 the `expect` from
// `@jest/globals` takes its `Matchers` from the `expect` package, so the
// augmentation never reaches it. Same interface, attached where jest 30 looks.
// `JestNativeMatchers` is not re-exported, hence the deep import (no exports map).
import { type JestNativeMatchers } from '@testing-library/react-native/dist/matchers/types';

declare module 'expect' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars -- declaration merging: no own members, and the declared parameters must be repeated
  interface Matchers<R extends void | Promise<void>, T = unknown> extends JestNativeMatchers<R> {}
}
