import { Server, Socket } from "socket.io"
import { ServerToClientEvents, ClientToServerEvents } from "@/types/socket"
import { prisma } from "@/lib/prisma"
import { GameState, getCurrentPlayer, PlayerState } from "@/lib/poker/gameState"
import { startHand, applyAction, EngineAction, GameEvent } from "@/lib/poker/engine"
import { Card } from "@/lib/poker/deck"
import { INTERNAL_BOTS } from "@/lib/bots/registry"
import { BotView, BotDecision } from "@/lib/bots/types"

// In-memory game states (keyed by sessionId)
const activeGames = new Map<string, GameState>()
// Turn timers: auto check/fold when a player runs out of time
const turnTimers = new Map<string, NodeJS.Timeout>()
// Pending internal-bot "thinking" timers
const botTimers = new Map<string, NodeJS.Timeout>()

const TURN_GRACE_MS = 1500
const NEXT_HAND_DELAY_MS = 4000
const BOT_THINK_MIN_MS = 900
const BOT_THINK_MAX_MS = 2200

type IO = Server<ClientToServerEvents, ServerToClientEvents>
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>

export function registerSocketHandlers(io: IO) {
  // Resolve identity once per connection: browsers send auth.userId,
  // external bots send auth.apiKey and get looked up in the DB.
  io.use(async (socket, next) => {
    const { userId, apiKey } = socket.handshake.auth as { userId?: string; apiKey?: string }
    if (apiKey) {
      const bot = await prisma.user.findUnique({ where: { apiKey } })
      if (!bot) return next(new Error("Invalid API key"))
      socket.data.userId = bot.id
      return next()
    }
    socket.data.userId = userId
    next()
  })

  io.on("connection", (socket: Sock) => {
    const userId = socket.data.userId as string | undefined
    if (userId) socket.emit("identity", { userId })

    socket.on("join_session", async (sessionId) => {
      socket.join(sessionId)
      await broadcastSessionUpdate(io, sessionId)
      // Late joiners (already bought in) get seated for the next hand
      if (userId) await addLatePlayerToGame(io, sessionId, userId)
      const game = activeGames.get(sessionId)
      if (game) {
        emitGameState(socket, game, userId)
        // Hands pause while the room is empty — resume when someone joins
        if (game.phase === "ended") {
          setTimeout(() => startNextHand(io, sessionId), 1500)
        }
      } else {
        // ACTIVE session with no in-memory game (server restarted) — rebuild from DB
        await restoreGameIfActive(io, sessionId)
      }
    })

    socket.on("leave_session", (sessionId) => {
      socket.leave(sessionId)
    })

    socket.on("confirm_transfer_sent", async (sessionId) => {
      if (!userId) return
      await prisma.sessionPlayer.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: { transferStatus: "SENT" },
      })
      await broadcastSessionUpdate(io, sessionId)
    })

    socket.on("host_confirm_transfer", async ({ sessionId, userId: targetUserId }) => {
      if (!userId) return
      const session = await prisma.session.findUnique({ where: { id: sessionId } })
      if (!session || session.hostId !== userId) return

      await prisma.sessionPlayer.update({
        where: { sessionId_userId: { sessionId, userId: targetUserId } },
        data: { transferStatus: "CONFIRMED", chips: { increment: session.buyIn } },
      })
      await broadcastSessionUpdate(io, sessionId)
      // Confirming a late joiner on a running table seats them for the next hand
      await addLatePlayerToGame(io, sessionId, targetUserId)
    })

    socket.on("host_start_game", async (sessionId) => {
      if (!userId) return
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { players: { include: { user: true }, orderBy: { seatNumber: "asc" } } },
      })
      if (!session || session.hostId !== userId) return
      if (session.status === "ACTIVE" && activeGames.has(sessionId)) return

      const allConfirmed = session.players.every((p) => p.transferStatus === "CONFIRMED")
      if (!allConfirmed) {
        socket.emit("error", "Not all players have confirmed their transfer.")
        return
      }

      await prisma.session.update({ where: { id: sessionId }, data: { status: "ACTIVE", startedAt: new Date() } })
      await broadcastSessionUpdate(io, sessionId)

      const gameState = buildGameState(sessionId, session, 0)
      dispatchResult(io, sessionId, startHand(gameState))
    })

    socket.on("player_action", ({ sessionId, action }) => {
      if (!userId) return
      applyPlayerAction(io, sessionId, userId, action)
    })

    socket.on("sit_out", (sessionId) => {
      if (!userId) return
      const game = activeGames.get(sessionId)
      if (!game) return
      const gp = game.players.find((p) => p.userId === userId)
      if (!gp) return
      gp.wantsSitOut = true
      // If it's their turn right now, act for them so the hand isn't stalled
      const current = game.phase === "playing" ? getCurrentPlayer(game) : null
      if (current?.userId === userId) {
        const toCall = game.currentBet - current.currentBet
        applyPlayerAction(io, sessionId, userId, toCall > 0 ? { type: "fold" } : { type: "check" })
      } else {
        broadcastGameState(io, sessionId, game)
      }
    })

    socket.on("sit_back", (sessionId) => {
      if (!userId) return
      const game = activeGames.get(sessionId)
      if (!game) return
      const gp = game.players.find((p) => p.userId === userId)
      if (!gp) return
      gp.wantsSitOut = false
      broadcastGameState(io, sessionId, game)
      // If everyone was sitting out the game may be idle — try to deal again
      if (game.phase === "ended") {
        setTimeout(() => startNextHand(io, sessionId), 1000)
      }
    })

    socket.on("leave_table", async (sessionId) => {
      if (!userId) return
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { players: true },
      })
      if (!session) return
      const me = session.players.find((p) => p.userId === userId)
      if (!me) return

      if (session.status === "WAITING_BUYIN") {
        // Real-money players who already sent/settled must sort it out with the host
        if (!session.isVirtual && me.transferStatus !== "PENDING") {
          socket.emit("error", "You already sent your buy-in — settle with the host before leaving.")
          return
        }
        await prisma.sessionPlayer.delete({ where: { sessionId_userId: { sessionId, userId } } })
        await broadcastSessionUpdate(io, sessionId)
        return
      }

      // ACTIVE: sit out for good; chips stay on the ledger until cash-out
      const game = activeGames.get(sessionId)
      if (game) {
        const gp = game.players.find((p) => p.userId === userId)
        if (gp) {
          gp.wantsSitOut = true
          const current = game.phase === "playing" ? getCurrentPlayer(game) : null
          if (current?.userId === userId) {
            const toCall = game.currentBet - current.currentBet
            applyPlayerAction(io, sessionId, userId, toCall > 0 ? { type: "fold" } : { type: "check" })
          } else {
            broadcastGameState(io, sessionId, game)
          }
        }
      }
      socket.leave(sessionId)
    })

    socket.on("request_cashout", async (sessionId) => {
      if (!userId) return
      await prisma.sessionPlayer.updateMany({
        where: { sessionId, userId, cashedOut: false },
        data: { cashOutRequested: true },
      })
      await broadcastSessionUpdate(io, sessionId)
    })

    socket.on("host_confirm_cashout", async ({ sessionId, userId: targetUserId }) => {
      if (!userId) return
      const session = await prisma.session.findUnique({ where: { id: sessionId } })
      if (!session || session.hostId !== userId) return

      const player = await prisma.sessionPlayer.findUnique({
        where: { sessionId_userId: { sessionId, userId: targetUserId } },
      })
      if (!player || player.cashedOut) return

      // If a game is running, take the player out of it (their chips leave the table)
      const game = activeGames.get(sessionId)
      let chipsToPay = player.chips
      if (game) {
        const gp = game.players.find((p) => p.userId === targetUserId)
        if (gp) {
          const inHand = game.phase === "playing" && (gp.status === "active" || gp.status === "all_in")
          if (inHand) {
            socket.emit("error", "Player is in the middle of a hand — confirm after it ends.")
            return
          }
          chipsToPay = gp.chips
          gp.chips = 0
          gp.status = "sitting_out"
          broadcastGameState(io, sessionId, game)
        }
      }

      await prisma.sessionPlayer.update({
        where: { sessionId_userId: { sessionId, userId: targetUserId } },
        data: { cashedOut: true, cashOutRequested: false, cashOutAmount: chipsToPay, chips: 0 },
      })
      await broadcastSessionUpdate(io, sessionId)
    })

    socket.on("host_end_session", async (sessionId) => {
      if (!userId) return
      const session = await prisma.session.findUnique({ where: { id: sessionId } })
      if (!session || session.hostId !== userId) return

      clearTurnTimer(sessionId)
      clearBotTimer(sessionId)
      activeGames.delete(sessionId)
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: "ENDED", endedAt: new Date() },
      })
      await broadcastSessionUpdate(io, sessionId)
    })
  })
}

