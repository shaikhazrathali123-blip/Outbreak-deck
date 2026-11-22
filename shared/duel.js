// Duel resolution. Pure functions, shared by the client and (later) the server.
//
//   number vs number  -> higher number wins (same number = draw)
//   zombie vs number  -> zombie wins and infects
//   gun    vs zombie  -> gun wins and kills the zombie
//   gun    vs number  -> gun misfires: the number wins
//   gun    vs gun     -> draw
//   zombie vs zombie  -> draw (two infected always get a fake duel: see Match.settleDuel)

/** How a card is shown next to the result, e.g. "7", "ZOMBIE", "BANG", "MISFIRE". */
function label(card, other) {
  if (card.kind === 'number') return String(card.value);
  if (card.kind === 'zombie') return 'ZOMBIE';
  if (card.kind === 'gun') return other.kind === 'zombie' ? 'BANG' : other.kind === 'gun' ? 'GUN' : 'MISFIRE';
  return card.kind.toUpperCase();
}

/**
 * @returns {{ winner: 'a'|'b'|null, kind: 'number'|'infect'|'kill'|'misfire'|'draw', a: {label}, b: {label} }}
 */
export function resolveDuel(cardA, cardB) {
  const out = (winner, kind) => ({ winner, kind, a: { label: label(cardA, cardB) }, b: { label: label(cardB, cardA) } });
  const ka = cardA.kind;
  const kb = cardB.kind;
  if (ka === 'cure' || kb === 'cure') throw new Error("A Cure can't be played in a duel");
  if (ka === kb && ka !== 'number') return out(null, 'draw');
  if (ka === 'gun' && kb === 'zombie') return out('a', 'kill');
  if (kb === 'gun' && ka === 'zombie') return out('b', 'kill');
  if (ka === 'zombie') return out('a', 'infect');
  if (kb === 'zombie') return out('b', 'infect');
  if (ka === 'gun') return out('b', 'misfire');
  if (kb === 'gun') return out('a', 'misfire');
  if (cardA.value === cardB.value) return out(null, 'draw');
  return out(cardA.value > cardB.value ? 'a' : 'b', 'number');
}
