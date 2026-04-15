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
        <link rel="stylesheet" href="https://www.nerdfonts.com/assets/css/webfont.css" />
      </head>
      <body className="min-h-full bg-[#0A0A0F] text-[#e2e2e2] antialiased">
        {children}
      </body>
    </html>
  )
}