type SessionWithPlayers = {
  smallBlind: number
  bigBlind: number
  players: {
    userId: string
    seatNumber: number
    chips: number
    cashedOut: boolean
    user: { displayName: string; isBot: boolean; avatarColor: string; avatarUrl: string | null; botKey: string | null }
  }[]
}

function buildGameState(sessionId: string, session: SessionWithPlayers, handNumber: number): GameState {
  const players = session.players
    .filter((p) => !p.cashedOut)
    .map((p) => ({
      userId: p.userId,
      displayName: p.user.displayName,
      seatNumber: p.seatNumber,
      chips: p.chips,
      holeCards: [] as Card[],
      currentBet: 0,
      totalInPot: 0,
      status: "active" as const,
      isBot: p.user.isBot,
      avatarColor: p.user.avatarColor,
      avatarUrl: p.user.avatarUrl,
      botKey: p.user.botKey,
    }))

  return {
    sessionId,
    handNumber,
    street: "preflop",
    deck: [],
    communityCards: [],
    players,
    dealerSeat: players[0]?.seatNumber ?? 1,
    smallBlindSeat: players[0]?.seatNumber ?? 1,
    bigBlindSeat: players[0]?.seatNumber ?? 1,
    pot: 0,
    sidePots: [],
    currentBet: 0,
    minRaise: session.bigBlind,
    activePlayerIndex: 0,
    lastAggressorIndex: 0,
    smallBlind: session.smallBlind,
    bigBlind: session.bigBlind,
    phase: "waiting",
  }
}

