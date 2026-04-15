export interface TopBarTheme {
  name: string
  segments: { bg: string; fg: string }[]
}

// 8 segments: ๛, gh05t@moriarty, qbittorrent, arr, trakt, seer, plex, tautulli
export const THEMES: Record<string, TopBarTheme> = {
  catppuccin: {
    name: 'Catppuccin Mocha',
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
  dracula: {
    name: 'Dracula',
    segments: [
      { bg: '#ff79c6', fg: '#282a36' },
      { bg: '#6272a4', fg: '#f8f8f2' },
      { bg: '#bd93f9', fg: '#f8f8f2' },
      { bg: '#8be9fd', fg: '#282a36' },
      { bg: '#ffb86c', fg: '#282a36' },
      { bg: '#6272a4', fg: '#f8f8f2' },
      { bg: '#ff5555', fg: '#f8f8f2' },
      { bg: '#f1fa8c', fg: '#282a36' },
    ],
  },
  nord: {
    name: 'Nord',
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
  gruvbox: {
    name: 'Gruvbox Dark',
    segments: [
      { bg: '#fe8019', fg: '#282828' },
      { bg: '#3c3836', fg: '#ebdbb2' },
      { bg: '#458588', fg: '#282828' },
      { bg: '#282828', fg: '#b8bb26' },
      { bg: '#3c3836', fg: '#d3869b' },
      { bg: '#282828', fg: '#83a598' },
      { bg: '#3c3836', fg: '#fb4934' },
      { bg: '#282828', fg: '#fabd2f' },
    ],
  },
  nightowl: {
    name: 'Night Owl',
    segments: [
      { bg: '#21c7a8', fg: '#011627' },
      { bg: '#011627', fg: '#d6deeb' },
      { bg: '#82aaff', fg: '#011627' },
      { bg: '#011627', fg: '#addb67' },
      { bg: '#8f43f3', fg: '#ffffff' },
      { bg: '#011627', fg: '#7fdbca' },
      { bg: '#ef5350', fg: '#ffeb95' },
      { bg: '#575656', fg: '#d6deeb' },
    ],
  },
  cobalt2: {
    name: 'Cobalt2',
    segments: [
      { bg: '#ffc600', fg: '#000000' },
      { bg: '#193549', fg: '#ffffff' },
      { bg: '#1478db', fg: '#ffffff' },
      { bg: '#193549', fg: '#3ad900' },
      { bg: '#1478db', fg: '#ffffff' },
      { bg: '#193549', fg: '#ffc600' },
      { bg: '#1478db', fg: '#ffffff' },
      { bg: '#193549', fg: '#3ad900' },
    ],
  },
  atomic: {
    name: 'Atomic',
    segments: [
      { bg: '#0077c2', fg: '#ffffff' },
      { bg: '#2d3436', fg: '#ffffff' },
      { bg: '#ff9248', fg: '#2d3436' },
      { bg: '#83769c', fg: '#ffffff' },
      { bg: '#fffb38', fg: '#011627' },
      { bg: '#2d3436', fg: '#40c4ff' },
      { bg: '#ef5350', fg: '#fffb38' },
      { bg: '#83769c', fg: '#ffffff' },
    ],
  },
  tokyo: {
    name: 'Tokyo Night',
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
  onedark: {
    name: 'One Dark',
    segments: [
      { bg: '#e5c07b', fg: '#282c34' },
      { bg: '#282c34', fg: '#abb2bf' },
      { bg: '#3e4452', fg: '#61afef' },
      { bg: '#282c34', fg: '#98c379' },
      { bg: '#3e4452', fg: '#c678dd' },
      { bg: '#282c34', fg: '#56b6c2' },
      { bg: '#3e4452', fg: '#e06c75' },
      { bg: '#282c34', fg: '#d19a66' },
    ],
  },
  gh05t: {
    name: 'Gh05t (original)',
    segments: [
      { bg: '#E95420', fg: '#ffffff' },
      { bg: '#ffffff', fg: '#100e23' },
      { bg: '#95ffa4', fg: '#100e23' },
      { bg: '#906cff', fg: '#100e23' },
      { bg: '#91ddff', fg: '#100e23' },
      { bg: '#95ffa4', fg: '#100e23' },
      { bg: '#ff8080', fg: '#ffffff' },
      { bg: '#ffe9aa', fg: '#100e23' },
    ],
  },
  mono: {
    name: 'Monochrome',
    segments: [
      { bg: '#252540', fg: '#e2e2e2' },
      { bg: '#0f0f1a', fg: '#888888' },
      { bg: '#1a1a2e', fg: '#60a5fa' },
      { bg: '#0f0f1a', fg: '#4ade80' },
      { bg: '#1a1a2e', fg: '#c084fc' },
      { bg: '#0f0f1a', fg: '#67e8f9' },
      { bg: '#1a1a2e', fg: '#f87171' },
      { bg: '#0f0f1a', fg: '#fbbf24' },
    ],
  },
}

export const DEFAULT_THEME = 'catppuccin'
