import { useEffect, useState } from 'react'
import { Button } from './ui'
import { openProviderPage } from './Providers'
interface Rental {
  node_id?: string
  instance_id?: number
  offer_id: number
  target: { mesh_id: string; node_id: string }
  expires_at: number
  stage: string
  worker_status?: {
    phase: string
    cache_file_bytes?: number
    network_received_bytes?: number
    requested_model_count?: number
    hosted_model_count?: number
    runtime_error_count?: number
    node_loading?: boolean
    runtime_snapshot_truncated?: boolean
    worker_running?: boolean
  } | null
}
function workerPhase(phase: string) {
  return (
    {
      awaiting_join: 'Waiting for provisioning',
      unknown: 'Worker status unknown',
      starting: 'Worker starting',
      waiting_for_mesh: 'Waiting for mesh attachment',
      joined: 'Worker reports mesh attachment',
      stopped: 'Worker stopped',
    }[phase] ?? 'Worker status unknown'
  )
}
function count(value: number | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 256
    ? value
    : undefined
}
function observedGb(bytes: number | undefined) {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0
    ? `${(bytes / 1_000_000_000).toFixed(1)} GB`
    : 'Unavailable'
}
export default function RentalInventory({
  onInspect,
  nodeIds,
  onOwnedNode,
}: {
  onInspect: (id: string) => void
  nodeIds: string[]
  onOwnedNode: (id: string | null) => void
}) {
  const [rental, setRental] = useState<Rental | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const poll = async () => {
      try {
        const response = await fetch('/app/rentals', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
        })
        if (!response.ok) throw new Error()
        const value = await response.json()
        if (value.error) throw new Error()
        if (!controller.signal.aborted) {
          setRental(value.rental)
          onOwnedNode(value.rental?.node_id ?? null)
          setError('')
        }
      } catch {
        if (!controller.signal.aborted)
          setError('Rental status unavailable. Removal has not been confirmed.')
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 5000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [onOwnedNode])
  async function remove() {
    setBusy(true)
    try {
      const response = await fetch('/app/rentals/remove', {
        method: 'POST',
        headers: { 'x-m8s-desktop': '1' },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) throw new Error()
      setRental((value) => (value ? { ...value, stage: 'removal_requested' } : value))
      setConfirm(false)
    } catch {
      setError(
        'Removal could not be confirmed. The independent cleanup deadline remains in effect.',
      )
    } finally {
      setBusy(false)
    }
  }
  if (!rental && !error) return null
  return (
    <section
      className="mb-8 rounded-(--radius-card) border border-edge bg-panel p-5"
      aria-label="Owned rentals"
      id="owned-rentals"
    >
      <h2 className="font-semibold">Your rented compute</h2>
      {error && (
        <p role="alert" className="mt-3 text-sm text-warn">
          {error}
        </p>
      )}
      {rental && (
        <>
          <p className="mt-3 text-sm">
            Vast{' '}
            {rental.instance_id ? `instance ${rental.instance_id}` : `offer ${rental.offer_id}`} ·{' '}
            {rental.stage === 'removed'
              ? 'Removal confirmed'
              : rental.stage === 'token_inference_verified'
                ? 'Token-only mesh inference verified · not owner-certified'
                : rental.stage === 'token_provisioning'
                  ? 'Stock Mesh provisioning · token-only admission'
                  : rental.stage === 'removal_requested'
                    ? 'Removal requested — awaiting confirmation'
                    : rental.stage === 'cleanup_unconfirmed'
                      ? 'Attempt ended — cleanup confirmation pending'
                      : rental.stage === 'mesh_canary_completed'
                        ? 'Mesh inference verified'
                        : rental.stage === 'verifying_inference'
                          ? 'Checking mesh inference'
                          : rental.stage === 'model_download_error'
                            ? 'Host reported a model download error'
                            : rental.stage === 'preparing_model'
                              ? 'Host authenticated · preparing model'
                              : rental.stage === 'provisioning_host'
                                ? 'Configuring host'
                                : 'Provisioning or running'}
          </p>
          {rental.stage === 'token_provisioning' && rental.worker_status && (
            <div className="mt-3 text-xs text-ink-muted" aria-label="Worker startup observation">
              <p>{workerPhase(rental.worker_status.phase)} · inference not yet verified</p>
              <p className="mt-1">
                Model cache size: {observedGb(rental.worker_status.cache_file_bytes)} · Network
                received: {observedGb(rental.worker_status.network_received_bytes)}
              </p>
              {count(rental.worker_status.requested_model_count) !== undefined && (
                <p className="mt-1">
                  Models requested: {count(rental.worker_status.requested_model_count)} · Hosted:{' '}
                  {count(rental.worker_status.hosted_model_count) ?? 'Unknown'}
                  {rental.worker_status.node_loading === true ? ' · Loading' : ''}
                  {rental.worker_status.runtime_snapshot_truncated === true
                    ? ' · Partial snapshot'
                    : ''}
                </p>
              )}
              {(count(rental.worker_status.runtime_error_count) ?? 0) > 0 && (
                <p className="mt-1 text-warn" role="status">
                  Worker reports {count(rental.worker_status.runtime_error_count)} runtime error(s).
                  Inference is still unverified; Remove compute remains available.
                </p>
              )}
              <p className="mt-1 text-ink-faint">
                Worker-reported observations, not download completion.
              </p>
            </div>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Mesh {rental.target.mesh_id} · bounded deadline{' '}
            {new Date(rental.expires_at * 1000).toLocaleTimeString()}
          </p>
          <p className="mt-2 text-xs text-ink-faint">
            Once discovered, select the node in Mesh hardware to inspect its models and advertised
            capacity.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="quiet"
              onClick={() =>
                void openProviderPage('vast_console').catch(() =>
                  setError('Could not open the Vast console. Try again.'),
                )
              }
            >
              Open Vast console
            </Button>
            {rental.instance_id && (
              <Button
                variant="quiet"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(String(rental.instance_id))
                    .then(() => setCopied(true))
                    .catch(() => setError('Could not copy the instance ID.'))
                }
              >
                {copied ? 'Instance ID copied' : 'Copy instance ID'}
              </Button>
            )}
            <Button variant="quiet" onClick={() => setDetails(!details)}>
              {details ? 'Hide connection details' : 'Connection details'}
            </Button>
          </div>
          {details && (
            <div className="mt-4 rounded-(--radius-control) border border-edge bg-inset p-4 text-sm">
              <h3 className="font-semibold">Managed rental access</h3>
              <p className="mt-2 text-ink-muted">
                Use the Vast console for container logs and network details. This runtime’s SSH
                login only accepts provisioning and read-only status commands, so it cannot open an
                interactive terminal.
              </p>
              <p className="mt-2 text-ink-muted">
                Pause/resume is unavailable for this short-lived rental. Stopping the container
                breaks its mesh session and triggers cleanup. Use Remove compute to release it;
                stopped instances can still incur storage charges.
              </p>
            </div>
          )}
          {rental.node_id && nodeIds.includes(rental.node_id) && (
            <Button
              variant="quiet"
              className="mt-5 mr-3"
              onClick={() => onInspect(rental.node_id!)}
            >
              Inspect node
            </Button>
          )}
          {rental.stage !== 'removed' &&
            rental.stage !== 'removal_requested' &&
            (confirm ? (
              <div className="mt-5">
                <p className="mb-3 text-sm">
                  Remove this rented host? Inference on it will stop. This keeps other mesh peers
                  connected.
                </p>
                <div className="flex gap-3">
                  <Button variant="quiet" disabled={busy} onClick={() => setConfirm(false)}>
                    Keep compute
                  </Button>
                  <Button disabled={busy} onClick={remove}>
                    {busy ? 'Requesting removal…' : 'Confirm removal'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="mt-5" variant="quiet" onClick={() => setConfirm(true)}>
                Remove compute
              </Button>
            ))}
        </>
      )}
    </section>
  )
}
