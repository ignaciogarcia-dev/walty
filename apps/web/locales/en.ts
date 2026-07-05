export const en = {
  // Dashboard
  "wallet-locked": "Wallet locked",
  "wallet-locked-description":
    "Enter your wallet password to unlock. This is the password you set when creating the wallet.",
  "wallet-password": "Wallet password",
  language: "Language",
  theme: "Theme",
  unlock: "Unlock",
  or: "or",
  loading: "Loading…",
  settings: "Settings",
  "settings-description": "Manage your preferences",
  general: "General",
  security: "Security",
  logout: "Logout",
  pay: "Pay",
  home: "Home",
  send: "Send",
  activity: "Activity",
  receive: "Receive",

  // Wallet
  sending: "Sending…",
  history: "History",
  "no-transactions-yet": "No transactions yet.",

  // Transaction
  amount: "Amount",
  cancel: "Cancel",
  "transaction-pending": "Transaction pending…",
  "on-network-waiting": "On network — waiting for confirmation",
  confirmed: "Confirmed",
  failed: "Failed",
  pending: "Pending",
  error: "Error",
  dismiss: "Dismiss",

  // Portfolio
  portfolio: "Portfolio",
  "recent-activity": "Recent Activity",

  delete: "Delete",
  save: "Save",

  // Login/Register
  login: "Login",
  register: "Register",
  "logging-in": "Logging in…",
  registering: "Registering…",
  email: "Email",
  password: "Password",
  "minimum-8-characters": "Minimum 8 characters",
  "unexpected-error": "Unexpected error",

  // Theme
  light: "Light",
  dark: "Dark",

  // Errors
  "password-too-long": "Password exceeds the maximum allowed length (72 bytes)",
  "wrong-password": "Incorrect password",
  "unlock-locked-out": "Too many attempts. Try again in {seconds}s",
  "attempts-remaining": "attempts remaining",
  "invalid-email-or-password":
    "Invalid email or password less than 8 characters",
  "email-already-in-use": "Email already in use",
  "invalid-credentials": "Invalid credentials",
  "too-many-requests": "Too many requests",

  // PIN recovery
  pin: "PIN",
  "recovery-pin": "Recovery PIN",
  "pin-description":
    "6-8 digit PIN. Used to unlock this device share. Never sent to the server.",
  "recover-wallet": "Recover wallet",
  recovering: "Recovering…",
  "pin-too-short": "PIN must be at least 6 digits",
  "error-recovering-wallet": "Error recovering wallet",
  "recovery-no-backup": "Recovery kit required",
  "recovery-no-backup-description":
    "This account can only be restored with its latest walty-recovery-kit.json file and recovery password.",
  "local-wallet-mismatch-title": "A different local wallet was detected",
  "local-wallet-mismatch-description":
    "The wallet stored on this device does not match your current account. Restore the correct wallet to continue.",
  "recovery-mpc-local-title": "Your wallet is already on this device",
  "recovery-mpc-local-description":
    "This is an MPC wallet — your device share is stored locally. Enter your PIN on the dashboard to unlock it.",
  "go-to-dashboard": "Go to dashboard",
  "recovery-kit-description":
    "Upload your walty-recovery-kit.json file and enter your recovery password to restore your wallet on this device.",
  "recovery-kit-file-label": "Recovery kit file",
  "recovery-kit-choose-file": "Choose walty-recovery-kit.json…",
  "recovery-kit-password-label": "Recovery password",
  "recovery-kit-no-file": "Please choose your recovery kit file.",
  "recovery-kit-no-password": "Please enter your recovery password.",
  "recovery-kit-invalid-file": "Invalid recovery kit file. Make sure you selected the correct walty-recovery-kit.json.",
  "recovery-kit-wrong-password": "Wrong recovery password. Check the password and try again.",
  "recovery-kit-outdated": "This recovery kit is outdated — your wallet was refreshed after it was created. Use your most recent recovery kit to restore access.",
  "recovery-session-expired": "Recovery took too long to finish. Nothing was changed — please start the recovery again with your recovery kit.",

  // Onboarding
  "onboarding-create-new": "Create new wallet",
  "onboarding-already-have": "I already have a wallet",
  "onboarding-register-title": "Create your account",
  "onboarding-register-description":
    "Enter your email and password to get started.",
  "onboarding-login-title": "Welcome back",
  "onboarding-login-description": "Sign in to access your wallet.",
  "onboarding-creating-wallet": "Creating your wallet…",
  "onboarding-recovery-kit-title": "Your recovery kit",
  "onboarding-recovery-kit-description":
    "Your key is split into three shares and never reassembled. Export your encrypted backup share and keep it offline — it's how you recover your wallet if you lose this device.",
  "onboarding-recovery-password": "Recovery password",
  "onboarding-recovery-password-confirm": "Confirm password",
  "onboarding-recovery-password-hint":
    "A long passphrase (at least 12 characters), different from your PIN. It protects your backup file. We never store it.",
  "onboarding-recovery-password-too-short":
    "The recovery password must be at least 12 characters.",
  "onboarding-recovery-password-mismatch": "Passwords do not match.",
  "onboarding-download-kit": "Download recovery kit",
  "onboarding-kit-saved-warning":
    "Save the file somewhere safe and offline (password manager, USB). If you lose both this device and the file, your funds cannot be recovered.",
  "onboarding-kit-saved-continue": "I've saved it, continue",
  "onboarding-create-pin-title": "Create a wallet PIN",
  "onboarding-create-pin-description":
    "This PIN unlocks your local MPC device share. It is never sent to our servers.",
  "onboarding-confirm-pin-label": "Confirm PIN",
  "onboarding-continue": "Continue",
  "onboarding-complete-title": "You're all set",
  "onboarding-complete-description":
    "Your wallet has been created and secured.",
  "onboarding-enter-app": "Enter app",
  "onboarding-recover-title": "Recover your wallet",
  "onboarding-recover-description":
    "Upload your recovery kit to restore your wallet on this device.",
  "onboarding-recover-invalid-local-description":
    "The local wallet on this device does not match your account. Restore the correct wallet with your recovery kit.",
  "pin-mismatch": "PINs do not match",
  "setting-up-wallet": "Setting up wallet…",
  checking: "Checking…",
  "go-to-login": "Already have an account? Sign in",
  "go-to-register": "Don't have an account? Create one",
  team: "Team",
  "operating-as": "Operating as",
  "at-business": "at",

  // Landing page
  "landing-get-started": "Get Started",
  "landing-open-account": "Open account",
  "landing-nav-product": "Product",
  "landing-nav-security": "Security",
  "landing-docs": "Documentation",
  "landing-github": "GitHub",
  "landing-features": "Features",

  // Hero
  "landing-hero-eyebrow": "No fees · Instant settlement",
  "landing-hero-title": "Accept crypto with the solidity of a",
  "landing-hero-accent": "bank",
  "landing-hero-subtitle":
    "Generate a QR and receive USDC instantly on Polygon. Full self-custody, no intermediaries, no platform fees.",
  "landing-hero-cta-secondary": "See how it works",
  "landing-demo-balance-label": "Available balance",
  "landing-demo-tx": "Payment received",
  "landing-demo-qr-caption": "Scan to pay",

  // Trust bar
  "landing-trust-eyebrow": "Built on Polygon · USDC · MIT open source",
  "landing-trust-1-value": "Instant",
  "landing-trust-1-label": "On-chain settlement",
  "landing-trust-2-value": "0%",
  "landing-trust-2-label": "Platform fees",
  "landing-trust-3-value": "2-of-3",
  "landing-trust-3-label": "MPC self-custody",

  // How it works
  "landing-how-it-works": "How it works",
  "landing-how-it-works-subtitle": "From QR to settled, in real time.",
  "landing-step-1-title": "Generate a QR or link",
  "landing-step-1-desc":
    "Create a USDC payment request from your dashboard in seconds.",
  "landing-step-2-title": "Your customer pays",
  "landing-step-2-desc":
    "They scan the QR or open the link and pay from any wallet. No account, no signup.",
  "landing-step-3-title": "You get paid instantly",
  "landing-step-3-desc":
    "The payment settles on-chain and shows confirmed on your dashboard.",

  // Features (bento)
  "landing-features-title": "Everything a business needs to accept crypto",
  "landing-feature-custody-title": "Real self-custody (MPC 2-of-3)",
  "landing-feature-custody-desc":
    "Keys are split across your device, the server, and a backup kit. Signing happens only in your browser — no one can move your funds without you.",
  "landing-feature-fees-title": "No intermediaries, no fees",
  "landing-feature-fees-desc":
    "Walty charges zero platform fees. You only pay Polygon gas — cents per transaction.",
  "landing-feature-team-title": "Cashier team with roles",
  "landing-feature-team-desc":
    "Invite operators by link, assign permissions, and review an audit log of every action.",
  "landing-feature-refunds-title": "Refunds with approval",
  "landing-feature-refunds-desc":
    "The cashier requests, the owner approves and signs. Full control over every refund.",
  "landing-feature-qr-title": "Public QR and links",
  "landing-feature-qr-desc":
    "Generate payment requests your customers open without an account, from any EVM wallet.",
  "landing-feature-oss-title": "Open source and self-hostable",
  "landing-feature-oss-desc":
    "Open source under the MIT License. Audit everything or run Walty on your own infrastructure.",

  // Personas
  "landing-for-businesses": "Got a business?",
  "landing-for-businesses-desc":
    "Accept crypto payments directly no intermediaries, no hidden fees. Generate QR codes, get instant confirmation, and manage your team of operators from one place.",
  "landing-for-businesses-cta": "Start collecting",
  "landing-for-people": "Need to pay?",
  "landing-for-people-desc":
    "Open a Walty payment link or scan a QR code from a merchant. You can pay with any compatible wallet; no Walty account is required.",
  "landing-for-people-cta": "Open payment link",

  // Security
  "landing-security-eyebrow": "Security",
  "landing-security-title": "Your funds, only yours",
  "landing-security-desc":
    "Walty uses 2-of-3 MPC threshold signing. The key is never reassembled and signing happens in your browser. Neither Walty nor any server can move your business's money.",
  "landing-security-share-device": "Device",
  "landing-security-share-device-desc":
    "Encrypted with your PIN, local to your browser.",
  "landing-security-share-server": "Server",
  "landing-security-share-server-desc": "KMS-encrypted. Useless on its own.",
  "landing-security-share-backup": "Backup kit",
  "landing-security-share-backup-desc":
    "A file you keep offline for recovery.",
  "landing-security-point-1": "Browser-only signing",
  "landing-security-point-2": "Auditable open source",
  "landing-security-point-3": "On-chain settlement on Polygon",

  // Final CTA
  "landing-cta-title": "Start accepting crypto today",
  "landing-cta-desc":
    "Create your business account in minutes. No fees, no custodians.",

  // FAQ
  "landing-faq-title": "Frequently asked questions",
  "landing-faq-q1": "Does my customer need a Walty account?",
  "landing-faq-a1":
    "No. Your customer opens the link or scans the QR and pays from any EVM wallet. No account or signup required.",
  "landing-faq-q2": "Which network and token are supported?",
  "landing-faq-a2":
    "Walty runs on USDC over Polygon. The payer covers gas, which on Polygon is just cents.",
  "landing-faq-q3": "Does Walty charge fees?",
  "landing-faq-a3":
    "There are no platform fees. The only cost is Polygon network gas.",
  "landing-faq-q4": "Who custodies the funds?",
  "landing-faq-a4":
    "You do. We use 2-of-3 MPC and signing happens in your browser; no Walty server can move your money.",
  "landing-faq-q5": "Can I self-host Walty?",
  "landing-faq-a5":
    "Yes. Walty is open source under the MIT License and can run on your own infrastructure.",

  // Footer
  "landing-footer-copyright": "© 2026 Walty.",
  "landing-footer-license": "Open source under MIT License.",

  // Dashboard actions
  collect: "Collect",
  refund: "Refund",
  "collect-no-wallet": "No collection wallet assigned yet.",
  "wallet-activity-send": "Transfer",
  "wallet-activity-payment": "Payment",
  "wallet-activity-receive": "Reception",
  "wallet-activity-collected": "Collection",
  "wallet-activity-to": "To",
  "wallet-activity-from": "From",
  "wallet-activity-network": "Network",
  "wallet-activity-status": "Status",
  "cashier-movements-feed-title": "Recent activity",
  "cashier-movement-collection": "Collection",
  "cashier-movement-refund": "Refund",
  "cashier-movements-empty": "No completed collections or refunds yet.",
  "cashier-movement-detail-type": "Type",
  "cashier-movement-detail-amount": "Amount",
  "cashier-movement-detail-date": "Date",
  "cashier-movement-detail-destination": "Destination",
  "cashier-movement-detail-reason": "Reason",
  "cashier-movement-detail-tx": "Transaction",

  // Activity
  all: "All",
  payments: "Payments",
  sends: "Sends",
  completed: "Completed",
  "no-transactions": "No transactions",
  "no-collections": "No collections",
  paid: "Paid",
  expired: "Expired",
  confirming: "Confirming",

  // Receive modal
  "copy-address": "Copy Address",
  copy: "Copy",

  // Send form

  // CollectModal (POS)
  "collect-title": "Collect",
  "collect-amount-label": "Amount",
  "currency-usd": "Currency: USD",
  "split-payment": "Split payment",
  continue: "Continue",
  "usd-coin": "USD Coin",
  tether: "Tether",
  "generating-qr": "Generating QR…",
  "copy-link": "Copy link",
  "total-to-pay": "Total to pay:",
  "total-paid": "Total paid:",
  remaining: "Remaining:",
  contributions: "Contributions:",
  "contribution-confirmed": "Confirmed",
  "contribution-confirming": "Confirming",
  "contribution-pending": "Pending",
  "network-polygon": "Network: Polygon",
  confirmations: "confirmations",
  "expired-label": "Expired",
  "expires-in": "Expires in",
  "waiting-for-payment": "Waiting for payment…",
  "payment-detected-confirming": "Payment detected · Confirming…",
  "collection-expired": "This collection expired",
  "create-new-collection": "Create new collection",
  "payment-received": "Payment received",
  "contributions-received": "Contributions received:",
  "new-collection": "New collection",
  "unlock-wallet-to-collect":
    "Unlock the merchant wallet to create the collection.",
  "error-creating-collection": "Error creating collection",
  "connection-error": "Connection error",

  // InviteModal
  "role-owner": "Owner",
  "role-cashier": "Cashier",
  "role-cashier-desc": "Can create collections and confirm payments",
  "invite-operator": "Invite operator",
  "invite-link": "Invite link",
  "invite-cashier-description":
    "An invite link will be generated for a cashier.",
  "invite-wallet-note":
    "A dedicated collection wallet will be assigned to this cashier automatically.",
  generating: "Generating…",
  "generate-link": "Generate link",
  "invite-share-instruction":
    "Share this link with the operator. The link is single-use and expires in 7 days.",
  close: "Close",
  "error-creating-invite": "Error creating invitation",
  "cashier-wallets": "Cashier wallets",

  // RefundRequestPage
  "refund-request-sent": "Request sent",
  "refund-request-sent-desc":
    "Your refund request has been sent to the owner for approval.",
  "back-to-home": "Back to home",
  back: "Back",
  "request-refund": "Request refund",
  "refund-destination-address": "Destination address",
  "refund-reason": "Refund reason",
  "refund-reason-placeholder": "E.g.: Product returned by customer",
  submitting: "Submitting…",
  "submit-request": "Submit request",
  "select-payment-for-refund": "Select payment for refund",
  "no-paid-payments": "No completed payments available for refund.",
  "error-submitting-request": "Error submitting request",

  // RefundRequestsPanel
  "pending-refund-requests": "Pending refund requests",
  operator: "Operator",
  "requested-by": "Requested by:",
  "destination-label": "Destination:",
  "reason-label": "Reason:",
  approving: "Approving…",
  approve: "Approve",
  rejecting: "Rejecting…",
  reject: "Reject",
  executing: "Executing…",
  "execute-refund": "Execute refund",

  // ActivePaymentRequestCard
  "active-collection": "Active collection",
  "view-qr": "View QR",
  cancelling: "Cancelling…",
  "cancel-collection": "Cancel collection",

  // Payment status labels
  "payment-status-confirming": "Payment detected, confirming",
  "payment-status-paid": "Paid",
  "payment-status-expired": "Expired",
  "payment-status-cancelled": "Cancelled",
  "payment-status-pending": "Pending",

  // Payment discrepancy
  "payment-overpaid": "Payment exceeded expected amount",
  "payment-underpaid": "Payment below expected amount",
  "payment-expected": "Expected:",
  "payment-received-label": "Received:",
  "payment-surplus": "Surplus:",
  "payment-shortfall": "Shortfall:",
  "refund-surplus": "Request refund",
  "refunding-surplus": "Sending request…",
  "refund-surplus-confirm": "Request refund of {amount} {token} to {address}?",
  "refund-surplus-success": "Refund sent",
  "refund-surplus-error": "Error requesting refund",
  "refund-surplus-reason": "Automatic surplus refund",
  "manage-refunds": "Refunds",
  "refunds-tab-title": "Refund requests",
  "refund-status-pending": "Pending approval",
  "refund-status-approved": "Pending signature",
  "refund-status-rejected": "Rejected",
  "refund-status-executed": "Executed",
  "no-refund-requests": "No refund requests",
  "sign-refund": "Sign & send",
  "signing-refund": "Signing…",
  "unlock-to-sign": "Unlock wallet",
  "unlock-to-sign-desc": "Enter your password to sign this transaction.",
  unlocking: "Unlocking…",

  // Pay page
  "pay-already-paid": "This collection has already been paid",
  "pay-expired": "This collection has expired",
  "pay-unavailable": "This collection is not available",
  "pay-request-new-qr": "Request a new QR from the merchant.",
  "merchant-address": "Merchant address",
  status: "Status",
  "pay-now": "Pay now",
  "login-to-pay": "Sign in to pay",
  "payment-detected-waiting":
    "Payment detected. Waiting for confirmations on Polygon.",

  // Join page
  "join-loading": "Loading invitation...",
  "join-expired-title": "This invitation has expired",
  "join-ask-new-invite":
    "Ask the business administrator to send you a new invitation.",
  "join-revoked-title": "This invitation was cancelled",
  "join-already-used-title": "This invitation has already been used",
  "join-go-to-dashboard": "Go to dashboard →",
  "join-not-found-title": "Invitation not found",
  "join-not-found-desc": "This link is not valid or no longer exists.",
  "join-invitation-from": "Invitation from",
  "role-label": "Role",
  "join-invited-by": "Invited by",
  "join-expires-on": "Expires on",
  "join-failed-to-accept": "Failed to accept invitation",
  "join-accepting": "Accepting...",
  "join-accept": "Accept invitation",
  "join-need-account": "You need to create an account to join the team.",
  "join-create-account": "Create account and join",

  // Setup business
  "setup-business-title": "Set up your business",
  "setup-business-subtitle": "Tell us the name customers will see when they pay.",
  "setup-business-name-label": "Business name",
  "setup-business-name-placeholder": "Walty Coffee",

  // Team panel
  "team-manage-desc": "Manage your business operators",
  "team-loading": "Loading team...",
  "team-no-members": "No team members yet.",
  "team-col-user": "User",
  "team-col-last-activity": "Last activity",
  "team-pending-registration": "Pending registration",
  "team-revoke-blocked":
    "There are funds in the wallet. Collect them from the {section} section before revoking.",

  // Stats widget

  // Cashier wallets page
  "cashier-wallets-desc":
    "Your cashiers' wallet balances. Collect earnings to your main wallet.",
  "cashier-wallets-empty":
    "No cashiers with an assigned wallet yet. Invite a cashier from the Team section.",
  "cashier-inactive": "Inactive cashiers",
  "member-status-active": "Active",
  "member-status-suspended": "Suspended",
  "member-status-revoked": "Revoked",
  "member-status-invited": "Pending invitation",
  "cashier-no-funds": "No funds",
  "cashier-sending-gas": "Sending gas...",
  "cashier-collecting": "Collecting...",
  "cashier-funds-collected": "Funds collected successfully.",

  // Pay page
  "delete-invitation": "Delete invitation",
  suspend: "Suspend",
  reactivate: "Reactivate",
  "revoke-access": "Revoke access",
  "no-actions-available": "No actions available",
  // SendForm relay breakdown

  // Devices
  devices: "Devices",
  "devices-title": "Your devices",
  "devices-description":
    "Every device that has access to your wallet. Revoke any you don't recognise.",
  "devices-empty": "No devices yet.",
  "devices-this-device": "This device",
  "devices-trusted": "Trusted",
  "devices-pending": "Pending pairing",
  "devices-last-seen": "Last seen {time}",
  "devices-rename": "Rename",
  "devices-revoke": "Revoke",
  "devices-rename-title": "Rename device",
  "devices-rename-description":
    "Pick a label you'll recognise. Only you can see it.",
  "devices-rename-placeholder": "e.g. iPhone, Office laptop",
  "devices-rename-error": "Couldn't rename. Try again.",
  "devices-revoke-title": "Revoke this device?",
  "devices-revoke-description":
    "It will be signed out and need a new approval to come back in.",
  "devices-revoke-self-warning":
    "This is the device you're using. You'll be signed out and your local wallet copy will be cleared. To return you'll need your recovery kit.",
  "devices-revoke-confirm": "Revoke",
  "devices-revoke-error": "Couldn't revoke. Try again.",
  // Error boundaries
  "error-title": "Something went wrong",
  "error-description":
    "An unexpected error occurred. You can try again; if it keeps happening, reload the page.",
  "error-retry": "Try again",

  // POS terminals
  "pos-nav": "POS",
  "pos-title": "Point of sale (POS)",
  "pos-subtitle":
    "Terminals that take payments autonomously. Each has its own wallet and links with a private key.",
  "pos-add": "Add POS",
  "pos-empty": "You don't have any POS terminals yet. Add your first one.",
  "pos-revoked-heading": "Revoked",
  "pos-revoke": "Revoke",
  "pos-revoke-title": "Revoke POS",
  "pos-revoke-confirm":
    "Revoke this POS? It will no longer be able to take payments. Funds already received are not moved.",
  "pos-status-active": "Active",
  "pos-status-pending": "Not linked",
  "pos-status-revoked": "Revoked",
  "pos-last-seen": "Last seen",
  "pos-never-connected": "Never connected",
  "pos-create-title": "Add POS",
  "pos-create-description":
    "This will generate the terminal's wallet (requires unlocking your wallet) and a private key to load onto the device.",
  "pos-name-placeholder": "Name (e.g. Register 1)",
  "pos-name-required": "Enter a name",
  "pos-create-cta": "Create POS",
  "pos-creating": "Creating…",
  "pos-create-error": "Couldn't create the POS",
  "pos-credentials-title": "POS key",
  "pos-key-warning":
    "Save this private key now: it's shown only once and cannot be recovered. Load it onto the POS device.",
  "pos-private-key": "Private key",
  "pos-copy-config": "Copy config",
  "pos-download-config": "Download",
  "pos-done": "Done",
  copied: "Copied",
} as const;
