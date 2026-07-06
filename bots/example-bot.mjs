// Example external poker bot.
//
// 1. Register a bot in the app (Profile → My bots) and copy its API key.
// 2. Have the host add your bot to a table (session page → Add bot → your bot).
// 3. Run this from the repo root:
//
//      node bots/example-bot.mjs http://localhost:3000 <API_KEY> <SESSION_ID>
//
// The session id is the last part of the table URL: /session/<SESSION_ID>.
// The bot receives the same sanitized state a human sees (its own hole cards,
// masked opponents) and answers `player_action` when it's its turn.

import { io } from "socket.io-client"

const [url, apiKey, sessionId] = process.argv.slice(2)
if (!url || !apiKey || !sessionId) {
  console.error("Usage: node bots/example-bot.mjs <URL> <API_KEY> <SESSION_ID>")
  process.exit(1)
}

const socket = io(url, { auth: { apiKey } })

let myUserId = null
let state = null

socket.on("connect_error", (e) => {
  console.error("Connection refused:", e.message)
  process.exit(1)
})

socket.on("identity", ({ userId }) => {
  myUserId = userId
  console.log(`[bot] connected as ${userId}`)
  socket.emit("join_session", sessionId)
})

socket.on("game_state", (s) => {
  state = s
})

socket.on("game_event", (event) => {
  if (event.type === "hand_ended") console.log("[bot] hand ended:", JSON.stringify(event.winners))
  if (event.type !== "next_turn" || event.userId !== myUserId) return

  // Think for a moment, then decide from the latest state
  setTimeout(() => {
    if (!state) return
    const me = state.players.find((p) => p.userId === myUserId)
    if (!me) return
    const toCall = state.currentBet - me.currentBet

    // --- Your strategy goes here. This one just calls everything. ---
    const action = toCall > 0 ? { type: "call" } : { type: "check" }

    console.log(`[bot] ${state.street} | cards: ${state.yourHoleCards.join(" ")} | pot: ${state.pot} | toCall: ${toCall} -> ${action.type}`)
    socket.emit("player_action", { sessionId, action })
  }, 800)
})

socket.on("error", (msg) => console.error("[bot] server error:", msg))
