import { BotIcon } from "@/components/Icons"

interface Props {
  name: string
  color?: string
  url?: string | null
  isBot?: boolean
  // diameter in px
  size?: number
  className?: string
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

// Photo if the user set one, otherwise initials on their chosen color
export default function Avatar({ name, color = "#3a5a3a", url, isBot, size = 32, className = "" }: Props) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data-URL avatars can't go through next/image
      <img
        src={url}
        alt={name}
        style={style}
        className={`rounded-full object-cover shrink-0 border border-white/15 ${className}`}
      />
    )
  }

  return (
    <span
      style={{ ...style, backgroundColor: color }}
      className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 border border-white/15 ${className}`}
    >
      {isBot ? <BotIcon size={Math.round(size * 0.45)} /> : initials(name)}
    </span>
  )
}
