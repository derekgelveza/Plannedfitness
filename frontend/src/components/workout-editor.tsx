/**
 * components/workout-editor.tsx — The Create Workout and Edit Workout screens.
 *
 * The wireframes say Edit "looks the same" as Create, so both screens render
 * this one component:
 *   app/workouts/new.tsx   → <WorkoutEditor onSave={create} />
 *   app/workouts/[id].tsx  → <WorkoutEditor initial={workout} onSave={update} onDelete={remove} />
 *
 * Layout (top to bottom, matching the wireframe):
 *   ← NAME (tap to rename)                Save  [⋯ on edit]
 *   ┌ Exercise: ____ ┐
 *   │ Reps:     ____ │   the form card
 *   │ Sets:     ____ │
 *   └ Timer:    ____ ┘
 *   [      ⊕      ]       "if pressed, exercise is added"
 *   1. Bench Press  3 × 8 · 2 min      ← "they scroll down to see exercises"
 *   2. ...
 *
 * Extra behaviour not drawn in the wireframe but needed to make it usable:
 *   - Tap an exercise in the list to load it back into the form and edit it
 *     (the ⊕ bar turns into "Update exercise").
 *   - ↑ / ↓ reorder, ✕ remove.
 *   - Leaving with unsaved changes asks before throwing them away.
 *   - If the form still has a complete exercise typed in when you press Save,
 *     it's added automatically so you don't lose it.
 */
import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '@/api/client';
import type { Workout, WorkoutInput } from '@/api/types';
import { PrimaryButton, TextButton } from '@/components/buttons';
import { Dialog, Menu } from '@/components/dialog';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * An exercise while it's being edited. `key` is a local-only id so React can
 * track list items before they have a database id. `id` is the database id
 * (only for exercises that were already saved).
 */
type DraftExercise = { key: string; id?: number; name: string; reps: number; sets: number; restTimeMinutes: number };

/** The four text boxes in the form card. Kept as strings while typing. */
type FormFields = { name: string; reps: string; sets: string; rest: string };
const EMPTY_FORM: FormFields = { name: '', reps: '', sets: '', rest: '' };

let keyCounter = 0;
const newKey = () => `draft-${Date.now()}-${keyCounter++}`;

/**
 * Check the form card. Same rules as the backend's WorkoutService.toWorkout()
 * so most mistakes are caught before a network round-trip:
 * name not blank; reps, sets and rest are whole numbers above 0.
 */
function validateForm(form: FormFields): { ok: true; value: Omit<DraftExercise, 'key' | 'id'> } | { ok: false; message: string } {
  const name = form.name.trim();
  if (!name) return { ok: false, message: 'Give the exercise a name.' };
  const fields = [['Reps', form.reps], ['Sets', form.sets], ['Timer', form.rest]] as const;
  const numbers: number[] = [];
  for (const [label, text] of fields) {
    const value = Number(text.trim());
    if (text.trim() === '' || !Number.isInteger(value) || value <= 0) return { ok: false, message: `${label} must be a whole number above 0.` };
    numbers.push(value);
  }
  const [reps = 0, sets = 0, restTimeMinutes = 0] = numbers;
  return { ok: true, value: { name, reps, sets, restTimeMinutes } };
}

/** Saved exercises → editable drafts (empty list when creating). */
function toDrafts(workout?: Workout): DraftExercise[] {
  return workout?.exercises.map((e) => ({ key: `saved-${e.id}`, id: e.id, name: e.name, reps: e.reps, sets: e.sets, restTimeMinutes: e.restTimeMinutes })) ?? [];
}

/** True if any box in the form has something typed in it. */
const formHasInput = (form: FormFields) => Object.values(form).some((v) => v.trim() !== '');

type WorkoutEditorProps = {
  /** Existing workout to edit. Omit for "create". */
  initial?: Workout;
  /** Saves to the backend. Throw to show an error; resolve to leave the screen. */
  onSave: (input: WorkoutInput) => Promise<void>;
  /** Edit mode only — shown in the ⋯ menu. */
  onDelete?: () => Promise<void>;
};

