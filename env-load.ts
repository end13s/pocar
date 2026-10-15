// Must be the FIRST import in server.ts: loads .env / .env.local before any
// module (e.g. src/lib/prisma.ts) reads process.env at import time.
import { loadEnvConfig } from "@next/env"

// `npm start` passes --production instead of NODE_ENV=production, which Windows shells reject
if (process.argv.includes("--production")) Object.assign(process.env, { NODE_ENV: "production" })

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")
