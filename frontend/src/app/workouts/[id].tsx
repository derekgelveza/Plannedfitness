/**
 * app/workouts/[id].tsx — EDIT WORKOUT wireframe.
 *
 * The file name's [id] is a URL parameter: opening "/workouts/7" renders
 * this screen with id = "7" (read with useLocalSearchParams).
 *
 * 1. Load the workout.
 * 2. Hand it to the shared WorkoutEditor ("looks the same" as Create).
 * 3. Save → PUT /api/workouts/7 (exercise ids are sent so history is kept).
 *    ⋯ → Delete → DELETE /api/workouts/7.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { api, errorMessage } from '@/api/client';
import type { Workout, WorkoutInput } from '@/api/types';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { StatusView } from '@/components/status-view';
import { WorkoutEditor } from '@/components/workout-editor';

export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(id);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setWorkout(await api.getWorkout(workoutId));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [workoutId]);

  useEffect(() => { void load(); }, [load]);

  const goToList = () => (router.canGoBack() ? router.back() : router.replace('/workouts'));

  if (!workout) {
    return (
      <Screen>
        <ScreenHeader title="Workout" />
        <StatusView loading={!error} error={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <WorkoutEditor
      // `key` forces a fresh editor if a different workout is loaded.
      key={workout.id}
      initial={workout}
      onSave={async (input: WorkoutInput) => { await api.updateWorkout(workout.id, input); goToList(); }}
      onDelete={async () => { await api.deleteWorkout(workout.id); goToList(); }}
    />
  );
}
