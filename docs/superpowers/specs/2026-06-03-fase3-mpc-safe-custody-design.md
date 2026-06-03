# Fase 3 — Custodia MPC + Treasury Safe con operadores por permisos

> Design spec. Estado: aprobado para pasar a plan de implementación (2026-06-03).
> Quality bar: **production-grade** (mainnet). Timeline: meses, entregable por estratos.

## 1. Contexto y motivación

Walty es hoy **single-key self-custodial**: la mnemonic BIP-39 del owner vive
cifrada en IndexedDB del browser (V3: AES-GCM + PBKDF2 600k, device-key envuelta
por PIN), y los operadores/cashiers son **derivaciones HD de la seed del owner**
(`mnemonicToAccount(mnemonic, {addressIndex})`, índice 0 = owner, 1+ = cashiers).
Toda firma ocurre en el browser; el server solo valida hashes de payload y
broadcastea. Fase 2 (multi-device pairing) está completa y mergeada.

Dos debilidades estructurales motivan Fase 3:

1. **La clave del owner es un punto único.** La seed completa existe en cada
   device (aunque cifrada). Un device comprometido con el PIN = clave total.
2. **Los operadores son custodiales por accidente.** La derivación HD fue
   conveniencia (un solo origen de seed, evitar muchos códigos de descifrado),
   **no** seguridad. Un cashier no debería tener clave ni acceso a la firma —
   solo mostrar un address para cobrar.

**Objetivo:** custodia segura por construcción (sin punto único de clave) +
permisos de operador enforced on-chain (trustless, no server-side), preservando
el abstraction layer de tx-intents de Fase 1 y el pairing multi-device de Fase 2.

## 2. Decisiones cerradas

- **Owner key:** MPC/TSS threshold-ECDSA secp256k1, **2-of-3** shares =
  `device` + `server` + `backup` offline. El server es co-signer pero **no puede
  firmar solo**. La seed nunca se reensambla.
- **Protocolo/impl:** threshold-ECDSA moderno (**DKLs23 o CGGMP21**) vía
  implementación open-source **auditada y mantenida**, WASM en browser + Node en
  server. (Verificar mantenimiento/audit de la lib concreta al inicio de la
  implementación — ver §10 Riesgos.)
- **Treasury:** un **Safe (1-of-1)** por business en Polygon; único signer = la
  dirección MPC del owner. Los fondos viven en el Safe.
- **Operadores:** permisos **on-chain** vía módulo **Zodiac Roles**. Cashier =
  recibe (solo se muestra el address del Safe), sin clave; Manager = puede
  ejecutar refunds hasta un cap, acotado por la policy del módulo.
- **HD-bajo-MPC:** **diferido.** El owner arranca con una sola clave MPC (sin
  HD). Los operadores ya no se derivan, así que no hace falta.
- **Shamir SSS:** **descartado** — reconstruye la seed por un instante, viola
  "la seed nunca existe completa".

## 3. Arquitectura en capas

| Capa | Qué es | Garantiza | Dónde vive |
|------|--------|-----------|------------|
| Treasury | Safe 1-of-1 en Polygon (fondos USDC/USDT) | Autoridad y política on-chain | Contrato on-chain |
| Owner key | Clave MPC 2-of-3, único signer del Safe | La clave nunca existe completa | Shares: device + server + backup |
| Permisos | Módulo Zodiac Roles sobre el Safe | Cashier recibe / Manager refund con cap, enforced on-chain | Módulo on-chain |

El **Safe** es la autoridad (on-chain, auditable), el **MPC** es la seguridad de
la clave (off-chain, sin punto único), **Zodiac** es el enforcement de permisos.
Cada capa se entiende y testea aislada.

## 4. Diseño por subsistema

### A. Custodia MPC del owner

- **DKG (onboarding):** los 3 shares se generan por *distributed key
  generation*; la clave completa nunca se materializa. Reemplaza
  `generateMnemonic()` (`apps/web/lib/wallet.ts`).
- **Almacenamiento de shares:** `device` en IndexedDB (reemplaza el envelope V3
  de seed; el PIN/`WalletSecurityManager` pasa a proteger el *share*, no la
  seed), `server` en una tabla nueva (`mpc_key_shares`), `backup` offline
  cifrado bajo password de recuperación (export impreso/descargable).
