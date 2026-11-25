import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { missingKind, type PictureKind } from '@/domain/pool'
import { useSettings } from '@/store/useSettings'
import { useDeckPool } from '@/store/useThemes'
import { cx } from '@/components/ui'

/**
 * Why a place for a picture is empty (`domain/pool.ts`): it takes a kind the theme's pool does not hold, and the other
 * kind does not stand in. Shown only then: where the pool has photos but no illustrations for a place that shows its
 * picture whole, or the other way round. `about` says whose places are meant: this one, or the variants of a title
 * slide that take the kind. The owner gets the way to the pool, which is theirs to fill.
 */
export function KindHint({ theme, wanted, about = 'place', onLeave, className }: { theme: string | undefined; wanted: PictureKind[]; about?: 'place' | 'title'; onLeave?: () => void; className?: string }) {
  const { t } = useTranslation()
  const pool = useDeckPool(theme ?? '')
  const owner = useSettings((s) => s.me.owner)
  const missing = missingKind(pool, wanted)
  if (!missing || !theme) return null
  return (
    <p className={cx('rounded-md bg-surface-2 px-3 py-2 text-[12px] leading-snug text-ink-2', className)} role="note">
      {t(`editor.kindMissing.${about}.${missing}`)}{' '}
      {owner && (
        <Link to={`/pictures?theme=${encodeURIComponent(theme)}`} onClick={onLeave} className="whitespace-nowrap font-medium text-ink underline hover:no-underline">
          {t('editor.kindMissing.toPool')}
        </Link>
      )}
    </p>
  )
}
