import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"

const testArgs = [
  "run",
  "test",
  "-w",
  "packages/core",
  "--",
  "src/renderer/__tests__/pdfVisualRegression.test.ts",
]

function resolveNpmInvocation() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...testArgs],
      shell: false,
    }
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: testArgs,
    shell: process.platform === "win32",
  }
}

function commandCanStart(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore", shell: process.platform === "win32" })
  return result.error == null && result.status === 0
}

function findWingetPopplerBin() {
  if (process.platform !== "win32") return null
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null

  const packagesRoot = join(localAppData, "Microsoft", "WinGet", "Packages")
  if (!existsSync(packagesRoot)) return null

  let packageDirs
  try {
    packageDirs = readdirSync(packagesRoot, { withFileTypes: true })
  } catch {
    return null
  }

  for (const dir of packageDirs) {
    if (!dir.isDirectory() || !dir.name.startsWith("oschwartz10612.Poppler_")) continue
    const packagePath = join(packagesRoot, dir.name)
    let versionDirs
    try {
      versionDirs = readdirSync(packagePath, { withFileTypes: true })
    } catch {
      continue
    }

    for (const versionDir of versionDirs) {
      if (!versionDir.isDirectory() || !versionDir.name.startsWith("poppler-")) continue
      const bin = join(packagePath, versionDir.name, "Library", "bin")
      if (existsSync(join(bin, "pdftoppm.exe"))) return bin
    }
  }

  return null
}

function buildEnv() {
  const nodeBin = dirname(process.execPath)
  const env = {
    ...process.env,
    FLOWDOC_PDF_VISUAL_REGRESSION: "1",
  }
  env.Path = `${nodeBin};${env.Path ?? ""}`
  env.PATH = `${nodeBin};${env.PATH ?? ""}`

  const defaultWingetPopplerBin = process.platform === "win32" && process.env.LOCALAPPDATA
    ? join(
        process.env.LOCALAPPDATA,
        "Microsoft",
        "WinGet",
        "Packages",
        "oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe",
        "poppler-25.07.0",
        "Library",
        "bin",
      )
    : null
  const popplerBin = findWingetPopplerBin()
  const fallbackBin = popplerBin ?? defaultWingetPopplerBin
  if (fallbackBin) {
    const pdftoppmPath = join(fallbackBin, "pdftoppm.exe")
    env.Path = `${fallbackBin};${env.Path ?? ""}`
    env.PATH = `${fallbackBin};${env.PATH ?? ""}`
    if (existsSync(pdftoppmPath)) env.FLOWDOC_PDFTOPPM_PATH = pdftoppmPath
    console.log(`Using Poppler from ${fallbackBin}`)
  }

  return env
}

console.log("Running PDF visual regression with FLOWDOC_PDF_VISUAL_REGRESSION=1")

const npmInvocation = resolveNpmInvocation()
const result = spawnSync(npmInvocation.command, npmInvocation.args, {
  stdio: "inherit",
  shell: npmInvocation.shell,
  env: buildEnv(),
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

if (result.signal) {
  console.error(`PDF visual regression stopped by signal ${result.signal}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
