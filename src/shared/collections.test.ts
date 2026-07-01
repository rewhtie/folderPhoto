import { describe, expect, it } from 'vitest'
import { addPathsToCollection, removePathFromCollection } from './collections'

describe('addPathsToCollection', () => {
  it('adds paths to a new collection without duplicates', () => {
    const result = addPathsToCollection({}, '黄油', ['a.jpg', 'b.jpg', 'a.jpg'])

    expect(result).toEqual({ 黄油: ['a.jpg', 'b.jpg'] })
  })

  it('merges into an existing collection and dedupes', () => {
    const result = addPathsToCollection({ 黄油: ['a.jpg'] }, '黄油', ['a.jpg', 'c.jpg'])

    expect(result).toEqual({ 黄油: ['a.jpg', 'c.jpg'] })
  })

  it('does not mutate the input', () => {
    const input = { 黄油: ['a.jpg'] }
    addPathsToCollection(input, '黄油', ['b.jpg'])

    expect(input).toEqual({ 黄油: ['a.jpg'] })
  })
})

describe('removePathFromCollection', () => {
  it('removes a path and drops empty collections', () => {
    const result = removePathFromCollection({ 黄油: ['a.jpg'] }, '黄油', 'a.jpg')

    expect(result).toEqual({})
  })

  it('keeps other paths in the collection', () => {
    const result = removePathFromCollection({ 黄油: ['a.jpg', 'b.jpg'] }, '黄油', 'a.jpg')

    expect(result).toEqual({ 黄油: ['b.jpg'] })
  })
})
