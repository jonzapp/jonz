export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_deletions: {
        Row: {
          away_ids: string[]
          created_at: string
          deletes_at: string
          ended_at: string | null
          id: string
          pass_resumed_at: string | null
          pass_stopped_at: string | null
          requested_at: string
          requested_by: string
          state: string
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          away_ids?: string[]
          created_at?: string
          deletes_at: string
          ended_at?: string | null
          id?: string
          pass_resumed_at?: string | null
          pass_stopped_at?: string | null
          requested_at?: string
          requested_by: string
          state?: string
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          away_ids?: string[]
          created_at?: string
          deletes_at?: string
          ended_at?: string | null
          id?: string
          pass_resumed_at?: string | null
          pass_stopped_at?: string | null
          requested_at?: string
          requested_by?: string
          state?: string
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: number
          reason: string | null
          target_id: string | null
          target_kind: string
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: never
          reason?: string | null
          target_id?: string | null
          target_kind: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: never
          reason?: string | null
          target_id?: string | null
          target_kind?: string
        }
        Relationships: []
      }
      api_approvals: {
        Row: {
          approved_at: string | null
          client_id: string | null
          created_at: string
          declined_at: string | null
          expires_at: string
          house_id: string | null
          id: string
          input: Json
          operation: string
          request_hash: string
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          client_id?: string | null
          created_at?: string
          declined_at?: string | null
          expires_at: string
          house_id?: string | null
          id?: string
          input?: Json
          operation: string
          request_hash: string
          updated_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          client_id?: string | null
          created_at?: string
          declined_at?: string | null
          expires_at?: string
          house_id?: string | null
          id?: string
          input?: Json
          operation?: string
          request_hash?: string
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_approvals_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_approvals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_owners: {
        Row: {
          added_at: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_role_permissions: {
        Row: {
          created_at: string
          permission: string
          role: string
        }
        Insert: {
          created_at?: string
          permission: string
          role: string
        }
        Update: {
          created_at?: string
          permission?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["name"]
          },
        ]
      }
      ask_chats: {
        Row: {
          created_at: string
          house_id: string
          id: string
          title: string
          turns: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          title: string
          turns?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          house_id?: string
          id?: string
          title?: string
          turns?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ask_chats_house_id_user_id_fkey"
            columns: ["house_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["house_id", "user_id"]
          },
        ]
      }
      assignments: {
        Row: {
          absent_at: string | null
          awaits_ok: boolean
          category: string
          changed_at: string | null
          changed_by: string | null
          closes_at: string | null
          cover_hold_ends_at: string | null
          cover_told_at: string | null
          covered_by: string | null
          created_at: string
          dealt: Json | null
          done_at: string | null
          due_at: string
          excused: boolean
          flagged_at: string | null
          flagged_by: string | null
          group_name: string | null
          handed_by_away_period_id: string | null
          handed_from_user_id: string | null
          house_id: string
          id: string
          job_id: string | null
          john_id: string | null
          name: string
          needs_photo: boolean
          ok_asked_at: string | null
          okayed_at: string | null
          okayed_by: string | null
          original_due_at: string | null
          outcome: string | null
          pay_minor: number
          photo_path: string | null
          planned_at: string | null
          points: number
          reminded: number
          settled_at: string | null
          user_id: string
          week_id: string
        }
        Insert: {
          absent_at?: string | null
          awaits_ok?: boolean
          category: string
          changed_at?: string | null
          changed_by?: string | null
          closes_at?: string | null
          cover_hold_ends_at?: string | null
          cover_told_at?: string | null
          covered_by?: string | null
          created_at?: string
          dealt?: Json | null
          done_at?: string | null
          due_at: string
          excused?: boolean
          flagged_at?: string | null
          flagged_by?: string | null
          group_name?: string | null
          handed_by_away_period_id?: string | null
          handed_from_user_id?: string | null
          house_id: string
          id?: string
          job_id?: string | null
          john_id?: string | null
          name: string
          needs_photo?: boolean
          ok_asked_at?: string | null
          okayed_at?: string | null
          okayed_by?: string | null
          original_due_at?: string | null
          outcome?: string | null
          pay_minor?: number
          photo_path?: string | null
          planned_at?: string | null
          points: number
          reminded?: number
          settled_at?: string | null
          user_id: string
          week_id: string
        }
        Update: {
          absent_at?: string | null
          awaits_ok?: boolean
          category?: string
          changed_at?: string | null
          changed_by?: string | null
          closes_at?: string | null
          cover_hold_ends_at?: string | null
          cover_told_at?: string | null
          covered_by?: string | null
          created_at?: string
          dealt?: Json | null
          done_at?: string | null
          due_at?: string
          excused?: boolean
          flagged_at?: string | null
          flagged_by?: string | null
          group_name?: string | null
          handed_by_away_period_id?: string | null
          handed_from_user_id?: string | null
          house_id?: string
          id?: string
          job_id?: string | null
          john_id?: string | null
          name?: string
          needs_photo?: boolean
          ok_asked_at?: string | null
          okayed_at?: string | null
          okayed_by?: string | null
          original_due_at?: string | null
          outcome?: string | null
          pay_minor?: number
          photo_path?: string | null
          planned_at?: string | null
          points?: number
          reminded?: number
          settled_at?: string | null
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_covered_by_fkey"
            columns: ["covered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_handed_by_away_period_id_house_id_fkey"
            columns: ["handed_by_away_period_id", "house_id"]
            isOneToOne: false
            referencedRelation: "away_periods"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "assignments_handed_from_user_id_fkey"
            columns: ["handed_from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_john_id_house_id_fkey"
            columns: ["john_id", "house_id"]
            isOneToOne: false
            referencedRelation: "johns"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "assignments_okayed_by_fkey"
            columns: ["okayed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_week_id_house_id_fkey"
            columns: ["week_id", "house_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id", "house_id"]
          },
        ]
      }
      away_periods: {
        Row: {
          created_at: string
          ends_on: string
          house_id: string
          id: string
          note: string | null
          starts_on: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          house_id: string
          id?: string
          note?: string | null
          starts_on: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          house_id?: string
          id?: string
          note?: string | null
          starts_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "away_periods_house_id_user_id_fkey"
            columns: ["house_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["house_id", "user_id"]
          },
        ]
      }
      connected_apps: {
        Row: {
          access: string
          client_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access?: string
          client_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access?: string
          client_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_apps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          assignment_id: string
          created_at: string
          helper: boolean
          house_id: string
          job_id: string
          points: number
          user_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          helper?: boolean
          house_id: string
          job_id: string
          points: number
          user_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          helper?: boolean
          house_id?: string
          job_id?: string
          points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_assignment_id_house_id_fkey"
            columns: ["assignment_id", "house_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "crew_members_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_votes: {
        Row: {
          created_at: string
          dispute_id: string
          uphold: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          dispute_id: string
          uphold: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          dispute_id?: string
          uphold?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_votes_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          assignment_id: string
          closes_at: string
          created_at: string
          house_id: string
          id: string
          photo_path: string | null
          raised_by: string | null
          reason: string
          resolution: string | null
          resolved_at: string | null
          tick_at: string
        }
        Insert: {
          assignment_id: string
          closes_at: string
          created_at?: string
          house_id: string
          id?: string
          photo_path?: string | null
          raised_by?: string | null
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          tick_at: string
        }
        Update: {
          assignment_id?: string
          closes_at?: string
          created_at?: string
          house_id?: string
          id?: string
          photo_path?: string | null
          raised_by?: string | null
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          tick_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_assignment_id_house_id_fkey"
            columns: ["assignment_id", "house_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "disputes_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          assignment_id: string | null
          created_at: string
          data: Json
          house_id: string
          id: string
          kind: string
          told_at: string | null
          user_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          data?: Json
          house_id: string
          id?: string
          kind: string
          told_at?: string | null
          user_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          data?: Json
          house_id?: string
          id?: string
          kind?: string
          told_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_assignment_id_house_id_fkey"
            columns: ["assignment_id", "house_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "events_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          house_id: string
          user_id: string
        }
        Insert: {
          group_id: string
          house_id: string
          user_id: string
        }
        Update: {
          group_id?: string
          house_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_house_id_fkey"
            columns: ["group_id", "house_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "group_members_house_id_user_id_fkey"
            columns: ["house_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["house_id", "user_id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          house_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          house_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      house_actions: {
        Row: {
          assignment_id: string | null
          created_at: string
          data: Json
          done_by: string | null
          house_id: string
          id: string
          kind: string
          ref: string | null
          subject_user_id: string | null
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          data?: Json
          done_by?: string | null
          house_id: string
          id?: string
          kind: string
          ref?: string | null
          subject_user_id?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          data?: Json
          done_by?: string | null
          house_id?: string
          id?: string
          kind?: string
          ref?: string | null
          subject_user_id?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_actions_assignment_id_house_id_fkey"
            columns: ["assignment_id", "house_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "house_actions_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_actions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_actions_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_actions_undone_by_fkey"
            columns: ["undone_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      house_drafts: {
        Row: {
          created_at: string
          house_id: string | null
          id: string
          input_tokens: number
          johns: number
          outcome: string
          output_tokens: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          house_id?: string | null
          id?: string
          input_tokens?: number
          johns?: number
          outcome: string
          output_tokens?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          house_id?: string | null
          id?: string
          input_tokens?: number
          johns?: number
          outcome?: string
          output_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_drafts_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      house_pass_billing: {
        Row: {
          created_at: string
          house_id: string
          stripe_customer_id: string
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          house_id: string
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          house_id?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_pass_billing_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      houses: {
        Row: {
          away_makeup: number
          cover_grace_hours: number
          created_at: string
          created_by: string | null
          currency: string
          deal_budget: number
          deal_mode: string
          dispute_hours: number
          first_dealt_at: string | null
          id: string
          join_code: string
          kind: string
          late_forfeit_minor: number
          late_hours: number
          missed_forfeit_minor: number
          name: string
          next_kind: string | null
          next_kind_on: string | null
          pass_bought_by: string | null
          pass_ends_at: string | null
          pass_plan: string
          pocket_cap_minor: number
          settle_in: string
          stake_minor: number
          ticked_at: string | null
          timezone: string
          week_starts: number
        }
        Insert: {
          away_makeup?: number
          cover_grace_hours?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_budget?: number
          deal_mode?: string
          dispute_hours?: number
          first_dealt_at?: string | null
          id?: string
          join_code?: string
          kind?: string
          late_forfeit_minor?: number
          late_hours?: number
          missed_forfeit_minor?: number
          name: string
          next_kind?: string | null
          next_kind_on?: string | null
          pass_bought_by?: string | null
          pass_ends_at?: string | null
          pass_plan?: string
          pocket_cap_minor?: number
          settle_in?: string
          stake_minor?: number
          ticked_at?: string | null
          timezone?: string
          week_starts?: number
        }
        Update: {
          away_makeup?: number
          cover_grace_hours?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_budget?: number
          deal_mode?: string
          dispute_hours?: number
          first_dealt_at?: string | null
          id?: string
          join_code?: string
          kind?: string
          late_forfeit_minor?: number
          late_hours?: number
          missed_forfeit_minor?: number
          name?: string
          next_kind?: string | null
          next_kind_on?: string | null
          pass_bought_by?: string | null
          pass_ends_at?: string | null
          pass_plan?: string
          pocket_cap_minor?: number
          settle_in?: string
          stake_minor?: number
          ticked_at?: string | null
          timezone?: string
          week_starts?: number
        }
        Relationships: [
          {
            foreignKeyName: "houses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "houses_pass_bought_by_fkey"
            columns: ["pass_bought_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      johns: {
        Row: {
          anchor_month: number | null
          anchor_week: number
          archived_at: string | null
          category: string
          created_at: string
          crew: number
          due_dow: number
          due_time: string
          every_months: number | null
          every_weeks: number
          group_id: string | null
          house_id: string
          id: string
          keep_day: boolean
          kind: string
          min_age: number | null
          name: string
          needs_photo: boolean
          pay_minor: number
          per_week: number
          points: number
          respond_hours: number
          week_of_month: number | null
        }
        Insert: {
          anchor_month?: number | null
          anchor_week: number
          archived_at?: string | null
          category?: string
          created_at?: string
          crew?: number
          due_dow?: number
          due_time?: string
          every_months?: number | null
          every_weeks?: number
          group_id?: string | null
          house_id: string
          id?: string
          keep_day?: boolean
          kind?: string
          min_age?: number | null
          name: string
          needs_photo?: boolean
          pay_minor?: number
          per_week?: number
          points?: number
          respond_hours?: number
          week_of_month?: number | null
        }
        Update: {
          anchor_month?: number | null
          anchor_week?: number
          archived_at?: string | null
          category?: string
          created_at?: string
          crew?: number
          due_dow?: number
          due_time?: string
          every_months?: number | null
          every_weeks?: number
          group_id?: string | null
          house_id?: string
          id?: string
          keep_day?: boolean
          kind?: string
          min_age?: number | null
          name?: string
          needs_photo?: boolean
          pay_minor?: number
          per_week?: number
          points?: number
          respond_hours?: number
          week_of_month?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "johns_group_in_house"
            columns: ["group_id", "house_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "johns_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_minor: number
          assignment_id: string | null
          counterparty_user_id: string | null
          created_at: string
          doers: string[] | null
          house_id: string
          id: number
          kind: string
          month: string
          user_id: string
        }
        Insert: {
          amount_minor: number
          assignment_id?: string | null
          counterparty_user_id?: string | null
          created_at?: string
          doers?: string[] | null
          house_id: string
          id?: never
          kind: string
          month: string
          user_id: string
        }
        Update: {
          amount_minor?: number
          assignment_id?: string | null
          counterparty_user_id?: string | null
          created_at?: string
          doers?: string[] | null
          house_id?: string
          id?: never
          kind?: string
          month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_assignment_id_house_id_fkey"
            columns: ["assignment_id", "house_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "ledger_entries_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          best_time: string | null
          born_year: number | null
          house_id: string
          immunity_tokens: number
          joined_at: string
          moving_out_on: string | null
          rather: Json
          role: string
          signs_in: boolean
          streak: number
          suits_days: number[]
          swap_tokens: number
          user_id: string
        }
        Insert: {
          best_time?: string | null
          born_year?: number | null
          house_id: string
          immunity_tokens?: number
          joined_at?: string
          moving_out_on?: string | null
          rather?: Json
          role?: string
          signs_in?: boolean
          streak?: number
          suits_days?: number[]
          swap_tokens?: number
          user_id: string
        }
        Update: {
          best_time?: string | null
          born_year?: number | null
          house_id?: string
          immunity_tokens?: number
          joined_at?: string
          moving_out_on?: string | null
          rather?: Json
          role?: string
          signs_in?: boolean
          streak?: number
          suits_days?: number[]
          swap_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      month_closes: {
        Row: {
          closed_at: string
          created_at: string
          house_id: string
          month: string
        }
        Insert: {
          closed_at?: string
          created_at?: string
          house_id: string
          month: string
        }
        Update: {
          closed_at?: string
          created_at?: string
          house_id?: string
          month?: string
        }
        Relationships: [
          {
            foreignKeyName: "month_closes_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      month_let_offs: {
        Row: {
          created_at: string
          house_id: string
          let_off_by: string | null
          month: string
        }
        Insert: {
          created_at?: string
          house_id: string
          let_off_by?: string | null
          month: string
        }
        Update: {
          created_at?: string
          house_id?: string
          let_off_by?: string | null
          month?: string
        }
        Relationships: [
          {
            foreignKeyName: "month_let_offs_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "month_let_offs_let_off_by_fkey"
            columns: ["let_off_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moves: {
        Row: {
          created_at: string
          from_house_id: string
          how: string | null
          id: string
          left_at: string
          moved_at: string | null
          pass_ends_at: string | null
          pass_placed_at: string | null
          pass_plan: string | null
          pass_state: string | null
          pass_stopped_at: string | null
          reminded_at: string | null
          to_house_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          from_house_id: string
          how?: string | null
          id?: string
          left_at?: string
          moved_at?: string | null
          pass_ends_at?: string | null
          pass_placed_at?: string | null
          pass_plan?: string | null
          pass_state?: string | null
          pass_stopped_at?: string | null
          reminded_at?: string | null
          to_house_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          from_house_id?: string
          how?: string | null
          id?: string
          left_at?: string
          moved_at?: string | null
          pass_ends_at?: string | null
          pass_placed_at?: string | null
          pass_plan?: string | null
          pass_state?: string | null
          pass_stopped_at?: string | null
          reminded_at?: string | null
          to_house_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moves_from_house_id_fkey"
            columns: ["from_house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moves_to_house_id_fkey"
            columns: ["to_house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moving_pass_billing: {
        Row: {
          created_at: string
          move_id: string
          stripe_customer_id: string
          stripe_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          move_id: string
          stripe_customer_id: string
          stripe_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          move_id?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moving_pass_billing_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: true
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          kind: string
          link_label: string | null
          link_url: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind: string
          link_label?: string | null
          link_url?: string | null
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          link_label?: string | null
          link_url?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          checks: boolean
          created_at: string
          deal: boolean
          flags: boolean
          quiet_from: number | null
          quiet_until: number | null
          reminders: boolean
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checks?: boolean
          created_at?: string
          deal?: boolean
          flags?: boolean
          quiet_from?: number | null
          quiet_until?: number | null
          reminders?: boolean
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          checks?: boolean
          created_at?: string
          deal?: boolean
          flags?: boolean
          quiet_from?: number | null
          quiet_until?: number | null
          reminders?: boolean
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      on_call_picks: {
        Row: {
          house_id: string
          john_id: string
          user_id: string
          week_id: string
        }
        Insert: {
          house_id: string
          john_id: string
          user_id: string
          week_id: string
        }
        Update: {
          house_id?: string
          john_id?: string
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "on_call_picks_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_call_picks_john_id_house_id_fkey"
            columns: ["john_id", "house_id"]
            isOneToOne: false
            referencedRelation: "johns"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "on_call_picks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_call_picks_week_id_house_id_fkey"
            columns: ["week_id", "house_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id", "house_id"]
          },
        ]
      }
      owner_ask_chats: {
        Row: {
          created_at: string
          id: string
          title: string
          turns: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title: string
          turns?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          turns?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_ask_chats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_ask_turns: {
        Row: {
          asked_at: string
          created_at: string
          id: string
          input_tokens: number
          output_tokens: number
          owner_id: string
          question: string
          reply: string | null
        }
        Insert: {
          asked_at?: string
          created_at?: string
          id?: string
          input_tokens?: number
          output_tokens?: number
          owner_id?: string
          question: string
          reply?: string | null
        }
        Update: {
          asked_at?: string
          created_at?: string
          id?: string
          input_tokens?: number
          output_tokens?: number
          owner_id?: string
          question?: string
          reply?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_ask_turns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_message_outbox: {
        Row: {
          message_id: string
          user_id: string
        }
        Insert: {
          message_id: string
          user_id: string
        }
        Update: {
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_message_outbox_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "owner_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_message_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_messages: {
        Row: {
          audience: string
          body: string
          by_email: boolean
          by_push: boolean
          by_wall: boolean
          created_at: string
          house_id: string | null
          id: string
          people: number
          person_id: string | null
          sent_at: string
          sent_by: string | null
          subject: string
          walls: number
        }
        Insert: {
          audience: string
          body: string
          by_email: boolean
          by_push: boolean
          by_wall: boolean
          created_at?: string
          house_id?: string | null
          id?: string
          people: number
          person_id?: string | null
          sent_at?: string
          sent_by?: string | null
          subject: string
          walls?: number
        }
        Update: {
          audience?: string
          body?: string
          by_email?: boolean
          by_push?: boolean
          by_wall?: boolean
          created_at?: string
          house_id?: string | null
          id?: string
          people?: number
          person_id?: string | null
          sent_at?: string
          sent_by?: string | null
          subject?: string
          walls?: number
        }
        Relationships: [
          {
            foreignKeyName: "owner_messages_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_messages_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          about: string
          created_at: string
          name: string
          scope: string
        }
        Insert: {
          about: string
          created_at?: string
          name: string
          scope?: string
        }
        Update: {
          about?: string
          created_at?: string
          name?: string
          scope?: string
        }
        Relationships: []
      }
      pocket_earnings: {
        Row: {
          amount_minor: number
          assignment_id: string
          created_at: string
          house_id: string
          month: string
          user_id: string
        }
        Insert: {
          amount_minor: number
          assignment_id: string
          created_at?: string
          house_id: string
          month: string
          user_id: string
        }
        Update: {
          amount_minor?: number
          assignment_id?: string
          created_at?: string
          house_id?: string
          month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocket_earnings_assignment_id_house_id_fkey"
            columns: ["assignment_id", "house_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "pocket_earnings_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocket_earnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pocket_pays: {
        Row: {
          amount_minor: number
          created_at: string
          house_id: string
          id: string
          month: string
          paid_by: string | null
          user_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          house_id: string
          id?: string
          month: string
          paid_by?: string | null
          user_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          house_id?: string
          id?: string
          month?: string
          paid_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocket_pays_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocket_pays_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocket_pays_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          id: string
          language: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          id: string
          language?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
          language?: string | null
        }
        Relationships: []
      }
      promotion_people: {
        Row: {
          created_at: string
          email: string
          emailed_at: string | null
          opened_at: string | null
          promotion_id: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          emailed_at?: string | null
          opened_at?: string | null
          promotion_id: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          emailed_at?: string | null
          opened_at?: string | null
          promotion_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_people_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_uses: {
        Row: {
          created_at: string
          email: string
          house_id: string | null
          id: string
          plan: string | null
          promotion_id: string
          session: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          house_id?: string | null
          id?: string
          plan?: string | null
          promotion_id: string
          session?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          house_id?: string | null
          id?: string
          plan?: string | null
          promotion_id?: string
          session?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_uses_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_uses_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_uses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          amount_off: Json | null
          audience: string
          code: string
          created_at: string
          duration: string | null
          ends_at: string | null
          id: string
          kind: string
          made_at: string
          made_by: string | null
          max_uses: number | null
          months: number | null
          name: string
          note: string | null
          percent_off: number | null
          plans: string[]
          state: string
          stopped_at: string | null
          stripe_coupon_id: string | null
          stripe_promotion_code_id: string | null
        }
        Insert: {
          amount_off?: Json | null
          audience: string
          code: string
          created_at?: string
          duration?: string | null
          ends_at?: string | null
          id?: string
          kind: string
          made_at?: string
          made_by?: string | null
          max_uses?: number | null
          months?: number | null
          name: string
          note?: string | null
          percent_off?: number | null
          plans?: string[]
          state?: string
          stopped_at?: string | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
        }
        Update: {
          amount_off?: Json | null
          audience?: string
          code?: string
          created_at?: string
          duration?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          made_at?: string
          made_by?: string | null
          max_uses?: number | null
          months?: number | null
          name?: string
          note?: string | null
          percent_off?: number | null
          plans?: string[]
          state?: string
          stopped_at?: string | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_made_by_fkey"
            columns: ["made_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          created_at: string
          event_id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          kind: string
          user_id?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_messages: {
        Row: {
          author_name: string | null
          body: string
          created_at: string
          email_id: string | null
          from_owner: boolean
          id: number
          report_id: string
          written_by: string | null
        }
        Insert: {
          author_name?: string | null
          body: string
          created_at?: string
          email_id?: string | null
          from_owner: boolean
          id?: never
          report_id: string
          written_by?: string | null
        }
        Update: {
          author_name?: string | null
          body?: string
          created_at?: string
          email_id?: string | null
          from_owner?: boolean
          id?: never
          report_id?: string
          written_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_messages_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_messages_written_by_fkey"
            columns: ["written_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: Json | null
          email_id: string | null
          from_email: string | null
          from_name: string | null
          house_id: string | null
          id: string
          kind: string
          last_activity_at: string
          same_as_report_id: string | null
          seen_at: string
          shots: string[]
          source: string
          state: string
          subject: string | null
          user_id: string | null
          words: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          email_id?: string | null
          from_email?: string | null
          from_name?: string | null
          house_id?: string | null
          id?: string
          kind: string
          last_activity_at?: string
          same_as_report_id?: string | null
          seen_at?: string
          shots?: string[]
          source?: string
          state?: string
          subject?: string | null
          user_id?: string | null
          words: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          email_id?: string | null
          from_email?: string | null
          from_name?: string | null
          house_id?: string | null
          id?: string
          kind?: string
          last_activity_at?: string
          same_as_report_id?: string | null
          seen_at?: string
          shots?: string[]
          source?: string
          state?: string
          subject?: string | null
          user_id?: string | null
          words?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_same_as_report_id_fkey"
            columns: ["same_as_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission: string
          role: string
        }
        Insert: {
          created_at?: string
          permission: string
          role: string
        }
        Update: {
          created_at?: string
          permission?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["name"]
          },
        ]
      }
      support_drafts: {
        Row: {
          action: string
          created_at: string
          drafted_by: string | null
          id: string
          input_tokens: number
          output_tokens: number
          reply: string
          report_id: string
          report_message_id: number | null
          same_as_report_id: string | null
          state: string
          updated_at: string
          why: string
        }
        Insert: {
          action?: string
          created_at?: string
          drafted_by?: string | null
          id?: string
          input_tokens?: number
          output_tokens?: number
          reply?: string
          report_id: string
          report_message_id?: number | null
          same_as_report_id?: string | null
          state?: string
          updated_at?: string
          why?: string
        }
        Update: {
          action?: string
          created_at?: string
          drafted_by?: string | null
          id?: string
          input_tokens?: number
          output_tokens?: number
          reply?: string
          report_id?: string
          report_message_id?: number | null
          same_as_report_id?: string | null
          state?: string
          updated_at?: string
          why?: string
        }
        Relationships: []
      }
      swap_offers: {
        Row: {
          answer: string | null
          answered_at: string | null
          asked_assignment_id: string
          asked_by: string
          asked_user_id: string
          asker_assignment_id: string
          created_at: string
          expires_at: string
          house_id: string
          id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asked_assignment_id: string
          asked_by: string
          asked_user_id: string
          asker_assignment_id: string
          created_at?: string
          expires_at: string
          house_id: string
          id?: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asked_assignment_id?: string
          asked_by?: string
          asked_user_id?: string
          asker_assignment_id?: string
          created_at?: string
          expires_at?: string
          house_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_offers_asked_assignment_id_house_id_fkey"
            columns: ["asked_assignment_id", "house_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "swap_offers_asked_by_fkey"
            columns: ["asked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_offers_asked_user_id_fkey"
            columns: ["asked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_offers_asker_assignment_id_house_id_fkey"
            columns: ["asker_assignment_id", "house_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "swap_offers_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      week_group_shares: {
        Row: {
          created_at: string
          group_id: string
          house_id: string
          share: number
          user_id: string
          week_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          house_id: string
          share: number
          user_id: string
          week_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          house_id?: string
          share?: number
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_group_shares_group_id_house_id_fkey"
            columns: ["group_id", "house_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "house_id"]
          },
          {
            foreignKeyName: "week_group_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_group_shares_week_id_house_id_fkey"
            columns: ["week_id", "house_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id", "house_id"]
          },
        ]
      }
      week_shares: {
        Row: {
          house_id: string
          share: number
          user_id: string
          week_id: string
        }
        Insert: {
          house_id: string
          share: number
          user_id: string
          week_id: string
        }
        Update: {
          house_id?: string
          share?: number
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_shares_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_shares_week_id_house_id_fkey"
            columns: ["week_id", "house_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id", "house_id"]
          },
        ]
      }
      weeks: {
        Row: {
          ahead: Json
          closed_at: string | null
          created_at: string
          ends_at: string
          house_id: string
          id: string
          skipped_at: string | null
          skipped_by: string | null
          starts_at: string
          starts_on: string
          turns: Json | null
          waiting: Json
        }
        Insert: {
          ahead?: Json
          closed_at?: string | null
          created_at?: string
          ends_at: string
          house_id: string
          id?: string
          skipped_at?: string | null
          skipped_by?: string | null
          starts_at: string
          starts_on: string
          turns?: Json | null
          waiting?: Json
        }
        Update: {
          ahead?: Json
          closed_at?: string | null
          created_at?: string
          ends_at?: string
          house_id?: string
          id?: string
          skipped_at?: string | null
          skipped_by?: string | null
          starts_at?: string
          starts_on?: string
          turns?: Json | null
          waiting?: Json
        }
        Relationships: [
          {
            foreignKeyName: "weeks_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_deletion_preview: { Args: never; Returns: Json }
      account_deletion_status: { Args: never; Returns: Json }
      add_correction: {
        Args: {
          p_amount: number
          p_assignment: string
          p_house: string
          p_month: string
          p_user: string
        }
        Returns: number[]
      }
      admin_reset: {
        Args: {
          p_actor: string
          p_apply?: boolean
          p_forfeits?: Json
          p_house: string
          p_kind: string
          p_target: Json
        }
        Returns: Json
      }
      answer_tick: {
        Args: { p_assignment: string; p_ok: boolean }
        Returns: string
      }
      api_approval: { Args: { p_id: string }; Returns: Json }
      api_pre_request: { Args: never; Returns: undefined }
      apply_next_kind: { Args: { p_house: string; p_now: string }; Returns: boolean }
      set_house_kind: {
        Args: { p_house: string; p_kind: string }
        Returns: string
      }
      owner_make_promotion: {
        Args: {
          p_amount: Json | null
          p_audience: string
          p_code: string
          p_duration: string | null
          p_ends_at: string | null
          p_kind: string
          p_max_uses: number | null
          p_months: number | null
          p_name: string
          p_note: string | null
          p_people: string[]
          p_percent: number | null
          p_plans: string[]
        }
        Returns: string
      }
      owner_promotion: { Args: { p_id: string }; Returns: Json }
      owner_promotion_emails: {
        Args: { p_id: string }
        Returns: {
          email: string
          name: string
        }[]
      }
      owner_promotions_count: {
        Args: { p_q?: string; p_state?: string; p_who?: string }
        Returns: number
      }
      owner_promotions_find: {
        Args: { p_q?: string; p_state?: string; p_who?: string }
        Returns: {
          amount_off: Json
          audience: string
          code: string
          duration: string
          ends_at: string
          id: string
          kind: string
          made_at: string
          max_uses: number
          months: number
          name: string
          people: number
          percent_off: number
          plans: string[]
          state: string
          uses: number
        }[]
      }
      owner_promotions_page: {
        Args: {
          p_cursor_at?: string
          p_cursor_id?: string
          p_limit?: number
          p_q?: string
          p_state?: string
          p_who?: string
        }
        Returns: {
          amount_off: Json
          audience: string
          code: string
          duration: string
          ends_at: string
          id: string
          kind: string
          made_at: string
          max_uses: number
          months: number
          name: string
          people: number
          percent_off: number
          plans: string[]
          state: string
          uses: number
        }[]
      }
      owner_stop_promotion: { Args: { p_id: string }; Returns: string }
      board_tick: { Args: { p_assignment: string }; Returns: undefined }
      pay_pocket_money: {
        Args: { p_house: string; p_kid: string; p_month: string }
        Returns: number
      }
      add_kid: {
        Args: { p_parent: string; p_kid: string; p_born: number }
        Returns: string
      }
      promotion_opened: {
        Args: { p_email: string; p_id: string }
        Returns: undefined
      }
      promotion_ready: {
        Args: { p_code: string; p_coupon: string; p_id: string }
        Returns: undefined
      }
      promotion_state: {
        Args: { p: Database["public"]["Tables"]["promotions"]["Row"] }
        Returns: string
      }
      promotion_use: {
        Args: {
          p_email: string
          p_house: string | null
          p_id: string
          p_plan: string | null
          p_session: string | null
          p_strict: boolean
          p_user: string | null
        }
        Returns: boolean
      }
      runs_for: {
        Args: { p_house: string; p_kid: string }
        Returns: boolean
      }
      answer_api_approval: {
        Args: { p_approve: boolean; p_id: string }
        Returns: undefined
      }
      answer_dispute: {
        Args: { p_dispute: string; p_photo_path: string }
        Returns: boolean
      }
      answer_swap: {
        Args: { p_accept: boolean; p_offer: string }
        Returns: undefined
      }
      can: { Args: { h: string; perm: string }; Returns: boolean }
      can_app: { Args: { perm: string }; Returns: boolean }
      can_upload_proof: { Args: { object_name: string }; Returns: boolean }
      cancel_away: { Args: { p_away: string }; Returns: undefined }
      cast_vote: {
        Args: { p_dispute: string; p_uphold: boolean }
        Returns: undefined
      }
      checked_place: {
        Args: { a: Database["public"]["Tables"]["assignments"]["Row"] }
        Returns: string
      }
      ask_usage: {
        Args: { p_house: string; p_since: string; p_user: string }
        Returns: { house_used: number; mine_used: number }[]
      }
      ask_account_used: {
        Args: { p_since: string; p_user: string }
        Returns: { oldest: string; used: number }[]
      }
      ask_usage_people: {
        Args: { p_house: string; p_since: string }
        Returns: { used: number; user_id: string }[]
      }
      claim_ask_turn: {
        Args: {
          p_account: number
          p_account_since: string
          p_house: string
          p_pool: number
          p_reserve: number
          p_share: number
          p_since: string
          p_user: string
          p_user_day: number
        }
        Returns: { room: number; turn: string }[]
      }
      claim_owner_ask: {
        Args: { p_limit: number; p_question: string }
        Returns: string
      }
      claim_support_draft: {
        Args: { p_limit: number; p_message: number | null; p_report: string }
        Returns: Json
      }
      close_month: {
        Args: { p_entries: Json; p_house: string; p_month: string }
        Returns: boolean
      }
      close_week: {
        Args: { p_members: Json; p_week: string }
        Returns: boolean
      }
      closes_at: {
        Args: {
          a: Database["public"]["Tables"]["assignments"]["Row"]
          week_ends: string
        }
        Returns: string
      }
      confirm_payment: {
        Args: {
          p_amount: number
          p_from: string
          p_house: string
          p_via?: string
        }
        Returns: undefined
      }
      cover_john: {
        Args: { p_assignment: string; p_photo_path?: string }
        Returns: undefined
      }
      cover_opens_at: {
        Args: {
          a: Database["public"]["Tables"]["assignments"]["Row"]
          grace: number
          week_ends: string
        }
        Returns: string
      }
      create_house: {
        Args: {
          p_currency: string
          p_kind?: string
          p_name: string
          p_timezone: string
          p_week_starts: number
        }
        Returns: string
      }
      credited_to: {
        Args: { a: Database["public"]["Tables"]["assignments"]["Row"] }
        Returns: string
      }
      deal_week: {
        Args: {
          p_assignments: Json
          p_ends_at: string
          p_house: string
          p_on_call?: Json
          p_replace?: boolean
          p_shares: Json
          p_starts_at: string
          p_starts_on: string
          p_state?: Json
        }
        Returns: string
      }
      deletion_away: { Args: { p_until: string; p_user: string }; Returns: string[] }
      delete_group: { Args: { p_group: string }; Returns: undefined }
      end_account_deletion: {
        Args: { p_action: string; p_reason: string; p_user: string }
        Returns: undefined
      }
      end_deletion_away: { Args: { p_away: string }; Returns: undefined }
      end_notice: { Args: { p_id: string }; Returns: undefined }
      finish_account_deletion: { Args: { p_user: string }; Returns: undefined }
      flag_sharers: { Args: { p_john: string }; Returns: string[] }
      hand_over: { Args: { p_house: string; p_to: string }; Returns: undefined }
      house_balances: {
        Args: { p_before: string; p_house: string }
        Returns: {
          credited: number
          owed: number
          user_id: string
        }[]
      }
      house_group_balances: {
        Args: { p_before: string; p_house: string }
        Returns: {
          credited: number
          group_id: string
          owed: number
          user_id: string
        }[]
      }
      hold_cover: { Args: { p_assignment: string }; Returns: string }
      house_by_code: {
        Args: { p_code: string }
        Returns: {
          currency: string
          id: string
          kind: string
          late_forfeit_minor: number
          members: number
          missed_forfeit_minor: number
          name: string
          stake_minor: number
        }[]
      }
      house_history: {
        Args: { p_before?: string; p_house: string; p_limit?: number }
        Returns: {
          done_by: string
          assignment_id: string
          created_at: string
          data: Json
          id: string
          kind: string
          reach: string
          ref: string
          subject_user_id: string
          undone_at: string
          undone_by: string
        }[]
      }
      identity_photo: { Args: { data: Json }; Returns: string }
      is_member: { Args: { h: string }; Returns: boolean }
      house_has_paid_pass: { Args: { p_house: string }; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      join_house: { Args: { p_code: string }; Returns: string }
      keep_account: { Args: never; Returns: undefined }
      leave_pass: { Args: never; Returns: undefined }
      mark_done: {
        Args: { p_assignment: string; p_photo_path?: string }
        Returns: undefined
      }
      month_open: { Args: { p_at: string; p_house: string }; Returns: boolean }
      moving_on: {
        Args: never
        Returns: {
          from_house_id: string
          house_name: string
          house_pass_until: string | null
          johns: number
          left_at: string
          pass_plan: string | null
          pass_state: string | null
        }[]
      }
      my_app_permissions: { Args: never; Returns: string[] }
      my_app_role: { Args: never; Returns: string }
      my_app_access: { Args: never; Returns: Json }
      my_language: { Args: never; Returns: string }
      time_zones: { Args: never; Returns: string[] }
      my_permissions: { Args: { h: string }; Returns: string[] }
      my_open_assignment: {
        Args: { p_assignment: string; p_permission?: string }
        Returns: {
          absent_at: string | null
          category: string
          changed_at: string | null
          changed_by: string | null
          closes_at: string | null
          covered_by: string | null
          created_at: string
          dealt: Json | null
          done_at: string | null
          due_at: string
          due_moved_from: string | null
          excused: boolean
          flagged_at: string | null
          flagged_by: string | null
          group_name: string | null
          house_id: string
          id: string
          job_id: string | null
          john_id: string | null
          name: string
          needs_photo: boolean
          outcome: string | null
          photo_path: string | null
          planned_at: string | null
          points: number
          reminded: number
          settled_at: string | null
          user_id: string
          week_id: string
        }
        SetofOptions: {
          from: "*"
          to: "assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_reports: {
        Args: never
        Returns: {
          created_at: string
          id: string
          kind: string
          replies: number
          state: string
          unread: boolean
          last_activity_at: string
          words: string
        }[]
      }
      new_join_code: { Args: never; Returns: string }
      offer_swap: {
        Args: { p_mine: string; p_theirs: string }
        Returns: string
      }
      open_flag: {
        Args: { p_at: string; p_by?: string; p_john: string }
        Returns: string
      }
      finish_owner_ask: {
        Args: { p_input: number; p_output: number; p_reply: string; p_turn: string }
        Returns: undefined
      }
      finish_support_draft: {
        Args: { p_action: string; p_draft: string; p_input: number; p_output: number; p_reply: string; p_same_as: string | null; p_why: string }
        Returns: Json
      }
      owner_reset_house_data: {
        Args: { p_everything?: boolean; p_house: string; p_reason?: string }
        Returns: Json
      }
      owner_delete_house: {
        Args: {
          p_body?: string
          p_house: string
          p_reason?: string
          p_subject?: string
        }
        Returns: Json
      }
      owner_delete_now: {
        Args: { p_reason?: string; p_user: string }
        Returns: undefined
      }
      owner_deletions: {
        Args: never
        Returns: {
          deletes_at: string
          email: string
          house_name: string
          name: string
          requested_at: string
          requested_by: string
          user_id: string
        }[]
      }
      owner_deletions_count: {
        Args: {
          p_after?: string
          p_before?: string
          p_by?: string
          p_goes?: string
          p_q?: string
        }
        Returns: number
      }
      owner_deletions_page: {
        Args: {
          p_after?: string
          p_before?: string
          p_by?: string
          p_cursor_at?: string
          p_cursor_user?: string
          p_goes?: string
          p_limit?: number
          p_q?: string
        }
        Returns: {
          deletes_at: string
          email: string
          house_name: string
          name: string
          requested_at: string
          requested_by: string
          user_id: string
        }[]
      }
      owner_house: {
        Args: { p_house: string }
        Returns: Json
      }
      owner_houses_count: {
        Args: {
          p_active?: string
          p_after?: string
          p_before?: string
          p_pass?: string
          p_q?: string
        }
        Returns: number
      }
      owner_houses_find: {
        Args: { p_q: string }
        Returns: {
          id: string
          name: string
          people: number
        }[]
      }
      owner_houses_page: {
        Args: {
          p_active?: string
          p_after?: string
          p_before?: string
          p_cursor_at?: string
          p_cursor_id?: string
          p_limit?: number
          p_pass?: string
          p_q?: string
        }
        Returns: {
          created_at: string
          id: string
          join_code: string
          last_active: string | null
          name: string
          on_time: number
          pass_plan: string
          pass_ends_at: string | null
          people: number
          settled: number
          sort_at: string
        }[]
      }
      owner_message_people: {
        Args: { p_audience: string; p_house: string; p_person: string }
        Returns: {
          user_id: string
        }[]
      }
      owner_message_reach: {
        Args: { p_audience: string; p_house?: string; p_person?: string }
        Returns: Json
      }
      owner_messages_count: {
        Args: {
          p_after?: string
          p_audience?: string
          p_before?: string
          p_q?: string
          p_way?: string
        }
        Returns: number
      }
      owner_messages_find: {
        Args: {
          p_after?: string
          p_audience?: string
          p_before?: string
          p_q?: string
          p_way?: string
        }
        Returns: {
          audience: string
          body: string
          by_email: boolean
          by_push: boolean
          by_wall: boolean
          id: string
          people: number
          sent_at: string
          subject: string
          to_name: string
          waiting: number
          walls: number
        }[]
      }
      owner_messages_page: {
        Args: {
          p_after?: string
          p_audience?: string
          p_before?: string
          p_cursor_at?: string
          p_cursor_id?: string
          p_limit?: number
          p_q?: string
          p_way?: string
        }
        Returns: {
          audience: string
          body: string
          by_email: boolean
          by_push: boolean
          by_wall: boolean
          id: string
          people: number
          sent_at: string
          subject: string
          to_name: string
          waiting: number
          walls: number
        }[]
      }
      owner_overview: {
        Args: { p_span?: string; p_zone?: string }
        Returns: Json
      }
      owner_people_find: {
        Args: { p_q: string }
        Returns: {
          email: string
          house_id: string
          house_name: string
          id: string
          name: string
        }[]
      }
      owner_send_message: {
        Args: {
          p_audience: string
          p_body: string
          p_email: boolean
          p_house: string | null
          p_person: string | null
          p_push: boolean
          p_subject: string
          p_wall: boolean
        }
        Returns: Json
      }
      take_message_outbox: {
        Args: { p_limit?: number; p_message?: string }
        Returns: {
          body: string
          by_email: boolean
          by_push: boolean
          by_wall: boolean
          email: string
          message_id: string
          name: string
          subject: string
          user_id: string
          zone: string
        }[]
      }
      owner_open_report: { Args: { p_report: string }; Returns: Json }
      owner_reply_report: {
        Args: { p_body: string; p_report: string }
        Returns: Json
      }
      owner_reports_count: {
        Args: {
          p_after?: string
          p_before?: string
          p_from?: string
          p_kind?: string
          p_q?: string
          p_state?: string
        }
        Returns: number
      }
      owner_reports_page: {
        Args: {
          p_after?: string
          p_before?: string
          p_cursor_at?: string
          p_cursor_id?: string
          p_from?: string
          p_kind?: string
          p_limit?: number
          p_q?: string
          p_state?: string
        }
        Returns: {
          also: number
          created_at: string
          email: string
          house_name: string
          id: string
          kind: string
          name: string
          same_as_report_id: string
          source: string
          state: string
          subject: string
          last_activity_at: string
          user_id: string
          words: string
        }[]
      }
      owner_request_deletion: {
        Args: { p_email: string; p_reason?: string }
        Returns: string
      }
      owner_fix_report: {
        Args: { p_note?: string; p_report: string; p_tell?: boolean }
        Returns: Json
      }
      owner_same_as: {
        Args: { p_main: string; p_report: string }
        Returns: string
      }
      owner_same_as_find: {
        Args: { p_q?: string; p_report: string }
        Returns: {
          created_at: string
          id: string
          name: string
          state: string
          words: string
        }[]
      }
      owner_set_report_state: {
        Args: { p_report: string; p_state: string }
        Returns: undefined
      }
      owner_set_support_draft: {
        Args: { p_draft: string; p_state: string }
        Returns: undefined
      }
      owner_status: { Args: never; Returns: Json }
      owner_stop_deletion: {
        Args: { p_reason?: string; p_user: string }
        Returns: undefined
      }
      plan_john: {
        Args: { p_assignment: string; p_at: string }
        Returns: undefined
      }
      proof_house: { Args: { object_name: string }; Returns: string }
      push_action: {
        Args: {
          p_assignment: string
          p_dispute: string
          p_uphold: boolean
          p_user: string
        }
        Returns: undefined
      }
      quietly: { Args: { p_on: boolean }; Returns: undefined }
      raise_dispute: {
        Args: { p_assignment: string; p_reason: string }
        Returns: string
      }
      raise_flag: { Args: { p_john: string }; Returns: string }
      remove_flag: { Args: { p_assignment: string }; Returns: undefined }
      receive_email: {
        Args: {
          p_body: string
          p_email_id: string
          p_from: string
          p_name: string
          p_ref: string
          p_subject: string
          p_topic: string
          p_trusted: boolean
        }
        Returns: Json
      }
      recording: { Args: never; Returns: boolean }
      recount_streaks: { Args: { p_house: string }; Returns: undefined }
      remove_member: {
        Args: { p_house: string; p_user: string }
        Returns: undefined
      }
      request_account_deletion: { Args: never; Returns: string }
      request_tick: { Args: never; Returns: undefined }
      require_user: { Args: never; Returns: string }
      reset_house_data: {
        Args: { p_everything?: boolean; p_house: string }
        Returns: Json
      }
      reset_bump: {
        Args: { acc: Json; field: string; n: number; p_user: string }
        Returns: Json
      }
      reset_join_code: { Args: { p_house: string }; Returns: string }
      reset_reach: {
        Args: { x: Database["public"]["Tables"]["house_actions"]["Row"] }
        Returns: string
      }
      resolve_dispute: {
        Args: { p_dispute: string; p_resolution: string }
        Returns: boolean
      }
      place_pass: {
        Args: { p_house: string; p_move: string; p_state: string }
        Returns: undefined
      }
      record_moved_on: {
        Args: { p_how: string; p_to: string; p_user: string }
        Returns: undefined
      }
      roll_call: {
        Args: { p_assignment: string; p_crew: string[]; p_photo_path?: string }
        Returns: number
      }
      save_group: {
        Args: {
          p_group: string
          p_house: string
          p_members: string[]
          p_name: string
        }
        Returns: string
      }
      save_notice: {
        Args: {
          p_body: string
          p_ends_at: string | null
          p_id: string | null
          p_kind: string
          p_link_label: string | null
          p_link_url: string | null
          p_starts_at: string | null
          p_title: string
        }
        Returns: string
      }
      save_prefs: {
        Args: {
          p_best_time: string
          p_days: number[]
          p_house: string
          p_rather: Json
        }
        Returns: undefined
      }
      see_report: { Args: { p_report: string }; Returns: undefined }
      send_report: {
        Args: {
          p_details?: Json
          p_kind: string
          p_shots?: string[]
          p_words: string
        }
        Returns: string
      }
      set_away: {
        Args: { p_ends: string; p_note?: string; p_starts: string }
        Returns: number
      }
      set_member_role: {
        Args: { p_house: string; p_role: string; p_user: string }
        Returns: undefined
      }
      set_moving_out: { Args: { p_on: string | null }; Returns: undefined }
      set_app_access: {
        Args: { p_access: string; p_client_id: string }
        Returns: undefined
      }
      set_my_language: { Args: { p_language: string }; Returns: undefined }
      set_my_photo: { Args: { photo: string }; Returns: undefined }
      settle_assignments: { Args: { p_items: Json }; Returns: number }
      shares_house: { Args: { other: string }; Returns: boolean }
      start_away: {
        Args: { p_ends: string; p_note: string; p_starts: string; p_user: string }
        Returns: number
      }
      start_house_from: {
        Args: {
          p_currency: string
          p_from: string
          p_name: string
          p_timezone: string
          p_week_starts: number
        }
        Returns: string
      }
      undo_action: { Args: { p_action: string }; Returns: undefined }
      undo_cover: { Args: { p_assignment: string }; Returns: undefined }
      undo_done: { Args: { p_assignment: string }; Returns: undefined }
      undo_latest: {
        Args: { p_about?: string; p_kind: string }
        Returns: string
      }
      undo_reach: {
        Args: { x: Database["public"]["Tables"]["house_actions"]["Row"] }
        Returns: string
      }
      undo_reset: {
        Args: { x: Database["public"]["Tables"]["house_actions"]["Row"] }
        Returns: undefined
      }
      use_immunity: { Args: { p_assignment: string }; Returns: undefined }
      use_swap: {
        Args: { p_mine: string; p_theirs: string }
        Returns: undefined
      }
      user_can: {
        Args: { h: string; perm: string; who: string }
        Returns: boolean
      }
      write_back: {
        Args: { p_body: string; p_report: string }
        Returns: string
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

