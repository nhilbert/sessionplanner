import { type DragEvent, type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, File as FileIcon, FileImage, FileSpreadsheet, FileText, FileType, Loader2, Pencil, Presentation, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import { ACCEPTED_FILES, extensionOf, fileKind, type FileKind } from '@/domain/attachments'
import { reportFailure } from '@/api'
import { Button, cx, IconButton, useIsPhone } from '@/components/ui'
import Menu, { type MenuItem } from '@/components/Menu'
import { formatSize } from './fields'
import { fileProblem, uploadProblem } from './upload'

export interface ManagedFile {
  id: string
  name: string
  size: number
  /** A second line beside the size: where the file is used. */
  note?: ReactNode
}

const KIND_ICON: Record<FileKind, typeof FileIcon> = { pdf: FileText, image: FileImage, document: FileText, markdown: FileType, spreadsheet: FileSpreadsheet, presentation: Presentation }

/** A file being sent, or the reason it was not. */
interface Job {
  key: number
  name: string
  problem: string | null
}

let jobs = 0

/**
 * Files of a workshop, a step or a library entry: dropping or choosing several at once, what is on its way and what
 * failed shown in the list, and per file download, rename, a new version and removal. What each of these does comes
 * from the place the list is in; an action left out is not offered.
 */
export function FileManager({
  files,
  href,
  empty,
  compact,
  onUpload,
  onRename,
  onReplace,
  remove,
  children,
}: {
  files: ManagedFile[]
  href: (id: string) => string
  /** Shown while the list is empty. */
  empty?: string
  /** One line instead of the drop area, for a list among others (the items of a group); dropping works all the same. */
  compact?: boolean
  onUpload: (file: File) => Promise<unknown>
  onRename?: (id: string, name: string) => Promise<unknown>
  onReplace?: (id: string, file: File) => Promise<unknown>
  /** Taking a file off the list: deleting it, or unlinking it from a step. */
  remove?: { label: string; danger?: boolean; run: (file: ManagedFile) => Promise<unknown> | void }
  /** More ways to add a file, under the drop area. */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const picker = useRef<HTMLInputElement>(null)
  const replacer = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | null>(null)
  const [queue, setQueue] = useState<Job[]>([])
  const [over, setOver] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  const dismiss = (key: number) => setQueue((q) => q.filter((j) => j.key !== key))
  /** Sends the files one after the other; each leaves the list when it is done, or stays with its reason. */
  const send = async (list: File[], action: (file: File) => Promise<unknown>) => {
    const batch = list.map((file) => ({ file, job: { key: ++jobs, name: file.name, problem: fileProblem(file, t) } }))
    setQueue((q) => [...q, ...batch.map((b) => b.job)])
    for (const { file, job } of batch) {
      if (job.problem) continue
      try {
        await action(file)
        dismiss(job.key)
      } catch (err) {
        setQueue((q) => q.map((j) => (j.key === job.key ? { ...j, problem: uploadProblem(err, file.name, t) } : j)))
      }
    }
  }

  const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  const drop = {
    onDragOver: (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setOver(true)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
    },
    onDrop: (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      setOver(false)
      void send([...e.dataTransfer.files], onUpload)
    },
  }

  const menu = (f: ManagedFile): MenuItem[] => [
    {
      label: t('common.download'),
      icon: <Download size={14} />,
      onSelect: () => {
        const a = document.createElement('a')
        a.href = href(f.id)
        a.download = f.name
        a.click()
      },
    },
    ...(onRename ? [{ label: t('files.rename'), icon: <Pencil size={14} />, onSelect: () => setRenaming(f.id) }] : []),
    ...(onReplace
      ? [
          {
            label: t('files.replace'),
            icon: <RefreshCw size={14} />,
            onSelect: () => {
              replacing.current = f.id
              replacer.current?.click()
            },
          },
        ]
      : []),
    ...(remove ? [{ label: remove.label, icon: remove.danger ? <Trash2 size={14} /> : <X size={14} />, danger: remove.danger, onSelect: () => void Promise.resolve(remove.run(f)).catch(reportFailure) }] : []),
  ]

  return (
    <div {...drop} className={cx(compact && 'rounded-md', compact && over && 'bg-accent-soft')}>
      {!files.length && !queue.length && empty && <p className="mb-2 text-[13px] text-ink-2">{empty}</p>}
      {(files.length > 0 || queue.length > 0) && (
        <ul className={cx('divide-y divide-line', !compact && 'mb-2')}>
          {files.map((f) => {
            const kind = fileKind(f.name)
            const Icon = kind ? KIND_ICON[kind] : FileIcon
            return (
              <li key={f.id} className="flex items-center gap-2 py-1.5">
                <Icon size={15} className="shrink-0 text-ink-3" aria-hidden />
                {renaming === f.id && onRename ? (
                  <RenameField
                    name={f.name}
                    onDone={(name) => {
                      setRenaming(null)
                      if (name && name !== f.name) void onRename(f.id, name).catch(reportFailure)
                    }}
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <a href={href(f.id)} download={f.name} className="block truncate text-[13px] hover:underline" title={f.name}>
                      {f.name}
                    </a>
                    <div className="truncate text-[11px] text-ink-3">
                      {formatSize(f.size)}
                      {f.note && <> · {f.note}</>}
                    </div>
                  </div>
                )}
                <Menu items={menu(f)} label={t('files.actions', { name: f.name })} title={f.name} />
              </li>
            )
          })}
          {queue.map((j) => (
            <li key={j.key} className="flex items-center gap-2 py-1.5" role={j.problem ? 'alert' : 'status'}>
              {j.problem ? (
                <>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-rose">{j.problem}</span>
                  <IconButton label={t('common.close')} onClick={() => dismiss(j.key)}>
                    <X size={14} />
                  </IconButton>
                </>
              ) : (
                <>
                  <Loader2 size={15} className="shrink-0 animate-spin text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{j.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-3">{t('common.uploading')}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {compact ? (
        <Button size="sm" variant="ghost" className="-ml-2" title={t('files.rules')} onClick={() => picker.current?.click()}>
          <Upload size={13} />
          {t('files.add')}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className={cx('block w-full rounded-lg border border-dashed px-3 py-3 text-center transition-colors', over ? 'border-accent bg-accent-soft' : 'border-line-2 hover:bg-surface-2')}
        >
          <span className="flex items-center justify-center gap-1.5 text-[13px] text-ink">
            <Upload size={13} className="text-ink-3" aria-hidden />
            {phone ? t('files.choose') : t('files.dropOrChoose')}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{t('files.rules')}</span>
        </button>
      )}
      {children}
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept={ACCEPTED_FILES}
        onChange={(e) => {
          const list = [...(e.target.files ?? [])]
          e.target.value = ''
          void send(list, onUpload)
        }}
      />
      <input
        ref={replacer}
        type="file"
        hidden
        accept={ACCEPTED_FILES}
        onChange={(e) => {
          const list = [...(e.target.files ?? [])]
          const id = replacing.current
          e.target.value = ''
          if (id && onReplace) void send(list, (file) => onReplace(id, file))
        }}
      />
    </div>
  )
}

/** The name without its ending, which says what the file is and stays. Enter or leaving the field saves, Escape keeps the old name. */
function RenameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const { t } = useTranslation()
  const ext = extensionOf(name)
  const ending = ext ? name.slice(-(ext.length + 1)) : ''
  const stem = ending ? name.slice(0, -ending.length) : name
  const [value, setValue] = useState(stem)
  const finished = useRef(false)
  const finish = (result: string | null) => {
    if (finished.current) return
    finished.current = true
    onDone(result)
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <input
        autoFocus
        aria-label={t('files.rename')}
        className="field h-7 min-w-0 flex-1 text-[13px]"
        value={value}
        maxLength={240}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(value.trim() ? value.trim() + ending : null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(value.trim() ? value.trim() + ending : null)
          if (e.key === 'Escape') {
            e.stopPropagation()
            finish(null)
          }
        }}
      />
      {ending && <span className="shrink-0 text-[12px] text-ink-3">{ending}</span>}
    </div>
  )
}
