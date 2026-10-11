import { useMemo, useState } from "react";
import { simulateMotion, type MotionInputs } from "@/lib/ascension/engineering-simulation";

/** Actual numerical calculation; explicitly NOT a claim the invention will perform this way. */
export function RealityEngineeringSimulation({ progress }: { progress: number }) {
  const [values, setValues] = useState<MotionInputs>({
    massKg: 1, forceN: 10, dragNsPerM: 0.5, durationS: 5,
  });
  const [edited, setEdited] = useState(false);
  const simulation = useMemo(() => {
    try {
      return { final: simulateMotion(values), current: simulateMotion({
        ...values, durationS: values.durationS * Math.min(1, Math.max(0, progress)),
      }), error: null as string | null };
    } catch (cause) {
      return { final: null, current: null,
        error: cause instanceof Error ? cause.message : "Calculation failed." };
    }
  }, [values, progress]);
  const change = (field: keyof MotionInputs, value: string) => {
    setEdited(true);
    setValues(previous => ({ ...previous, [field]: value.trim() === "" ? NaN : Number(value) }));
  };
  const fmt = (value: number) => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "—";
  return (
    <div className="reality-physics" aria-label="Numerical engineering simulation">
      <strong>NUMERICAL SIMULATION · 1-D FORCE / MOTION</strong>
      <p role="note">{edited ? "User-adjusted input values" : "EXAMPLE INPUTS ONLY · NOT MEASUREMENTS OF THIS INVENTION"}.
        Models constant applied force, linear velocity drag, and mass from rest. No geometry-based field or material simulation is implied.</p>
      <div className="reality-physics-inputs">
        <label>Mass (kg)<input aria-label="Simulation mass in kilograms" type="number" min="0.001" step="any" value={Number.isNaN(values.massKg) ? "" : values.massKg} onChange={e => change("massKg", e.target.value)} /></label>
        <label>Force (N)<input aria-label="Simulation force in newtons" type="number" min="0" step="any" value={Number.isNaN(values.forceN) ? "" : values.forceN} onChange={e => change("forceN", e.target.value)} /></label>
        <label>Drag (N·s/m)<input aria-label="Simulation linear drag" type="number" min="0" step="any" value={Number.isNaN(values.dragNsPerM) ? "" : values.dragNsPerM} onChange={e => change("dragNsPerM", e.target.value)} /></label>
        <label>Duration (s)<input aria-label="Simulation duration in seconds" type="number" min="0" step="any" value={Number.isNaN(values.durationS) ? "" : values.durationS} onChange={e => change("durationS", e.target.value)} /></label>
      </div>
      {simulation.error ? <p role="alert">{simulation.error}</p> : simulation.final && simulation.current && (
        <div className="reality-physics-results" aria-live="polite">
          <output>At {fmt(values.durationS)} s: <b>{fmt(simulation.final.displacementM)} m</b> displacement · <b>{fmt(simulation.final.velocityMPerS)} m/s</b> speed · <b>{fmt(simulation.final.workJ)} J</b> applied work</output>
          <output>Playback {fmt(progress * values.durationS)} s: {fmt(simulation.current.displacementM)} m · {fmt(simulation.current.velocityMPerS)} m/s · {fmt(simulation.current.accelerationMPerS2)} m/s²</output>
        </div>
      )}
      <small>Equation: m·dv/dt = F − c·v. Calculation is mathematical, not a verified performance prediction. Geometry dimensions, magnetic fields, structural limits and thermal effects are not modeled.</small>
    </div>
  );
}
