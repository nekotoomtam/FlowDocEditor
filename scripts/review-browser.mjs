import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_EDITOR_URL = "http://localhost:4000/editor"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")

async function canReach(url) {
  try {
    const res = await fetch(url)
    return res.ok
  } catch {
    return false
  }
}

function runSmokeScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(scriptDir, scriptName)],
      {
        cwd: repoRoot,
        stdio: "inherit",
        env: process.env,
      },
    )
    child.once("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${scriptName} exited with code ${code}`))
    })
    child.once("error", reject)
  })
}

async function run() {
  if (process.env.SMOKE_BASE_URL != null) {
    throw new Error(
      "review:browser starts smoke-owned dev servers with different WYSIWYG flag sets. " +
      "Run an individual smoke command when intentionally targeting SMOKE_BASE_URL.",
    )
  }

  if (await canReach(DEFAULT_EDITOR_URL)) {
    throw new Error(
      `A Next dev server is already reachable at ${DEFAULT_EDITOR_URL}. ` +
      "review:browser needs to start smoke servers with different WYSIWYG flags; " +
      "stop the existing dev server or run an individual smoke command with SMOKE_BASE_URL.",
    )
  }

  await runSmokeScript("editor-smoke.mjs")
  await runSmokeScript("wysiwyg-stage4c-smoke.mjs")
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
