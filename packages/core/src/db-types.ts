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
          delete_after: string
          ended_at: string | null
          id: string
          pass_resumed_at: string | null
          pass_stopped_at: string | null
          pass_subscription: string | null
          requested_at: string
          requested_by: string
          state: string
          user_id: string
        }
        Insert: {
          away_ids?: string[]
          delete_after: string
          ended_at?: string | null
          id?: string
          pass_resumed_at?: string | null
          pass_stopped_at?: string | null
          pass_subscription?: string | null
          requested_at?: string
          requested_by: string
          state?: string
          user_id: string
        }
        Update: {
          away_ids?: string[]
          delete_after?: string
          ended_at?: string | null
          id?: string
          pass_resumed_at?: string | null
          pass_stopped_at?: string | null
          pass_subscription?: string | null
          requested_at?: string
          requested_by?: string
          state?: string
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
          at: string
          before: Json | null
          id: number
          reason: string | null
          target_id: string | null
          target_kind: string
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          reason?: string | null
          target_id?: string | null
          target_kind: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          reason?: string | null
          target_id?: string | null
          target_kind?: string
        }
        Relationships: []
      }
      app_owners: {
        Row: {
          added_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          user_id?: string
        }
        Relationships: []
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
          pay_minor: number
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
          handed_by_away: string | null
          handed_from: string | null
          house_id: string
          id: string
          job_id: string | null
          john_id: string | null
          name: string
          needs_photo: boolean
          ok_asked_at: string | null
          okayed_at: string | null
          okayed_by: string | null
          outcome: string | null
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
          pay_minor?: number
          category: string
          changed_at?: string | null
          changed_by?: string | null
          closes_at?: string | null
          covered_by?: string | null
          created_at?: string
          dealt?: Json | null
          done_at?: string | null
          due_at: string
          due_moved_from?: string | null
          excused?: boolean
          flagged_at?: string | null
          flagged_by?: string | null
          group_name?: string | null
          handed_by_away?: string | null
          handed_from?: string | null
          house_id: string
          id?: string
          job_id?: string | null
          john_id?: string | null
          name: string
          needs_photo?: boolean
          ok_asked_at?: string | null
          okayed_at?: string | null
          okayed_by?: string | null
          outcome?: string | null
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
          pay_minor?: number
          category?: string
          changed_at?: string | null
          changed_by?: string | null
          closes_at?: string | null
          covered_by?: string | null
          created_at?: string
          dealt?: Json | null
          done_at?: string | null
          due_at?: string
          due_moved_from?: string | null
          excused?: boolean
          flagged_at?: string | null
          flagged_by?: string | null
          group_name?: string | null
          handed_by_away?: string | null
          handed_from?: string | null
          house_id?: string
          id?: string
          job_id?: string | null
          john_id?: string | null
          name?: string
          needs_photo?: boolean
          ok_asked_at?: string | null
          okayed_at?: string | null
          okayed_by?: string | null
          outcome?: string | null
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
            foreignKeyName: "assignments_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_john_id_fkey"
            columns: ["john_id"]
            isOneToOne: false
            referencedRelation: "johns"
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
            foreignKeyName: "assignments_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      away: {
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
            foreignKeyName: "away_house_id_user_id_fkey"
            columns: ["house_id", "user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["house_id", "user_id"]
          },
        ]
      }
      crew: {
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
            foreignKeyName: "crew_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_user_id_fkey"
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
            foreignKeyName: "disputes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
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
          user_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          data?: Json
          house_id: string
          id?: string
          kind: string
          user_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          data?: Json
          house_id?: string
          id?: string
          kind?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
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
          actor: string | null
          assignment_id: string | null
          created_at: string
          data: Json
          house_id: string
          id: string
          kind: string
          ref: string | null
          subject: string | null
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          actor?: string | null
          assignment_id?: string | null
          created_at?: string
          data?: Json
          house_id: string
          id?: string
          kind: string
          ref?: string | null
          subject?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          actor?: string | null
          assignment_id?: string | null
          created_at?: string
          data?: Json
          house_id?: string
          id?: string
          kind?: string
          ref?: string | null
          subject?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_actions_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_actions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
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
            foreignKeyName: "house_actions_subject_fkey"
            columns: ["subject"]
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
          house_id: string
          id: string
          input_tokens: number
          johns: number
          outcome: string
          output_tokens: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          input_tokens?: number
          johns?: number
          outcome: string
          output_tokens?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          house_id?: string
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
          house_id: string
          stripe_customer: string
          stripe_subscription: string | null
          updated_at: string
        }
        Insert: {
          house_id: string
          stripe_customer: string
          stripe_subscription?: string | null
          updated_at?: string
        }
        Update: {
          house_id?: string
          stripe_customer?: string
          stripe_subscription?: string | null
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
          pocket_cap_minor: number
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
          pass_buyer: string | null
          pass_plan: string
          pass_until: string | null
          settle_in: string
          stake_minor: number
          ticked_at: string | null
          timezone: string
          week_starts: number
        }
        Insert: {
          away_makeup?: number
          cover_grace_hours?: number
          pocket_cap_minor?: number
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
          pass_buyer?: string | null
          pass_plan?: string
          pass_until?: string | null
          settle_in?: string
          stake_minor?: number
          ticked_at?: string | null
          timezone?: string
          week_starts?: number
        }
        Update: {
          away_makeup?: number
          cover_grace_hours?: number
          pocket_cap_minor?: number
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
          pass_buyer?: string | null
          pass_plan?: string
          pass_until?: string | null
          settle_in?: string
          stake_minor?: number
          ticked_at?: string | null
          timezone?: string
          week_starts?: number
        }
        Relationships: [
          {
            foreignKeyName: "houses_pass_buyer_fkey"
            columns: ["pass_buyer"]
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
          min_age: number | null
          pay_minor: number
          kind: string
          name: string
          needs_photo: boolean
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
          min_age?: number | null
          pay_minor?: number
          kind?: string
          name: string
          needs_photo?: boolean
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
          min_age?: number | null
          pay_minor?: number
          kind?: string
          name?: string
          needs_photo?: boolean
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
      ledger: {
        Row: {
          amount_minor: number
          assignment_id: string | null
          counterparty: string | null
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
          counterparty?: string | null
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
          counterparty?: string | null
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
            foreignKeyName: "ledger_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_counterparty_fkey"
            columns: ["counterparty"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          born_year: number | null
          best_time: string | null
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
          born_year?: number | null
          best_time?: string | null
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
          born_year?: number | null
          best_time?: string | null
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
      moved_on: {
        Row: {
          from_house: string
          how: string | null
          id: string
          left_at: string
          moved_at: string | null
          pass_placed_at: string | null
          pass_plan: string | null
          pass_state: string | null
          pass_stopped_at: string | null
          pass_until: string | null
          reminded_at: string | null
          to_house: string | null
          user_id: string
        }
        Insert: {
          from_house: string
          how?: string | null
          id?: string
          left_at?: string
          moved_at?: string | null
          pass_placed_at?: string | null
          pass_plan?: string | null
          pass_state?: string | null
          pass_stopped_at?: string | null
          pass_until?: string | null
          reminded_at?: string | null
          to_house?: string | null
          user_id: string
        }
        Update: {
          from_house?: string
          how?: string | null
          id?: string
          left_at?: string
          moved_at?: string | null
          pass_placed_at?: string | null
          pass_plan?: string | null
          pass_state?: string | null
          pass_stopped_at?: string | null
          pass_until?: string | null
          reminded_at?: string | null
          to_house?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moved_on_from_house_fkey"
            columns: ["from_house"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moved_on_to_house_fkey"
            columns: ["to_house"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moved_on_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moving_pass_billing: {
        Row: {
          move_id: string
          stripe_customer: string
          stripe_subscription: string | null
        }
        Insert: {
          move_id: string
          stripe_customer: string
          stripe_subscription?: string | null
        }
        Update: {
          move_id?: string
          stripe_customer?: string
          stripe_subscription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moving_pass_billing_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: true
            referencedRelation: "moved_on"
            referencedColumns: ["id"]
          },
        ]
      }
      month_closes: {
        Row: {
          closed_at: string
          house_id: string
          month: string
        }
        Insert: {
          closed_at?: string
          house_id: string
          month: string
        }
        Update: {
          closed_at?: string
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
      permissions: {
        Row: {
          about: string
          name: string
        }
        Insert: {
          about: string
          name: string
        }
        Update: {
          about?: string
          name?: string
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
            foreignKeyName: "pocket_earnings_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignments"
            referencedColumns: ["id"]
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
        ]
      }
      owner_ask_turns: {
        Row: {
          asked_at: string
          id: string
          input_tokens: number
          output_tokens: number
          owner_id: string
          question: string
          reply: string | null
        }
        Insert: {
          asked_at?: string
          id?: string
          input_tokens?: number
          output_tokens?: number
          owner_id?: string
          question: string
          reply?: string | null
        }
        Update: {
          asked_at?: string
          id?: string
          input_tokens?: number
          output_tokens?: number
          owner_id?: string
          question?: string
          reply?: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      notification_prefs: {
        Row: {
          checks: boolean
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
      on_call: {
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
            foreignKeyName: "on_call_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_call_john_id_fkey"
            columns: ["john_id"]
            isOneToOne: false
            referencedRelation: "johns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_call_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_call_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
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
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
        }
        Relationships: []
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
          at: string
          author: string | null
          author_name: string | null
          body: string
          from_owner: boolean
          id: number
          report_id: string
        }
        Insert: {
          at?: string
          author?: string | null
          author_name?: string | null
          body: string
          from_owner: boolean
          id?: never
          report_id: string
        }
        Update: {
          at?: string
          author?: string | null
          author_name?: string | null
          body?: string
          from_owner?: boolean
          id?: never
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_messages_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: Json | null
          house_id: string | null
          id: string
          kind: string
          seen_at: string
          shots: string[]
          state: string
          updated_at: string
          user_id: string | null
          words: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          house_id?: string | null
          id?: string
          kind: string
          seen_at?: string
          shots?: string[]
          state?: string
          updated_at?: string
          user_id?: string | null
          words: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          house_id?: string | null
          id?: string
          kind?: string
          seen_at?: string
          shots?: string[]
          state?: string
          updated_at?: string
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
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role: string
        }
        Insert: {
          permission: string
          role: string
        }
        Update: {
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
      swap_offers: {
        Row: {
          answer: string | null
          answered_at: string | null
          asked_by: string
          asked_to: string
          created_at: string
          expires_at: string
          house_id: string
          id: string
          mine: string
          theirs: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asked_by: string
          asked_to: string
          created_at?: string
          expires_at: string
          house_id: string
          id?: string
          mine: string
          theirs: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asked_by?: string
          asked_to?: string
          created_at?: string
          expires_at?: string
          house_id?: string
          id?: string
          mine?: string
          theirs?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_offers_asked_by_fkey"
            columns: ["asked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_offers_asked_to_fkey"
            columns: ["asked_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_offers_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_offers_mine_fkey"
            columns: ["mine"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_offers_theirs_fkey"
            columns: ["theirs"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
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
            foreignKeyName: "week_shares_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
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
      pay_pocket_money: {
        Args: { p_house: string; p_kid: string; p_month: string }
        Returns: number
      }
      add_kid: {
        Args: { p_parent: string; p_kid: string; p_born: number }
        Returns: string
      }
      runs_for: {
        Args: { p_house: string; p_kid: string }
        Returns: boolean
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
      ask_usage_people: {
        Args: { p_house: string; p_since: string }
        Returns: { used: number; user_id: string }[]
      }
      claim_ask_turn: {
        Args: {
          p_house: string
          p_pool: number
          p_reserve: number
          p_share: number
          p_since: string
          p_user: string
          p_user_day: number
        }
        Returns: string
      }
      claim_owner_ask: {
        Args: { p_limit: number; p_question: string }
        Returns: string
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
      house_by_code: {
        Args: { p_code: string }
        Returns: {
          id: string
          kind: string
          members: number
          name: string
        }[]
      }
      house_history: {
        Args: { p_before?: string; p_house: string; p_limit?: number }
        Returns: {
          actor: string
          assignment_id: string
          created_at: string
          data: Json
          id: string
          kind: string
          reach: string
          ref: string
          subject: string
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
          from_house: string
          house_name: string
          house_pass_until: string | null
          johns: number
          left_at: string
          pass_plan: string | null
          pass_state: string | null
        }[]
      }
      my_permissions: { Args: { h: string }; Returns: string[] }
      my_open_assignment: {
        Args: { p_assignment: string }
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
          updated_at: string
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
      owner_delete_now: {
        Args: { p_reason?: string; p_user: string }
        Returns: undefined
      }
      owner_deletions: {
        Args: never
        Returns: {
          delete_after: string
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
          delete_after: string
          email: string
          house_name: string
          name: string
          requested_at: string
          requested_by: string
          user_id: string
        }[]
      }
      owner_houses_find: {
        Args: { p_q: string }
        Returns: {
          id: string
          name: string
          people: number
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
          p_kind?: string
          p_limit?: number
          p_q?: string
          p_state?: string
        }
        Returns: {
          created_at: string
          email: string
          house_name: string
          id: string
          kind: string
          name: string
          state: string
          updated_at: string
          user_id: string
          words: string
        }[]
      }
      owner_request_deletion: {
        Args: { p_email: string; p_reason?: string }
        Returns: string
      }
      owner_set_report_state: {
        Args: { p_report: string; p_state: string }
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
      recording: { Args: never; Returns: boolean }
      recount_streaks: { Args: { p_house: string }; Returns: undefined }
      remove_member: {
        Args: { p_house: string; p_user: string }
        Returns: undefined
      }
      request_account_deletion: { Args: never; Returns: string }
      request_tick: { Args: never; Returns: undefined }
      require_user: { Args: never; Returns: string }
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

