import { buildDeck, shuffle, Card } from "./deck"
import { HandResult, bestHand } from "./evaluator"
import { GameState, PlayerState, buildPotLayers, getActionablePlayers } from "./gameState"

export type EngineAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; amount: number }
  | { type: "all_in" }

export interface EngineResult {
  state: GameState
  events: GameEvent[]
}

export type GameEvent =
  | { type: "hand_started"; handNumber: number }
  | { type: "cards_dealt" }
  | { type: "street_changed"; street: GameState["street"]; communityCards: Card[] }
  | { type: "player_action"; userId: string; action: EngineAction; chips: number }
  | { type: "player_folded"; userId: string }
  | { type: "showdown"; results: { userId: string; holeCards: Card[]; handDescription: string }[] }
  | { type: "hand_ended"; winners: { userId: string; amount: number; handDescription?: string }[] }
  | { type: "next_turn"; userId: string; timeoutMs: number }

export function startHand(state: GameState): EngineResult {
  const events: GameEvent[] = []
  const deck = shuffle(buildDeck())

  // Reset player state for new hand; sit-out players are skipped until they return
  const players = state.players.map((p) => ({
    ...p,
    holeCards: [] as Card[],
    currentBet: 0,
    totalInPot: 0,
    hasActed: false,
    status: p.chips > 0 && !p.wantsSitOut ? ("active" as const) : ("sitting_out" as const),
  }))

  // Deal 2 cards to each active player
  const activePlayers = players.filter((p) => p.status === "active")
  const dealtCards = [...deck]
  for (let round = 0; round < 2; round++) {
    for (const player of activePlayers) {
      const card = dealtCards.shift()!
      player.holeCards.push(card)
    }
  }

  // Rotate dealer to the next active seat (first hand keeps the initial dealer)
  const seats = activePlayers.map((p) => p.seatNumber).sort((a, b) => a - b)
  const nextSeat = (after: number) => seats.find((s) => s > after) ?? seats[0]
  const dealerSeat = state.handNumber > 0 ? nextSeat(state.dealerSeat) : (seats.includes(state.dealerSeat) ? state.dealerSeat : seats[0])

  // Blinds: heads-up the dealer posts the SB; solo play posts only the BB
  let smallBlindSeat: number
  let bigBlindSeat: number
  if (seats.length === 1) {
    smallBlindSeat = seats[0]
    bigBlindSeat = seats[0]
  } else if (seats.length === 2) {
    smallBlindSeat = dealerSeat
    bigBlindSeat = nextSeat(dealerSeat)
  } else {
    smallBlindSeat = nextSeat(dealerSeat)
    bigBlindSeat = nextSeat(smallBlindSeat)
  }

  // Post blinds
  const sbPlayer = players.find((p) => p.seatNumber === smallBlindSeat)
  const bbPlayer = players.find((p) => p.seatNumber === bigBlindSeat)

  if (sbPlayer && sbPlayer !== bbPlayer) {
    const sbAmount = Math.min(sbPlayer.chips, state.smallBlind)
    sbPlayer.chips -= sbAmount
    sbPlayer.currentBet = sbAmount
    sbPlayer.totalInPot = sbAmount
    if (sbPlayer.chips === 0) (sbPlayer as PlayerState).status = "all_in"
  }

  if (bbPlayer) {
    const bbAmount = Math.min(bbPlayer.chips, state.bigBlind)
    bbPlayer.chips -= bbAmount
    bbPlayer.currentBet = bbAmount
    bbPlayer.totalInPot = bbAmount
    if (bbPlayer.chips === 0) (bbPlayer as PlayerState).status = "all_in"
  }

  const pot = sbPlayer === bbPlayer
    ? (bbPlayer?.totalInPot ?? 0)
    : (sbPlayer?.totalInPot ?? 0) + (bbPlayer?.totalInPot ?? 0)

  // First to act preflop = player after BB (heads-up: the dealer/SB)
  const bbIndex = activePlayers.findIndex((p) => p.seatNumber === bigBlindSeat)
  const firstToAct = (bbIndex + 1) % activePlayers.length

  const newState: GameState = {
    ...state,
    dealerSeat,
    smallBlindSeat,
    bigBlindSeat,
    deck: dealtCards,
    communityCards: [],
    players,
    pot,
    sidePots: [],
    currentBet: state.bigBlind,
    minRaise: state.bigBlind * 2,
    street: "preflop",
    activePlayerIndex: firstToAct,
    lastAggressorIndex: bbIndex,
    phase: "playing",
    handNumber: state.handNumber + 1,
  }

  events.push({ type: "hand_started", handNumber: newState.handNumber })
  events.push({ type: "cards_dealt" })
  const currentPlayer = getActionablePlayers(newState)[newState.activePlayerIndex]
  if (currentPlayer) {
    events.push({ type: "next_turn", userId: currentPlayer.userId, timeoutMs: 30000 })
  }

  return { state: newState, events }
}

