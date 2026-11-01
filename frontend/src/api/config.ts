/**
 * api/config.ts — Works out the backend's URL.
 *
 * The backend (Module1, `npm start`) listens on port 3000 of YOUR COMPUTER.
 * How the app reaches "your computer" depends on where the app is running:
 *
 *   Web browser (npx expo start --web)  → same machine, so the page's own
 *                                         hostname works (usually localhost)
 *   Phone with Expo Go on your Wi-Fi    → your computer's LAN IP. Expo already
 *                                         knows it: it's the host in
 *                                         Constants.expoConfig.hostUri
 *                                         (e.g. "192.168.1.20:8081")
 *   Android emulator                    → 10.0.2.2 is the emulator's alias
 *                                         for the host computer
 *   iOS simulator                       → localhost
 *
 * To override all of that, create frontend/.env with
 *   EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
 * (Expo inlines any EXPO_PUBLIC_* variable at build time; restart
 * `npx expo start` after changing it.)
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 3000;

function guessApiUrl(): string {
  // 1. Explicit override always wins.
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, ''); // strip trailing slashes

  // 2. Web: talk to the same host the page was loaded from.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }

  // 3. Expo Go / dev build: reuse the dev server's host (your computer's IP).
  const hostUri = Constants.expoConfig?.hostUri; // "192.168.1.20:8081"
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;

  // 4. Last resort for emulators/simulators.
  return Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`;
}

/** e.g. "http://192.168.1.20:3000" — no trailing slash. */
export const API_URL = guessApiUrl();
