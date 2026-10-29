import { useState } from 'react'
import { Activity, ArrowUpRight, Cloud, Cpu, Network, Server } from 'lucide-react'
import { useApp } from '../lib/store'
import { Button } from '../components/ui'

type Section = 'Fleet' | 'Providers' | 'Inference'

export default function Compute({ onMesh, onChat }: { onMesh: () => void; onChat: () => void }) {
  const [section, setSection] = useState<Section>('Fleet')
  const { phase, status } = useApp()
  const connected = phase.phase === 'running' && status !== null
  const peers = status?.peers ?? []
  const role =
    phase.phase === 'running'
      ? phase.serving
        ? 'Inference host'
        : 'Passive client'
      : 'No active node'
  const models = [...new Set(peers.flatMap((p) => p.serving_models ?? p.models ?? []))]
  const speed = status?.tok_per_sec
  return (
    <div className="flex h-screen bg-bg text-ink" data-testid="compute-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-panel p-5">
        <div className="mb-10 flex items-center gap-3">
          <Cpu className="text-accent" size={24} />
          <span className="font-display text-xl font-bold">
            m8s<span className="text-ink-faint"> / compute</span>
          </span>
        </div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          Workspace
        </p>
        {(['Fleet', 'Providers', 'Inference'] as const).map((item) => {
          const Icon = item === 'Fleet' ? Server : item === 'Providers' ? Cloud : Activity
          return (
            <button
              key={item}
              onClick={() => setSection(item)}
              aria-current={section === item ? 'page' : undefined}
              className={`mb-1 flex items-center gap-3 rounded-(--radius-control) px-3 py-3 text-sm ${section === item ? 'bg-inset text-accent' : 'text-ink-muted hover:text-ink'}`}
            >
              <Icon size={16} />
              {item}
            </button>
          )
        })}
        <button
          onClick={onMesh}
          className="mt-auto flex items-center gap-3 rounded-(--radius-control) border border-edge p-3 text-left text-sm"
        >
          <Network size={16} />
          <span>
            {connected ? 'Manage mesh' : 'Connect a mesh'}
            <span className="block text-xs text-ink-faint">
              {connected ? 'Connection active' : 'Choose or create a network'}
            </span>
          </span>
        </button>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto p-8">
        <header className="mb-9 flex items-center justify-between">
          <div>
            <p className="mb-2 text-xs text-ink-faint">Your infrastructure, together.</p>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {section === 'Fleet' ? 'Compute overview' : section}
            </h1>
          </div>
          <Button variant="quiet" onClick={onMesh}>
            {connected ? 'Manage mesh' : 'Connect mesh'}{' '}
            <ArrowUpRight size={14} className="ml-2 inline" />
          </Button>
        </header>
        <section
          className="mb-6 flex flex-wrap items-center gap-5 rounded-(--radius-card) border border-edge bg-panel px-5 py-4"
          aria-label="Local node identity"
        >
          <Network size={18} className="text-accent" />
          <div>
            <p className="text-sm font-semibold">{role}</p>
            <p className="mt-1 max-w-md truncate font-mono text-xs text-ink-faint">
              {status?.node_id ?? 'Node identity unavailable'}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-ink-muted">Rental authorization</p>
            <p className="mt-1 text-xs text-warn">Owner attachment required</p>
          </div>
        </section>
        <div className="mb-9 grid grid-cols-3 gap-4">
          {[
            [
              'Connected peers',
              connected ? String(peers.length) : '—',
              'Discovered in the active mesh',
            ],
            ['Serving models', connected ? String(models.length) : '—', 'Reported by remote peers'],
            [
              'Inference',
              connected && speed != null && Number.isFinite(speed)
                ? `${speed.toFixed(1)} tok/s`
                : '—',
              'Latest node-reported throughput',
            ],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-(--radius-card) border border-edge bg-panel p-5">
              <p className="text-xs text-ink-muted">{label}</p>
              <p className="my-3 font-display text-3xl font-semibold">{value}</p>
              <p className="text-xs text-ink-faint">{detail}</p>
            </div>
          ))}
        </div>
        {section === 'Fleet' && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Mesh hardware</h2>
              <span className="text-xs text-ink-faint">
                Peer observations · rental ownership not yet linked
              </span>
            </div>
            {connected && peers.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {peers.map((peer, index) => (
                  <article
                    key={peer.id ?? peer.node_id ?? index}
                    className="rounded-(--radius-card) border border-edge bg-panel p-5"
                  >
                    <div className="flex items-center gap-3">
                      <Server className="text-accent" size={20} />
                      <h3 className="font-semibold">{peer.hostname ?? `Peer ${index + 1}`}</h3>
                      <span className="ml-auto text-xs text-ink-muted">
                        {peer.role ?? 'Role unknown'}
                      </span>
                    </div>
                    <p className="mt-5 text-sm text-ink-muted">
                      {peer.vram_gb != null
                        ? `${peer.vram_gb} GB reported memory`
                        : 'Memory unavailable'}
                    </p>
                    <p className="mt-2 truncate text-xs text-ink-faint">
                      {(peer.serving_models ?? peer.models ?? []).join(' · ') ||
                        'No serving model reported'}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-(--radius-card) border border-dashed border-edge p-12 text-center">
                <Server size={30} className="mx-auto mb-4 text-ink-faint" />
                <h3 className="font-semibold">
                  {connected ? 'Waiting for peers' : 'Bring your compute into view'}
                </h3>
                <p className="mx-auto mt-2 mb-6 max-w-sm text-sm text-ink-muted">
                  Connect a mesh to see its hardware and models. Rental inventory will appear when
                  the m8s controller is connected.
                </p>
                <Button onClick={onMesh}>Choose a mesh</Button>
              </div>
            )}
          </>
        )}
        {section === 'Providers' && (
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              [
                'Vast.ai',
                'Live prototype qualified',
                'Rental controls require the m8s controller integration.',
              ],
              ['Nebius', 'Planned adapter', 'Provider integration has not been implemented.'],
            ].map(([name, state, detail]) => (
              <article
                key={name}
                className="rounded-(--radius-card) border border-edge bg-panel p-6"
              >
                <Cloud size={24} className="mb-5 text-accent" />
                <h2 className="text-lg font-semibold">{name}</h2>
                <p className="mt-2 text-sm text-ink-muted">{state}</p>
                <p className="mt-5 text-xs text-ink-faint">{detail}</p>
              </article>
            ))}
          </div>
        )}
        {section === 'Inference' && (
          <section className="rounded-(--radius-card) border border-edge bg-panel p-6">
            <Activity size={24} className="mb-4 text-accent" />
            <h2 className="text-lg font-semibold">Run a conversation on your mesh</h2>
            <p className="mt-2 mb-6 text-sm text-ink-muted">
              Use the existing agent chat to exercise available inference. GPU utilization and
              per-rental performance require remote telemetry.
            </p>
            <Button onClick={onChat} disabled={!connected}>
              Open inference chat
            </Button>
          </section>
        )}
      </main>
    </div>
  )
}
