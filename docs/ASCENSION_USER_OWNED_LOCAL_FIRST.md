# ASCENSION — User-owned Knowledgeverse (local-first foundation)

## Binding owner design

**Book = Library Card. Tree = knowledge container. Groundskeeper = persistent speaking guide. Each crystal = an intent that continues developing.** The exact approved composite image remains byte-for-byte unchanged at `public/approved-scene/ascension-exact-approved-scene.png`. No old four-model pathway chooser, new scenery, new account requirement, or old computer dependency.

### Where data and computing happen

| Environment | Crystal storage | Computation | While page is closed |
|---|---|---|---|
| Modern desktop browser | **IndexedDB on that user's device**, record contents encrypted with device-generated non-extractable AES-GCM key | Optional same-computer Python companion connecting only to **installed local Ollama** | Companion continues only while the computer and companion are running |
| iPad/iPhone/Android browser | IndexedDB on that mobile device (subject to system storage/eviction limits) | Only locally supported speech/native browser capabilities; no local model is silently substituted | **Not guaranteed** — mobile OS can suspend or evict the browser |
| Desktop companion | `~/.ascension/knowledgeverse.sqlite3` owned by the current computer account | Python worker queues local-model drafts and repeats eligible intent-development cycles at most every 12h | Yes, while the companion and a local model keep running |

The browser's new intent-crystal flow uses **no ASCENSION server API** for saving, reading, or submitting objectives. The only optional computation endpoint is `127.0.0.1:8788`. The companion binds only to that loopback address and accepts browser origins on localhost/127.0.0.1 ports 4174 and 8080. The companion never chooses or downloads remote models: it uses an actually installed Ollama model on the **current device**. If multiple are installed, specify `ASCENSION_DEVICE_MODEL`. If the companion or model is unavailable, the crystal remains safely saved in IndexedDB and **no result or "verified growth" is invented**.

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
- Cross-device Library Card authentication/synchronization is **not yet implemented**. The browser Library Card is specific to its origin and device. Nothing is automatically uploaded to a central knowledge database.
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

### Background growth

The desktop worker reuses each exact original intent, keeps the original owner specifications intact, explores potential connections/limitations, and saves a separate unverified draft per completed locally generated response. It does not perform external research, claim physical testing, or change owner-approved designs. At most two scheduled continuations are queued per scheduler pass and no intent is automatically queued more than once in 12 hours.

Set `ASCENSION_DEVICE_AUTOGROW=false` to disable local background continuation. Existing server-side crystal-growth scheduler is now **off by default**, unless explicitly enabled with `ASCENSION_ENABLE_CRYSTAL_EVOLUTION=true`. This repository change does **not** deploy to Fly, relink any old machine, purchase API resources, or initiate any cloud AI.

### Verification

- `python3 -m unittest discover -s tests -p test_device_companion.py -v` proves local SQL persistence, crash recovery, absence of hidden remote model URL, and bounded continuation behavior.
- `node tests/crystal-experience.test.mjs` checks that the front page uses device storage exclusively and preserves the exact approved asset.
- `npm run test:interface`, `npm run build`, `npx tsc --noEmit` verify existing application compatibility.
- Portable archive encryption, cross-browser restore and data-integrity handling are covered by the Chromium browser test. **Production device recovery, model inference, and full 24/7 operation remain subject to actual device testing.** A companion-inclusive archive requires its local service to be reachable during backup; the browser cannot guarantee recovery of unsynchronized work from a computer that is already lost or offline. Build checks alone do not establish end-to-end live operation.