- **Firma:** ceremonia 2-of-3 device+server. El server valida la policy del
  tx-intent **antes** de aportar su share (mantiene el rol de gate que hoy hace
  en broadcast). Output: una firma ECDSA estándar que el Safe verifica on-chain.
- **Device nuevo:** ya no baja el blob cifrado (deprecar `/api/wallet/backup`
  para seed); entra vía **resharing/DKG** generando su propio share. El pairing
  gate de Fase 2 (`devicePairingRequests`, namespace `/devices`) se reusa como
  canal de autorización del resharing.
- **Punto de integración:** `apps/web/lib/transactions/signIntent.ts` —
  reemplazar `mnemonicToAccount(...).signTransaction()` por construir la Safe tx
  + correr la ceremonia MPC. `WebSigner` pasa a ser un `MpcSigner`.

### B. Treasury Safe

- **Deploy:** un Safe 1-of-1 por business, owner = dirección MPC. CREATE2 para
  address predecible (mostrar/financiar antes de la primera tx).
- **Address de cobro:** los payment requests apuntan al **address del Safe**. La
  página pública `/pay/[requestId]` no cambia conceptualmente — otra address.
- **Gas:** el Safe necesita MATIC para ejecutar. Reusar la lógica de funding de
  `OperatorWalletManager` (thresholds min 0.02 / fund 0.05 MATIC) apuntada al
  Safe, o vía relayer.

### C. Operadores con Zodiac Roles

- **Cashier:** rol on-chain sin capacidad de mover fondos; solo se le expone el
  address del Safe para cobrar. Cero HD, cero clave.
- **Manager:** rol que ejecuta refunds hasta un cap, acotado on-chain por la
  policy (destinatario/monto/token).
- **Migración de modelo:** `businessMembers` (`packages/db/src/schema.ts`) pasa
  de `derivationIndex` + `walletAddress` a una identidad con rol Zodiac;
  `derivationIndex` se deja de usar para custodia.

### D. Flujo tx-intent bajo MPC + Safe

Se **conserva** el abstraction layer de Fase 1; cambia solo el motor de firma:
1. Operator/owner propone (refund request → tx-intent) — igual que hoy.
2. Se construye una **Safe transaction**; el owner corre la **ceremonia MPC**
   (device+server) para producir la firma del owner sobre esa Safe tx.
3. El server verifica el hash canónico (como hoy) y ejecuta/broadcastea la Safe
   tx (Safe `execTransaction`).
4. Idempotencia, payload-hash y anti-doble-broadcast de Fase 1 se mantienen
   (`apps/api/src/routes/txIntents.ts`, `packages/shared/src/tx-intents/`).

### E. Recovery y key-rotation

- **Device perdido:** `server + backup` reconstituyen capacidad de firma y
  re-sharean a un device nuevo. Device robado **solo** no firma (le falta el 2º
  share).
- **Proactive refresh:** rotación periódica de shares sin cambiar la clave
  pública (propiedad de DKLs23/CGGMP21) — un share filtrado queda inútil.
- **Rotación de signer del Safe:** governance del propio Safe permite cambiar el
  owner si hiciera falta.

### F. Migración desde Fase 2 (mayor riesgo operativo)

Negocios existentes tienen HD wallet + fondos en un EOA. Secuencia **por
business, reversible/pausable**: deploy del Safe → DKG de la clave MPC → barrido
de fondos del EOA viejo al Safe → corte de operadores HD a roles Zodiac. Va con
runbook propio (estados, rollback, verificación de saldos) — se detalla en el
plan de implementación.

## 5. Threat model (núcleo de la tesis)

Tabla explícita actor × capacidad. Para cada actor: qué puede mover, qué no, y
qué capa lo frena (MPC threshold / Safe / Zodiac). Se completa con justificación
y, donde aplique, un test por fila.

| Actor | ¿Puede mover fondos? | Qué lo frena |
|-------|----------------------|--------------|
| Server solo | No | Falta 2º share (MPC 2-of-3) |
| Device solo (sin server ni backup) | No | Falta 2º share |
| Device robado (con PIN) | No por sí solo | Necesita el server-share; el server aplica policy/2FA y puede congelar |
| Server comprometido | No | No tiene 2 shares; el device es necesario |
| Backup filtrado | No por sí solo | Es 1 de 3; necesita un 2º share |
| Cashier malicioso | No | Sin clave ni rol de firma; Zodiac no le da permiso de mover |
| Manager malicioso | Solo hasta el cap, destinos acotados | Policy on-chain del módulo Zodiac |
| Payer | No | Fuera del modelo de custodia |

