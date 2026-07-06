import { Card } from "@/lib/poker/deck"
import { PlayerState } from "@/lib/poker/gameState"
import { fmtMoney } from "@/lib/format"
import Avatar from "@/components/Avatar"
import PlayingCard from "./PlayingCard"

interface Props {
  player: PlayerState
  isHero: boolean
  isTurn: boolean
  turnTimeoutMs: number | null
  // unique per turn so the timer animation restarts
  turnKey: string
  lastAction: string | null
  // cards revealed at showdown (overrides masked cards)
  revealedCards: Card[] | null
  heroCards: Card[]
  winAmount: number | null
}

export default function Seat({
  player, isHero, isTurn, turnTimeoutMs, turnKey, lastAction, revealedCards, heroCards, winAmount,
}: Props) {
  const folded = player.status === "folded"
  const sittingOut = player.status === "sitting_out" || player.status === "waiting"
  const isWinner = winAmount !== null

  const cards: (Card | "??")[] = isHero
    ? heroCards
    : revealedCards ?? (folded ? [] : player.holeCards)

  return (
    <div className={`flex flex-col items-center gap-1 w-32 transition-opacity duration-300 ${folded || sittingOut ? "opacity-40" : ""}`}>
      {/* Hole cards */}
      <div className="flex gap-1 h-14 items-end">
        {cards.map((c, i) => (
          <PlayingCard key={`${i}-${c}`} card={c} size={isHero ? "md" : "sm"} />
        ))}
      </div>

      {/* Avatar + name plate */}
      <div className={`relative flex flex-col items-center rounded-xl px-3 py-1.5 min-w-28 bg-black/70 border transition-shadow duration-300
        ${isWinner ? "border-gold winner-glow" : isTurn ? "border-gold shadow-[0_0_14px_rgba(201,165,90,0.55)]" : "border-white/10"}`}
      >
        <div className="flex items-center gap-2 w-full">
          <Avatar
            name={player.displayName}
            color={player.avatarColor}
            url={player.avatarUrl}
            isBot={player.isBot}
            size={32}
            className={isHero ? "border-gold" : ""}
          />
          <div className="flex flex-col overflow-hidden">
            <span className="text-[11px] font-semibold text-foreground truncate max-w-[4.5rem]">
              {player.displayName}
            </span>
            <span className="text-[11px] text-gold font-mono">
              {player.status === "all_in" ? "All-in" : fmtMoney(player.chips)}
            </span>
          </div>
        </div>

        {/* Turn timer */}
        {isTurn && turnTimeoutMs && (
          <div className="w-full h-1 mt-1 rounded-full bg-white/10 overflow-hidden">
            <div
              key={turnKey}
              className="h-full rounded-full bg-gold"
              style={{ animation: `timer-shrink ${turnTimeoutMs}ms linear forwards` }}
            />
          </div>
        )}

        {/* Last action / win badge */}
        {isWinner ? (
          <div className="absolute -bottom-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gold text-background whitespace-nowrap pop-in">
            +{fmtMoney(winAmount)}
          </div>
        ) : lastAction ? (
          <div className="absolute -bottom-3 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-2 border border-white/15 text-foreground whitespace-nowrap pop-in">
            {lastAction}
          </div>
        ) : null}
      </div>
    </div>
  )
}
