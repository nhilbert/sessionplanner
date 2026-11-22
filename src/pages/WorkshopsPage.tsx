import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Archive, ArchiveRestore, ChevronDown, ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react'
import { api, reportFailure } from '@/api'
import { TRASH_DAYS, type TrashedWorkshop, type WorkshopSummary } from '@/domain/types'
import { type ClientGroup, clientNames, type ClientsView, clientsView, monthsOf, NO_CLIENT, searchView, SINGLES, timeView, type YearSection } from '@/domain/workshopsView'
import { formatDate, formatDateRange } from '@/i18n'
import { Button, Chip, cx, Empty, isTyping, PageHeader, SearchField, Segmented, useLocalState, useMediaQuery } from '@/components/ui'
import { BulkBar, NoticeBar, SelectAll, shortDate, TrashSection, useNotice, useSelection } from '@/components/collection'
import type { MenuItem } from '@/components/Menu'
import { newId } from '@/domain/ops'
import { historyViews } from '@/store/listViews'
import { useSettings } from '@/store/useSettings'
import { DuplicateDialog, type DuplicateSource } from '@/planner/panels'
import { onlyKept } from '@/offline/client'
import { ClientAndPlace, fullSpan, lengthOf, NewWorkshop, PartHead, RowActions, type RowContext, RowList, titleOf, untilText, WorkshopRow, workshopPath } from '@/workshops/parts'

/** What the list showed, for the way back from a workshop (store/listViews.ts). */
interface ListView {
  query: string
  scroll: number
  /** The years unfolded; null: as the page opens them itself. */
  years: number[] | null
  archived: boolean
}

const listViews = historyViews<ListView>()

/**
 * The workshops. Time is the order one works in: what stands next, what is planned (nearest first), what has no date
 * yet, and what is over, year by year, the years folded but the latest. The client is a second way to look at the
 * same workshops ("By client"): the clients as a list and, beside it, everything done for one of them; a client's name
 * in any line leads there too (`?client=`, so the way back is the browser's). The search finds both: clients first,
 * then workshops of all years, the archived ones included. The order itself is domain/workshopsView.ts; the rules
 * of the look are in docs/ui.md ("The workshops").
 * A guest sees the workshops shared with them the same way, without the actions.
 */
