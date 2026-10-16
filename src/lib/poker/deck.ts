export type Suit = "s" | "h" | "d" | "c"
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A"
export type Card = `${Rank}${Suit}`

const RANKS: Rank[] = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"]
const SUITS: Suit[] = ["s","h","d","c"]

export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}` as Card)
    }
  }
  return deck
}

// Uniform integer in [0, n) from the CSPRNG. Math.random's internal state can be
// reconstructed from enough observed output, which would make future decks predictable.
function randomInt(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n // reject the tail to avoid modulo bias
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % n
}

export function shuffle(deck: Card[]): Card[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank)
}

export function parseCard(card: Card): { rank: Rank; suit: Suit } {
  return { rank: card[0] as Rank, suit: card[1] as Suit }
}
