/** ASCENSION MCP tool definition — independent, no third-party SDK. */
import { z, type ZodType } from "zod";

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type ToolContext = {
  isAuthenticated: () => boolean;
  getUserId: () => string | null;
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

export type ToolDefinition<TInput = unknown> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, ZodType>;
  annotations?: ToolAnnotations;
  handler: (input: TInput, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
};

type InferredInput<TSchema extends Record<string, ZodType>> = {
  [K in keyof TSchema]: z.infer<TSchema[K]>;
};

export function defineTool<TSchema extends Record<string, ZodType>>(def: {
  name: string;
  title: string;
  description: string;
  inputSchema: TSchema;
  annotations?: ToolAnnotations;
  handler: (input: InferredInput<TSchema>, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
}): ToolDefinition {
  return def as ToolDefinition;
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}
