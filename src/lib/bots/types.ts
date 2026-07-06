import { Card } from "@/lib/poker/deck"
import { Street } from "@/lib/poker/gameState"

// What a bot is allowed to see: exactly what a human player at the table sees
export interface BotView {
  handNumber: number
  street: Street
  holeCards: Card[]
  communityCards: Card[]
  pot: number
  currentBet: number
  toCall: number
  minRaise: number // raise-to total, not the increment
  myStack: number
  myBet: number
  mySeat: number
  dealerSeat: number
  smallBlind: number
  bigBlind: number
  players: {
    seatNumber: number
    displayName: string
    chips: number
    currentBet: number
    status: "active" | "folded" | "all_in" | "sitting_out" | "waiting"
    isBot: boolean
  }[]
}

export interface BotDecision {
  action: "fold" | "check" | "call" | "raise"
  // for raise: the total amount to raise TO (clamped by the server)
  amount?: number
}

export type BotDecideFn = (view: BotView) => BotDecision | Promise<BotDecision>

export interface InternalBot {
  key: string
  name: string
  description: string
  decide: BotDecideFn
}
