import { InternalBot } from "./types"
import { callstation } from "./callstation"
import { tag } from "./tag"

// All internal bots, keyed by User.botKey. Add a new bot: write the module,
// list it here — the "Add bot" UI and the game server pick it up automatically.
export const INTERNAL_BOTS: Record<string, InternalBot> = {
  [callstation.key]: callstation,
  [tag.key]: tag,
}
