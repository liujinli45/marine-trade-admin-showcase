import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const DOCUMENT_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

export async function sanitizeImageBuffer(buffer, { maxPixels = 25_000_000, maxDimension = 4096 } = {}) {
  const detected = await fileTypeFromBuffer(buffer)
  if (!detected || !IMAGE_TYPES.has(detected.mime)) throw new Error('INVALID_IMAGE_TYPE')
  const image = sharp(buffer, { limitInputPixels: maxPixels, animated: false })
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels) throw new Error('IMAGE_DIMENSIONS_EXCEEDED')
  const output = await image.rotate().resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
  return { buffer: output, extension: '.webp', mime: 'image/webp' }
}

export async function validateDocumentBuffer(buffer) {
  const detected = await fileTypeFromBuffer(buffer)
  if (!detected || !DOCUMENT_TYPES.has(detected.mime)) throw new Error('INVALID_DOCUMENT_TYPE')
  return detected
}

