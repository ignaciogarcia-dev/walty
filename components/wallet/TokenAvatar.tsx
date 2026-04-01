const LOCAL_TOKEN_LOGOS: Record<string, string> = {
  USDC: "/tokens/usdc.svg",
  USDT: "/tokens/usdt.svg",
}

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
  const src = LOCAL_TOKEN_LOGOS[symbol.toUpperCase()] ?? imageUrl

  return (
    <div
      className={`${sizeClass} rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
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
