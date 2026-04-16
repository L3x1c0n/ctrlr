'use client'

import { useEffect, useRef, useState } from 'react'

export default function MarqueeText({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    function check() {
      if (!outerRef.current || !innerRef.current) return
      setOverflows(innerRef.current.scrollWidth > outerRef.current.clientWidth)
    }
    check()
    const ro = new ResizeObserver(check)
    if (outerRef.current) ro.observe(outerRef.current)
    return () => ro.disconnect()
  }, [children])

  return (
    <div ref={outerRef} className={`overflow-hidden whitespace-nowrap ${overflows ? 'scroll-hover' : ''} ${className ?? ''}`}>
      <span ref={innerRef} className="scroll-inner inline-block whitespace-nowrap">
        {children}
      </span>
    </div>
  )
}
