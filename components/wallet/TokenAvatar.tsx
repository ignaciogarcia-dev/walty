export function TokenAvatar({
  symbol,
  imageUrl,
  sizeClass = "size-8",
  fallbackChars = 2,
}: {
  symbol: string
  imageUrl: string | null
  sizeClass?: string
  fallbackChars?: number
}) {
  return (
    <div
      className={`${sizeClass} rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`${symbol} logo`}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        symbol.slice(0, fallbackChars).toUpperCase()
      )}
    </div>
  )
}
