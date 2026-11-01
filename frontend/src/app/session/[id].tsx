/**
 * app/session/[id].tsx — "WHEN WORKOUT CREATED" wireframe: the live workout.
 *
 * Opened from the Begin screen as /session/<workoutId>.
 *
 *   ←        BENCH PRESS        Finish     ← NAME = the exercise at the top of the dial
 *   Push Day · 4 / 12 sets  ▓▓▓░░░░░
 *
 *              ╭─────────╮
 *              │ SET 2/3 │                 ← the BIG node = exercise you're on
 *              │ 135 × 8 │                    grey numbers = last time's values
 *              ╰─────────╯                    tap a number to type this session's value
 *          ○                 ○
 *        ○                     ○          ← the other exercises (small nodes)
 *           ○      ○      ○                  drag the ring like a rotary phone,
 *                                            or tap one to bring it to the top
 *   Rest 1:24                    Skip
 *   [            Log set 2            ]
 *
 * ─── Flow ──────────────────────────────────────────────────────────────────
 *  1. Load the workout and the "previous performance" (last time's sets).
 *  2. Nothing is created on the server until the FIRST set is logged. Then
 *     POST /api/workouts/:id/sessions creates the session (ensureSession).
 *     So opening a workout and backing out leaves no empty session behind.
 *  3. Log set → POST /api/sessions/:sid/sets. Then:
 *       - more sets left on this exercise → start the rest timer
 *       - exercise finished → rest timer + spin to the next unfinished exercise
 *       - whole workout finished → "Workout complete" dialog
 *  4. Finish → POST /api/sessions/:sid/complete → back to the dashboard.
 *     ← with sets logged → choose Save / Discard (DELETE the session) / Keep going.
 *
 * Empty boxes are allowed: pressing Log set with nothing typed uses the grey
 * (previous) numbers, so repeating last time's set is a single tap.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';

import { api, errorMessage } from '@/api/client';
import type { Exercise, PreviousPerformance, PreviousSet, Workout } from '@/api/types';
import { PrimaryButton, TextButton } from '@/components/buttons';
import { Dialog, type DialogAction } from '@/components/dialog';
import { RotaryDial } from '@/components/rotary-dial';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { StatusView } from '@/components/status-view';
import { useToast } from '@/components/toast';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  currentSetNumber,
  formatSeconds,
  formatWeight,
  initials,
  isExerciseDone,
  isWorkoutDone,
  loggedFor,
  nextIncompleteIndex,
  parseSetInput,
  previousFor,
  totals,
  withLoggedSet,
  type SessionProgress,
} from '@/lib/session';

/** What's typed in the big node's two boxes, per exercise id. */
type Inputs = Record<number, { weight: string; reps: string }>;

/** Which pop-up is open. */
type DialogKind = null | 'leave' | 'finishEarly' | 'complete';

