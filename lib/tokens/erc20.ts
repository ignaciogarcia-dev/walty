// Standard ERC-20 ABIs shared across the codebase

export const TRANSFER_FROM_ABI = [
  {
    name: "transferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from",  type: "address" },
      { name: "to",    type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

export const TRANSFER_EVENT_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true,  name: "from",  type: "address" },
      { indexed: true,  name: "to",    type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const