// A confirmed session player who isn't in the running game yet (joined after
// the game started) is added as sitting-out; startHand deals them in next hand.
async function addLatePlayerToGame(io: IO, sessionId: string, userId: string) {
  const game = activeGames.get(sessionId)
  if (!game || game.players.some((p) => p.userId === userId)) return

  const sp = await prisma.sessionPlayer.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    include: { user: true },
  })
  if (!sp || sp.cashedOut || sp.transferStatus !== "CONFIRMED" || sp.chips <= 0) return

  game.players.push({
    userId: sp.userId,
    displayName: sp.user.displayName,
    seatNumber: sp.seatNumber,
    chips: sp.chips,
    holeCards: [],
    currentBet: 0,
    totalInPot: 0,
    status: "sitting_out",
    isBot: sp.user.isBot,
    avatarColor: sp.user.avatarColor,
    avatarUrl: sp.user.avatarUrl,
    botKey: sp.user.botKey,
  })
  game.players.sort((a, b) => a.seatNumber - b.seatNumber)
  broadcastGameState(io, sessionId, game)
}

// Guards against two sockets rebuilding the same game concurrently
const restoringGames = new Set<string>()

// After a server restart the in-memory game is gone but the session is still
// ACTIVE in the DB — rebuild from persisted chips and deal the next hand.
async function restoreGameIfActive(io: IO, sessionId: string) {
  if (activeGames.has(sessionId) || restoringGames.has(sessionId)) return
  restoringGames.add(sessionId)
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { players: { include: { user: true }, orderBy: { seatNumber: "asc" } } },
    })
    if (!session || session.status !== "ACTIVE") return
    if (activeGames.has(sessionId)) return

    const playable = session.players.filter((p) => !p.cashedOut && p.chips > 0)
    if (playable.length === 0) return

    // Continue hand numbering from what's already saved
    const handCount = await prisma.hand.count({ where: { sessionId } })
    const gameState = buildGameState(sessionId, session, handCount)
    dispatchResult(io, sessionId, startHand(gameState))
  } finally {
    restoringGames.delete(sessionId)
  }
}

// Applies an action if (and only if) it is that player's turn, then broadcasts
function applyPlayerAction(io: IO, sessionId: string, userId: string, action: EngineAction) {
  const game = activeGames.get(sessionId)
  if (!game || game.phase !== "playing") return
  const current = getCurrentPlayer(game)
  if (!current || current.userId !== userId) return

  dispatchResult(io, sessionId, applyAction(game, userId, action))
}