export default function SessionScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(id);

  // ---- Data from the server ---------------------------------------------
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [previous, setPrevious] = useState<PreviousPerformance[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      // Load both at once; Promise.all waits for both to finish.
      const [w, p] = await Promise.all([api.getWorkout(workoutId), api.getPrevious(workoutId)]);
      if (w.exercises.length === 0) throw new Error('This workout has no exercises yet. Add some from Workouts first.');
      setWorkout(w);
      setPrevious(p);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [workoutId]);

  useEffect(() => { void load(); }, [load]);

  // ---- Session state ------------------------------------------------------
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState<SessionProgress>({});
  const [inputs, setInputs] = useState<Inputs>({});
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);

  // Rest timer: the moment rest ends (ms since 1970), or null when not resting.
  // `now` is bumped 4× a second while resting so the countdown re-renders.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (restEndsAt === null) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= restEndsAt) {
        setRestEndsAt(null);
        // Buzz the phone so the user knows rest is over (no-op on web).
        if (Platform.OS !== 'web') Vibration.vibrate(400);
      }
    }, 250);
    return () => clearInterval(timer); // stop ticking when rest ends or the screen closes
  }, [restEndsAt]);

  // The server-side session is created lazily, the first time a set is logged.
  // We keep the PROMISE (not just the id) so two quick taps can't create two sessions.
  const sessionRef = useRef<Promise<number> | null>(null);
  const hasSession = () => sessionRef.current !== null;
  const ensureSession = () => {
    if (!sessionRef.current) {
      sessionRef.current = api.startSession(workoutId).then((s) => s.sessionId);
      // If starting failed, forget the failed promise so the next tap retries.
      sessionRef.current.catch(() => { sessionRef.current = null; });
    }
    return sessionRef.current;
  };

  // ---- Derived values -----------------------------------------------------
  const exercises = workout?.exercises ?? [];
  const active: Exercise | undefined = exercises[Math.min(activeIndex, exercises.length - 1)];
  const [doneSets, totalSets] = workout ? totals(workout, progress) : [0, 0];
  const anyLogged = doneSets > 0 || Object.keys(progress).length > 0;

  /**
   * The grey placeholder numbers for an exercise's current set:
   *  1. the same set from last time, if there is a last time;
   *  2. otherwise the set you just did in THIS session (handy for set 2, 3...);
   *  3. otherwise nothing (first time ever) — the boxes show "—".
   */
  const hintFor = useCallback((exercise: Exercise): { set?: PreviousSet; source: 'last time' | 'last set' | 'none' } => {
    const fromHistory = previousFor(previous, exercise, currentSetNumber(progress, exercise));
    if (fromHistory) return { set: fromHistory, source: 'last time' };
    const logged = loggedFor(progress, exercise);
    const last = logged[logged.length - 1];
    if (last) return { set: last, source: 'last set' };
    return { source: 'none' };
  }, [previous, progress]);

  // ---- Actions ------------------------------------------------------------
  const setInput = (exerciseId: number, field: 'weight' | 'reps', text: string) =>
    setInputs((all) => ({ ...all, [exerciseId]: { ...(all[exerciseId] ?? { weight: '', reps: '' }), [field]: text } }));

  const logSet = async () => {
    if (!workout || !active || saving) return;
    if (isExerciseDone(progress, active)) return;
    Keyboard.dismiss();

    const setNumber = currentSetNumber(progress, active);
    const typed = inputs[active.id] ?? { weight: '', reps: '' };
    const parsed = parseSetInput(typed.weight, typed.reps, hintFor(active).set, active.reps);
    if (!parsed.ok) { toast.show(parsed.message); return; }

    setSaving(true);
    try {
      const sessionId = await ensureSession();
      await api.logSet(sessionId, { exerciseId: active.id, exerciseName: active.name, setNumber, weight: parsed.weight, reps: parsed.reps });
    } catch (e) {
      toast.show(`Couldn't save that set: ${errorMessage(e)}`);
      setSaving(false);
      return;
    }
    setSaving(false);

    // Saved — update local state.
    const next = withLoggedSet(progress, active, { setNumber, weight: parsed.weight, reps: parsed.reps });
    setProgress(next);
    setInputs((all) => ({ ...all, [active.id]: { weight: '', reps: '' } }));

    if (isWorkoutDone(workout, next)) {
      setRestEndsAt(null);
      setDialog('complete');
      return;
    }
    // Rest before the next set (the backend stores rest in whole minutes).
    const restMs = active.restTimeMinutes * 60_000;
    setNow(Date.now());
    setRestEndsAt(Date.now() + restMs);
    // Finished this exercise? Spin the dial to the next one that isn't done.
    if (isExerciseDone(next, active)) {
      const nextIndex = nextIncompleteIndex(workout, next, activeIndex);
      if (nextIndex >= 0) setActiveIndex(nextIndex);
    }
  };

  /** Save the session as finished and go home. */
  const finish = async () => {
    setDialog(null);
    try {
      if (hasSession()) await api.completeSession(await ensureSession());
      router.dismissTo('/'); // pops Begin + this screen, back to the dashboard
    } catch (e) {
      toast.show(`Couldn't finish: ${errorMessage(e)}`);
    }
  };

  /** Throw the session away (server deletes it and its sets) and go back. */
  const discard = async () => {
    setDialog(null);
    try {
      if (hasSession()) await api.discardSession(await ensureSession());
    } catch {
      // Even if discarding fails, let the user leave; an unfinished session is harmless.
    }
    if (router.canGoBack()) router.back(); else router.replace('/');
  };

  const onBack = () => (anyLogged ? setDialog('leave') : router.canGoBack() ? router.back() : router.replace('/'));
  const onFinishPressed = () => {
    if (!anyLogged) { toast.show('Log at least one set first — or use ← to leave.'); return; }
    setDialog(workout && isWorkoutDone(workout, progress) ? 'complete' : 'finishEarly');
  };

  // ---- Dial geometry (see the maths note in components/rotary-dial.tsx) ---
  const geometry = useMemo(() => {
    const box = Math.min(width, MaxContentWidth) - Spacing.three;
    const nodeSize = 54;
    const big = Math.min(236, (box - nodeSize - Spacing.three) / 1.2); // big node diameter
    const radius = big * 0.6;              // ring radius: big node at the top, small ones around the bottom
    const centerY = radius + big / 2 + 4;  // leave room for the big node above the ring centre
    const height = centerY + radius + nodeSize / 2 + 8;
    return { box, nodeSize, big, radius, centerY, height };
  }, [width]);

  // ---- Render ------------------------------------------------------------
  if (!workout || !active) {
    return (
      <Screen>
        <ScreenHeader title="Workout" />
        <StatusView loading={!loadError} error={loadError} onRetry={load} />
      </Screen>
    );
  }

  const activeDone = isExerciseDone(progress, active);
  const resting = restEndsAt !== null;
  const restLeft = resting ? (restEndsAt - now) / 1000 : 0;

  /** Draws one exercise node. The top one gets the full set editor. */
  const renderNode = (exercise: Exercise, info: { isActive: boolean; focus: number; size: number }) => {
    const done = isExerciseDone(progress, exercise);
    const logged = loggedFor(progress, exercise).length;

    // Small (or still-growing) node: initials + "1/3".
    if (!info.isActive || info.focus < 0.9) {
      return (
        <View
          style={[
            styles.smallNode,
            {
              borderRadius: info.size / 2,
              backgroundColor: done ? theme.accentSoft : theme.backgroundElement,
              borderColor: done ? theme.accent : theme.border,
            },
          ]}>
          <Text style={[styles.smallInitials, { color: theme.text, fontSize: Math.max(12, info.size * 0.26) }]}>{done ? '✓' : initials(exercise.name)}</Text>
          <Text style={[styles.smallCount, { color: theme.textSecondary }]}>{logged}/{exercise.sets}</Text>
        </View>
      );
    }

    // Big node: set number, the two tappable numbers, and last time's values.
    const setNumber = currentSetNumber(progress, exercise);
    const hint = hintFor(exercise);
    const typed = inputs[exercise.id] ?? { weight: '', reps: '' };
    const numberSize = Math.round(info.size * 0.17);
    // The inputs get explicit widths below (weight fits ~5 characters, reps ~3).
    // Without one, a web <input> defaults to ~20 characters wide and overflows the circle.

    return (
      <View style={[styles.bigNode, { borderRadius: info.size / 2, borderColor: theme.accent, backgroundColor: theme.backgroundElement }]}>
        {done ? (
          <>
            <Text style={[styles.bigLabel, { color: theme.accent }]}>DONE ✓</Text>
            {loggedFor(progress, exercise).map((s) => (
              <Text key={s.setNumber} style={[styles.doneLine, { color: theme.textSecondary }]}>
                Set {s.setNumber}: {formatWeight(s.weight)} × {s.reps}
              </Text>
            ))}
          </>
        ) : (
          <>
            <Text style={[styles.bigLabel, { color: theme.textSecondary }]}>SET {setNumber} OF {exercise.sets}</Text>
            <View style={styles.numbers}>
              <View style={styles.numberColumn}>
                {/* Placeholder = the grey "previous" value. Typing replaces it. */}
                <TextInput
                  value={typed.weight}
                  onChangeText={(t) => setInput(exercise.id, 'weight', t.replace(/[^0-9.,]/g, ''))}
                  placeholder={hint.set ? formatWeight(hint.set.weight) : '—'}
                  placeholderTextColor={theme.textFaint}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  maxLength={6}
                  accessibilityLabel={`Weight for set ${setNumber}`}
                  style={[styles.numberInput, { color: theme.text, fontSize: numberSize, width: numberSize * 2.3, borderBottomColor: theme.border }]}
                />
                <Text style={[styles.unit, { color: theme.textSecondary }]}>weight</Text>
              </View>
              <Text style={[styles.times, { color: theme.textFaint, fontSize: numberSize * 0.6 }]}>×</Text>
              <View style={styles.numberColumn}>
                <TextInput
                  value={typed.reps}
                  onChangeText={(t) => setInput(exercise.id, 'reps', t.replace(/[^0-9]/g, ''))}
                  placeholder={String(hint.set?.reps ?? exercise.reps)}
                  placeholderTextColor={theme.textFaint}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  maxLength={3}
                  accessibilityLabel={`Reps for set ${setNumber}`}
                  style={[styles.numberInput, { color: theme.text, fontSize: numberSize, width: numberSize * 1.5, borderBottomColor: theme.border }]}
                />
                <Text style={[styles.unit, { color: theme.textSecondary }]}>reps</Text>
              </View>
            </View>
            <Text style={[styles.hint, { color: theme.textFaint }]}>
              {hint.source === 'last time' ? 'grey = last time' : hint.source === 'last set' ? 'grey = your last set' : `goal ${exercise.reps} reps`}
            </Text>
          </>
        )}
      </View>
    );
  };

  const dialogs: Record<Exclude<DialogKind, null>, { title: string; message: string; actions: DialogAction[] }> = {
    complete: {
      title: 'Workout complete 🎉',
      message: `${workout.name}: all ${totalSets} sets logged.`,
      actions: [
        { label: 'Save & finish', kind: 'primary', onPress: () => void finish() },
        { label: 'Not yet', onPress: () => setDialog(null) },
      ],
    },
    finishEarly: {
      title: 'Finish early?',
      message: `You've logged ${doneSets} of ${totalSets} sets. Your logged sets will be saved.`,
      actions: [
        { label: 'Finish & save', kind: 'primary', onPress: () => void finish() },
        { label: 'Keep going', onPress: () => setDialog(null) },
      ],
    },
    leave: {
      title: 'Leave this workout?',
      message: `You've logged ${doneSets} set${doneSets === 1 ? '' : 's'}.`,
      actions: [
        { label: 'Finish & save', kind: 'primary', onPress: () => void finish() },
        { label: 'Discard workout', kind: 'destructive', onPress: () => void discard() },
        { label: 'Keep going', onPress: () => setDialog(null) },
      ],
    },
  };
  const openDialog = dialog ? dialogs[dialog] : null;

  return (
    <Screen>
      <ScreenHeader title={active.name} onBack={onBack} right={<TextButton label="Finish" onPress={onFinishPressed} />} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ScrollView (with scrolling off) lets taps outside the inputs close the keyboard. */}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" scrollEnabled={false}>
          {/* Progress line under the header */}
          <View style={styles.progressRow}>
            <Text style={[styles.progressText, { color: theme.textSecondary }]} numberOfLines={1}>
              {workout.name} · {doneSets} / {totalSets} sets
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${totalSets === 0 ? 0 : (doneSets / totalSets) * 100}%` }]} />
            </View>
          </View>

          <RotaryDial
            items={exercises}
            keyOf={(e) => String(e.id)}
            activeIndex={activeIndex}
            onActiveIndexChange={(i) => { Keyboard.dismiss(); setActiveIndex(i); }}
            accessibilityLabelOf={(e) => `${e.name}, ${loggedFor(progress, e).length} of ${e.sets} sets done`}
            renderNode={renderNode}
            width={geometry.box}
            height={geometry.height}
            centerY={geometry.centerY}
            radius={geometry.radius}
            nodeSize={geometry.nodeSize}
            activeNodeSize={geometry.big}
            layout="focus"
            focusGapDegrees={exercises.length > 6 ? 70 : 76}
          />

          {/* Rest timer bar (only while resting) */}
          <View style={[styles.restRow, { backgroundColor: resting ? theme.backgroundElement : 'transparent', borderColor: resting ? theme.border : 'transparent' }]}>
            {resting ? (
              <>
                <Text style={[styles.restText, { color: theme.text }]}>Rest <Text style={styles.restTime}>{formatSeconds(restLeft)}</Text></Text>
                <TextButton label="Skip" onPress={() => setRestEndsAt(null)} />
              </>
            ) : null}
          </View>

          {activeDone ? (
            <PrimaryButton
              label={isWorkoutDone(workout, progress) ? 'Finish workout' : 'Next exercise'}
              onPress={() => {
                if (isWorkoutDone(workout, progress)) { setDialog('complete'); return; }
                const nextIndex = nextIncompleteIndex(workout, progress, activeIndex);
                if (nextIndex >= 0) setActiveIndex(nextIndex);
              }}
            />
          ) : (
            <PrimaryButton label={`Log set ${currentSetNumber(progress, active)}`} onPress={() => void logSet()} busy={saving} />
          )}

          {/* Little legend for first-time users. */}
          <Pressable onPress={Keyboard.dismiss} accessible={false}>
            <Text style={[styles.footnote, { color: theme.textFaint }]}>
              Tap a number to change it · leave it grey to repeat it · spin the ring to switch exercise
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Dialog
        visible={openDialog !== null}
        title={openDialog?.title ?? ''}
        message={openDialog?.message}
        actions={openDialog?.actions ?? []}
        onDismiss={() => setDialog(null)}
      />
      {toast.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three, flexGrow: 1 },
  progressRow: { gap: 6 },
  progressText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  smallNode: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  smallInitials: { fontWeight: '800' },
  smallCount: { fontSize: 10, fontWeight: '600' },
  bigNode: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 3, paddingHorizontal: Spacing.three, gap: 4 },
  bigLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  numbers: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  numberColumn: { alignItems: 'center' },
  numberInput: { fontWeight: '800', textAlign: 'center', paddingVertical: 2, borderBottomWidth: 1, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  times: { fontWeight: '600', marginBottom: 18 },
  hint: { fontSize: 11 },
  doneLine: { fontSize: 13 },
  restRow: { minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three },
  restText: { fontSize: 16, fontWeight: '600' },
  restTime: { fontVariant: ['tabular-nums'], fontWeight: '800' },
  footnote: { fontSize: 12, textAlign: 'center', lineHeight: 17, paddingBottom: Spacing.three },
});
