/** The Mesh brand mark: five linked hexagons arranged as an M. */
export default function MeshMark({
  size = 20,
  className = '',
  pulse = false,
}: {
  size?: number
  className?: string
  pulse?: boolean
}) {
  return (
    <svg
      width={size}
      height={(size * 350) / 520}
      viewBox="0 0 520 350"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <g>
        <polygon points="253.17,54 253.17,146 173.50,192 93.83,146 93.83,54 173.50,8" />
        <polygon points="426.17,54 426.17,146 346.50,192 266.83,146 266.83,54 346.50,8" />
        <polygon points="166.67,204 166.67,296 87,342 7.33,296 7.33,204 87,158" />
        <polygon points="339.67,204 339.67,296 260,342 180.33,296 180.33,204 260,158" />
        <polygon points="512.67,204 512.67,296 433,342 353.33,296 353.33,204 433,158" />
        {pulse && (
          <animate attributeName="opacity" values="1;0.45;1" dur="2s" repeatCount="indefinite" />
        )}
      </g>
    </svg>
  )
}
