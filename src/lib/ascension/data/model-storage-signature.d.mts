export declare function modelStorageObjectPath(input: unknown): string | null;
export declare function modelUploadSignature(input: unknown, expiresAt: number, secret: string): string | null;
export declare function verifyModelUploadSignature(
  input: unknown, expiresAt: unknown, signature: unknown, secret: string, now?: number
): boolean;
