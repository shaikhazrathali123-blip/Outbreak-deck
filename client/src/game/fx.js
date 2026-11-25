// Effects level: 'high' (bloom, vignette pass, film grain) or 'low' (none of the full-screen passes).
// ?fx=low / ?fx=high force it; otherwise phones get 'low' and desktops 'high'.
let cached = null;

export function fxLevel(game) {
  if (cached) return cached;
  const forced = new URLSearchParams(window.location.search).get('fx');
  const phone = game.device.input.touch && !game.device.os.desktop;
  cached = forced === 'low' || forced === 'high' ? forced : phone ? 'low' : 'high';
  return cached;
}

/** The FPS counter only shows in dev builds or with ?fps=1. */
export function showFps() {
  return import.meta.env.DEV || new URLSearchParams(window.location.search).get('fps') === '1';
}
