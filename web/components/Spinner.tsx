'use client'
import { useState, useEffect } from 'react'
const FRAMES = ['|', '/', '—', '\\']
export default function Spinner() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % 4), 120)
    return () => clearInterval(id)
  }, [])
  return <span className="text-[#999] font-mono text-sm">{FRAMES[i]}</span>
}
