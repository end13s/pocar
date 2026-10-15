import { Card } from "./deck"

export type PlayerAction = "fold" | "check" | "call" | "raise" | "all_in"
export type Street = "preflop" | "flop" | "turn" | "river" | "showdown"

export interface PlayerState {
  userId: string
  displayName: string
  seatNumber: number
  chips: number
  holeCards: Card[]
  currentBet: number   // bet in current street
  totalInPot: number   // total invested this hand
  hasActed?: boolean   // acted at least once this street (reset on street change)
  status: "active" | "folded" | "all_in" | "sitting_out" | "waiting"
  isBot: boolean
  avatarColor?: string
  avatarUrl?: string | null
  botKey?: string | null
  // set via "Sit out": skipped when dealing the next hand until "I'm back"
  wantsSitOut?: boolean
}

export interface SidePot {
  amount: number
  eligiblePlayerIds: string[]
}

export interface GameState {
  sessionId: string
  handNumber: number
  street: Street
  deck: Card[]
  communityCards: Card[]
  players: PlayerState[]       // ordered by seat number
  dealerSeat: number
  smallBlindSeat: number
  bigBlindSeat: number
  pot: number
  sidePots: SidePot[]
  currentBet: number           // highest bet in current street
  minRaise: number
  activePlayerIndex: number    // index into players array (active players only)
  lastAggressorIndex: number
  smallBlind: number
  bigBlind: number
  phase: "waiting" | "playing" | "showdown" | "ended"
}

export function getActivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.status === "active" || p.status === "all_in")
}

export function getActionablePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.status === "active")
}

export function getCurrentPlayer(state: GameState): PlayerState | null {
  const actionable = getActionablePlayers(state)
  if (actionable.length === 0) return null
  return actionable[state.activePlayerIndex % actionable.length] ?? null
}

export interface PotLayer {
  amount: number
  contributorIds: string[]   // everyone who paid into this layer, folded players included
}

/**
 * Split everything invested this hand into layers by contribution level: the main pot
 * first, then one side pot per all-in level. A layer with a single contributor is an
 * uncalled bet, which goes back to that player at showdown.
 */
export function buildPotLayers(players: PlayerState[]): PotLayer[] {
  const invested = players
    .filter((p) => p.totalInPot > 0)
    .map((p) => ({ userId: p.userId, amount: p.totalInPot }))
    .sort((a, b) => a.amount - b.amount)

  const layers: PotLayer[] = []
  let prev = 0
  for (const { amount: level } of invested) {
    if (level <= prev) continue
    const contributors = invested.filter((p) => p.amount >= level)
    layers.push({ amount: (level - prev) * contributors.length, contributorIds: contributors.map((p) => p.userId) })
    prev = level
  }
  return layers
}
