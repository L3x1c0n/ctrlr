import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CTRLr',
  description: 'Media stack dashboard',
  icons: {
    icon: '/icon.png?v=2',
    apple: '/icon.png?v=2',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=3" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full antialiased" style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
        {children}
      </body>
    </html>
  )
}
