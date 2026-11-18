export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface TableShape {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
}

export interface Database {
  public: {
    Tables: {
      ascension_execution_requests: TableShape;
    } & Record<string, TableShape>;
  };
}
