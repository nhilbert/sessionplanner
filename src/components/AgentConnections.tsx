import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type AgentConnection, api, ApiError } from '@/api'
import { Button, SectionLabel } from '@/components/ui'

/** Settings: AI agents connected over OAuth to /mcp (docs/mcp.md), each can be disconnected. */
export default function AgentConnections() {
  const { t, i18n } = useTranslation()
  // undefined = loading, null = OAuth is off on the server (the route answers not_found)
  const [list, setList] = useState<AgentConnection[] | null | undefined>(undefined)
  const [error, setError] = useState('')
  // Hosted, a new connection is started here first (docs/mcp.md): until when one may be approved, and where.
  const [armRequired, setArmRequired] = useState(false)
  const [armedUntil, setArmedUntil] = useState<string | null>(null)
  const [resource, setResource] = useState('')
  const load = () =>
    api
      .agentConnections()
      .then((r) => {
        setList(r.connections)
        setArmRequired(r.armRequired)
        setArmedUntil(r.armedUntil)
        setResource(r.resource)
        setError('')
      })
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 404) setList(null)
        else {
          setList((l) => l ?? [])
          setError(t('settings.agentsError', { error: e.message }))
        }
      })
  useEffect(() => {
    void load()
  }, [])
  // The start runs out after a few minutes; then the button shows its hint again and the list is fresh.
  useEffect(() => {
    if (!armedUntil) return
    const timer = window.setTimeout(() => void load(), Math.max(0, new Date(armedUntil).getTime() - Date.now()) + 1000)
    return () => window.clearTimeout(timer)
  }, [armedUntil])
  const arm = async () => {
    try {
      const r = await api.armAgent()
      setArmedUntil(r.armedUntil)
      setResource(r.resource)
      setError('')
    } catch (e) {
      setError(t('settings.agentsError', { error: (e as Error).message }))
    }
  }
  const fmt = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  const disconnect = async (c: AgentConnection) => {
    if (!window.confirm(t('settings.agentsDisconnectConfirm', { name: c.name }))) return
    try {
      await api.disconnectAgent(c.id)
      void load()
    } catch (e) {
      setError(t('settings.agentsError', { error: (e as Error).message }))
    }
  }
  if (list === undefined) return null
  return (
    <section className="card p-5">
      <SectionLabel>{t('settings.agents')}</SectionLabel>
      <p className="mb-3 text-[13px] text-ink-3">{list === null ? t('settings.agentsOff') : t('settings.agentsHint')}</p>
      {list !== null && armRequired && (
        <div className="mb-4">
          <Button size="sm" onClick={() => void arm()}>
            {t('settings.agentsConnect')}
          </Button>
          {armedUntil ? (
            <div className="mt-2 text-[13px] text-ink-2">
              {t('settings.agentsArmed', { time: new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }).format(new Date(armedUntil)) })}
              <code className="mt-1 block select-all break-all rounded bg-surface-2 px-2 py-1 text-[12px]">{resource}</code>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-ink-3">{t('settings.agentsConnectHint')}</p>
          )}
        </div>
      )}
      {error && <p className="mb-2 text-[13px] text-amber">{error}</p>}
      {list && list.length === 0 && !error && <p className="text-[13px] text-ink-3">{t('settings.agentsNone')}</p>}
      {list && list.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
              <div className="min-w-0">
                <div className="truncate text-ink">{c.name}</div>
                <div className="text-[12px] text-ink-3">
                  {t('settings.agentsSince', { date: fmt(c.createdAt), user: c.user })}
                  {c.lastUsedAt && <> · {t('settings.agentsLastUsed', { date: fmt(c.lastUsedAt) })}</>}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void disconnect(c)}>
                {t('settings.disconnect')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
