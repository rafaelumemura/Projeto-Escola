export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type PlanningPdfSkill = "grade" | "layout_fundo_1" | "layout_fundo_2" | "layout_fundo_3" | "layout_fundo_4" | "layout_fundo_5" | "layout_fundo_6" | "layout_fundo_7" | "layout_fundo_8" | "layout_fundo_9";
type ThemePreference = "light" | "dark";

type ActivityRow = {
  id: string;
  user_id: string;
  title: string;
  age_range: string | null;
  methodology: string | null;
  development_area: string | null;
  activity_type: string | null;
  environment: string | null;
  materials: string | null;
  objective: string | null;
  estimated_time: string | null;
  bncc_code: string | null;
  description: string | null;
  steps: Json | null;
  teacher_tips: Json | null;
  variations: Json | null;
  safety_notes: string | null;
  evaluation: string | null;
  raw_ai_response: Json | null;
  created_at: string;
  updated_at: string;
};

type ActivityInsert = {
  id?: string;
  user_id: string;
  title: string;
  age_range?: string | null;
  methodology?: string | null;
  development_area?: string | null;
  activity_type?: string | null;
  environment?: string | null;
  materials?: string | null;
  objective?: string | null;
  estimated_time?: string | null;
  bncc_code?: string | null;
  description?: string | null;
  steps?: Json | null;
  teacher_tips?: Json | null;
  variations?: Json | null;
  safety_notes?: string | null;
  evaluation?: string | null;
  raw_ai_response?: Json | null;
  created_at?: string;
  updated_at?: string;
};

