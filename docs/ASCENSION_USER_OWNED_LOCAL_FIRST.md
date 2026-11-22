# ASCENSION — User-owned Knowledgeverse (local-first foundation)

## Binding owner design

**Book = Library Card. Tree = knowledge container. Groundskeeper = persistent speaking guide. Each crystal = an intent that continues developing.** The exact approved composite image remains byte-for-byte unchanged at `public/approved-scene/ascension-exact-approved-scene.png`. No old four-model pathway chooser, new scenery, new account requirement, or old computer dependency.

### Where data and computing happen

| Environment | Crystal storage | Computation | While page is closed |
|---|---|---|---|
| Modern desktop browser | **IndexedDB on that user's device**, record contents encrypted with device-generated non-extractable AES-GCM key | Optional same-computer Python companion connecting only to **installed local Ollama** | Companion continues only while the computer and companion are running |
| iPad/iPhone/Android browser | IndexedDB on that mobile device (subject to system storage/eviction limits) | Only locally supported speech/native browser capabilities; no local model is silently substituted | **Not guaranteed** — mobile OS can suspend or evict the browser |
| Desktop companion | `~/.ascension/knowledgeverse.sqlite3` owned by the current computer account | Python worker queues local-model drafts and repeats eligible intent-development cycles at most every 12h | Yes, while the companion and a local model keep running |

The browser's normal intent-crystal flow remains **device-owned and private**. Simply opening the Book, speaking an intent, or returning to a saved crystal does **not submit it to ASCENSION's governed server**. The optional on-device computation endpoint is `127.0.0.1:8788`. The local companion binds only to that loopback address and accepts browser origins on localhost/127.0.0.1 ports 4174 and 8080. The companion never chooses or downloads remote models: it uses an actually installed Ollama model on the **current device**. If multiple are installed, specify `ASCENSION_DEVICE_MODEL`. If the companion or model is unavailable, the crystal remains safely saved in IndexedDB and **no result or "verified growth" is invented**.

### Owner-authorized original ASCENSION engine connection

While the Book/Tree is open, **explicitly say "run ASCENSION's engines"** to send the **currently selected original intent** to the existing configured governed ASCENSION submission interface. This is a separate, **owner-initiated server request**: the selected original invention text leaves the browser only on that explicit command; it is not a routine local-first operation. If no original owner/hybrid runtime is configured or reachable, the UI reports the error and keeps the local encrypted crystal unchanged. There is **no fallback to paid models, new cloud service, or retired computer**. No new sign-in page or UI artwork is added.

The Tree uses the **original authorized guest run ID and guest token** to fetch the recorded status and delivery. When a real four-result delivery exists it speaks the actual three pathways and **BLEND** and waits for voice selection (for example, **"choose BLEND"**). If only one or three real results arrived, it reports those truthfully rather than inventing missing pathways. After selecting a real result, the Tree can display the delivered **actual** picture, blueprint, or GLB, and describe the delivered components. Spoken subsequent design changes continue **that exact authorized parent request** rather than starting an unrelated run or overriding the original private crystal. **No real asset means no invented asset or dimension.**

This voice connection requires a working configured governed runtime and genuine results; installing only the front end does not start or repair an unavailable engine. The guest credentials and governed result choice remain in the open browser tab's memory; this version does **not** yet persist governed result snapshots into encrypted device backups or provide reauthorization/resume after tab closure. A governed status is **not** silently converted into device-verified growth or proof of physical testing. The approved image, device storage, Library Card synchronization, and hosting are unchanged.

### Owner's launch (development build, not a packaged app)

On a computer with Node.js, Python 3, and the ASCENSION repository installed:

```sh
npm install
npm run dev:device
```

This opens ASCENSION at `http://127.0.0.1:4174` and starts the optional local companion on `127.0.0.1:8788`. To generate model drafts, install and run Ollama with a local model on **that same computer**. No user is told to reconnect the retired old computer. Closing the terminal stops the local companion; keeping it running is necessary for development between visits.

### Important truth and privacy boundaries

