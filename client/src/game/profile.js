// v3: your progress on this device (localStorage): total XP, rank, badges.
import { rankFor } from '../../../shared/constants.js';

const STORE = 'outbreak-deck-profile';

export function loadProfile() {
  const base = { xp: 0, matches: 0, wins: 0, badges: {} };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(STORE) ?? '{}') };
  } catch {
    return base;
  }
}

export function saveProfile(p) {
  try {
    localStorage.setItem(STORE, JSON.stringify(p));
  } catch {
    /* private mode: progress just won't be kept */
  }
}

/** Badges earned this match, from your row of the results. */
export function badgesFor(me) {
  const e = me.parts?.earned ?? {};
  const out = [];
  if (e['vote-right'] && me.role === 'human') out.push('Detective');
  if (me.stats.infections >= 2 && !me.accused) out.push('Silent Killer');
  if (e['shot-zombie'] && !e['shot-human']) out.push('Sharpshooter');
  if ((e.part?.count ?? 0) >= 2) out.push('Engineer');
  if (e['call-right']) out.push('Mind Reader');
  if (!me.startedInfected && me.role === 'human' && me.alive && !me.stats.timesBitten) out.push('Survivor');
  return out;
}

/** Add one match to your profile. XP = your score (at least 0) + 50 for a win. */
export function recordMatch(me, youWon) {
  const p = loadProfile();
  const before = rankFor(p.xp);
  const xp = Math.max(0, me.score) + (youWon ? 50 : 0);
  const badges = badgesFor(me);
  p.xp += xp;
  p.matches++;
  if (youWon) p.wins++;
  for (const b of badges) p.badges[b] = (p.badges[b] ?? 0) + 1;
  saveProfile(p);
  const after = rankFor(p.xp);
  return { xp, total: p.xp, rank: after, rankUp: after.index > before.index, badges };
}