export default function WorkshopsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const me = useSettings((s) => s.me)
  const [today] = useState(() => new Date().toLocaleDateString('sv'))
  // The list as it was left, for the way back from a workshop: a fresh visit starts fresh.
  const [start] = useState(() => listViews.get(location.key))
  const [list, setList] = useState<WorkshopSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState(start?.query ?? '')
  const [showArchived, setShowArchived] = useState(start?.archived ?? false)
  const [years, setYears] = useState<number[] | null>(start?.years ?? null)
  const [stored, setStored] = useLocalState('sp.workshops.view', 'time')
  const [order, setOrder] = useLocalState('sp.workshops.clients', 'active')
  const [selecting, setSelecting] = useState(false)
  const [creating, setCreating] = useState<{ client: string } | null>(null)
  const [duplicating, setDuplicating] = useState<DuplicateSource | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  /** Room for the clients and one client's workshops side by side; below it they are two steps. */
  const wide = useMediaQuery('(min-width: 1024px)')
  /** Lines too narrow for a second thing to press beside the title. */
  const narrow = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    // From the offline copy only what it holds: the others cannot be opened without the server (docs/offline.md).
    api.listWorkshops().then(onlyKept).then(setList, () => setFailed(true))
  }, [])
  // The trash is the owner's: deleted workshops wait there TRASH_DAYS days before they go for good.
  const [trash, setTrash] = useState<TrashedWorkshop[]>([])
  const { notice, show, close } = useNotice()
  /** The lists as the server has them now, after a change here (or one that failed half-way). */
  const reload = async () => {
    setList(await onlyKept(await api.listWorkshops()))
    if (me.owner) setTrash(await api.listTrash())
  }
  useEffect(() => {
    if (me.owner) api.listTrash().then(setTrash, () => undefined)
  }, [me.owner])

  // ---- the place on the page, per entry of the browser's history -----------------------------------------------
  const page = useRef<HTMLDivElement>(null)
  const scrolled = useRef(start?.scroll ?? 0)
  /** Where the page has to return to once it shows what it showed there. */
  const pending = useRef<{ scroll: number; query: string } | null>(start ? { scroll: start.scroll, query: start.query } : null)
  /** A step that stays in place (another client in the list beside): the page keeps its search and where it stands. */
  const staying = useRef(false)
  const latest = useRef({ query, years, archived: showArchived })
  latest.current = { query, years, archived: showArchived }
  const mounted = useRef(false)
  useLayoutEffect(() => {
    const key = location.key
    // A step to another view of the list (a client's history and back): each has its own search and place.
    if (mounted.current && !staying.current) {
      const view = listViews.get(key)
      setQuery(view?.query ?? '')
      pending.current = { scroll: view?.scroll ?? 0, query: view?.query ?? '' }
    }
    mounted.current = true
    staying.current = false
    return () => listViews.set(key, { ...latest.current, scroll: scrolled.current })
  }, [location.key])
  useLayoutEffect(() => {
    const to = pending.current
    if (!to || !list || !page.current || query !== to.query) return
    pending.current = null
    page.current.scrollTop = to.scroll
    scrolled.current = page.current.scrollTop
  })

  // ---- what is shown --------------------------------------------------------------------------------------------
  const all = useMemo(() => list ?? [], [list])
  const archivedCount = all.filter((w) => w.archived).length
  // The archived ones step out of the way; a search looks through them too (they carry their chip).
  const current = useMemo(() => (showArchived ? all : all.filter((w) => !w.archived)), [all, showArchived])
  const found = useMemo(() => searchView(all, today, query), [all, today, query])
  const time = useMemo(() => timeView(current, today), [current, today])
  const clients = useMemo(() => clientsView(current, today, order === 'name' ? 'name' : 'active'), [current, today, order])
  const known = useMemo(() => clientNames(all), [all])
  const asked = params.get('client')
  const mode: 'search' | 'clients' | 'time' = found ? 'search' : asked !== null || stored === 'clients' ? 'clients' : 'time'
  // The client shown: the one asked for; with room for both, the first of the list stands there from the start.
  const firstClient = clients.clients[0] ?? clients.singles ?? clients.none
  const chosen = mode !== 'clients' ? null : ((asked !== null && clients.byKey.get(asked)) || (wide ? firstClient : null) || null)
  const history = useMemo(() => (chosen ? timeView(chosen.workshops, today) : null), [chosen, today])
  const openYears = years ?? time.years.slice(0, 1).map((y) => y.year)

  // The lines one sees, in their order: what a selection can hold.
  const shown: WorkshopSummary[] =
    mode === 'search'
      ? found!.workshops
      : mode === 'clients'
        ? history
          ? [...(history.next ? [history.next] : []), ...history.planned, ...history.undated, ...history.years.flatMap((y) => y.workshops)]
          : []
        : [...(time.next ? [time.next] : []), ...time.planned, ...time.undated, ...time.years.filter((y) => openYears.includes(y.year)).flatMap((y) => y.workshops)]
  const selection = useSelection(shown.map((w) => w.id))
  const picked = shown.filter((w) => selection.has(w.id))
  const ticked = selection.ids.length
  const endSelecting = () => {
    selection.clear()
    setSelecting(false)
  }
  // Escape takes the ticks off first (useSelection); with none left it ends selecting.
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ticked && !isTyping(e.target) && !document.querySelector('[role="dialog"]')) setSelecting(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, ticked])

  // ---- what can be done -----------------------------------------------------------------------------------------
  /**
   * One call per workshop, then the lists again, whatever happened. A failure is reported and stops the rest; the
   * answer is the ids that were changed, so a note names only those and its undo reaches only those.
   */
  const each = async (ids: string[], run: (id: string) => Promise<unknown>): Promise<string[]> => {
    const done: string[] = []
    try {
      for (const id of ids) {
        await run(id)
        done.push(id)
      }
    } catch (err) {
      reportFailure(err)
    } finally {
      await reload().catch(() => undefined)
    }
    return done
  }
  const restore = (ids: string[]) => each(ids, api.restoreWorkshop)
  const purge = (ids: string[]) => each(ids, api.purgeWorkshop)
  // Archiving is a field of the workshop, changed like any other; open windows of it follow.
  const archive = async (rows: WorkshopSummary[], archived: boolean) => {
    const ids = rows.filter((w) => w.archived !== archived).map((w) => w.id)
    const set = (to: boolean, which: string[]) => each(which, (id) => api.sendOps(id, newId(), [{ op: 'set', entity: 'workshop', id, fields: { archived: to } }]))
    selection.clear()
    const done = await set(archived, ids)
    if (done.length) show({ text: t(archived ? 'workshops.archivedCount' : 'workshops.unarchivedCount', { count: done.length }), undo: () => void set(!archived, done) })
  }
  // Deleting ends the sharing, and a restore does not bring it back: so this asks first, trash or not.
  const toTrash = async (ids: string[]) => {
    if (!window.confirm(t('workshops.deleteManyConfirm', { count: ids.length, days: TRASH_DAYS }))) return
    selection.clear()
    const done = await each(ids, api.deleteWorkshop)
    if (done.length) show({ text: t('workshops.trashedCount', { count: done.length }), undo: () => void restore(done) })
  }
  const duplicate = (w: WorkshopSummary) => {
    setDuplicating({ id: w.id, title: w.title, firstDate: w.firstDate ?? '', days: w.days })
    setCopyOpen(true)
  }
  const actions = (w: WorkshopSummary): MenuItem[] =>
    me.owner
      ? [
          { label: t('workshop.duplicate'), icon: <Copy size={14} />, onSelect: () => duplicate(w) },
          w.archived ? { label: t('workshop.unarchive'), icon: <ArchiveRestore size={14} />, onSelect: () => void archive([w], false) } : { label: t('workshop.archive'), icon: <Archive size={14} />, onSelect: () => void archive([w], true) },
          { label: t('common.delete'), icon: <Trash2 size={14} />, danger: true, separated: true, onSelect: () => void toTrash([w.id]) },
        ]
      : []

  // ---- the ways through the list --------------------------------------------------------------------------------
  /** A client's history. From the list beside it the page stays where it is, and the step replaces the one before. */
  const openClient = (key: string, beside = false) => {
    staying.current = beside
    void navigate({ search: `?client=${encodeURIComponent(key)}` }, { replace: beside })
  }
  const setView = (view: string) => {
    setStored(view)
    setQuery('')
    selection.clear()
    if (asked !== null) void navigate({ search: '' })
  }
  const ctx: RowContext = { today, selection: me.owner && selecting ? selection : null, onClient: selecting || narrow ? null : (key) => openClient(key), actions, onDuplicate: duplicate }
  /** In a client's history the name is no way to go: one is there already. */
  const inHistory: RowContext = { ...ctx, onClient: null }
  const toggleYear = (year: number) => setYears(openYears.includes(year) ? openYears.filter((y) => y !== year) : [...openYears, year])
  const loaded = list !== null
  const empty = loaded && !all.length && !failed
  // On a narrow screen a client's history is a step of its own: the list of clients gives way to it.
  const clientStep = mode === 'clients' && !wide && !!chosen

  return (
    <div ref={page} onScroll={(e) => void (scrolled.current = e.currentTarget.scrollTop)} className="h-full overflow-y-auto">
      <div className={cx('mx-auto max-w-[1200px] px-4 py-8 md:px-10 md:py-10', ticked > 0 && 'pb-28')}>
        <PageHeader
          title={t('workshops.title')}
          subtitle={me.owner ? undefined : t('guest.shared')}
          right={
            me.owner && (
              <Button variant="primary" onClick={() => setCreating({ client: '' })}>
                <Plus size={16} />
                {t('workshops.new')}
              </Button>
            )
          }
        />
        {failed && <p className="text-rose">{t('common.error')}</p>}
        {empty &&
          (me.owner ? (
            <Empty title={t('workshops.empty')} body={t('workshops.emptyBody')}>
              <Button variant="primary" onClick={() => setCreating({ client: '' })}>
                <Plus size={16} />
                {t('workshops.new')}
              </Button>
            </Empty>
          ) : (
            <Empty title={t('guest.nothingShared')} body={t('guest.nothingSharedBody', { email: me.email ?? '' })} />
          ))}

        {all.length > 0 && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <SearchField value={query} onChange={setQuery} placeholder={t('workshops.search')} shortcut className="min-w-0 flex-[1_1_18rem]" />
              <div className="max-md:w-full">
                <Segmented
                  size="lg"
                  full={narrow}
                  label={t('workshops.viewLabel')}
                  value={mode === 'search' ? '' : mode}
                  onChange={setView}
                  options={[
                    { value: 'time', label: t('workshops.viewTime') },
                    { value: 'clients', label: t('workshops.viewClients') },
                  ]}
                />
              </div>
            </div>
            <div className="mb-4 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
              {me.owner && selecting ? <SelectAll selection={selection} count={shown.length} /> : <span className="text-[13px] text-ink-2 tnum">{mode === 'search' ? t('workshops.hits', { count: found!.workshops.length }) : t('workshops.count', { count: current.length })}</span>}
              <span className="ml-auto" />
              {me.owner && (
                <Button size="sm" variant={selecting ? 'default' : 'ghost'} onClick={() => (selecting ? endSelecting() : setSelecting(true))}>
                  {t(selecting ? 'list.selectDone' : 'list.selectMode')}
                </Button>
              )}
            </div>

            {mode === 'search' && (
              <div className="space-y-7">
                {found!.clients.length > 0 && !selecting && (
                  <section aria-labelledby="ws-hit-clients">
                    <PartHead id="ws-hit-clients">{t('workshops.clients')}</PartHead>
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                      {found!.clients.map((c) => (
                        <li key={c.key}>
                          <button type="button" onClick={() => openClient(c.key)} className="card flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2/60">
                            <span className="min-w-0 flex-1">
                              <span className="app-title block truncate text-[18px] leading-tight">{c.name}</span>
                              <span className="block truncate text-[13px] text-ink-2 tnum">{clientLine(c, t)}</span>
                            </span>
                            <ChevronRight size={16} className="shrink-0 text-brand-ink" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section aria-labelledby="ws-hit-workshops">
                  <PartHead id="ws-hit-workshops">{t('workshops.title')}</PartHead>
                  {found!.workshops.length ? (
                    <RowList>
                      {found!.workshops.map((w) => (
                        <WorkshopRow key={w.id} w={w} ctx={ctx} dates="full" />
                      ))}
                    </RowList>
                  ) : (
                    <p className="py-8 text-center text-[14px] text-ink-2">{t('workshops.noMatch', { q: query.trim() })}</p>
                  )}
                </section>
              </div>
            )}

            {mode === 'time' && (
              <div className="space-y-7">
                {time.next && !ctx.selection && (
                  <section aria-labelledby="ws-next">
                    <PartHead id="ws-next">{t('workshops.next')}</PartHead>
                    <NextCard w={time.next} ctx={ctx} />
                  </section>
                )}
                {(time.planned.length > 0 || (ctx.selection && time.next)) && (
                  <section aria-labelledby="ws-planned">
                    <PartHead id="ws-planned" hint={t('workshops.plannedHint')}>
                      {t('workshops.planned')}
                    </PartHead>
                    <RowList>
                      {/* While selecting, what stands next is a line like the others, so it can be ticked. */}
                      {ctx.selection && time.next && <WorkshopRow w={time.next} ctx={ctx} dates="full" until />}
                      {time.planned.map((w) => (
                        <WorkshopRow key={w.id} w={w} ctx={ctx} dates="full" until />
                      ))}
                    </RowList>
                  </section>
                )}
                {time.undated.length > 0 && (
                  <section aria-labelledby="ws-undated">
                    <PartHead id="ws-undated" hint={t('workshops.undatedHint')}>
                      {t('workshops.undated')}
                    </PartHead>
                    <RowList>
                      {time.undated.map((w) => (
                        <WorkshopRow key={w.id} w={w} ctx={ctx} dates="full" until />
                      ))}
                    </RowList>
                  </section>
                )}
                {time.years.length > 0 && (
                  <section aria-labelledby="ws-past">
                    <PartHead id="ws-past" hint={t('workshops.count', { count: time.past })}>
                      {t('workshops.past')}
                    </PartHead>
                    {time.years.map((y) => (
                      <Year key={y.year} section={y} open={openYears.includes(y.year)} onToggle={() => toggleYear(y.year)} ctx={ctx} />
                    ))}
                  </section>
                )}
              </div>
            )}

            {mode === 'clients' && (
              <div className="space-y-5">
                {time.next && !clientStep && !ctx.selection && (
                  <div className="card relative flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-surface-2/60">
                    <span className="text-[13px] font-semibold text-brand-ink">{t('workshops.next')}</span>
                    <Link to={workshopPath(time.next.id)} className="min-w-0 truncate font-semibold after:absolute after:inset-0">
                      {titleOf(time.next, t)}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 tnum">{[time.next.client.trim(), fullSpan(time.next, t)].filter(Boolean).join(' · ')}</span>
                    <Chip tone="accent" className="font-semibold">
                      {untilText(time.next, today, t)}
                    </Chip>
                    {time.planned.length > 0 && (
                      <button type="button" onClick={() => setView('time')} className="relative z-[1] rounded-full px-2 py-1 text-[13px] font-semibold text-brand-ink hover:bg-surface-2">
                        {t('workshops.morePlanned', { count: time.planned.length })}
                      </button>
                    )}
                  </div>
                )}
                {!firstClient && <p className="py-10 text-center text-[14px] text-ink-2">{t('workshops.noneYet')}</p>}
                {firstClient && (
                  <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-6">
                    {!clientStep && <ClientList view={clients} chosen={chosen} order={order === 'name' ? 'name' : 'active'} onOrder={setOrder} onOpen={(key) => openClient(key, wide)} />}
                    {chosen && history && (
                      <ClientHistory
                        group={chosen}
                        years={history.years}
                        planned={[...(history.next ? [history.next] : []), ...history.planned]}
                        undated={history.undated}
                        ctx={inHistory}
                        onNew={me.owner ? () => setCreating({ client: chosen.name }) : null}
                        onBack={clientStep ? () => void (location.key === 'default' ? navigate({ search: '' }, { replace: true }) : navigate(-1)) : null}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {mode !== 'search' && archivedCount > 0 && (
              <div className="mt-8 text-center">
                <Button variant="ghost" size="sm" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>
                  <Archive size={14} />
                  {showArchived ? t('workshops.hideArchived') : `${t('workshops.showArchived')} · ${archivedCount}`}
                </Button>
              </div>
            )}
          </>
        )}
        {me.owner && (
          <TrashSection
            rows={mode === 'search' ? [] : trash}
            hint={t('workshops.trashHint', { days: TRASH_DAYS })}
            meta={(w) => (
              <>
                {w.client && <span>{w.client}</span>}
                <span>{w.firstDate ? formatDateRange(w.firstDate, w.lastDate, { day: 'numeric', month: 'short', year: 'numeric' }) : t('workshops.noDate')}</span>
              </>
            )}
            onRestore={(w) => void restore([w.id])}
            onPurge={(rows) => void purge(rows.map((w) => w.id))}
            purgeConfirm={(rows) => (rows.length === 1 ? t('workshops.purgeConfirm', { title: rows[0].title || t('workshops.untitled') }) : t('workshops.purgeAllConfirm', { count: rows.length }))}
          />
        )}
        <BulkBar count={me.owner ? ticked : 0} onClear={selection.clear}>
          {picked.some((w) => !w.archived) && (
            <Button size="sm" onClick={() => void archive(picked, true)}>
              <Archive size={13} />
              {t('workshop.archive')}
            </Button>
          )}
          {picked.some((w) => w.archived) && (
            <Button size="sm" onClick={() => void archive(picked, false)}>
              <ArchiveRestore size={13} />
              {t('workshop.unarchive')}
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => void toTrash(selection.ids)}>
            <Trash2 size={13} />
            {t('common.delete')}
          </Button>
        </BulkBar>
        <NoticeBar notice={notice} onClose={close} raised={ticked > 0} />
        <NewWorkshop open={creating !== null} client={creating?.client} known={known} onClose={() => setCreating(null)} onCreated={(id) => navigate(workshopPath(id))} />
        {duplicating && <DuplicateDialog source={duplicating} open={copyOpen} onClose={() => setCopyOpen(false)} />}
      </div>
    </div>
  )
}

/** "21 Workshops · nächster 14.–15. Jan.": how much was done for a client, and when next or last. */
function clientLine(c: ClientGroup, t: TFunction): string {
  const when = c.next?.firstDate ? t('workshops.clientNext', { date: formatDateRange(c.next.firstDate, c.next.lastDate, { day: 'numeric', month: 'short' }) }) : c.last?.firstDate ? t('workshops.clientLast', { date: formatDate(c.last.firstDate, { month: 'short', year: 'numeric' }) }) : ''
  return [t('workshops.count', { count: c.workshops.length }), when].filter(Boolean).join(' · ')
}

/** What stands next, large: its days as a block, title, client and place, how much is planned, and how far away it is. */
function NextCard({ w, ctx }: { w: WorkshopSummary; ctx: RowContext }) {
  const { t } = useTranslation()
  const several = !!w.lastDate && w.lastDate !== w.firstDate
  const facts = [lengthOf(w, t), w.itemCount > 0 && t('workshops.items', { count: w.itemCount }), w.updatedAt && t('workshops.changed', { date: shortDate(w.updatedAt) })].filter(Boolean).join(' · ')
  return (
    <div className="card group relative flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-4 transition-colors hover:bg-surface-2/60 sm:flex-nowrap md:gap-x-6 md:px-6">
      {w.firstDate && (
        <div className="hidden min-w-[6.5rem] shrink-0 text-center text-brand-ink sm:block">
          <div className="text-[12px] font-semibold">{formatDateRange(w.firstDate, w.lastDate, { weekday: several ? 'short' : 'long' })}</div>
          <div className="app-title text-[27px] leading-[1.15] tnum">{formatDateRange(w.firstDate, w.lastDate, { day: '2-digit', month: '2-digit' })}</div>
          <div className="text-[12px] font-semibold tnum">{w.firstDate.slice(0, 4)}</div>
        </div>
      )}
      <div className="order-1 min-w-0 flex-1 text-[13px] font-bold text-brand-ink tnum sm:hidden">{fullSpan(w, t)}</div>
      <div className="order-4 min-w-0 max-sm:w-full sm:order-1 sm:flex-1">
        <Link to={workshopPath(w.id)} className="app-title block text-[21px] leading-tight after:absolute after:inset-0 md:text-[23px]">
          {titleOf(w, t)}
        </Link>
        {(w.client.trim() || w.location) && (
          <div className="mt-0.5 truncate text-ink-2">
            <ClientAndPlace w={w} onClient={ctx.onClient} />
          </div>
        )}
        <div className="mt-0.5 text-[13px] text-ink-2 tnum">{facts}</div>
      </div>
      <Chip tone="accent" className="order-2 h-7 shrink-0 px-3 text-[13px] font-bold">
        {untilText(w, ctx.today, t)}
      </Chip>
      <RowActions w={w} ctx={ctx} className="order-3 max-sm:-mr-2" />
    </div>
  )
}

/** A year that is over: its head says how much it held and, folded, for whom; unfolded, its workshops by month. */
function Year({ section, open, onToggle, ctx }: { section: YearSection; open: boolean; onToggle: () => void; ctx: RowContext }) {
  const { t } = useTranslation()
  const top = section.clients.slice(0, 3).map((c) => `${c.name} ${c.count}`)
  if (section.clients.length > 3) top.push(t('workshops.moreClients', { count: section.clients.length - 3 }))
  return (
    <section aria-label={String(section.year)}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="sticky top-0 z-[2] flex w-full items-baseline gap-3 rounded-xl bg-paper px-2 py-2.5 text-left transition-colors hover:bg-surface-2 pointer-coarse:py-3">
        <span className="shrink-0 self-center text-brand-ink">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
        <span className="app-title text-[20px] leading-none tnum">{section.year}</span>
        <span className="shrink-0 text-[13px] text-ink-2 tnum">{[t('workshops.count', { count: section.workshops.length }), t('workshops.days', { count: section.days })].join(' · ')}</span>
        {!open && <span className="min-w-0 flex-1 truncate text-right text-[13px] text-ink-2 max-md:hidden">{top.join(' · ')}</span>}
      </button>
      {open && (
        <RowList className="mb-3 mt-0.5">
          {monthsOf(section.workshops).map((m) => (
            <Fragment key={m.month}>
              <li className="border-b border-line bg-surface-2/40 px-3 pb-1 pt-2 text-[12px] font-semibold text-brand-ink md:px-4">
                {formatDate(`${m.month}-01`, { month: 'long' })}
              </li>
              {m.workshops.map((w) => (
                <WorkshopRow key={w.id} w={w} ctx={ctx} dates="short" />
              ))}
            </Fragment>
          ))}
        </RowList>
      )}
    </section>
  )
}

/** The clients as a list: those one works for again and again, then the single jobs together, then what has no client. */
function ClientList({ view, chosen, order, onOrder, onOpen }: { view: ClientsView; chosen: ClientGroup | null; order: 'active' | 'name'; onOrder: (order: string) => void; onOpen: (key: string) => void }) {
  const { t } = useTranslation()
  const named = view.clients.length + view.singleClients
  // A client with a single workshop, opened by name, stands among the single jobs.
  const marked = chosen && chosen.key !== SINGLES && chosen.key !== NO_CLIENT && chosen.workshops.length === 1 ? SINGLES : chosen?.key
  const entry = (g: ClientGroup, name: string, line: string) => {
    const on = g.key === marked
    return (
      <li key={g.key}>
        <button
          type="button"
          aria-current={on ? 'true' : undefined}
          onClick={() => onOpen(g.key)}
          className={cx('flex min-h-[54px] w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left transition-colors pointer-coarse:min-h-[60px]', on ? 'bg-accent-soft' : 'hover:bg-surface-2')}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{name}</span>
            <span className="block truncate text-[13px] text-ink-2 tnum">{line}</span>
          </span>
          <span role="img" aria-label={t('workshops.bars', { list: view.years.map((y, i) => `${y}: ${g.perYear[i]}`).join(', ') })} className="flex h-6 shrink-0 items-end gap-[3px]">
            {g.perYear.map((n, i) => (
              <span key={view.years[i]} className={cx('w-[5px] rounded-sm', n ? 'bg-brand-ink' : 'bg-line-2')} style={{ height: n ? 4 + Math.round((20 * Math.min(n, view.most)) / view.most) : 2 }} />
            ))}
          </span>
          <ChevronRight size={15} className="shrink-0 text-ink-3 lg:hidden" />
        </button>
      </li>
    )
  }
  return (
    <section aria-labelledby="ws-clients" className="min-w-0 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:overflow-y-auto lg:pr-1">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <h2 id="ws-clients" className="min-w-0 flex-1 text-[13px] font-semibold text-brand-ink">
          {t('workshops.clients')}
          <span className="font-normal text-ink-2 tnum"> · {named}</span>
        </h2>
        <Segmented
          size="sm"
          label={t('workshops.orderLabel')}
          value={order}
          onChange={onOrder}
          options={[
            { value: 'active', label: t('workshops.orderActive') },
            { value: 'name', label: t('workshops.orderName') },
          ]}
        />
      </div>
      <ul className="space-y-0.5">
        {view.clients.map((g) => entry(g, g.name, clientLine(g, t)))}
        {view.singles && entry(view.singles, t('workshops.singles'), t('workshops.singlesLine', { count: view.singleClients }))}
        {view.none && entry(view.none, t('workshops.noClient'), t('workshops.count', { count: view.none.workshops.length }))}
      </ul>
      <p className="px-3 pt-2 text-[12px] text-ink-2">{t('workshops.barsHint', { from: view.years[0], to: view.years[view.years.length - 1] })}</p>
    </section>
  )
}

/** Everything done for one client: what is planned, then year by year, each line with the copy at hand. */
function ClientHistory({ group, planned, undated, years, ctx, onNew, onBack }: { group: ClientGroup; planned: WorkshopSummary[]; undated: WorkshopSummary[]; years: YearSection[]; ctx: RowContext; onNew: (() => void) | null; onBack: (() => void) | null }) {
  const { t } = useTranslation()
  const head = useRef<HTMLDivElement>(null)
  // Another client chosen while this one's history was scrolled: its head comes into view. (In braces: scrolling
  // answers with a promise in newer browsers, and an effect must give back nothing but a way to clean up.)
  useEffect(() => {
    head.current?.scrollIntoView({ block: 'nearest' })
  }, [group.key])
  // The single jobs are of several clients, so their lines name them.
  const mixed = group.key === SINGLES
  const name = group.key === SINGLES ? t('workshops.singles') : group.key === NO_CLIENT ? t('workshops.noClient') : group.name
  const first = group.workshops.reduce<string | null>((min, w) => (w.firstDate && (!min || w.firstDate < min) ? w.firstDate : min), null)
  const days = group.workshops.reduce((sum, w) => sum + w.days, 0)
  const facts = [t('workshops.count', { count: group.workshops.length }), t('workshops.days', { count: days }), first && t('workshops.since', { date: formatDate(first, { month: 'long', year: 'numeric' }) })].filter(Boolean).join(' · ')
  const part = (key: string, title: string, count: string, rows: WorkshopSummary[], dates: 'short' | 'full') => (
    <Fragment key={key}>
      <li className="flex items-baseline gap-2.5 border-b border-line bg-surface-2/40 px-3 pb-1.5 pt-2.5 md:px-4">
        <span className="app-title text-[17px] leading-none tnum">{title}</span>
        <span className="text-[13px] text-ink-2 tnum">{count}</span>
      </li>
      {rows.map((w) => (
        <WorkshopRow key={w.id} w={w} ctx={ctx} dates={dates} column="full" client={mixed} quick />
      ))}
    </Fragment>
  )
  return (
    <section aria-label={name} className="min-w-0">
      {onBack && (
        <button type="button" onClick={onBack} className="tap -ml-1.5 mb-2 inline-flex h-9 items-center gap-1 rounded-full pl-1 pr-3 text-[14px] font-semibold text-brand-ink hover:bg-surface-2 pointer-coarse:h-11">
          <ChevronLeft size={17} />
          {t('workshops.back')}
        </button>
      )}
      <div ref={head} className="mb-3 flex flex-wrap items-start gap-x-4 gap-y-3 px-1">
        <div className="min-w-0 flex-[1_1_16rem]">
          <h2 className="app-title text-[24px] leading-tight">{name}</h2>
          <p className="mt-0.5 text-[14px] text-ink-2 tnum">{facts}</p>
        </div>
        {onNew && group.name && (
          <Button onClick={onNew}>
            <Plus size={15} />
            {t('workshops.newFor')}
          </Button>
        )}
      </div>
      <RowList>
        {planned.length > 0 && part('planned', t('workshops.planned'), String(planned.length), planned, 'full')}
        {undated.length > 0 && part('undated', t('workshops.undated'), String(undated.length), undated, 'full')}
        {years.map((y) => part(String(y.year), String(y.year), t('workshops.count', { count: y.workshops.length }), y.workshops, 'short'))}
      </RowList>
    </section>
  )
}
