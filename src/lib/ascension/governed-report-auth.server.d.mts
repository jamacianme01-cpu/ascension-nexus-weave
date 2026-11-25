export declare function canonicalReport(value: unknown): string;
export declare function governedReportMessage(report: Record<string, unknown>): Buffer;
export declare function verifyGovernedReport(report: Record<string, unknown>, publicKeyPem: string | undefined): boolean;
