export function WalletView({
  address,
  balance,
  onLock,
}: {
  address: string | null
  balance: string | null
  onLock: () => void
}) {
  return (
    <div className="p-10 flex flex-col gap-2">
      <div>Address: {address}</div>
      <div>Balance: {balance ?? "Cargando..."} ETH</div>
      <button onClick={onLock}>Bloquear wallet</button>
    </div>
  )
}
