// Must be the FIRST import in server.ts: loads .env / .env.local before any
// module (e.g. src/lib/prisma.ts) reads process.env at import time.
import { loadEnvConfig } from "@next/env"

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")
