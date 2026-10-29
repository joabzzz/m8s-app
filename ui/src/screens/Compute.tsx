import type { ComputeStatus } from './ComputeDemo'
import { useCallback, useState } from 'react'
import { Cpu, Network, Plus, Server } from 'lucide-react'
import { useApp } from '../lib/store'
import { Button } from '../components/ui'
import { fleetNodes, fleetTotal, gb } from '../lib/fleet'
import NodeDetails from '../components/NodeDetails'
import ComputeOffers from '../components/ComputeOffers'
import RentalInventory from '../components/RentalInventory'
import Providers from '../components/Providers'

export default function Compute({
  onRental,
  rental,
}: {
  onRental?: () => void
  rental?: ComputeStatus | null
}) {
  const { phase, status } = useApp()
  const [tab, setTab] = useState<'fleet' | 'providers'>('fleet')
  const [ownedNode, setOwnedNode] = useState<string | null>(null)
  const [providerConnected, setProviderConnected] = useState<boolean | null>(null)
  const [setupProvider, setSetupProvider] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const close = useCallback(() => setSelected(null), [])
  const observed = rental ? rental.node : status
  const nodes = fleetNodes(
    observed ? { ...observed, peers: observed.peers ?? [] } : null,
    phase.phase === 'running' && phase.serving,
  )
  const memory = fleetTotal(nodes, 'memory')
  const allocatable = fleetTotal(nodes, 'allocatable')
  const models = [...new Set(nodes.flatMap((node) => node.running ?? []))]
  const detail = nodes.find((node) => node.id === selected)
  const name =
    status?.mesh_name ?? (phase.phase === 'running' ? phase.mesh_name : null) ?? 'Current mesh'
  const meshId = status?.mesh_id ?? ''
  return (
    <main className="h-full overflow-auto bg-bg p-8 text-ink" data-testid="compute-screen">
      <div className="mx-auto max-w-6xl">
        {adding ? (
          <ComputeOffers
            nodeId={observed?.node_id ?? ''}
            meshId={meshId}
            meshName={name}
            onBack={() => setAdding(false)}
          />
        ) : (
          <>
            <header className="mb-7 flex items-center justify-between">
              <div>
                <p className="mb-2 text-xs text-ink-faint">{name}</p>
                <h1 className="font-display text-3xl font-bold">Compute overview</h1>
              </div>
              <Button
                onClick={() => {
                  if (providerConnected === false) {
                    setSetupProvider(true)
                    setTab('providers')
                  } else setAdding(true)
                }}
              >
                <Plus size={16} className="mr-2 inline" />
                Add compute
              </Button>
            </header>
            <nav aria-label="Compute sections" className="mb-5 flex gap-5 border-b border-edge">
              {(['fleet', 'providers'] as const).map((item) => (
                <button
                  key={item}
                  aria-pressed={tab === item}
                  onClick={() => setTab(item)}
                  className={`border-b-2 px-1 pb-3 text-sm transition-colors ${tab === item ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
                >
                  {item === 'fleet' ? 'Fleet' : 'Providers'}
                </button>
              ))}
            </nav>
            <div hidden={tab !== 'providers'}>
              <Providers
                forceOpen={setupProvider}
                onConfigured={setProviderConnected}
                onDismiss={() => setSetupProvider(false)}
              />
            </div>
            <div hidden={tab !== 'fleet'}>
              <section
                aria-label="Local node identity"
                className="mb-5 flex items-center gap-3 text-sm"
              >
                <Network size={16} className="shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-semibold">
                    {phase.phase === 'running' && phase.serving
                      ? 'Inference host'
                      : 'Passive client'}
                  </p>
                  <p className="mt-1 font-mono text-xs text-ink-faint">
                    {observed?.node_id ?? 'Identity unavailable'}
                  </p>
                </div>
                <p className="ml-auto text-xs text-ink-muted">
                  {status?.owner?.verified ? 'Node owner verified' : 'Node owner not verified'}
                </p>
              </section>
              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  [
                    'Nodes',
                    String(nodes.length),
                    `${nodes.filter((node) => node.role.toLowerCase() === 'host' || node.role.toLowerCase() === 'worker').length} hosts · includes this device`,
                  ],
                  [
                    'GPU memory',
                    gb(memory.value),
                    `${memory.known} of ${memory.total} nodes reporting`,
                  ],
                  [
                    'Allocatable capacity',
                    gb(allocatable.value),
                    'Excludes configured reservations',
                  ],
                  ['Running models', String(models.length), 'Confirmed by node telemetry'],
                ].map(([label, value, help]) => (
                  <section
                    key={label}
                    className="rounded-(--radius-card) border border-edge bg-panel p-3"
                  >
                    <h2 className="text-xs text-ink-muted">{label}</h2>
                    <p className="my-2 font-display text-xl font-semibold">{value}</p>
                    <p className="text-xs text-ink-faint">{help}</p>
                  </section>
                ))}
              </div>
              {onRental && (
                <section className="mb-6 flex items-center justify-between rounded-(--radius-card) border border-edge p-5">
                  <div>
                    <h2 className="font-semibold">Owned rental</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Inspect lease, readiness, and exact-resource removal.
                    </p>
                  </div>
                  <Button variant="quiet" onClick={onRental}>
                    Open rental controls
                  </Button>
                </section>
              )}
              <RentalInventory
                onInspect={setSelected}
                nodeIds={nodes.map((node) => node.id)}
                onOwnedNode={setOwnedNode}
              />
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Mesh hardware</h2>
                <span className="text-xs text-ink-faint">Discovered nodes · select to inspect</span>
              </div>
              <p className="mb-5 text-xs text-ink-faint">
                This is your node’s view of the mesh. Discovery does not imply a direct connection
                between every pair of peers.
              </p>
              <section
                aria-label="Mesh hardware map"
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelected(node.id)}
                    className={`rounded-(--radius-card) border bg-panel p-3 text-left transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent ${node.local ? 'border-accent/50' : 'border-edge'}`}
                  >
                    <div className="flex items-center gap-3">
                      {node.local ? (
                        <Cpu size={16} className="shrink-0 text-accent" />
                      ) : (
                        <Server size={16} className="shrink-0 text-accent" />
                      )}
                      <h3 className="truncate text-sm font-semibold">{node.name}</h3>
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">
                      {node.local ? 'This device · ' : ''}
                      {node.role} · {node.state}
                    </p>
                    <p className="mt-3 text-sm">{gb(node.memory)} GPU memory</p>
                    <p className="mt-2 truncate text-xs text-ink-faint">
                      {node.gpus.map((gpu) => gpu.name).join(' · ') || 'GPU inventory not reported'}
                    </p>
                    <p className="mt-2 truncate text-xs text-ink-muted">
                      {node.running === null
                        ? 'Running models not reported'
                        : node.running.length
                          ? `${node.running.length} running models`
                          : 'No running models'}
                    </p>
                  </button>
                ))}
              </section>
              {nodes.length === 1 && (
                <p className="mt-5 text-sm text-ink-muted">
                  Your local node is connected. Add compute or invite another device to grow this
                  mesh.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {detail && (
        <NodeDetails
          node={detail}
          onClose={close}
          onRemove={
            detail.id === ownedNode
              ? () => {
                  close()
                  document.getElementById('owned-rentals')?.scrollIntoView({ behavior: 'smooth' })
                }
              : undefined
          }
        />
      )}
    </main>
  )
}
