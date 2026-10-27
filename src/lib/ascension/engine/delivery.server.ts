import type { Json } from "@/integrations/supabase/types";
import { ASCENSION_GUIDE_INSTRUCTIONS } from "./guide-personality.server";
import { buildGuideFallbackDelivery } from "./guide-fallback.server";
import {
  assessResult,
  hasEnvisionPreparation,
  notProducedMessage,
  parseDelivery,
  requestedKind,
  supportsEnvisionObjective,
  type ObjectiveDelivery,
} from "../result-model";
import {
  reviewObjectiveFit, stampObjectiveFit, type ObjectiveFitReview,
} from "./objective-fit.server";

// NOTE: Full file body continues - temporary minimal restore if needed
export async function externalProductDraft(): Promise<ObjectiveDelivery> {
  throw new Error("delivery.server.ts restore incomplete - do not deploy");
}
