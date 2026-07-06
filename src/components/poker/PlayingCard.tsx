import { Card } from "@/lib/poker/deck"

const SUIT_SYMBOL: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" }
const SUIT_RED = new Set(["h", "d"])

const SIZES = {
  sm: "w-7 h-10 rounded-[4px] text-[11px]",
  md: "w-10 h-14 rounded-md text-base",
  lg: "w-12 h-[4.25rem] rounded-md text-lg",
} as const

export type CardSize = keyof typeof SIZES

interface Props {
  card?: Card | "??" | null
  size?: CardSize
  // stagger for the deal-in animation, in ms; undefined = no animation
  dealDelay?: number
}

export default function PlayingCard({ card, size = "md", dealDelay }: Props) {
  const sizeCls = SIZES[size]
  const anim = dealDelay !== undefined
    ? { animation: `deal-in 0.3s ease-out ${dealDelay}ms backwards` }
    : undefined

  // Empty slot (e.g. turn/river not dealt yet)
  if (!card) {
    return <div className={`${sizeCls} border border-white/10 bg-black/10`} />
  }

  // Face-down card
  if (card === "??") {
    return (
      <div
        className={`${sizeCls} bg-gradient-to-br from-[#7a2230] to-[#45121c] border border-[#a05a3a]/40 shadow-md shadow-black/40 flex items-center justify-center`}
        style={anim}
      >
        <div className="w-[70%] h-[78%] rounded-[3px] border border-[#c9a55a]/30 flex items-center justify-center">
          <span className="text-[#c9a55a]/40 text-[0.9em]">♠</span>
        </div>
      </div>
    )
  }

  const rank = card[0] === "T" ? "10" : card[0]
  const suit = card[1]
  const color = SUIT_RED.has(suit) ? "text-[#c92a2a]" : "text-[#1a1a2a]"

  return (
    <div
      className={`${sizeCls} bg-[#faf7ee] shadow-md shadow-black/50 flex flex-col items-center justify-center leading-none select-none ${color}`}
      style={anim}
    >
      <span className="font-bold" style={{ fontSize: "1em" }}>{rank}</span>
      <span style={{ fontSize: "0.95em" }}>{SUIT_SYMBOL[suit]}</span>
    </div>
  )
}
