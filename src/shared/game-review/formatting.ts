const RECOMMENDATION_CLASSES: Record<string, string> = {
  C: 'grade-c',
  'C+': 'grade-c-plus',
  B: 'grade-b',
  'B+': 'grade-b-plus',
  A: 'grade-a',
  'A+': 'grade-a-plus',
  S: 'grade-s',
  'S+': 'grade-s-plus',
}

export function recommendationClass(recommendation: string): string {
  return RECOMMENDATION_CLASSES[recommendation] ?? 'grade-empty'
}

export function durationClass(duration: string): string {
  const match = duration.trim().match(/^(\d+(?:\.\d+)?)\s*(?:h|小时)?$/i)
  if (!match) return 'duration-default'

  const hours = Number(match[1])
  if (hours >= 150) return 'duration-rainbow'
  if (hours >= 99) return 'duration-gold'
  if (hours >= 60) return 'duration-orange'
  if (hours >= 30) return 'duration-purple'
  if (hours >= 10) return 'duration-blue'
  return 'duration-green'
}

export function normalizeDuration(value: string): string {
  return value
    .replace(/(?:h|小时)/gi, '')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1')
}

export function formatSteamPlaytime(minutes: number): string {
  return String(Math.round((minutes / 60) * 10) / 10)
}
