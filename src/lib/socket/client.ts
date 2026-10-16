"use client"

import { io, Socket } from "socket.io-client"
import { ServerToClientEvents, ClientToServerEvents } from "@/types/socket"

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: AppSocket | null = null
let socketUserId: string | null = null

// Singleton — reused across pages so navigating session → table keeps the connection.
// The server identifies the user from the session cookie sent with the handshake;
// userId only decides when a new login needs a fresh connection.
export function getSocket(userId: string): AppSocket {
  if (socket && socketUserId === userId) return socket
  socket?.disconnect()
  socket = io()
  socketUserId = userId
  return socket
}
