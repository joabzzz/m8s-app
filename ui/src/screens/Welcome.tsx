import { Globe, KeyRound, MoveRight, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import AppNavigation from '../components/AppNavigation'
import MeshLogo from '../components/MeshLogo'
import MeshMark from '../components/MeshMark'
import MeshViz from '../components/MeshViz'
import { Card, ReassuranceLine } from '../components/ui'
import {
  appApi,
  type SavedMesh,
  type LocalMesh,
  looksLikeInviteToken,
  inviteMeshId,
} from '../lib/api'
import { lastConfigLabel, type LaunchConfig } from '../lib/session'

interface WelcomeProps {
  /** The last mesh this app launched, if any — powers "Back to mesh". */
  lastConfig: LaunchConfig | null
  onReconnect: (config: LaunchConfig) => void
  onResume: () => void
  onStartFresh: () => void
  onJoinPublic: () => void
  onJoin: (prefillToken?: string) => void
  onHost: () => void
  onOpenSettings: () => void
  activeMesh?: { name: string; isPublic: boolean; token?: string | null }
  onReturnToChat?: () => void
}

export default function Welcome({
  lastConfig,
  onResume,
  onReconnect,
  onStartFresh,
  onJoinPublic,
  onJoin,
  onHost,
  onOpenSettings,
  activeMesh,
  onReturnToChat,
}: WelcomeProps) {
  const [recent, setRecent] = useState<SavedMesh[]>([])
  const [local, setLocal] = useState<LocalMesh[]>([])
  useEffect(() => {
    let stopped = false
    const poll = async () => {
      try {
        const rows = await appApi.localMeshes()
        if (!stopped) setLocal(rows.instances ?? [])
      } catch {
        if (!stopped) setLocal([])
      }
    }
    void appApi
      .meshes()
      .then((rows) => {
        if (!stopped && Array.isArray(rows)) setRecent(rows)
      })
      .catch(() => {})
    void poll()
    const timer = setInterval(() => void poll(), 10000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [])
  const [clipboardToken, setClipboardToken] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const showResume = lastConfig !== null && !dismissed

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const text = await navigator.clipboard.readText()
        if (!cancelled && looksLikeInviteToken(text)) setClipboardToken(text.trim())
      } catch {
        /* clipboard permission denied — fine */
      }
    }
    void check()
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      window.removeEventListener('focus', check)
    }
  }, [])

  const seen = new Set<string>()
  if (activeMesh?.isPublic) seen.add('public')
  const activeId = inviteMeshId(activeMesh?.token)
  if (activeId) seen.add(`mesh:${activeId}`)
  const visibleRecent = recent.filter((row) => {
    const id =
      row.config.kind === 'public'
        ? 'public'
        : row.config.kind === 'join'
          ? `mesh:${inviteMeshId(row.config.token) ?? row.config.token}`
          : null
    if (!id) return true
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  return (
    <div className="flex h-screen flex-col">
      <AppNavigation
        current="home"
        connected={Boolean(activeMesh)}
        meshName={activeMesh?.name}
        isPublic={activeMesh?.isPublic}
        onHome={() => {}}
        onChat={() => onReturnToChat?.()}
        onSettings={onOpenSettings}
      />
      <div className="relative min-h-0 grow overflow-y-auto">
        <MeshViz
          variant="ambient"
          className="pointer-events-none fixed inset-x-0 top-12 bottom-0 h-[calc(100vh-3rem)] w-full opacity-60"
        />
        <div className="relative z-10 mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-8 px-8 py-8">
          <MeshLogo className="w-24" />

          {(activeMesh || local.length > 0 || recent.length > 0) && (
            <section
              className="w-full rounded-(--radius-card) border border-edge bg-panel p-4"
              aria-label="Your meshes"
            >
              <h2 className="mb-3 text-sm font-semibold">Your meshes</h2>
              {activeMesh && (
                <button
                  className="mb-2 flex w-full items-center justify-between rounded-(--radius-control) bg-inset p-3 text-left text-sm"
                  onClick={onReturnToChat}
                >
                  <span>{activeMesh.name}</span>
                  <span className="text-good">Connected · Open</span>
                </button>
              )}
              {local
                .filter((row) => !row.is_self)
                .map((row) => (
                  <div
                    key={row.node_id}
                    className="flex items-center justify-between border-t border-edge py-3 text-sm"
                  >
                    <span>
                      {row.name}
                      <small className="block text-ink-faint">
                        Running on this device · {row.role}
                      </small>
                    </span>
                    <button
                      className="text-accent disabled:opacity-40"
                      disabled={!row.token}
                      onClick={() =>
                        row.token && onReconnect({ kind: 'join', token: row.token, share: false })
                      }
                    >
                      Join mesh
                    </button>
                  </div>
                ))}
              {visibleRecent.map((row, index) => (
                <button
                  key={index}
                  onClick={() => onReconnect(row.config)}
                  className="flex w-full items-center justify-between border-t border-edge py-3 text-left text-sm"
                  data-testid="recent-mesh"
                >
                  <span>
                    {row.name}
                    <small className="block text-ink-faint">
                      Recently connected · availability checked on join
                    </small>
                  </span>
                  <span className="text-accent">Reconnect</span>
                </button>
              ))}
            </section>
          )}
          {showResume && lastConfig && !activeMesh && recent.length === 0 && (
            <div
              data-testid="resume-banner"
              className="flex w-full items-center gap-3 rounded-(--radius-card) border border-accent/60 bg-accent/[0.07] px-4 py-3"
            >
              <button
                data-testid="resume-mesh"
                onClick={onResume}
                className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-accent"
              >
                <RotateCcw size={14} aria-hidden />
                {lastConfigLabel(lastConfig)}
                <MoveRight size={14} className="transition-transform" aria-hidden />
              </button>
              <button
                data-testid="resume-dismiss"
                onClick={() => {
                  onStartFresh()
                  setDismissed(true)
                }}
                className="text-[12px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                title="Forget this mesh and start fresh"
              >
                Start fresh
              </button>
            </div>
          )}

          <div className="text-center">
            <h1 className="font-display text-[34px] leading-tight font-bold tracking-tight">
              Your own AI. On your own machines.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
              A powerful AI that runs on computers you own — not in someone else&rsquo;s cloud. Pool
              more computers to make it smarter.
            </p>
          </div>

          {clipboardToken && (
            <button
              data-testid="clipboard-invite-pill"
              onClick={() => onJoin(clipboardToken)}
              className="flex items-center gap-2 rounded-full border border-accent/50 bg-panel px-4 py-1.5 text-[13px] text-ink-muted transition-colors hover:border-accent"
            >
              <Sparkles size={13} className="text-accent" aria-hidden />
              We spotted an invite code in your clipboard —{' '}
              <span className="font-semibold text-accent">Use it</span>
            </button>
          )}

          {/* The hero: THE global mesh. */}
          <button
            data-testid="welcome-public"
            onClick={onJoinPublic}
            className="group relative w-full overflow-hidden rounded-(--radius-card) border border-accent/60 bg-accent/[0.07] p-6 text-left transition-all hover:border-accent hover:bg-accent/[0.12] hover:shadow-[0_8px_40px_-14px_var(--color-accent)] focus-visible:outline-2 focus-visible:outline-accent"
          >
            <div className="flex items-center gap-2">
              <Globe size={15} className="text-accent" aria-hidden />
              <span className="text-[11px] font-semibold tracking-wider text-accent uppercase">
                Join the global mesh
              </span>
            </div>
            <div className="font-display mt-2 text-[22px] font-bold tracking-tight">
              One worldwide AI mesh.
            </div>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-muted">
              Thousands of machines of every size, pooling their compute and a whole variety of
              expert models — always on, no account, end-to-end encrypted. You can be part of it.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-accent">
              Join now
              <MoveRight
                size={15}
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </div>
          </button>

          {/* Secondary front doors. */}
          <div className="grid w-full grid-cols-2 gap-4">
            <Card data-testid="welcome-join" onClick={() => onJoin()}>
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                <KeyRound size={15} className="text-accent" aria-hidden />
                Join with an invite code
              </div>
              <p className="mt-1.5 text-[13px] text-ink-muted">
                Someone sent you a code for their private mesh.
              </p>
            </Card>
            <Card data-testid="welcome-host" onClick={onHost}>
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                <MeshMark size={15} className="text-accent" />
                Start your own mesh
              </div>
              <p className="mt-1.5 text-[13px] text-ink-muted">
                A private mesh for you and the people you invite.
              </p>
            </Card>
          </div>

          <ReassuranceLine />
        </div>
      </div>
    </div>
  )
}
