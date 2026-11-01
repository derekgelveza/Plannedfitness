/**
 * app/workouts/new.tsx — CREATE WORKOUT wireframe.
 *
 * All the UI is in components/workout-editor.tsx (shared with Edit).
 * This screen only says what "Save" means here: POST a new workout, then
 * go back to the Workouts list (which reloads itself when it reappears).
 */
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { WorkoutInput } from '@/api/types';
import { WorkoutEditor } from '@/components/workout-editor';

export default function CreateWorkoutScreen() {
  const save = async (input: WorkoutInput) => {
    await api.createWorkout(input); // throws on error → the editor shows the message
    if (router.canGoBack()) router.back();
    else router.replace('/workouts');
  };

  return <WorkoutEditor onSave={save} />;
}
