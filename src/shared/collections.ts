export interface Collections {
  [name: string]: string[]
}

export function addPathsToCollection(collections: Collections, name: string, paths: string[]): Collections {
  const existing = collections[name] ?? []
  const merged = [...existing]

  for (const path of paths) {
    if (!merged.includes(path)) {
      merged.push(path)
    }
  }

  return { ...collections, [name]: merged }
}

export function removePathFromCollection(collections: Collections, name: string, path: string): Collections {
  const existing = collections[name]
  if (!existing) {
    return collections
  }

  const remaining = existing.filter((item) => item !== path)
  const next = { ...collections }

  if (remaining.length === 0) {
    delete next[name]
  } else {
    next[name] = remaining
  }

  return next
}
