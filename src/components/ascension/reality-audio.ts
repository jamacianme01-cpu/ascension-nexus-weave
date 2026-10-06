/** Quiet spatial air and low harmonic pressure. All sources are bounded and disposable. */
function atmosphereGraph(ctx: AudioContext) {
  const output = ctx.createGain();
  output.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.ratio.value = 8;
  output.connect(limiter).connect(ctx.destination);
  const sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
  const nodes: AudioNode[] = [output, limiter];
  const air = ctx.createBuffer(2, ctx.sampleRate * 8, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = air.getChannelData(channel);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.015;
      // Zero-ended loop keeps the atmospheric bed free of clicks.
      const edge = Math.min(1, i / 2400, (data.length - 1 - i) / 2400);
      data[i] = brown * edge;
    }
  }
  const wind = ctx.createBufferSource();
  wind.buffer = air;
  wind.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 650;
  filter.Q.value = 0.4;
  const windLevel = ctx.createGain();
  windLevel.gain.value = 0.16;
  wind.connect(filter).connect(windLevel).connect(output);
  sources.push(wind);
  nodes.push(filter, windLevel);
  // Soft, sustained fifths, spread across the room; no arpeggio or alert tones.
  [55, 82.41, 110.12].forEach((frequency, i) => {
    const tone = ctx.createOscillator();
    tone.frequency.value = frequency;
    const level = ctx.createGain();
    level.gain.value = i === 0 ? 0.055 : 0.018;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (i - 1) * 0.65;
    tone.connect(level).connect(pan).connect(output);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.29 + i * 0.13;
    const reflection = ctx.createGain();
    reflection.gain.value = 0.22;
    pan.connect(delay).connect(reflection).connect(output);
    sources.push(tone);
    nodes.push(level, pan, delay, reflection);
  });
  sources.forEach((source) => source.start());
  let stopped = false;
  let dimTimer: number | undefined;
  return {
    output,
    filter,
    dim(level = 0.035, after = 4) {
      if (stopped) return;
      const now = ctx.currentTime;
      output.gain.cancelAndHoldAtTime(now);
      output.gain.linearRampToValueAtTime(level, now + after);
    },
    scheduleDim(afterMs: number, level = 0.035, after = 6) {
      dimTimer = window.setTimeout(() => this.dim(level, after), afterMs);
    },
    stop(after = 0.5) {
      if (stopped) return;
      stopped = true;
      if (dimTimer !== undefined) window.clearTimeout(dimTimer);
      const now = ctx.currentTime;
      output.gain.cancelAndHoldAtTime(now);
      output.gain.linearRampToValueAtTime(0, now + after);
      sources.forEach((source) => source.stop(now + after + 0.05));
      // Wall-clock cleanup also releases nodes if the user mutes/suspends audio.
      window.setTimeout(
        () => {
          sources.forEach((source) => {
            try {
              source.stop();
            } catch {}
            source.disconnect();
          });
          nodes.forEach((node) => node.disconnect());
        },
        (after + 0.1) * 1000,
      );
    },
  };
}

export function createRealityAtmosphere(ctx: AudioContext) {
  const graph = atmosphereGraph(ctx);
  graph.output.gain.linearRampToValueAtTime(0.17, ctx.currentTime + 2.5);
  graph.scheduleDim(12_000);
  return { stop: () => graph.stop(0.65) };
}

export function playSpatialSwell(ctx: AudioContext, intensity = 1) {
  const graph = atmosphereGraph(ctx);
  const now = ctx.currentTime;
  graph.filter.frequency.setValueAtTime(180, now);
  graph.filter.frequency.exponentialRampToValueAtTime(1600, now + 1.3);
  graph.filter.frequency.exponentialRampToValueAtTime(240, now + 4);
  graph.output.gain.linearRampToValueAtTime(0.8 * intensity, now + 1.25);
  graph.output.gain.linearRampToValueAtTime(0.001, now + 4.5);
  window.setTimeout(() => graph.stop(0.1), 4600);
}
