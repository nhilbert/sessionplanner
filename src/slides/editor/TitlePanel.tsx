import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { TITLE_VARIANTS, type TitleVariant } from '@/domain/titleVariants'
import { titlePictureKind } from '@/domain/pool'
import { useKindContext } from '@/store/useThemes'
import { Button, cx } from '@/components/ui'
import { type AssetScope, SlideView } from '../SlideView'
import { PictureField } from './PicturePicker'
import { KindHint } from './KindHint'
import { tr } from './fields'
import type { TitleControl } from './source'

/** What a variant is called. A theme that offers only "with" and "without" a picture (the playful family) says so. */
export function variantLabel(t: TFunction, variant: TitleVariant, choices: TitleVariant[]): string {
  const two = choices.length === 2 && choices.includes('none')
  return tr(t, two && variant !== 'none' ? 'editor.pick.variant.picture' : `editor.pick.variant.${variant}`)
}

/**
 * The variants of a title slide as tiles: each shows the slide as it would stand, so what a picture does in a variant
 * is seen before it is chosen. The chosen one is filled; the theme's own is named.
 */
export function VariantTiles({ choices, value, themeVariant, html, theme, scope, onPick, disabled, columns = 2 }: { choices: TitleVariant[]; value: TitleVariant; themeVariant?: TitleVariant; html: (variant: TitleVariant) => string; theme: string; scope: AssetScope; onPick: (variant: TitleVariant) => void; disabled?: boolean; columns?: 2 | 3 }) {
  const { t } = useTranslation()
  return (
    <div className={cx('-mx-1.5 grid gap-1', columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')} role="group" aria-label={t('editor.titleVariantLabel')}>
      {TITLE_VARIANTS.filter((v) => choices.includes(v)).map((v) => (
        <button key={v} type="button" disabled={disabled} aria-pressed={v === value} onClick={() => onPick(v)} className={cx('flex flex-col gap-1.5 rounded-xl p-1.5 pb-2 text-left', v === value ? 'bg-accent-soft' : 'hover:bg-surface-2', disabled && 'cursor-default')}>
          <SlideView html={html(v)} theme={theme} scope={scope} className="pointer-events-none overflow-hidden rounded-md ring-1 ring-line" />
          <span className="px-0.5 text-[13px] font-semibold leading-tight text-brand-ink">
            {variantLabel(t, v, choices)}
            {v === themeVariant && <span className="block text-[11px] font-medium text-ink-2">{t('editor.titleThemeDefault')}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * A generated title slide in the editor: its picture and its variant, each chosen for this slide alone (a workshop of
 * several days has a title slide per day). Without a choice the picture is the pool's next and the variant the theme's.
 */
export function TitlePanel({ slideKey, control, picture, theme, scope, canEdit, several }: { slideKey: string; control: TitleControl; picture?: { value: string; set: (hash: string) => void; known: string[] }; theme: string; scope: AssetScope; canEdit: boolean; several: boolean }) {
  const { t } = useTranslation()
  const title = control.theme()
  const chosen = control.chosen(slideKey)
  const value = chosen && title.choices.includes(chosen) ? chosen : title.variant
  const pictures = title.choices.some((v) => v !== 'none')
  const { whole } = useKindContext(theme)
  // the kinds the variants on offer take, this slide's first: a variant whose kind the pool lacks shows no picture
  const kinds = [...new Set([value, ...title.choices].filter((v) => v !== 'none').map((v) => titlePictureKind(v, whole)))]
  return (
    <div className="space-y-4">
      {several && <p className="text-[12px] leading-snug text-ink-2">{t('editor.titlePerDay')}</p>}
      {!pictures && <p className="text-[12px] leading-snug text-ink-2">{t('editor.titleNoPicture')}</p>}
      {pictures && picture && canEdit && (
        <div className="space-y-1.5">
          <span className="block text-[13px] font-semibold text-brand-ink">{t('editor.generatedPicture')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <PictureField path={`picture.${slideKey}`} value={picture.value} onChange={picture.set} onFocus={() => undefined} scope={scope} known={picture.known} theme={theme} prefer={titlePictureKind(value, whole)} label={t('editor.pickPicture')} />
            {picture.value && (
              <Button size="sm" variant="ghost" onClick={() => picture.set('')}>
                {t('editor.pictureAuto')}
              </Button>
            )}
          </div>
        </div>
      )}
      {pictures && <KindHint theme={theme} wanted={kinds} about="title" />}
      {title.choices.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="mr-auto text-[13px] font-semibold text-brand-ink">{t('editor.titleVariantLabel')}</span>
            {chosen && canEdit && (
              <Button size="sm" variant="ghost" onClick={() => control.set(slideKey, '')}>
                {t('editor.titleAsTheme')}
              </Button>
            )}
          </div>
          <VariantTiles choices={title.choices} value={value} themeVariant={title.variant} html={(v) => control.preview(slideKey, v)} theme={theme} scope={scope} onPick={(v) => control.set(slideKey, v)} disabled={!canEdit} />
        </div>
      )}
    </div>
  )
}
