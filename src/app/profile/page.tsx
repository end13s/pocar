"use client"

import { useState, useEffect, useMemo, ReactNode } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fmtMoney } from "@/lib/format"
import { SpadeIcon, UsersIcon, BotIcon, CoinsIcon, CardsIcon, SettingsIcon, ChartIcon } from "@/components/Icons"
import Avatar from "@/components/Avatar"

interface ExternalBot {
  id: string
  displayName: string
  apiKey: string | null
  createdAt: string
}

interface Profile {
  username: string
  displayName: string
  avatarColor: string
  avatarUrl: string | null
  createdAt: string
}

interface StatRow {
  sessionId: string
  name: string
  tableType: "HUMANS_ONLY" | "BOTS_ONLY" | "MIXED"
  isVirtual: boolean
  status: string
  createdAt: string
  handsPlayed: number
  buyInAmount: number
  chips: number
  cashedOut: boolean
  cashOutAmount: number | null
}

const AVATAR_COLORS = [
  "#c9a55a", "#8a2a2a", "#2d7a2d", "#2a5a8a", "#7a4a8a", "#b06a2a",
  "#2a8a7a", "#8a7a2a", "#aa4a6a", "#4a4a8a", "#666666", "#3a5a3a",
]

type CategoryKey = "all" | "real" | "virtual" | "humans" | "mixed" | "bots"

const CATEGORIES: { key: CategoryKey; label: string; icon: ReactNode; match: (r: StatRow) => boolean }[] = [
  { key: "all", label: "All", icon: <CardsIcon size={13} />, match: () => true },
  { key: "real", label: "Real money", icon: <span className="font-semibold text-[11px]">$</span>, match: (r) => !r.isVirtual },
  { key: "virtual", label: "Play money", icon: <CoinsIcon size={13} />, match: (r) => r.isVirtual },
  { key: "humans", label: "Humans", icon: <UsersIcon size={13} />, match: (r) => r.tableType === "HUMANS_ONLY" },
  { key: "mixed", label: "Mixed", icon: <span className="flex items-center gap-0.5"><UsersIcon size={12} /><BotIcon size={12} /></span>, match: (r) => r.tableType === "MIXED" },
  { key: "bots", label: "Bots", icon: <BotIcon size={13} />, match: (r) => r.tableType === "BOTS_ONLY" },
]

// Center-crop to a square and downscale so the stored data URL stays small
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const size = 256
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")!
      const min = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size)
      resolve(canvas.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Could not read image"))
    }
    img.src = objectUrl
  })
}

// Net result of a finished participation; null while unresolved
function realizedNet(r: StatRow): number | null {
  if (r.cashedOut && r.cashOutAmount != null) return r.cashOutAmount - r.buyInAmount
  if (r.status === "ENDED") return r.chips - r.buyInAmount
  return null
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: "up" | "down" }) {
  const color = accent === "up" ? "text-chip-green" : accent === "down" ? "text-red-card" : "text-foreground"
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  )
}

