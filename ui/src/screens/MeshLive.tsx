import { Link2, MoveRight } from 'lucide-react'
import { CopyButton, InviteQr, inviteLink } from '../components/InvitePanel'
import { Button } from '../components/ui'

interface MeshLiveProps {
  token: string | null
  model: string | null
  isPrivate: boolean
  onGoToChat: () => void
}

export default function MeshLive({ token, model, isPrivate, onGoToChat }: MeshLiveProps) {
  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-6 px-8"
      data-testid="mesh-live-screen"
    >
      <div className="text-center">
        <h1 className="font-display text-[32px] font-bold tracking-tight">Your mesh is live.</h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          {model
            ? `${model} is running on this Mac. Now invite someone.`
            : 'This Mac is a passive client. Invite a host or add remote compute when you need inference.'}
        </p>
      </div>

      {token ? (
        <div className="animate-[qr-in_400ms_ease-out]">
          <InviteQr token={token} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Fetching your invite code…</p>
      )}

      <p className="text-sm text-ink-muted">
        Send the link — clicking it opens Mesh and joins in one step. Or scan with a phone.
      </p>

      <div className="flex items-center gap-3">
        {token && (
          <CopyButton
            text={inviteLink(token)}
            label="Copy invite link"
            icon={Link2}
            testId="copy-invite-link"
          />
        )}
        {token && <CopyButton text={token} label="Copy code" />}
        <Button data-testid="go-to-chat" onClick={onGoToChat}>
          <span className="inline-flex items-center gap-1.5">
            Go to chat <MoveRight size={15} aria-hidden />
          </span>
        </Button>
      </div>

      <p className="text-[13px] text-ink-faint">
        Models shared by hosts will be available to this mesh.{' '}
        {isPrivate ? 'Invite-only.' : 'Open mesh.'}
      </p>
    </div>
  )
}
