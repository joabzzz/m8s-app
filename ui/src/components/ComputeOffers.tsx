import { useEffect, useState } from 'react'
import { ArrowLeft, Cloud, RefreshCw } from 'lucide-react'
import { Button } from './ui'
export interface Offer {
  machine_id: number
  qualified_for_profile: boolean
  id: number
  gpu_name: string
  gpu_count: number
  gpu_memory_mib: number
  host_memory_mib: number
  location: string
  compute_micro_usd_per_hour: number
  storage_micro_usd_per_hour: number
  transfer_micro_usd_per_gb: number
}
interface Quote {
  quote_id: string
  expires_at: number
  cap_micro_usd: number
  model: string
}
interface Catalog {
  observed_at: number
  disk_gb: number
  offers: Offer[]
}
const dollars = (micro: number) => `$${(micro / 1e6).toFixed(3)}`
// Conservative single-GPU weight+working-space estimates. Context and backend
// can change the required capacity; this is never a launch qualification.
export function modelClass(mib: number) {
  const gib = mib / 1024
  return gib >= 64
    ? '70B · 4-bit'
    : gib >= 32
      ? '27–32B · 4-bit'
      : gib >= 16
        ? '13–14B · 4-bit'
        : gib >= 8
          ? '7–8B · 4-bit'
          : 'Small models · up to 3B'
}
export default function ComputeOffers({
  meshId,
  nodeId,
  meshName,
  onBack,
}: {
  meshId: string
  nodeId: string
  meshName: string
  onBack: () => void
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [minimum, setMinimum] = useState(0)
  const [selected, setSelected] = useState<{ offer: Offer; meshId: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/app/compute/offers', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Could not load offers.')
        return body as Catalog
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setCatalog(value)
          setError('')
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Could not load offers.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [revision])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const stale = selected && selected.meshId !== `${meshId}:${nodeId}`
  async function post(path: string, body: unknown) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-m8s-desktop': '1' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
    const value = await response.json().catch(() => ({}))
    if (!response.ok)
      throw new Error(value.error ?? 'The quote or mesh changed. Request a fresh quote.')
    return value
  }
  async function getQuote() {
    if (!selected || stale) return
    setBusy(true)
    setBookingError('')
    setQuote(null)
    try {
      setQuote(
        await post('/app/rentals/quote', {
          offer_id: selected.offer.id,
          machine_id: selected.offer.machine_id,
          node_id: nodeId,
          mesh_id: meshId,
        }),
      )
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Quote unavailable.')
    } finally {
      setBusy(false)
    }
  }
  async function book() {
    if (!quote || stale) return
    setBusy(true)
    setBookingError('')
    try {
      await post('/app/rentals/launch', { quote_id: quote.quote_id })
      onBack()
    } catch (error) {
      setQuote(null)
      setBookingError(
        error instanceof Error
          ? error.message
          : 'Launch could not be confirmed. Check your rental before retrying.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="Add compute">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={14} className="mr-2 inline" />
        Fleet overview
      </Button>
      <div className="my-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Add compute</h1>
          <p className="mt-2 text-sm text-ink-muted">Rent hardware for {meshName}</p>
        </div>
        <Cloud className="text-accent" />
      </div>
      {selected ? (
        <section
          className="rounded-(--radius-card) border border-edge bg-panel p-6"
          aria-label="Review compute"
        >
          <h2 className="text-xl font-semibold">
            {selected.offer.gpu_count} × {selected.offer.gpu_name}
          </h2>
          <p className="mt-3 text-sm text-ink-muted">
            {selected.offer.location} · {modelClass(selected.offer.gpu_memory_mib)}
          </p>
          <dl className="my-6 space-y-3 text-sm">
            <div>Compute: {dollars(selected.offer.compute_micro_usd_per_hour)}/hour</div>
            <div>Storage reserve: {dollars(selected.offer.storage_micro_usd_per_hour)}/hour</div>
            <div>Transfer reserve: {dollars(selected.offer.transfer_micro_usd_per_gb)}/GB</div>
            <div>Target mesh: {meshName}</div>
          </dl>
          <p role="status" className="mb-5 text-sm text-warn">
            {stale
              ? 'The active mesh changed. Select an offer again to review the new target.'
              : !selected.offer.qualified_for_profile
                ? 'This hardware is listed for capacity comparison. It does not qualify for the current Qwen 27B runtime.'
                : 'The qualified runtime serves Qwen 3.8 27B. Check a fresh quote before renting; no charge occurs until you confirm.'}
          </p>
          {bookingError && (
            <p role="alert" className="mb-4 text-sm text-warn">
              {bookingError}
            </p>
          )}
          {quote && (
            <p className="mb-4 text-sm">
              {quote.model} · Maximum lease budget ${(quote.cap_micro_usd / 1e6).toFixed(2)}{' '}
              including reserves. Quote expires at{' '}
              {new Date(quote.expires_at * 1000).toLocaleTimeString()}.
            </p>
          )}
          <div className="flex gap-3">
            <Button
              variant="quiet"
              disabled={busy}
              onClick={() => {
                setSelected(null)
                setQuote(null)
                setBookingError('')
              }}
            >
              Back to offers
            </Button>
            {quote ? (
              <Button
                disabled={busy || !!stale || !selected.offer.qualified_for_profile}
                onClick={book}
              >
                {busy ? 'Starting…' : 'Confirm rental'}
              </Button>
            ) : (
              <Button
                disabled={busy || !!stale || !selected.offer.qualified_for_profile}
                onClick={getQuote}
              >
                {busy ? 'Checking offer…' : 'Check availability & budget'}
              </Button>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <span className="font-semibold">Vast.ai</span>
            <label className="ml-auto text-sm text-ink-muted">
              Memory per GPU{' '}
              <select
                aria-label="Minimum GPU memory"
                className="ml-2 rounded border border-edge bg-panel p-2"
                value={minimum}
                onChange={(event) => setMinimum(Number(event.target.value))}
              >
                <option value={0}>All sizes</option>
                <option value={8}>8+ GiB</option>
                <option value={16}>16+ GiB</option>
                <option value={32}>32+ GiB</option>
                <option value={48}>48+ GiB</option>
              </select>
            </label>
            <Button
              variant="quiet"
              disabled={loading}
              onClick={() => {
                setLoading(true)
                setRevision((value) => value + 1)
              }}
            >
              <RefreshCw size={14} className="mr-2 inline" />
              Refresh offers
            </Button>
          </div>
          <p className="mb-5 text-xs leading-relaxed text-ink-faint">
            Model classes estimate 4-bit inference on one GPU, with working-space headroom. Context
            length and runtime affect fit. Multi-GPU memory is not treated as a single pool. Prices
            are observations; launch requires a fresh quote and a bounded lease.
          </p>
          {loading ? (
            <p role="status">Finding available hardware…</p>
          ) : error ? (
            <p role="alert" className="rounded border border-edge p-5 text-sm text-warn">
              {error}
            </p>
          ) : (
            <>
              <p className="mb-4 text-xs text-ink-faint">
                Observed {catalog ? new Date(catalog.observed_at * 1000).toLocaleTimeString() : '—'}{' '}
                · {catalog?.disk_gb} GB disk · storage shown as an additional conservative reserve
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                {catalog?.offers
                  .filter((offer) => offer.gpu_memory_mib >= minimum * 1024)
                  .map((offer) => (
                    <article
                      key={offer.id}
                      className="rounded-(--radius-card) border border-edge bg-panel p-5"
                    >
                      <div className="flex justify-between gap-3">
                        <h2 className="font-semibold">
                          {offer.gpu_count} × {offer.gpu_name}
                        </h2>
                        <span className="text-accent">
                          {dollars(offer.compute_micro_usd_per_hour)}/h
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-ink-muted">
                        {(offer.gpu_memory_mib / 1024).toFixed(0)} GiB per GPU ·{' '}
                        {(offer.host_memory_mib / 1024).toFixed(0)} GiB RAM
                      </p>
                      <p className="mt-2 text-xs text-ink-faint">{offer.location}</p>
                      <p className="mt-4 text-xs text-accent">
                        {offer.qualified_for_profile
                          ? 'Qwen 27B hardware compatible · fresh quote required'
                          : 'Browse only · runtime not qualified'}
                      </p>
                      <p className="my-5 text-sm">
                        Estimated fit: {modelClass(offer.gpu_memory_mib)}
                      </p>
                      <Button
                        variant="quiet"
                        onClick={() => setSelected({ offer, meshId: `${meshId}:${nodeId}` })}
                      >
                        Review instance
                      </Button>
                    </article>
                  ))}
              </div>
              {!catalog?.offers.some((offer) => offer.gpu_memory_mib >= minimum * 1024) && (
                <p className="py-8 text-sm text-ink-muted">
                  No matching offers. Try a smaller memory filter or refresh.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
