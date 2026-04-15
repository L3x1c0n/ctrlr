interface Props {
  pct: number    // 0–100
  width?: number // number of chars, default 20
  label?: boolean
  size?: string  // tailwind text-* class, default text-xs
}

export default function ProgressBar({ pct, width = 20, label = true, size = 'text-xs' }: Props) {
  const filled = Math.round((Math.min(Math.max(pct, 0), 100) / 100) * width)
  const empty = width - filled

  const fillColor  = 'text-green-400'
  const emptyColor = 'text-[#1a3a2a]'

  return (
    <span className={`font-mono ${size} tracking-widest`}>
      <span className={fillColor}>{'▰'.repeat(filled)}</span>
      <span className={emptyColor}>{'▱'.repeat(empty)}</span>
      {label && <span className="text-[#999] tracking-normal"> {String(Math.round(pct)).padStart(3)}%</span>}
    </span>
  )
}
