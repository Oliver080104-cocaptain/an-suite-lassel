import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import Providers from '@/components/Providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Lassel GmbH – Angebotssuite',
  description: 'Angebots-, Lieferschein- und Rechnungsverwaltung',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.className}>
      <body>
        <Providers>
          <div className="min-h-screen bg-slate-50 flex">
            <Sidebar />
            <main className="flex-1 min-w-0">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
