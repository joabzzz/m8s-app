type MeshLogoVariant = 'full' | 'mark'

export default function MeshLogo({
  variant = 'full',
  className = '',
}: {
  variant?: MeshLogoVariant
  className?: string
}) {
  const prefix = variant === 'mark' ? 'mesh-mark' : 'mesh-logo'
  const alt = variant === 'full' ? 'Mesh' : ''

  return (
    <span className={`mesh-logo ${className}`}>
      <img className="mesh-logo-dark" src={`/${prefix}-dark.png`} alt={alt} />
      <img className="mesh-logo-light" src={`/${prefix}-light.png`} alt={alt} />
    </span>
  )
}
