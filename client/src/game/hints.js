// Control hints: shown during your first match, each one only until you have done it once.
// Kept on this device (localStorage).
import { loadProfile } from './profile.js';

const STORE = 'outbreak-deck-hints';
let done = null;

function load() {
  if (done) return done;
  try {
    done = JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    done = {};
  }
  return done;
}

/** Should the hint for `action` ('walk', 'climb', 'map') still show? */
export function needsHint(action) {
  return !load()[action] && loadProfile().matches < 1;
}

/** You did it: never show that hint again. */
export function hintDone(action) {
  const d = load();
  if (d[action]) return;
  d[action] = true;
  try {
    localStorage.setItem(STORE, JSON.stringify(d));
  } catch {
    /* private mode: the hint just comes back next time */
  }
}
