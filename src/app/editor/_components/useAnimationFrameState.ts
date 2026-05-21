import { useCallback, useEffect, useRef, useState } from "react"

export function useAnimationFrameState<T>(initialValue: T) {
  const [value, setValue] = useState<T>(initialValue)
  const valueRef = useRef<T>(initialValue)
  const pendingValueRef = useRef<T>(initialValue)
  const frameRef = useRef<number | null>(null)

  const cancelPendingFrame = useCallback(() => {
    if (frameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(frameRef.current)
    }
    frameRef.current = null
  }, [])

  const setImmediate = useCallback((nextValue: T) => {
    cancelPendingFrame()
    pendingValueRef.current = nextValue
    valueRef.current = nextValue
    setValue(nextValue)
  }, [cancelPendingFrame])

  const setOnAnimationFrame = useCallback((nextValue: T) => {
    pendingValueRef.current = nextValue
    valueRef.current = nextValue

    if (typeof requestAnimationFrame === "undefined") {
      setValue(nextValue)
      return
    }

    if (frameRef.current !== null) return

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      setValue(pendingValueRef.current)
    })
  }, [])

  useEffect(() => () => cancelPendingFrame(), [cancelPendingFrame])

  return { value, valueRef, setImmediate, setOnAnimationFrame }
}
