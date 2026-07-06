"use client"

import { useState, useMemo } from "react"
import { ClientGameState } from "@/types/socket"
import { EngineAction } from "@/lib/poker/engine"
import { fmtMoney } from "@/lib/format"

interface Props {
  game: ClientGameState
  userId: string
  isMyTurn: boolean
  onAction: (action: EngineAction) => void
  handHint: string | null
}

export default function ActionBar({ game, userId, isMyTurn, onAction, handHint }: Props) {
  const me = game.players.find((p) => p.userId === userId)

  const toCall = me ? Math.min(game.currentBet - me.currentBet, me.chips) : 0
  const canCheck = toCall <= 0
  const maxRaiseTo = me ? me.chips + me.currentBet : 0
  const minRaiseTo = Math.min(game.minRaise, maxRaiseTo)
  const canRaise = me ? me.chips > toCall : false

  const [raiseTo, setRaiseTo] = useState(minRaiseTo)
  const [showSlider, setShowSlider] = useState(false)

  // Reset the slider whenever a new decision starts (state adjusted during render)
  const decisionKey = `${isMyTurn}-${game.street}-${minRaiseTo}`
  const [prevDecisionKey, setPrevDecisionKey] = useState(decisionKey)
  if (prevDecisionKey !== decisionKey) {
    setPrevDecisionKey(decisionKey)
    setRaiseTo(minRaiseTo)
    setShowSlider(false)
  }

  const presets = useMemo(() => {
    const potAfterCall = game.pot + toCall
    const clamp = (v: number) => Math.max(minRaiseTo, Math.min(maxRaiseTo, Math.round(v)))
    return [
      { label: "Min", value: minRaiseTo },
      { label: "½ Pot", value: clamp(game.currentBet + potAfterCall * 0.5) },
      { label: "¾ Pot", value: clamp(game.currentBet + potAfterCall * 0.75) },
      { label: "Pot", value: clamp(game.currentBet + potAfterCall) },
      { label: "All-in", value: maxRaiseTo },
    ]
  }, [game.pot, game.currentBet, toCall, minRaiseTo, maxRaiseTo])

  if (!me || me.status === "folded" || me.status === "sitting_out" || me.wantsSitOut) {
    return (
      <div className="h-20 flex items-center justify-center text-faint text-sm">
        {me?.wantsSitOut
          ? "Sitting out — press “I'm back” to be dealt in next hand"
          : me?.status === "sitting_out"
            ? (me.chips > 0 ? "You'll be dealt in next hand" : "Out of chips")
            : me?.status === "folded" ? "You folded — waiting for next hand" : ""}
      </div>
    )
  }

  if (!isMyTurn || me.status === "all_in") {
    return (
      <div className="h-20 flex flex-col items-center justify-center gap-1">
        {handHint && <span className="text-muted text-xs">Your hand: <span className="text-gold">{handHint}</span></span>}
        <span className="text-faint text-sm">
          {me.status === "all_in" ? "All-in — waiting for showdown" : "Waiting for other players…"}
        </span>
      </div>
    )
  }

  const callIsAllIn = toCall >= me.chips
  const raiseIsAllIn = raiseTo >= maxRaiseTo

  return (
    <div className="flex flex-col items-center gap-2 pb-1">
      {handHint && <span className="text-muted text-xs">Your hand: <span className="text-gold">{handHint}</span></span>}

      {/* Raise slider panel */}
      {showSlider && canRaise && (
        <div className="flex flex-col items-center gap-2 bg-black/70 border border-border rounded-xl px-4 py-3 w-full max-w-xl pop-in">
          <div className="flex gap-2 w-full justify-center">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setRaiseTo(p.value)}
                className={`px-3 py-1 rounded text-xs font-semibold border transition-colors
                  ${raiseTo === p.value ? "bg-gold text-background border-gold" : "bg-surface-2 text-muted border-border hover:text-foreground"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 w-full">
            <input
              type="range"
              min={minRaiseTo}
              max={maxRaiseTo}
              step={Math.max(game.smallBlind, 1)}
              value={raiseTo}
              onChange={(e) => setRaiseTo(parseInt(e.target.value))}
              className="flex-1 accent-[#c9a55a]"
            />
            <span className="text-gold font-mono font-semibold text-sm w-20 text-right">{fmtMoney(raiseTo)}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-stretch gap-3">
        <button
          onClick={() => onAction({ type: "fold" })}
          className="w-32 py-3 rounded-lg font-bold text-sm bg-[#8a2a2a] hover:bg-[#a33333] text-white shadow-lg shadow-black/30 transition-colors"
        >
          Fold
        </button>

        {canCheck ? (
          <button
            onClick={() => onAction({ type: "check" })}
            className="w-32 py-3 rounded-lg font-bold text-sm bg-surface-2 hover:bg-border text-foreground border border-border shadow-lg shadow-black/30 transition-colors"
          >
            Check
          </button>
        ) : (
          <button
            onClick={() => onAction(callIsAllIn ? { type: "all_in" } : { type: "call" })}
            className="w-32 py-3 rounded-lg font-bold text-sm bg-chip-green hover:opacity-90 text-white shadow-lg shadow-black/30 transition-opacity"
          >
            {callIsAllIn ? `All-in ${fmtMoney(me.chips)}` : `Call ${fmtMoney(toCall)}`}
          </button>
        )}

        {canRaise && (
          showSlider ? (
            <button
              onClick={() => onAction(raiseIsAllIn ? { type: "all_in" } : { type: "raise", amount: raiseTo })}
              className="w-40 py-3 rounded-lg font-bold text-sm bg-gold hover:bg-gold-dim text-background shadow-lg shadow-black/30 transition-colors"
            >
              {raiseIsAllIn ? `All-in ${fmtMoney(maxRaiseTo)}` : `${game.currentBet > 0 ? "Raise to" : "Bet"} ${fmtMoney(raiseTo)}`}
            </button>
          ) : (
            <button
              onClick={() => setShowSlider(true)}
              className="w-40 py-3 rounded-lg font-bold text-sm bg-gold hover:bg-gold-dim text-background shadow-lg shadow-black/30 transition-colors"
            >
              {game.currentBet > 0 ? "Raise" : "Bet"}
            </button>
          )
        )}
      </div>
    </div>
  )
}
