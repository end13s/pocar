"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { SpadeIcon } from "@/components/Icons"

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ username: "", password: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await signIn("credentials", {
      username: form.username,
      password: form.password,
      redirect: false,
    })

    if (res?.error) {
      setError("Invalid username or password")
      setLoading(false)
    } else {
      router.push("/lobby")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <SpadeIcon size={40} className="text-gold mx-auto mb-3" />
          <h1 className="text-2xl font-semibold text-gold tracking-wide">pocăr</h1>
          <p className="text-muted text-sm mt-1">Private poker, friends only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted uppercase tracking-widest mb-2">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full bg-surface border border-border rounded px-4 py-3 text-foreground placeholder-faint focus:outline-none focus:border-gold transition-colors"
              placeholder="your_username"
              autoComplete="username"
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
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="text-red-card text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-background font-semibold py-3 rounded tracking-wide hover:bg-gold-dim transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-muted text-sm mt-6">
          New here?{" "}
          <Link href="/register" className="text-gold hover:underline">
            Request access
          </Link>
        </p>
      </div>
    </div>
  )
}
