import { test } from "node:test"
import assert from "node:assert/strict"
import { Card } from "./deck"
import { EngineAction, applyAction, startHand } from "./engine"
import { GameState, PlayerState, getCurrentPlayer } from "./gameState"

function player(userId: string, seatNumber: number, chips: number, extra: Partial<PlayerState> = {}): PlayerState {
  return {
    userId, displayName: userId, seatNumber, chips,
    holeCards: [], currentBet: 0, totalInPot: 0, hasActed: false,
    status: "active", isBot: false, ...extra,
  }
}

function table(players: PlayerState[], extra: Partial<GameState> = {}): GameState {
  return {
    sessionId: "test", handNumber: 1, street: "preflop", deck: [], communityCards: [],
    players, dealerSeat: 1, smallBlindSeat: 1, bigBlindSeat: 2,
    pot: players.reduce((s, p) => s + p.totalInPot, 0), sidePots: [],
    currentBet: 0, minRaise: 20, activePlayerIndex: 0, lastAggressorIndex: 0,
    smallBlind: 10, bigBlind: 20, phase: "playing", ...extra,
  }
}

const cards = (s: string) => s.split(" ") as Card[]
const chipsOf = (state: GameState) => Object.fromEntries(state.players.map((p) => [p.userId, p.chips]))

/** Players check through the river so the hand goes to showdown. */
function checkToShowdown(state: GameState, ...userIds: string[]): GameState {
  for (const id of userIds) state = applyAction(state, id, { type: "check" }).state
  assert.equal(state.phase, "ended")
  return state
}

// ── Pot distribution ─────────────────────────────────────────────────────────

test("a short all-in only wins the main pot; the side pot goes to the best other hand", () => {
  const state = table(
    [
      player("a", 1, 0, { holeCards: cards("Ah Ac"), totalInPot: 100, status: "all_in" }), // best hand
      player("b", 2, 1000, { holeCards: cards("Kh Qc"), totalInPot: 500 }),                 // second best
      player("c", 3, 1000, { holeCards: cards("3s 4s"), totalInPot: 500 }),
    ],
    { street: "river", communityCards: cards("2c 7d 9h Js Kd") },
  )
  const end = checkToShowdown(state, "b", "c")
  assert.deepEqual(chipsOf(end), { a: 300, b: 1800, c: 1000 })
})

test("an uncalled bet goes back to the player who made it", () => {
  const state = table(
    [
      player("a", 1, 0, { holeCards: cards("Ah Ac"), totalInPot: 100, status: "all_in" }),
      player("b", 2, 700, { holeCards: cards("3s 4d"), totalInPot: 300 }),
    ],
    { street: "river", communityCards: cards("2c 7d 9h Js Kd") },
  )
  const end = checkToShowdown(state, "b")
  assert.deepEqual(chipsOf(end), { a: 200, b: 900 })
})

test("folded chips stay in the pot but the folder cannot win them", () => {
  const state = table(
    [
      player("a", 1, 900, { holeCards: cards("Ah Ac"), totalInPot: 100, status: "folded" }),
      player("b", 2, 900, { holeCards: cards("Kh Kc"), totalInPot: 100 }),
      player("c", 3, 900, { holeCards: cards("3s 4d"), totalInPot: 100 }),
    ],
    { street: "river", communityCards: cards("2c 7d 9h Js 5h") },
  )
  const end = checkToShowdown(state, "b", "c")
  assert.deepEqual(chipsOf(end), { a: 900, b: 1200, c: 900 })
})

test("an odd chip in a split pot goes to the first winner left of the dealer", () => {
  const state = table(
    [
      player("p1", 1, 0, { holeCards: cards("Ah 3c"), totalInPot: 7 }),
      player("p2", 2, 0, { holeCards: cards("As 4d"), totalInPot: 7 }),
      player("p3", 3, 0, { holeCards: cards("Qh 5c"), totalInPot: 7 }),
    ],
    { street: "river", communityCards: cards("2c 2d 7h 9s Kd"), dealerSeat: 1 },
  )
  const end = checkToShowdown(state, "p1", "p2", "p3")
  assert.deepEqual(chipsOf(end), { p1: 10, p2: 11, p3: 0 })
})

// ── Action validation ────────────────────────────────────────────────────────

const facingBet = () =>
  table([player("x", 1, 1000), player("y", 2, 980, { currentBet: 20, totalInPot: 20, hasActed: true })], {
    currentBet: 20, minRaise: 40,
  })

test("a raise below the minimum is rejected without moving chips", () => {
  const state = facingBet()
  for (const amount of [10, 20, 30]) {
    const result = applyAction(state, "x", { type: "raise", amount })
    assert.equal(result.state, state)
    assert.equal(result.events.length, 0)
  }
})

test("a raise that is not a whole number is rejected", () => {
  const state = facingBet()
  for (const amount of [45.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(applyAction(state, "x", { type: "raise", amount }).state, state)
  }
})

test("checking while facing a bet is rejected", () => {
  const state = facingBet()
  assert.equal(applyAction(state, "x", { type: "check" }).state, state)
})

test("a raise above the stack becomes an all-in", () => {
  const { state } = applyAction(facingBet(), "x", { type: "raise", amount: 5000 })
  const x = state.players.find((p) => p.userId === "x")!
  assert.equal(x.chips, 0)
  assert.equal(x.status, "all_in")
  assert.equal(x.totalInPot, 1000)
})

test("the minimum re-raise is the current bet plus the last raise", () => {
  const { state } = applyAction(facingBet(), "x", { type: "raise", amount: 60 })
  assert.equal(state.currentBet, 60)
  assert.equal(state.minRaise, 100)
})

// ── Whole hands ──────────────────────────────────────────────────────────────

test("random play never creates or loses chips", () => {
  const actions: EngineAction["type"][] = ["fold", "check", "call", "raise", "all_in"]
  let state: GameState = table(
    [player("a", 1, 1000), player("b", 2, 1000), player("c", 3, 1000), player("d", 4, 1000)],
    { handNumber: 0, phase: "waiting" },
  )
  const startTotal = 4000

  for (let handNo = 0; handNo < 300; handNo++) {
    if (state.players.filter((p) => p.chips > 0).length < 2) break
    state = startHand(state).state

    for (let step = 0; state.phase === "playing"; step++) {
      assert.ok(step < 500, "hand did not finish")
      const current = getCurrentPlayer(state)
      assert.ok(current, "a player must be due to act while the hand is playing")
      const type = actions[Math.floor(Math.random() * actions.length)]
      const action: EngineAction = type === "raise"
        ? { type, amount: state.minRaise + Math.floor(Math.random() * 3) * state.bigBlind }
        : { type }
      let next = applyAction(state, current.userId, action).state
      if (next === state) next = applyAction(state, current.userId, { type: "fold" }).state
      state = next
    }

    for (const p of state.players) assert.ok(p.chips >= 0, `${p.userId} has negative chips`)
    assert.equal(state.players.reduce((s, p) => s + p.chips, 0), startTotal)
  }
})
