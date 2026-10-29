import { BackButton, Button, Card } from '../components/ui'
import { useState } from 'react'

export default function PrivateCreate({
  onBack,
  onPassive,
  onServe,
}: {
  onBack: () => void
  onPassive: () => void
  onServe: () => void
}) {
  const [serve, setServe] = useState(false)
  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-8 px-8"
      data-testid="private-create-screen"
    >
      <BackButton onClick={onBack} />
      <div className="text-center">
        <h1 className="font-display text-[28px] font-bold">Start a private mesh</h1>
        <p className="mt-3 text-ink-muted">
          Create your network first. Choose where inference runs.
        </p>
      </div>
      <div className="grid w-full max-w-3xl grid-cols-2 gap-4">
        <Card selected={!serve} onClick={() => setServe(false)} data-testid="private-mode-passive">
          <h2 className="font-semibold">Passive client</h2>
          <p className="mt-2 text-sm text-ink-muted">
            No model download. Invite another host or manage remote compute from this Mac.
          </p>
        </Card>
        <Card selected={serve} onClick={() => setServe(true)} data-testid="private-mode-serve">
          <h2 className="font-semibold">Run a model on this Mac</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Choose a model to download and share with your private mesh.
          </p>
        </Card>
      </div>
      <Button data-testid="private-continue" onClick={serve ? onServe : onPassive}>
        {serve ? 'Choose a model' : 'Create private mesh'}
      </Button>
    </div>
  )
}
