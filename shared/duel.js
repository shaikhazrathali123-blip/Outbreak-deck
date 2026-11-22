// Duel resolution. Pure functions, shared by the client and (later) the server.
// This only compares the two cards; what happens to the players (bites, cures,
// quarantine, who is a zombie) is decided in Match.settleDuel.
//
//   number vs number  -> higher number wins (same number = draw)
//   zombie vs number  -> zombie wins and bites            kind 'infect'
//   gun    vs anything else -> gun wins and kills          kind 'kill'
//   cure   vs zombie  -> cure wins: no bite, zombie cured  kind 'cure'
//   cure   vs number  -> the number wins the duel          kind 'cure-number'
//                        (Match: cures a zombie, wastes the Cure on a human)
//   same kind vs same kind (not numbers) -> draw

/** How a card is shown next to the result, e.g. "7", "ZOMBIE", "BANG", "CURE". */
function label(card) {
  if (card.kind === 'number') return String(card.value);
  if (card.kind === 'gun') return 'BANG';
  return card.kind.toUpperCase();
}

/**
 * @returns {{ winner: 'a'|'b'|null, kind: 'number'|'infect'|'kill'|'cure'|'cure-number'|'draw', a: {label}, b: {label} }}
 */
export function resolveDuel(cardA, cardB) {
  const out = (winner, kind) => ({ winner, kind, a: { label: label(cardA) }, b: { label: label(cardB) } });
  const ka = cardA.kind;
  const kb = cardB.kind;
  if (ka === kb && ka !== 'number') return out(null, 'draw');
  if (ka === 'gun') return out('a', 'kill');
  if (kb === 'gun') return out('b', 'kill');
  if (ka === 'cure' && kb === 'zombie') return out('a', 'cure');
  if (kb === 'cure' && ka === 'zombie') return out('b', 'cure');
  if (ka === 'cure') return out('b', 'cure-number');
  if (kb === 'cure') return out('a', 'cure-number');
  if (ka === 'zombie') return out('a', 'infect');
  if (kb === 'zombie') return out('b', 'infect');
  if (cardA.value === cardB.value) return out(null, 'draw');
  return out(cardA.value > cardB.value ? 'a' : 'b', 'number');
}
