import imageCompression from 'browser-image-compression'

/** Detect whether a file is an image by MIME type */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

/** GIF files compress poorly via canvas and lose animation; caller decides how to handle */
export function isGifFile(file: File): boolean {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
}

/**
 * Compress an image File/Blob to WebP using browser-image-compression.
 * Non-image inputs are returned unchanged.
 */
export async function compressImageToWebp(
  file: File | Blob,
  options: { maxSizeMB?: number, maxWidthOrHeight?: number, initialQuality?: number } = {}
): Promise<File> {
  const {
    maxSizeMB = 1,
    maxWidthOrHeight = 2048,
    initialQuality = 0.8
  } = options

  // browser-image-compression requires a File (with name) for WebP conversion
  const inputFile = file instanceof File
    ? file
    : new File([file], 'image.png', { type: 'image/png' })

  return imageCompression(inputFile, {
    fileType: 'image/webp',
    maxSizeMB,
    maxWidthOrHeight,
    initialQuality,
    useWebWorker: true
  })
}

/** Convert a Blob/File to a data URL for use as cropper source */
export function readFileAsDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
