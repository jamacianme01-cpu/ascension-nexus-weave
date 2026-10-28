export function createTreeVoice({ speech, Utterance, Recognition, onTranscript, onState = () => {}, onError = () => {} }) {
  let disposed = false;
  let recognition = null;
  let utterance = null;
  let timer = null;
  let generation = 0;
  const emit = state => { if (!disposed) onState(state); };
  const report = message => { if (!disposed) onError(message); };
  function stop() {
    generation++;
    clearTimeout(timer);
    timer = null;
    const current = recognition;
    recognition = null;
    if (current) {
      current.onresult = current.onerror = current.onend = null;
      current.abort();
    }
    if (utterance) {
      utterance.onend = utterance.onerror = null;
      utterance = null;
      speech?.cancel();
    }
    emit("idle");
  }
  function speak(text) {
    if (disposed) return false;
    stop();
    const content = String(text ?? "").trim().slice(0, 2400);
    if (!content) return false;
    if (!speech || !Utterance) {
      report("Speech playback is unavailable. The Tree's text remains available.");
      return false;
    }
    const id = generation;
    const message = new Utterance(content);
    message.rate = 0.95;
    message.onend = () => {
      if (id !== generation || disposed) return;
      utterance = null;
      emit("idle");
    };
    message.onerror = () => {
      if (id !== generation || disposed) return;
      utterance = null;
      emit("idle");
      report("Speech playback failed. You can still read the Tree's response.");
    };
    utterance = message;
    emit("speaking");
    try { speech.speak(message); return true; }
    catch { message.onerror(); return false; }
  }
  function listen() {
    if (disposed) return false;
    stop();
    if (!Recognition) {
      report("Voice input is unavailable in this browser. Type your message instead.");
      return false;
    }
    const id = generation;
    try {
      const current = new Recognition();
      recognition = current;
      current.continuous = false;
      current.interimResults = false;
      current.lang = "en-US";
      current.onresult = event => {
        if (disposed || id !== generation) return;
        const text = Array.from(event.results)
          .filter(result => result.isFinal)
          .map(result => result[0]?.transcript ?? "").join(" ").trim().slice(0, 4000);
        stop();
        if (text) onTranscript(text);
      };
      current.onerror = event => {
        if (disposed || id !== generation) return;
        stop();
        report(event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was denied. You can still type to the Tree."
          : "Voice input ended without a usable transcript. Try again or type your message.");
      };
      current.onend = () => {
        if (!disposed && id === generation) stop();
      };
      emit("listening");
      current.start();
      if (recognition === current) timer = setTimeout(stop, 30000);
      return true;
    } catch {
      stop();
      report("Voice input could not start. Try again or type your message.");
      return false;
    }
  }
  return {
    speak, listen, stop,
    dispose() { if (!disposed) { stop(); disposed = true; } },
  };
}
