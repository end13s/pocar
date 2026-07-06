"use client"

import { useState, useEffect, ReactNode } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { SpadeIcon, UsersIcon, BotIcon, CardsIcon, UserIcon, CoinsIcon, TrashIcon } from "@/components/Icons"

interface GameSession {
  id: string
  name: string
  status: string
  buyIn: number
  smallBlind: number
  bigBlind: number
  tableType: string
  maxPlayers: number
  isVirtual: boolean
  host: { id: string; displayName: string }
  players: { userId: string }[]
}

const TABLE_TYPE_LABELS: Record<string, { label: string; icon: ReactNode }> = {
  HUMANS_ONLY: { label: "Humans", icon: <UsersIcon size={13} /> },
  BOTS_ONLY: { label: "Bots", icon: <BotIcon size={13} /> },
  MIXED: { label: "Mixed", icon: <span className="flex items-center gap-0.5"><UsersIcon size={13} /><BotIcon size={13} /></span> },
}

export default function LobbyPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: "",
    buyIn: "20",
    smallBlind: "0.5",
    bigBlind: "1",
    tableType: "HUMANS_ONLY",
    maxPlayers: "9",
    isVirtual: false,
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 5000)
    return () => clearInterval(interval)
  }, [])

  async function fetchSessions() {
    const res = await fetch("/api/sessions")
    if (res.ok) setSessions(await res.json())
  }

  async function createSession() {
    setCreating(true)
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name || `${session?.user?.name}'s Table`,
        buyIn: parseFloat(form.buyIn),
        smallBlind: parseFloat(form.smallBlind),
        bigBlind: parseFloat(form.bigBlind),
        tableType: form.tableType,
        maxPlayers: parseInt(form.maxPlayers),
        isVirtual: form.isVirtual,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      router.push(`/session/${data.id}`)
    }
    setCreating(false)
  }

  async function joinSession(sessionId: string, alreadyIn: boolean) {
    if (alreadyIn) {
      router.push(`/session/${sessionId}`)
      return
    }
    const res = await fetch(`/api/sessions/${sessionId}/join`, { method: "POST" })
    if (res.ok) router.push(`/session/${sessionId}`)
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("Delete this table? This cannot be undone.")) return
    const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" })
    if (res.ok) fetchSessions()
    else alert((await res.json().catch(() => ({}))).error ?? "Could not delete table")
  }

  if (status === "loading") return null

  const myUserId = session?.user?.id

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SpadeIcon size={22} className="text-gold" />
          <span className="text-gold font-semibold tracking-wide text-lg">pocăr</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/profile"
            className="flex items-center gap-2 text-muted text-sm hover:text-foreground transition-colors"
          >
            <UserIcon size={15} />
            {session?.user?.name}
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-faint text-sm hover:text-muted transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Open Tables</h2>
            <p className="text-muted text-sm mt-1">Join an existing game or create your own</p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-gold text-background px-5 py-2.5 rounded font-semibold text-sm hover:bg-gold-dim transition-colors"
          >
            + New Table
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="bg-surface border border-border rounded-lg p-6 mb-8">
            <h3 className="text-foreground font-semibold mb-5">Create Table</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-muted uppercase tracking-widest mb-1.5">Table Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={`${session?.user?.name}'s Table`}
                  className="w-full bg-surface-2 border border-border rounded px-3 py-2.5 text-foreground placeholder-faint focus:outline-none focus:border-gold text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted uppercase tracking-widest mb-1.5">Buy-in ($)</label>
                <input
                  type="number"
                  value={form.buyIn}
                  onChange={(e) => setForm({ ...form, buyIn: e.target.value })}
                  className="w-full bg-surface-2 border border-border rounded px-3 py-2.5 text-foreground focus:outline-none focus:border-gold text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted uppercase tracking-widest mb-1.5">Blinds (SB / BB)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.25"
                    value={form.smallBlind}
                    onChange={(e) => setForm({ ...form, smallBlind: e.target.value })}
                    className="w-full bg-surface-2 border border-border rounded px-3 py-2.5 text-foreground focus:outline-none focus:border-gold text-sm"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={form.bigBlind}
                    onChange={(e) => setForm({ ...form, bigBlind: e.target.value })}
                    className="w-full bg-surface-2 border border-border rounded px-3 py-2.5 text-foreground focus:outline-none focus:border-gold text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted uppercase tracking-widest mb-1.5">Table Type</label>
                <select
                  value={form.tableType}
                  onChange={(e) => setForm({ ...form, tableType: e.target.value })}
                  className="w-full bg-surface-2 border border-border rounded px-3 py-2.5 text-foreground focus:outline-none focus:border-gold text-sm"
                >
                  <option value="HUMANS_ONLY">Humans Only</option>
                  <option value="BOTS_ONLY">Bots Only</option>
                  <option value="MIXED">Mixed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted uppercase tracking-widest mb-1.5">Max Players</label>
                <select
                  value={form.maxPlayers}
                  onChange={(e) => setForm({ ...form, maxPlayers: e.target.value })}
                  className="w-full bg-surface-2 border border-border rounded px-3 py-2.5 text-foreground focus:outline-none focus:border-gold text-sm"
                >
                  {[2,3,4,5,6,7,8,9].map((n) => (
                    <option key={n} value={n}>{n} players</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isVirtual}
                    onChange={(e) => setForm({ ...form, isVirtual: e.target.checked })}
                    className="accent-[#c9a55a] w-4 h-4"
                  />
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <CoinsIcon size={15} className="text-gold" />
                    Play money (no real transfers — chips are credited automatically)
                  </span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-muted text-sm hover:text-foreground transition-colors">Cancel</button>
              <button
                onClick={createSession}
                disabled={creating}
                className="bg-gold text-background px-5 py-2 rounded font-semibold text-sm hover:bg-gold-dim transition-colors disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create & Join"}
              </button>
            </div>
          </div>
        )}

        {/* Sessions list */}
        {sessions.length === 0 ? (
          <div className="text-center py-16 text-faint">
            <CardsIcon size={48} className="mx-auto mb-4 text-faint" />
            <p className="text-muted">No open tables. Create one to start playing.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const typeInfo = TABLE_TYPE_LABELS[s.tableType]
              const alreadyIn = !!myUserId && s.players.some((p) => p.userId === myUserId)
              const isMyTable = s.host.id === myUserId
              return (
                <div key={s.id} className="bg-surface border border-border rounded-lg px-6 py-4 flex items-center justify-between hover:border-gold/40 transition-colors">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-foreground font-medium">{s.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted bg-surface-2 px-2 py-0.5 rounded">
                        {typeInfo.icon}
                        {typeInfo.label}
                      </span>
                      {s.isVirtual && (
                        <span className="flex items-center gap-1 text-xs text-gold bg-gold/10 px-2 py-0.5 rounded">
                          <CoinsIcon size={12} />
                          Play money
                        </span>
                      )}
                      {s.status === "ACTIVE" && (
                        <span className="text-xs text-chip-green bg-chip-green/10 px-2 py-0.5 rounded">Live</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted">
                      <span>Buy-in: ${(s.buyIn / 100).toFixed(0)}</span>
                      <span>·</span>
                      <span>Blinds: ${(s.smallBlind / 100).toFixed(2)} / ${(s.bigBlind / 100).toFixed(2)}</span>
                      <span>·</span>
                      <span>{s.players.length}/{s.maxPlayers} players</span>
                      <span>·</span>
                      <span>Host: {s.host.displayName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => joinSession(s.id, alreadyIn)}
                      disabled={!alreadyIn && s.players.length >= s.maxPlayers}
                      className="bg-chip-green text-white px-5 py-2 rounded font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {alreadyIn ? "Open" : s.status === "ACTIVE" ? "Join live" : "Join"}
                    </button>
                    {isMyTable && s.status !== "ACTIVE" && (
                      <button
                        onClick={() => deleteSession(s.id)}
                        title="Delete table"
                        className="p-2 rounded text-faint hover:text-red-card hover:bg-red-card/10 transition-colors"
                      >
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
