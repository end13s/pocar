"use client"

import { use, useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSocket } from "@/lib/socket/client"
import { SessionPlayerInfo } from "@/types/socket"
import { fmtMoney } from "@/lib/format"
import { SpadeIcon, CoinsIcon, CheckIcon } from "@/components/Icons"
import Avatar from "@/components/Avatar"

interface SessionDetail {
  id: string
  name: string
  status: string
  buyIn: number
  smallBlind: number
  bigBlind: number
  maxPlayers: number
  isVirtual: boolean
  tableType: string
  host: { id: string; displayName: string }
}

interface BotCatalog {
  internal: { key: string; name: string; description: string }[]
  external: { id: string; displayName: string }[]
}

// Socket payload plus ledger fields that only the REST endpoint provides
type PlayerRow = SessionPlayerInfo & { buyInAmount?: number; cashOutAmount?: number | null }

const STATUS_BADGE: Record<SessionPlayerInfo["transferStatus"], { label: string; cls: string }> = {
  PENDING: { label: "Waiting for transfer", cls: "text-faint bg-surface-2" },
  SENT: { label: "Sent — awaiting host", cls: "text-gold bg-gold/10" },
  CONFIRMED: { label: "Confirmed", cls: "text-chip-green bg-chip-green/10" },
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: authSession, status: authStatus } = useSession()
  const router = useRouter()
  const userId = authSession?.user?.id

  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [sessionStatus, setSessionStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bots, setBots] = useState<BotCatalog | null>(null)
  const [selectedBot, setSelectedBot] = useState("")
  const prevStatus = useRef<string | null>(null)

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login")
  }, [authStatus, router])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/sessions/${id}`).then(async (res) => {
      if (!res.ok) return
      const data = await res.json()
      if (cancelled) return
      setDetail(data)
      setSessionStatus(data.status)
      prevStatus.current = data.status
      setPlayers(
        data.players.map((p: { userId: string; seatNumber: number; chips: number; transferStatus: string; cashedOut: boolean; cashOutRequested: boolean; buyInAmount: number; cashOutAmount: number | null; user: { displayName: string; isBot: boolean; avatarColor: string; avatarUrl: string | null } }) => ({
          userId: p.userId,
          displayName: p.user.displayName,
          seatNumber: p.seatNumber,
          chips: p.chips,
          transferStatus: p.transferStatus,
          isBot: p.user.isBot,
          avatarColor: p.user.avatarColor,
          avatarUrl: p.user.avatarUrl,
          cashedOut: p.cashedOut,
          cashOutRequested: p.cashOutRequested,
          buyInAmount: p.buyInAmount,
          cashOutAmount: p.cashOutAmount,
        }))
      )
    })
    return () => { cancelled = true }
  }, [id])

  // Socket: live updates; redirect to the table only on the WAITING → ACTIVE transition
  useEffect(() => {
    if (!userId) return
    const socket = getSocket(userId)

    const onSessionUpdate = (data: { status: string; players: SessionPlayerInfo[] }) => {
      if (prevStatus.current === "WAITING_BUYIN" && data.status === "ACTIVE") {
        router.push(`/table/${id}`)
      }
      prevStatus.current = data.status
      setSessionStatus(data.status)
      setPlayers((prev) =>
        data.players.map((p) => ({
          ...prev.find((old) => old.userId === p.userId),
          ...p,
        }))
      )
    }
    const onError = (msg: string) => setError(msg)

    socket.on("session_update", onSessionUpdate)
    socket.on("error", onError)
    socket.emit("join_session", id)

    return () => {
      socket.off("session_update", onSessionUpdate)
      socket.off("error", onError)
    }
  }, [userId, id, router])

  // Bot catalog for the host's "Add bot" control
  useEffect(() => {
    let cancelled = false
    fetch("/api/bots").then(async (res) => {
      if (res.ok && !cancelled) setBots(await res.json())
    })
    return () => { cancelled = true }
  }, [])

  // REST changes (add/remove bot) don't broadcast — re-joining the room does
  function refreshRoom() {
    if (userId) getSocket(userId).emit("join_session", id)
  }

  async function addBot() {
    if (!selectedBot) return
    const [kind, value] = selectedBot.split(":")
    const res = await fetch(`/api/sessions/${id}/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "internal" ? { botKey: value } : { botUserId: value }),
    })
    if (res.ok) refreshRoom()
    else setError((await res.json().catch(() => ({}))).error ?? "Could not add bot")
  }

  async function removeBot(botUserId: string) {
    const res = await fetch(`/api/sessions/${id}/bots`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: botUserId }),
    })
    if (res.ok) refreshRoom()
  }

  if (authStatus === "loading" || !detail || !userId) return null

  const isHost = detail.host.id === userId
  const me = players.find((p) => p.userId === userId)
  const allConfirmed = players.length >= 1 && players.every((p) => p.transferStatus === "CONFIRMED")
  const isWaiting = sessionStatus === "WAITING_BUYIN"
  const isActive = sessionStatus === "ACTIVE"
  const isEnded = sessionStatus === "ENDED"
  const allCashedOut = players.every((p) => p.cashedOut)

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SpadeIcon size={22} className="text-gold" />
          <span className="text-gold font-semibold tracking-wide text-lg">pocăr</span>
        </div>
        <Link href="/lobby" className="text-faint text-sm hover:text-muted transition-colors">← Back to lobby</Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{detail.name}</h1>
            {detail.isVirtual && (
              <span className="flex items-center gap-1 text-xs text-gold bg-gold/10 px-2 py-1 rounded">
                <CoinsIcon size={12} />
                Play money
              </span>
            )}
            {isEnded && <span className="text-xs text-muted bg-surface-2 px-2 py-1 rounded">Ended</span>}
          </div>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted">
            <span>Buy-in: {fmtMoney(detail.buyIn)}</span>
            <span>·</span>
            <span>Blinds: {fmtMoney(detail.smallBlind)} / {fmtMoney(detail.bigBlind)}</span>
            <span>·</span>
            <span>Host: {detail.host.displayName}</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded bg-red-card/10 border border-red-card/30 text-red-card text-sm">
            {error}
          </div>
        )}

        {/* Buy-in instructions (real money only; also for late joiners on live tables) */}
        {(isWaiting || isActive) && me && me.transferStatus === "PENDING" && !isHost && !detail.isVirtual && (
          <div className="mb-6 bg-surface border border-gold/40 rounded-lg p-5">
            <h3 className="text-gold font-semibold mb-1">Buy-in required</h3>
            <p className="text-muted text-sm mb-4">
              Send <span className="text-foreground font-semibold">{fmtMoney(detail.buyIn)}</span> to{" "}
              <span className="text-foreground font-semibold">{detail.host.displayName}</span> via Revolut, then confirm below.
              The app only tracks the transfer — money goes directly to the host.
            </p>
            <button
              onClick={() => getSocket(userId).emit("confirm_transfer_sent", id)}
              className="bg-gold text-background px-5 py-2.5 rounded font-semibold text-sm hover:bg-gold-dim transition-colors"
            >
              I sent the money
            </button>
          </div>
        )}

        {/* Active game banner */}
        {isActive && (
          <div className="mb-6 bg-surface border border-chip-green/40 rounded-lg p-5 flex items-center justify-between">
            <div>
              <h3 className="text-chip-green font-semibold">Game in progress</h3>
              <p className="text-muted text-sm mt-0.5">Cash-outs are settled here, on this page.</p>
            </div>
            <Link
              href={`/table/${id}`}
              className="bg-chip-green text-white px-5 py-2.5 rounded font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Open table
            </Link>
          </div>
        )}

        {/* Players list */}
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <span className="text-foreground font-semibold text-sm">Players ({players.length}/{detail.maxPlayers})</span>
            <span className="text-faint text-xs">{isWaiting ? "Seats by join order" : "Session ledger"}</span>
          </div>
          <div className="divide-y divide-border">
            {players.map((p) => {
              const badge = STATUS_BADGE[p.transferStatus]
              const net = p.cashedOut && p.cashOutAmount != null && p.buyInAmount != null
                ? p.cashOutAmount - p.buyInAmount
                : null
              return (
                <div key={p.userId} className="px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.displayName} color={p.avatarColor} url={p.avatarUrl} isBot={p.isBot} size={32} />
                    <div>
                      <span className="text-foreground text-sm font-medium">
                        {p.displayName}
                        {p.userId === detail.host.id && <span className="text-gold text-xs ml-2">HOST</span>}
                        {p.userId === userId && <span className="text-faint text-xs ml-2">(you)</span>}
                      </span>
                      {!isWaiting && (
                        <div className="text-xs text-muted mt-0.5">
                          {p.cashedOut
                            ? <>Cashed out {fmtMoney(p.cashOutAmount ?? 0)}{net != null && (
                                <span className={net >= 0 ? "text-chip-green" : "text-red-card"}> ({net >= 0 ? "+" : ""}{fmtMoney(net)})</span>
                              )}</>
                            : <>Chips: {fmtMoney(p.chips)}</>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(isWaiting || (isActive && p.transferStatus !== "CONFIRMED")) && (
                      <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${badge.cls}`}>
                        {p.transferStatus === "CONFIRMED" && <CheckIcon size={11} />}
                        {badge.label}
                      </span>
                    )}
                    {isWaiting && isHost && p.isBot && (
                      <button
                        onClick={() => removeBot(p.userId)}
                        className="text-xs text-red-card hover:underline"
                      >
                        Remove
                      </button>
                    )}
                    {(isWaiting || isActive) && isHost && p.transferStatus !== "CONFIRMED" && !p.cashedOut && (
                      <button
                        onClick={() => getSocket(userId).emit("host_confirm_transfer", { sessionId: id, userId: p.userId })}
                        className="text-xs bg-chip-green text-white px-3 py-1.5 rounded font-semibold hover:opacity-90 transition-opacity"
                      >
                        Confirm received
                      </button>
                    )}
                    {isActive && !p.cashedOut && p.userId === userId && !p.cashOutRequested && (
                      <button
                        onClick={() => getSocket(userId).emit("request_cashout", id)}
                        className="text-xs bg-surface-2 border border-border text-foreground px-3 py-1.5 rounded font-semibold hover:border-gold transition-colors"
                      >
                        Request cash-out
                      </button>
                    )}
                    {isActive && p.cashOutRequested && !p.cashedOut && (
                      <span className="text-xs text-gold bg-gold/10 px-2.5 py-1 rounded-full">Cash-out requested</span>
                    )}
                    {isActive && isHost && p.cashOutRequested && !p.cashedOut && (
                      <button
                        onClick={() => getSocket(userId).emit("host_confirm_cashout", { sessionId: id, userId: p.userId })}
                        className="text-xs bg-gold text-background px-3 py-1.5 rounded font-semibold hover:bg-gold-dim transition-colors"
                      >
                        Confirm paid {fmtMoney(p.chips)}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Add bot (host, before start, not on humans-only tables) */}
        {isWaiting && isHost && detail.tableType !== "HUMANS_ONLY" && bots && (
          <div className="mt-6 bg-surface border border-border rounded-lg p-4 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-foreground">Add bot:</span>
            <select
              value={selectedBot}
              onChange={(e) => setSelectedBot(e.target.value)}
              className="flex-1 min-w-40 bg-surface-2 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:border-gold text-sm"
            >
              <option value="">Choose a bot…</option>
              <optgroup label="Built-in">
                {bots.internal.map((b) => (
                  <option key={b.key} value={`internal:${b.key}`}>{b.name} — {b.description}</option>
                ))}
              </optgroup>
              {bots.external.length > 0 && (
                <optgroup label="Your external bots">
                  {bots.external.map((b) => (
                    <option key={b.id} value={`external:${b.id}`}>{b.displayName}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              onClick={addBot}
              disabled={!selectedBot}
              className="bg-gold text-background px-4 py-2 rounded font-semibold text-sm hover:bg-gold-dim transition-colors disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}

        {/* Host controls */}
        {isWaiting && isHost && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              onClick={() => getSocket(userId).emit("host_start_game", id)}
              disabled={!allConfirmed}
              className="bg-gold text-background px-8 py-3 rounded-lg font-bold hover:bg-gold-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Start Game
            </button>
            {!allConfirmed && (
              <span className="text-faint text-xs">All players must be confirmed first</span>
            )}
          </div>
        )}
        {isWaiting && !isHost && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <p className="text-center text-faint text-sm">Waiting for {detail.host.displayName} to start the game…</p>
            <button
              onClick={() => {
                getSocket(userId).emit("leave_table", id)
                router.push("/lobby")
              }}
              className="text-sm text-red-card hover:underline"
            >
              Leave table
            </button>
          </div>
        )}
        {isActive && isHost && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              onClick={() => {
                if (confirm("End this session? The game stops for everyone.")) {
                  getSocket(userId).emit("host_end_session", id)
                }
              }}
              className="bg-red-card/80 text-white px-8 py-3 rounded-lg font-bold hover:bg-red-card transition-colors"
            >
              End Session
            </button>
            {!allCashedOut && (
              <span className="text-faint text-xs">Tip: confirm everyone&apos;s cash-out before ending</span>
            )}
          </div>
        )}
        {isEnded && (
          <p className="mt-6 text-center text-faint text-sm">This session has ended. The ledger above is final.</p>
        )}
      </main>
    </div>
  )
}
