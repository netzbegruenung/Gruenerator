// Shim: isomorphic-webcrypto is unmaintained and its react-native entry crashes
// in Android WebView by setting navigator.userAgent on a read-only getter.
// In WebView context, native crypto is available — just re-export it.
const crypto = globalThis.crypto || window.crypto;
crypto.ensureSecure = () => Promise.resolve(true);
module.exports = crypto;
