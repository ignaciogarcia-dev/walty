import type { Token } from "@/lib/tokens/tokenRegistry"

export type TxRequest = {
  from: string
  to: string
  value?: bigint
  token?: Token
  amount?: string
}

export type SimulateTxRequest = {
  chainId: number
  from: string
  to: string
  token: Token
  amount: string
}

export type SimulationResult = {
  success: boolean
  error?: string
}

export type SendTxParams = {
  mnemonic: string
  chainId: number
  from: string
  to: string
  token: Token
  amount: string
}

export interface ChainAdapter {
  getNativeBalance(address: string): Promise<bigint>
  getTokenBalances(address: string, tokens: Token[]): Promise<Map<string, bigint>>
  estimateGas(tx: TxRequest): Promise<bigint>
  simulateTransaction(tx: SimulateTxRequest): Promise<SimulationResult>
  sendTransaction(params: SendTxParams): Promise<string>
  broadcastTransaction(raw: `0x${string}`): Promise<string>
}
