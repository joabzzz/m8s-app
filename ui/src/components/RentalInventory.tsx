import { useEffect, useState } from 'react'
import { Button } from './ui'
interface Rental {
  node_id?: string
  instance_id?: number
  offer_id: number
  target: { mesh_id: string; node_id: string }
  expires_at: number
  stage: string
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
  useEffect(() => {
    const controller = new AbortController()
    const poll = async () => {
      try {
        const response = await fetch('/app/rentals', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
        })
        if (!response.ok) throw new Error()
        const value = await response.json()
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
          <p className="mt-2 text-xs text-ink-muted">
            Mesh {rental.target.mesh_id} · bounded deadline{' '}
            {new Date(rental.expires_at * 1000).toLocaleTimeString()}
          </p>
          <p className="mt-2 text-xs text-ink-faint">
            Once discovered, select the node in Mesh hardware to inspect its models and advertised
            capacity.
          </p>
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
