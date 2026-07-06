import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, displayName: true, avatarColor: true, avatarUrl: true, createdAt: true },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { displayName, avatarColor, avatarUrl } = await req.json()
  const data: { displayName?: string; avatarColor?: string; avatarUrl?: string | null } = {}

  if (displayName !== undefined) {
    const trimmed = String(displayName).trim()
    if (trimmed.length < 1 || trimmed.length > 30) {
      return NextResponse.json({ error: "Display name must be 1–30 characters" }, { status: 400 })
    }
    data.displayName = trimmed
  }
  if (avatarColor !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(avatarColor))) {
      return NextResponse.json({ error: "Invalid color" }, { status: 400 })
    }
    data.avatarColor = avatarColor
  }
  if (avatarUrl !== undefined) {
    // Avatar is a small client-resized image stored inline as a data URL; null removes it
    if (avatarUrl !== null) {
      if (typeof avatarUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(avatarUrl)) {
        return NextResponse.json({ error: "Invalid image" }, { status: 400 })
      }
      if (avatarUrl.length > 400_000) {
        return NextResponse.json({ error: "Image too large" }, { status: 400 })
      }
    }
    data.avatarUrl = avatarUrl
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { username: true, displayName: true, avatarColor: true, avatarUrl: true },
  })
  return NextResponse.json(user)
}
