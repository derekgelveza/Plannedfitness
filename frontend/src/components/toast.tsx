/**
 * components/toast.tsx — A short message that slides up from the bottom and
 * disappears on its own ("Coming soon", "Couldn't save: ...").
 *
 * Usage in a screen:
 *   const toast = useToast();
 *   toast.show('Saved!');
 *   ...
 *   return (<>...{toast.element}</>);
 *
 * It's a hook that returns both a `show` function and the element to render,
 * so each screen can have one without any global setup.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const VISIBLE_MS = 2600;

export function useToast() {
  const theme = useTheme();
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: false }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: false }).start(() => setMessage(null));
    }, VISIBLE_MS);
  }, [opacity]);

  // Clear the timer if the screen closes while a toast is showing.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const element = message ? (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          backgroundColor: theme.text,
          opacity,
          transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}>
      <Text style={[styles.text, { color: theme.background }]}>{message}</Text>
    </Animated.View>
  ) : null;

  return { show, element };
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    bottom: Spacing.five,
    alignSelf: 'center',
    maxWidth: 440,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
  },
  text: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
});