- **Locally generated model text is an unverified draft**, not a scientifically verified discovery, a physical prototype or a governed ASCENSION transaction. Drafts do not increment `verifiedGrowthCount`. The Tree must never be animated to claim unsupported advances.
- The browser encrypts its crystal records using WebCrypto + IndexedDB, but the key is local to that browser profile. Clearing site data can destroy both key and records. **Portable encrypted Library Card archives can now be exported and restored by the owner.** When the desktop companion is running, its previously unsynchronized completed job history is included too. If it is unavailable, the app explicitly reports a browser-only archive.
- **The Python companion's SQLite database is currently not application-encrypted.** Use full-disk encryption and normal OS account security for the computer. Do not treat browser encryption as applying to the companion's files.
- A web origin that can execute malicious JavaScript can access the browser-origin encryption key through the app runtime; origin security and trusted code remain necessary.
- Cross-device login/authentication is **not implemented**. Owner-chosen encrypted shared-folder exchange is supported where the browser grants native folder permission; each browser retains its own Library Card capability and encryption key. **No central knowledge database exists or is automatically uploaded to.**
- The previously created **server-hosted crystal archives are not deleted or overwritten**. Automatic migration has not occurred; doing so requires an explicit, safe import mechanism.
- Browser speech recognition is restricted to **`processLocally = true`**. If offline recognition or a locally installed English voice is unavailable, a text input is offered instead of silently sending microphone audio to a cloud speech service.
- Desktop local AI operation **does not mean the groundskeeper's approved static picture is lip-synced** or that browser-side physics/3D generation has been implemented.

### Portable encrypted Library Card backup (owner-controlled)

Once inside ASCENSION, say **"back up my Library Card"** or type that command in the optional private text input. A temporary passphrase form appears; enter a private passphrase twice (12–256 characters). The app synchronizes available **local** companion drafts, reads any additional finished history directly from its localhost SQLite companion (when running), then encrypts both local records and finished history **in the browser** using PBKDF2-HMAC-SHA-256 (310,000 iterations, 128-bit random salt) and AES-256-GCM (96-bit random IV). The downloaded file is named `ASCENSION-Library-Card-YYYY-MM-DD.ascension`. The archive contains no plaintext inventions or transferable Library Card capability. No server or cloud upload is made.

To recover on another device, say **"restore my Library Card"** and select that `.ascension` file. Enter the original passphrase **privately**. The receiving browser authenticates the complete archive and validates all crystal/draft records **before changing any local data**. It then encrypts the recovered data under its own fresh non-exportable AES key and its own local Library Card capability. New crystals are added atomically. For an existing matching intent, only missing historical drafts are added; original owner wording and existing drafts are never overwritten. Conflicting identities or different content with an existing job ID abort the import. If a new computer's localhost companion is active, its finished SQLite job history is also imported without restarting pending work.

Safety boundaries:
- **Keep your archive and passphrase:** the passphrase is not stored or recoverable by ASCENSION.
- **A saved archive is a point-in-time snapshot**, not automatic sync. You control how it travels between devices; no hosted account is created.
- The encrypted file includes **the desktop companion's completed and blocked job history** when its localhost service is available during export, including developments created while the browser was closed. Pending or running jobs are never restored as active work. If the companion is offline, the user is told the archive covers browser-saved records only. The encrypted archive is not an unfiltered raw SQLite file; it preserves finished work and owner intents while excluding transient runtime state.
- Browser-local encryption and passphrase encryption are separate. Neither provides full disk protection or protection against malicious code running in the same application origin.
- Archives are limited to 64 MB; the app refuses oversized files rather than processing them without bounds.
- Imported model drafts remain **unverified**, not governed proof. Imported pending-job identifiers are cleared, not executed as current tasks.
- Existing crystals are not overwritten. New, previously unseen historical drafts may be added after validation and atomic conflict checks; the import report distinguishes added crystals, previously present records and newly merged history. Incompatible originals or histories are rejected.

### Owner-controlled encrypted device-to-device folder exchange

In supported desktop browsers, the Groundskeeper now understands **"sync my Library Card"**. The owner chooses a **private directory using the native folder permission dialog**, such as a folder on a user-controlled home LAN share, mounted drive, or removable disk. The owner enters the **same private archive passphrase** on each device. ASCENSION does not choose a host, relay, account, cloud provider or external database.

