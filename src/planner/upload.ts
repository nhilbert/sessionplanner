import type { TFunction } from 'i18next'
import { ApiError } from '@/api'
import { fileKind, MAX_ATTACHMENT } from '@/domain/attachments'

/** Why a file may not be attached, in words, before anything is sent. */
export function fileProblem(file: File, t: TFunction): string | null {
  if (!fileKind(file.name)) return t('files.wrongType', { name: file.name })
  if (file.size > MAX_ATTACHMENT) return t('files.tooLarge', { name: file.name })
  return null
}

/** Why an upload failed, in words: the workshop's files are full, a guest's day is used up, or something else. */
export function uploadProblem(err: unknown, name: string, t: TFunction): string {
  if (err instanceof ApiError && err.message === 'quota') return t('files.quota', { name })
  if (err instanceof ApiError && err.message === 'upload_budget') return t('files.budget', { name })
  if (err instanceof ApiError && err.message === 'too_large') return t('files.tooLarge', { name })
  if (err instanceof ApiError && err.message === 'file_type') return t('files.wrongType', { name })
  return t('files.failed', { name })
}
