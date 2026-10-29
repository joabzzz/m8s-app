import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Cloud, ExternalLink, KeyRound, LoaderCircle } from 'lucide-react'
import { Button } from './ui'
interface Connection {
  configured: boolean
  account_id?: number
  verified_at?: number
  source?: string
}
export async function openProviderPage(target: 'vast_keys' | 'vast_console') {
  const response = await fetch('/app/providers/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-m8s-desktop': '1' },
    body: JSON.stringify({ target }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Could not open your browser. Please try again.')
}
export default function Providers({
  forceOpen = false,
  onConfigured,
  onDismiss,
}: {
  forceOpen?: boolean
  onConfigured?: (configured: boolean) => void
  onDismiss?: () => void
}) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [controller, setController] = useState(true)
  const [editing, setEditing] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const load = useCallback(async () => {
    try {
      const response = await fetch('/app/providers', { signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error('Could not read provider settings.')
      const value = await response.json()
      if (!value.vast || typeof value.vast.configured !== 'boolean')
        throw new Error('Could not read provider settings.')
      setConnection(value.vast)
      setController(value.controller_ready !== false)
      onConfigured?.(value.vast.configured)
      setError('')
    } catch {
      setError('Could not load providers. Retry to check the connection.')
    }
  }, [onConfigured])
  useEffect(() => {
    let active = true
    void fetch('/app/providers', { signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        if (!response.ok) throw new Error()
        const value = await response.json()
        if (!value.vast || typeof value.vast.configured !== 'boolean') throw new Error()
        if (active) {
          setConnection(value.vast)
          setController(value.controller_ready !== false)
          onConfigured?.(value.vast.configured)
        }
      })
      .catch(() => {
        if (active) setError('Could not load providers. Retry to check the connection.')
      })
    return () => {
      active = false
    }
  }, [onConfigured])
  async function action(kind: 'save' | 'verify' | 'disconnect') {
    setBusy(true)
    setError('')
    setNotice('')
    const entered = key
    setKey('')
    try {
      const response = await fetch(
        kind === 'save' ? '/app/providers/vast' : `/app/providers/vast/${kind}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-m8s-desktop': '1' },
          body: kind === 'save' ? JSON.stringify({ api_key: entered }) : undefined,
          signal: AbortSignal.timeout(20000),
        },
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not update Vast. Try again.')
      if (kind === 'verify') {
        setConnection((value) => ({ ...value, ...result }))
        setNotice('Connection verified. Your key was accepted by Vast.')
      } else {
        await load()
        setEditing(false)
        onDismiss?.()
        setConfirmDisconnect(false)
        setNotice(
          kind === 'save'
            ? `Connected to Vast account ${result.account_id}. You can now browse compute.`
            : 'Vast disconnected from this app.',
        )
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update Vast.')
    } finally {
      setBusy(false)
    }
  }
  async function openKeys() {
    try {
      await openProviderPage('vast_keys')
    } catch (error) {
      setError(String(error))
    }
  }
  const showForm = editing || (forceOpen && !connection?.configured)
  return (
    <section id="compute-providers" aria-label="Compute providers" className="mb-5 max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Providers</h2>
        {!connection && (
          <Button variant="quiet" onClick={() => void load()}>
            Retry connection check
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-warn">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-sm text-good">
          {notice}
        </p>
      )}
      <div className="divide-y divide-edge rounded-(--radius-control) border border-edge">
        <div className="bg-panel p-4">
          <div className="flex items-center gap-3">
            <div className="rounded bg-[#111] px-3 py-2">
              <img src="/providers/vast.svg" alt="Vast.ai" className="h-5 w-auto" />
            </div>
            <span className="ml-auto flex items-center gap-1 text-xs text-ink-muted">
              {connection?.configured ? (
                <>
                  <CheckCircle2 size={14} className="text-good" /> Connected
                </>
              ) : connection ? (
                'Not connected'
              ) : (
                'Checking…'
              )}
            </span>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            {connection?.account_id
              ? `Account ${connection.account_id}`
              : connection?.configured
                ? 'A provider key was detected on this device.'
                : 'Connect your account to find and rent GPU hardware.'}
          </p>
          {connection?.configured ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="quiet" disabled={busy} onClick={() => void action('verify')}>
                Verify connection
              </Button>
              <Button variant="quiet" disabled={busy} onClick={() => setEditing(!editing)}>
                Replace key
              </Button>
              <Button variant="quiet" disabled={busy} onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              className="mt-4"
              disabled={busy || !connection}
              onClick={() => setEditing(true)}
            >
              <KeyRound size={14} className="mr-2 inline" /> Connect Vast
            </Button>
          )}
        </div>
        <div className="bg-panel p-4">
          <div className="flex items-center gap-3">
            <Cloud size={24} />
            <h3 className="font-semibold">Nebius</h3>
            <span className="ml-auto rounded-full border border-edge px-2 py-1 text-xs text-ink-faint">
              Coming soon
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Provider setup and GPU rentals are planned. No credentials needed yet.
          </p>
        </div>
      </div>
      {showForm && (
        <form
          className="mt-5 border-t border-edge pt-5"
          onSubmit={(event) => {
            event.preventDefault()
            void action('save')
          }}
        >
          <h3 className="font-semibold">Connect your Vast account</h3>
          <p className="mt-2 text-sm text-ink-muted">
            Create a Vast API key with access to your account and instance management, then paste it
            here. Adding a key does not rent or charge anything.
          </p>
          <Button type="button" variant="quiet" className="my-4" onClick={() => void openKeys()}>
            Get a Vast API key <ExternalLink size={14} className="ml-2 inline" />
          </Button>
          <label className="block text-sm" htmlFor="vast-api-key">
            Vast API key
          </label>
          <input
            id="vast-api-key"
            name="vast-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            disabled={busy}
            maxLength={512}
            placeholder="Paste your API key"
            className="my-2 w-full rounded-(--radius-control) border border-edge bg-bg px-3 py-3 text-sm"
          />
          <p className="mb-4 text-xs text-ink-faint">
            Stored in a private file on this device. Never shown again or saved in browser storage.
            Managed rentals require a separate budget confirmation.
          </p>
          <div className="flex gap-3">
            <Button type="submit" disabled={busy || !key.trim()}>
              {busy ? (
                <>
                  <LoaderCircle size={14} className="mr-2 inline animate-spin" /> Verifying…
                </>
              ) : (
                'Verify & connect'
              )}
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                onDismiss?.()
                setKey('')
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {confirmDisconnect && (
        <div className="mt-4 border-t border-edge pt-4">
          <p className="text-sm">
            Disconnect Vast from this app? This does not delete provider resources. Active managed
            rentals must finish cleanup first.
          </p>
          <div className="mt-3 flex gap-3">
            <Button variant="quiet" disabled={busy} onClick={() => setConfirmDisconnect(false)}>
              Keep connected
            </Button>
            <Button disabled={busy} onClick={() => void action('disconnect')}>
              Confirm disconnect
            </Button>
          </div>
        </div>
      )}
      {!controller && (
        <p className="mt-4 text-xs text-warn">
          Your provider can be connected, but this build needs the m8s controller installed before
          it can rent hardware.
        </p>
      )}
    </section>
  )
}
