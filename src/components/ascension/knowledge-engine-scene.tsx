export function KnowledgeEngineScene() {
  return (
    <section
      aria-label="ASCENSION energy to knowledge scene"
      className="overflow-hidden rounded-2xl border border-primary/25 bg-void/70"
    >
      <div className="border-b border-primary/15 px-5 py-4">
        <p className="label-eyebrow text-primary">LIVING SYSTEM</p>
        <h2 className="mt-2 font-display text-xl tracking-wide text-foreground">
          Engine → Prism → Tree → Knowledge
        </h2>
      </div>

      <svg
        viewBox="0 0 1200 720"
        className="block h-auto w-full"
        role="img"
        aria-label="Visible ASCENSION engines feed a charged decagonal prism, the prism powers the Tree of Knowledge through its roots, and knowledge erupts from the crown"
      >
        <defs>
          <radialGradient id="scene-bg" cx="50%" cy="44%" r="68%">
            <stop offset="0" stopColor="#10333a" stopOpacity=".92" />
            <stop offset=".52" stopColor="#071923" stopOpacity=".98" />
            <stop offset="1" stopColor="#030912" />
          </radialGradient>
          <linearGradient id="energy" x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#45e7df" />
            <stop offset=".55" stopColor="#9cf7ed" />
            <stop offset="1" stopColor="#d7b46b" />
          </linearGradient>
          <linearGradient id="tree-energy" x1="0" y1="1" x2="0" y2="0">
            <stop stopColor="#d7b46b" />
            <stop offset=".45" stopColor="#54d9d2" />
            <stop offset="1" stopColor="#b7fff2" />
          </linearGradient>
          <filter id="soft-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="hard-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="1200" height="720" fill="url(#scene-bg)" />

        <g opacity=".22" fill="none" stroke="#d7b46b">
          <ellipse cx="600" cy="378" rx="520" ry="285" />
          <ellipse cx="600" cy="378" rx="420" ry="238" />
          <path d="M90 590 Q600 690 1110 590" />
        </g>

        {/* LEFT ENGINE */}
        <g transform="translate(155 420)">
          <circle r="94" fill="#081922" stroke="#2a7778" strokeWidth="2" />
          <circle className="asc-engine-spin" r="67" fill="none" stroke="#50e4dd" strokeWidth="3" strokeDasharray="14 10" />
          <circle r="42" fill="#0d3038" stroke="#82fff2" strokeWidth="2" filter="url(#soft-glow)" />
          <path d="M0 -30 L26 -15 L26 15 L0 30 L-26 15 L-26 -15 Z" fill="#102b36" stroke="#b7fff2" strokeWidth="3" />
          <circle className="asc-engine-core" r="12" fill="#b7fff2" filter="url(#hard-glow)" />
          <text x="0" y="126" textAnchor="middle" fill="#dcebea" fontSize="18" letterSpacing="4">ENGINE I</text>
          <text x="0" y="149" textAnchor="middle" fill="#69bdb8" fontSize="11" letterSpacing="2">ACTIVE FIELD DRIVER</text>
        </g>

        {/* RIGHT ENGINE */}
        <g transform="translate(1045 420)">
          <circle r="94" fill="#081922" stroke="#2a7778" strokeWidth="2" />
          <circle className="asc-engine-spin-reverse" r="67" fill="none" stroke="#50e4dd" strokeWidth="3" strokeDasharray="14 10" />
          <circle r="42" fill="#0d3038" stroke="#82fff2" strokeWidth="2" filter="url(#soft-glow)" />
          <path d="M0 -30 L26 -15 L26 15 L0 30 L-26 15 L-26 -15 Z" fill="#102b36" stroke="#b7fff2" strokeWidth="3" />
          <circle className="asc-engine-core" r="12" fill="#b7fff2" filter="url(#hard-glow)" />
          <text x="0" y="126" textAnchor="middle" fill="#dcebea" fontSize="18" letterSpacing="4">ENGINE II</text>
          <text x="0" y="149" textAnchor="middle" fill="#69bdb8" fontSize="11" letterSpacing="2">ACTIVE FIELD DRIVER</text>
        </g>

        {/* ENGINE TO PRISM ENERGY */}
        <path className="asc-energy-line" d="M250 420 C360 420 415 495 510 520" fill="none" stroke="url(#energy)" strokeWidth="7" strokeLinecap="round" />
        <path className="asc-energy-line-delay" d="M950 420 C840 420 785 495 690 520" fill="none" stroke="url(#energy)" strokeWidth="7" strokeLinecap="round" />

        {/* DECAGONAL PRISM */}
        <g transform="translate(600 520)">
          <circle r="96" fill="#07151d" stroke="#6aa39c" strokeOpacity=".55" />
          <polygon
            points="0,-72 42,-58 68,-22 68,22 42,58 0,72 -42,58 -68,22 -68,-22 -42,-58"
            fill="#0e2932"
            stroke="#b7fff2"
            strokeWidth="3"
            filter="url(#soft-glow)"
          />
          <polygon
            className="asc-prism-charge"
            points="0,-51 30,-41 48,-16 48,16 30,41 0,51 -30,41 -48,16 -48,-16 -30,-41"
            fill="#44d9d0"
            fillOpacity=".18"
            stroke="#d7b46b"
            strokeWidth="2"
          />
          <path d="M0 -72 V72 M-68 -22 L68 22 M68 -22 L-68 22 M-42 -58 L42 58 M42 -58 L-42 58" stroke="#7ee9df" strokeOpacity=".34" />
          <circle className="asc-prism-core" r="14" fill="#fff1b8" filter="url(#hard-glow)" />
          <text x="0" y="122" textAnchor="middle" fill="#e8c77e" fontSize="18" letterSpacing="4">DECAGONAL PRISM</text>
          <text x="0" y="145" textAnchor="middle" fill="#8cb8b4" fontSize="11" letterSpacing="2">ENERGY / INFORMATION TRANSDUCER</text>
        </g>

        {/* PRISM TO ROOTS */}
        <path className="asc-root-feed" d="M600 446 C600 415 598 392 598 354" fill="none" stroke="url(#tree-energy)" strokeWidth="9" strokeLinecap="round" filter="url(#hard-glow)" />

        {/* TREE ROOTS */}
        <g fill="none" stroke="url(#tree-energy)" strokeLinecap="round">
          <path className="asc-tree-live" d="M600 354 C560 390 515 416 458 432" strokeWidth="6" />
          <path className="asc-tree-live-delay" d="M600 354 C642 388 690 414 747 430" strokeWidth="6" />
          <path className="asc-tree-live" d="M600 360 C565 423 545 466 528 510" strokeWidth="4" />
          <path className="asc-tree-live-delay" d="M600 360 C635 423 655 466 672 510" strokeWidth="4" />
        </g>

        {/* TREE TRUNK */}
        <g fill="none" stroke="url(#tree-energy)" strokeLinecap="round">
          <path className="asc-tree-live" d="M600 360 C575 318 590 287 598 250 C607 208 588 184 593 137" strokeWidth="11" filter="url(#soft-glow)" />
          <path className="asc-tree-live-delay" d="M600 360 C625 318 610 287 602 250 C593 208 612 184 607 137" strokeWidth="7" opacity=".8" />

          <path className="asc-tree-live" d="M596 248 C538 218 492 184 444 138" strokeWidth="6" />
          <path className="asc-tree-live-delay" d="M604 248 C662 218 708 184 756 138" strokeWidth="6" />
          <path className="asc-tree-live" d="M593 205 C528 190 480 164 410 128" strokeWidth="4" />
          <path className="asc-tree-live-delay" d="M607 205 C672 190 720 164 790 128" strokeWidth="4" />
          <path className="asc-tree-live" d="M596 172 C555 145 535 112 505 78" strokeWidth="4" />
          <path className="asc-tree-live-delay" d="M604 172 C645 145 665 112 695 78" strokeWidth="4" />
        </g>

        {/* KNOWLEDGE NODES */}
        {[
          [410, 128], [444, 138], [505, 78], [555, 145], [600, 93], [645, 145], [695, 78], [756, 138], [790, 128],
        ].map(([x, y], index) => (
          <g key={`${x}-${y}`} className={index % 2 ? "asc-knowledge-node-delay" : "asc-knowledge-node"}>
            <circle cx={x} cy={y} r="21" fill="#0b2830" stroke="#83fff2" strokeWidth="2" filter="url(#soft-glow)" />
            <circle cx={x} cy={y} r="6" fill="#d7b46b" filter="url(#hard-glow)" />
          </g>
        ))}

        {/* KNOWLEDGE ERUPTION */}
        <g className="asc-knowledge-eruption">
          <path d="M600 88 C552 55 522 34 478 20" fill="none" stroke="#82fff2" strokeWidth="3" strokeDasharray="7 7" />
          <path d="M600 88 C648 55 678 34 722 20" fill="none" stroke="#82fff2" strokeWidth="3" strokeDasharray="7 7" />
          <path d="M600 88 V12" fill="none" stroke="#d7b46b" strokeWidth="3" strokeDasharray="5 7" />
          <g fill="#b7fff2" filter="url(#hard-glow)">
            <circle cx="478" cy="20" r="5" />
            <circle cx="535" cy="35" r="4" />
            <circle cx="600" cy="12" r="6" />
            <circle cx="665" cy="35" r="4" />
            <circle cx="722" cy="20" r="5" />
          </g>
          <text x="600" y="48" textAnchor="middle" fill="#dcebea" fontSize="15" letterSpacing="5">KNOWLEDGE ERUPTION</text>
        </g>

        {/* FLOW LABELS */}
        <g fontSize="12" letterSpacing="3" fill="#6ebeb9">
          <text x="350" y="400">POWER / FIELD</text>
          <text x="760" y="400">POWER / FIELD</text>
          <text x="620" y="410">ROOT FEED</text>
        </g>
      </svg>

      <style>{`
        .asc-engine-spin { transform-box: fill-box; transform-origin: center; animation: asc-spin 5s linear infinite; }
        .asc-engine-spin-reverse { transform-box: fill-box; transform-origin: center; animation: asc-spin-reverse 4.2s linear infinite; }
        .asc-engine-core { animation: asc-pulse 1.4s ease-in-out infinite; }
        .asc-prism-charge { transform-box: fill-box; transform-origin: center; animation: asc-prism 2s ease-in-out infinite; }
        .asc-prism-core { animation: asc-pulse .9s ease-in-out infinite; }
        .asc-energy-line, .asc-energy-line-delay, .asc-root-feed, .asc-tree-live, .asc-tree-live-delay {
          stroke-dasharray: 18 12;
          animation: asc-flow 1.25s linear infinite;
        }
        .asc-energy-line-delay, .asc-tree-live-delay { animation-delay: .35s; }
        .asc-knowledge-node { animation: asc-node 1.9s ease-in-out infinite; }
        .asc-knowledge-node-delay { animation: asc-node 1.9s .55s ease-in-out infinite; }
        .asc-knowledge-eruption { animation: asc-erupt 2.8s ease-in-out infinite; transform-origin: 600px 92px; }
        @keyframes asc-spin { to { transform: rotate(360deg); } }
        @keyframes asc-spin-reverse { to { transform: rotate(-360deg); } }
        @keyframes asc-flow { to { stroke-dashoffset: -60; } }
        @keyframes asc-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
        @keyframes asc-prism { 0%,100% { transform: scale(.94) rotate(0deg); opacity: .45; } 50% { transform: scale(1.04) rotate(9deg); opacity: 1; } }
        @keyframes asc-node { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
        @keyframes asc-erupt { 0%,25% { opacity: .28; transform: scale(.92); } 60%,85% { opacity: 1; transform: scale(1.04); } 100% { opacity: .38; transform: scale(.96); } }
        @media (prefers-reduced-motion: reduce) {
          .asc-engine-spin,.asc-engine-spin-reverse,.asc-engine-core,.asc-prism-charge,.asc-prism-core,.asc-energy-line,.asc-energy-line-delay,.asc-root-feed,.asc-tree-live,.asc-tree-live-delay,.asc-knowledge-node,.asc-knowledge-node-delay,.asc-knowledge-eruption { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
