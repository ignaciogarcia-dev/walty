export const es = {
  // Dashboard
  "wallet-locked": "Wallet bloqueada",
  "wallet-locked-description":
    "Ingresa la contraseña de tu wallet para desbloquear. Esta es la contraseña que configuraste al crear la wallet.",
  "wallet-password": "Contraseña de la wallet",
  language: "Idioma",
  theme: "Tema",
  unlock: "Desbloquear",
  or: "o",
  loading: "Cargando…",
  settings: "Configuración",
  "settings-description": "Gestiona tus preferencias",
  general: "General",
  security: "Seguridad",
  logout: "Cerrar sesión",
  pay: "Pagar",
  home: "Inicio",
  send: "Enviar",
  activity: "Actividad",
  receive: "Recibir",

  // Wallet
  sending: "Enviando…",
  history: "Historial",
  "no-transactions-yet": "Sin transacciones aún.",

  // Transaction
  amount: "Monto",
  cancel: "Cancelar",
  "transaction-pending": "Transacción pendiente…",
  "on-network-waiting": "En la red — esperando confirmación",
  confirmed: "Confirmada",
  failed: "Fallida",
  pending: "Pendiente",
  error: "Error",
  dismiss: "Descartar",

  // Portfolio
  portfolio: "Portfolio",
  "recent-activity": "Actividad reciente",

  delete: "Eliminar",
  save: "Guardar",

  // Login/Register
  login: "Ingresar",
  register: "Registrarse",
  "logging-in": "Ingresando…",
  registering: "Registrando…",
  email: "Email",
  password: "Contraseña",
  "minimum-8-characters": "Mínimo 8 caracteres",
  "unexpected-error": "Error inesperado",

  // Theme
  light: "Claro",
  dark: "Oscuro",

  // Errors
  "password-too-long":
    "La contraseña supera el largo máximo permitido (72 bytes)",
  "wrong-password": "Contraseña incorrecta",
  "unlock-locked-out": "Demasiados intentos. Reintenta en {seconds}s",
  "attempts-remaining": "intentos restantes",
  "invalid-email-or-password": "Email inválido o password menor a 8 caracteres",
  "email-already-in-use": "Email ya en uso",
  "invalid-credentials": "Credenciales inválidas",
  "too-many-requests": "Demasiadas solicitudes",

  // PIN recovery
  pin: "PIN",
  "recovery-pin": "PIN de recuperación",
  "pin-description":
    "PIN de 6-8 dígitos. Desbloquea la clave de este dispositivo. Nunca se envía al servidor.",
  "recover-wallet": "Recuperar wallet",
  recovering: "Recuperando…",
  "pin-too-short": "El PIN debe tener al menos 6 dígitos",
  "error-recovering-wallet": "Error al recuperar wallet",
  "recovery-no-backup": "Se requiere kit de recuperación",
  "recovery-no-backup-description":
    "Esta cuenta solo puede restaurarse con el archivo walty-recovery-kit.json más reciente y su contraseña de recuperación.",
  "local-wallet-mismatch-title": "Detectamos una wallet local distinta",
  "local-wallet-mismatch-description":
    "La wallet guardada en este dispositivo no coincide con tu cuenta actual. Para continuar, restaura la wallet correcta.",
  "recovery-mpc-local-title": "Tu wallet ya está en este dispositivo",
  "recovery-mpc-local-description":
    "Esta es una wallet MPC — tu clave de dispositivo ya está guardada localmente. Ingresa tu PIN en el dashboard para desbloquearla.",
  "go-to-dashboard": "Ir al dashboard",
  "recovery-kit-description":
    "Sube tu archivo walty-recovery-kit.json e ingresa tu contraseña de recuperación para restaurar tu wallet en este dispositivo.",
  "recovery-kit-file-label": "Archivo del kit de recuperación",
  "recovery-kit-choose-file": "Seleccionar walty-recovery-kit.json…",
  "recovery-kit-password-label": "Contraseña de recuperación",
  "recovery-kit-no-file": "Por favor selecciona tu archivo de kit de recuperación.",
  "recovery-kit-no-password": "Por favor ingresa tu contraseña de recuperación.",
  "recovery-kit-invalid-file": "Archivo de kit de recuperación inválido. Asegúrate de haber seleccionado el walty-recovery-kit.json correcto.",
  "recovery-kit-wrong-password": "Contraseña de recuperación incorrecta. Verifica la contraseña e intenta de nuevo.",
  "recovery-kit-outdated": "Este kit de recuperación está desactualizado. Tu wallet se actualizó después de crearlo. Usá tu kit de recuperación más reciente para restaurar el acceso.",
  "recovery-session-expired": "La recuperación tardó demasiado en completarse. No se cambió nada — volvé a empezar la recuperación con tu kit.",

  // Onboarding
  "onboarding-create-new": "Crear nueva wallet",
  "onboarding-already-have": "Ya tengo una wallet",
  "onboarding-register-title": "Crea tu cuenta",
  "onboarding-register-description":
    "Ingresa tu email y contraseña para comenzar.",
  "onboarding-login-title": "Bienvenido de vuelta",
  "onboarding-login-description": "Inicia sesión para acceder a tu wallet.",
  "onboarding-creating-wallet": "Creando tu wallet…",
  "onboarding-recovery-kit-title": "Tu kit de recuperación",
  "onboarding-recovery-kit-description":
    "Tu clave se reparte en tres partes y nunca se reconstruye. Exportá tu parte de respaldo cifrada y guardala fuera de línea: es tu forma de recuperar la wallet si perdés este dispositivo.",
  "onboarding-recovery-password": "Contraseña de recuperación",
  "onboarding-recovery-password-confirm": "Confirmar contraseña",
  "onboarding-recovery-password-hint":
    "Una frase larga (mínimo 12 caracteres), distinta de tu PIN. Protege tu archivo de respaldo. No la guardamos en ningún lado.",
  "onboarding-recovery-password-too-short":
    "La contraseña de recuperación debe tener al menos 12 caracteres.",
  "onboarding-recovery-password-mismatch": "Las contraseñas no coinciden.",
  "onboarding-download-kit": "Descargar kit de recuperación",
  "onboarding-kit-saved-warning":
    "Guardá el archivo en un lugar seguro y fuera de línea (gestor de contraseñas, USB). Si perdés este dispositivo y el archivo, no hay forma de recuperar tus fondos.",
  "onboarding-kit-saved-continue": "Lo guardé, continuar",
  "onboarding-create-pin-title": "Creá un PIN de wallet",
  "onboarding-create-pin-description":
    "Este PIN desbloquea tu clave local MPC. Nunca se envía a nuestros servidores.",
  "onboarding-confirm-pin-label": "Confirmar PIN",
  "onboarding-continue": "Continuar",
  "onboarding-complete-title": "¡Todo listo!",
  "onboarding-complete-description": "Tu wallet ha sido creada y asegurada.",
  "onboarding-enter-app": "Entrar a la app",
  "onboarding-recover-title": "Recuperar tu wallet",
  "onboarding-recover-description":
    "Subí tu kit de recuperación para restaurar tu wallet en este dispositivo.",
  "onboarding-recover-invalid-local-description":
    "La wallet local de este dispositivo no coincide con tu cuenta. Restaurá la wallet correcta con tu kit de recuperación.",
  "pin-mismatch": "Los PINs no coinciden",
  "setting-up-wallet": "Configurando wallet…",
  checking: "Verificando…",
  "go-to-login": "¿Ya tienes cuenta? Inicia sesión",
  "go-to-register": "¿No tienes cuenta? Crea una",
  team: "Equipo",
  "operating-as": "Operando como",
  "at-business": "en",

  // Landing page
  "landing-get-started": "Comenzar",
  "landing-open-account": "Abrir cuenta",
  "landing-nav-product": "Producto",
  "landing-nav-security": "Seguridad",
  "landing-docs": "Documentación",
  "landing-github": "GitHub",
  "landing-features": "Funciones",

  // Hero
  "landing-hero-eyebrow": "Sin comisiones · Cobros instantáneos",
  "landing-hero-title": "Cobrá crypto con la solidez de un",
  "landing-hero-accent": "banco",
  "landing-hero-subtitle":
    "Generá un QR y recibí USDC al instante sobre Polygon. Autocustodia total, sin intermediarios ni comisiones de plataforma.",
  "landing-hero-cta-secondary": "Ver cómo funciona",
  "landing-demo-balance-label": "Saldo disponible",
  "landing-demo-tx": "Pago recibido",
  "landing-demo-qr-caption": "Escaneá para pagar",

  // Trust bar
  "landing-trust-eyebrow": "Construido sobre Polygon · USDC · Open source MIT",
  "landing-trust-1-value": "Instantánea",
  "landing-trust-1-label": "Liquidación on-chain",
  "landing-trust-2-value": "0 %",
  "landing-trust-2-label": "Comisiones de plataforma",
  "landing-trust-3-value": "2-de-3",
  "landing-trust-3-label": "Autocustodia MPC",

  // How it works
  "landing-how-it-works": "Cómo funciona",
  "landing-how-it-works-subtitle": "Del QR al cobro, en tiempo real.",
  "landing-step-1-title": "Generá un QR o link",
  "landing-step-1-desc":
    "Creá una solicitud de pago en USDC desde tu panel en segundos.",
  "landing-step-2-title": "Tu cliente paga",
  "landing-step-2-desc":
    "Escanea el QR o abre el link y paga desde cualquier wallet. Sin cuenta, sin registro.",
  "landing-step-3-title": "Recibís al instante",
  "landing-step-3-desc":
    "El cobro se liquida on-chain y aparece confirmado en tu panel.",

  // Features (bento)
  "landing-features-title":
    "Todo lo que un negocio necesita para cobrar crypto",
  "landing-feature-custody-title": "Autocustodia real (MPC 2-de-3)",
  "landing-feature-custody-desc":
    "Las claves se reparten entre tu dispositivo, el servidor y un kit de respaldo. La firma ocurre solo en tu navegador: nadie puede mover tus fondos sin vos.",
  "landing-feature-fees-title": "Sin intermediarios ni comisiones",
  "landing-feature-fees-desc":
    "Walty no cobra comisiones de plataforma. Solo pagás el gas de Polygon, céntimos por transacción.",
  "landing-feature-team-title": "Equipo de cajeros con roles",
  "landing-feature-team-desc":
    "Invitá operadores por link, asigná permisos y revisá un registro de auditoría de cada acción.",
  "landing-feature-refunds-title": "Reembolsos con aprobación",
  "landing-feature-refunds-desc":
    "El cajero solicita, el dueño aprueba y firma. Control total sobre cada devolución.",
  "landing-feature-qr-title": "QR y links públicos",
  "landing-feature-qr-desc":
    "Generá solicitudes de pago que tus clientes abren sin cuenta, desde cualquier wallet EVM.",
  "landing-feature-oss-title": "Open source y autoalojable",
  "landing-feature-oss-desc":
    "Código abierto bajo licencia MIT. Auditá todo o ejecutá Walty en tu propia infraestructura.",

  // Personas
  "landing-for-businesses": "¿Tenés un negocio?",
  "landing-for-businesses-desc":
    "Aceptá pagos en crypto directamente, sin intermediarios ni comisiones ocultas. Generá códigos QR, recibí confirmación al instante y gestioná tu equipo de operadores desde un solo lugar.",
  "landing-for-businesses-cta": "Empezar a cobrar",
  "landing-for-people": "¿Necesitás pagar?",
  "landing-for-people-desc":
    "Abrí un link de pago de Walty o escaneá el QR de un comercio. Podés pagar con cualquier wallet compatible; no necesitás una cuenta Walty.",
  "landing-for-people-cta": "Abrir link de pago",

  // Security
  "landing-security-eyebrow": "Seguridad",
  "landing-security-title": "Tus fondos, solo tuyos",
  "landing-security-desc":
    "Walty usa firma de umbral MPC 2-de-3. La clave nunca se reconstruye y la firma sucede en tu navegador. Ni Walty ni ningún servidor pueden mover el dinero de tu negocio.",
  "landing-security-share-device": "Dispositivo",
  "landing-security-share-device-desc":
    "Cifrada con tu PIN, local en tu navegador.",
  "landing-security-share-server": "Servidor",
  "landing-security-share-server-desc":
    "Cifrada con KMS. Inútil por sí sola.",
  "landing-security-share-backup": "Kit de respaldo",
  "landing-security-share-backup-desc":
    "Un archivo que guardás offline para recuperación.",
  "landing-security-point-1": "Firma solo en el navegador",
  "landing-security-point-2": "Código abierto auditable",
  "landing-security-point-3": "Liquidación on-chain en Polygon",

  // Final CTA
  "landing-cta-title": "Empezá a cobrar crypto hoy",
  "landing-cta-desc":
    "Creá tu cuenta de negocio en minutos. Sin comisiones, sin custodios.",

  // FAQ
  "landing-faq-title": "Preguntas frecuentes",
  "landing-faq-q1": "¿Mi cliente necesita una cuenta Walty?",
  "landing-faq-a1":
    "No. Tu cliente abre el link o escanea el QR y paga desde cualquier wallet EVM. No necesita cuenta ni registro.",
  "landing-faq-q2": "¿Qué red y token soporta?",
  "landing-faq-a2":
    "Walty opera con USDC sobre Polygon. El pagador cubre el gas, que en Polygon son céntimos.",
  "landing-faq-q3": "¿Walty cobra comisiones?",
  "landing-faq-a3":
    "No hay comisiones de plataforma. El único costo es el gas de red de Polygon.",
  "landing-faq-q4": "¿Quién custodia los fondos?",
  "landing-faq-a4":
    "Vos. Usamos MPC 2-de-3 y la firma ocurre en tu navegador; ningún servidor de Walty puede mover tu dinero.",
  "landing-faq-q5": "¿Puedo autoalojar Walty?",
  "landing-faq-a5":
    "Sí. Walty es open source bajo licencia MIT y se puede ejecutar en tu propia infraestructura.",

  // Footer
  "landing-footer-copyright": "© 2026 Walty.",
  "landing-footer-license": "Código abierto bajo licencia MIT.",

  // Dashboard actions
  collect: "Cobrar",
  refund: "Reembolso",
  "collect-no-wallet": "Todavía no tenés una wallet de cobro asignada.",
  "wallet-activity-send": "Transferencia",
  "wallet-activity-payment": "Pago",
  "wallet-activity-receive": "Recepción",
  "wallet-activity-collected": "Cobro",
  "wallet-activity-to": "Para",
  "wallet-activity-from": "De",
  "wallet-activity-network": "Red",
  "wallet-activity-status": "Estado",
  "cashier-movements-feed-title": "Movimientos",
  "cashier-movement-collection": "Cobro",
  "cashier-movement-refund": "Reembolso",
  "cashier-movements-empty":
    "Todavía no hay cobros pagados ni reembolsos ejecutados.",
  "cashier-movement-detail-type": "Tipo",
  "cashier-movement-detail-amount": "Monto",
  "cashier-movement-detail-date": "Fecha",
  "cashier-movement-detail-destination": "Destino",
  "cashier-movement-detail-reason": "Motivo",
  "cashier-movement-detail-tx": "Transacción",

  // Activity
  all: "Todos",
  payments: "Pagos",
  sends: "Envíos",
  completed: "Completados",
  "no-transactions": "No hay transacciones",
  "no-collections": "No hay cobros",
  paid: "Pagado",
  expired: "Expirado",
  confirming: "Confirmando",

  // Receive modal
  "copy-address": "Copiar dirección",
  copy: "Copiar",

  // Send form

  // CollectModal (POS)
  "collect-title": "Cobrar",
  "collect-amount-label": "Monto",
  "currency-usd": "Moneda: USD",
  "split-payment": "Pago dividido",
  continue: "Continuar",
  "usd-coin": "USD Coin",
  tether: "Tether",
  "generating-qr": "Generando QR…",
  "copy-link": "Copiar link",
  "total-to-pay": "Total a pagar:",
  "total-paid": "Total pagado:",
  remaining: "Restante:",
  contributions: "Contribuciones:",
  "contribution-confirmed": "Confirmado",
  "contribution-confirming": "Confirmando",
  "contribution-pending": "Pendiente",
  "network-polygon": "Red: Polygon",
  confirmations: "confirmaciones",
  "expired-label": "Expirado",
  "expires-in": "Expira en",
  "waiting-for-payment": "Esperando pago…",
  "payment-detected-confirming": "Pago detectado · Confirmando…",
  "collection-expired": "Este cobro expiró",
  "create-new-collection": "Crear nuevo cobro",
  "payment-received": "Pago recibido",
  "contributions-received": "Contribuciones recibidas:",
  "new-collection": "Nuevo cobro",
  "unlock-wallet-to-collect":
    "Desbloquea la wallet del comercio para crear el cobro.",
  "error-creating-collection": "Error al crear el cobro",
  "connection-error": "Error de conexión",

  // InviteModal
  "role-owner": "Propietario",
  "role-cashier": "Cajero",
  "role-cashier-desc": "Puede generar cobros y confirmar pagos",
  "invite-operator": "Invitar operador",
  "invite-link": "Link de invitación",
  "invite-cashier-description":
    "Se generará un link de invitación para un cajero.",
  "invite-wallet-note":
    "Se asignará automáticamente una wallet de cobro a este cajero.",
  generating: "Generando…",
  "generate-link": "Generar link",
  "invite-share-instruction":
    "Compartí este link con el operador. El link es de un solo uso y expira en 7 días.",
  close: "Cerrar",
  "error-creating-invite": "Error al crear invitación",
  "cashier-wallets": "Cajas",

  // RefundRequestPage
  "refund-request-sent": "Solicitud enviada",
  "refund-request-sent-desc":
    "Tu solicitud de reembolso fue enviada al dueño para su aprobación.",
  "back-to-home": "Volver al inicio",
  back: "Volver",
  "request-refund": "Solicitar reembolso",
  "refund-destination-address": "Dirección de destino",
  "refund-reason": "Motivo del reembolso",
  "refund-reason-placeholder": "Ej: Producto devuelto por el cliente",
  submitting: "Enviando…",
  "submit-request": "Enviar solicitud",
  "select-payment-for-refund": "Seleccionar pago para reembolso",
  "no-paid-payments": "No hay pagos completados disponibles para reembolso.",
  "error-submitting-request": "Error al enviar solicitud",

  // RefundRequestsPanel
  "pending-refund-requests": "Solicitudes de reembolso pendientes",
  operator: "Operador",
  "requested-by": "Solicitado por:",
  "destination-label": "Destino:",
  "reason-label": "Motivo:",
  approving: "Aprobando…",
  approve: "Aprobar",
  rejecting: "Rechazando…",
  reject: "Rechazar",
  executing: "Ejecutando…",
  "execute-refund": "Ejecutar reembolso",

  // ActivePaymentRequestCard
  "active-collection": "Cobro activo",
  "view-qr": "Ver QR",
  cancelling: "Cancelando…",
  "cancel-collection": "Cancelar cobro",

  // Payment status labels
  "payment-status-confirming": "Pago detectado, confirmando",
  "payment-status-paid": "Pagado",
  "payment-status-expired": "Expirado",
  "payment-status-cancelled": "Cancelado",
  "payment-status-pending": "Pendiente",

  // Payment discrepancy
  "payment-overpaid": "Pago mayor al esperado",
  "payment-underpaid": "Pago menor al esperado",
  "payment-expected": "Esperado:",
  "payment-received-label": "Recibido:",
  "payment-surplus": "Excedente:",
  "payment-shortfall": "Faltante:",
  "refund-surplus": "Solicitar reembolso",
  "refunding-surplus": "Enviando solicitud…",
  "refund-surplus-confirm":
    "¿Solicitar reembolso de {amount} {token} a {address}?",
  "refund-surplus-success": "Reembolso enviado",
  "refund-surplus-error": "Error al solicitar reembolso",
  "refund-surplus-reason": "Reembolso automático de excedente",
  "manage-refunds": "Reembolsos",
  "refunds-tab-title": "Solicitudes de reembolso",
  "refund-status-pending": "Pendiente de aprobación",
  "refund-status-approved": "Pendiente de firma",
  "refund-status-rejected": "Rechazado",
  "refund-status-executed": "Ejecutado",
  "no-refund-requests": "No hay solicitudes de reembolso",
  "sign-refund": "Firmar y enviar",
  "signing-refund": "Firmando…",
  "unlock-to-sign": "Desbloquear wallet",
  "unlock-to-sign-desc": "Ingresá tu contraseña para firmar esta transacción.",
  unlocking: "Desbloqueando…",

  // Pay page
  "pay-already-paid": "Este cobro ya fue pagado",
  "pay-expired": "Este cobro expiró",
  "pay-unavailable": "Este cobro no está disponible",
  "pay-request-new-qr": "Solicita un nuevo QR al comercio.",
  "merchant-address": "Dirección del comercio",
  status: "Estado",
  "pay-now": "Pagar ahora",
  "login-to-pay": "Iniciar sesión para pagar",
  "payment-detected-waiting":
    "Pago detectado. Esperando confirmaciones en Polygon.",

  // Join page
  "join-loading": "Cargando invitación...",
  "join-expired-title": "Esta invitación ha expirado",
  "join-ask-new-invite":
    "Pedile al administrador del negocio que te envíe una nueva invitación.",
  "join-revoked-title": "Esta invitación fue cancelada",
  "join-already-used-title": "Esta invitación ya fue utilizada",
  "join-go-to-dashboard": "Ir al panel →",
  "join-not-found-title": "Invitación no encontrada",
  "join-not-found-desc": "Este link no es válido o ya no existe.",
  "join-invitation-from": "Invitación de",
  "role-label": "Rol",
  "join-invited-by": "Invitado por",
  "join-expires-on": "Expira el",
  "join-failed-to-accept": "Error al aceptar invitación",
  "join-accepting": "Aceptando...",
  "join-accept": "Aceptar invitación",
  "join-need-account": "Necesitás crear una cuenta para unirte al equipo.",
  "join-create-account": "Crear cuenta y unirse",

  // Setup business
  "setup-business-title": "Configurá tu negocio",
  "setup-business-subtitle": "Indicanos el nombre que verán tus clientes al pagar.",
  "setup-business-name-label": "Nombre del negocio",
  "setup-business-name-placeholder": "Walty Café",

  // Team panel
  "team-manage-desc": "Administrá los operadores de tu negocio",
  "team-loading": "Cargando equipo...",
  "team-no-members": "No hay miembros en el equipo todavía.",
  "team-col-user": "Usuario",
  "team-col-last-activity": "Última actividad",
  "team-pending-registration": "Pendiente de registro",
  "team-revoke-blocked":
    "Hay fondos en la wallet. Recaudalos desde la sección {section} antes de revocar.",

  // Stats widget

  // Cashier wallets page
  "cashier-wallets-desc":
    "Balances de las wallets de tus cajeros. Recaudá las ganancias en tu wallet principal.",
  "cashier-wallets-empty":
    "No hay cajeros con wallet asignada todavía. Invitá un cajero desde la sección Equipo.",
  "cashier-inactive": "Cajeros inactivos",
  "member-status-active": "Activo",
  "member-status-suspended": "Suspendido",
  "member-status-revoked": "Revocado",
  "member-status-invited": "Invitación pendiente",
  "cashier-no-funds": "Sin fondos",
  "cashier-sending-gas": "Enviando gas...",
  "cashier-collecting": "Recaudando...",
  "cashier-funds-collected": "Fondos recaudados correctamente.",

  // Pay page
  "delete-invitation": "Eliminar invitación",
  suspend: "Suspender",
  reactivate: "Reactivar",
  "revoke-access": "Revocar acceso",
  "no-actions-available": "Sin acciones disponibles",
  // SendForm relay breakdown

  // Dispositivos
  devices: "Dispositivos",
  "devices-title": "Tus dispositivos",
  "devices-description":
    "Cada dispositivo con acceso a tu wallet. Revocá los que no reconozcas.",
  "devices-empty": "Todavía no hay dispositivos.",
  "devices-this-device": "Este dispositivo",
  "devices-trusted": "Confiable",
  "devices-pending": "Pareo pendiente",
  "devices-last-seen": "Visto por última vez {time}",
  "devices-rename": "Renombrar",
  "devices-revoke": "Revocar",
  "devices-rename-title": "Renombrar dispositivo",
  "devices-rename-description":
    "Elegí una etiqueta que reconozcas. Solo vos la ves.",
  "devices-rename-placeholder": "Ej. iPhone, Notebook oficina",
  "devices-rename-error": "No se pudo renombrar. Intentá de nuevo.",
  "devices-revoke-title": "¿Revocar este dispositivo?",
  "devices-revoke-description":
    "Va a cerrar sesión y va a necesitar una nueva aprobación para volver.",
  "devices-revoke-self-warning":
    "Es el dispositivo que estás usando. Vas a cerrar sesión y se va a borrar la copia local de tu wallet. Para volver vas a necesitar tu kit de recuperación.",
  "devices-revoke-confirm": "Revocar",
  "devices-revoke-error": "No se pudo revocar. Intentá de nuevo.",
  // Error boundaries
  "error-title": "Algo salió mal",
  "error-description":
    "Ocurrió un error inesperado. Podés reintentar; si sigue pasando, recargá la página.",
  "error-retry": "Reintentar",
} as const;
