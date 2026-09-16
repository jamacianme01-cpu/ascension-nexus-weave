const coreEngines = [
  "Spiral",
  "Analyzer",
  "Projector",
  "Outcome Predictor",
  "Confidence Engine",
  "Guardian",
  "AutoSync",
  "Knowledge Retrieval / Akashic",
  "Hypothesis / Contradiction / Emergence",
  "Identity Finder",
  "Composition",
  "Alchemy",
];

const executionEngines = [
  "Software",
  "Documents",
  "Image",
  "CAD",
  "Simulation",
  "Box Design",
  "Video",
  "Music",
  "Web",
  "Database",
  "Robot",
  "Printer",
  "Drone",
  "Hunyuan3D",
];

const epistemic = [
  "Possible",
  "Simulated",
  "Recommended",
  "Selected",
  "Executed",
  "Verified",
  "Persisted",
];

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs text-foreground/90">
      {children}
    </span>
  );
}

function Layer({
  title,
  subtitle,
  children,
  gold = false,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${gold ? "border-gold/35 bg-gold/5" : "border-primary/25 bg-primary/5"}`}>
      <p className={`font-display text-sm tracking-[0.18em] uppercase ${gold ? "text-gold" : "text-primary"}`}>{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SystemArchitecture() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gold/30 bg-void/85">
        <div className="border-b border-gold/15 px-5 py-5 sm:px-7">
          <p className="label-eyebrow text-gold">ASCENSION ARCHITECTURE</p>
          <h1 className="mt-2 font-display text-2xl tracking-[0.16em] text-foreground sm:text-3xl">
            CLARITY → ASCENSION → KNOWLEDGEVERSE
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            The operating architecture, not a placeholder diagram. Objective enters through the Book, Meaning Elements are resolved,
            possible futures are simulated and governed, execution is delegated to the correct engine, AutoSync verifies the result,
            verified Δ is persisted, and the Knowledgeverse evolves.
          </p>
        </div>

        <svg viewBox="0 0 1200 640" className="block h-auto w-full" role="img" aria-label="ASCENSION architecture showing CLARITY orchestration, ASCENSION runtime, OMNI mediator, governed engines, execution engines, verified delta and Knowledgeverse">
          <defs>
            <radialGradient id="arch-bg" cx="50%" cy="50%" r="70%">
              <stop offset="0" stopColor="#113038" />
              <stop offset=".55" stopColor="#071720" />
              <stop offset="1" stopColor="#02070c" />
            </radialGradient>
            <linearGradient id="arch-flow" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#5de7df" />
              <stop offset="1" stopColor="#d7b46b" />
            </linearGradient>
            <filter id="arch-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect width="1200" height="640" fill="url(#arch-bg)" />

          <g fill="none" stroke="url(#arch-flow)" strokeWidth="3" strokeDasharray="12 10" opacity=".72" className="asc-arch-flow">
            <path d="M190 320 H340" />
            <path d="M520 320 H650" />
            <path d="M830 320 H1010" />
            <path d="M735 248 V155" />
            <path d="M735 392 V495" />
          </g>

          <g transform="translate(95 250)">
            <rect width="190" height="140" rx="24" fill="#0b2028" stroke="#d7b46b" strokeWidth="2" />
            <text x="95" y="42" textAnchor="middle" fill="#e7ca8e" fontSize="18" letterSpacing="3">BOOK</text>
            <text x="95" y="72" textAnchor="middle" fill="#d8e7e6" fontSize="13">Objective / Question</text>
            <text x="95" y="96" textAnchor="middle" fill="#7fa9a6" fontSize="11">Library Card context</text>
            <text x="95" y="116" textAnchor="middle" fill="#7fa9a6" fontSize="11">Evidence + constraints</text>
          </g>

          <g transform="translate(340 225)">
            <rect width="180" height="190" rx="30" fill="#0b2028" stroke="#62e6dd" strokeWidth="2" filter="url(#arch-glow)" />
            <text x="90" y="48" textAnchor="middle" fill="#82fff2" fontSize="19" letterSpacing="3">CLARITY</text>
            <text x="90" y="77" textAnchor="middle" fill="#c9dddd" fontSize="12">Orchestration</text>
            <text x="90" y="108" textAnchor="middle" fill="#7ea7a4" fontSize="11">Intent → ME decomposition</text>
            <text x="90" y="130" textAnchor="middle" fill="#7ea7a4" fontSize="11">Capability selection</text>
            <text x="90" y="152" textAnchor="middle" fill="#7ea7a4" fontSize="11">System intelligence</text>
          </g>

          <g transform="translate(650 205)">
            <rect width="180" height="230" rx="32" fill="#0c242b" stroke="#d7b46b" strokeWidth="2" filter="url(#arch-glow)" />
            <circle cx="90" cy="66" r="38" fill="#102f37" stroke="#82fff2" strokeWidth="2" />
            <circle cx="90" cy="66" r="13" fill="#e9ffff" />
            <text x="90" y="128" textAnchor="middle" fill="#e7ca8e" fontSize="20" letterSpacing="3">ASCENSION</text>
            <text x="90" y="154" textAnchor="middle" fill="#d8e7e6" fontSize="12">Reality Runtime</text>
            <text x="90" y="181" textAnchor="middle" fill="#7ea7a4" fontSize="11">OMNI mediator</text>
            <text x="90" y="203" textAnchor="middle" fill="#7ea7a4" fontSize="11">World Model + DTF</text>
          </g>

          <g transform="translate(1005 245)">
            <rect width="150" height="150" rx="28" fill="#0b2028" stroke="#62e6dd" strokeWidth="2" />
            <path d="M75 25 C43 53 50 82 75 110 C100 82 107 53 75 25 Z" fill="none" stroke="#82fff2" strokeWidth="3" />
            <text x="75" y="129" textAnchor="middle" fill="#d8e7e6" fontSize="13">KNOWLEDGEVERSE</text>
          </g>

          <g transform="translate(600 55)">
            <rect width="270" height="100" rx="22" fill="#091a21" stroke="#4d8f8b" strokeWidth="1.5" />
            <text x="135" y="34" textAnchor="middle" fill="#82fff2" fontSize="15" letterSpacing="2">GOVERNED INTELLIGENCE</text>
            <text x="135" y="60" textAnchor="middle" fill="#9fc0bd" fontSize="11">Guardian · Confidence · Contradiction</text>
            <text x="135" y="80" textAnchor="middle" fill="#9fc0bd" fontSize="11">Outcome Predictor · AutoSync · Analyzer</text>
          </g>

          <g transform="translate(575 495)">
            <rect width="320" height="105" rx="22" fill="#091a21" stroke="#8c7140" strokeWidth="1.5" />
            <text x="160" y="34" textAnchor="middle" fill="#e7ca8e" fontSize="15" letterSpacing="2">EXECUTION + VERIFICATION</text>
            <text x="160" y="61" textAnchor="middle" fill="#b9c9c8" fontSize="11">Software · CAD · Hunyuan3D · Image · Simulation</text>
            <text x="160" y="82" textAnchor="middle" fill="#b9c9c8" fontSize="11">Evidence → AutoSync → Verified Δ → Persistence</text>
          </g>

          <g fill="#d7b46b" filter="url(#arch-glow)">
            <circle cx="323" cy="320" r="4" />
            <circle cx="603" cy="320" r="4" />
            <circle cx="920" cy="320" r="4" />
          </g>
        </svg>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Layer title="CLARITY" subtitle="Orchestration and system intelligence. It resolves intent, Meaning Elements, relationships and capability selection before work is delegated.">
          <div className="flex flex-wrap gap-2">
            <Pill>Objective / Intent</Pill><Pill>ME decomposition</Pill><Pill>Capability selection</Pill><Pill>Relationship mapping</Pill>
          </div>
        </Layer>

        <Layer title="ASCENSION" subtitle="The operating system / reality runtime. It carries identity, World Model state, DTF branches, governance, execution, verification and persistence." gold>
          <div className="flex flex-wrap gap-2">
            <Pill>OMNI</Pill><Pill>World Model</Pill><Pill>DTF</Pill><Pill>Identity / SID</Pill><Pill>Knowledgeverse</Pill><Pill>Verified Δ</Pill>
          </div>
        </Layer>
      </div>

      <Layer title="CORE ENGINES" subtitle="These are working engines inside the ASCENSION stack; they are not decorative labels.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {coreEngines.map((name) => <div key={name} className="rounded-xl border border-primary/20 bg-background/20 px-4 py-3 text-sm text-foreground/90">{name}</div>)}
        </div>
      </Layer>

      <Layer title="EXECUTION ENGINE" subtitle="ASCENSION delegates to the engine that actually performs the selected work. Hunyuan3D is generative 3D; CAD remains dimension-critical mechanical geometry; Unreal remains world assembly/runtime." gold>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {executionEngines.map((name) => <div key={name} className="rounded-xl border border-gold/20 bg-gold/5 px-3 py-3 text-center text-xs text-foreground/90">{name}</div>)}
        </div>
      </Layer>

      <Layer title="EPISTEMIC CHAIN" subtitle="Nothing jumps from an idea directly to truth. ASCENSION keeps each state distinct until evidence earns persistence.">
        <div className="flex flex-wrap items-center gap-2">
          {epistemic.map((stage, index) => (
            <div key={stage} className="flex items-center gap-2">
              <span className={`rounded-full border px-4 py-2 text-sm ${stage === "Verified" || stage === "Persisted" ? "border-gold/45 bg-gold/10 text-gold" : "border-primary/30 bg-primary/5 text-primary"}`}>{stage}</span>
              {index < epistemic.length - 1 && <span className="text-muted-foreground">→</span>}
            </div>
          ))}
        </div>
      </Layer>

      <div className="grid gap-5 lg:grid-cols-3">
        <Layer title="IDENTITY" subtitle="ID preserves continuity. SID is the embodiment/signature used for the current experience.">
          <p className="text-sm text-foreground/90">Persistent ID → acquire SID → experience → Δ(K/W/U) → release SID → updated ID</p>
        </Layer>
        <Layer title="LIBRARY CARD" subtitle="Identity and developmental context carried into personalized objectives before the Book opens." gold>
          <p className="text-sm text-foreground/90">WHO · WHAT · WHY · Destiny · state · strengths · constraints · relationships · lineage · verified history</p>
        </Layer>
        <Layer title="KNOWLEDGEVERSE" subtitle="A living world that self-creates differently for each user from the shared authored core.">
          <p className="text-sm text-foreground/90">Destiny + ID/SID + Meaning Elements + relationships + history + verified Δ + interaction</p>
        </Layer>
      </div>

      <section className="rounded-2xl border border-gold/30 bg-gold/5 p-5 sm:p-6">
        <p className="font-display text-sm tracking-[0.18em] text-gold uppercase">GOVERNING LAWS</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            "All information is equal in existence; role emerges through relationship and context.",
            "Everything is connected.",
            "Evolution is key.",
            "ID accumulates the journey.",
            "SID determines the perspective.",
            "Δ records the transformation.",
            "ME preserves the meaning.",
          ].map((law, index) => (
            <div key={law} className="rounded-xl border border-gold/20 bg-background/20 px-4 py-3 text-sm text-foreground/90">
              <span className="mr-2 text-gold">{index + 1}.</span>{law}
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .asc-arch-flow { animation: asc-arch-dash 1.4s linear infinite; }
        @keyframes asc-arch-dash { to { stroke-dashoffset: -44; } }
        @media (prefers-reduced-motion: reduce) { .asc-arch-flow { animation: none !important; } }
      `}</style>
    </div>
  );
}
