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
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('ctrlr-layout-theme');if(t==='classic')document.documentElement.dataset.theme='classic';})()` }} />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=3" />
      </head>
      <body className="min-h-full antialiased" style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
