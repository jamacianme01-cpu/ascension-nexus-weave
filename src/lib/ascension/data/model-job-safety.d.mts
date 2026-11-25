export declare function modelJobTransition(
  previous: string | undefined | null, next: string
): "updated" | "replayed" | "conflict";
