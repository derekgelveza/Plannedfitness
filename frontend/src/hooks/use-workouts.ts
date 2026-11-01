/**
 * hooks/use-workouts.ts — Loads the workout list from the backend and keeps
 * it fresh.
 *
 * useFocusEffect (from Expo Router) runs the load every time the screen comes
 * into view — including when you come BACK to it. So after creating or
 * editing a workout and pressing ←, the list already shows the change.
 *
 * Returns: { workouts, loading, error, reload }
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api, errorMessage } from '@/api/client';
import type { Workout } from '@/api/types';

export function useWorkouts() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setWorkouts(await api.listWorkouts());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // useFocusEffect needs a callback that doesn't return a promise, hence `void`.
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { workouts, loading, error, reload };
}
