import { MAX_SCALE, MIN_SCALE } from "./editorShellConstants"

export function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value))
}
