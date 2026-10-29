import type { TFunction } from 'i18next'
import { api } from '@/api'
import type { Attachment } from '@/domain/types'

export const MAX_FILE = 25 * 1024 * 1024

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
    } catch {
      problems.push(t('files.failed', { name: file.name }))
    }
  }
  if (problems.length) window.alert(problems.join('\n'))
  return added
}