// Common post-engine flow: store state, emit events, arm timers, handle hand end
function dispatchResult(io: IO, sessionId: string, result: { state: GameState; events: GameEvent[] }) {
  const { state, events } = result
  activeGames.set(sessionId, state)

  for (const event of events) {
    io.to(sessionId).emit("game_event", event)
  }
  broadcastGameState(io, sessionId, state)
  scheduleTurnTimer(io, sessionId, events)
  maybeScheduleBotAction(io, sessionId, events)

  if (state.phase === "ended") {
    clearTurnTimer(sessionId)
    clearBotTimer(sessionId)
    const winners = events.find((e) => e.type === "hand_ended")?.winners ?? []
    void saveHandToDb(state, sessionId, winners)
    setTimeout(() => startNextHand(io, sessionId), NEXT_HAND_DELAY_MS)
  }
}

function startNextHand(io: IO, sessionId: string) {
  const current = activeGames.get(sessionId)
  if (!current || current.phase === "playing") return
  const dealable = current.players.filter((p) => p.chips > 0 && !p.wantsSitOut)
  if (dealable.length === 0) return
  // Pause when nobody is watching (e.g. a bots-only table with no spectators)
  const room = io.sockets.adapter.rooms.get(sessionId)
  if (!room || room.size === 0) return
  dispatchResult(io, sessionId, startHand(current))
}

function scheduleTurnTimer(io: IO, sessionId: string, events: GameEvent[]) {
  clearTurnTimer(sessionId)
  const turnEvent = [...events].reverse().find((e) => e.type === "next_turn")
  if (!turnEvent) return

  const timer = setTimeout(() => {
    turnTimers.delete(sessionId)
    const game = activeGames.get(sessionId)
    if (!game || game.phase !== "playing") return
    const current = getCurrentPlayer(game)
    if (!current || current.userId !== turnEvent.userId) return

    const toCall = game.currentBet - current.currentBet
    const action: EngineAction = toCall > 0 ? { type: "fold" } : { type: "check" }
    applyPlayerAction(io, sessionId, current.userId, action)
  }, turnEvent.timeoutMs + TURN_GRACE_MS)

  turnTimers.set(sessionId, timer)
}

function clearTurnTimer(sessionId: string) {
  const timer = turnTimers.get(sessionId)
  if (timer) clearTimeout(timer)
  turnTimers.delete(sessionId)
}

function clearBotTimer(sessionId: string) {
  const timer = botTimers.get(sessionId)
  if (timer) clearTimeout(timer)
  botTimers.delete(sessionId)
}

// ---- Internal bots ----

// If the next player to act is an internal bot, think briefly and act
function maybeScheduleBotAction(io: IO, sessionId: string, events: GameEvent[]) {
  clearBotTimer(sessionId)
  const turnEvent = [...events].reverse().find((e) => e.type === "next_turn")
  if (!turnEvent) return
  const game = activeGames.get(sessionId)
  if (!game || game.phase !== "playing") return
  const current = getCurrentPlayer(game)
  if (!current || current.userId !== turnEvent.userId) return
  if (!current.isBot || !current.botKey || !INTERNAL_BOTS[current.botKey]) return

  const thinkMs = BOT_THINK_MIN_MS + Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS)
  const timer = setTimeout(async () => {
    botTimers.delete(sessionId)
    const g = activeGames.get(sessionId)
    if (!g || g.phase !== "playing") return
    const cur = getCurrentPlayer(g)
    if (!cur || cur.userId !== turnEvent.userId || !cur.botKey) return

    const action = await decideBotAction(g, cur)
    applyPlayerAction(io, sessionId, cur.userId, action)
  }, thinkMs)
  botTimers.set(sessionId, timer)
}

async function decideBotAction(game: GameState, bot: PlayerState): Promise<EngineAction> {
  const fallback: EngineAction = game.currentBet - bot.currentBet > 0 ? { type: "fold" } : { type: "check" }
  const internal = bot.botKey ? INTERNAL_BOTS[bot.botKey] : undefined
  if (!internal) return fallback

  try {
    const decision = await internal.decide(buildBotView(game, bot))
    return sanitizeBotDecision(decision, game, bot)
  } catch (e) {
    console.error(`[bots] ${bot.botKey} crashed, folding:`, e)
    return fallback
  }
}

