import { useEffect, useState, type CSSProperties } from "react";
import "./living-tree.css";

type State = "welcome" | "listening" | "creating" | "revealed";
type Props = { state: State; verifiedRevision?: number | null };

/**
 * The owner's TWO approved photographs are a single character:
 *  1. Green Tree woman greeting/accepting spoken intent (close-up).
 *  2. The SAME woman with open tree arms, revealing the work.
 *
 * They must be copied unchanged from the owner-approved originals.
 * Missing files never silently substitute a different woman or a cartoon.
 */
export const TREE_PORTRAIT = "/approved-scene/tree-of-knowledge-green-intent.png";
export const TREE_REVEAL = "/approved-scene/tree-of-knowledge-green-reveal.png";

export function LivingTree({ state, verifiedRevision = null }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const [voicePulse, setVoicePulse] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    const speech = (event: Event) => {
      const detail = (event as CustomEvent<{ speaking: boolean }>).detail;
      setSpeaking(Boolean(detail?.speaking));
    };
    const syllable = () => setVoicePulse(p => p + 1);
    window.addEventListener("ascension-tree-speech", speech);
    window.addEventListener("ascension-tree-syllable", syllable);
    return () => {
      window.removeEventListener("ascension-tree-speech", speech);
      window.removeEventListener("ascension-tree-syllable", syllable);
    };
  }, []);

  const revealed = state === "creating" || state === "revealed";
  // This number comes only from an actual governed runtime revision. It does
  // not claim a simulated leaf represents a newly verified invention.
  const hasVerifiedWork = typeof verifiedRevision === "number" && verifiedRevision > 0;
  const missingImage = (source: string) =>
    setMissing(previous => previous.includes(source) ? previous : [...previous, source]);

  return <div className="living-tree" data-tree-state={state} data-tree-speaking={speaking}
    aria-label="Tree of Knowledge; the same woman welcomes you and opens her arms after your intent">
    <img className="living-tree-portrait" src={TREE_PORTRAIT} alt=""
      draggable={false} onError={() => missingImage("portrait")} />
    <img className="living-tree-reveal" src={TREE_REVEAL} alt=""
      draggable={false} onError={() => missingImage("reveal")} />
    {/* The mouth is a feather-small crop of the SAME photograph, not a new
        face or animated cartoon. Word boundaries drive subtle movement.
        Full phoneme-accurate lip sync requires a separate approved face rig. */}
    <img className="living-tree-mouth living-tree-close-mouth" src={TREE_PORTRAIT} alt=""
      draggable={false} aria-hidden="true" />
    <img className="living-tree-mouth living-tree-open-mouth" src={TREE_REVEAL} alt=""
      draggable={false} aria-hidden="true" />
    <span className="living-tree-breath" aria-hidden="true" />
    <span className="living-tree-gold" aria-hidden="true" data-verified={hasVerifiedWork} />
    <div className="living-tree-expression" data-speaking={speaking} aria-hidden="true"
      style={{ "--voice-pulse": voicePulse % 2 } as CSSProperties} />
    {missing.length > 0 && <p className="living-tree-image-missing" role="status">
      Approved Tree portrait/reveal artwork is not installed. Use the original approved images; do not replace the character.
    </p>}
    {hasVerifiedWork && <span className="sr-only">
      Original ASCENSION governed runtime revision {verifiedRevision} is present.
    </span>}
    {revealed && <span className="sr-only">The Tree has opened her arms to reveal the generation.</span>}
  </div>;
}
