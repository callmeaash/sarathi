import { api, unwrap } from '../api/client'

export const MAX_PHOTOS = 3
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024  // the server's limit for one photo
const MAX_SIDE_PX = 1600                  // the server stores photos no larger than this
const JPEG_QUALITY = 0.85

/**
 * Scale a photo down in the browser before sending it: phone photos are several megabytes, and the server
 * only keeps 1600 px. If the browser can't do it, the original is sent and the server scales it.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

/** Why a chosen file can't be used as a photo, or null if it can. */
export function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return `${file.name} isn't a JPEG, PNG or WebP photo.`
  return null
}

/** Attach one photo to a report that was just sent. */
export async function uploadPhoto(incidentId: number, file: File) {
  const photo = await shrinkPhoto(file)
  if (photo.size > MAX_UPLOAD_BYTES) throw new Error('photo too large')
  const form = new FormData()
  form.append('file', photo, 'photo.jpg')
  return unwrap(api.POST('/api/incidents/{incident_id}/photos', {
    params: { path: { incident_id: incidentId } },
    body: { file: '' },             // the real body is the form below; this only satisfies the generated type
    bodySerializer: () => form,     // the browser sets the multipart Content-Type itself
  }))
}
