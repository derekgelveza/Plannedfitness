/**
 * app/_layout.tsx — The root navigator (Expo Router).
 *
 * Every file in src/app/ is a screen, and its path is its URL:
 *   index.tsx            → "/"               Dashboard (Begin + feature circles)
 *   workouts/index.tsx   → "/workouts"       list of workouts + ⊕
 *   workouts/new.tsx     → "/workouts/new"   Create Workout
 *   workouts/[id].tsx    → "/workouts/3"     Edit Workout (the [id] part is a URL parameter)
 *   begin.tsx            → "/begin"          rotary picker ("Begin clicked")
 *   session/[id].tsx     → "/session/3"      live workout for workout 3
 *
 * A Stack navigator means screens slide on top of each other and the ← in
 * our own header pops back. The built-in header is hidden because the
 * wireframes use a custom one (components/screen-header.tsx).
 *
 * (This replaces the Expo template's tab bar — the wireframes have no tabs.)
 */
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = useTheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}>
        {/* The live session shouldn't be closed by an accidental swipe-back on iOS;
            the ← button asks first instead. */}
        <Stack.Screen name="session/[id]" options={{ gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
