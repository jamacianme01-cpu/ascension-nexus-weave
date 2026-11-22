import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  chooseOwnerSyncFolder, supportsFolderSync,
  type DeviceSyncFolder, type SyncSummary,
} from "@/lib/ascension/device-folder-sync";
import "./library-backup-dialog.css";

/**
 * Appears only on the owner's spoken/typed "sync my Library Card" request.
 * Folder access must be granted by a direct user click. Password is kept in
 * memory for this open-page session only, never placed in localStorage.
 */
export function LibrarySyncDialog({
  active, onStart, onStop, onClose,
}: {
  active: boolean;
  onStart: (folder: DeviceSyncFolder, passphrase: string, desktopPath?: string) => Promise<SyncSummary & { backgroundActive?: boolean; backgroundError?: string }>;
  onStop: () => Promise<void>;
  onClose: () => void;
}) {
  const [folder, setFolder] = useState<DeviceSyncFolder | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [desktopPath, setDesktopPath] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const supported = supportsFolderSync();
  useEffect(() => { field.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, running]);

  async function choose() {
    setError("");
    setStatus("");
    try {
      // This call is reached synchronously from the user's click gesture.
      const picked = await chooseOwnerSyncFolder();
      setFolder(picked);
    } catch (cause) {
      const error = cause as Error;
      if (error?.name !== "AbortError")
        setError(error?.message || "The chosen folder was unavailable.");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folder) { setError("Choose your own shared folder first."); return; }
    if (passphrase.length < 12 || passphrase.length > 256) {
      setError("Use the same private 12–256-character passphrase on each device.");
      return;
    }
    setRunning(true);
    setError("");
    setStatus("");
    try {
      const result = await onStart(folder, passphrase, desktopPath.trim() || undefined);
      setPassphrase("");
      setStatus(
        (result.backgroundActive
          ? "Desktop background exchange is active while the local companion runs. "
          : "Encrypted folder sync is active while this page is open. ") +
        result.peersRead + " peer archives processed; " +
        result.importedCrystals + " new crystals and " +
        result.mergedDrafts + " missing developments restored." +
        (result.backgroundError ? " Desktop background pairing failed: " + result.backgroundError : "")
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Encrypted folder sync could not start.");
    } finally {
      setRunning(false);
    }
  }
  return <div className="ascension-backup-shade" role="presentation">
    <section className="ascension-backup-dialog" role="dialog" aria-modal="true"
      aria-labelledby="ascension-sync-title" aria-describedby="ascension-sync-description">
      <h2 id="ascension-sync-title">Connect your own Library Cards</h2>
      <p id="ascension-sync-description">
        Choose the same private folder on each of your devices, such as a network
        share or removable drive. Each device writes a separate encrypted
        Library Card archive. No ASCENSION cloud account is involved.
      </p>
      {supported ? <form onSubmit={event => { void submit(event); }}>
        <button type="button" disabled={running} onClick={() => { void choose(); }}>
          Choose my private folder
        </button>
        {folder && <p role="status">Folder permission granted for this session.</p>}
        <label>
          Shared private archive passphrase
          <input ref={field} type="password" autoComplete="off"
            minLength={12} maxLength={256} required
            value={passphrase} onChange={event => setPassphrase(event.target.value)}
            disabled={running || active}/>
        </label>
        <label>
          Desktop companion (optional): absolute path to the same chosen folder
          <input type="text" autoComplete="off" maxLength={1024}
            placeholder="Full local path to your private shared folder"
            value={desktopPath} onChange={event => setDesktopPath(event.target.value)}
            disabled={running || active}/>
        </label>
        <p className="ascension-backup-caution">
          Use the same passphrase on your other device. It is sent only to your
          locally running desktop companion when a desktop folder path is provided,
          held in memory, and never saved to a server or file. The companion can
          exchange encrypted developments after the browser closes while that
          computer remains on and the companion runs. Otherwise, synchronization
          works only while this browser is open. Do not speak your passphrase aloud.
        </p>
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
        <div className="ascension-backup-actions">
          <button type="button" disabled={running} onClick={onClose}>Close</button>
          {active
            ? <button type="button" disabled={running} onClick={() => {
              void onStop().then(() => setStatus("This device's encrypted folder sync has stopped."))
                .catch(cause => setError(cause instanceof Error ? cause.message : "Could not stop the desktop background exchange."));
            }}>Stop folder sync</button>
            : <button type="submit" disabled={running || !folder}>
              {running ? "Synchronizing…" : "Start private folder sync"}
            </button>}
        </div>
      </form> : <>
        <p role="status">
          This browser does not support owner-selected folder access. Your
          encrypted Library Card export and restore still work.
        </p>
        <div className="ascension-backup-actions">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </>}
    </section>
  </div>;
}
