export interface PickLocalImagesOptions {
  multiple?: boolean
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function pickImagesInBrowser(multiple: boolean): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = multiple
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      void Promise.all(files.map(fileToDataUrl)).then(resolve, reject)
    }
    input.oncancel = () => resolve([])
    input.click()
  })
}

export async function pickLocalImages(
  options: PickLocalImagesOptions = {},
): Promise<string[]> {
  const multiple = options.multiple ?? true
  const electronPicker = window.imageLibrary?.pickLocalImages

  if (electronPicker) {
    return (await electronPicker()) ?? []
  }

  return pickImagesInBrowser(multiple)
}