export function applyAction(state: GameState, userId: string, action: EngineAction): EngineResult {
  const events: GameEvent[] = []
  const players = state.players.map((p) => ({ ...p }))
  const actionable = players.filter((p) => p.status === "active")
  const playerIndex = actionable.findIndex((p) => p.userId === userId)

  if (playerIndex === -1) return { state, events }

  const player = actionable[playerIndex]
  const legal = normalizeAction(state, player, action)
  if (!legal) return { state, events }
  action = legal
  player.hasActed = true
  events.push({ type: "player_action", userId, action, chips: player.chips })

  switch (action.type) {
    case "fold":
      player.status = "folded"
      events.push({ type: "player_folded", userId })
      break

    case "check":
      // no change
      break

    case "call": {
      const toCall = Math.min(player.chips, state.currentBet - player.currentBet)
      player.chips -= toCall
      player.currentBet += toCall
      player.totalInPot += toCall
      if (player.chips === 0) player.status = "all_in"
      break
    }

    case "raise": {
      const raiseTotal = action.amount
      const toAdd = raiseTotal - player.currentBet
      const actual = Math.min(player.chips, toAdd)
      player.chips -= actual
      player.currentBet += actual
      player.totalInPot += actual
      if (player.chips === 0) {
        player.status = "all_in"
      }
      break
    }

    case "all_in": {
      const allInAmount = player.chips
      player.currentBet += allInAmount
      player.totalInPot += allInAmount
      player.chips = 0
      player.status = "all_in"
      break
    }
  }

  const newCurrentBet = Math.max(state.currentBet, player.currentBet)
  // Min raise (as a raise-to total) = current bet + the size of the last raise
  const raisedBy = player.currentBet - state.currentBet
  const newMinRaise = raisedBy > 0
    ? player.currentBet + Math.max(raisedBy, state.minRaise - state.currentBet)
    : state.minRaise
  const pot = players.reduce((sum, p) => sum + p.totalInPot, 0)

  const newState: GameState = {
    ...state,
    players,
    pot,
    currentBet: newCurrentBet,
    minRaise: newMinRaise,
    lastAggressorIndex: action.type === "raise" || action.type === "all_in" ? playerIndex : state.lastAggressorIndex,
  }

  // Check if street is over
  const result = advanceIfStreetComplete(newState, events, player.seatNumber)
  return result
}

/**
 * Turn a requested action into a legal one, or null to reject it. Clients (and bots)
 * only choose an action; the engine decides what it is allowed to mean.
 */
function normalizeAction(state: GameState, player: PlayerState, action: EngineAction): EngineAction | null {
  const toCall = state.currentBet - player.currentBet
  switch (action.type) {
    case "fold":
    case "all_in":
      return player.chips > 0 || action.type === "fold" ? action : null
    case "check":
      return toCall <= 0 ? action : null
    case "call":
      return toCall > 0 ? action : { type: "check" }
    case "raise": {
      const raiseTo = action.amount
      if (!Number.isInteger(raiseTo)) return null
      const maxTo = player.currentBet + player.chips
      if (raiseTo >= maxTo) return { type: "all_in" }
      if (raiseTo < state.minRaise || raiseTo <= state.currentBet) return null
      return { type: "raise", amount: raiseTo }
    }
  }
}

function advanceIfStreetComplete(state: GameState, events: GameEvent[], actorSeat: number): EngineResult {
  const active = state.players.filter((p) => p.status === "active")
  const inHand = state.players.filter((p) => p.status === "active" || p.status === "all_in")

  // Everyone else folded — last player standing wins without showdown
  if (inHand.length === 1) {
    return endHand(state, events, false)
  }

  // A player still needs to act if they haven't this street, or a raise is pending
  const needsAction = active.filter((p) => !p.hasActed || p.currentBet < state.currentBet)

  if (needsAction.length === 0 || active.length === 0) {
    return advanceStreet(state, events)
  }

  // Next to act: first such player after the actor, in seat order (with wrap)
  const next =
    needsAction.find((p) => p.seatNumber > actorSeat) ?? needsAction[0]
  const newState: GameState = {
    ...state,
    activePlayerIndex: active.findIndex((p) => p.userId === next.userId),
  }
  events.push({ type: "next_turn", userId: next.userId, timeoutMs: 30000 })
  return { state: newState, events }
}

