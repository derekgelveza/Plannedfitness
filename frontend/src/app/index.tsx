/**
 * app/index.tsx — DASHBOARD (first wireframe).
 *
 * A big "Begin" circle in the middle with eight small feature circles around
 * it. Only two are wired up so far:
 *   Begin    → /begin      pick a workout and start it
 *   Workouts → /workouts   create / edit / delete workouts
 * The others (Progress, Nutrition, Move, FAQs, Goals, Mood, Routines) aren't
 * planned yet, so they show a "coming soon" message. To build one, add a
 * screen file in src/app/ and give its entry an `href` below.
 *
 * The circles are positioned with a bit of trigonometry: each one sits on a
 * ring around the centre at angle = index × (360° / 8), starting at the top
 * and going clockwise — the same maths the rotary dial uses.
 */
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useToast } from '@/components/toast';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Order = clockwise from the top, matching the wireframe's positions. */
const FEATURES: Array<{ label: string; href?: Href }> = [
  { label: 'Progress' },
  { label: 'Nutrition' },
  { label: 'Move' },
  { label: 'FAQs' },
  { label: 'Goals' },
  { label: 'Mood' },
  { label: 'Routines' },
  { label: 'Workouts', href: '/workouts' },
];

export default function Dashboard() {
  const theme = useTheme();
  const toast = useToast();
  const { width, height } = useWindowDimensions();

  // Size everything from the screen so it fits small and large phones.
  const box = Math.min(width, MaxContentWidth, height * 0.62) - Spacing.four;
  const small = Math.max(58, box * 0.19);  // feature circle diameter
  const ring = box / 2 - small / 2;        // distance from centre to each feature circle
  const big = ring * 1.15;                 // Begin circle diameter

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={[styles.brand, { color: theme.text }]}>EverythingFitness</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Ready when you are.</Text>
      </View>

      <View style={styles.middle}>
        <View style={{ width: box, height: box }}>
          {/* Begin — the main button */}
          <Pressable
            onPress={() => router.push('/begin')}
            accessibilityRole="button"
            accessibilityLabel="Begin a workout"
            style={({ pressed }) => [
              styles.begin,
              {
                width: big,
                height: big,
                borderRadius: big / 2,
                left: box / 2 - big / 2,
                top: box / 2 - big / 2,
                backgroundColor: theme.accent,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}>
            <Text style={[styles.beginText, { color: theme.accentText, fontSize: big * 0.19 }]}>Begin</Text>
          </Pressable>

          {/* The eight feature circles around it */}
          {FEATURES.map((feature, index) => {
            const angle = (index * 2 * Math.PI) / FEATURES.length; // radians, 0 = top
            const x = box / 2 + ring * Math.sin(angle) - small / 2;
            const y = box / 2 - ring * Math.cos(angle) - small / 2;
            const available = !!feature.href;
            return (
              <Pressable
                key={feature.label}
                onPress={() => (feature.href ? router.push(feature.href) : toast.show(`${feature.label} is coming soon.`))}
                accessibilityRole="button"
                accessibilityLabel={available ? feature.label : `${feature.label}, coming soon`}
                style={({ pressed }) => [
                  styles.feature,
                  {
                    width: small,
                    height: small,
                    borderRadius: small / 2,
                    left: x,
                    top: y,
                    backgroundColor: theme.backgroundElement,
                    borderColor: available ? theme.text : theme.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <Text
                  style={[styles.featureText, { color: available ? theme.text : theme.textSecondary, fontSize: Math.max(10, small * 0.17) }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {feature.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {toast.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.one },
  brand: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 15 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: Spacing.five },
  begin: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5A1F',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  beginText: { fontWeight: '800', letterSpacing: 1 },
  feature: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, paddingHorizontal: 4 },
  featureText: { fontWeight: '600' },
});
