import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sessions = await prisma.session.findMany({
    where: { status: { in: ["WAITING_BUYIN", "ACTIVE"] } },
    include: {
      host: { select: { id: true, displayName: true } },
      players: { select: { userId: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(sessions)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, buyIn, smallBlind, bigBlind, tableType, maxPlayers, isVirtual } = await req.json()

  if (!name || !buyIn || !smallBlind || !bigBlind) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const gameSession = await prisma.session.create({
    data: {
      name,
      hostId: session.user.id,
      buyIn: Math.round(buyIn * 100),
      smallBlind: Math.round(smallBlind * 100),
      bigBlind: Math.round(bigBlind * 100),
      tableType: tableType ?? "HUMANS_ONLY",
      maxPlayers: maxPlayers ?? 9,
      isVirtual: !!isVirtual,
    },
  })

  // Auto-join host at seat 1
  await prisma.sessionPlayer.create({
    data: {
      sessionId: gameSession.id,
      userId: session.user.id,
      seatNumber: 1,
      buyInAmount: Math.round(buyIn * 100),
      transferStatus: "CONFIRMED", // host doesn't need to transfer to themselves
      chips: Math.round(buyIn * 100),
    },
  })

  return NextResponse.json(gameSession, { status: 201 })
}
