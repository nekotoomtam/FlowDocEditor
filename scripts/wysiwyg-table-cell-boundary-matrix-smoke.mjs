import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const boundarySmokeScript = process.env.FLOWDOC_TABLE_CELL_BOUNDARY_MATRIX_CHILD_SCRIPT
  ? path.resolve(process.env.FLOWDOC_TABLE_CELL_BOUNDARY_MATRIX_CHILD_SCRIPT)
  : path.join(scriptDir, "wysiwyg-table-cell-boundary-smoke.mjs")
const OUTPUT_TAIL_LIMIT = 4000
const DEFAULT_PROCESS_CRASH_RETRIES = 1

const TARGETS = [
  { id: "table-cell", label: "base table-cell", args: [] },
  { id: "flow-table-colspan", label: "flow-table colspan", args: ["--target=flow-table-colspan"] },
  { id: "flow-table-rowspan", label: "flow-table rowspan", args: ["--target=flow-table-rowspan"] },
  { id: "flow-table-mixed-span", label: "flow-table mixed rowspan/colspan", args: ["--target=flow-table-mixed-span"] },
  { id: "flow-table-colspan-overcase", label: "flow-table colspan over-case", args: ["--target=flow-table-colspan-overcase"] },
]

function readPositiveIntegerArg(name, defaultValue) {
  const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`))
  if (!arg) return defaultValue
  const rawValue = arg.slice(`--${name}=`.length)
  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer, got ${JSON.stringify(rawValue)}`)
  }
  return value
}

function readNonNegativeIntegerArg(name, defaultValue) {
  const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`))
  if (!arg) return defaultValue
  const rawValue = arg.slice(`--${name}=`.length)
  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer, got ${JSON.stringify(rawValue)}`)
  }
  return value
}

function selectedTargets() {
  const targetsArg = process.argv.find((arg) => arg.startsWith("--targets="))
  if (!targetsArg) return TARGETS

  const ids = targetsArg
    .slice("--targets=".length)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  const unknown = ids.filter((id) => !TARGETS.some((target) => target.id === id))
  if (unknown.length > 0) {
    throw new Error(`Unknown table-cell boundary smoke target(s): ${unknown.join(", ")}`)
  }
  return TARGETS.filter((target) => ids.includes(target.id))
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function appendOutputTail(tail, text) {
  const nextTail = `${tail}${text}`
  return nextTail.length > OUTPUT_TAIL_LIMIT ? nextTail.slice(-OUTPUT_TAIL_LIMIT) : nextTail
}

function isProcessCrashExit(result) {
  if (result.signal) return !["SIGINT", "SIGTERM"].includes(result.signal)
  return typeof result.code === "number" && result.code >= 128 && result.code !== 130 && result.code !== 143
}

function isRetryableProcessCrash(result) {
  if (result.code === 0 && !result.signal) return false
  if (result.sawChildSummary) return false
  return isProcessCrashExit(result)
}

function summarizeAttempt(result) {
  const summary = {
    attempt: result.attempt,
    code: result.code,
    signal: result.signal,
    durationMs: result.durationMs,
    observedOutputBytes: result.observedOutputBytes,
    sawChildSummary: result.sawChildSummary,
    sawChildFailure: result.sawChildFailure,
    retryableProcessCrash: isRetryableProcessCrash(result),
  }
  if (result.code !== 0 || result.signal) {
    summary.outputTail = result.outputTail
  }
  return summary
}

function runTargetAttempt(target, runIndex, attempt, { streamChildOutput }) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let outputProbe = ""
    let observedOutputBytes = 0
    let sawChildSummary = false
    let sawChildFailure = false
    let exitCode = null
    let exitSignal = null
    let exited = false
    let stdoutEnded = false
    let stderrEnded = false
    const child = spawn(process.execPath, [boundarySmokeScript, ...target.args], {
      env: {
        ...process.env,
        FLOWDOC_TABLE_CELL_BOUNDARY_MATRIX_ATTEMPT: String(attempt),
        FLOWDOC_TABLE_CELL_BOUNDARY_MATRIX_RUN: String(runIndex),
        FLOWDOC_TABLE_CELL_BOUNDARY_MATRIX_TARGET: target.id,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    const maybeResolve = () => {
      if (!exited || !stdoutEnded || !stderrEnded) return
      resolve({
        run: runIndex,
        attempt,
        ...target,
        code: exitCode,
        signal: exitSignal,
        durationMs: Date.now() - startedAt,
        observedOutputBytes,
        sawChildSummary,
        sawChildFailure,
        outputTail: outputProbe,
      })
    }
    const observeOutput = (chunk, stream) => {
      if (streamChildOutput) {
        stream.write(chunk)
      }
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)
      observedOutputBytes += Buffer.byteLength(text)
      const fullProbe = `${outputProbe}${text}`
      const compactProbe = fullProbe.replace(/\s+/g, "")
      sawChildSummary ||= fullProbe.includes('"ok"') || compactProbe.includes('"ok":')
      sawChildFailure ||= compactProbe.includes('"ok":false')
      outputProbe = appendOutputTail(outputProbe, text)
    }
    child.stdout?.on("data", (chunk) => observeOutput(chunk, process.stdout))
    child.stderr?.on("data", (chunk) => observeOutput(chunk, process.stderr))
    child.stdout?.on("end", () => {
      stdoutEnded = true
      maybeResolve()
    })
    child.stderr?.on("end", () => {
      stderrEnded = true
      maybeResolve()
    })
    child.on("exit", (code, signal) => {
      exitCode = code
      exitSignal = signal
      exited = true
      maybeResolve()
    })
  })
}

