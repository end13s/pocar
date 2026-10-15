import { test } from "node:test"
import assert from "node:assert/strict"
import { Card } from "./deck"
import { bestHand, determineWinners } from "./evaluator"

const hand = (hole: string, board: string) =>
  bestHand(hole.split(" ") as Card[], board.split(" ") as Card[])

test("categories rank in poker order", () => {
  const board = "2c 7d 9h Js Kd"
  const ordered = [
    hand("Ah Kh", "Qh Jh Th 2c 3d"), // royal flush
    hand("9s 8s", "7s 6s 5s 2c 3d"), // straight flush
    hand("Ks Kc", "Kh Kd 2s 3c 7h"), // four of a kind
    hand("Ks Kc", "Kh 2d 2s 3c 7h"), // full house
    hand("Ah 3h", "Kh 9h 5h 2c 2d"), // flush
    hand("Th 8c", "9d 7s 6h 2c 2d"), // straight
    hand("Ks Kc", "Kh 2d 9s 3c 7h"), // three of a kind
    hand("Ks 9c", board),            // two pair
    hand("Ah Ac", board),            // one pair
    hand("Ah 3c", board),            // high card
  ]
  const names = ordered.map((h) => h.rank)
  assert.deepEqual(names, [
    "Royal Flush", "Straight Flush", "Four of a Kind", "Full House", "Flush",
    "Straight", "Three of a Kind", "Two Pair", "One Pair", "High Card",
  ])
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(ordered[i - 1].score > ordered[i].score, `${names[i - 1]} should beat ${names[i]}`)
  }
})

test("the wheel is a five-high straight", () => {
  const wheel = hand("Ah 2c", "3d 4s 5h Kc Qd")
  const sixHigh = hand("6h 2c", "3d 4s 5h Kc Qd")
  assert.equal(wheel.rank, "Straight")
  assert.equal(wheel.description, "Straight (5-high)")
  assert.ok(sixHigh.score > wheel.score)
})

test("kickers break ties between equal pairs", () => {
  const board = "Ad 8c 5s 3h 2d"
  assert.ok(hand("Ah Kc", board).score > hand("As Qc", board).score)
})

test("a board that plays splits the pot", () => {
  const winners = determineWinners(
    [
      { playerId: "a", holeCards: ["2c", "3d"] as Card[] },
      { playerId: "b", holeCards: ["4c", "5d"] as Card[] },
    ],
    ["Th", "Jh", "Qs", "Kc", "Ad"] as Card[],
  )
  assert.deepEqual(winners.map((w) => w.playerId).sort(), ["a", "b"])
})

test("the best five of seven cards are used", () => {
  const result = hand("Ah Ad", "As Kc Kd 2s 3c")
  assert.equal(result.rank, "Full House")
  assert.equal(result.description, "Full House (As full of Ks)")
})
