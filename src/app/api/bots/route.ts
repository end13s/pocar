import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { INTERNAL_BOTS } from "@/lib/bots/registry"

// Available bots: built-in ones from the code registry + external bots you registered
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const external = await prisma.user.findMany({
    where: { isBot: true, botOwnerId: session.user.id },
    select: { id: true, displayName: true, apiKey: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    internal: Object.values(INTERNAL_BOTS).map(({ key, name, description }) => ({ key, name, description })),
    external,
  })
}

// Register an external bot: creates its user account and returns the API key
// it must use to connect over Socket.io (auth: { apiKey }).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name } = await req.json()
  const trimmed = String(name ?? "").trim()
  if (trimmed.length < 1 || trimmed.length > 30) {
    return NextResponse.json({ error: "Bot name must be 1–30 characters" }, { status: 400 })
  }

  const apiKey = randomBytes(24).toString("hex")
  const bot = await prisma.user.create({
    data: {
      username: `bot_${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${randomBytes(3).toString("hex")}`,
      passwordHash: "!", // bots authenticate with their API key, never a password
      displayName: trimmed,
      isBot: true,
      apiKey,
      botOwnerId: session.user.id,
      avatarColor: "#4a4a8a",
    },
    select: { id: true, displayName: true, apiKey: true },
  })

  return NextResponse.json(bot, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await req.json()
  const bot = await prisma.user.findUnique({ where: { id: String(id) } })
  if (!bot || !bot.isBot || bot.botOwnerId !== session.user.id) {
    return NextResponse.json({ error: "Not your bot" }, { status: 403 })
  }

  try {
    await prisma.user.delete({ where: { id: bot.id } })
  } catch {
    // FK constraints: the bot already played sessions — keep history, revoke access
    await prisma.user.update({ where: { id: bot.id }, data: { apiKey: null } })
    return NextResponse.json({ ok: true, note: "Bot has game history — access revoked instead of deleting." })
  }
  return NextResponse.json({ ok: true })
}
