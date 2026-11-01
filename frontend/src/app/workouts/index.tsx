/**
 * app/workouts/index.tsx — WORKOUTS wireframe.
 *
 *   ←  WORKOUTS
 *   1. Name          tap a row → Edit Workout   ("when clicked, it lets them edit")
 *   2. Name
 *   3. Name
 *                 ⊕  → Create Workout
 *
 * With no workouts the page is empty apart from a short hint and the ⊕.
 */
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { FloatingAddButton } from '@/components/buttons';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { StatusView } from '@/components/status-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWorkouts } from '@/hooks/use-workouts';

export default function WorkoutsScreen() {
  const theme = useTheme();
  const { workouts, loading, error, reload } = useWorkouts();

  return (
    <Screen>
      <ScreenHeader title="Workouts" />

      {loading || error ? (
        <StatusView loading={loading} error={error} onRetry={reload} />
      ) : (
        // FlatList only renders the rows that are on screen, so it stays fast with long lists.
        <FlatList
          data={workouts}
          keyExtractor={(w) => String(w.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={[styles.empty, { color: theme.textFaint }]}>No workouts yet. Tap + to create one.</Text>}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => router.push(`/workouts/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.name}`}
              style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
              <Text style={[styles.number, { color: theme.textSecondary }]}>{index + 1}.</Text>
              <View style={styles.rowText}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.exercises.length} exercise{item.exercises.length === 1 ? '' : 's'} · {item.exercises.map((e) => e.name).join(', ')}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: theme.textFaint }]}>›</Text>
            </Pressable>
          )}
        />
      )}

      <FloatingAddButton label="Create workout" onPress={() => router.push('/workouts/new')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.three, paddingBottom: 120 },
  empty: { marginTop: Spacing.six, textAlign: 'center', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  number: { fontSize: 18, fontWeight: '700', width: 28 },
  rowText: { flex: 1 },
  name: { fontSize: 18, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 2 },
  chevron: { fontSize: 26 },
});
