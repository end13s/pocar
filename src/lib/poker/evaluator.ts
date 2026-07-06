import { Card, Rank, Suit, rankValue, parseCard } from "./deck"

export type HandRank =
  | "Royal Flush"
  | "Straight Flush"
  | "Four of a Kind"
  | "Full House"
  | "Flush"
  | "Straight"
  | "Three of a Kind"
  | "Two Pair"
  | "One Pair"
  | "High Card"

export interface HandResult {
  rank: HandRank
  score: number   // higher = better, for comparison
  description: string
  bestFive: Card[]
}

const HAND_SCORES: Record<HandRank, number> = {
  "Royal Flush":    9,
  "Straight Flush": 8,
  "Four of a Kind": 7,
  "Full House":     6,
  "Flush":          5,
  "Straight":       4,
  "Three of a Kind":3,
  "Two Pair":       2,
  "One Pair":       1,
  "High Card":      0,
}

function getCombinations(cards: Card[], k: number): Card[][] {
  if (k === 0) return [[]]
  if (cards.length === 0) return []
  const [first, ...rest] = cards
  const withFirst = getCombinations(rest, k - 1).map((combo) => [first, ...combo])
  const withoutFirst = getCombinations(rest, k)
  return [...withFirst, ...withoutFirst]
}

function evaluateFive(cards: Card[]): HandResult {
  const parsed = cards.map(parseCard)
  const ranks = parsed.map((c) => c.rank)
  const suits = parsed.map((c) => c.suit)
  const values = parsed.map((c) => rankValue(c.rank)).sort((a, b) => b - a)

  const isFlush = suits.every((s) => s === suits[0])
  const uniqueValues = [...new Set(values)].sort((a, b) => b - a)

  // Check straight (including A-2-3-4-5 wheel)
  let isStraight = false
  let straightHigh = values[0]
  if (uniqueValues.length === 5) {
    if (uniqueValues[0] - uniqueValues[4] === 4) {
      isStraight = true
      straightHigh = uniqueValues[0]
    }
    // Wheel: A-2-3-4-5
    if (uniqueValues[0] === 12 && uniqueValues[1] === 3 && uniqueValues[2] === 2 && uniqueValues[3] === 1 && uniqueValues[4] === 0) {
      isStraight = true
      straightHigh = 3 // 5-high
    }
  }

  const rankCounts = new Map<number, number>()
  for (const v of values) rankCounts.set(v, (rankCounts.get(v) ?? 0) + 1)
  const groups = [...rankCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const counts = groups.map((g) => g[1])

  // Score = hand rank * 1e10 + tiebreaker values
  const tiebreak = (vals: number[]): number =>
    vals.reduce((acc, v, i) => acc + v * Math.pow(15, 4 - i), 0)

  if (isFlush && isStraight) {
    const rankName = straightHigh === 12 ? "Royal Flush" : "Straight Flush"
    return { rank: rankName, score: HAND_SCORES[rankName] * 1e10 + straightHigh, description: rankName, bestFive: cards }
  }
  if (counts[0] === 4) {
    const quad = groups[0][0], kicker = groups[1][0]
    return { rank: "Four of a Kind", score: HAND_SCORES["Four of a Kind"] * 1e10 + quad * 15 + kicker, description: `Four of a Kind (${rankLabel(quad)}s)`, bestFive: cards }
  }
  if (counts[0] === 3 && counts[1] === 2) {
    const trip = groups[0][0], pair = groups[1][0]
    return { rank: "Full House", score: HAND_SCORES["Full House"] * 1e10 + trip * 15 + pair, description: `Full House (${rankLabel(trip)}s full of ${rankLabel(pair)}s)`, bestFive: cards }
  }
  if (isFlush) {
    return { rank: "Flush", score: HAND_SCORES["Flush"] * 1e10 + tiebreak(values), description: "Flush", bestFive: cards }
  }
  if (isStraight) {
    return { rank: "Straight", score: HAND_SCORES["Straight"] * 1e10 + straightHigh, description: `Straight (${rankLabel(straightHigh)}-high)`, bestFive: cards }
  }
  if (counts[0] === 3) {
    const trip = groups[0][0], kickers = groups.slice(1).map((g) => g[0])
    return { rank: "Three of a Kind", score: HAND_SCORES["Three of a Kind"] * 1e10 + tiebreak([trip, ...kickers]), description: `Three of a Kind (${rankLabel(trip)}s)`, bestFive: cards }
  }
  if (counts[0] === 2 && counts[1] === 2) {
    const p1 = groups[0][0], p2 = groups[1][0], kicker = groups[2][0]
    return { rank: "Two Pair", score: HAND_SCORES["Two Pair"] * 1e10 + tiebreak([p1, p2, kicker]), description: `Two Pair (${rankLabel(p1)}s and ${rankLabel(p2)}s)`, bestFive: cards }
  }
  if (counts[0] === 2) {
    const pair = groups[0][0], kickers = groups.slice(1).map((g) => g[0])
    return { rank: "One Pair", score: HAND_SCORES["One Pair"] * 1e10 + tiebreak([pair, ...kickers]), description: `One Pair (${rankLabel(pair)}s)`, bestFive: cards }
  }
  return { rank: "High Card", score: HAND_SCORES["High Card"] * 1e10 + tiebreak(values), description: `High Card (${rankLabel(values[0])})`, bestFive: cards }
}

function rankLabel(value: number): string {
  const labels = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"]
  return labels[value] ?? "?"
}

export function bestHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const all = [...holeCards, ...communityCards]
  const combos = getCombinations(all, 5)
  let best: HandResult | null = null
  for (const combo of combos) {
    const result = evaluateFive(combo)
    if (!best || result.score > best.score) best = result
  }
  return best!
}

export interface ShowdownResult {
  playerId: string
  hand: HandResult
}

export function determineWinners(players: { playerId: string; holeCards: Card[] }[], community: Card[]): ShowdownResult[] {
  const results = players.map((p) => ({
    playerId: p.playerId,
    hand: bestHand(p.holeCards, community),
  }))
  const maxScore = Math.max(...results.map((r) => r.hand.score))
  return results.filter((r) => r.hand.score === maxScore)
}
