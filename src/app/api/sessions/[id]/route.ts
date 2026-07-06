import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const gameSession = await prisma.session.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, displayName: true } },
      players: {
        include: { user: { select: { displayName: true, isBot: true, avatarColor: true, avatarUrl: true } } },
        orderBy: { seatNumber: "asc" },
      },
    },
  })

  if (!gameSession) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  return NextResponse.json(gameSession)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const gameSession = await prisma.session.findUnique({ where: { id } })
  if (!gameSession) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  if (gameSession.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only the host can delete a table" }, { status: 403 })
  }
  if (gameSession.status === "ACTIVE") {
    return NextResponse.json({ error: "End the session before deleting it" }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.handAction.deleteMany({ where: { hand: { sessionId: id } } }),
    prisma.hand.deleteMany({ where: { sessionId: id } }),
    prisma.sessionPlayer.deleteMany({ where: { sessionId: id } }),
    prisma.session.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}
