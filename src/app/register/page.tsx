"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { SpadeIcon } from "@/components/Icons"

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ username: "", password: "", displayName: "", inviteCode: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? "Something went wrong")
      setLoading(false)
    } else {
      router.push("/login?registered=1")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <SpadeIcon size={40} className="text-gold mx-auto mb-3" />
          <h1 className="text-2xl font-semibold text-gold tracking-wide">pocăr</h1>
          <p className="text-muted text-sm mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted uppercase tracking-widest mb-2">Display Name</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="w-full bg-surface border border-border rounded px-4 py-3 text-foreground placeholder-faint focus:outline-none focus:border-gold transition-colors"
              placeholder="How others see you"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-muted uppercase tracking-widest mb-2">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "_") })}
              className="w-full bg-surface border border-border rounded px-4 py-3 text-foreground placeholder-faint focus:outline-none focus:border-gold transition-colors"
              placeholder="your_username"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-muted uppercase tracking-widest mb-2">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-surface border border-border rounded px-4 py-3 text-foreground placeholder-faint focus:outline-none focus:border-gold transition-colors"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-xs text-muted uppercase tracking-widest mb-2">Invite Code</label>
            <input
              type="text"
              value={form.inviteCode}
              onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
              className="w-full bg-surface border border-border rounded px-4 py-3 text-foreground placeholder-faint focus:outline-none focus:border-gold transition-colors"
              placeholder="Ask the host"
              required
            />
          </div>

          {error && <p className="text-red-card text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-background font-semibold py-3 rounded tracking-wide hover:bg-gold-dim transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-muted text-sm mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-gold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
