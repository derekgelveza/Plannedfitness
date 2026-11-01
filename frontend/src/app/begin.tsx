/**
 * app/begin.tsx — "BEGIN CLICKED" wireframe.
 *
 * Every workout is a circle on a ring. Like a rotary phone, the user drags
 * the ring around until the workout they want sits at the TOP (or taps a
 * circle to spin it there). Tapping the top circle starts that workout.
 *
 * The middle of the ring shows which workout is at the top and what's in it,
 * so the user knows what they're about to start.
 *
 * All the dragging/snapping logic lives in components/rotary-dial.tsx.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Workout } from '@/api/types';
import { PrimaryButton } from '@/components/buttons';
import { RotaryDial } from '@/components/rotary-dial';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { StatusView } from '@/components/status-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWorkouts } from '@/hooks/use-workouts';

export default function BeginScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { workouts, loading, error, reload } = useWorkouts();
  const [activeIndex, setActiveIndex] = useState(0);

  // If a workout was deleted elsewhere, make sure the index still points at something.
  const safeIndex = workouts.length === 0 ? 0 : Math.min(activeIndex, workouts.length - 1);
  const active: Workout | undefined = workouts[safeIndex];

  // Dial geometry, scaled to the screen.
  const box = Math.min(width, MaxContentWidth) - Spacing.four;
  const nodeSize = Math.min(72, box * 0.2);
  const activeNodeSize = nodeSize * 1.35;
  const radius = box / 2 - activeNodeSize / 2 - 4;

  const start = (workout: Workout) => router.push(`/session/${workout.id}`);

  const body = () => {
    if (loading || error) return <StatusView loading={loading} error={error} onRetry={reload} />;
    if (workouts.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No workouts yet</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Create a workout first, then come back here to start it.</Text>
          <PrimaryButton label="Create a workout" onPress={() => router.push('/workouts/new')} />
        </View>
      );
    }
    return (
      <View style={styles.dialArea}>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          {workouts.length > 1 ? 'Turn the dial to choose · tap the top circle to begin' : 'Tap the circle to begin'}
        </Text>
        <RotaryDial
          items={workouts}
          keyOf={(w) => String(w.id)}
          activeIndex={safeIndex}
          onActiveIndexChange={setActiveIndex}
          onPressActive={start}
          accessibilityLabelOf={(w) => w.name}
          width={box}
          height={box}
          radius={radius}
          nodeSize={nodeSize}
          activeNodeSize={activeNodeSize}
          layout="even"
          renderNode={(workout, { isActive, focus, size }) => (
            <View
              style={[
                styles.node,
                {
                  borderRadius: size / 2,
                  // Blend from plain to accent as the node reaches the top.
                  backgroundColor: focus > 0.5 ? theme.accent : theme.backgroundElement,
                  borderColor: focus > 0.5 ? theme.accent : theme.border,
                },
              ]}>
              <Text
                numberOfLines={2}
                adjustsFontSizeToFit
                style={[styles.nodeText, { fontSize: Math.max(10, size * 0.16), color: focus > 0.5 ? theme.accentText : theme.text }]}>
                {workout.name}
              </Text>
              {isActive ? <Text style={[styles.go, { color: theme.accentText }]}>▶</Text> : null}
            </View>
          )}>
          {/* Centre of the ring: details of the workout at the top. */}
          {active ? (
            <View style={styles.centerInfo}>
              <Text style={[styles.centerName, { color: theme.text }]} numberOfLines={2}>{active.name}</Text>
              <Text style={[styles.centerMeta, { color: theme.textSecondary }]}>
                {active.exercises.length} exercise{active.exercises.length === 1 ? '' : 's'} · {active.exercises.reduce((n, e) => n + e.sets, 0)} sets
              </Text>
              {active.exercises.slice(0, 4).map((e) => (
                <Text key={e.id} style={[styles.centerExercise, { color: theme.textSecondary }]} numberOfLines={1}>{e.name}</Text>
              ))}
              {active.exercises.length > 4 ? <Text style={[styles.centerExercise, { color: theme.textFaint }]}>+{active.exercises.length - 4} more</Text> : null}
            </View>
          ) : null}
        </RotaryDial>
      </View>
    );
  };

  return (
    <Screen>
      <ScreenHeader title="Begin" />
      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dialArea: { flex: 1, justifyContent: 'center', gap: Spacing.four, paddingBottom: Spacing.five },
  hint: { textAlign: 'center', fontSize: 14, paddingHorizontal: Spacing.four },
  node: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, padding: 6 },
  nodeText: { fontWeight: '700', textAlign: 'center' },
  go: { fontSize: 10, marginTop: 2 },
  centerInfo: { alignItems: 'center', maxWidth: 170, gap: 2 },
  centerName: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  centerMeta: { fontSize: 13, marginBottom: Spacing.one },
  centerExercise: { fontSize: 13 },
  empty: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  emptyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
