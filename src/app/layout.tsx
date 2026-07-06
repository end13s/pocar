import type { Metadata } from "next"
import { Geist } from "next/font/google"
import SessionProvider from "@/components/SessionProvider"
import "./globals.css"

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "pocăr",
  description: "Private poker for friends",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      {/* suppressHydrationWarning: browser extensions (Grammarly) add attributes to <body> */}
      <body className="min-h-full" suppressHydrationWarning>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
