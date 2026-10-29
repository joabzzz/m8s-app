import { X, Cpu, Server } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { gb, type FleetNode } from '../lib/fleet'

export default function NodeDetails({
  node,
  onClose,
  onRemove,
}: {
  node: FleetNode
  onClose: () => void
  onRemove?: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    close.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const controls = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input, select, textarea, [tabindex="0"]',
          ) ?? [],
        )
        const first = controls[0],
          last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
      previous?.focus()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Node details: ${node.name}`}
        className="h-full w-full max-w-lg overflow-auto border-l border-edge bg-panel p-7 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <Server size={26} className="mb-4 text-accent" />
            <h2 className="font-display text-2xl font-semibold">{node.name}</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {node.local ? 'This device · ' : ''}
              {node.role} · {node.state}
            </p>
          </div>
          <button ref={close} onClick={onClose} aria-label="Close node details">
            <X size={20} />
          </button>
        </div>
        <p className="mt-4 break-all font-mono text-xs text-ink-faint">{node.id}</p>
        <dl className="my-6 grid grid-cols-2 gap-4">
          {[
            ['GPU memory', gb(node.memory)],
            ['Allocatable capacity', gb(node.allocatable)],
            ['Reserved memory', gb(node.reserved)],
            ['Live GPU utilization', 'Not reported'],
            [
              'Latency',
              node.latency === null
                ? 'Not reported'
                : `${node.latency} ms${node.latencySource ? ` · ${node.latencySource}` : ''}`,
            ],
            ['Version', node.version ?? 'Not reported'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-(--radius-control) border border-edge p-3">
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="mt-2 text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mb-6 text-xs leading-relaxed text-ink-faint">
          Memory is advertised by this node. Allocatable capacity excludes configured reservations;
          it is not a live measurement of unused GPU memory. No utilization is inferred from model
          names.
        </p>
        <h3 className="mb-3 font-semibold">Hardware</h3>
        {node.gpus.length ? (
          node.gpus.map((gpu, index) => (
            <div key={index} className="mb-2 flex gap-3 rounded-(--radius-control) bg-inset p-3">
              <Cpu size={18} className="text-accent" />
              <div>
                <p className="text-sm">{gpu.name}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {gb(gpu.vram_bytes / 1e9)} physical memory
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-ink-faint">GPU inventory not reported.</p>
        )}
        {[
          ['Running models', node.running],
          ['Assigned models', node.assigned],
          ['Cached models', node.cached],
        ].map(([label, models]) => (
          <div key={label as string} className="mt-6">
            <h3 className="mb-2 font-semibold">{label}</h3>
            {models === null ? (
              <p className="text-sm text-ink-faint">Running-model telemetry not reported.</p>
            ) : (models as string[]).length ? (
              (models as string[]).map((model) => (
                <p
                  key={model}
                  className="mb-2 break-all rounded-(--radius-control) bg-inset p-3 text-xs"
                >
                  {model}
                </p>
              ))
            ) : (
              <p className="text-sm text-ink-faint">None reported.</p>
            )}
          </div>
        ))}
        <div className="mt-8 border-t border-edge pt-5">
          {onRemove ? (
            <button onClick={onRemove} className="text-sm text-warn">
              Manage rented compute
            </button>
          ) : (
            <p className="text-xs text-ink-faint">
              {node.local
                ? 'This is your local mesh node. Leave the mesh from Settings.'
                : 'This peer is not bound to an owned rental. Provider deletion is unavailable.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
