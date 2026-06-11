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
      agents: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          paired_at: string | null
          pairing_code: string | null
          pairing_expires_at: string | null
          platform: Database["public"]["Enums"]["agent_platform"] | null
          token: string | null
          user_id: string
          version: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          paired_at?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          platform?: Database["public"]["Enums"]["agent_platform"] | null
          token?: string | null
          user_id: string
          version?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          paired_at?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          platform?: Database["public"]["Enums"]["agent_platform"] | null
          token?: string | null
          user_id?: string
          version?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          agent_id: string
          battery: number | null
          created_at: string
          id: string
          ip_address: string | null
          last_seen_at: string | null
          model: string | null
          serial: string
          status: string | null
          storage_total_gb: number | null
          storage_used_gb: number | null
        }
        Insert: {
          agent_id: string
          battery?: number | null
          created_at?: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string | null
          model?: string | null
          serial: string
          status?: string | null
          storage_total_gb?: number | null
          storage_used_gb?: number | null
        }
        Update: {
          agent_id?: string
          battery?: number | null
          created_at?: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string | null
          model?: string | null
          serial?: string
          status?: string | null
          storage_total_gb?: number | null
          storage_used_gb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          agent_id: string
          created_at: string
          created_by: string
          device_id: string | null
          device_serial: string
          error_message: string | null
          errors: number
          finished_at: string | null
          id: string
          log: string[]
          progress_pct: number
          pushed: number
          skipped: number
          started_at: string | null
          status: Database["public"]["Enums"]["sync_job_status"]
          video_ids: string[]
        }
        Insert: {
          agent_id: string
          created_at?: string
          created_by: string
          device_id?: string | null
          device_serial: string
          error_message?: string | null
          errors?: number
          finished_at?: string | null
          id?: string
          log?: string[]
          progress_pct?: number
          pushed?: number
          skipped?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_job_status"]
          video_ids?: string[]
        }
        Update: {
          agent_id?: string
          created_at?: string
          created_by?: string
          device_id?: string | null
          device_serial?: string
          error_message?: string | null
          errors?: number
          finished_at?: string | null
          id?: string
          log?: string[]
          progress_pct?: number
          pushed?: number
          skipped?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_job_status"]
          video_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          created_at: string
          description: string | null
          duration_seconds: number | null
          format: Database["public"]["Enums"]["vr_format"]
          id: string
          library: Database["public"]["Enums"]["library_type"]
          name: string
          size_bytes: number
          storage_path: string
          thumbnail_url: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          format?: Database["public"]["Enums"]["vr_format"]
          id?: string
          library?: Database["public"]["Enums"]["library_type"]
          name: string
          size_bytes?: number
          storage_path: string
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          format?: Database["public"]["Enums"]["vr_format"]
          id?: string
          library?: Database["public"]["Enums"]["library_type"]
          name?: string
          size_bytes?: number
          storage_path?: string
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      agent_platform: "windows" | "macos" | "linux"
      app_role: "admin" | "operator"
      library_type: "location" | "animation"
      sync_job_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
      vr_format: "360_mono" | "180_mono" | "360_stereo" | "180_stereo" | "flat"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_platform: ["windows", "macos", "linux"],
      app_role: ["admin", "operator"],
      library_type: ["location", "animation"],
      sync_job_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
      vr_format: ["360_mono", "180_mono", "360_stereo", "180_stereo", "flat"],
    },
  },
} as const