(La tabla es el esqueleto; el spec de implementación la cierra con los detalles
de qué hace exactamente el server-share como gate y cómo se congela.)

## 6. Orden de implementación (estratificado)

Cada estrato testeable en testnet Amoy (chainId 80002) antes del siguiente:

- **(a)** Safe + Zodiac Roles con un signer EOA de prueba (sin MPC todavía).
- **(b)** Motor MPC 2-of-3 aislado: DKG + sign + refresh, sin UI, con tests.
- **(c)** Swap del signer del Safe a la clave MPC; `signIntent` usa `MpcSigner`.
- **(d)** Migración del modelo de operadores a roles Zodiac.
- **(e)** Migración de negocios existentes (runbook §4.F).

## 7. Archivos críticos (orientativo)

**Nuevos (aprox.):**
- `apps/web/lib/mpc/` — cliente WASM (DKG, sign, reshare), `MpcSigner`.
- `apps/api/src/services/mpc/` — co-signer server-side (share, ceremonia, policy gate).
- `apps/web/lib/safe/` — deploy/exec Safe (Protocol Kit), construcción de Safe tx.
- `apps/api/src/services/zodiac/` o helpers de roles — setup/lectura de permisos.
- `packages/db/src/schema.ts` — tabla `mpc_key_shares`, ajustes a `businessMembers`.

**Modificados (aprox.):**
- `apps/web/lib/transactions/signIntent.ts` — motor de firma MPC+Safe.
- `apps/web/lib/wallet.ts` / `wallet-store.ts` / `WalletSecurityManager.ts` — DKG en vez de mnemonic; PIN protege el share.
- `apps/api/src/routes/txIntents.ts` — exec sobre Safe.
- `apps/api/src/routes/devices.ts` + `/api/wallet/backup` — resharing en vez de blob; deprecar backup de seed.
- `apps/web/lib/wallet/OperatorWalletManager.ts` — operadores sin HD; funding del Safe.

## 8. Verificación

1. **Por estrato en testnet Amoy** antes de avanzar:
   - (a) Safe deployado, Zodiac Roles aplicado, cashier no puede mover fondos,
     manager ejecuta un refund dentro del cap y es rechazado fuera del cap.
   - (b) DKG produce una pubkey; firma 2-of-3 verifica; firma con 1 share falla;
     refresh rota shares manteniendo la pubkey; tests unitarios del motor MPC.
   - (c) `signIntent` firma una Safe tx vía MPC y ejecuta; un device solo no
     puede firmar; el server solo no puede firmar.
   - (d) cashier/manager operan vía roles Zodiac sin HD derivation.
   - (e) dry-run de migración de un business de prueba: fondos barridos, saldos
     cuadran, proceso pausable/reversible.
2. **tsc + lint + unit + integration** verdes en web/api/shared por estrato.
3. **Threat-model walkthrough:** validar cada fila de §5 con un test o un
   argumento explícito.
4. **E2E manual** (docker, aislado de Supabase como en Fase 2): onboarding con
   DKG → cobro al Safe → refund por manager → recovery de device perdido.

## 9. Fuera de alcance (Fase 3)

- HD bajo MPC para el owner (diferido).
- Soporte multi-chain (sigue Polygon-only).
- Hardware wallet / WalletConnect (open areas del roadmap, no acá).

## 10. Riesgos

- **Lib MPC:** la familia threshold-ECDSA tuvo CVEs reales (TSSHOCK en GG18/20).
  Elegir una implementación de DKLs23/CGGMP21 **auditada y activamente
  mantenida**; fijar versión; revisar el audit antes de (b). Si no hay una lib
  open-source suficientemente sólida, reconsiderar el fork SDK/vendor (Silence
  Labs / dfns) como 1 de los 3 shares.
- **WASM en browser:** tamaño del bundle, performance de la ceremonia, soporte
  de devices. Medir en (b).
- **Migración de fondos (§4.F):** es la operación más delicada; runbook con
  rollback y verificación de saldos, por business, nunca en lote.
- **Gas/UX del Safe:** `execTransaction` cuesta más que una tx EOA; evaluar
  relayer/paymaster si el funding por-Safe es molesto.
- **Timeline:** "meses, no semanas". El orden estratificado permite cortar y
  entregar valor incremental (a→b→c) aunque (d)/(e) se demoren.