type ActivityUpdate = {
  title?: string;
  age_range?: string | null;
  methodology?: string | null;
  development_area?: string | null;
  activity_type?: string | null;
  environment?: string | null;
  materials?: string | null;
  objective?: string | null;
  estimated_time?: string | null;
  bncc_code?: string | null;
  description?: string | null;
  steps?: Json | null;
  teacher_tips?: Json | null;
  variations?: Json | null;
  safety_notes?: string | null;
  evaluation?: string | null;
  raw_ai_response?: Json | null;
  updated_at?: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string | null;
          email: string | null;
          avatar_url: string | null;
          is_admin: boolean;
          plan: "free" | "basic" | "complete" | "pro";
          planning_pdf_skill: PlanningPdfSkill;
          theme_preference: ThemePreference;
          password_must_change: boolean;
          material_printable_v2: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          plan?: "free" | "basic" | "complete" | "pro";
          planning_pdf_skill?: PlanningPdfSkill;
          theme_preference?: ThemePreference;
          password_must_change?: boolean;
          material_printable_v2?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          plan?: "free" | "basic" | "complete" | "pro";
          planning_pdf_skill?: PlanningPdfSkill;
          theme_preference?: ThemePreference;
          password_must_change?: boolean;
          material_printable_v2?: boolean;
        };
      };
      activities: {
        Row: ActivityRow;
        Insert: ActivityInsert;
        Update: ActivityUpdate;
      };
      collections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          color?: string | null;
          updated_at?: string;
        };
      };
      collection_activities: {
        Row: {
          id: string;
          collection_id: string;
          activity_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          collection_id: string;
          activity_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      weekly_plans: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          start_date: string | null;
          end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          start_date?: string | null;
          end_date?: string | null;
          updated_at?: string;
        };
      };
      weekly_plan_items: {
        Row: {
          id: string;
          weekly_plan_id: string;
          activity_id: string | null;
          date: string;
          start_time: string | null;
          end_time: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          weekly_plan_id: string;
          activity_id?: string | null;
          date: string;
          start_time?: string | null;
          end_time?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          activity_id?: string | null;
          date?: string;
          start_time?: string | null;
          end_time?: string | null;
          notes?: string | null;
        };
      };
      printable_assets: {
        Row: {
          id: string;
          theme: string;
          asset_type:
            | "background"
            | "frame"
            | "header"
            | "footer"
            | "character"
            | "decorations"
            | "stickers"
            | "object"
            | "animal"
            | "food"
            | "school_object"
            | "nature"
            | "shape"
            | "theme_element";
          style: string;
          age_min: number;
          age_max: number;
          tags: string[];
          storage_bucket: string;
          storage_path: string;
          public_url: string | null;
          prompt: string | null;
          provider: string;
          usage_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          theme: string;
          asset_type:
            | "background"
            | "frame"
            | "header"
            | "footer"
            | "character"
            | "decorations"
            | "stickers"
            | "object"
            | "animal"
            | "food"
            | "school_object"
            | "nature"
            | "shape"
            | "theme_element";
          style?: string;
          age_min?: number;
          age_max?: number;
          tags?: string[];
          storage_bucket?: string;
          storage_path: string;
          public_url?: string | null;
          prompt?: string | null;
          provider?: string;
          usage_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          theme?: string;
          asset_type?:
            | "background"
            | "frame"
            | "header"
            | "footer"
            | "character"
            | "decorations"
            | "stickers"
            | "object"
            | "animal"
            | "food"
            | "school_object"
            | "nature"
            | "shape"
            | "theme_element";
          style?: string;
          age_min?: number;
          age_max?: number;
          tags?: string[];
          storage_bucket?: string;
          storage_path?: string;
          public_url?: string | null;
          prompt?: string | null;
          provider?: string;
          usage_count?: number;
          updated_at?: string;
        };
      };
      printable_ai_generations: {
        Row: {
          id: string;
          user_id: string;
          activity_id: string | null;
          briefing_json: Json;
          prompt_version: string;
          generated_at: string;
          generation_time: number | null;
          status: "success" | "failed";
          error_message: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          activity_id?: string | null;
          briefing_json?: Json;
          prompt_version: string;
          generated_at?: string;
          generation_time?: number | null;
          status: "success" | "failed";
          error_message?: string | null;
        };
        Update: {
          user_id?: string;
          activity_id?: string | null;
          briefing_json?: Json;
          prompt_version?: string;
          generated_at?: string;
          generation_time?: number | null;
          status?: "success" | "failed";
          error_message?: string | null;
        };
      };
      billing_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_key: "free" | "basic" | "complete" | "pro";
          status: "active" | "past_due" | "suspended" | "canceled";
          activity_limit: number;
          generated_count: number;
          current_period_start: string;
          current_period_end: string;
          grace_ends_at: string | null;
          suspended_at: string | null;
          inactive_delete_after: string | null;
          canceled_at: string | null;
          provider: string | null;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          provider_product_id: string | null;
          provider_offer_code: string | null;
          last_provider_event_id: string | null;
          last_payment_transaction_id: string | null;
          next_charge_at: string | null;
          status_reason: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_key: "free" | "basic" | "complete" | "pro";
          status?: "active" | "past_due" | "suspended" | "canceled";
          activity_limit: number;
          generated_count?: number;
          current_period_start?: string;
          current_period_end: string;
          grace_ends_at?: string | null;
          suspended_at?: string | null;
          inactive_delete_after?: string | null;
          canceled_at?: string | null;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          provider_product_id?: string | null;
          provider_offer_code?: string | null;
          last_provider_event_id?: string | null;
          last_payment_transaction_id?: string | null;
          next_charge_at?: string | null;
          status_reason?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          plan_key?: "free" | "basic" | "complete" | "pro";
          status?: "active" | "past_due" | "suspended" | "canceled";
          activity_limit?: number;
          generated_count?: number;
          current_period_start?: string;
          current_period_end?: string;
          grace_ends_at?: string | null;
          suspended_at?: string | null;
          inactive_delete_after?: string | null;
          canceled_at?: string | null;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          provider_product_id?: string | null;
          provider_offer_code?: string | null;
          last_provider_event_id?: string | null;
          last_payment_transaction_id?: string | null;
          next_charge_at?: string | null;
          status_reason?: string | null;
          cancel_at_period_end?: boolean;
          updated_at?: string;
        };
      };
      hotmart_events: {
        Row: {
          id: string;
          provider_event_id: string;
          event_type: string;
          status: "processing" | "processed" | "ignored" | "failed";
          transaction_id: string | null;
          subscription_id: string | null;
          buyer_email: string | null;
          product_id: string | null;
          offer_code: string | null;
          user_id: string | null;
          payload: Json;
          result: Json | null;
          last_error: string | null;
          attempt_count: number;
          received_at: string;
          processed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider_event_id: string;
          event_type: string;
          status?: "processing" | "processed" | "ignored" | "failed";
          transaction_id?: string | null;
          subscription_id?: string | null;
          buyer_email?: string | null;
          product_id?: string | null;
          offer_code?: string | null;
          user_id?: string | null;
          payload: Json;
          result?: Json | null;
          last_error?: string | null;
          attempt_count?: number;
          received_at?: string;
          processed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          status?: "processing" | "processed" | "ignored" | "failed";
          user_id?: string | null;
          result?: Json | null;
          last_error?: string | null;
          attempt_count?: number;
          processed_at?: string | null;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
