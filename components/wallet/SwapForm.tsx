"use client"
import { useState, useEffect, useRef } from "react"
import { parseUnits, formatUnits } from "viem"
import { CaretUpDown, Check } from "@phosphor-icons/react"
import { TOKENS, type Token } from "@/lib/tokens"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { getWalletClient } from "@/lib/signer"
import { decryptSeed } from "@/lib/crypto"
import { getStoredWallet } from "@/lib/wallet-store"
import { publicClient } from "@/lib/eth"
import { useTranslation } from "@/hooks/useTranslation"
import type { ZeroxQuoteResponse } from "@/lib/0x"
import { TokenAvatar } from "./TokenAvatar"
import { cn } from "@/utils/style"

const erc20Abi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

type SwapStatus = "idle" | "quoting" | "approving" | "swapping" | "success" | "error"
type QuoteDir = "sell" | "buy"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

function TokenSelector({
  selectedToken,
  options,
  tokenImages,
  disabled,
  onChange,
}: {
  selectedToken: Token
  options: Token[]
  tokenImages: Record<string, string>
  disabled: boolean
  onChange: (symbol: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-token-selector="true"
          className="w-[132px] justify-between gap-2 rounded-full px-2.5"
        >
          <span className="flex items-center gap-2 min-w-0">
            <TokenAvatar
              symbol={selectedToken.symbol}
              imageUrl={tokenImages[selectedToken.symbol] ?? null}
              sizeClass="size-5"
            />
            <span className="truncate text-sm font-medium">{selectedToken.symbol}</span>
          </span>
          <CaretUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent data-token-selector="true" className="w-[240px] rounded-3xl p-0" align="start">
        <Command className="rounded-3xl">
          <CommandInput placeholder="Search token..." />
          <CommandList>
            <CommandEmpty>No tokens found</CommandEmpty>
            <CommandGroup>
              {options.map((token) => (
                <CommandItem
                  key={token.symbol}
                  value={token.symbol}
                  keywords={[
                    token.symbol.toLowerCase(),
                    token.name.toLowerCase(),
                    token.address?.toLowerCase() ?? "",
                  ]}
                  onSelect={() => {
                    onChange(token.symbol)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4 shrink-0 transition-opacity",
                      selectedToken.symbol === token.symbol ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex items-center gap-2 min-w-0">
                    <TokenAvatar
                      symbol={token.symbol}
                      imageUrl={tokenImages[token.symbol] ?? null}
                      sizeClass="size-5"
                    />
                    <span className="truncate">{token.symbol}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function SwapForm({
  address,
  password,
  onTxRecord,
}: {
  address: string
  password: string
  onTxRecord: (hash: string, to: string, amount: string) => void
}) {
  const { t } = useTranslation()
  const [sellToken, setSellToken] = useState<Token>(TOKENS[0])
  const [buyToken, setBuyToken] = useState<Token>(TOKENS[1])
  const [sellAmount, setSellAmount] = useState("")
  const [buyAmount, setBuyAmount] = useState("")
  const [priceInfo, setPriceInfo] = useState<{ buyAmount: string; sellAmount: string } | null>(null)
  const [quoteDir, setQuoteDir] = useState<QuoteDir>("sell")
  const [sellBalance, setSellBalance] = useState<bigint>(0n)
  const [buyBalance, setBuyBalance] = useState<bigint>(0n)
  const [status, setStatus] = useState<SwapStatus>("idle")
  const [swapError, setSwapError] = useState<string | null>(null)
  const [swapHash, setSwapHash] = useState<string | null>(null)
  const [feeInfo, setFeeInfo] = useState<{
    feeAmount: number
    feePercent: number
  } | null>(null)
  const [networkFeeUsd, setNetworkFeeUsd] = useState<number | null>(null)
  const [tokenImages, setTokenImages] = useState<Record<string, string>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref so the async callback always reads the latest price without stale closure
  const latestPriceRef = useRef<{ buyAmount: string; sellAmount: string } | null>(null)
  const sellInputRef = useRef<HTMLInputElement>(null)
  const buyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false

    fetch("/api/token-images")
      .then((res) => (res.ok ? res.json() : {}))
      .then((images: Record<string, string>) => {
        if (!cancelled) {
          setTokenImages(images)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTokenImages({})
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Fetch sell token balance
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let bal: bigint
        if (sellToken.address === null) {
          bal = await publicClient.getBalance({ address: address as `0x${string}` })
        } else {
          bal = (await publicClient.readContract({
            address: sellToken.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address as `0x${string}`],
          })) as bigint
        }
        if (!cancelled) setSellBalance(bal)
      } catch {
        if (!cancelled) setSellBalance(0n)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [sellToken.address, address])

  // Fetch buy token balance
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let bal: bigint
        if (buyToken.address === null) {
          bal = await publicClient.getBalance({ address: address as `0x${string}` })
        } else {
          bal = (await publicClient.readContract({
            address: buyToken.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address as `0x${string}`],
          })) as bigint
        }
        if (!cancelled) setBuyBalance(bal)
      } catch {
        if (!cancelled) setBuyBalance(0n)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [buyToken.address, address])

  // Debounced price fetch — called imperatively from handlers to avoid dep-loop
  function schedulePriceFetch(direction: QuoteDir, amount: string, sTok: Token, bTok: Token) {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!amount || parseFloat(amount) <= 0 || sTok.symbol === bTok.symbol) {
      setPriceInfo(null)
      latestPriceRef.current = null
      setStatus("idle")
      if (direction === "sell") setBuyAmount("")
      else setSellAmount("")
      return
    }

    setQuoteDir(direction)
    setStatus("quoting")
    setSwapError(null)

    debounceRef.current = setTimeout(async () => {
      try {
        let fetchSellWei: string

        if (direction === "sell") {
          fetchSellWei = parseUnits(amount, sTok.decimals).toString()
        } else {
          // Estimate sell from desired buy using latest price ratio
          const ref = latestPriceRef.current
          if (!ref || parseFloat(ref.buyAmount) === 0) {
            setStatus("idle")
            return
          }
          const buyWei = parseUnits(amount, bTok.decimals)
          fetchSellWei = ((BigInt(ref.sellAmount) * buyWei) / BigInt(ref.buyAmount)).toString()
        }

        const params = new URLSearchParams({
          sellToken: sTok.address ?? "ETH",
          buyToken: bTok.address ?? "ETH",
          sellAmount: fetchSellWei,
          chainId: "1",
        })

        const res = await fetch(`/api/swap/price?${params}`)
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error ?? "Price failed")
        }

        const data: { buyAmount: string; sellAmount: string } = await res.json()
        latestPriceRef.current = data
        setPriceInfo(data)

        // Calculate fee info from price data
        if (data.sellAmount && data.buyAmount) {
          const sell = parseFloat(
            formatUnits(BigInt(data.sellAmount), sTok.decimals)
          )
          const buy = parseFloat(
            formatUnits(BigInt(data.buyAmount), bTok.decimals)
          )
          const midPrice = buy / sell
          const expectedBuy = sell * midPrice
          const feeAmount = expectedBuy - buy
          const feePercent = expectedBuy > 0
            ? (feeAmount / expectedBuy) * 100
            : 0
          setFeeInfo({ feeAmount, feePercent })
        }

        if (direction === "sell") {
          setBuyAmount(
            parseFloat(formatUnits(BigInt(data.buyAmount), bTok.decimals)).toFixed(6)
          )
        } else {
          setSellAmount(
            parseFloat(formatUnits(BigInt(data.sellAmount), sTok.decimals)).toFixed(6)
          )
        }
        setStatus("idle")
      } catch (err) {
        setSwapError(err instanceof Error ? err.message : "Price failed")
        setStatus("error")
      }
    }, 500)
  }

  function handleSellAmountChange(value: string) {
    setSellAmount(value)
    schedulePriceFetch("sell", value, sellToken, buyToken)
  }

  function handleBuyAmountChange(value: string) {
    setBuyAmount(value)
    schedulePriceFetch("buy", value, sellToken, buyToken)
  }

  function handleSellTokenChange(sym: string) {
    const tok = TOKENS.find((t) => t.symbol === sym)
    if (!tok) return
    setSellToken(tok)
    resetQuote()
    if (sellAmount) schedulePriceFetch("sell", sellAmount, tok, buyToken)
  }

  function handleBuyTokenChange(sym: string) {
    const tok = TOKENS.find((t) => t.symbol === sym)
    if (!tok) return
    setBuyToken(tok)
    resetQuote()
    if (sellAmount) schedulePriceFetch("sell", sellAmount, sellToken, tok)
  }

  function handleFlipTokens() {
    const newSell = buyToken
    const newBuy = sellToken
    const newSellAmt = buyAmount
    setSellToken(newSell)
    setBuyToken(newBuy)
    setSellAmount(newSellAmt)
    resetQuote()
    if (newSellAmt) schedulePriceFetch("sell", newSellAmt, newSell, newBuy)
  }

  function resetQuote() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setPriceInfo(null)
    latestPriceRef.current = null
    setBuyAmount("")
    setStatus("idle")
    setSwapError(null)
    setSwapHash(null)
    setFeeInfo(null)
    setNetworkFeeUsd(null)
  }

  async function handleSwap() {
    if (!sellAmount || parseFloat(sellAmount) <= 0) return

    setStatus("approving")
    setSwapError(null)

    try {
      const sellAmountWei = parseUnits(sellAmount, sellToken.decimals).toString()
      const params = new URLSearchParams({
        sellToken: sellToken.address ?? "ETH",
        buyToken: buyToken.address ?? "ETH",
        sellAmount: sellAmountWei,
        takerAddress: address,
        chainId: "1",
      })

      const res = await fetch(`/api/swap/quote?${params}`)
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        throw new Error(err.error ?? "Quote failed")
      }

      const quote: ZeroxQuoteResponse = await res.json()
      const tx = quote.transaction

      // Calculate network fee from quote gas data
      const gasCostEth =
        Number(tx.gas) *
        Number(tx.gasPrice) /
        1e18
      try {
        const pricesRes = await fetch("/api/prices")
        if (pricesRes.ok) {
          const prices: Record<string, number> = await pricesRes.json()
          if (prices.ETH) {
            setNetworkFeeUsd(gasCostEth * prices.ETH)
          } else {
            setNetworkFeeUsd(gasCostEth)
          }
        } else {
          setNetworkFeeUsd(gasCostEth)
        }
      } catch {
        setNetworkFeeUsd(gasCostEth)
      }

      const stored = getStoredWallet()!
      const mnemonic = await decryptSeed(stored.encrypted, password)
      const walletClient = getWalletClient(mnemonic)

      // Approve spender if needed
      const spender = quote.issues?.allowance?.spender
      if (sellToken.address !== null && spender && spender !== ZERO_ADDRESS) {
        setStatus("approving")
        const approveTx = await walletClient.writeContract({
          address: sellToken.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, parseUnits(sellAmount, sellToken.decimals)],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTx })
      }

      // Simulate to catch reverts before broadcasting
      await publicClient.call({
        account: address as `0x${string}`,
        to: tx.to,
        data: tx.data,
        value: BigInt(tx.value ?? "0"),
      })

      setStatus("swapping")
      const hash = await walletClient.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: BigInt(tx.value ?? "0"),
        gas: BigInt(tx.gas),
      })

      setSwapHash(hash)
      const buyFmt = formatUnits(BigInt(quote.buyAmount), buyToken.decimals)
      const label = `SWAP ${sellAmount} ${sellToken.symbol} → ${parseFloat(buyFmt).toFixed(6)} ${buyToken.symbol}`
      onTxRecord(hash, tx.to, label)

      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("success")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Swap failed"
      setSwapError(msg.includes("insufficient funds") ? t("insufficient-funds") : msg)
      setStatus("error")
    }
  }

  // Derived state
  const sellAmountWei = (() => {
    try {
      return sellAmount ? parseUnits(sellAmount, sellToken.decimals) : 0n
    } catch {
      return 0n
    }
  })()
  const insufficientBalance = sellAmountWei > 0n && sellAmountWei > sellBalance
  const isBusy = status === "approving" || status === "swapping"
  const isQuoting = status === "quoting"
  const hasEnteredAmount = (
    (sellAmount && parseFloat(sellAmount) > 0) ||
    (buyAmount && parseFloat(buyAmount) > 0)
  )
  const showDetailSkeleton = isQuoting || isBusy

  const buyOptions = TOKENS.filter((t) => t.symbol !== sellToken.symbol)
  const sellOptions = TOKENS.filter((t) => t.symbol !== buyToken.symbol)

  let priceDisplay: string | null = null
  if (priceInfo && parseFloat(priceInfo.sellAmount) > 0 && parseFloat(priceInfo.buyAmount) > 0) {
    const sell = parseFloat(formatUnits(BigInt(priceInfo.sellAmount), sellToken.decimals))
    const buy = parseFloat(formatUnits(BigInt(priceInfo.buyAmount), buyToken.decimals))
    priceDisplay = `1 ${sellToken.symbol} = ${(buy / sell).toFixed(6)} ${buyToken.symbol}`
  }

  // Button state
  let buttonLabel: string
  let buttonDisabled: boolean
  let buttonDestructive = false

  if (isBusy) {
    buttonLabel = status === "approving" ? t("approving") : t("swapping")
    buttonDisabled = true
  } else if (!sellAmount || parseFloat(sellAmount) <= 0) {
    buttonLabel = t("enter-amount")
    buttonDisabled = true
  } else if (insufficientBalance) {
    buttonLabel = t("insufficient-balance")
    buttonDisabled = true
    buttonDestructive = true
  } else if (isQuoting) {
    buttonLabel = t("calculating")
    buttonDisabled = true
  } else {
    buttonLabel = t("swap")
    buttonDisabled = false
  }

  return (
    <div className="rounded-4xl p-4 flex flex-col gap-3">
      <h2 className="font-semibold text-foreground mb-1">{t("swap")}</h2>

      {/* You Pay */}
      <div
        onClick={(e) => {
          // Only focus input if click wasn't on an interactive element
          const target = e.target as HTMLElement
          if (target.closest("[data-token-selector='true']")) return
          if (target.tagName !== 'BUTTON' && target.tagName !== 'INPUT') {
            sellInputRef.current?.focus()
          }
        }}
        className="
        rounded-3xl border bg-muted/80 dark:bg-muted/20 p-4 flex flex-col gap-2
        cursor-text
        "
      >
        <p className="text-xs font-medium text-muted-foreground">{t("swap-sell")}</p>
        <div className="flex items-center gap-2">
          <TokenSelector
            selectedToken={sellToken}
            options={sellOptions}
            tokenImages={tokenImages}
            disabled={isBusy}
            onChange={handleSellTokenChange}
          />
          <Input
            ref={sellInputRef}
            type="number"
            placeholder="0"
            value={sellAmount}
            onChange={(e) => handleSellAmountChange(e.target.value)}
            disabled={isBusy}
            min="0"
            step="any"
            className="
            flex-1 rounded-2xl text-right text-xl font-semibold
            border-none bg-transparent shadow-none
            focus:bg-transparent focus-visible:bg-transparent active:bg-transparent
            focus:outline-none focus:ring-0
            hover:ring-0 hover:outline-none
            disabled:opacity-50
            appearance-none
            "
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("balance")}: {parseFloat(formatUnits(sellBalance, sellToken.decimals)).toFixed(4)}{" "}
          {sellToken.symbol}
        </p>
      </div>

      {/* Flip button */}
      <div className="flex justify-center -my-5">
        <Button
          size="icon"
          className="rounded-full size-8 border-2 z-10 border-input"
          onClick={handleFlipTokens}
          disabled={isBusy}
        >
          ⇅
        </Button>
      </div>

      {/* You Receive */}
      <div
        onClick={(e) => {
          // Only focus input if click wasn't on an interactive element
          const target = e.target as HTMLElement
          if (target.closest("[data-token-selector='true']")) return
          if (target.tagName !== 'BUTTON' && target.tagName !== 'INPUT') {
            buyInputRef.current?.focus()
          }
        }}
        className="
        rounded-3xl border bg-muted/80 dark:bg-muted/20 p-4 flex flex-col gap-2
        cursor-text
        "
      >
        <p className="text-xs font-medium text-muted-foreground">{t("you-receive")}</p>
        <div className="flex items-center gap-2">
          <TokenSelector
            selectedToken={buyToken}
            options={buyOptions}
            tokenImages={tokenImages}
            disabled={isBusy}
            onChange={handleBuyTokenChange}
          />
          <div className="flex-1 relative">
            <Input
              ref={buyInputRef}
              type="number"
              placeholder="0"
              value={isQuoting && quoteDir === "sell" ? "" : buyAmount}
              onChange={(e) => handleBuyAmountChange(e.target.value)}
              disabled={isBusy}
              min="0"
              step="any"
              className="
              rounded-2xl text-right text-xl font-semibold
              border-none bg-transparent shadow-none
              focus:bg-transparent focus-visible:bg-transparent active:bg-transparent
              focus:outline-none focus:ring-0
              hover:ring-0 hover:outline-none
              disabled:opacity-50
              appearance-none
              w-full
              "
            />
            {isQuoting && quoteDir === "sell" && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Spinner className="size-3.5" />
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("balance")}: {parseFloat(formatUnits(buyBalance, buyToken.decimals)).toFixed(4)}{" "}
          {buyToken.symbol}
        </p>
      </div>

      {/* Fee breakdown */}
      {hasEnteredAmount && (
        <div className="rounded-2xl border bg-muted/20 p-3 flex flex-col gap-4 text-xs">
          <div className="flex justify-between items-center gap-3">
            <span className="text-muted-foreground">{t("swap-price")}</span>
            {showDetailSkeleton ? (
              <Skeleton className="h-4 w-40 rounded-full" />
            ) : (
              <span className="font-mono">{priceDisplay ?? "-"}</span>
            )}
          </div>
          <div className="flex justify-between items-center gap-3">
            <span className="text-muted-foreground">{t("swap-fee")}</span>
            {showDetailSkeleton ? (
              <Skeleton className="h-4 w-32 rounded-full" />
            ) : (
              <span className="font-mono">
                {feeInfo
                  ? `${feeInfo.feePercent.toFixed(2)}% (${feeInfo.feeAmount.toFixed(6)} ${buyToken.symbol})`
                  : "-"}
              </span>
            )}
          </div>
          {(networkFeeUsd !== null || isBusy) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("network-fee")}</span>
              {showDetailSkeleton ? (
                <Skeleton className="h-4 w-20 rounded-full" />
              ) : (
                <span className="font-mono">~${networkFeeUsd?.toFixed(2) ?? "-"}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {status === "error" && swapError && (
        <p className="text-sm text-destructive">{swapError}</p>
      )}

      {/* Success */}
      {status === "success" && swapHash && (
        <p className="text-sm font-medium text-green-600 dark:text-green-400">
          {t("swap-confirmed")}
        </p>
      )}

      {/* Action button */}
      <Button
        onClick={handleSwap}
        disabled={buttonDisabled}
        variant={buttonDestructive ? "destructive" : "default"}
        className="mt-1 w-full rounded-2xl"
      >
        {isBusy && <Spinner />}
        {buttonLabel}
      </Button>
    </div>
  )
}
