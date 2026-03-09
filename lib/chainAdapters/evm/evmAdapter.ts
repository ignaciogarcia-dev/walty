import { parseUnits, erc20Abi, formatEther } from "viem"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import { getWalletClient } from "@/lib/rpc/getWalletClient"
import type { Token } from "@/lib/tokens/tokenRegistry"
import type {
  ChainAdapter,
  TxRequest,
  SimulateTxRequest,
  SimulationResult,
  SendTxParams,
} from "../types"

const balanceOfAbi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export function createEvmAdapter(chainId: number): ChainAdapter {
  const publicClient = getPublicClient(chainId)

  return {
    async getNativeBalance(address: string): Promise<bigint> {
      return publicClient.getBalance({ address: address as `0x${string}` })
    },

    async getTokenBalances(
      address: string,
      tokens: Token[]
    ): Promise<Map<string, bigint>> {
      const result = new Map<string, bigint>()

      const nativeToken = tokens.find((t) => t.type === "native")
      const erc20Tokens = tokens.filter((t) => t.type === "erc20")

      const contracts = erc20Tokens.map((token) => ({
        address: token.address as `0x${string}`,
        abi: balanceOfAbi,
        functionName: "balanceOf" as const,
        args: [address as `0x${string}`] as const,
      }))

      const [nativeBalance, multicallResults] = await Promise.all([
        nativeToken
          ? publicClient.getBalance({ address: address as `0x${string}` })
          : Promise.resolve(null),
        contracts.length > 0
          ? publicClient.multicall({ contracts, allowFailure: true })
          : Promise.resolve(
              [] as Array<
                | { status: "success"; result: bigint }
                | { status: "failure"; error: Error }
              >
            ),
      ])

      if (nativeToken && nativeBalance !== null) {
        result.set(nativeToken.symbol, nativeBalance)
      }

      erc20Tokens.forEach((token, i) => {
        const res = multicallResults[i]
        if (res && res.status === "success") {
          result.set(token.symbol, res.result as bigint)
        } else {
          result.set(token.symbol, 0n)
        }
      })

      return result
    },

    async estimateGas(tx: TxRequest): Promise<bigint> {
      if (tx.token && tx.token.type === "erc20" && tx.token.address) {
        return publicClient.estimateContractGas({
          address: tx.token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "transfer",
          args: [
            tx.to as `0x${string}`,
            parseUnits(tx.amount ?? "0", tx.token.decimals),
          ],
          account: tx.from as `0x${string}`,
        })
      }

      return publicClient.estimateGas({
        account: tx.from as `0x${string}`,
        to: tx.to as `0x${string}`,
        value: tx.value ?? 0n,
      })
    },

    async simulateTransaction(
      tx: SimulateTxRequest
    ): Promise<SimulationResult> {
      try {
        if (tx.token.type === "erc20" && tx.token.address) {
          await publicClient.simulateContract({
            address: tx.token.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "transfer",
            args: [
              tx.to as `0x${string}`,
              parseUnits(tx.amount, tx.token.decimals),
            ],
            account: tx.from as `0x${string}`,
          })
        } else {
          await publicClient.call({
            account: tx.from as `0x${string}`,
            to: tx.to as `0x${string}`,
            value: parseUnits(tx.amount, tx.token.decimals),
          })
        }
        return { success: true }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Simulation failed",
        }
      }
    },

    async sendTransaction(params: SendTxParams): Promise<string> {
      const walletClient = getWalletClient(params.mnemonic, chainId)
      const gasPrice = await publicClient.getGasPrice()

      if (params.token.type === "erc20" && params.token.address) {
        const tokenAmount = parseUnits(params.amount, params.token.decimals)
        const gas = await publicClient.estimateContractGas({
          address: params.token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "transfer",
          args: [params.to as `0x${string}`, tokenAmount],
          account: params.from as `0x${string}`,
        })

        const hash = await walletClient.writeContract({
          address: params.token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "transfer",
          args: [params.to as `0x${string}`, tokenAmount],
          gas,
          gasPrice,
        })
        return hash
      }

      // Native token transfer
      const value = parseUnits(params.amount, params.token.decimals)
      const gas = await publicClient.estimateGas({
        account: params.from as `0x${string}`,
        to: params.to as `0x${string}`,
        value,
      })

      // Check balance includes gas
      const currentBalance = await publicClient.getBalance({
        address: params.from as `0x${string}`,
      })
      if (currentBalance < value + gas * gasPrice) {
        throw new Error("Insufficient funds (including gas)")
      }

      const hash = await walletClient.sendTransaction({
        to: params.to as `0x${string}`,
        value,
        gas,
        gasPrice,
      })
      return hash
    },
  }
}
