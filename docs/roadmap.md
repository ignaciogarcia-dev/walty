# Roadmap

This roadmap tracks current priorities and guides contribution focus.

## How to Use This Roadmap

- Treat this as directional guidance, not a fixed release contract.
- Open an issue before starting non-trivial work.
- If your proposal is not listed here, suggest it with a `Feature request` or `Contribution proposal` issue.

## Current Priorities

### 1) Wallet Reliability and Safety

- Harden unlock/recovery flows.
- Improve validation and UX around sensitive actions.
- Strengthen transaction pre-flight checks and error handling.

### 2) Portfolio Accuracy and Performance

- Improve balance and USD valuation consistency across chains.
- Reduce latency for portfolio refresh and token metadata.
- Improve provider fallback behavior under API/rate-limit errors.

### 3) Swap Experience

- Improve quote reliability and fallback behavior.
- Make fee/network-cost feedback clearer before confirmation.
- Improve handling for approval and slippage edge cases.

### 4) Contributor Experience

- Expand docs and onboarding for first-time contributors.
- Add more `good first issue` tasks.
- Keep issue templates and PR checks strict and lightweight.

## Contribution Signals

These labels indicate where help is needed:

- `good first issue`
- `help wanted`
- `bug`
- `feature`
- `documentation`
- `needs-triage`

## Proposing New Work

When opening a proposal:

1. Explain the user problem first.
2. Define scope and out-of-scope.
3. Share rollout and validation plan.
4. Mention risks and backward-compatibility impact.

For workflow details, see [../CONTRIBUTING.md](../CONTRIBUTING.md).
