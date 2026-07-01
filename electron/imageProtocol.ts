import { pathToFileURL } from 'node:url'

export function toImageSourceUrl(absolutePath: string): string {
  return `local-image://file/${encodeURIComponent(absolutePath)}`
}

export function imageSourceUrlToFileUrl(requestUrl: string): string {
  const url = new URL(requestUrl)
  const encodedPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
  return pathToFileURL(decodeURIComponent(encodedPath)).toString()
}
