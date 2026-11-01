import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Copy, Moon, Plus, Trash2, Upload, X } from 'lucide-react'
import { api } from '@/api'
import { SLIDE_LAYOUTS } from '@/domain/slideFormat'
import { contrastHex } from '@/domain/color'
import { contrastPairs, DERIVED_COLOR_KEYS, derivedColors, FONT_KEYS, type DerivedColorKey, type Theme, THEME_COLOR_KEYS, type ThemeColorKey, themeCss, type ThemeTokens } from '@/domain/theme'
import { themeLabel, useThemes } from '@/store/useThemes'
import { useSettings } from '@/store/useSettings'
import { Button, Chip, cx, Field, IconButton, Input, PageHeader, SectionLabel, Segmented, Select, useIsPhone } from '@/components/ui'
import { applyThemeCss, PREVIEW_THEME, reloadTheme, SlideView } from '@/slides/SlideView'
import { tr } from '@/slides/editor/fields'

const MAX_LOGO = 2 * 1024 * 1024
const SAMPLES = ['title', 'agenda', 'cards', 'exercise', 'section', 'closing']

/**
 * Slide themes (docs/slides.md, section 4): the owner's themes as data – a few colours, two fonts, some choices
 * and the logo – with the stylesheet generated from them. Everything is previewed on sample slides as it is
 * changed and saved a moment later; the contrast of the colour pairs that carry text is checked against WCAG.
 */
