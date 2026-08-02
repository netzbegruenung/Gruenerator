import reactConfig from './react.js';
import rnA11yPlugin from 'eslint-plugin-react-native-a11y';

/**
 * React-Native-Variante der React-Config: derselbe Satz plus das
 * Barrierefreiheits-Gitter für Touch-Bedienelemente.
 *
 * Getrennt von `react.js`, weil die Regeln auf RN-Komponenten (`Pressable`,
 * `TouchableOpacity`, `Text`) matchen und im Web schlicht nie feuern würden —
 * und weil `jsx-a11y` umgekehrt auf RN-Elemente nicht anwendbar ist.
 *
 * Zielstandard: EN 301 549 Kap. 5/11 (Software) + WCAG 2.2 AA.
 * Plan: docs/barrierefreiheit-audit-plan.md, Welle 4.
 *
 * `pnpm install` meldet für eslint-plugin-react-native-a11y einen unerfüllten
 * Peer (`eslint@^3 || … || ^8`, vorhanden ist 9.39.5). Das Plugin deklariert
 * ESLint 9 noch nicht, funktioniert unter Flat Config aber, weil es nur
 * `rules`/`configs` exportiert und keine Legacy-API benutzt — verifiziert am
 * 02.08.2026 mit 295 gemeldeten Verstößen über apps/mobile. Wenn ein Upgrade
 * das bricht, ist der Fehler „plugin exports no rules", nicht ein stiller
 * Nullbefund.
 */
export default [
  ...reactConfig,
  {
    plugins: {
      'react-native-a11y': rnA11yPlugin,
    },
    rules: {
      // jsx-a11y aus react.js abschalten: die Regeln prüfen DOM-Elemente und
      // erzeugen auf RN-Komponenten entweder Rauschen oder gar nichts.
      ...Object.fromEntries(Object.keys(rnA11yPlugin.rules).map((r) => [`jsx-a11y/${r}`, 'off'])),
      'jsx-a11y/alt-text': 'off',
      'jsx-a11y/anchor-has-content': 'off',
      'jsx-a11y/anchor-is-valid': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/heading-has-content': 'off',
      'jsx-a11y/html-has-lang': 'off',
      'jsx-a11y/media-has-caption': 'off',
      'jsx-a11y/no-autofocus': 'off',

      // Sofort scharf: eindeutig falsch, kein Ermessensspielraum.
      'react-native-a11y/has-valid-accessibility-role': 'error',
      'react-native-a11y/has-valid-accessibility-state': 'error',
      'react-native-a11y/has-valid-accessibility-value': 'error',
      'react-native-a11y/has-valid-accessibility-actions': 'error',
      'react-native-a11y/no-nested-touchables': 'error',

      // Waren als Arbeitsliste für Welle 4 auf 'warn' (295 Fundstellen in 108
      // Dateien). Welle 4 ist abgetragen, die Zahl steht auf 0 — eine Regel,
      // die danach auf 'warn' stehen bleibt, schützt nichts mehr: sie meldet
      // den nächsten Neuzugang, ohne ihn aufzuhalten.
      'react-native-a11y/has-accessibility-props': 'error',
      'react-native-a11y/has-valid-accessibility-descriptors': 'error',

      // Bewusst AUS: `accessibilityHint` ist laut Apple HIG die Ausnahme, nicht
      // die Regel — ein Hint auf jedem Element macht VoiceOver geschwätzig,
      // nicht barrierefreier. WCAG verlangt ihn nirgends.
      'react-native-a11y/has-accessibility-hint': 'off',

      // Deprecated RN-APIs (accessibilityComponentType/-Traits/-States) sind in
      // RN 0.86 entfernt; die Regeln würden nur Altcode markieren, den es nicht
      // mehr gibt.
      'react-native-a11y/has-valid-accessibility-component-type': 'off',
      'react-native-a11y/has-valid-accessibility-states': 'off',
      'react-native-a11y/has-valid-accessibility-traits': 'off',
    },
  },
];
