import { useEffect, useState } from 'react'

export type Remaining = { days: number; hours: number; minutes: number; seconds: number; done: boolean }

function remaining(target: number): Remaining {
  const diff = Math.max(0, target - Date.now())
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor(diff / 3_600_000) % 24,
    minutes: Math.floor(diff / 60_000) % 60,
    seconds: Math.floor(diff / 1000) % 60,
    done: diff === 0,
  }
}

export function useCountdown(isoDate: string): Remaining {
  const target = new Date(isoDate).getTime()
  const [state, setState] = useState(() => remaining(target))

  useEffect(() => {
    const id = window.setInterval(() => setState(remaining(target)), 1000)
    return () => window.clearInterval(id)
  }, [target])

  return state
}
