import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const { username, password, displayName, inviteCode } = await req.json()

  // Simple invite-code gate — change this to your own code
  if (inviteCode !== process.env.INVITE_CODE) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 403 })
  }

  if (!username || !password || !displayName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const exists = await prisma.user.findUnique({ where: { username } })
  if (exists) {
    return NextResponse.json({ error: "Username taken" }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { username, passwordHash, displayName },
    select: { id: true, username: true, displayName: true },
  })

  return NextResponse.json(user, { status: 201 })
}
