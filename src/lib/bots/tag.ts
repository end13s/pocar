import { parseCard, rankValue } from "@/lib/poker/deck"
import { bestHand } from "@/lib/poker/evaluator"
import { InternalBot, BotView } from "./types"

// Rough preflop strength in [0..1]: pairs and big cards are good
function preflopStrength(view: BotView): number {
  const [a, b] = view.holeCards.map(parseCard)
  const hi = Math.max(rankValue(a.rank), rankValue(b.rank)) / 12
  const lo = Math.min(rankValue(a.rank), rankValue(b.rank)) / 12
  const pair = a.rank === b.rank ? 0.5 : 0
  const suited = a.suit === b.suit ? 0.05 : 0
  const connected = Math.abs(rankValue(a.rank) - rankValue(b.rank)) === 1 ? 0.03 : 0
  return Math.min(1, hi * 0.5 + lo * 0.2 + pair + suited + connected)
}

// Postflop strength from the evaluator's hand rank (0=high card … 8=royal-ish)
function postflopStrength(view: BotView): number {
  const result = bestHand(view.holeCards, view.communityCards)
  const rankScore: Record<string, number> = {
    "High Card": 0.15, "One Pair": 0.35, "Two Pair": 0.55, "Three of a Kind": 0.7,
    "Straight": 0.8, "Flush": 0.85, "Full House": 0.92, "Four of a Kind": 0.98,
    "Straight Flush": 1, "Royal Flush": 1,
  }
  return rankScore[result.rank] ?? 0.3
}

// Tight-aggressive: folds weak hands, raises strong ones
export const tag: InternalBot = {
  key: "tag",
  name: "TAG Bot",
  description: "Tight-aggressive: folds junk, bets and raises strong hands.",
  decide: (view) => {
    const strength = view.communityCards.length >= 3 ? postflopStrength(view) : preflopStrength(view)
    const potOdds = view.toCall > 0 ? view.toCall / (view.pot + view.toCall) : 0

    // Strong hand: raise ~2/3 pot (or min-raise if that's bigger)
    if (strength >= 0.65) {
      const target = Math.max(view.minRaise, view.currentBet + Math.round((view.pot + view.toCall) * 0.66))
      if (view.myStack + view.myBet > view.toCall + view.myBet) {
        return { action: "raise", amount: target }
      }
      return { action: "call" }
    }

    // Medium hand: call if the price is right, otherwise check/fold
    if (strength >= 0.35) {
      if (view.toCall <= 0) return { action: "check" }
      if (potOdds <= strength) return { action: "call" }
      return { action: "fold" }
    }

    // Junk: free card or fold
    if (view.toCall <= 0) return { action: "check" }
    return { action: "fold" }
  },
}
