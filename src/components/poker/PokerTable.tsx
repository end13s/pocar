"use client"

import { Card } from "@/lib/poker/deck"
import { ClientGameState } from "@/types/socket"
import { fmtMoney } from "@/lib/format"
import PlayingCard from "./PlayingCard"
import Seat from "./Seat"

export interface TurnInfo {
  userId: string
  timeoutMs: number
  key: string
}

export interface WinnerInfo {
  userId: string
  amount: number
  handDescription?: string
}

interface Props {
  game: ClientGameState
  userId: string
  turn: TurnInfo | null
  lastActions: Record<string, string>
  revealed: Record<string, Card[]>
  winners: WinnerInfo[] | null
}

// Position on a stadium (pill) outline — straight long sides, semicircular ends —
// hero (relIdx 0) at bottom center. A/B are half-extents in % of the container,
// whose aspect ratio is needed so the end caps stay circular in pixels.
const TABLE_ASPECT = 2

function stadiumPos(relIdx: number, total: number, A: number, B: number) {
  const angle = Math.PI / 2 + (relIdx / total) * Math.PI * 2
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const Rx = B / TABLE_ASPECT // cap radius converted to x-percent
  const c = A - Rx // cap center offset from middle

  // Cast a ray from the center and intersect it with the pill outline
  let t: number
  const tFlat = dy !== 0 ? B / Math.abs(dy) : Infinity
  if (Math.abs(tFlat * dx) <= c) {
    t = tFlat // hits a flat edge (top/bottom)
  } else {
    const cx = dx > 0 ? c : -c // hits the nearest end cap (ellipse in % space)
    const a = (dx * dx) / (Rx * Rx) + (dy * dy) / (B * B)
    const b = (-2 * cx * dx) / (Rx * Rx)
    const k = (cx * cx) / (Rx * Rx) - 1
    t = (-b + Math.sqrt(b * b - 4 * a * k)) / (2 * a)
  }

  return { left: `${50 + t * dx}%`, top: `${50 + t * dy}%` }
}

export default function PokerTable({ game, userId, turn, lastActions, revealed, winners }: Props) {
  const players = game.players
  const heroIdx = Math.max(0, players.findIndex((p) => p.userId === userId))
  const winnerNames = winners
    ?.map((w) => {
      const p = players.find((pl) => pl.userId === w.userId)
      return p ? `${p.displayName} wins ${fmtMoney(w.amount)}${w.handDescription ? ` — ${w.handDescription}` : ""}` : ""
    })
    .filter(Boolean)

  const boardSlots: (Card | null)[] = [0, 1, 2, 3, 4].map((i) => game.communityCards[i] ?? null)

  return (
    <div className="relative w-full max-w-6xl mx-auto aspect-[2/1]">
      {/* Rail */}
      <div className="absolute inset-[7%] rounded-full bg-gradient-to-b from-[#4a3220] to-[#2b1c0e] shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_2px_6px_rgba(255,255,255,0.08)]" />
      {/* Gold trim between rail and felt */}
      <div className="absolute inset-[9%] rounded-full border-[3px] border-[#d9a94a]/80" />
      {/* Felt */}
      <div
        className="absolute inset-[9.8%] rounded-full"
        style={{ background: "radial-gradient(ellipse at 50% 38%, #2e6a40 0%, #1f4a2c 55%, #16351f 100%)", boxShadow: "inset 0 6px 24px rgba(0,0,0,0.55)" }}
      />
      {/* Betting line */}
      <div className="absolute inset-[17%] rounded-full border border-[#c9a55a]/20" />

      {/* Table branding */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none" style={{ transform: "translateY(18%)" }}>
        <span className="text-[#c9a55a]/25 text-lg leading-none">♠</span>
        <span
          className="font-serif font-semibold text-[#c9a55a]/25 text-2xl md:text-3xl"
          style={{ letterSpacing: "0.45em", textIndent: "0.45em" }}
        >
          DEHELEAN
        </span>
        <div className="w-40 h-px bg-gradient-to-r from-transparent via-[#c9a55a]/25 to-transparent mt-1" />
      </div>

      {/* Center: pot + board + winner banner */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] uppercase tracking-widest text-[#c9a55a]/70">
            Hand #{game.handNumber} · {game.street}
          </span>
          {game.pot > 0 && (
            <span className="px-3 py-1 rounded-full bg-black/50 border border-[#c9a55a]/30 text-gold text-sm font-mono font-semibold">
              Pot {fmtMoney(game.pot)}
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          {boardSlots.map((c, i) => (
            <PlayingCard key={c ? `${i}-${c}` : `slot-${i}`} card={c} size="md" dealDelay={c ? i * 90 : undefined} />
          ))}
        </div>

        {winnerNames && winnerNames.length > 0 && (
          <div className="px-4 py-1.5 rounded-lg bg-black/75 border border-gold text-gold text-sm font-semibold pop-in">
            {winnerNames.map((n) => <div key={n} className="text-center">{n}</div>)}
          </div>
        )}
      </div>

      {/* Bets in front of players */}
      {players.map((p, i) => {
        if (p.currentBet <= 0) return null
        const relIdx = (i - heroIdx + players.length) % players.length
        const pos = stadiumPos(relIdx, players.length, 27, 24)
        return (
          <div
            key={`bet-${p.userId}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 pop-in"
            style={pos}
          >
            <div className="w-4 h-4 rounded-full bg-gradient-to-b from-[#d9b56a] to-[#9a7a3e] border border-[#e8d5a0]/60 shadow-sm" />
            <span className="text-[11px] font-mono font-semibold text-[#e8d5a0] drop-shadow">{fmtMoney(p.currentBet)}</span>
          </div>
        )
      })}

      {/* Dealer button */}
      {players.length > 0 && (() => {
        const dealerIdx = players.findIndex((p) => p.seatNumber === game.dealerSeat)
        if (dealerIdx === -1) return null
        const relIdx = (dealerIdx - heroIdx + players.length) % players.length
        const pos = stadiumPos(relIdx + 0.18, players.length, 33, 30)
        return (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#f5f0e0] text-[#1a1a2a] text-[10px] font-black flex items-center justify-center shadow-md border border-black/20"
            style={pos}
          >
            D
          </div>
        )
      })()}

      {/* Seats */}
      {players.map((p, i) => {
        const relIdx = (i - heroIdx + players.length) % players.length
        const pos = stadiumPos(relIdx, players.length, 43, 41)
        const win = winners?.find((w) => w.userId === p.userId)
        return (
          <div key={p.userId} className="absolute -translate-x-1/2 -translate-y-1/2" style={pos}>
            <Seat
              player={p}
              isHero={p.userId === userId}
              isTurn={turn?.userId === p.userId && !winners}
              turnTimeoutMs={turn?.userId === p.userId ? turn.timeoutMs : null}
              turnKey={turn?.key ?? "t"}
              lastAction={lastActions[p.userId] ?? null}
              revealedCards={revealed[p.userId] ?? null}
              heroCards={game.yourHoleCards}
              winAmount={win ? win.amount : null}
            />
          </div>
        )
      })}
    </div>
  )
}
