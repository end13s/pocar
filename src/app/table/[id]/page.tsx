"use client"

import { use, useState, useEffect, useRef, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSocket } from "@/lib/socket/client"
import { ClientGameState } from "@/types/socket"
import { GameEvent, EngineAction } from "@/lib/poker/engine"
import { Card } from "@/lib/poker/deck"
import { bestHand } from "@/lib/poker/evaluator"
import { fmtMoney } from "@/lib/format"
import PokerTable, { TurnInfo, WinnerInfo } from "@/components/poker/PokerTable"
import ActionBar from "@/components/poker/ActionBar"
import { SpadeIcon, CardsIcon } from "@/components/Icons"

function actionLabel(action: EngineAction): string {
  switch (action.type) {
    case "fold": return "Fold"
    case "check": return "Check"
    case "call": return "Call"
    case "raise": return `Raise ${fmtMoney(action.amount)}`
    case "all_in": return "All-in"
  }
}

export default function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: authSession, status: authStatus } = useSession()
  const router = useRouter()
  const userId = authSession?.user?.id

  const [game, setGame] = useState<ClientGameState | null>(null)
  const [turn, setTurn] = useState<TurnInfo | null>(null)
  const [lastActions, setLastActions] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, Card[]>>({})
  const [winners, setWinners] = useState<WinnerInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const turnCounter = useRef(0)

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login")
  }, [authStatus, router])

  useEffect(() => {
    if (!userId) return
    const socket = getSocket(userId)

    const onGameState = (state: ClientGameState) => setGame(state)

    const onGameEvent = (event: GameEvent) => {
      switch (event.type) {
        case "hand_started":
          setWinners(null)
          setRevealed({})
          setLastActions({})
          setTurn(null)
          break
        case "next_turn":
          turnCounter.current += 1
          setTurn({ userId: event.userId, timeoutMs: event.timeoutMs, key: `turn-${turnCounter.current}` })
          break
        case "player_action":
          setLastActions((prev) => ({ ...prev, [event.userId]: actionLabel(event.action) }))
          break
        case "street_changed":
          setLastActions({})
          break
        case "showdown":
          setRevealed(Object.fromEntries(event.results.map((r) => [r.userId, r.holeCards])))
          break
        case "hand_ended":
          setWinners(event.winners)
          setTurn(null)
          break
      }
    }

    const onSessionUpdate = (data: { status: string }) => {
      // Not started yet or already over — the session page is the right place
      if (data.status === "WAITING_BUYIN" || data.status === "ENDED") router.replace(`/session/${id}`)
    }

    const onError = (msg: string) => setError(msg)

    socket.on("game_state", onGameState)
    socket.on("game_event", onGameEvent)
    socket.on("session_update", onSessionUpdate)
    socket.on("error", onError)
    socket.emit("join_session", id)

    return () => {
      socket.off("game_state", onGameState)
      socket.off("game_event", onGameEvent)
      socket.off("session_update", onSessionUpdate)
      socket.off("error", onError)
      socket.emit("leave_session", id)
    }
  }, [userId, id, router])

  const isMyTurn = !!userId && turn?.userId === userId && !winners
  const me = game?.players.find((p) => p.userId === userId)
  const sittingOut = !!me && (me.wantsSitOut || me.status === "sitting_out")

  const handHint = useMemo(() => {
    if (!game || game.yourHoleCards.length < 2 || game.communityCards.length < 3) return null
    try {
      return bestHand(game.yourHoleCards, game.communityCards).description
    } catch {
      return null
    }
  }, [game])

  if (authStatus === "loading" || !userId) return null

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SpadeIcon size={20} className="text-gold" />
          <span className="text-gold font-semibold tracking-wide">pocăr</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {game && (
            <span className="text-muted font-mono">
              Blinds {fmtMoney(game.smallBlind)} / {fmtMoney(game.bigBlind)}
            </span>
          )}
          {me && (
            sittingOut ? (
              <button
                onClick={() => getSocket(userId).emit("sit_back", id)}
                className="text-chip-green font-semibold hover:opacity-80 transition-opacity"
              >
                I&apos;m back
              </button>
            ) : (
              <button
                onClick={() => getSocket(userId).emit("sit_out", id)}
                className="text-faint hover:text-muted transition-colors"
              >
                Sit out
              </button>
            )
          )}
          <Link href={`/session/${id}`} className="text-faint hover:text-muted transition-colors">Cash out</Link>
          <button
            onClick={() => {
              if (confirm("Leave the table? Your chips stay on the session ledger until you cash out.")) {
                getSocket(userId).emit("leave_table", id)
                router.push("/lobby")
              }
            }}
            className="text-red-card/80 hover:text-red-card transition-colors"
          >
            Leave
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-auto px-4 py-2 rounded bg-red-card/10 border border-red-card/30 text-red-card text-sm">
          {error}
        </div>
      )}

      <main className="flex-1 flex flex-col justify-center px-4 py-2">
        {game ? (
          <PokerTable
            game={game}
            userId={userId}
            turn={turn}
            lastActions={lastActions}
            revealed={revealed}
            winners={winners}
          />
        ) : (
          <div className="text-center text-faint py-20">
            <CardsIcon size={40} className="mx-auto mb-3" />
            <p>Connecting to the table…</p>
          </div>
        )}
      </main>

      <footer className="px-4 pb-4">
        {game && (
          <ActionBar
            game={game}
            userId={userId}
            isMyTurn={isMyTurn}
            onAction={(action) => getSocket(userId).emit("player_action", { sessionId: id, action })}
            handHint={handHint}
          />
        )}
      </footer>
    </div>
  )
}
