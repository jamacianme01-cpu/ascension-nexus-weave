export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ascension_execution_requests: {
        Row: {
          accepted_delta: Json | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          constraints: Json | null
          created_at: string
          error: string | null
          evidence: Json | null
          guardian_verdict: string | null
          id: string
          objective: string
          outcome_status: string | null
          result: Json | null
          runtime_revision: number | null
          stage: string | null
          status: string
          submitted_by: string
          submitted_via: string
          transition_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_delta?: Json | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          constraints?: Json | null
          created_at?: string
          error?: string | null
          evidence?: Json | null
          guardian_verdict?: string | null
          id?: string
          objective: string
          outcome_status?: string | null
          result?: Json | null
          runtime_revision?: number | null
          stage?: string | null
          status?: string
          submitted_by?: string
          submitted_via?: string
          transition_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_delta?: Json | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          constraints?: Json | null
          created_at?: string
          error?: string | null
          evidence?: Json | null
          guardian_verdict?: string | null
          id?: string
          objective?: string
          outcome_status?: string | null
          result?: Json | null
          runtime_revision?: number | null
          stage?: string | null
          status?: string
          submitted_by?: string
          submitted_via?: string
          transition_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ascension_publications: {
        Row: {
          content_hash: string | null
          id: string
          payload: Json
          published_at: string | null
          received_at: string
          revision: number
          snapshot_hash: string | null
          source_classification: string
          surface: string
        }
        Insert: {
          content_hash?: string | null
          id?: string
          payload: Json
          published_at?: string | null
          received_at?: string
          revision: number
          snapshot_hash?: string | null
          source_classification: string
          surface: string
        }
        Update: {
          content_hash?: string | null
          id?: string
          payload?: Json
          published_at?: string | null
          received_at?: string
          revision?: number
          snapshot_hash?: string | null
          source_classification?: string
          surface?: string
        }
        Relationships: []
      }
      ascension_user_observations: {
        Row: {
          created_at: string
          entity_id: string | null
          id: string
          label: string
          note: string | null
          revision: number | null
          surface: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          id?: string
          label: string
          note?: string | null
          revision?: number | null
          surface?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          id?: string
          label?: string
          note?: string | null
          revision?: number | null
          surface?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
