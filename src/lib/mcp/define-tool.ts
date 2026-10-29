/** ASCENSION MCP tool definition — independent, no third-party SDK. */
import { z, type ZodType } from "zod";

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
);

export type ToolContext = {
  isAuthenticated: () => boolean;
  getUserId: () => string | null;
);

export type ToolResult = {
  content: Array<string, { type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
);

export type ToolDefinition<TInput = unknown> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, ZodType>;
  annotations?: ToolAnnotations;
  handler: (input: TInput, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
);

export function defineTool<TInput>(def: ToolDefinition<TInput>): ToolDefinition<TInput> {
  return def;
)

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}
