import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Component, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Function component wrapper: the class ErrorBoundary cannot use hooks.
function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons name="warning-outline" size={48} color={colors.warning} />
      <Text style={[styles.title, { color: theme.text }]}>Etwas ist schiefgelaufen</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>
        {error?.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
      </Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Ionicons name="refresh" size={20} color={colors.white} />
        <Text style={styles.retryText}>Erneut versuchen</Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xlarge,
    gap: spacing.medium,
  },
  title: {
    ...typography.h3,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.medium,
    backgroundColor: colors.primary[600],
    marginTop: spacing.medium,
  },
  retryText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '500',
  },
});
