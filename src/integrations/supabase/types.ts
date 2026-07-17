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
      assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          playlist_id: string
          target_id: string | null
          target_type: Database["public"]["Enums"]["assignment_target"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          playlist_id: string
          target_id?: string | null
          target_type: Database["public"]["Enums"]["assignment_target"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          playlist_id?: string
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["assignment_target"]
        }
        Relationships: [
          {
            foreignKeyName: "assignments_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
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
      headset_group_members: {
        Row: {
          added_at: string
          group_id: string
          headset_id: string
        }
        Insert: {
          added_at?: string
          group_id: string
          headset_id: string
        }
        Update: {
          added_at?: string
          group_id?: string
          headset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "headset_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "headset_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "headset_group_members_headset_id_fkey"
            columns: ["headset_id"]
            isOneToOne: false
            referencedRelation: "headsets"
            referencedColumns: ["id"]
          },
        ]
      }
      headset_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      headsets: {
        Row: {
          app_version: string | null
          applied_manifest_version: number
          battery_percent: number | null
          created_at: string
          desired_manifest_version: number
          id: string
          last_contact_source: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_heartbeat_at: string | null
          last_manifest_at: string | null
          last_manifest_cause: string | null
          last_seen_at: string | null
          last_sync_at: string | null
          last_sync_status: Database["public"]["Enums"]["sync_status"] | null
          model: string | null
          name: string
          paired_at: string | null
          paired_by: string | null
          serial: string | null
          status: Database["public"]["Enums"]["headset_status"]
          storage_free_bytes: number | null
          storage_total_bytes: number | null
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          applied_manifest_version?: number
          battery_percent?: number | null
          created_at?: string
          desired_manifest_version?: number
          id?: string
          last_contact_source?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_heartbeat_at?: string | null
          last_manifest_at?: string | null
          last_manifest_cause?: string | null
          last_seen_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: Database["public"]["Enums"]["sync_status"] | null
          model?: string | null
          name: string
          paired_at?: string | null
          paired_by?: string | null
          serial?: string | null
          status?: Database["public"]["Enums"]["headset_status"]
          storage_free_bytes?: number | null
          storage_total_bytes?: number | null
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          applied_manifest_version?: number
          battery_percent?: number | null
          created_at?: string
          desired_manifest_version?: number
          id?: string
          last_contact_source?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_heartbeat_at?: string | null
          last_manifest_at?: string | null
          last_manifest_cause?: string | null
          last_seen_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: Database["public"]["Enums"]["sync_status"] | null
          model?: string | null
          name?: string
          paired_at?: string | null
          paired_by?: string | null
          serial?: string | null
          status?: Database["public"]["Enums"]["headset_status"]
          storage_free_bytes?: number | null
          storage_total_bytes?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      manifest_versions: {
        Row: {
          cause: string | null
          created_at: string
          headset_id: string
          payload: Json
          playlist_id: string | null
          version: number
        }
        Insert: {
          cause?: string | null
          created_at?: string
          headset_id: string
          payload: Json
          playlist_id?: string | null
          version: number
        }
        Update: {
          cause?: string | null
          created_at?: string
          headset_id?: string
          payload?: Json
          playlist_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "manifest_versions_headset_id_fkey"
            columns: ["headset_id"]
            isOneToOne: false
            referencedRelation: "headsets"
            referencedColumns: ["id"]
          },
        ]
      }
      pairing_codes: {
        Row: {
          claimed_at: string | null
          claimed_by_headset_id: string | null
          code: string
          created_at: string
          device_token: string | null
          expires_at: string
          failed_attempts: number
          id: string
          pairing_secret: string
          pending_model: string | null
          pending_serial: string | null
        }
        Insert: {
          claimed_at?: string | null
          claimed_by_headset_id?: string | null
          code: string
          created_at?: string
          device_token?: string | null
          expires_at: string
          failed_attempts?: number
          id?: string
          pairing_secret: string
          pending_model?: string | null
          pending_serial?: string | null
        }
        Update: {
          claimed_at?: string | null
          claimed_by_headset_id?: string | null
          code?: string
          created_at?: string
          device_token?: string | null
          expires_at?: string
          failed_attempts?: number
          id?: string
          pairing_secret?: string
          pending_model?: string | null
          pending_serial?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pairing_codes_claimed_by_headset_id_fkey"
            columns: ["claimed_by_headset_id"]
            isOneToOne: false
            referencedRelation: "headsets"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_videos: {
        Row: {
          added_at: string
          playlist_id: string
          position: number
          video_id: string
        }
        Insert: {
          added_at?: string
          playlist_id: string
          position?: number
          video_id: string
        }
        Update: {
          added_at?: string
          playlist_id?: string
          position?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_videos_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_videos_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
      sync_reports: {
        Row: {
          applied_manifest_version: number | null
          cause: string | null
          deleted_count: number
          details: Json | null
          downloaded_count: number
          error_message: string | null
          failed_count: number
          finished_at: string | null
          headset_id: string
          id: string
          local_video_count: number | null
          playlist_id: string | null
          remote_video_count: number | null
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
          total_bytes: number
          visible_video_count: number | null
        }
        Insert: {
          applied_manifest_version?: number | null
          cause?: string | null
          deleted_count?: number
          details?: Json | null
          downloaded_count?: number
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          headset_id: string
          id?: string
          local_video_count?: number | null
          playlist_id?: string | null
          remote_video_count?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          total_bytes?: number
          visible_video_count?: number | null
        }
        Update: {
          applied_manifest_version?: number | null
          cause?: string | null
          deleted_count?: number
          details?: Json | null
          downloaded_count?: number
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          headset_id?: string
          id?: string
          local_video_count?: number | null
          playlist_id?: string | null
          remote_video_count?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          total_bytes?: number
          visible_video_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_reports_headset_id_fkey"
            columns: ["headset_id"]
            isOneToOne: false
            referencedRelation: "headsets"
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
          projection: Database["public"]["Enums"]["video_projection"]
          sha256: string | null
          size_bytes: number
          stereo_mode: Database["public"]["Enums"]["video_stereo_mode"]
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
          projection?: Database["public"]["Enums"]["video_projection"]
          sha256?: string | null
          size_bytes?: number
          stereo_mode?: Database["public"]["Enums"]["video_stereo_mode"]
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
          projection?: Database["public"]["Enums"]["video_projection"]
          sha256?: string | null
          size_bytes?: number
          stereo_mode?: Database["public"]["Enums"]["video_stereo_mode"]
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
      bump_headset_versions: {
        Args: { _cause: string; _headset_ids: string[] }
        Returns: undefined
      }
      diagnose_headset_sync: { Args: { _headset_id: string }; Returns: Json }
      diagnose_playlist_impact: {
        Args: { _playlist_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      headsets_for_playlist: {
        Args: { _playlist_id: string }
        Returns: {
          headset_id: string
        }[]
      }
    }
    Enums: {
      agent_platform: "windows" | "macos" | "linux"
      app_role: "admin" | "operator"
      assignment_target: "headset" | "group" | "all"
      headset_status: "pending" | "active" | "revoked"
      library_type: "location" | "animation"
      sync_job_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
      sync_status:
        | "started"
        | "success"
        | "partial"
        | "failed"
        | "no_change"
        | "pending"
      video_projection: "360" | "180" | "flat"
      video_stereo_mode: "mono" | "top_bottom" | "side_by_side" | "unknown"
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
      assignment_target: ["headset", "group", "all"],
      headset_status: ["pending", "active", "revoked"],
      library_type: ["location", "animation"],
      sync_job_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
      sync_status: [
        "started",
        "success",
        "partial",
        "failed",
        "no_change",
        "pending",
      ],
      video_projection: ["360", "180", "flat"],
      video_stereo_mode: ["mono", "top_bottom", "side_by_side", "unknown"],
      vr_format: ["360_mono", "180_mono", "360_stereo", "180_stereo", "flat"],
    },
  },
} as const