export default function ProfilePage() {
  const { data: authSession, status: authStatus, update } = useSession()
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [rows, setRows] = useState<StatRow[]>([])
  const [category, setCategory] = useState<CategoryKey>("all")
  const [displayName, setDisplayName] = useState("")
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [showAvatarPanel, setShowAvatarPanel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [myBots, setMyBots] = useState<ExternalBot[]>([])
  const [newBotName, setNewBotName] = useState("")
  const [creatingBot, setCreatingBot] = useState(false)

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login")
  }, [authStatus, router])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch("/api/profile"), fetch("/api/profile/stats")]).then(async ([pRes, sRes]) => {
      if (cancelled) return
      if (pRes.ok) {
        const p = await pRes.json()
        if (cancelled) return
        setProfile(p)
        setDisplayName(p.displayName)
        setAvatarColor(p.avatarColor)
        setAvatarUrl(p.avatarUrl)
      }
      if (sRes.ok) {
        const s = await sRes.json()
        if (!cancelled) setRows(s)
      }
    })
    fetch("/api/bots").then(async (res) => {
      if (res.ok && !cancelled) setMyBots((await res.json()).external)
    })
    return () => { cancelled = true }
  }, [])

  async function createBot() {
    if (!newBotName.trim()) return
    setCreatingBot(true)
    const res = await fetch("/api/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBotName }),
    })
    if (res.ok) {
      const bot = await res.json()
      setMyBots((prev) => [{ ...bot, createdAt: new Date().toISOString() }, ...prev])
      setNewBotName("")
    }
    setCreatingBot(false)
  }

  async function deleteBot(id: string) {
    if (!confirm("Delete this bot? Its API key stops working immediately.")) return
    const res = await fetch("/api/bots", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setMyBots((prev) => prev.filter((b) => b.id !== id))
  }

  async function saveProfile() {
    setSaving(true)
    setSaveMsg(null)
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, avatarColor, avatarUrl }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setProfile((p) => (p ? { ...p, displayName: data.displayName, avatarColor: data.avatarColor, avatarUrl: data.avatarUrl } : p))
      if (data.displayName !== authSession?.user?.name) {
        await update({ name: data.displayName })
      }
      setSaveMsg("Saved")
      setTimeout(() => setSaveMsg(null), 2500)
    } else {
      setSaveMsg(data.error ?? "Could not save")
    }
    setSaving(false)
  }

  const filtered = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.key === category)!
    return rows.filter((r) => r.status !== "WAITING_BUYIN" && cat.match(r))
  }, [rows, category])

  const stats = useMemo(() => {
    const realized = filtered
      .map((r) => ({ row: r, net: realizedNet(r) }))
      .filter((x): x is { row: StatRow; net: number } => x.net !== null)
    const net = realized.reduce((s, x) => s + x.net, 0)
    const wins = realized.filter((x) => x.net > 0).length
    const totalBuyIn = filtered.reduce((s, r) => s + r.buyInAmount, 0)
    const hands = filtered.reduce((s, r) => s + r.handsPlayed, 0)
    const best = realized.length ? Math.max(...realized.map((x) => x.net)) : null
    return {
      sessions: filtered.length,
      net,
      hasRealized: realized.length > 0,
      winRate: realized.length ? Math.round((wins / realized.length) * 100) : null,
      totalBuyIn,
      hands,
      best,
    }
  }, [filtered])

  if (authStatus === "loading" || !profile) return null

  const dirty = displayName !== profile.displayName || avatarColor !== profile.avatarColor || avatarUrl !== profile.avatarUrl

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SpadeIcon size={22} className="text-gold" />
          <span className="text-gold font-semibold tracking-wide text-lg">pocăr</span>
        </div>
        <Link href="/lobby" className="text-faint text-sm hover:text-muted transition-colors">← Back to lobby</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Profile settings */}
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-4">
            <SettingsIcon size={17} className="text-gold" />
            Profile
          </h2>
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-6 flex-wrap">
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => setShowAvatarPanel((v) => !v)}
                  title="Change avatar"
                  className={`rounded-full transition-shadow ${showAvatarPanel ? "ring-2 ring-gold" : "hover:ring-2 hover:ring-gold/50"}`}
                >
                  <Avatar name={displayName || profile.displayName} color={avatarColor} url={avatarUrl} size={80} />
                </button>
                <span className="text-faint text-xs">@{profile.username}</span>
                <span className="text-faint text-[10px]">click to edit</span>
              </div>

              <div className="flex-1 min-w-60 space-y-4">
                {/* Avatar panel — opens by clicking the avatar */}
                {showAvatarPanel && (
                  <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-4 pop-in">
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="bg-gold text-background px-4 py-2 rounded font-semibold text-xs cursor-pointer hover:bg-gold-dim transition-colors">
                        Upload photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ""
                            if (!file) return
                            try {
                              setAvatarUrl(await fileToAvatar(file))
                            } catch {
                              setSaveMsg("Could not read image")
                            }
                          }}
                        />
                      </label>
                      {avatarUrl && (
                        <button
                          onClick={() => setAvatarUrl(null)}
                          className="text-xs text-red-card hover:underline"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-muted uppercase tracking-widest mb-1.5">
                        Avatar color {avatarUrl && <span className="normal-case tracking-normal">— used when no photo is set</span>}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {AVATAR_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setAvatarColor(c)}
                            className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${avatarColor === c ? "border-gold scale-110" : "border-transparent"}`}
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-muted uppercase tracking-widest mb-1.5">Display name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={30}
                    className="w-full bg-surface-2 border border-border rounded px-3 py-2.5 text-foreground focus:outline-none focus:border-gold text-sm"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveProfile}
                    disabled={saving || !dirty}
                    className="bg-gold text-background px-5 py-2 rounded font-semibold text-sm hover:bg-gold-dim transition-colors disabled:opacity-40"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                  {saveMsg && <span className={`text-sm ${saveMsg === "Saved" ? "text-chip-green" : "text-red-card"}`}>{saveMsg}</span>}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-4">
            <ChartIcon size={17} className="text-gold" />
            Statistics
          </h2>

          {/* Category tabs */}
          <div className="flex flex-wrap gap-2 mb-5">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
                  ${category === c.key ? "bg-gold text-background border-gold" : "bg-surface text-muted border-border hover:text-foreground"}`}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <StatTile label="Sessions played" value={String(stats.sessions)} />
            <StatTile
              label="Net result"
              value={stats.hasRealized ? `${stats.net >= 0 ? "+" : ""}${fmtMoney(stats.net)}` : "—"}
              accent={stats.hasRealized ? (stats.net >= 0 ? "up" : "down") : undefined}
            />
            <StatTile label="Win rate" value={stats.winRate != null ? `${stats.winRate}%` : "—"} />
            <StatTile label="Hands dealt" value={String(stats.hands)} />
            <StatTile label="Total buy-ins" value={fmtMoney(stats.totalBuyIn)} />
            <StatTile
              label="Best session"
              value={stats.best != null ? `${stats.best >= 0 ? "+" : ""}${fmtMoney(stats.best)}` : "—"}
              accent={stats.best != null && stats.best > 0 ? "up" : undefined}
            />
          </div>

          {/* Session history */}
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-border text-sm font-semibold text-foreground">Session history</div>
            {filtered.length === 0 ? (
              <div className="px-5 py-8 text-center text-faint text-sm">No sessions in this category yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((r) => {
                  const net = realizedNet(r)
                  const inProgress = net === null
                  const shown = inProgress ? r.chips - r.buyInAmount : net
                  return (
                    <div key={r.sessionId} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/session/${r.sessionId}`} className="text-foreground text-sm font-medium hover:text-gold transition-colors truncate block">
                          {r.name}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                          <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                          <span>·</span>
                          <span>{r.handsPlayed} hands</span>
                          {r.isVirtual && (
                            <span className="flex items-center gap-1 text-gold"><CoinsIcon size={11} />play money</span>
                          )}
                          {inProgress && <span className="text-chip-green">in progress</span>}
                        </div>
                      </div>
                      <span className={`text-sm font-semibold font-mono shrink-0 ${shown >= 0 ? "text-chip-green" : "text-red-card"}`}>
                        {shown >= 0 ? "+" : ""}{fmtMoney(shown)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
        {/* External bots */}
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-4">
            <BotIcon size={17} className="text-gold" />
            My bots
          </h2>
          <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
            <p className="text-muted text-sm">
              External bots are separate programs that connect over Socket.io using an API key
              and play like any other player. See <span className="text-gold font-mono text-xs">bots/example-bot.mjs</span> in
              the repo for a working starting point.
            </p>
            <div className="flex gap-2">
              <input
                value={newBotName}
                onChange={(e) => setNewBotName(e.target.value)}
                placeholder="Bot name (e.g. DeepFold 9000)"
                maxLength={30}
                className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-foreground placeholder-faint focus:outline-none focus:border-gold text-sm"
              />
              <button
                onClick={createBot}
                disabled={creatingBot || !newBotName.trim()}
                className="bg-gold text-background px-4 py-2 rounded font-semibold text-sm hover:bg-gold-dim transition-colors disabled:opacity-40"
              >
                {creatingBot ? "Creating…" : "Register bot"}
              </button>
            </div>
            {myBots.length > 0 && (
              <div className="divide-y divide-border border-t border-border">
                {myBots.map((b) => (
                  <div key={b.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-foreground text-sm font-medium flex items-center gap-2">
                        <BotIcon size={14} className="text-muted" />
                        {b.displayName}
                      </div>
                      <div className="text-xs text-faint font-mono mt-0.5 break-all">
                        API key: {b.apiKey ?? "(revoked)"}
                      </div>
                    </div>
                    <button onClick={() => deleteBot(b.id)} className="text-xs text-red-card hover:underline shrink-0">
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
