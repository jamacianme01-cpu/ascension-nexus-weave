export declare function shouldAcceptRelayRevision(
  latest: number | string | null | undefined,
  incoming: number
): boolean;
export declare function governedQueueTransition(
  previous: string | null | undefined,
  next: string
): "missing" | "conflict" | "replayed" | "updated";
