import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// One row per session the user has played in; the client aggregates per category
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await prisma.sessionPlayer.findMany({
    where: { userId: session.user.id },
    include: {
      session: {
        select: {
          name: true,
          tableType: true,
          isVirtual: true,
          status: true,
          createdAt: true,
          _count: { select: { hands: true } },
        },
      },
    },
    orderBy: { session: { createdAt: "desc" } },
  })

  return NextResponse.json(
    rows.map((r) => ({
      sessionId: r.sessionId,
      name: r.session.name,
      tableType: r.session.tableType,
      isVirtual: r.session.isVirtual,
      status: r.session.status,
      createdAt: r.session.createdAt,
      handsPlayed: r.session._count.hands,
      buyInAmount: r.buyInAmount,
      chips: r.chips,
      cashedOut: r.cashedOut,
      cashOutAmount: r.cashOutAmount,
    }))
  )
}
