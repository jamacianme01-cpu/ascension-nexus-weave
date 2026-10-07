export interface DesignPart {
  name: string;
  x: number;
  y: number;
  purpose: string;
  location: string;
  operation: string;
  connections: string;
  limitations: string;
}

export function parseDesignParts(value: unknown): DesignPart[] {
  const raw = value && typeof value === 'object' ? (value as { parts?: unknown }).parts : null;
  if (!Array.isArray(raw)) throw new Error('No part labels were returned.');
  const fields = ['name', 'purpose', 'location', 'operation', 'connections', 'limitations'] as const;
  const parts = raw.slice(0, 16).flatMap((item): DesignPart[] => {
    if (!item || typeof item !== 'object') return [];
    const part = item as Record<string, unknown>;
    if (typeof part['x'] !== 'number' || typeof part['y'] !== 'number' || !Number.isFinite(part['x']) || !Number.isFinite(part['y']) || part['x'] < 0 || part['x'] > 1 || part['y'] < 0 || part['y'] > 1) return [];
    if (!fields.every(field => typeof part[field] === 'string' && (part[field] as string).trim())) return [];
    return [{ x: part['x'], y: part['y'], ...Object.fromEntries(fields.map(field => [field, (part[field] as string).trim().slice(0, field === 'name' ? 120 : 2400)])) } as unknown as DesignPart];
  });
  if (!parts.length) throw new Error('No usable part labels were returned.');
  return parts;
}