export default function ThemesPage() {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const { themes, load } = useThemes()
  const settings = useSettings((s) => s.settings)
  const [theme, setTheme] = useState<Theme | null>(null)
  const [error, setError] = useState('')
  const selected = params.get('id') || settings.theme || 'default'
  const info = themes.find((x) => x.id === selected)
  useEffect(() => {
    void load(true)
  }, [load])
  useEffect(() => {
    let live = true
    setTheme(null)
    if (info?.kind === 'data') api.getTheme(selected).then((x) => live && setTheme(x), () => live && setTheme(null))
    return () => {
      live = false
    }
  }, [selected, info?.kind])
  const select = (id: string) => setParams(id === 'default' ? {} : { id }, { replace: true })

  const create = async (from: string, name: string) => {
    setError('')
    try {
      const made = await api.createTheme({ name, from })
      await load(true)
      select(made.id)
    } catch {
      setError(t('themes.failed'))
    }
  }
  const remove = async () => {
    if (!theme || !window.confirm(t('themes.deleteConfirm', { name: theme.name }))) return
    await api.deleteTheme(theme.id)
    await load(true)
    select('default')
  }

  const list = (
    <ul className="space-y-1">
      {themes.map((x) => (
        <li key={x.id}>
          <button type="button" onClick={() => select(x.id)} className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[14px] transition-colors', x.id === selected ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')} aria-current={x.id === selected}>
            <span className="min-w-0 flex-1 truncate">{themeLabel(x, x.id, t)}</span>
            {x.kind === 'folder' && <Chip>{t('themes.folder')}</Chip>}
            {x.id === (settings.theme || 'default') && <span className="h-1.5 w-1.5 rounded-full bg-accent" title={t('slides.themeDefault')} />}
          </button>
        </li>
      ))}
    </ul>
  )
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => void create('default', t('themes.new'))}>
        <Plus size={13} />
        {t('themes.new')}
      </Button>
      <Button size="sm" onClick={() => void create('dark', t('themes.newDark'))}>
        <Moon size={13} />
        {t('themes.newDark')}
      </Button>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-10 md:py-10">
        <PageHeader title={t('themes.title')} subtitle={t('themes.subtitle')} right={!phone ? actions : undefined} />
        {error && <p className="mb-3 text-[13px] text-rose">{error}</p>}
        <div className="md:grid md:grid-cols-[240px_1fr] md:gap-8">
          <aside className="mb-5 md:mb-0">
            {phone ? (
              <div className="space-y-3">
                <Select value={selected} onChange={(e) => select(e.target.value)} aria-label={t('themes.pick')}>
                  {themes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {themeLabel(x, x.id, t)}
                    </option>
                  ))}
                </Select>
                {actions}
              </div>
            ) : (
              list
            )}
          </aside>
          <main className="min-w-0">
            {info?.kind === 'data' && theme && <ThemeEditor key={theme.id} theme={theme} onRemove={remove} onCopy={() => void create(theme.id, t('templates.copyName', { name: theme.name }))} />}
            {info && info.kind !== 'data' && (
              <div className="card p-5">
                <h2 className="text-[16px] font-medium">{themeLabel(info, info.id, t)}</h2>
                <p className="mt-1 text-[13px] text-ink-2">{info.kind === 'builtin' ? t('themes.builtinHint') : t('themes.folderHint')}</p>
                {info.kind === 'builtin' && (
                  <Button size="sm" className="mt-3" onClick={() => void create('default', t('themes.new'))}>
                    <Copy size={13} />
                    {t('themes.copy')}
                  </Button>
                )}
                <Samples theme={info.id} />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

function Samples({ theme }: { theme: string }) {
  const { t } = useTranslation()
  const samples = useMemo(() => SAMPLES.map((id) => SLIDE_LAYOUTS.find((l) => l.layout === id)!.example), [])
  return (
    <div className="mt-4">
      <SectionLabel>{t('themes.preview')}</SectionLabel>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {samples.map((html, i) => (
          <li key={i}>
            <SlideView html={html} theme={theme} scope="library" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The editor of one data theme: draft tokens, previewed at once, saved a moment after a change. */
function ThemeEditor({ theme, onRemove, onCopy }: { theme: Theme; onRemove: () => void; onCopy: () => void }) {
  const { t } = useTranslation()
  const load = useThemes((s) => s.load)
  const [name, setName] = useState(theme.name)
  const [tokens, setTokens] = useState<ThemeTokens>(theme.tokens)
  const [logos, setLogos] = useState<Pick<Theme, 'logo' | 'logoLight'>>({ logo: theme.logo, logoLight: theme.logoLight })
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [advanced, setAdvanced] = useState(Object.keys(theme.tokens.overrides).length > 0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const logoUrl = api.themeLogoUrl({ ...theme, ...logos }, 'logo')
  const logoLightUrl = api.themeLogoUrl({ ...theme, ...logos }, 'logoLight')

  // The draft is the preview theme's stylesheet while this editor is open.
  useEffect(() => {
    applyThemeCss(PREVIEW_THEME, themeCss(PREVIEW_THEME, tokens, { logoUrl, logoLightUrl }))
  }, [tokens, logoUrl, logoLightUrl])
  useEffect(() => () => applyThemeCss(PREVIEW_THEME, null), [])

  const save = (next: { name?: string; tokens?: ThemeTokens }) => {
    clearTimeout(timer.current)
    setState('saving')
    timer.current = setTimeout(async () => {
      try {
        await api.updateTheme(theme.id, next)
        reloadTheme(theme.id)
        if (next.name !== undefined) await load(true)
        setState('saved')
      } catch {
        setState('failed')
      }
    }, 500)
  }
  const update = (patch: Partial<ThemeTokens>) => {
    const next = { ...tokens, ...patch }
    setTokens(next)
    save({ tokens: next })
  }
  const setColor = (key: ThemeColorKey, value: string) => update({ colors: { ...tokens.colors, [key]: value } })
  const setOverride = (key: DerivedColorKey, value: string | null) => {
    const overrides = { ...tokens.overrides }
    if (value === null) delete overrides[key]
    else overrides[key] = value
    update({ overrides })
  }
  const derived = derivedColors(tokens)
  const pairs = contrastPairs(tokens)

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== theme.name && save({ name: name.trim() })} aria-label={t('themes.name')} className="h-9 max-w-xs text-[16px] font-medium" />
          <span className="text-[12px] text-ink-3">{state === 'saving' ? t('themes.saving') : state === 'saved' ? t('themes.saved') : state === 'failed' ? t('themes.failed') : ''}</span>
          <span className="flex-1" />
          <Button size="sm" onClick={onCopy}>
            <Copy size={13} />
            {t('themes.copy')}
          </Button>
          <Button size="sm" variant="danger" onClick={onRemove}>
            <Trash2 size={13} />
            {t('themes.delete')}
          </Button>
        </div>
        <Samples theme={PREVIEW_THEME} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <SectionLabel>{t('themes.colors')}</SectionLabel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {THEME_COLOR_KEYS.map((key) => (
              <ColorField key={key} label={tr(t, `themes.c.${key}`)} value={tokens.colors[key]} onChange={(v) => setColor(key, v)} />
            ))}
          </div>
          <button type="button" onClick={() => setAdvanced((a) => !a)} className="mt-4 text-[12px] text-ink-2 hover:text-ink" aria-expanded={advanced}>
            {advanced ? '▾' : '▸'} {t('themes.derived')}
          </button>
          {advanced && (
            <div className="mt-2">
              <p className="mb-2 text-[12px] leading-snug text-ink-3">{t('themes.derivedHint')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {DERIVED_COLOR_KEYS.map((key) => (
                  <ColorField key={key} label={tr(t, `themes.c.${key}`)} value={derived[key]} overridden={key in tokens.overrides} onChange={(v) => setOverride(key, v)} onReset={() => setOverride(key, null)} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card p-5">
          <SectionLabel>{t('themes.contrast')}</SectionLabel>
          <p className="mb-2 text-[12px] leading-snug text-ink-3">{t('themes.contrastHint')}</p>
          <ul className="divide-y divide-line text-[13px]">
            {pairs.map((p) => {
              const ratio = contrastHex(p.fg, p.bg) ?? 0
              const level = ratio >= 4.5 ? 'pass' : ratio >= 3 ? (p.large ? 'pass' : 'large') : 'fail'
              return (
                <li key={p.key} className="flex items-center gap-2 py-1.5">
                  <span className="flex h-6 w-10 shrink-0 items-center justify-center rounded text-[12px] font-semibold" style={{ background: p.bg, color: p.fg }}>
                    Aa
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{tr(t, `themes.pairs.${p.key}`)}</span>
                  <span className="tnum text-ink-3">{ratio.toFixed(1)}:1</span>
                  <Chip tone={level === 'pass' ? 'accent' : level === 'large' ? 'amber' : 'rose'}>{t(`themes.${level}`)}</Chip>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="card p-5">
          <SectionLabel>{t('themes.type')}</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('themes.display')}>
              <Select value={tokens.fonts.display} onChange={(e) => update({ fonts: { ...tokens.fonts, display: e.target.value as ThemeTokens['fonts']['display'] } })} className="h-8 text-[13px]">
                {FONT_KEYS.filter((f) => f !== 'mono').map((f) => (
                  <option key={f} value={f}>
                    {tr(t, `themes.fonts.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('themes.body')}>
              <Select value={tokens.fonts.body} onChange={(e) => update({ fonts: { ...tokens.fonts, body: e.target.value as ThemeTokens['fonts']['body'] } })} className="h-8 text-[13px]">
                {FONT_KEYS.filter((f) => f !== 'mono').map((f) => (
                  <option key={f} value={f}>
                    {tr(t, `themes.fonts.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t('themes.weight')} className="mt-3">
            <Segmented size="sm" value={String(tokens.displayWeight)} onChange={(v) => update({ displayWeight: Number(v) as ThemeTokens['displayWeight'] })} options={[{ value: '500', label: '500' }, { value: '600', label: '600' }, { value: '700', label: '700' }]} />
          </Field>
        </section>

        <section className="card p-5">
          <SectionLabel>{t('themes.shape')}</SectionLabel>
          <Field label={`${t('themes.radius')} · ${tokens.radius} px`}>
            <input type="range" min={0} max={32} step={2} value={tokens.radius} onChange={(e) => update({ radius: Number(e.target.value) })} className="w-full accent-[var(--accent)]" aria-label={t('themes.radius')} />
          </Field>
          <div className="mt-3 flex flex-col gap-2 text-[13px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={tokens.chrome} onChange={(e) => update({ chrome: e.target.checked })} />
              {t('themes.chrome')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={tokens.titleScrim} onChange={(e) => update({ titleScrim: e.target.checked })} />
              {t('themes.titleScrim')}
            </label>
          </div>
          <Field label={t('themes.logoPlacement')} className="mt-3">
            <Segmented
              size="sm"
              value={tokens.logo}
              onChange={(logo) => update({ logo })}
              options={[
                { value: 'none', label: t('themes.logoNone') },
                { value: 'title', label: t('themes.logoTitle') },
                { value: 'all', label: t('themes.logoAll') },
              ]}
            />
          </Field>
        </section>

        <section className="card p-5 lg:col-span-2">
          <SectionLabel>{t('themes.logo')}</SectionLabel>
          <p className="mb-3 text-[12px] leading-snug text-ink-3">{t('themes.logoHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <LogoSlot label={t('themes.logo')} url={logoUrl} dark={false} onFile={async (f) => setLogos(await api.uploadThemeLogo(theme.id, f, 'logo'))} onRemove={async () => setLogos(await api.deleteThemeLogo(theme.id, 'logo'))} afterChange={() => reloadTheme(theme.id)} />
            <LogoSlot label={t('themes.logoLight')} url={logoLightUrl} dark onFile={async (f) => setLogos(await api.uploadThemeLogo(theme.id, f, 'logoLight'))} onRemove={async () => setLogos(await api.deleteThemeLogo(theme.id, 'logoLight'))} afterChange={() => reloadTheme(theme.id)} background={tokens.colors.field} />
          </div>
        </section>
      </div>
    </div>
  )
}

/** A colour: its swatch opens the browser's picker, the hex beside it can be typed. */
function ColorField({ label, value, onChange, overridden, onReset }: { label: string; value: string; onChange: (hex: string) => void; overridden?: boolean; onReset?: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)
  const [base, setBase] = useState(value)
  if (base !== value) {
    setBase(value)
    setText(value)
  }
  const commit = () => {
    const v = text.trim().toUpperCase()
    const hex = /^#?[0-9A-F]{6}$/.test(v) ? (v.startsWith('#') ? v : `#${v}`) : null
    if (hex && hex !== value) onChange(hex)
    else setText(value)
  }
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 w-8 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0" aria-label={label} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-ink-2">
          {label}
          {onReset && overridden && (
            <button type="button" onClick={onReset} className="ml-1.5 text-[11px] text-ink-3 hover:text-ink">
              {t('themes.reset')}
            </button>
          )}
        </span>
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className={cx('field tnum h-7 w-full px-1.5 font-mono text-[12px] uppercase', !overridden && onReset && 'text-ink-3')} aria-label={`${label} hex`} spellCheck={false} />
      </span>
    </label>
  )
}

function LogoSlot({ label, url, dark, background, onFile, onRemove, afterChange }: { label: string; url: string | null; dark: boolean; background?: string; onFile: (f: File) => Promise<void>; onRemove: () => Promise<void>; afterChange: () => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-ink-2">{label}</div>
      <div className={cx('flex h-24 items-center justify-center rounded-lg border border-line p-3', dark ? 'bg-[#1F2428]' : 'bg-white')} style={background && dark ? { background } : undefined}>
        {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : <span className={cx('text-[12px]', dark ? 'text-white/50' : 'text-ink-3')}>–</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => input.current?.click()}>
          <Upload size={13} />
          {t('themes.upload')}
        </Button>
        {url && (
          <IconButton
            label={t('themes.removeLogo')}
            onClick={async () => {
              await onRemove()
              afterChange()
            }}
          >
            <X size={14} />
          </IconButton>
        )}
      </div>
      {error && <p className="mt-1 text-[12px] text-rose">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setError('')
          if (file.size > MAX_LOGO) return setError(t('themes.logoTooLarge'))
          try {
            await onFile(file)
            afterChange()
          } catch {
            setError(t('themes.logoFailed'))
          }
        }}
      />
    </div>
  )
}
