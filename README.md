# pocăr ♠

Private, invite-only Texas Hold'em for friends. The app is a **ledger, not a wallet** —
real-money buy-ins are sent directly to the host (Revolut etc.); the app only tracks
who sent, who confirmed, and who cashed out. Play-money tables skip transfers entirely.

## Features

- Real-time poker table (Socket.io): 9-max oval table, hole cards, community cards,
  side pots, dealer rotation, 30s turn timer with server-side auto check/fold
- Buy-in flow: player marks the transfer sent → host confirms → chips credited
- Cash-out flow: player requests → host pays manually → confirms in app
- Play money mode (no real transfers, chips credited on join)
- Profile: display name, avatar color, per-category statistics
  (real/play money, humans/mixed/bots)
- Invite-only registration (`INVITE_CODE`)

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Socket.io (custom server) ·
PostgreSQL + Prisma 7 · NextAuth v5

## Setup

```bash
npm install
createdb poker_app                       # local PostgreSQL
cp .env.example .env.local               # then fill in values
npm run db:push                          # sync Prisma schema
npm run dev                              # tsx server.ts (NOT next dev)
```

## Environment

See `.env.example`. Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `INVITE_CODE`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | start dev server (custom `server.ts` with Socket.io) |
| `npm run db:push` | sync schema → DB |
| `npm run db:studio` | Prisma Studio GUI |

## Notes

- Game state is in-memory (`activeGames` map) — a server restart drops running hands.
- All money values are stored in cents.
