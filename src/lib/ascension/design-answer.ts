/** The opening screen is not an answer. A design result is ready to show only after its picture is present. */
export function designPictureReady(pictureUrl: string | null | undefined): boolean {
  return Boolean(pictureUrl && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{4000,}/i.test(pictureUrl));
}

/** The public no-charge picture path.
 * A custom image endpoint can bill the owner, so it stays off until
 * ASCENSION_ALLOW_FREE_IMAGES is explicitly true. The anonymous SDXL route
 * does not. ASCENSION_ALLOW_FREE_IMAGES=false turns every picture off.
 */
export function freePictureEnabled(env: { allow?: string; endpoint?: string } = {}): boolean {
  if (env.allow === "false") return false;
  if (env.endpoint?.trim()) return env.allow === "true";
  return true;
}

/** Keep a generated design decision verbatim. The previous helper falsely
 * converted "choose a material" into "this design already uses a material,"
 * which claimed a decision had been made when the engine made none.
 * Strip only duplicate list numbers; the ordered list owns its numbering.
 */
export function asCompletedDesignStep(step: string): string {
  return step.replace(/\s+/g, " ").trim().replace(
    /^(?:step\s+)?\d{1,2}\s*[.)\-:]\s*/i, "",
  ).trim();
}
