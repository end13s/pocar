import { Card } from "@/lib/poker/deck"
import { GameState } from "@/lib/poker/gameState"
import { EngineAction, GameEvent } from "@/lib/poker/engine"

// Game state as seen by one client: no deck, own hole cards visible, others masked as "??"
export type ClientGameState = Omit<GameState, "deck"> & { yourHoleCards: Card[] }

// Events emitted by server → client
export interface ServerToClientEvents {
  // sent once on connect — lets external bots learn their own userId
  identity: (data: { userId: string }) => void
  game_state: (state: ClientGameState) => void
  game_event: (event: GameEvent) => void
  session_update: (data: { status: string; players: SessionPlayerInfo[] }) => void
  error: (message: string) => void
}

// Events emitted by client → server
export interface ClientToServerEvents {
  join_session: (sessionId: string) => void
  leave_session: (sessionId: string) => void
  player_action: (data: { sessionId: string; action: EngineAction }) => void
  confirm_transfer_sent: (sessionId: string) => void
  host_confirm_transfer: (data: { sessionId: string; userId: string }) => void
  host_start_game: (sessionId: string) => void
  request_cashout: (sessionId: string) => void
  host_confirm_cashout: (data: { sessionId: string; userId: string }) => void
  host_end_session: (sessionId: string) => void
  sit_out: (sessionId: string) => void
  sit_back: (sessionId: string) => void
  leave_table: (sessionId: string) => void
}

export interface SessionPlayerInfo {
  userId: string
  displayName: string
  seatNumber: number
  chips: number
  transferStatus: "PENDING" | "SENT" | "CONFIRMED"
  isBot: boolean
  avatarColor: string
  avatarUrl: string | null
  cashedOut: boolean
  cashOutRequested: boolean
}
