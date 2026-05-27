interface Props {
  pct: number
  color?: string
  height?: number
}

export default function ProgressBar({ pct, color = 'var(--s-play)', height = 6 }: Props) {
  const clamped = Math.min(Math.max(pct, 0), 100)
  return (
    <div style={{ width: '100%', height, background: 'var(--border-hi)', borderRadius: 3 }}>
      <div style={{ width: `${clamped}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  )
}
