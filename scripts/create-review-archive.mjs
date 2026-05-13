import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const DEFAULT_OUTPUT = path.join(repoRoot, "flowdoc-review-archive.zip")

const argv = process.argv.slice(2)
const checkOnly = argv.includes("--check")
const outIndex = argv.indexOf("--out")
const outputPath = outIndex >= 0 && argv[outIndex + 1]
  ? path.resolve(repoRoot, argv[outIndex + 1])
  : DEFAULT_OUTPUT

const REQUIRED_FILES = [
  "package.json",
  "package-lock.json",
  "next-env.d.ts",
  "tsconfig.json",
  "next.config.ts",
  "vitest.config.ts",
  "AGENTS.md",
  "public/fonts/THSarabun.ttf",
  "scripts/review-build.mjs",
  "scripts/review-browser.mjs",
  "scripts/smoke-browser.mjs",
  "scripts/editor-smoke.mjs",
  "scripts/wysiwyg-stage4c-smoke.mjs",
]

const REVIEW_ROOTS = [
  "docs",
  "packages",
  "public",
  "scripts",
  "src",
]

const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "out",
])

const FORBIDDEN_ARCHIVE_SEGMENTS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vite",
  "coverage",
  "node_modules",
  "out",
])

function toArchivePath(filePath) {
  return filePath.split(path.sep).join("/")
}

function shouldInclude(relativePath) {
  const normalized = toArchivePath(relativePath)
  if (normalized.endsWith(".zip")) return false
  if (normalized.endsWith(".tsbuildinfo")) return false
  return !normalized.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment))
}

function collectFile(relativePath, files) {
  if (!shouldInclude(relativePath)) return

  const absolutePath = path.join(repoRoot, relativePath)
  if (!fs.existsSync(absolutePath)) return

  const stat = fs.statSync(absolutePath)
  if (stat.isDirectory()) {
    const children = fs.readdirSync(absolutePath).sort((a, b) => a.localeCompare(b))
    for (const child of children) collectFile(path.join(relativePath, child), files)
    return
  }

  if (stat.isFile()) files.set(toArchivePath(relativePath), absolutePath)
}

function collectReviewFiles() {
  const files = new Map()
  for (const file of REQUIRED_FILES) collectFile(file, files)
  for (const root of REVIEW_ROOTS) collectFile(root, files)
  return files
}

function assertRequiredFiles(files) {
  const missing = REQUIRED_FILES.filter((file) => !files.has(file))
  if (missing.length > 0) {
    throw new Error(`Review archive is missing required files: ${missing.join(", ")}`)
  }

  const fontPath = files.get("public/fonts/THSarabun.ttf")
  const fontSize = fs.statSync(fontPath).size
  if (fontSize <= 0) {
    throw new Error("Review archive runtime font is empty: public/fonts/THSarabun.ttf")
  }
}

function assertReviewArchiveEntries(entries) {
  const entrySet = new Set(entries)
  const missing = REQUIRED_FILES.filter((file) => !entrySet.has(file))
  if (missing.length > 0) {
    throw new Error(`Review archive entries are missing required files: ${missing.join(", ")}`)
  }

  const forbidden = entries.filter((entry) =>
    entry.split("/").some((segment) => FORBIDDEN_ARCHIVE_SEGMENTS.has(segment)) ||
    entry.endsWith("/results.json"),
  )
  if (forbidden.length > 0) {
    throw new Error(`Review archive contains generated or forbidden paths: ${forbidden.slice(0, 10).join(", ")}`)
  }
}

const crcTable = new Uint32Array(256)
for (let i = 0; i < crcTable.length; i++) {
  let c = i
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  crcTable[i] = c >>> 0
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980)
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { dosDate, dosTime }
}

function makeZip(files, output) {
  const localChunks = []
  const centralChunks = []
  let offset = 0

  for (const [archiveName, absolutePath] of files) {
    const data = fs.readFileSync(absolutePath)
    const name = Buffer.from(archiveName, "utf8")
    const stat = fs.statSync(absolutePath)
    const { dosDate, dosTime } = dosDateTime(stat.mtime)
    const crc = crc32(data)

    const localHeader = Buffer.alloc(30 + name.length)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)
    name.copy(localHeader, 30)

    const centralHeader = Buffer.alloc(46 + name.length)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    name.copy(centralHeader, 46)

    localChunks.push(localHeader, data)
    centralChunks.push(centralHeader)
    offset += localHeader.length + data.length
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.size, 8)
  end.writeUInt16LE(files.size, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  fs.writeFileSync(output, Buffer.concat([...localChunks, ...centralChunks, end]))
}

function readZipEntries(zipPath) {
  const buffer = fs.readFileSync(zipPath)
  const entries = []
  let offset = 0

  while (offset < buffer.length) {
    const signature = buffer.readUInt32LE(offset)
    if (signature === 0x02014b50 || signature === 0x06054b50) break
    if (signature !== 0x04034b50) {
      throw new Error(`Invalid ZIP local header at byte ${offset}`)
    }

    const compressedSize = buffer.readUInt32LE(offset + 18)
    const fileNameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const nameEnd = nameStart + fileNameLength
    entries.push(buffer.subarray(nameStart, nameEnd).toString("utf8"))
    offset = nameEnd + extraLength + compressedSize
  }

  return entries
}

const files = collectReviewFiles()
assertRequiredFiles(files)
assertReviewArchiveEntries(Array.from(files.keys()))

if (checkOnly) {
  console.log(`Review archive check passed: ${files.size} files would be included.`)
  console.log("Required runtime font: public/fonts/THSarabun.ttf")
} else {
  makeZip(files, outputPath)
  assertReviewArchiveEntries(readZipEntries(outputPath))
  console.log(`Created review archive: ${outputPath}`)
  console.log(`Included files: ${files.size}`)
}
