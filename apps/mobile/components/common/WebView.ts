import { type ComponentType, type RefAttributes } from 'react';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';

/**
 * react-native-webview 14 declares `class WebView<P = undefined> extends
 * Component<WebViewProps & P>`. Under React Native 0.88's types that class
 * resolves its props to `never`, so TypeScript rejects every prop. Re-typed
 * here, once, with the real props; the ref keeps the class instance and its
 * methods (`injectJavaScript`, `reload`, …). Still declared like this in
 * 14.0.1 — drop the file when upstream changes the declaration.
 */
export const WebView = RNWebView as unknown as ComponentType<
  WebViewProps & RefAttributes<RNWebView>
>;
export type WebView = RNWebView;
