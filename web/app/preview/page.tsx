'use client'

const PAGE_BG = '#0A0A0F'
const BAR_H = 22
const labels = ['๛', 'gh05t@moriarty', 'qbittorrent', 'arr', 'trakt', 'seer', 'plex', 'tautulli']

const THEMES: Record<string, { label: string; segments: { bg: string; fg: string }[] }> = {
  catppuccin: {
    label: 'Catppuccin Mocha (current)',
    segments: [
      { bg: '#fab387', fg: '#1e1e2e' },
      { bg: '#313244', fg: '#cdd6f4' },
      { bg: '#45475a', fg: '#89b4fa' },
      { bg: '#313244', fg: '#a6e3a1' },
      { bg: '#45475a', fg: '#cba6f7' },
      { bg: '#313244', fg: '#89dceb' },
      { bg: '#45475a', fg: '#f38ba8' },
      { bg: '#313244', fg: '#f9e2af' },
    ],
  },
  nord: {
    label: 'Nord',
    segments: [
      { bg: '#d08770', fg: '#2e3440' },
      { bg: '#2e3440', fg: '#d8dee9' },
      { bg: '#3b4252', fg: '#88c0d0' },
      { bg: '#2e3440', fg: '#a3be8c' },
      { bg: '#3b4252', fg: '#b48ead' },
      { bg: '#2e3440', fg: '#81a1c1' },
      { bg: '#3b4252', fg: '#bf616a' },
      { bg: '#2e3440', fg: '#ebcb8b' },
    ],
  },
  tokyo: {
    label: 'Tokyo Night',
    segments: [
      { bg: '#ff9e64', fg: '#1a1b26' },
      { bg: '#1a1b26', fg: '#c0caf5' },
      { bg: '#24283b', fg: '#7aa2f7' },
      { bg: '#1a1b26', fg: '#9ece6a' },
      { bg: '#24283b', fg: '#9d7cd8' },
      { bg: '#1a1b26', fg: '#7dcfff' },
      { bg: '#24283b', fg: '#f7768e' },
      { bg: '#1a1b26', fg: '#e0af68' },
    ],
  },
  gruvbox: {
    label: 'Gruvbox Dark',
    segments: [
      { bg: '#fe8019', fg: '#282828' },
      { bg: '#282828', fg: '#ebdbb2' },
      { bg: '#3c3836', fg: '#83a598' },
      { bg: '#282828', fg: '#b8bb26' },
      { bg: '#3c3836', fg: '#d3869b' },
      { bg: '#282828', fg: '#83a598' },
      { bg: '#3c3836', fg: '#fb4934' },
      { bg: '#282828', fg: '#fabd2f' },
    ],
  },
  mono: {
    label: 'Monochrome',
    segments: [
      { bg: '#252540', fg: '#e2e2e2' },
      { bg: '#0f0f1a', fg: '#888' },
      { bg: '#1a1a2e', fg: '#60a5fa' },
      { bg: '#0f0f1a', fg: '#4ade80' },
      { bg: '#1a1a2e', fg: '#c084fc' },
      { bg: '#0f0f1a', fg: '#67e8f9' },
      { bg: '#1a1a2e', fg: '#f87171' },
      { bg: '#0f0f1a', fg: '#fbbf24' },
    ],
  },
}

function Chevron({ color, nextBg }: { color: string; nextBg: string }) {
  return (
    <div style={{ background: nextBg }}>
      <svg width="13" height={BAR_H} viewBox={`0 0 13 ${BAR_H}`} style={{ display: 'block' }}>
        <polygon points={`0,0 13,${BAR_H / 2} 0,${BAR_H}`} fill={color} />
      </svg>
    </div>
  )
}

function ThemeBar({ segments }: { segments: { bg: string; fg: string }[] }) {
  return (
    <div style={{ background: PAGE_BG, height: BAR_H, display: 'flex', alignItems: 'stretch', fontFamily: 'monospace' }}>
      {segments.map((seg, i) => {
        const nextBg = segments[i + 1]?.bg ?? PAGE_BG
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ background: seg.bg, color: seg.fg, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
              {labels[i]}
            </div>
            <Chevron color={seg.bg} nextBg={nextBg} />
          </div>
        )
      })}
    </div>
  )
}

export default function PreviewPage() {
  return (
    <div style={{ background: PAGE_BG, minHeight: '100vh', padding: '40px 24px', fontFamily: 'monospace' }}>
      <p style={{ color: '#444', fontSize: 12, marginBottom: 32 }}>// theme preview — ctrlr topbar</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {Object.entries(THEMES).map(([key, theme]) => (
          <div key={key}>
            <p style={{ color: '#555', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{theme.label}</p>
            <ThemeBar segments={theme.segments} />
          </div>
        ))}
      </div>
    </div>
  )
}
