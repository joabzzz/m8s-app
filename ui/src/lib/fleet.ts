import type { GpuInfo, PeerInfo, StatusPayload } from './types'
export interface FleetNode {
  id: string
  name: string
  local: boolean
  role: string
  state: string
  gpus: GpuInfo[]
  memory: number | null
  allocatable: number | null
  reserved: number | null
  assigned: string[]
  running: string[] | null
  cached: string[]
  latency: number | null
  latencySource?: string
  version?: string
}
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
function sumKnown(gpus: GpuInfo[], field: keyof GpuInfo): number | null {
  if (!gpus.length || gpus.some((gpu) => !valid(gpu[field]))) return null
  return gpus.reduce((sum, gpu) => sum + Number(gpu[field]), 0) / 1e9
}
export function fleetNodes(status: StatusPayload | null, serving: boolean): FleetNode[] {
  if (!status?.node_id) return []
  const make = (peer: PeerInfo, local: boolean): FleetNode => {
    const gpus = peer.gpus ?? []
    return {
      id: peer.id ?? peer.node_id ?? 'unknown',
      name: peer.hostname ?? (local ? 'This device' : 'Unnamed node'),
      local,
      role: peer.role ?? 'Unknown',
      state: peer.state ?? peer.node_state ?? 'Unknown',
      gpus,
      memory: sumKnown(gpus, 'vram_bytes') ?? (valid(peer.vram_gb) ? peer.vram_gb : null),
      allocatable: sumKnown(gpus, 'allocatable_vram_bytes'),
      reserved: sumKnown(gpus, 'reserved_bytes'),
      assigned: peer.serving_models ?? peer.models ?? [],
      running: peer.hosted_models_known ? (peer.hosted_models ?? []) : null,
      cached: peer.available_models ?? [],
      latency: peer.latency_ms ?? peer.rtt_ms ?? null,
      latencySource: peer.latency_source,
      version: peer.version,
    }
  }
  const self = make(
    {
      id: status.node_id,
      hostname: status.my_hostname ?? status.hostname,
      gpus: status.gpus,
      vram_gb: status.my_vram_gb,
      role: serving ? 'Host' : 'Client',
      state: status.node_state ?? (serving ? 'Serving' : 'Connected'),
      serving_models: status.serving_models ?? (status.model_name ? [status.model_name] : []),
      hosted_models: status.hosted_models,
      hosted_models_known: Array.isArray(status.hosted_models),
      available_models: status.available_models,
    },
    true,
  )
  const seen = new Set([self.id])
  const peers = (status.peers ?? [])
    .filter((peer) => {
      const id = peer.id ?? peer.node_id
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map((peer) => make(peer, false))
  return [self, ...peers]
}
export const gb = (value: number | null) =>
  value === null
    ? 'Not reported'
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`
export function fleetTotal(nodes: FleetNode[], key: 'memory' | 'allocatable') {
  const known = nodes.filter((node) => node[key] !== null)
  return {
    value: known.length ? known.reduce((sum, node) => sum + (node[key] ?? 0), 0) : null,
    known: known.length,
    total: nodes.length,
  }
}
