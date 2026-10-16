/**
 * `react-native-worklets` stand-in for the Node lane. There is no UI runtime
 * here, so a worklet is a plain function and both schedulers call it at once —
 * which also lets a test count every hop to the RN thread synchronously.
 */
export function scheduleOnRN<Args extends unknown[], R>(fn: (...args: Args) => R, ...args: Args) {
  fn(...args);
}

export function scheduleOnUI<Args extends unknown[], R>(fn: (...args: Args) => R, ...args: Args) {
  fn(...args);
}
