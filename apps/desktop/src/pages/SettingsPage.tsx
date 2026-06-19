import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { useConnection } from '../features/connection/useConnection'

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Could not save connection settings.'
  return message
    .replace(/^Error invoking remote method '[^']+': Error:\s*/i, '')
    .replace(/^Error:\s*/i, '')
}

export function SettingsPage() {
  const { status, save, test } = useConnection()
  const [apiUrl, setApiUrl] = useState(status.apiUrl)
  const [tenantId, setTenantId] = useState(status.tenantId)
  const [apiToken, setApiToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setApiUrl(status.apiUrl)
    setTenantId(status.tenantId)
  }, [status.apiUrl, status.tenantId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await save({ apiUrl, tenantId, apiToken: apiToken || undefined })
      setApiToken('')
    } catch (error) {
      setFormError(cleanError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="px-5 py-8 md:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
          Workspace
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">API connection</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
          Connect this recorder to the company-hosted WorkTrace API. The access token is
          encrypted by the operating system and is never exposed back to React.
        </p>

        <form
          onSubmit={(event) => void submit(event)}
          className="mt-8 overflow-hidden rounded-xl border border-white/15 bg-[#0c0c0c]"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-sm font-bold">Tenant environment</p>
              <p className="mt-1 text-xs text-white/45">Raw workflow data remains here.</p>
            </div>
            <ConnectionBadge state={status.state} />
          </div>

          <div className="grid gap-6 p-6">
            <Field label="API URL" hint="Use HTTPS outside localhost.">
              <input
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                placeholder="http://127.0.0.1:8000"
                className="w-full rounded-lg border border-white/15 bg-black px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/40"
              />
            </Field>

            <Field label="Tenant ID" hint="The UUID assigned to this company workspace.">
              <input
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                placeholder="00000000-0000-0000-0000-000000000001"
                className="w-full rounded-lg border border-white/15 bg-black px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/40"
              />
            </Field>

            <Field
              label="API token"
              hint={
                status.hasApiToken
                  ? 'A token is saved. Leave blank to keep it.'
                  : 'Required for tenant-scoped API requests.'
              }
            >
              <input
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder={status.hasApiToken ? '••••••••••••••••' : 'Enter API token'}
                className="w-full rounded-lg border border-white/15 bg-black px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/40"
              />
            </Field>
          </div>

          {(formError || status.error) && (
            <p className="mx-6 mb-5 rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-xs leading-5 text-red-300">
              {formError || status.error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 px-6 py-5">
            <button
              type="button"
              disabled={status.state === 'checking'}
              onClick={() => void test()}
              className="rounded-lg border border-white/15 px-5 py-2.5 text-xs font-bold transition hover:bg-white/8 disabled:opacity-50"
            >
              Test connection
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-white px-5 py-2.5 text-xs font-extrabold text-black transition hover:bg-white/85 disabled:opacity-50"
            >
              {saving ? 'Connecting...' : 'Save and connect'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint: string
  children: ReactNode
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-bold">{label}</span>
      {children}
      <span className="text-[11px] text-white/40">{hint}</span>
    </label>
  )
}

function ConnectionBadge({ state }: { state: string }) {
  const labels: Record<string, string> = {
    connected: 'Connected',
    checking: 'Checking',
    error: 'Connection failed',
    'not-configured': 'Not connected'
  }
  const color =
    state === 'connected'
      ? 'bg-emerald-400'
      : state === 'checking'
        ? 'animate-pulse bg-amber-400'
        : state === 'error'
          ? 'bg-red-500'
          : 'bg-white/30'

  return (
    <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
      <span className={`size-1.5 rounded-full ${color}`} />
      {labels[state] || state}
    </span>
  )
}
