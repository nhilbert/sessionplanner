import type { TFunction } from 'i18next'
import { api, ApiError } from '@/api'
import type { Attachment } from '@/domain/types'

export const MAX_FILE = 25 * 1024 * 1024

/** Why an upload failed, in words: the workshop's files are full, a guest's day is used up, or something else. */
export function uploadProblem(err: unknown, name: string, t: TFunction): string {
  if (err instanceof ApiError && err.message === 'quota') return t('files.quota', { name })
  if (err instanceof ApiError && err.message === 'upload_budget') return t('files.budget', { name })
  return t('files.failed', { name })
}

/** Uploads one file after the other; files over the limit or failing are reported and skipped. */
export async function uploadFiles(workshopId: string, files: File[], t: TFunction): Promise<Attachment[]> {
  const added: Attachment[] = []
  const problems: string[] = []
  for (const file of files) {
    if (file.size > MAX_FILE) {
      problems.push(t('files.tooLarge', { name: file.name }))
      continue
    }
    try {
      added.push(await api.upload(workshopId, file))
    } catch (err) {
      problems.push(uploadProblem(err, file.name, t))
    }
  }
  if (problems.length) window.alert(problems.join('\n'))
  return added
}
