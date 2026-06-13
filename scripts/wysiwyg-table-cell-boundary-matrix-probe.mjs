import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const matrixRunner = path.join(scriptDir, "wysiwyg-table-cell-boundary-matrix-smoke.mjs")
const probeChild = path.join(scriptDir, "wysiwyg-table-cell-boundary-matrix-probe-child.mjs")

function runProbe(mode, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        matrixRunner,
        "--targets=table-cell",
        "--process-crash-retries=1",
        ...extraArgs,
      ],
      {
        env: {
          ...process.env,
          FLOWDOC_TABLE_CELL_BOUNDARY_MATRIX_CHILD_SCRIPT: probeChild,
          FLOWDOC_TABLE_CELL_BOUNDARY_MATRIX_PROBE_MODE: mode,
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    )
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.on("close", (code, signal) => resolve({ code, signal, output }))
  })
}

function countRetries(output) {
  return (output.match(/Retrying run/g) ?? []).length
}

function expectIncludes(output, text, label) {
  if (!output.includes(text)) {
    throw new Error(`expected ${label} to include ${JSON.stringify(text)}`)
  }
}

const okFalseResult = await runProbe("ok-false")
if (okFalseResult.code === 0 || okFalseResult.signal) {
  throw new Error(`expected ok:false probe to fail, got code=${okFalseResult.code} signal=${okFalseResult.signal}`)
}
const okFalseRetryCount = countRetries(okFalseResult.output)
if (okFalseRetryCount !== 0) {
  throw new Error(`expected ok:false child summary to avoid retry, got ${okFalseRetryCount} retry log(s)`)
}
expectIncludes(okFalseResult.output, '"sawChildSummary": true', "ok:false probe output")
expectIncludes(okFalseResult.output, '"sawChildFailure": true', "ok:false probe output")

const crashRetryResult = await runProbe("crash-then-pass")
if (crashRetryResult.code !== 0 || crashRetryResult.signal) {
  throw new Error(`expected crash retry probe to pass, got code=${crashRetryResult.code} signal=${crashRetryResult.signal}`)
}
const crashRetryCount = countRetries(crashRetryResult.output)
if (crashRetryCount !== 1) {
  throw new Error(`expected process-crash probe to retry once, got ${crashRetryCount} retry log(s)`)
}
expectIncludes(crashRetryResult.output, '"retryableProcessCrash": true', "process-crash probe output")
expectIncludes(crashRetryResult.output, '"attempt": 2', "process-crash probe output")
expectIncludes(crashRetryResult.output, '"probe": "process-crash-retry"', "process-crash probe output")

const compactCrashRetryResult = await runProbe("crash-then-pass", ["--compact"])
if (compactCrashRetryResult.code !== 0 || compactCrashRetryResult.signal) {
  throw new Error(
    `expected compact crash retry probe to pass, got code=${compactCrashRetryResult.code} signal=${compactCrashRetryResult.signal}`,
  )
}
const compactCrashRetryCount = countRetries(compactCrashRetryResult.output)
if (compactCrashRetryCount !== 1) {
  throw new Error(`expected compact process-crash probe to retry once, got ${compactCrashRetryCount} retry log(s)`)
}
expectIncludes(compactCrashRetryResult.output, "compact child output", "compact process-crash probe output")
expectIncludes(compactCrashRetryResult.output, "PASS run 1/1 table-cell", "compact process-crash probe output")
expectIncludes(compactCrashRetryResult.output, '"retryableProcessCrash": true', "compact process-crash probe output")
expectIncludes(compactCrashRetryResult.output, '"attempt": 2', "compact process-crash probe output")

console.log(JSON.stringify({
  ok: true,
  probes: [
    {
      probe: "ok-false-no-retry",
      childExitCode: okFalseResult.code,
      retryCount: okFalseRetryCount,
    },
    {
      probe: "process-crash-retry",
      childExitCode: crashRetryResult.code,
      retryCount: crashRetryCount,
    },
    {
      probe: "compact-process-crash-retry",
      childExitCode: compactCrashRetryResult.code,
      retryCount: compactCrashRetryCount,
    },
  ],
}, null, 2))
