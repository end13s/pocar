import { InternalBot } from "./types"

// The classic fish: checks when free, calls anything, never raises, never folds
// (unless the call would take more than its stack — then it's all-in by calling).
export const callstation: InternalBot = {
  key: "callstation",
  name: "Call Station",
  description: "Checks when free, calls everything, never raises.",
  decide: (view) => {
    if (view.toCall <= 0) return { action: "check" }
    return { action: "call" }
  },
}
