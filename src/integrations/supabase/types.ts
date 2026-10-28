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
      _sys_bulk_pin_reset_log: {
        Row: {
          error_message: string | null
          player_id: string
          reset_at: string
          success: boolean
        }
        Insert: {
          error_message?: string | null
          player_id: string
          reset_at?: string
          success: boolean
        }
        Update: {
          error_message?: string | null
          player_id?: string
          reset_at?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "_sys_bulk_pin_reset_log_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_actions_log: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          target_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          access_restriction_active: boolean | null
          announcement: string | null
          auto_close: boolean
          auto_generate_incidents: boolean | null
          auto_open: boolean
          auto_promote_reservations: boolean | null
          close_time: string
          close_weekday: number
          convidados_habilitados: boolean
          created_at: string
          dia_liberacao_convidado: number | null
          end_time: string
          event_name: string
          event_weekday: number
          group_id: string
          hora_liberacao_convidado: string | null
          id: string
          limite_convidados_por_usuario: number
          list_open_time: string | null
          location: string
          main_limit: number
          open_time: string
          open_weekday: number
          penalty_late_leave: number
          penalty_no_show: number
          priority_minutes: number
          priority_start_time: string | null
          show_rules_to_players: boolean
          start_time: string
          timezone: string
          updated_at: string
          wait_limit: number | null
          withdrawal_deadline_time: string
          withdrawal_deadline_weekday: number
        }
        Insert: {
          access_restriction_active?: boolean | null
          announcement?: string | null
          auto_close?: boolean
          auto_generate_incidents?: boolean | null
          auto_open?: boolean
          auto_promote_reservations?: boolean | null
          close_time?: string
          close_weekday?: number
          convidados_habilitados?: boolean
          created_at?: string
          dia_liberacao_convidado?: number | null
          end_time?: string
          event_name?: string
          event_weekday?: number
          group_id: string
          hora_liberacao_convidado?: string | null
          id?: string
          limite_convidados_por_usuario?: number
          list_open_time?: string | null
          location?: string
          main_limit?: number
          open_time?: string
          open_weekday?: number
          penalty_late_leave?: number
          penalty_no_show?: number
          priority_minutes?: number
          priority_start_time?: string | null
          show_rules_to_players?: boolean
          start_time?: string
          timezone?: string
          updated_at?: string
          wait_limit?: number | null
          withdrawal_deadline_time?: string
          withdrawal_deadline_weekday?: number
        }
        Update: {
          access_restriction_active?: boolean | null
          announcement?: string | null
          auto_close?: boolean
          auto_generate_incidents?: boolean | null
          auto_open?: boolean
          auto_promote_reservations?: boolean | null
          close_time?: string
          close_weekday?: number
          convidados_habilitados?: boolean
          created_at?: string
          dia_liberacao_convidado?: number | null
          end_time?: string
          event_name?: string
          event_weekday?: number
          group_id?: string
          hora_liberacao_convidado?: string | null
          id?: string
          limite_convidados_por_usuario?: number
          list_open_time?: string | null
          location?: string
          main_limit?: number
          open_time?: string
          open_weekday?: number
          penalty_late_leave?: number
          penalty_no_show?: number
          priority_minutes?: number
          priority_start_time?: string | null
          show_rules_to_players?: boolean
          start_time?: string
          timezone?: string
          updated_at?: string
          wait_limit?: number | null
          withdrawal_deadline_time?: string
          withdrawal_deadline_weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_manual_jogador: {
        Row: {
          conteudo: string
          criado_em: string | null
          id: string
          ordem: number
          titulo: string
        }
        Insert: {
          conteudo: string
          criado_em?: string | null
          id?: string
          ordem: number
          titulo: string
        }
        Update: {
          conteudo?: string
          criado_em?: string | null
          id?: string
          ordem?: number
          titulo?: string
        }
        Relationships: []
      }
      equipment_funds: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          scope: string
          title: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          scope?: string
          title: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          scope?: string
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      event_attendance: {
        Row: {
          created_at: string
          event_id: string
          notes: string | null
          player_id: string
          recorded_at: string | null
          recorded_by_admin_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          notes?: string | null
          player_id: string
          recorded_at?: string | null
          recorded_by_admin_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          notes?: string | null
          player_id?: string
          recorded_at?: string | null
          recorded_by_admin_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "volleyball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      event_guests: {
        Row: {
          cancelled_at: string | null
          cancelled_by_player_id: string | null
          created_at: string
          event_id: string
          group_id: string
          guest_player_id: string | null
          id: string
          nome_convidado: string
          usuario_responsavel_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by_player_id?: string | null
          created_at?: string
          event_id: string
          group_id: string
          guest_player_id?: string | null
          id?: string
          nome_convidado: string
          usuario_responsavel_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by_player_id?: string | null
          created_at?: string
          event_id?: string
          group_id?: string
          guest_player_id?: string | null
          id?: string
          nome_convidado?: string
          usuario_responsavel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_cancelled_by_player_id_fkey"
            columns: ["cancelled_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "volleyball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_guest_player_id_fkey"
            columns: ["guest_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_usuario_responsavel_id_fkey"
            columns: ["usuario_responsavel_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_groups: {
        Row: {
          created_at: string
          fund_id: string
          group_id: string
          id: string
        }
        Insert: {
          created_at?: string
          fund_id: string
          group_id: string
          id?: string
        }
        Update: {
          created_at?: string
          fund_id?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_groups_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "equipment_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_participant_players: {
        Row: {
          created_at: string
          created_by: string | null
          fund_id: string
          id: string
          participant_id: string
          player_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fund_id: string
          id?: string
          participant_id: string
          player_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fund_id?: string
          id?: string
          participant_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_participant_players_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "equipment_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_participant_players_participant_fkey"
            columns: ["fund_id", "participant_id"]
            isOneToOne: false
            referencedRelation: "fund_participants"
            referencedColumns: ["fund_id", "id"]
          },
          {
            foreignKeyName: "fund_participant_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_participants: {
        Row: {
          agreed_amount: number | null
          created_at: string
          created_by: string | null
          exempt: boolean
          fund_id: string
          id: string
          name: string
          notes: string | null
          participates: boolean
          payment_reported: boolean
          payment_reported_at: string | null
          phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agreed_amount?: number | null
          created_at?: string
          created_by?: string | null
          exempt?: boolean
          fund_id: string
          id?: string
          name: string
          notes?: string | null
          participates?: boolean
          payment_reported?: boolean
          payment_reported_at?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agreed_amount?: number | null
          created_at?: string
          created_by?: string | null
          exempt?: boolean
          fund_id?: string
          id?: string
          name?: string
          notes?: string | null
          participates?: boolean
          payment_reported?: boolean
          payment_reported_at?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_participants_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "equipment_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          fund_id: string
          id: string
          notes: string | null
          paid_at: string
          participant_id: string | null
          payer_name: string | null
          payment_method: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          fund_id: string
          id?: string
          notes?: string | null
          paid_at?: string
          participant_id?: string | null
          payer_name?: string | null
          payment_method?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          fund_id?: string
          id?: string
          notes?: string | null
          paid_at?: string
          participant_id?: string | null
          payer_name?: string | null
          payment_method?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_payments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "equipment_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_payments_participant_fkey"
            columns: ["fund_id", "participant_id"]
            isOneToOne: false
            referencedRelation: "fund_participants"
            referencedColumns: ["fund_id", "id"]
          },
        ]
      }
      groups: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      migration_audit_event_openings: {
        Row: {
          created_at: string
          details: Json
          id: string
          migration_name: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          migration_name: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          migration_name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          event_id: string | null
          group_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          player_id: string
          read_at: string | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          group_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          player_id: string
          read_at?: string | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          created_at?: string
          event_id?: string | null
          group_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          player_id?: string
          read_at?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "volleyball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_blocks: {
        Row: {
          active: boolean
          admin_notes: string | null
          created_at: string
          created_by_admin_user_id: string | null
          ended_by_admin_user_id: string | null
          ended_early_at: string | null
          ends_at: string
          group_id: string | null
          id: string
          player_id: string
          reason: string | null
          scope: string
          starts_at: string
        }
        Insert: {
          active?: boolean
          admin_notes?: string | null
          created_at?: string
          created_by_admin_user_id?: string | null
          ended_by_admin_user_id?: string | null
          ended_early_at?: string | null
          ends_at: string
          group_id?: string | null
          id?: string
          player_id: string
          reason?: string | null
          scope?: string
          starts_at: string
        }
        Update: {
          active?: boolean
          admin_notes?: string | null
          created_at?: string
          created_by_admin_user_id?: string | null
          ended_by_admin_user_id?: string | null
          ended_early_at?: string | null
          ends_at?: string
          group_id?: string | null
          id?: string
          player_id?: string
          reason?: string | null
          scope?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_blocks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_blocks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_groups: {
        Row: {
          created_at: string
          group_id: string
          has_priority: boolean
          id: string
          is_organizer: boolean | null
          organizer_order: number | null
          player_id: string
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          requested_at: string
          status: Database["public"]["Enums"]["player_group_status"]
        }
        Insert: {
          created_at?: string
          group_id: string
          has_priority?: boolean
          id?: string
          is_organizer?: boolean | null
          organizer_order?: number | null
          player_id: string
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["player_group_status"]
        }
        Update: {
          created_at?: string
          group_id?: string
          has_priority?: boolean
          id?: string
          is_organizer?: boolean | null
          organizer_order?: number | null
          player_id?: string
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["player_group_status"]
        }
        Relationships: [
          {
            foreignKeyName: "player_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_groups_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_incidents: {
        Row: {
          admin_notes: string | null
          applied_rounds: number | null
          block_id: string | null
          created_at: string
          decided_at: string | null
          decided_by_admin_user_id: string | null
          event_id: string
          group_id: string | null
          id: string
          incident_type: string
          justification: string | null
          occurred_at: string
          player_id: string
          scope: string
          status: string
          suggested_rounds: number
          updated_at: string
          withdrawal_note: string | null
        }
        Insert: {
          admin_notes?: string | null
          applied_rounds?: number | null
          block_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_admin_user_id?: string | null
          event_id: string
          group_id?: string | null
          id?: string
          incident_type: string
          justification?: string | null
          occurred_at?: string
          player_id: string
          scope?: string
          status?: string
          suggested_rounds: number
          updated_at?: string
          withdrawal_note?: string | null
        }
        Update: {
          admin_notes?: string | null
          applied_rounds?: number | null
          block_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_admin_user_id?: string | null
          event_id?: string
          group_id?: string | null
          id?: string
          incident_type?: string
          justification?: string | null
          occurred_at?: string
          player_id?: string
          scope?: string
          status?: string
          suggested_rounds?: number
          updated_at?: string
          withdrawal_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_incidents_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "player_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_incidents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "volleyball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_incidents_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_incidents_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_login_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip: unknown
          phone_normalized: string | null
          success: boolean
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip?: unknown
          phone_normalized?: string | null
          success: boolean
        }
        Update: {
          attempted_at?: string
          id?: string
          ip?: unknown
          phone_normalized?: string | null
          success?: boolean
        }
        Relationships: []
      }
      player_push_preferences: {
        Row: {
          group_ids: string[] | null
          notify_access_approved: boolean | null
          notify_event_changed: boolean | null
          notify_guest_release: boolean | null
          notify_promoted: boolean | null
          notify_registration_open: boolean | null
          player_id: string
          updated_at: string
        }
        Insert: {
          group_ids?: string[] | null
          notify_access_approved?: boolean | null
          notify_event_changed?: boolean | null
          notify_guest_release?: boolean | null
          notify_promoted?: boolean | null
          notify_registration_open?: boolean | null
          player_id: string
          updated_at?: string
        }
        Update: {
          group_ids?: string[] | null
          notify_access_approved?: boolean | null
          notify_event_changed?: boolean | null
          notify_guest_release?: boolean | null
          notify_promoted?: boolean | null
          notify_registration_open?: boolean | null
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_push_preferences_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_search_hits: {
        Row: {
          hit_at: string
          id: string
          session_id: string
        }
        Insert: {
          hit_at?: string
          id?: string
          session_id: string
        }
        Update: {
          hit_at?: string
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_search_hits_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "player_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      player_self_ratings: {
        Row: {
          attack_score: number | null
          block_score: number | null
          created_at: string
          defense_score: number | null
          height_cm: number | null
          id: string
          movement_score: number | null
          overall_level: number | null
          player_id: string
          positioning_score: number | null
          primary_position: string | null
          reception_score: number | null
          serve_score: number | null
          setting_score: number | null
          updated_at: string
        }
        Insert: {
          attack_score?: number | null
          block_score?: number | null
          created_at?: string
          defense_score?: number | null
          height_cm?: number | null
          id?: string
          movement_score?: number | null
          overall_level?: number | null
          player_id: string
          positioning_score?: number | null
          primary_position?: string | null
          reception_score?: number | null
          serve_score?: number | null
          setting_score?: number | null
          updated_at?: string
        }
        Update: {
          attack_score?: number | null
          block_score?: number | null
          created_at?: string
          defense_score?: number | null
          height_cm?: number | null
          id?: string
          movement_score?: number | null
          overall_level?: number | null
          player_id?: string
          positioning_score?: number | null
          primary_position?: string | null
          reception_score?: number | null
          serve_score?: number | null
          setting_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_self_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_sessions: {
        Row: {
          absolute_expires_at: string
          created_at: string
          expires_at: string
          id: string
          ip: unknown
          last_used_at: string
          player_id: string
          remember: boolean
          revoked_at: string | null
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          absolute_expires_at?: string
          created_at?: string
          expires_at: string
          id?: string
          ip?: unknown
          last_used_at?: string
          player_id: string
          remember?: boolean
          revoked_at?: string | null
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          absolute_expires_at?: string
          created_at?: string
          expires_at?: string
          id?: string
          ip?: unknown
          last_used_at?: string
          player_id?: string
          remember?: boolean
          revoked_at?: string | null
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_skills: {
        Row: {
          attack_score: number | null
          block_score: number | null
          created_at: string
          defense_reception_score: number | null
          defense_score: number | null
          height_cm: number | null
          id: string
          movement_score: number | null
          notes: string | null
          player_id: string
          positioning_score: number | null
          primary_position: string
          reception_score: number | null
          serve_score: number | null
          setting_score: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attack_score?: number | null
          block_score?: number | null
          created_at?: string
          defense_reception_score?: number | null
          defense_score?: number | null
          height_cm?: number | null
          id?: string
          movement_score?: number | null
          notes?: string | null
          player_id: string
          positioning_score?: number | null
          primary_position?: string
          reception_score?: number | null
          serve_score?: number | null
          setting_score?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attack_score?: number | null
          block_score?: number | null
          created_at?: string
          defense_reception_score?: number | null
          defense_score?: number | null
          height_cm?: number | null
          id?: string
          movement_score?: number | null
          notes?: string | null
          player_id?: string
          positioning_score?: number | null
          primary_position?: string
          reception_score?: number | null
          serve_score?: number | null
          setting_score?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_skills_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          active: boolean
          avatar_path: string | null
          avatar_rejection_reason: string | null
          avatar_status: Database["public"]["Enums"]["avatar_status"] | null
          avatar_updated_at: string | null
          avatar_uploaded_at: string | null
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          disabled_reason: string | null
          first_name: string | null
          has_global_priority: boolean
          id: string
          is_guest: boolean | null
          last_name: string | null
          must_change_pin: boolean
          name: string
          name_normalized: string | null
          phone: string
          phone_normalized: string
          pin_hash: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_path?: string | null
          avatar_rejection_reason?: string | null
          avatar_status?: Database["public"]["Enums"]["avatar_status"] | null
          avatar_updated_at?: string | null
          avatar_uploaded_at?: string | null
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          first_name?: string | null
          has_global_priority?: boolean
          id?: string
          is_guest?: boolean | null
          last_name?: string | null
          must_change_pin?: boolean
          name: string
          name_normalized?: string | null
          phone: string
          phone_normalized: string
          pin_hash: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_path?: string | null
          avatar_rejection_reason?: string | null
          avatar_status?: Database["public"]["Enums"]["avatar_status"] | null
          avatar_updated_at?: string | null
          avatar_uploaded_at?: string | null
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          first_name?: string | null
          has_global_priority?: boolean
          id?: string
          is_guest?: boolean | null
          last_name?: string | null
          must_change_pin?: boolean
          name?: string
          name_normalized?: string | null
          phone?: string
          phone_normalized?: string
          pin_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_deliveries: {
        Row: {
          error: string | null
          id: string
          outbox_id: string | null
          sent_at: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          error?: string | null
          id?: string
          outbox_id?: string | null
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          error?: string | null
          id?: string
          outbox_id?: string | null
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_deliveries_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "push_notification_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_outbox: {
        Row: {
          attempts: number | null
          created_at: string | null
          failed_at: string | null
          id: string
          last_error: string | null
          metadata: Json | null
          notification_id: string | null
          player_id: string | null
          processing_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json | null
          notification_id?: string | null
          player_id?: string | null
          processing_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json | null
          notification_id?: string | null
          player_id?: string | null
          processing_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_outbox_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          failure_count: number | null
          id: string
          last_success_at: string | null
          p256dh: string
          player_id: string
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          failure_count?: number | null
          id?: string
          last_success_at?: string | null
          p256dh: string
          player_id: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          failure_count?: number | null
          id?: string
          last_success_at?: string | null
          p256dh?: string
          player_id?: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_withdrawals: {
        Row: {
          created_at: string
          deadline_status: string
          event_id: string
          group_id: string
          id: string
          list_type_snapshot: Database["public"]["Enums"]["list_type"]
          metadata: Json
          player_id: string
          player_name_snapshot: string
          registration_id: string
          removal_source: string
          removed_at: string
          removed_by_admin_user_id: string | null
          removed_by_player_id: string | null
          withdrawal_note: string | null
        }
        Insert: {
          created_at?: string
          deadline_status: string
          event_id: string
          group_id: string
          id?: string
          list_type_snapshot: Database["public"]["Enums"]["list_type"]
          metadata?: Json
          player_id: string
          player_name_snapshot: string
          registration_id: string
          removal_source: string
          removed_at?: string
          removed_by_admin_user_id?: string | null
          removed_by_player_id?: string | null
          withdrawal_note?: string | null
        }
        Update: {
          created_at?: string
          deadline_status?: string
          event_id?: string
          group_id?: string
          id?: string
          list_type_snapshot?: Database["public"]["Enums"]["list_type"]
          metadata?: Json
          player_id?: string
          player_name_snapshot?: string
          registration_id?: string
          removal_source?: string
          removed_at?: string
          removed_by_admin_user_id?: string | null
          removed_by_player_id?: string | null
          withdrawal_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_withdrawals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "volleyball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_withdrawals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_withdrawals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_withdrawals_removed_by_player_id_fkey"
            columns: ["removed_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          attendance_status: string | null
          cancelled_at: string | null
          cancelled_by_admin_user_id: string | null
          cancelled_by_player_id: string | null
          created_at: string
          event_id: string
          id: string
          list_type: Database["public"]["Enums"]["list_type"]
          player_id: string
          position_number: number
          registered_by_player_id: string
          registration_source: string | null
          verified_at: string | null
          verified_by_admin_user_id: string | null
        }
        Insert: {
          attendance_status?: string | null
          cancelled_at?: string | null
          cancelled_by_admin_user_id?: string | null
          cancelled_by_player_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          list_type: Database["public"]["Enums"]["list_type"]
          player_id: string
          position_number: number
          registered_by_player_id: string
          registration_source?: string | null
          verified_at?: string | null
          verified_by_admin_user_id?: string | null
        }
        Update: {
          attendance_status?: string | null
          cancelled_at?: string | null
          cancelled_by_admin_user_id?: string | null
          cancelled_by_player_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          list_type?: Database["public"]["Enums"]["list_type"]
          player_id?: string
          position_number?: number
          registered_by_player_id?: string
          registration_source?: string | null
          verified_at?: string | null
          verified_by_admin_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_cancelled_by_player_id_fkey"
            columns: ["cancelled_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "volleyball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_registered_by_player_id_fkey"
            columns: ["registered_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_weights: {
        Row: {
          attack_weight: number
          defense_reception_weight: number
          id: boolean
          movement_weight: number
          serve_weight: number
          setting_weight: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attack_weight?: number
          defense_reception_weight?: number
          id?: boolean
          movement_weight?: number
          serve_weight?: number
          setting_weight?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attack_weight?: number
          defense_reception_weight?: number
          id?: boolean
          movement_weight?: number
          serve_weight?: number
          setting_weight?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          registration_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          registration_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          registration_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          event_id: string
          id: string
          team_number: number
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          team_number: number
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          team_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "teams_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "volleyball_events"
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
      volleyball_events: {
        Row: {
          closes_at: string | null
          created_at: string
          end_time: string
          event_date: string
          group_id: string
          id: string
          location: string
          main_limit: number
          manual_override: boolean
          opens_at: string
          organizers_auto_enrolled_at: string | null
          penalty_late_leave: number | null
          penalty_no_show: number | null
          priority_minutes: number | null
          show_rules_to_players: boolean | null
          start_time: string
          status: Database["public"]["Enums"]["event_status"]
          timezone: string
          updated_at: string
          wait_limit: number | null
          withdrawal_deadline_time: string | null
          withdrawal_deadline_weekday: number | null
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          end_time: string
          event_date: string
          group_id: string
          id?: string
          location: string
          main_limit: number
          manual_override?: boolean
          opens_at: string
          organizers_auto_enrolled_at?: string | null
          penalty_late_leave?: number | null
          penalty_no_show?: number | null
          priority_minutes?: number | null
          show_rules_to_players?: boolean | null
          start_time: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          updated_at?: string
          wait_limit?: number | null
          withdrawal_deadline_time?: string | null
          withdrawal_deadline_weekday?: number | null
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          end_time?: string
          event_date?: string
          group_id?: string
          id?: string
          location?: string
          main_limit?: number
          manual_override?: boolean
          opens_at?: string
          organizers_auto_enrolled_at?: string | null
          penalty_late_leave?: number | null
          penalty_no_show?: number | null
          priority_minutes?: number | null
          show_rules_to_players?: boolean | null
          start_time?: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          updated_at?: string
          wait_limit?: number | null
          withdrawal_deadline_time?: string | null
          withdrawal_deadline_weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "volleyball_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_accept_incident_justification: {
        Args: {
          p_admin_notes?: string
          p_incident_id: string
          p_justification: string
        }
        Returns: Json
      }
      admin_add_fund_payment: {
        Args: {
          p_amount: number
          p_fund_id: string
          p_notes: string
          p_paid_at: string
          p_participant_id: string
          p_payer_name: string
          p_payment_method: string
        }
        Returns: Json
      }
      admin_add_organizer: {
        Args: {
          p_admin_user_id?: string
          p_group_id: string
          p_player_id: string
        }
        Returns: Json
      }
      admin_add_player:
        | {
            Args: {
              p_admin_user_id: string
              p_event_id: string
              p_force_override?: boolean
              p_list_type: Database["public"]["Enums"]["list_type"]
              p_target_player_id: string
            }
            Returns: {
              out_list_type: Database["public"]["Enums"]["list_type"]
              out_position_number: number
              out_registration_id: string
            }[]
          }
        | {
            Args: {
              p_admin_user_id: string
              p_event_id: string
              p_force_override?: boolean
              p_list_type: Database["public"]["Enums"]["list_type"]
              p_registration_source?: string
              p_target_player_id: string
            }
            Returns: {
              out_list_type: Database["public"]["Enums"]["list_type"]
              out_position_number: number
              out_registration_id: string
            }[]
          }
      admin_auto_enroll_organizers: {
        Args: { p_event_id: string }
        Returns: Json
      }
      admin_block_player: {
        Args: {
          p_admin_notes: string
          p_admin_user_id: string
          p_ends_at: string
          p_group_id?: string
          p_player_id: string
          p_reason: string
          p_scope?: string
          p_starts_at: string
        }
        Returns: string
      }
      admin_cancel_incident: {
        Args: { p_admin_notes: string; p_incident_id: string }
        Returns: Json
      }
      admin_create_fund_participant: {
        Args: {
          p_agreed_amount?: number
          p_exempt?: boolean
          p_fund_id?: string
          p_link_player_id?: string
          p_name?: string
          p_notes?: string
          p_participates?: boolean
          p_phone?: string
        }
        Returns: Json
      }
      admin_create_next_event_v2: {
        Args: { p_group_id?: string }
        Returns: Json
      }
      admin_deactivate_player: {
        Args: { p_admin_user_id: string; p_player_id: string; p_reason: string }
        Returns: undefined
      }
      admin_delete_fund_payment: {
        Args: { p_payment_id: string }
        Returns: Json
      }
      admin_delete_pending_accesses_batch: {
        Args: { p_admin_user_id?: string; p_requests: Json }
        Returns: Json
      }
      admin_delete_player:
        | { Args: { p_player_id: string }; Returns: undefined }
        | {
            Args: { p_admin_user_id: string; p_player_id: string }
            Returns: Json
          }
      admin_delete_players_batch: {
        Args: { p_admin_user_id?: string; p_player_ids: string[] }
        Returns: Json
      }
      admin_ensure_opening_organizers: {
        Args: { p_admin_user_id?: string; p_event_id: string }
        Returns: Json
      }
      admin_get_frequency_stats: {
        Args: {
          p_attention_limit?: number
          p_group_id?: string
          p_limit?: number
          p_page?: number
          p_recent_limit?: number
          p_search?: string
          p_sort_by?: string
          p_status_filter?: string
        }
        Returns: Json
      }
      admin_get_fund_config: { Args: { p_group_id?: string }; Returns: Json }
      admin_get_fund_dashboard: { Args: { p_fund_id?: string }; Returns: Json }
      admin_get_fund_participant: {
        Args: { p_participant_id: string }
        Returns: Json
      }
      admin_get_fund_payment: { Args: { p_payment_id: string }; Returns: Json }
      admin_get_player_attendance_history: {
        Args: { p_player_id: string }
        Returns: {
          attendance_status: string
          event_date: string
          event_id: string
          group_name: string
          list_type: Database["public"]["Enums"]["list_type"]
          verified_at: string
        }[]
      }
      admin_link_player_to_fund_participant: {
        Args: {
          p_fund_id: string
          p_participant_id: string
          p_player_id: string
        }
        Returns: Json
      }
      admin_list_events: {
        Args: { p_group_id?: string }
        Returns: {
          end_time: string
          event_date: string
          group_id: string
          group_name: string
          id: string
          is_current: boolean
          is_next: boolean
          location: string
          main_count: number
          main_limit: number
          opens_at: string
          start_time: string
          status: Database["public"]["Enums"]["event_status"]
          wait_count: number
        }[]
      }
      admin_list_fund_participants: {
        Args: { p_fund_id?: string; p_search?: string; p_status?: string }
        Returns: Json
      }
      admin_list_fund_payments: {
        Args: {
          p_from?: string
          p_fund_id?: string
          p_kind?: string
          p_limit?: number
          p_participant_id?: string
          p_search?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_list_funds: {
        Args: { p_filter?: string; p_group_id?: string }
        Returns: Json
      }
      admin_list_global_priorities: {
        Args: {
          p_admin_user_id?: string
          p_filter?: string
          p_limit?: number
          p_page?: number
          p_search?: string
        }
        Returns: Json
      }
      admin_list_group_priorities: {
        Args: {
          p_admin_user_id?: string
          p_group_id: string
          p_search?: string
        }
        Returns: {
          avatar_path: string
          has_priority: boolean
          name: string
          phone_normalized: string
          player_id: string
        }[]
      }
      admin_list_groups: {
        Args: never
        Returns: {
          active: boolean
          id: string
          name: string
          slug: string
          sort_order: number
        }[]
      }
      admin_list_pending_approvals: {
        Args: {
          p_group_id?: string
          p_search?: string
          p_status?: Database["public"]["Enums"]["player_group_status"]
        }
        Returns: {
          first_name: string
          group_id: string
          group_name: string
          last_name: string
          phone_normalized: string
          player_id: string
          rejection_reason: string
          requested_at: string
          status: Database["public"]["Enums"]["player_group_status"]
        }[]
      }
      admin_list_pending_avatars: {
        Args: never
        Returns: {
          avatar_path: string
          avatar_uploaded_at: string
          name: string
          player_id: string
        }[]
      }
      admin_list_players: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_query?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_list_players_to_review: {
        Args: { p_search?: string }
        Returns: {
          created_at: string
          first_name: string
          last_name: string
          last_participation_date: string
          last_participation_group_name: string
          phone_normalized: string
          player_id: string
          suggested_group_ids: string[]
        }[]
      }
      admin_move: {
        Args: {
          p_admin_user_id: string
          p_new_list: Database["public"]["Enums"]["list_type"]
          p_new_position: number
          p_registration_id: string
        }
        Returns: undefined
      }
      admin_preview_next_event: { Args: { p_group_id?: string }; Returns: Json }
      admin_process_group_request:
        | {
            Args: {
              p_group_id: string
              p_player_id: string
              p_reason?: string
              p_status: Database["public"]["Enums"]["player_group_status"]
            }
            Returns: undefined
          }
        | {
            Args: {
              p_admin_user_id?: string
              p_group_id: string
              p_player_id: string
              p_reason?: string
              p_status: Database["public"]["Enums"]["player_group_status"]
            }
            Returns: undefined
          }
      admin_reactivate_player: {
        Args: { p_admin_user_id: string; p_player_id: string }
        Returns: undefined
      }
      admin_remove_organizer: {
        Args: {
          p_admin_user_id?: string
          p_group_id: string
          p_player_id: string
        }
        Returns: Json
      }
      admin_remove_registration: {
        Args: { p_admin_user_id: string; p_registration_id: string }
        Returns: Json
      }
      admin_remove_registration_v2: {
        Args: { p_admin_user_id: string; p_registration_id: string }
        Returns: Json
      }
      admin_remove_registration_v3: {
        Args: { p_admin_user_id: string; p_registration_id: string }
        Returns: Json
      }
      admin_reorder_organizers: {
        Args: {
          p_admin_user_id?: string
          p_group_id: string
          p_player_ids: string[]
        }
        Returns: Json
      }
      admin_request_pin_reset: {
        Args: { p_admin_user_id?: string; p_player_id: string }
        Returns: {
          player_id: string
          revoked_sessions: number
        }[]
      }
      admin_revoke_all_sessions: {
        Args: { p_target_player_id: string }
        Returns: number
      }
      admin_save_attendance: {
        Args: { p_attendances: Json; p_event_id: string }
        Returns: Json
      }
      admin_save_reviewed_accesses: {
        Args: {
          p_admin_id: string
          p_group_ids: string[]
          p_player_ids: string[]
        }
        Returns: undefined
      }
      admin_save_reviewed_accesses_v2: {
        Args: {
          p_action?: string
          p_admin_id?: string
          p_group_ids: string[]
          p_player_ids: string[]
          p_reason?: string
        }
        Returns: undefined
      }
      admin_save_teams: {
        Args: {
          p_admin_user_id: string
          p_assignments: Json
          p_event_id: string
        }
        Returns: undefined
      }
      admin_search_players_for_fund_link: {
        Args: { p_fund_id: string; p_search: string }
        Returns: Json
      }
      admin_set_event_status: {
        Args: {
          p_admin_user_id: string
          p_event_id: string
          p_manual_override: boolean
          p_status: Database["public"]["Enums"]["event_status"]
        }
        Returns: undefined
      }
      admin_set_global_priority: {
        Args: {
          p_admin_user_id?: string
          p_has_priority: boolean
          p_player_id: string
        }
        Returns: undefined
      }
      admin_set_group_active: {
        Args: { p_active: boolean; p_group_id: string }
        Returns: {
          active: boolean
          id: string
          name: string
          slug: string
          sort_order: number
        }[]
      }
      admin_set_payment_reported: {
        Args: { p_participant_id: string; p_value: boolean }
        Returns: Json
      }
      admin_set_player_groups: {
        Args: { p_group_ids: string[]; p_player_id: string }
        Returns: Json
      }
      admin_set_player_priority: {
        Args: {
          p_admin_user_id?: string
          p_group_id: string
          p_has_priority: boolean
          p_player_id: string
        }
        Returns: undefined
      }
      admin_unblock_player: {
        Args: { p_admin_user_id: string; p_block_id: string }
        Returns: undefined
      }
      admin_unlink_player_from_fund_participant: {
        Args: {
          p_fund_id: string
          p_participant_id: string
          p_player_id: string
        }
        Returns: Json
      }
      admin_update_app_settings: {
        Args: {
          p_auto_close?: boolean
          p_auto_open?: boolean
          p_close_time?: string
          p_close_weekday?: number
          p_group_id: string
        }
        Returns: undefined
      }
      admin_update_fund_participant: {
        Args: {
          p_agreed_amount?: number
          p_exempt?: boolean
          p_name?: string
          p_notes?: string
          p_participant_id: string
          p_participates?: boolean
          p_phone?: string
        }
        Returns: Json
      }
      admin_update_fund_payment: {
        Args: {
          p_amount: number
          p_notes: string
          p_paid_at: string
          p_participant_id: string
          p_payer_name: string
          p_payment_id: string
          p_payment_method: string
        }
        Returns: Json
      }
      admin_update_guest_settings: {
        Args: {
          p_convidados_habilitados?: boolean
          p_dia_liberacao_convidado?: number
          p_group_id: string
          p_hora_liberacao_convidado?: string
          p_limite_convidados_por_usuario?: number
        }
        Returns: Json
      }
      admin_update_incident_notes: {
        Args: { p_admin_notes: string; p_incident_id: string }
        Returns: Json
      }
      admin_update_player_name: {
        Args: {
          p_admin_user_id: string
          p_new_name: string
          p_player_id: string
        }
        Returns: {
          name: string
          player_id: string
        }[]
      }
      admin_upsert_fund_config: {
        Args: {
          p_due_date: string
          p_fund_id?: string
          p_group_ids?: string[]
          p_is_active: boolean
          p_notes: string
          p_scope?: string
          p_title: string
          p_total_amount: number
        }
        Returns: Json
      }
      cleanup_expired: { Args: never; Returns: undefined }
      current_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      get_current_event_id: { Args: { p_group_id: string }; Returns: string }
      get_incidents_with_metrics: {
        Args: { p_group_id?: string }
        Returns: {
          admin_notes: string
          applied_rounds: number
          event_date: string
          event_id: string
          group_id: string
          group_name: string
          id: string
          incident_type: string
          justification: string
          metrics: Json
          occurred_at: string
          player_id: string
          player_name: string
          status: string
          suggested_rounds: number
        }[]
      }
      get_my_fund_status: {
        Args: { p_group_id?: string; p_token: string }
        Returns: {
          agreed_amount: number
          exempt: boolean
          fund_id: string
          linked: boolean
          outstanding: number
          participant_id: string
          participates: boolean
          status: string
          surplus: number
          total_paid: number
        }[]
      }
      get_my_group_accesses: {
        Args: { p_token: string }
        Returns: {
          group_id: string
          group_name: string
          has_priority: boolean
          is_organizer: boolean
          is_suspended: boolean
          rejection_reason: string
          status: Database["public"]["Enums"]["player_group_status"]
          suspended_until: string
          suspension_reason: string
        }[]
      }
      get_my_self_rating: {
        Args: never
        Returns: {
          attack_score: number | null
          block_score: number | null
          created_at: string
          defense_score: number | null
          height_cm: number | null
          id: string
          movement_score: number | null
          overall_level: number | null
          player_id: string
          positioning_score: number | null
          primary_position: string | null
          reception_score: number | null
          serve_score: number | null
          setting_score: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "player_self_ratings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_player_disciplinary_status: {
        Args: { p_group_id?: string; p_player_id: string }
        Returns: {
          active_penalties: number
          block_reason: string
          blocked_until: string
          is_blocked: boolean
          pending_incidents: number
        }[]
      }
      get_public_current_event: {
        Args: { p_group_id?: string }
        Returns: {
          closes_at: string
          end_time: string
          event_date: string
          group_id: string
          id: string
          location: string
          main_limit: number
          opens_at: string
          priority_minutes: number
          start_time: string
          status: Database["public"]["Enums"]["event_status"]
        }[]
      }
      get_public_fund_player_statuses: {
        Args: { p_group_id?: string }
        Returns: {
          has_paid: boolean
          player_id: string
          status: string
        }[]
      }
      get_public_fund_summary: {
        Args: { p_group_id?: string }
        Returns: {
          due_date: string
          fund_id: string
          is_active: boolean
          percent_collected: number
          remaining_balance: number
          scope: string
          surplus_amount: number
          title: string
          total_amount: number
          total_collected: number
        }[]
      }
      get_public_groups: {
        Args: never
        Returns: {
          event_date: string
          event_id: string
          id: string
          main_count: number
          main_limit: number
          name: string
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["event_status"]
          wait_count: number
        }[]
      }
      get_public_registrations: {
        Args: { p_event_id: string }
        Returns: {
          attendance_status: string
          created_at: string
          id: string
          is_guest: boolean
          list_type: Database["public"]["Enums"]["list_type"]
          player_avatar_path: string
          player_id: string
          player_name: string
          player_phone_normalized: string
          position_number: number
          primary_position: string
          registered_by_player_id: string
          verified_at: string
        }[]
      }
      get_public_settings: {
        Args: { p_group_id?: string }
        Returns: {
          end_time: string
          event_name: string
          event_weekday: number
          group_id: string
          group_name: string
          group_slug: string
          location: string
          main_limit: number
          priority_minutes: number
          show_rules_to_players: boolean
          start_time: string
          timezone: string
        }[]
      }
      get_public_teams: {
        Args: { p_event_id: string }
        Returns: {
          player_name: string
          position_number: number
          team_number: number
        }[]
      }
      get_server_now: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_pin: { Args: { p_pin: string }; Returns: string }
      hash_token: { Args: { p_token: string }; Returns: string }
      internal_active_fund_for_group: {
        Args: { p_group_id: string }
        Returns: string
      }
      internal_add_event_guest: {
        Args: { p_event_id: string; p_nome_convidado: string; p_token: string }
        Returns: {
          out_created_at: string
          out_guest_id: string
        }[]
      }
      internal_check_avatar_access: {
        Args: { p_target_id: string; p_viewer_id: string }
        Returns: boolean
      }
      internal_compute_next_round: {
        Args: { p_group_id: string }
        Returns: Json
      }
      internal_create_next_event: {
        Args: { p_admin_id?: string; p_group_id: string }
        Returns: Json
      }
      internal_create_session:
        | {
            Args: {
              p_ip: unknown
              p_player_id: string
              p_ttl_hours?: number
              p_user_agent: string
            }
            Returns: {
              session_id: string
              token_plain: string
            }[]
          }
        | {
            Args: {
              p_absolute_hours?: number
              p_ip: unknown
              p_player_id: string
              p_remember?: boolean
              p_ttl_hours?: number
              p_user_agent: string
            }
            Returns: {
              absolute_expires_at: string
              expires_at: string
              session_id: string
              token_plain: string
            }[]
          }
      internal_cycle_rounds: { Args: never; Returns: Json }
      internal_default_group_id: { Args: never; Returns: string }
      internal_delete_player_self: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      internal_fund_applies_to_group: {
        Args: { p_fund_id: string; p_group_id: string }
        Returns: boolean
      }
      internal_fund_participant_status:
        | {
            Args: {
              p_agreed_amount: number
              p_exempt: boolean
              p_paid: number
              p_participates: boolean
            }
            Returns: {
              balance: number
              credit: number
              paid: number
              status: string
            }[]
          }
        | {
            Args: {
              p_agreed_amount: number
              p_exempt: boolean
              p_paid: number
              p_participates: boolean
              p_payment_reported?: boolean
            }
            Returns: {
              balance: number
              credit: number
              paid: number
              status: string
            }[]
          }
      internal_get_my_full_history: {
        Args: { p_limit?: number; p_player_id: string }
        Returns: {
          cancelled_at: string
          created_at: string
          event_date: string
          event_id: string
          event_status: Database["public"]["Enums"]["event_status"]
          group_name: string
          id: string
          list_type: Database["public"]["Enums"]["list_type"]
          main_limit: number
          position_number: number
          start_time: string
        }[]
      }
      internal_get_my_registrations: {
        Args: { p_event_id: string; p_player_id: string }
        Returns: {
          id: string
          is_responsible: boolean
          is_self: boolean
          list_type: Database["public"]["Enums"]["list_type"]
          player_id: string
          player_name: string
          position_number: number
        }[]
      }
      internal_get_player: {
        Args: { p_player_id: string }
        Returns: {
          avatar_path: string
          avatar_status: Database["public"]["Enums"]["avatar_status"]
          id: string
          must_change_pin: boolean
          name: string
          needs_photo: boolean
          phone_normalized: string
        }[]
      }
      internal_get_player_v2: {
        Args: { p_player_id: string }
        Returns: {
          avatar_path: string
          has_valid_photo: boolean
          id: string
          name: string
          phone_normalized: string
          role: string
        }[]
      }
      internal_is_blocked:
        | {
            Args: { p_event_date: string; p_player_id: string }
            Returns: boolean
          }
        | {
            Args: {
              p_event_date: string
              p_group_id: string
              p_player_id: string
            }
            Returns: boolean
          }
      internal_join_event: {
        Args: {
          p_event_id: string
          p_force_override?: boolean
          p_responsible_player_id: string
          p_target_player_id: string
        }
        Returns: {
          out_list_type: Database["public"]["Enums"]["list_type"]
          out_position_number: number
          out_registration_id: string
        }[]
      }
      internal_leave_registration: {
        Args: { p_registration_id: string; p_requester_player_id: string }
        Returns: Json
      }
      internal_leave_registration_v2: {
        Args: {
          p_confirm_late_leave?: boolean
          p_player_id: string
          p_registration_id: string
        }
        Returns: Json
      }
      internal_leave_registration_v3: {
        Args: {
          p_confirm_late_leave?: boolean
          p_note?: string
          p_player_id: string
          p_registration_id: string
        }
        Returns: Json
      }
      internal_login_player: {
        Args: {
          p_ip: unknown
          p_phone: string
          p_pin: string
          p_remember?: boolean
          p_user_agent: string
        }
        Returns: {
          absolute_expires_at: string
          expires_at: string
          player_id: string
          remember: boolean
          requires_reset: boolean
          session_id: string
          token_plain: string
        }[]
      }
      internal_normalize_fund_state: {
        Args: {
          p_agreed_amount: number
          p_exempt: boolean
          p_participates: boolean
        }
        Returns: {
          agreed_amount: number
          exempt: boolean
          participates: boolean
        }[]
      }
      internal_player_is_paid_up:
        | { Args: { p_player_id: string }; Returns: boolean }
        | {
            Args: { p_group_id: string; p_player_id: string }
            Returns: boolean
          }
      internal_player_is_paid_up_fund: {
        Args: { p_fund_id: string; p_player_id: string }
        Returns: boolean
      }
      internal_process_active_block: {
        Args: {
          p_admin_user_id: string
          p_block_id: string
          p_fail_after?: number
        }
        Returns: number
      }
      internal_process_due_event_openings: { Args: never; Returns: undefined }
      internal_process_event_opening:
        | { Args: { p_event_id: string }; Returns: Json }
        | { Args: { p_event_id: string; p_force?: boolean }; Returns: Json }
      internal_reset_pin: {
        Args: {
          p_current_pin: string
          p_ip: unknown
          p_new_pin: string
          p_phone: string
          p_remember?: boolean
          p_user_agent: string
        }
        Returns: {
          absolute_expires_at: string
          expires_at: string
          player_id: string
          remember: boolean
          session_id: string
          token_plain: string
        }[]
      }
      internal_revoke_session: { Args: { p_token: string }; Returns: undefined }
      internal_search_players: {
        Args: { p_event_id: string; p_query: string; p_session_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      internal_signup_player:
        | {
            Args: {
              p_ip: unknown
              p_name: string
              p_phone: string
              p_pin: string
              p_user_agent: string
            }
            Returns: {
              player_id: string
              session_id: string
              token_plain: string
            }[]
          }
        | {
            Args: {
              p_ip: unknown
              p_name: string
              p_phone: string
              p_pin: string
              p_remember?: boolean
              p_user_agent: string
            }
            Returns: {
              absolute_expires_at: string
              expires_at: string
              player_id: string
              remember: boolean
              session_id: string
              token_plain: string
            }[]
          }
      internal_signup_player_v2:
        | {
            Args: {
              p_first_name: string
              p_group_ids: string[]
              p_ip: unknown
              p_last_name: string
              p_phone: string
              p_pin: string
              p_remember?: boolean
              p_user_agent: string
            }
            Returns: {
              absolute_expires_at: string
              expires_at: string
              player_id: string
              remember: boolean
              session_id: string
              token_plain: string
            }[]
          }
        | {
            Args: {
              p_first_name: string
              p_group_ids: string[]
              p_ip: string
              p_last_name: string
              p_phone: string
              p_pin: string
              p_remember: boolean
              p_user_agent: string
            }
            Returns: {
              player_id: string
              token_plain: string
            }[]
          }
      internal_signup_player_v3: {
        Args: {
          p_avatar_path?: string
          p_first_name: string
          p_group_ids: string[]
          p_ip?: string
          p_last_name: string
          p_phone: string
          p_pin: string
          p_remember?: boolean
          p_user_agent?: string
        }
        Returns: {
          player_id: string
          token_plain: string
        }[]
      }
      internal_sync_event_status: {
        Args: {
          p_calculated_status: string
          p_event_id: string
          p_group_id: string
        }
        Returns: undefined
      }
      internal_update_player_name: {
        Args: { p_new_name: string; p_player_id: string }
        Returns: {
          name: string
          player_id: string
        }[]
      }
      internal_validate_disciplinary_status: {
        Args: {
          p_event_id: string
          p_force_override?: boolean
          p_group_id: string
          p_player_id: string
        }
        Returns: undefined
      }
      internal_validate_session: { Args: { p_token: string }; Returns: string }
      is_event_active: { Args: { p_event_id: string }; Returns: boolean }
      lock_event: { Args: { p_event_id: string }; Returns: undefined }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
      player_is_paid_up: {
        Args: { p_group_id: string; p_player_id: string }
        Returns: boolean
      }
      player_needs_photo: { Args: { p_player_id: string }; Returns: boolean }
      player_request_group_access: {
        Args: { p_group_id: string; p_token: string }
        Returns: undefined
      }
      process_push_outbox: { Args: never; Returns: undefined }
      push_notifications_cleanup: { Args: never; Returns: undefined }
      tick_events: { Args: never; Returns: undefined }
      verify_pin: { Args: { p_hash: string; p_pin: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      avatar_status: "none" | "pending" | "approved" | "rejected"
      event_status: "scheduled" | "open" | "closed" | "completed" | "cancelled"
      list_type: "main" | "wait"
      notification_type:
        | "registration_opened"
        | "promoted_to_main"
        | "teams_published"
        | "event_changed"
        | "event_cancelled"
        | "organization_announcement"
        | "withdrawal_deadline"
        | "payment_pending"
        | "registration_confirmed"
        | "waitlist_joined"
        | "access_approved"
        | "access_rejected"
      player_group_status: "pending" | "approved" | "rejected" | "suspended"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
      avatar_status: ["none", "pending", "approved", "rejected"],
      event_status: ["scheduled", "open", "closed", "completed", "cancelled"],
      list_type: ["main", "wait"],
      notification_type: [
        "registration_opened",
        "promoted_to_main",
        "teams_published",
        "event_changed",
        "event_cancelled",
        "organization_announcement",
        "withdrawal_deadline",
        "payment_pending",
        "registration_confirmed",
        "waitlist_joined",
        "access_approved",
        "access_rejected",
      ],
      player_group_status: ["pending", "approved", "rejected", "suspended"],
    },
  },
} as const
