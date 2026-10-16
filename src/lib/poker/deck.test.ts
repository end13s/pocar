import { test } from "node:test"
import assert from "node:assert/strict"
import { buildDeck, shuffle } from "./deck"

test("a shuffled deck holds every card exactly once", () => {
  const deck = shuffle(buildDeck())
  assert.equal(deck.length, 52)
  assert.equal(new Set(deck).size, 52)
  assert.deepEqual([...deck].sort(), buildDeck().sort())
})

test("the shuffle is roughly uniform", () => {
  const rounds = 13_000
  let aceOnTop = 0
  for (let i = 0; i < rounds; i++) if (shuffle(buildDeck())[0] === "As") aceOnTop++
  // Expected 250 with a standard deviation near 16; the bounds are about 4.8 sigma
  assert.ok(aceOnTop > 175 && aceOnTop < 325, `As was on top ${aceOnTop} times out of ${rounds}`)
})
