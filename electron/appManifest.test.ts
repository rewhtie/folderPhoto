import { describe, expect, it } from 'vitest'
import { parseAppName } from './appManifest'

describe('parseAppName', () => {
  it('extracts the name field from acf content', () => {
    const acf = `"AppState"
{
  "appid"  "1598780"
  "name"   "NEKOPARA Vol. 4"
  "StateFlags"  "4"
}`

    expect(parseAppName(acf)).toBe('NEKOPARA Vol. 4')
  })

  it('returns null when no name field exists', () => {
    expect(parseAppName('"AppState" { "appid" "10" }')).toBeNull()
  })
})