function advanceStreet(state: GameState, events: GameEvent[]): EngineResult {
  const streets: GameState["street"][] = ["preflop", "flop", "turn", "river", "showdown"]
  const nextStreet = streets[streets.indexOf(state.street) + 1]

  if (!nextStreet || nextStreet === "showdown") {
    return endHand(state, events, true)
  }

  const deck = [...state.deck]
  let communityCards = [...state.communityCards]

  if (nextStreet === "flop") communityCards = [...communityCards, deck.shift()!, deck.shift()!, deck.shift()!]
  if (nextStreet === "turn") communityCards = [...communityCards, deck.shift()!]
  if (nextStreet === "river") communityCards = [...communityCards, deck.shift()!]

  // Reset bets and action flags for the new street
  const players = state.players.map((p) => ({ ...p, currentBet: 0, hasActed: false }))

  const active = players.filter((p) => p.status === "active")

  const newState: GameState = {
    ...state,
    deck,
    communityCards,
    players,
    street: nextStreet,
    currentBet: 0,
    minRaise: state.bigBlind,
    activePlayerIndex: 0,
  }

  events.push({ type: "street_changed", street: nextStreet, communityCards })

  // All-in runout: fewer than 2 players can act — deal remaining streets straight through
  if (active.length <= 1) {
    return advanceStreet(newState, events)
  }

  // First to act post-flop = first active player left of the dealer
  const firstToAct = active.findIndex((p) => p.seatNumber > state.dealerSeat) !== -1
    ? active.findIndex((p) => p.seatNumber > state.dealerSeat)
    : 0
  newState.activePlayerIndex = firstToAct

  const current = active[firstToAct]
  if (current) events.push({ type: "next_turn", userId: current.userId, timeoutMs: 30000 })

  return { state: newState, events }
}

function endHand(state: GameState, events: GameEvent[], showdown: boolean): EngineResult {
  // Only players actually in the hand can win it (not sitting-out/waiting ones)
  const eligible = state.players.filter((p) => p.status === "active" || p.status === "all_in")
  const winners: { userId: string; amount: number; handDescription?: string }[] = []

  if (eligible.length === 1) {
    // Everyone else folded
    const winner = eligible[0]
    winner.chips += state.pot
    winners.push({ userId: winner.userId, amount: state.pot })
  } else if (showdown) {
    const hands = new Map<string, HandResult>(
      eligible.map((p) => [p.userId, bestHand(p.holeCards, state.communityCards)])
    )
    events.push({
      type: "showdown",
      results: eligible.map((p) => ({
        userId: p.userId,
        holeCards: p.holeCards,
        handDescription: hands.get(p.userId)!.description,
      })),
    })

    // Award each pot layer to the best hand among the players who paid into it
    const payouts = new Map<string, number>()
    for (const layer of buildPotLayers(state.players)) {
      let contenders = layer.contributorIds.filter((id) => hands.has(id))
      if (contenders.length === 0) contenders = [...hands.keys()] // only folded money in this layer
      const best = Math.max(...contenders.map((id) => hands.get(id)!.score))
      const layerWinners = orderFromDealer(state, contenders.filter((id) => hands.get(id)!.score === best))
      const share = Math.floor(layer.amount / layerWinners.length)
      let oddChips = layer.amount - share * layerWinners.length // go to the first winners left of the dealer
      for (const id of layerWinners) {
        payouts.set(id, (payouts.get(id) ?? 0) + share + (oddChips-- > 0 ? 1 : 0))
      }
    }

    for (const [userId, amount] of payouts) {
      state.players.find((p) => p.userId === userId)!.chips += amount
      winners.push({ userId, amount, handDescription: hands.get(userId)!.description })
    }
  }

  const newState: GameState = { ...state, phase: "ended", players: state.players }
  events.push({ type: "hand_ended", winners })
  return { state: newState, events }
}

/** Sort user ids by seat, starting with the first seat left of the dealer. */
function orderFromDealer(state: GameState, userIds: string[]): string[] {
  const seatOf = (id: string) => state.players.find((p) => p.userId === id)!.seatNumber
  const distance = (id: string) => {
    const d = seatOf(id) - state.dealerSeat
    return d > 0 ? d : d + 1000
  }
  return [...userIds].sort((a, b) => distance(a) - distance(b))
}