The existing AES-256-GCM/PBKDF2 encrypted Library Card backup format is used unmodified. Each browser generates its **own random local sync device UUID** and writes only its own `ASCENSION-Private-Sync-{device-id}.ascension` file into the selected folder. Other devices' files are read, authenticated, and merged additively into the device's **own encrypted IndexedDB**. Original intent wording is never replaced, competing versions of the same development ID cause an error, and historical drafts never count as governed verification. The owner can say **"stop syncing"** to end the exchange.

**Execution and availability boundaries:**
- The browser exchanges peer archives on first pairing and approximately every three minutes **while the ASCENSION tab is open and visible**. Background browser timers cannot be trusted after closure; the separately paired desktop worker described below is required for browser-closed exchange.
- The folder is explicitly selected and permissions granted by the user. **No folder path, passphrase or derived encryption key is sent to ASCENSION servers.** The browser passphrase stays in the active browser-session memory. When the optional desktop worker is paired, it separately retains the passphrase only in running-process memory; restart pairing after stopping the local companion.
- Both devices must have access to **the same owner-selected folder**. For a removable disk, this is sequential transfer, not simultaneous live synchronization. For a private local-network share, it can converge when both devices run the app and can reach the share.
- Native folder access (File System Access API) varies by browser and operating system. When unavailable, the existing **encrypted manual backup/restore** is the supported fallback. Mobile browsers are not promised uninterrupted folder synchronization.
- This is **not an Internet relay** and makes no remote storage available automatically. If the owner deliberately chooses a folder synchronized by some outside provider, that provider may transport the **encrypted** archives; ASCENSION does not activate one.
- Each device has a uniquely named archive so peers do not overwrite each other's files. Peer archives require the shared passphrase; corrupted or wrong-password files fail authentication rather than silently replacing a user's original knowledge.
- The transfer uses bounded peer counts and archive sizes. It is an additive history exchange, not a general-purpose file mirror; conflicts are surfaced and are never silently resolved by discarding an existing original.
- Finished SQLite-companion history is included when that local companion is running during an export, but **background work completed after the browser is closed is exchanged by the optional paired desktop worker while that local worker keeps running**. Without that worker, the browser must reopen before exchange.

**Browser verification:** `node tests/device-folder-sync.browser.mjs` tests independent browser profiles converging through a shared-folder stand-in, with real AES-GCM/IndexedDB, wrong-passphrase rejection, ciphertext tampering, original retention, idempotency and no plaintext leakage. Real native folder-picker and LAN share tests still require owner-device acceptance.

### Optional desktop background Library Card exchange (owner-paired)

**After the browser closes:** On a supported desktop running ASCENSION's **local** Python/Node companion, the private folder can continue exchanging its encrypted archives approximately every three minutes even when no ASCENSION browser tab is open. This reuses PR #92's encrypted archive format and additive/immutable-original merge rules. The process can include fresh completed SQLite-companion developments without reopening the page. Browser IndexedDB is **not** accessible to a closed browser; new peer data becomes visible in that browser on the owner's next folder synchronization. Drafts remain **unverified**.

To activate, first run the existing local desktop launcher (npm run dev:device), say **"sync my Library Card"**, choose the shared folder in the native permission dialog, and enter the same private passphrase used on the other device. **Optionally** enter the *absolute desktop path to that same folder* in the temporary pairing form. The companion verifies that the two folder selections match by reading an ephemeral random marker written by the browser. Only then does it launch a private Node worker. The worker uses an independently named .ascension archive so the browser and worker never overwrite each other's files. No central service, new hosting, or external account is required.

