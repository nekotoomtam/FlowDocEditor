function parseFixtureValue(value) {
  if (typeof value === "string") return JSON.parse(value)
  return value
}

function isObject(value) {
  return typeof value === "object" && value !== null
}

export function readFlowDocFixtureTargets(value) {
  const parsed = parseFixtureValue(value)
  if (!isObject(parsed)) return null
  const candidates = [
    parsed.mockData?.targets,
    parsed.fixture?.targets,
    parsed.document?.mockData?.targets,
  ]
  return candidates.find(isObject) ?? null
}

export function resolveFlowDocFixtureTarget(value, aliasPath) {
  const normalizedAlias = aliasPath?.trim()
  if (!normalizedAlias) return null

  const targets = readFlowDocFixtureTargets(value)
  if (!targets) return null

  let cursor = targets
  for (const part of normalizedAlias.split(".").filter(Boolean)) {
    if (!isObject(cursor) || !(part in cursor)) return null
    cursor = cursor[part]
  }

  return typeof cursor === "string" && cursor.length > 0 ? cursor : null
}

export function listFlowDocFixtureTargetAliases(value) {
  const targets = readFlowDocFixtureTargets(value)
  if (!targets) return []

  const aliases = []
  const visit = (prefix, node) => {
    if (typeof node === "string") {
      aliases.push(prefix)
      return
    }
    if (!isObject(node)) return
    for (const [key, child] of Object.entries(node)) {
      visit(prefix ? `${prefix}.${key}` : key, child)
    }
  }
  visit("", targets)
  return aliases.sort()
}
