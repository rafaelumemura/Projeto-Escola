export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type PlanningPdfSkill = "grade" | "layout_fundo_1" | "layout_fundo_2" | "layout_fundo_3" | "layout_fundo_4" | "layout_fundo_5" | "layout_fundo_6" | "layout_fundo_7" | "layout_fundo_8" | "layout_fundo_9";
type ThemePreference = "light" | "dark";
type ThemeAccent = "teal" | "blue" | "coral" | "amber" | "purple" | "green";
type UiFontFamily = "inter" | "nunito" | "atkinson" | "open_sans" | "poppins";
type UiFontScale = "small" | "default" | "large" | "extra_large";
type StudentStatus = "active" | "inactive";
type ObservationType = "individual" | "activity" | "class" | "weekly" | "biweekly" | "free";
type ObservationAppliesTo = "all_class" | "selected_students" | "individual_student" | "none";
type AssessmentType = "exam" | "work" | "evaluative_activity" | "homework" | "project" | "participation" | "reading" | "other";
type AssessmentDeliveryStatus = "on_time" | "late" | "not_delivered" | "not_applicable";
type AssessmentParticipationLevel = "excellent" | "good" | "regular" | "low" | "not_evaluated";

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

type ClassRow = {
  id: string;
  user_id: string;
  name: string;
  shift: string | null;
  school_year: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type ClassInsert = {
  id?: string;
  user_id: string;
  name: string;
  shift?: string | null;
  school_year?: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ClassUpdate = {
  name?: string;
  shift?: string | null;
  school_year?: string | null;
  description?: string | null;
  updated_at?: string;
};

type StudentRow = {
  id: string;
  user_id: string;
  class_id: string;
  name: string;
  birth_date: string | null;
  general_notes: string | null;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
};

type StudentInsert = {
  id?: string;
  user_id: string;
  class_id: string;
  name: string;
  birth_date?: string | null;
  general_notes?: string | null;
  status?: StudentStatus;
  created_at?: string;
  updated_at?: string;
};

type StudentUpdate = {
  class_id?: string;
  name?: string;
  birth_date?: string | null;
  general_notes?: string | null;
  status?: StudentStatus;
  updated_at?: string;
};

type StudentObservationRow = {
  id: string;
  user_id: string;
  class_id: string;
  observation_type: ObservationType;
  activity_id: string | null;
  date: string;
  period_start: string | null;
  period_end: string | null;
  title: string | null;
  content: string;
  applies_to: ObservationAppliesTo;
  tags: string[];
  created_at: string;
  updated_at: string;
};

type StudentObservationInsert = {
  id?: string;
  user_id: string;
  class_id: string;
  observation_type: ObservationType;
  activity_id?: string | null;
  date?: string;
  period_start?: string | null;
  period_end?: string | null;
  title?: string | null;
  content: string;
  applies_to?: ObservationAppliesTo;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
};

type StudentObservationUpdate = {
  class_id?: string;
  observation_type?: ObservationType;
  activity_id?: string | null;
  date?: string;
  period_start?: string | null;
  period_end?: string | null;
  title?: string | null;
  content?: string;
  applies_to?: ObservationAppliesTo;
  tags?: string[];
  updated_at?: string;
};

type ObservationStudentRow = {
  id: string;
  observation_id: string;
  student_id: string;
  created_at: string;
};

type ObservationStudentInsert = {
  id?: string;
  observation_id: string;
  student_id: string;
  created_at?: string;
};

type ClassActivityRow = {
  id: string;
  user_id: string;
  class_id: string;
  activity_id: string;
  created_at: string;
};

type ClassActivityInsert = {
  id?: string;
  user_id: string;
  class_id: string;
  activity_id: string;
  created_at?: string;
};

type StudentReportRow = {
  id: string;
  user_id: string;
  class_id: string;
  student_id: string | null;
  report_type: string;
  period_start: string;
  period_end: string;
  tone: string;
  content: string;
  structured_content: Json | null;
  notes_hash: string;
  generated_at: string;
  created_at: string;
  updated_at: string;
};

type StudentReportInsert = {
  id?: string;
  user_id: string;
  class_id: string;
  student_id?: string | null;
  report_type: string;
  period_start: string;
  period_end: string;
  tone: string;
  content: string;
  structured_content?: Json | null;
  notes_hash: string;
  generated_at?: string;
  created_at?: string;
  updated_at?: string;
};

type StudentReportUpdate = {
  report_type?: string;
  period_start?: string;
  period_end?: string;
  tone?: string;
  content?: string;
  structured_content?: Json | null;
  notes_hash?: string;
  generated_at?: string;
  updated_at?: string;
};

type ReportGenerationLogRow = {
  id: string;
  user_id: string;
  report_id: string | null;
  model: string | null;
  report_type: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  created_at: string;
};

type ReportGenerationLogInsert = {
  id?: string;
  user_id: string;
  report_id?: string | null;
  model?: string | null;
  report_type?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  estimated_cost?: number | null;
  created_at?: string;
};

type AssessmentCriterionRow = {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type AssessmentCriterionInsert = {
  id?: string;
  user_id?: string | null;
  name: string;
  slug: string;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

type AssessmentCriterionUpdate = {
  name?: string;
  slug?: string;
  is_active?: boolean;
  sort_order?: number;
  updated_at?: string;
};

type StudentAssessmentRow = {
  id: string;
  student_id: string;
  class_id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  assessment_type: AssessmentType;
  assessment_date: string;
  score: number | null;
  max_score: number | null;
  delivery_status: AssessmentDeliveryStatus | null;
  participation_level: AssessmentParticipationLevel | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
};

type StudentAssessmentInsert = {
  id?: string;
  student_id: string;
  class_id: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  assessment_type: AssessmentType;
  assessment_date: string;
  score?: number | null;
  max_score?: number | null;
  delivery_status?: AssessmentDeliveryStatus | null;
  participation_level?: AssessmentParticipationLevel | null;
  comments?: string | null;
  created_at?: string;
  updated_at?: string;
};

type StudentAssessmentUpdate = {
  student_id?: string;
  class_id?: string;
  title?: string | null;
  description?: string | null;
  assessment_type?: AssessmentType;
  assessment_date?: string;
  score?: number | null;
  max_score?: number | null;
  delivery_status?: AssessmentDeliveryStatus | null;
  participation_level?: AssessmentParticipationLevel | null;
  comments?: string | null;
  updated_at?: string;
};

type StudentAssessmentCriterionRow = {
  id: string;
  assessment_id: string;
  criterion_id: string;
  created_at: string;
};

type StudentAssessmentCriterionInsert = {
  id?: string;
  assessment_id: string;
  criterion_id: string;
  created_at?: string;
};

type LessonMetricDefinitionRow = {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type LessonMetricOptionRow = {
  id: string;
  metric_definition_id: string;
  label: string;
  value: string;
  sort_order: number;
  performance_level: number;
  color: string;
  created_at: string;
  updated_at: string;
};

type LessonMetricPresetRow = {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  match_terms: string[];
  is_default: boolean;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
};

type LessonMetricPresetItemRow = {
  id: string;
  preset_id: string;
  metric_definition_id: string;
  sort_order: number;
  created_at: string;
};

type LessonRecordRow = {
  id: string;
  user_id: string;
  weekly_plan_item_id: string | null;
  class_id: string;
  activity_id: string | null;
  lesson_date: string;
  activity_title: string;
  development_area: string | null;
  methodology: string | null;
  source: "planning" | "class";
  created_at: string;
  updated_at: string;
};

type LessonRecordStudentRow = {
  id: string;
  lesson_record_id: string;
  student_id: string;
  observation: string | null;
  created_at: string;
  updated_at: string;
};

type LessonRecordMetricRow = {
  id: string;
  lesson_record_student_id: string;
  metric_definition_id: string;
  metric_option_id: string;
  created_at: string;
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
          theme_accent: ThemeAccent;
          ui_font_family: UiFontFamily;
          ui_font_scale: UiFontScale;
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
          theme_accent?: ThemeAccent;
          ui_font_family?: UiFontFamily;
          ui_font_scale?: UiFontScale;
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
          theme_accent?: ThemeAccent;
          ui_font_family?: UiFontFamily;
          ui_font_scale?: UiFontScale;
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
          class_id: string | null;
          title: string;
          start_date: string | null;
          end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          class_id?: string | null;
          title: string;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          class_id?: string | null;
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
      classes: {
        Row: ClassRow;
        Insert: ClassInsert;
        Update: ClassUpdate;
      };
      students: {
        Row: StudentRow;
        Insert: StudentInsert;
        Update: StudentUpdate;
      };
      student_observations: {
        Row: StudentObservationRow;
        Insert: StudentObservationInsert;
        Update: StudentObservationUpdate;
      };
      observation_students: {
        Row: ObservationStudentRow;
        Insert: ObservationStudentInsert;
        Update: Record<string, never>;
      };
      class_activities: {
        Row: ClassActivityRow;
        Insert: ClassActivityInsert;
        Update: Record<string, never>;
      };
      student_reports: {
        Row: StudentReportRow;
        Insert: StudentReportInsert;
        Update: StudentReportUpdate;
      };
      report_generation_logs: {
        Row: ReportGenerationLogRow;
        Insert: ReportGenerationLogInsert;
        Update: Record<string, never>;
      };
      assessment_criteria: {
        Row: AssessmentCriterionRow;
        Insert: AssessmentCriterionInsert;
        Update: AssessmentCriterionUpdate;
      };
      student_assessments: {
        Row: StudentAssessmentRow;
        Insert: StudentAssessmentInsert;
        Update: StudentAssessmentUpdate;
      };
      student_assessment_criteria: {
        Row: StudentAssessmentCriterionRow;
        Insert: StudentAssessmentCriterionInsert;
        Update: Record<string, never>;
      };
      lesson_metric_definitions: {
        Row: LessonMetricDefinitionRow;
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          slug: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
      };
      lesson_metric_options: {
        Row: LessonMetricOptionRow;
        Insert: {
          id?: string;
          metric_definition_id: string;
          label: string;
          value: string;
          sort_order?: number;
          performance_level?: number;
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          label?: string;
          value?: string;
          sort_order?: number;
          performance_level?: number;
          color?: string;
          updated_at?: string;
        };
      };
      lesson_metric_presets: {
        Row: LessonMetricPresetRow;
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          slug: string;
          match_terms?: string[];
          is_default?: boolean;
          is_active?: boolean;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          match_terms?: string[];
          is_default?: boolean;
          is_active?: boolean;
          priority?: number;
          updated_at?: string;
        };
      };
      lesson_metric_preset_items: {
        Row: LessonMetricPresetItemRow;
        Insert: {
          id?: string;
          preset_id: string;
          metric_definition_id: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          sort_order?: number;
        };
      };
      lesson_records: {
        Row: LessonRecordRow;
        Insert: {
          id?: string;
          user_id: string;
          weekly_plan_item_id?: string | null;
          class_id: string;
          activity_id?: string | null;
          lesson_date: string;
          activity_title: string;
          development_area?: string | null;
          methodology?: string | null;
          source?: "planning" | "class";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          class_id?: string;
          weekly_plan_item_id?: string | null;
          activity_id?: string | null;
          lesson_date?: string;
          activity_title?: string;
          development_area?: string | null;
          methodology?: string | null;
          updated_at?: string;
        };
      };
      lesson_record_students: {
        Row: LessonRecordStudentRow;
        Insert: {
          id?: string;
          lesson_record_id: string;
          student_id: string;
          observation?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          observation?: string | null;
          updated_at?: string;
        };
      };
      lesson_record_metrics: {
        Row: LessonRecordMetricRow;
        Insert: {
          id?: string;
          lesson_record_student_id: string;
          metric_definition_id: string;
          metric_option_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
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
          event_type: "generation" | "download" | "blocked" | "cache_reuse";
          storage_bucket: string | null;
          storage_path: string | null;
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
          event_type?: "generation" | "download" | "blocked" | "cache_reuse";
          storage_bucket?: string | null;
          storage_path?: string | null;
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
          event_type?: "generation" | "download" | "blocked" | "cache_reuse";
          storage_bucket?: string | null;
          storage_path?: string | null;
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
    Functions: {
      save_class_lesson_record: {
        Args: {
          p_class_id: string;
          p_activity_id: string;
          p_lesson_date: string;
          p_students: Json;
        };
        Returns: string;
      };
      save_lesson_record: {
        Args: {
          p_weekly_plan_item_id: string;
          p_students: Json;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
