/**
 * components/status-view.tsx — What a screen shows while loading or when
 * something went wrong (e.g. the backend isn't running), with a Retry button.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function StatusView({ loading, error, onRetry }: { loading?: boolean; error?: string | null; onRetry?: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.box}>
      {loading ? <ActivityIndicator color={theme.accent} size="large" /> : null}
      {error ? <Text style={[styles.error, { color: theme.textSecondary }]}>{error}</Text> : null}
      {error && onRetry ? <TextButton label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  error: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
