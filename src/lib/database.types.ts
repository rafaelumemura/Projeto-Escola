export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
          created_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          plan?: "free" | "basic" | "complete" | "pro";
          created_at?: string;
        };
        Update: {
          name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          plan?: "free" | "basic" | "complete" | "pro";
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
