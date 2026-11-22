import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createEncryptedLibraryBackup,
  restoreEncryptedLibraryBackup,
  encryptedLibraryBackupFilename,
} from "@/lib/ascension/device-backup";
import "./library-backup-dialog.css";

type Mode = "export" | "import";

export function LibraryBackupDialog({
  mode, beforeExport, onRestored, onClose,
}: {
  mode: Mode;
  beforeExport: () => Promise<unknown>;
  onRestored: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => { firstField.current?.focus(); }, []);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [onClose, running]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    if (passphrase.length < 12 || passphrase.length > 256) {
      setError("Enter a passphrase of 12–256 characters.");
      return;
    }
    if (mode === "export" && passphrase !== confirmation) {
      setError("The two passphrases do not match.");
      return;
    }
    if (mode === "import" && (!file || file.size > 64 * 1024 * 1024)) {
      setError("Select a Library Card archive no larger than 64 MB.");
      return;
    }
    setRunning(true);
    setError("");
    setResult("");
    try {
      if (mode === "export") {
        await beforeExport();
        const encrypted = await createEncryptedLibraryBackup(passphrase);
        const url = URL.createObjectURL(encrypted);
        try {
          const a = document.createElement("a");
          a.href = url;
          a.download = encryptedLibraryBackupFilename();
          document.body.appendChild(a);
          a.click();
          a.remove();
          setResult("Encrypted archive prepared. Save your downloaded file and passphrase somewhere you control. They are both required to restore your Library Card.");
        } finally {
          window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
      } else if (file) {
        const restored = await restoreEncryptedLibraryBackup(await file.text(), passphrase);
        await onRestored();
        setResult(
          restored.imported + " intent crystals restored. " +
          restored.skipped + " already saved originals left unchanged. " +
          "Only your current device can read the newly encrypted local records."
        );
      }
      // Do not retain a password in input state after the action completes.
      setPassphrase("");
      setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Library Card archive operation failed.");
    } finally {
      setRunning(false);
    }
  }
  return <div className="ascension-backup-shade" role="presentation">
    <section className="ascension-backup-dialog" role="dialog" aria-modal="true"
      aria-labelledby="ascension-backup-title" aria-describedby="ascension-backup-description">
      <h2 id="ascension-backup-title">
        {mode === "export" ? "Protect your Library Card" : "Restore your Library Card"}
      </h2>
      <p id="ascension-backup-description">
        {mode === "export"
          ? "Your saved intents and locally recorded developments will be encrypted into a file on this device. No cloud upload."
          : "Choose an encrypted ASCENSION archive and enter its passphrase. Existing intent crystals will not be overwritten."}
      </p>
      <form onSubmit={event => { void submit(event); }}>
        {mode === "import" && <label>
          Encrypted Library Card file
          <input type="file" accept=".ascension,application/octet-stream" required
            disabled={running} onChange={event => setFile(event.target.files?.[0] ?? null)}/>
        </label>}
        <label>
          {mode === "export" ? "Create a private passphrase" : "Archive passphrase"}
          <input ref={firstField} type="password" autoComplete="off"
            minLength={12} maxLength={256} required
            value={passphrase} onChange={event => setPassphrase(event.target.value)}
            disabled={running}/>
        </label>
        {mode === "export" && <label>
          Confirm private passphrase
          <input type="password" autoComplete="off" minLength={12} maxLength={256}
            required disabled={running}
            value={confirmation} onChange={event => setConfirmation(event.target.value)}/>
        </label>}
        <p className="ascension-backup-caution">
          Do not speak your passphrase aloud. If you lose both the original device
          and the archive passphrase, the encrypted backup cannot be recovered.
        </p>
        {error && <p role="alert">{error}</p>}
        {result && <p role="status">{result}</p>}
        <div className="ascension-backup-actions">
          <button type="button" disabled={running} onClick={onClose}>Close</button>
          <button type="submit" disabled={running || Boolean(result)}>
            {running ? "Securing…" : mode === "export" ? "Create encrypted backup" : "Restore without overwriting"}
          </button>
        </div>
      </form>
    </section>
  </div>;
}
