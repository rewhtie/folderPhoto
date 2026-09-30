export interface PickLocalImagesOptions {
  multiple?: boolean
}

export async function pickLocalImages(
  options: PickLocalImagesOptions = {},
): Promise<string[]> {
  return (await window.imageLibrary.pickLocalImages(options)) ?? []
}
