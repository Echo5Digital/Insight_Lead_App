'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
}

export function AnimatedCounter({ value, duration = 1200, suffix = '', prefix = '' }: Props) {
  const [display, setDisplay] = useState(0);
  const raf  = useRef<number>(0);
  const prev = useRef(0);

  useEffect(() => {
    if (value === prev.current) return;
    const start     = prev.current;
    const end       = value;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) raf.current = requestAnimationFrame(step);
      else prev.current = end;
    };

    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return <>{prefix}{display.toLocaleString()}{suffix}</>;
}