function buildBotView(game: GameState, bot: PlayerState): BotView {
  return {
    handNumber: game.handNumber,
    street: game.street,
    holeCards: bot.holeCards,
    communityCards: game.communityCards,
    pot: game.pot,
    currentBet: game.currentBet,
    toCall: Math.min(game.currentBet - bot.currentBet, bot.chips),
    minRaise: game.minRaise,
    myStack: bot.chips,
    myBet: bot.currentBet,
    mySeat: bot.seatNumber,
    dealerSeat: game.dealerSeat,
    smallBlind: game.smallBlind,
    bigBlind: game.bigBlind,
    players: game.players.map((p) => ({
      seatNumber: p.seatNumber,
      displayName: p.displayName,
      chips: p.chips,
      currentBet: p.currentBet,
      status: p.status,
      isBot: p.isBot,
    })),
  }
}

// Turn a (possibly illegal) bot decision into a legal engine action
function sanitizeBotDecision(decision: BotDecision, game: GameState, bot: PlayerState): EngineAction {
  const toCall = game.currentBet - bot.currentBet
  switch (decision.action) {
    case "check":
      return toCall > 0 ? { type: "fold" } : { type: "check" }
    case "fold":
      return toCall > 0 ? { type: "fold" } : { type: "check" }
    case "call":
      return toCall > 0 ? { type: "call" } : { type: "check" }
    case "raise": {
      const maxTo = bot.chips + bot.currentBet
      if (bot.chips <= toCall) return { type: "call" } // can't raise, calling is all-in
      const target = Math.max(game.minRaise, Math.min(decision.amount ?? game.minRaise, maxTo))
      if (target >= maxTo) return { type: "all_in" }
      return { type: "raise", amount: target }
    }
    default:
      return toCall > 0 ? { type: "fold" } : { type: "check" }
  }
}

// ---- State fan-out ----

function emitGameState(socket: Sock, state: GameState, userId?: string) {
  const sanitized = sanitizeForPlayer(state, userId)
  socket.emit("game_state", sanitized)
}

function broadcastGameState(io: IO, sessionId: string, state: GameState) {
  const sockets = io.sockets.adapter.rooms.get(sessionId)
  if (!sockets) return
  for (const socketId of sockets) {
    const sock = io.sockets.sockets.get(socketId)
    const uid = sock?.data.userId as string | undefined
    const sanitized = sanitizeForPlayer(state, uid)
    sock?.emit("game_state", sanitized)
  }
}

function sanitizeForPlayer(state: GameState, userId?: string) {
  return {
    ...state,
    deck: [],
    players: state.players.map((p) => ({
      ...p,
      holeCards: p.userId === userId ? p.holeCards : (p.status === "folded" ? [] : p.holeCards.map(() => "??" as Card)),
    })),
    yourHoleCards: state.players.find((p) => p.userId === userId)?.holeCards ?? [],
  }
}

async function broadcastSessionUpdate(io: IO, sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { players: { include: { user: true }, orderBy: { seatNumber: "asc" } } },
  })
  if (!session) return

  io.to(sessionId).emit("session_update", {
    status: session.status,
    players: session.players.map((p) => ({
      userId: p.userId,
      displayName: p.user.displayName,
      seatNumber: p.seatNumber,
      chips: p.chips,
      transferStatus: p.transferStatus as "PENDING" | "SENT" | "CONFIRMED",
      isBot: p.user.isBot,
      avatarColor: p.user.avatarColor,
      avatarUrl: p.user.avatarUrl,
      cashedOut: p.cashedOut,
      cashOutRequested: p.cashOutRequested,
    })),
  })
}

async function saveHandToDb(
  state: GameState,
  sessionId: string,
  winners: { userId: string; amount: number; handDescription?: string }[]
) {
  try {
    await prisma.hand.upsert({
      where: { sessionId_handNumber: { sessionId, handNumber: state.handNumber } },
      create: {
        sessionId,
        handNumber: state.handNumber,
        dealerSeat: state.dealerSeat,
        smallBlindSeat: state.smallBlindSeat,
        bigBlindSeat: state.bigBlindSeat,
        communityCards: JSON.stringify(state.communityCards),
        pot: state.pot,
        status: "COMPLETE",
        endedAt: new Date(),
        winnersJson: JSON.stringify(winners),
      },
      update: {
        pot: state.pot,
        status: "COMPLETE",
        endedAt: new Date(),
        winnersJson: JSON.stringify(winners),
      },
    })
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        players: {
          updateMany: state.players.map((p) => ({
            where: { sessionId, userId: p.userId },
            data: { chips: p.chips },
          })),
        },
      },
    })
  } catch (e) {
    console.error("[handlers] saveHandToDb failed:", e)
  }
}
