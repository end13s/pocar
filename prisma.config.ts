// Load .env and .env.local the same way the app server does (env-load.ts), so the
// Prisma CLI sees the DATABASE_URL from .env.local too.
import { loadEnvConfig } from "@next/env"
import { defineConfig } from "prisma/config"

loadEnvConfig(process.cwd())

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
})