Privacy and operating limits:
- The passphrase and current browser Library Card capability are delivered **once over local loopback** to the desktop companion and forwarded to its worker through process stdin. They exist only in the running worker's memory, **not** in command-line arguments, environment variables, cloud storage, settings, a plaintext file or the shared folder. Folder archives remain AES-256-GCM/PBKDF2 encrypted.
- **"Stop syncing"** from the running local browser stops both the browser exchange and that local companion worker. Closing the tab alone does *not* stop the worker. Stopping the local companion/terminal, signing out of the computer, rebooting, losing share access or powering off the computer stops unattended exchange. Pair again on the next local companion session; there is no persistent passphrase or auto-resume after reboot.
- Only the explicitly selected shared directory is exchanged. The companion requires the owner to supply the desktop's path separately because browser folder permissions **do not expose the full OS path**. A path mismatch rejects pairing instead of silently using another location.
- One running desktop computer must be able to access the selected folder for exchange. An unmounted drive, isolated devices or a powered-off machine cannot transfer files. Mobile browsers without compatible native directory permissions continue to use manual encrypted backup/restore.
- The companion is a **local development launcher**, not a packaged background operating-system service. A "started" signal is not proof of real LAN/native-device synchronization. Those tests and background restart/permissions acceptance still require physical owner devices.
- Background conflicts, tampered archives, wrong passphrases and exceeded archive limits reject the exchange. No peer archive or original intent is overwritten to make a mismatch disappear.
- This change has **no Fly/hosted deployment**, connection to a retired computer, change to the owner-approved Tree/Book artwork, or automatic installation on an owner's computer.

**Automated verification:** node --test tests/device-background-sync.test.mjs validates two encrypted desktop archive workers, convergence and replay, new finished local companion developments while browsers are closed, wrong-passphrase and ciphertext-tampering refusal, and original intent conflicts. The GitHub device-local-first workflow also runs the existing independent Chromium two-device synchronization tests. Real native shared-folder acceptance remains outstanding.

### Actual owner-device private shared-folder acceptance

This test is available **only when the owner chooses to run it**. On TWO desktop computers that have Node.js 22+ and this ASCENSION repository, open a terminal in the repository and run the SAME command on each computer:

```sh
node scripts/accept-private-library-share.mjs
```

Each device is prompted for its own absolute path to the **same private shared directory** (paths can differ on different machines). The first device creates an isolated, uniquely named `.ascension-owner-acceptance-...` test subfolder, then displays a **temporary, randomly generated, test-only code**. Leave the first test running while running the command on the second computer; enter the temporary code on the second computer. Do **not** enter the real Library Card passphrase or any original intentions. No account or remote connection is needed.

Both devices verify **encrypted two-device archive convergence**, immutability of their original synthetic intentions, repeat import safety, and no false verified-growth claims. Each device writes a non-sensitive `host-report.json` or `join-report.json` into that **test subfolder**. The test deliberately leaves the isolated subfolder for inspection and does **not** alter, delete, rename, or read any existing `ASCENSION-Private-Sync-*.ascension` files from the root shared folder. Test results and the synthetic code are never uploaded by ASCENSION.

This is a physical **shared-file visibility and archive exchange** acceptance test, not a demonstration that the tablet/mobile browser supports OS-directory permissions, and not a guarantee of a permanently running OS service. The real Python+Node closed-browser process lifecycle is covered separately by the Windows/Linux companion tests. No owner device has been tested until the owner runs this command on both actual computers; never mark this physical-device acceptance requirement complete based only on GitHub CI.

### Background growth

The desktop worker reuses each exact original intent, keeps the original owner specifications intact, explores potential connections/limitations, and saves a separate unverified draft per completed locally generated response. It does not perform external research, claim physical testing, or change owner-approved designs. At most two scheduled continuations are queued per scheduler pass and no intent is automatically queued more than once in 12 hours.

Set `ASCENSION_DEVICE_AUTOGROW=false` to disable local background continuation. Existing server-side crystal-growth scheduler is now **off by default**, unless explicitly enabled with `ASCENSION_ENABLE_CRYSTAL_EVOLUTION=true`. This repository change does **not** deploy to Fly, relink any old machine, purchase API resources, or initiate any cloud AI.

### Verification

- `python3 -m unittest discover -s tests -p test_device_companion.py -v` proves local SQL persistence, crash recovery, absence of hidden remote model URL, and bounded continuation behavior.
- `node tests/crystal-experience.test.mjs` checks that the front page uses device storage exclusively and preserves the exact approved asset.
- `npm run test:interface`, `npm run build`, `npx tsc --noEmit` verify existing application compatibility.
- Portable archive encryption, cross-browser restore and data-integrity handling are covered by the Chromium browser test. **Production device recovery, model inference, and full 24/7 operation remain subject to actual device testing.** A companion-inclusive archive requires its local service to be reachable during backup; the browser cannot guarantee recovery of unsynchronized work from a computer that is already lost or offline. Build checks alone do not establish end-to-end live operation.
