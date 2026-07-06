import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { INTERNAL_BOTS } from "@/lib/bots/registry"

// Host adds a bot to a waiting table: { botKey } for internal, { botUserId } for external
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: sessionId } = await params
  const { botKey, botUserId } = await req.json()

  const gameSession = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { players: true },
  })
  if (!gameSession) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  if (gameSession.hostId !== session.user.id) return NextResponse.json({ error: "Only the host can add bots" }, { status: 403 })
  if (gameSession.status !== "WAITING_BUYIN") return NextResponse.json({ error: "Game already started" }, { status: 400 })
  if (gameSession.players.length >= gameSession.maxPlayers) return NextResponse.json({ error: "Table full" }, { status: 400 })
  if (gameSession.tableType === "HUMANS_ONLY") return NextResponse.json({ error: "This is a humans-only table" }, { status: 400 })

  let botUser
  if (botKey) {
    const internal = INTERNAL_BOTS[String(botKey)]
    if (!internal) return NextResponse.json({ error: "Unknown bot" }, { status: 400 })
    // The registry is code; its user account is created on first use
    botUser = await prisma.user.upsert({
      where: { botKey: internal.key },
      update: {},
      create: {
        username: `bot_${internal.key}`,
        passwordHash: "!",
        displayName: internal.name,
        isBot: true,
        botKey: internal.key,
        avatarColor: "#666666",
      },
    })
  } else if (botUserId) {
    botUser = await prisma.user.findUnique({ where: { id: String(botUserId) } })
    if (!botUser?.isBot) return NextResponse.json({ error: "Not a bot" }, { status: 400 })
  } else {
    return NextResponse.json({ error: "botKey or botUserId required" }, { status: 400 })
  }

  if (gameSession.players.some((p) => p.userId === botUser.id)) {
    return NextResponse.json({ error: "Bot already seated" }, { status: 400 })
  }

  const takenSeats = new Set(gameSession.players.map((p) => p.seatNumber))
  let seat = 1
  while (takenSeats.has(seat)) seat++

  // Bots don't transfer money — seated as confirmed with a full stack
  const player = await prisma.sessionPlayer.create({
    data: {
      sessionId,
      userId: botUser.id,
      seatNumber: seat,
      buyInAmount: gameSession.buyIn,
      transferStatus: "CONFIRMED",
      chips: gameSession.buyIn,
    },
  })

  return NextResponse.json(player, { status: 201 })
}

// Host removes a bot from a waiting table
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: sessionId } = await params
  const { userId } = await req.json()

  const gameSession = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!gameSession) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  if (gameSession.hostId !== session.user.id) return NextResponse.json({ error: "Only the host can remove bots" }, { status: 403 })
  if (gameSession.status !== "WAITING_BUYIN") return NextResponse.json({ error: "Game already started" }, { status: 400 })

  const target = await prisma.user.findUnique({ where: { id: String(userId) } })
  if (!target?.isBot) return NextResponse.json({ error: "Not a bot" }, { status: 400 })

  await prisma.sessionPlayer.delete({
    where: { sessionId_userId: { sessionId, userId: target.id } },
  })
  return NextResponse.json({ ok: true })
}
