/**
 * `expo-constants` stand-in for the Node lane: the real module reaches the
 * native bridge while it is being imported. Only `expoConfig.version` is read
 * by code this lane covers.
 */
const Constants = { expoConfig: { version: '0.0.0' } };

export default Constants;