export function WorkoutEditor({ initial, onSave, onDelete }: WorkoutEditorProps) {
  const theme = useTheme();
  const toast = useToast();

  const [name, setName] = useState(initial?.name ?? '');
  const [exercises, setExercises] = useState<DraftExercise[]>(() => toDrafts(initial));
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  /** Key of the list item currently loaded into the form (null = adding a new one). */
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'leave' | 'delete'>(null);
  const nameInput = useRef<ComponentRef<typeof TextInput>>(null);

  // "Dirty" = something differs from what was loaded. Compared as JSON
  // (ignoring the local keys) so editing a value and changing it back counts
  // as clean again.
  const snapshot = (n: string, list: DraftExercise[]) => JSON.stringify([n.trim(), list.map(({ key: _key, ...rest }) => rest)]);
  const initialSnapshot = useMemo(() => snapshot(initial?.name ?? '', toDrafts(initial)), [initial]);
  const dirty = snapshot(name, exercises) !== initialSnapshot || formHasInput(form);

  const update = (field: keyof FormFields) => (text: string) => setForm((f) => ({ ...f, [field]: text }));

  /** The ⊕ bar: add the form as a new exercise, or apply edits to the one being edited. */
  const submitForm = () => {
    const result = validateForm(form);
    if (!result.ok) { toast.show(result.message); return; }
    if (editingKey) {
      setExercises((list) => list.map((e) => (e.key === editingKey ? { ...e, ...result.value } : e)));
    } else {
      setExercises((list) => [...list, { key: newKey(), ...result.value }]);
    }
    setForm(EMPTY_FORM);
    setEditingKey(null);
    nameInput.current?.focus(); // ready for the next exercise
  };

  /** Tap a list item → copy it into the form for editing. */
  const startEditing = (exercise: DraftExercise) => {
    setEditingKey(exercise.key);
    setForm({ name: exercise.name, reps: String(exercise.reps), sets: String(exercise.sets), rest: String(exercise.restTimeMinutes) });
  };

  const cancelEditing = () => { setEditingKey(null); setForm(EMPTY_FORM); };

  /** Move an exercise up (-1) or down (+1) in the list. */
  const move = (index: number, direction: -1 | 1) => {
    setExercises((list) => {
      const target = index + direction;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      const [item] = copy.splice(index, 1);
      if (item) copy.splice(target, 0, item);
      return copy;
    });
  };

  const remove = (key: string) => {
    setExercises((list) => list.filter((e) => e.key !== key));
    if (editingKey === key) cancelEditing();
  };

  const save = async () => {
    // Include a finished-but-not-added exercise from the form automatically.
    let list = exercises;
    if (formHasInput(form)) {
      const result = validateForm(form);
      if (!result.ok) { toast.show(`Finish or clear the exercise form first: ${result.message}`); return; }
      list = editingKey ? exercises.map((e) => (e.key === editingKey ? { ...e, ...result.value } : e)) : [...exercises, { key: newKey(), ...result.value }];
    }
    if (!name.trim()) { toast.show('Tap NAME at the top to name your workout.'); return; }
    if (list.length === 0) { toast.show('Add at least one exercise with the + button.'); return; }

    setSaving(true);
    try {
      // Strip the local `key`; keep `id` only when it exists (edit mode).
      await onSave({
        name: name.trim(),
        exercises: list.map((e) => ({ ...(e.id !== undefined ? { id: e.id } : {}), name: e.name, reps: e.reps, sets: e.sets, restTimeMinutes: e.restTimeMinutes })),
      });
    } catch (error) {
      toast.show(errorMessage(error));
      setSaving(false);
    }
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/workouts'));
  const onBack = () => (dirty ? setConfirm('leave') : leave());

  const deleteWorkout = async () => {
    setConfirm(null);
    try { await onDelete?.(); } catch (error) { toast.show(errorMessage(error)); }
  };

  return (
    <Screen>
      <ScreenHeader
        title={name}
        onTitleChange={setName}
        onBack={onBack}
        right={
          <View style={styles.headerRight}>
            <TextButton label="Save" onPress={save} disabled={saving} />
            {onDelete ? (
              <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="More options">
                <Text style={[styles.dots, { color: theme.text }]}>⋯</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />

      {/* Pushes the content up when the keyboard opens on iOS (Android does this by itself). */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* ── The form card ── */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <FormRow label="Exercise">
              <TextInput
                ref={nameInput}
                value={form.name}
                onChangeText={update('name')}
                placeholder="Name"
                placeholderTextColor={theme.textFaint}
                style={[styles.input, { color: theme.text }]}
                returnKeyType="next"
                accessibilityLabel="Exercise name"
              />
            </FormRow>
            <FormRow label="Reps">
              <NumberInput value={form.reps} onChangeText={update('reps')} placeholder="10" label="Reps per set" />
            </FormRow>
            <FormRow label="Sets">
              <NumberInput value={form.sets} onChangeText={update('sets')} placeholder="3" label="Number of sets" />
            </FormRow>
            <FormRow label="Timer" last suffix="min rest">
              <NumberInput value={form.rest} onChangeText={update('rest')} placeholder="2" label="Rest between sets in minutes" onSubmit={submitForm} />
            </FormRow>
          </View>

          {/* ── The ⊕ bar ── */}
          <Pressable
            onPress={submitForm}
            accessibilityRole="button"
            accessibilityLabel={editingKey ? 'Update exercise' : 'Add exercise'}
            style={({ pressed }) => [styles.addBar, { borderColor: theme.accent, backgroundColor: pressed ? theme.accentSoft : 'transparent' }]}>
            <Text style={[styles.addBarText, { color: theme.accent }]}>{editingKey ? '✓  Update exercise' : '+'}</Text>
          </Pressable>
          {editingKey ? <TextButton label="Cancel edit" onPress={cancelEditing} color={theme.textSecondary} /> : null}

          {/* ── Exercises added so far ── */}
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            {exercises.length === 0 ? 'Exercises you add will appear here' : `Exercises (${exercises.length})`}
          </Text>
          {exercises.map((exercise, index) => (
            // The row is a plain View holding two kinds of buttons side by side
            // (a button inside a button isn't allowed on the web).
            <View
              key={exercise.key}
              style={[
                styles.item,
                { backgroundColor: theme.backgroundElement, borderColor: exercise.key === editingKey ? theme.accent : theme.border },
              ]}>
              <Pressable onPress={() => startEditing(exercise)} accessibilityRole="button" accessibilityLabel={`Edit ${exercise.name}`} style={styles.flex}>
                <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>{index + 1}. {exercise.name}</Text>
                <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                  {exercise.sets} × {exercise.reps} reps · {exercise.restTimeMinutes} min rest
                </Text>
              </Pressable>
              <IconButton glyph="↑" label="Move up" onPress={() => move(index, -1)} disabled={index === 0} />
              <IconButton glyph="↓" label="Move down" onPress={() => move(index, 1)} disabled={index === exercises.length - 1} />
              <IconButton glyph="✕" label={`Remove ${exercise.name}`} onPress={() => remove(exercise.key)} />
            </View>
          ))}

          {exercises.length > 0 ? <PrimaryButton label="Save workout" onPress={save} busy={saving} style={styles.saveButton} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Menu visible={menuOpen} onDismiss={() => setMenuOpen(false)} items={[{ label: 'Delete workout', kind: 'destructive', onPress: () => setConfirm('delete') }]} />

      <Dialog
        visible={confirm === 'leave'}
        title="Discard changes?"
        message="You have changes that haven't been saved."
        onDismiss={() => setConfirm(null)}
        actions={[
          { label: 'Save', kind: 'primary', onPress: () => { setConfirm(null); void save(); } },
          { label: 'Discard', kind: 'destructive', onPress: () => { setConfirm(null); leave(); } },
          { label: 'Keep editing', onPress: () => setConfirm(null) },
        ]}
      />
      <Dialog
        visible={confirm === 'delete'}
        title={`Delete "${initial?.name ?? 'workout'}"?`}
        message="The workout is removed. Your past sessions stay in your history."
        onDismiss={() => setConfirm(null)}
        actions={[
          { label: 'Delete', kind: 'destructive', onPress: () => void deleteWorkout() },
          { label: 'Cancel', onPress: () => setConfirm(null) },
        ]}
      />
      {toast.element}
    </Screen>
  );
}

// ---- Small pieces used only by the editor -------------------------------

/** One "Label:  [input]" line of the form card. */
function FormRow({ label, children, last, suffix }: { label: string; children: ReactNode; last?: boolean; suffix?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{label}:</Text>
      <View style={styles.flex}>{children}</View>
      {suffix ? <Text style={[styles.suffix, { color: theme.textSecondary }]}>{suffix}</Text> : null}
    </View>
  );
}

/** A text box that brings up the number keyboard and drops anything that isn't a digit. */
function NumberInput({ value, onChangeText, placeholder, label, onSubmit }: { value: string; onChangeText: (t: string) => void; placeholder: string; label: string; onSubmit?: () => void }) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, ''))}
      keyboardType="number-pad"
      placeholder={placeholder}
      placeholderTextColor={theme.textFaint}
      style={[styles.input, { color: theme.text }]}
      maxLength={3}
      accessibilityLabel={label}
      returnKeyType="done"
      onSubmitEditing={onSubmit}
    />
  );
}

function IconButton({ glyph, label, onPress, disabled }: { glyph: string; label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.25 : pressed ? 0.5 : 1 }]}>
      <Text style={[styles.iconGlyph, { color: theme.textSecondary }]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dots: { fontSize: 24, lineHeight: 26, fontWeight: '700' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { borderRadius: 18, borderWidth: 1.5, paddingHorizontal: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: Spacing.two },
  rowLabel: { width: 78, fontSize: 15, fontWeight: '600' },
  input: { fontSize: 17, paddingVertical: Spacing.two },
  suffix: { fontSize: 14 },
  addBar: { height: 52, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  addBarText: { fontSize: 26, fontWeight: '600' },
  sectionTitle: { marginTop: Spacing.two, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  item: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingLeft: Spacing.three, paddingRight: Spacing.one, gap: Spacing.one },
  itemName: { fontSize: 16, fontWeight: '600' },
  itemMeta: { fontSize: 13, marginTop: 2 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 17, fontWeight: '600' },
  saveButton: { marginTop: Spacing.three },
});
