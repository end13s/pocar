import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: sessionId } = await params
  const gameSession = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { players: true },
  })

  if (!gameSession) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  // Late joins are allowed on running tables — the player buys in and is dealt next hand
  if (gameSession.status !== "WAITING_BUYIN" && gameSession.status !== "ACTIVE") {
    return NextResponse.json({ error: "This session has ended" }, { status: 400 })
  }
  if (gameSession.players.length >= gameSession.maxPlayers) return NextResponse.json({ error: "Table full" }, { status: 400 })

  const alreadyJoined = gameSession.players.find((p) => p.userId === session.user?.id)
  if (alreadyJoined) return NextResponse.json({ error: "Already joined" }, { status: 400 })

  const takenSeats = new Set(gameSession.players.map((p) => p.seatNumber))
  let seat = 1
  while (takenSeats.has(seat)) seat++

  // Play-money tables skip the real-money transfer flow: chips are credited on join
  const player = await prisma.sessionPlayer.create({
    data: {
      sessionId,
      userId: session.user.id,
      seatNumber: seat,
      buyInAmount: gameSession.buyIn,
      ...(gameSession.isVirtual ? { transferStatus: "CONFIRMED" as const, chips: gameSession.buyIn } : {}),
    },
  })

  return NextResponse.json(player, { status: 201 })
}