async function runTarget(target, runIndex, repeat, processCrashRetries, { streamChildOutput }) {
  const attempts = []
  const maxAttempts = processCrashRetries + 1
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runTargetAttempt(target, runIndex, attempt, { streamChildOutput })
    attempts.push(summarizeAttempt(result))
    if (result.code === 0 && !result.signal) {
      if (!streamChildOutput) {
        console.log(
          `PASS run ${runIndex}/${repeat} ${target.id}: durationMs=${result.durationMs} attempt=${attempt}/${maxAttempts} outputBytes=${result.observedOutputBytes}`,
        )
      }
      return {
        ...target,
        run: runIndex,
        code: result.code,
        signal: result.signal,
        durationMs: attempts.reduce((total, current) => total + current.durationMs, 0),
        attempts,
      }
    }
    if (attempt < maxAttempts && isRetryableProcessCrash(result)) {
      console.error(
        `\nRetrying run ${runIndex} ${target.id} after process crash: code=${result.code ?? "null"} signal=${result.signal ?? "null"} attempt=${attempt}/${maxAttempts}`,
      )
      continue
    }
    return {
      ...target,
      run: runIndex,
      code: result.code,
      signal: result.signal,
      durationMs: attempts.reduce((total, current) => total + current.durationMs, 0),
      attempts,
    }
  }
  throw new Error(`unreachable retry state for ${target.id}`)
}

const results = []

try {
  const targets = selectedTargets()
  const repeat = readPositiveIntegerArg("repeat", 1)
  const processCrashRetries = readNonNegativeIntegerArg("process-crash-retries", DEFAULT_PROCESS_CRASH_RETRIES)
  const streamChildOutput = !hasFlag("compact") || hasFlag("stream-child-output")
  if (targets.length === 0) {
    throw new Error("No table-cell boundary smoke targets selected")
  }

  console.log(
    `Running WYSIWYG table-cell boundary smoke matrix (${targets.length} target(s), repeat ${repeat}, process crash retries ${processCrashRetries}, ${streamChildOutput ? "streaming child output" : "compact child output"})`,
  )
  for (let runIndex = 1; runIndex <= repeat; runIndex += 1) {
    console.log(`\n=== matrix run ${runIndex}/${repeat} ===`)
    for (const target of targets) {
      console.log(`\n--- ${target.label} [${target.id}] ---`)
      const result = await runTarget(target, runIndex, repeat, processCrashRetries, { streamChildOutput })
      results.push(result)
      if (result.code !== 0 || result.signal) {
        console.error(
          `\nFAILED run ${runIndex}/${repeat} ${target.id}: code=${result.code ?? "null"} signal=${result.signal ?? "null"}`,
        )
        console.error(JSON.stringify({ ok: false, repeat, processCrashRetries, results }, null, 2))
        process.exit(result.code || 1)
      }
    }
  }

  console.log("\nWYSIWYG table-cell boundary smoke matrix passed")
  console.log(JSON.stringify({ ok: true, repeat, processCrashRetries, results }, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  if (results.length > 0) {
    console.error(JSON.stringify({ ok: false, results }, null, 2))
  }
  process.exit(1)
}
