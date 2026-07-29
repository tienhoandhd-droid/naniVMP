export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          change_reason: string | null
          changed_fields: string[] | null
          created_at: string | null
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          source: string | null
          table_name: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
          user_role: Database["public"]["Enums"]["user_role"] | null
          validation_code: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          change_reason?: string | null
          changed_fields?: string[] | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          source?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: Database["public"]["Enums"]["user_role"] | null
          validation_code?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          change_reason?: string | null
          changed_fields?: string[] | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          source?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: Database["public"]["Enums"]["user_role"] | null
          validation_code?: string | null
        }
        Relationships: []
      }
      data_quality_issues: {
        Row: {
          detected_at: string | null
          expected_value: string | null
          field_name: string | null
          field_value: string | null
          id: string
          is_resolved: boolean | null
          issue_type: string
          message: string
          object_code: string | null
          plan_item_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["quality_severity"]
          source_row: number | null
          workflow_run_id: string | null
        }
        Insert: {
          detected_at?: string | null
          expected_value?: string | null
          field_name?: string | null
          field_value?: string | null
          id?: string
          is_resolved?: boolean | null
          issue_type: string
          message: string
          object_code?: string | null
          plan_item_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["quality_severity"]
          source_row?: number | null
          workflow_run_id?: string | null
        }
        Update: {
          detected_at?: string | null
          expected_value?: string | null
          field_name?: string | null
          field_value?: string | null
          id?: string
          is_resolved?: boolean | null
          issue_type?: string
          message?: string
          object_code?: string | null
          plan_item_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["quality_severity"]
          source_row?: number | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_issues_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "vmp_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_issues_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "vmp_status_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_issues_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          manager_id: string | null
          name: string
          short_name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          is_active?: boolean | null
          manager_id?: string | null
          name: string
          short_name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          name?: string
          short_name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          department: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          last_login: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean | null
          last_login?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_fkey"
            columns: ["department"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_sync_outbox: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          id: number
          last_error: string | null
          next_attempt_at: string
          sheet_patch: Json
          source: string | null
          status: string
          updated_at: string
          validation_code: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          id?: number
          last_error?: string | null
          next_attempt_at?: string
          sheet_patch: Json
          source?: string | null
          status?: string
          updated_at?: string
          validation_code: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          id?: number
          last_error?: string | null
          next_attempt_at?: string
          sheet_patch?: Json
          source?: string | null
          status?: string
          updated_at?: string
          validation_code?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          category: string | null
          description: string | null
          is_sensitive: boolean | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          category?: string | null
          description?: string | null
          is_sensitive?: boolean | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          category?: string | null
          description?: string | null
          is_sensitive?: boolean | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      vmp_ai_report_cache: {
        Row: {
          ai_model: string | null
          ai_response: string
          created_at: string | null
          created_by: string | null
          created_by_email: string | null
          disclaimer: string | null
          id: string
          prompt_used: string | null
          report_data: Json
        }
        Insert: {
          ai_model?: string | null
          ai_response: string
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          disclaimer?: string | null
          id?: string
          prompt_used?: string | null
          report_data: Json
        }
        Update: {
          ai_model?: string | null
          ai_response?: string
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          disclaimer?: string | null
          id?: string
          prompt_used?: string | null
          report_data?: Json
        }
        Relationships: []
      }
      vmp_ai_reviews: {
        Row: {
          ai_model: string | null
          ai_provider: string | null
          ai_response: string
          created_at: string | null
          disclaimer: string | null
          generation_time_ms: number | null
          id: string
          input_data: Json
          is_approved: boolean | null
          prompt_used: string
          review_comments: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          snapshot_id: string
          tokens_used: number | null
        }
        Insert: {
          ai_model?: string | null
          ai_provider?: string | null
          ai_response: string
          created_at?: string | null
          disclaimer?: string | null
          generation_time_ms?: number | null
          id?: string
          input_data: Json
          is_approved?: boolean | null
          prompt_used: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_id: string
          tokens_used?: number | null
        }
        Update: {
          ai_model?: string | null
          ai_provider?: string | null
          ai_response?: string
          created_at?: string | null
          disclaimer?: string | null
          generation_time_ms?: number | null
          id?: string
          input_data?: Json
          is_approved?: boolean | null
          prompt_used?: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_id?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vmp_ai_reviews_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "vmp_report_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_alert_recipients: {
        Row: {
          alert_kind: string
          created_at: string
          email: string
          id: string
          is_enabled: boolean
          note: string | null
          recipient_name: string | null
          scope: string | null
          scope_type: string
          threshold_days: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_kind?: string
          created_at?: string
          email: string
          id?: string
          is_enabled?: boolean
          note?: string | null
          recipient_name?: string | null
          scope?: string | null
          scope_type?: string
          threshold_days?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_kind?: string
          created_at?: string
          email?: string
          id?: string
          is_enabled?: boolean
          note?: string | null
          recipient_name?: string | null
          scope?: string | null
          scope_type?: string
          threshold_days?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      vmp_deadline_rules: {
        Row: {
          description: string | null
          id: number
          is_active: boolean | null
          protocol_offset: number
          report_class: string
          report_days: number
          report_offset: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: number
          is_active?: boolean | null
          protocol_offset?: number
          report_class: string
          report_days?: number
          report_offset?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: number
          is_active?: boolean | null
          protocol_offset?: number
          report_class?: string
          report_days?: number
          report_offset?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      vmp_notifications: {
        Row: {
          body_preview: string | null
          channel: Database["public"]["Enums"]["notification_ch"] | null
          created_at: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          max_retries: number | null
          next_retry_at: string | null
          notification_type: string
          plan_item_id: string | null
          recipient_email: string
          recipient_name: string | null
          retry_count: number | null
          sent_at: string | null
          status: string | null
          subject: string | null
          workflow_run_id: string | null
        }
        Insert: {
          body_preview?: string | null
          channel?: Database["public"]["Enums"]["notification_ch"] | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          max_retries?: number | null
          next_retry_at?: string | null
          notification_type: string
          plan_item_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          body_preview?: string | null
          channel?: Database["public"]["Enums"]["notification_ch"] | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          max_retries?: number | null
          next_retry_at?: string | null
          notification_type?: string
          plan_item_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vmp_notifications_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "vmp_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_notifications_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "vmp_status_current"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_objects: {
        Row: {
          area: string | null
          classification: string
          code: string
          created_at: string | null
          created_by: string | null
          criticality: Database["public"]["Enums"]["criticality"]
          criticality_score: number | null
          department: string | null
          frequency_months: number | null
          gxp_impact: string | null
          is_active: boolean | null
          line: string | null
          name: string
          notes: string | null
          source_sheet_data: Json
          source_sheet_row: number | null
          source_sync_run_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          area?: string | null
          classification?: string
          code: string
          created_at?: string | null
          created_by?: string | null
          criticality?: Database["public"]["Enums"]["criticality"]
          criticality_score?: number | null
          department?: string | null
          frequency_months?: number | null
          gxp_impact?: string | null
          is_active?: boolean | null
          line?: string | null
          name: string
          notes?: string | null
          source_sheet_data?: Json
          source_sheet_row?: number | null
          source_sync_run_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          area?: string | null
          classification?: string
          code?: string
          created_at?: string | null
          created_by?: string | null
          criticality?: Database["public"]["Enums"]["criticality"]
          criticality_score?: number | null
          department?: string | null
          frequency_months?: number | null
          gxp_impact?: string | null
          is_active?: boolean | null
          line?: string | null
          name?: string
          notes?: string | null
          source_sheet_data?: Json
          source_sheet_row?: number | null
          source_sync_run_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vmp_objects_department_fkey"
            columns: ["department"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_objects_source_sync_run_id_fkey"
            columns: ["source_sync_run_id"]
            isOneToOne: false
            referencedRelation: "vmp_sheet_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_plan_items: {
        Row: {
          actual_protocol_date: string | null
          actual_report_date: string | null
          actual_validation_date: string | null
          actual_vmp_date: string | null
          computed_status: Database["public"]["Enums"]["item_status"] | null
          created_at: string | null
          created_by: string | null
          criticality: Database["public"]["Enums"]["criticality"]
          criticality_score: number | null
          deadline_protocol: string | null
          deadline_report: string | null
          deadline_validation: string | null
          deadline_vmp: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_from_sheet: boolean | null
          departments: string[] | null
          effort_days: number | null
          execution_departments: string[] | null
          has_mismatch: string | null
          id: string
          is_active: boolean | null
          is_doc_complete: boolean | null
          item_state: string
          last_synced: string | null
          missing_from_sheet: boolean | null
          missing_since: string | null
          object_code: string
          owner_id: string | null
          owner_name: string | null
          qa_approved_at: string | null
          qa_approved_by: string | null
          report_class: string | null
          requires_qa_approval: boolean | null
          scheduled_date: string | null
          secondary_owner: string | null
          sheet_row_id: string | null
          source_sheet_data: Json
          source_sheet_row: number | null
          source_sync_run_id: string | null
          status_protocol: Database["public"]["Enums"]["phase_status"] | null
          status_report: Database["public"]["Enums"]["phase_status"] | null
          status_validation: Database["public"]["Enums"]["phase_status"] | null
          status_vmp: Database["public"]["Enums"]["phase_status"] | null
          updated_at: string | null
          updated_by: string | null
          validation_code: string
          validation_type: string
          version: number
          year: number
        }
        Insert: {
          actual_protocol_date?: string | null
          actual_report_date?: string | null
          actual_validation_date?: string | null
          actual_vmp_date?: string | null
          computed_status?: Database["public"]["Enums"]["item_status"] | null
          created_at?: string | null
          created_by?: string | null
          criticality?: Database["public"]["Enums"]["criticality"]
          criticality_score?: number | null
          deadline_protocol?: string | null
          deadline_report?: string | null
          deadline_validation?: string | null
          deadline_vmp?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_from_sheet?: boolean | null
          departments?: string[] | null
          effort_days?: number | null
          execution_departments?: string[] | null
          has_mismatch?: string | null
          id: string
          is_active?: boolean | null
          is_doc_complete?: boolean | null
          item_state?: string
          last_synced?: string | null
          missing_from_sheet?: boolean | null
          missing_since?: string | null
          object_code: string
          owner_id?: string | null
          owner_name?: string | null
          qa_approved_at?: string | null
          qa_approved_by?: string | null
          report_class?: string | null
          requires_qa_approval?: boolean | null
          scheduled_date?: string | null
          secondary_owner?: string | null
          sheet_row_id?: string | null
          source_sheet_data?: Json
          source_sheet_row?: number | null
          source_sync_run_id?: string | null
          status_protocol?: Database["public"]["Enums"]["phase_status"] | null
          status_report?: Database["public"]["Enums"]["phase_status"] | null
          status_validation?: Database["public"]["Enums"]["phase_status"] | null
          status_vmp?: Database["public"]["Enums"]["phase_status"] | null
          updated_at?: string | null
          updated_by?: string | null
          validation_code: string
          validation_type?: string
          version?: number
          year?: number
        }
        Update: {
          actual_protocol_date?: string | null
          actual_report_date?: string | null
          actual_validation_date?: string | null
          actual_vmp_date?: string | null
          computed_status?: Database["public"]["Enums"]["item_status"] | null
          created_at?: string | null
          created_by?: string | null
          criticality?: Database["public"]["Enums"]["criticality"]
          criticality_score?: number | null
          deadline_protocol?: string | null
          deadline_report?: string | null
          deadline_validation?: string | null
          deadline_vmp?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_from_sheet?: boolean | null
          departments?: string[] | null
          effort_days?: number | null
          execution_departments?: string[] | null
          has_mismatch?: string | null
          id?: string
          is_active?: boolean | null
          is_doc_complete?: boolean | null
          item_state?: string
          last_synced?: string | null
          missing_from_sheet?: boolean | null
          missing_since?: string | null
          object_code?: string
          owner_id?: string | null
          owner_name?: string | null
          qa_approved_at?: string | null
          qa_approved_by?: string | null
          report_class?: string | null
          requires_qa_approval?: boolean | null
          scheduled_date?: string | null
          secondary_owner?: string | null
          sheet_row_id?: string | null
          source_sheet_data?: Json
          source_sheet_row?: number | null
          source_sync_run_id?: string | null
          status_protocol?: Database["public"]["Enums"]["phase_status"] | null
          status_report?: Database["public"]["Enums"]["phase_status"] | null
          status_validation?: Database["public"]["Enums"]["phase_status"] | null
          status_vmp?: Database["public"]["Enums"]["phase_status"] | null
          updated_at?: string | null
          updated_by?: string | null
          validation_code?: string
          validation_type?: string
          version?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vmp_plan_items_object_code_fkey"
            columns: ["object_code"]
            isOneToOne: false
            referencedRelation: "vmp_objects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "vmp_plan_items_source_sync_run_id_fkey"
            columns: ["source_sync_run_id"]
            isOneToOne: false
            referencedRelation: "vmp_sheet_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_products_gmp: {
        Row: {
          batch_size: string | null
          bfo_code: string
          created_at: string
          dosage_form: string | null
          extra: Json
          final_batch_size: string | null
          id: string
          ingredients: string | null
          mixing_tank: string | null
          note: string | null
          primary_pack: string | null
          product_name: string | null
          production_line: string | null
          source_row: number
          strength: string | null
          updated_at: string
        }
        Insert: {
          batch_size?: string | null
          bfo_code: string
          created_at?: string
          dosage_form?: string | null
          extra?: Json
          final_batch_size?: string | null
          id?: string
          ingredients?: string | null
          mixing_tank?: string | null
          note?: string | null
          primary_pack?: string | null
          product_name?: string | null
          production_line?: string | null
          source_row: number
          strength?: string | null
          updated_at?: string
        }
        Update: {
          batch_size?: string | null
          bfo_code?: string
          created_at?: string
          dosage_form?: string | null
          extra?: Json
          final_batch_size?: string | null
          id?: string
          ingredients?: string | null
          mixing_tank?: string | null
          note?: string | null
          primary_pack?: string | null
          product_name?: string | null
          production_line?: string | null
          source_row?: number
          strength?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vmp_progress_events: {
        Row: {
          change_reason: string | null
          changed_at: string | null
          changed_by: string
          event_id: string
          ip_address: unknown
          new_date: string | null
          new_status: Database["public"]["Enums"]["phase_status"]
          old_date: string | null
          old_status: Database["public"]["Enums"]["phase_status"] | null
          phase: string
          plan_item_id: string
          source: string | null
          user_agent: string | null
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string | null
          changed_by: string
          event_id?: string
          ip_address?: unknown
          new_date?: string | null
          new_status: Database["public"]["Enums"]["phase_status"]
          old_date?: string | null
          old_status?: Database["public"]["Enums"]["phase_status"] | null
          phase: string
          plan_item_id: string
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          change_reason?: string | null
          changed_at?: string | null
          changed_by?: string
          event_id?: string
          ip_address?: unknown
          new_date?: string | null
          new_status?: Database["public"]["Enums"]["phase_status"]
          old_date?: string | null
          old_status?: Database["public"]["Enums"]["phase_status"] | null
          phase?: string
          plan_item_id?: string
          source?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vmp_progress_events_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "vmp_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_progress_events_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "vmp_status_current"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_report_snapshots: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          exported_format: string[] | null
          file_urls: Json | null
          filter_applied: Json | null
          id: string
          items_snapshot: Json | null
          kpi_data: Json
          mismatch_list: Json | null
          overdue_list: Json | null
          period_label: string
          report_period: Database["public"]["Enums"]["report_period"]
          scope: string | null
          scope_label: string | null
          status: Database["public"]["Enums"]["report_status"] | null
          template_version: string | null
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          exported_format?: string[] | null
          file_urls?: Json | null
          filter_applied?: Json | null
          id?: string
          items_snapshot?: Json | null
          kpi_data: Json
          mismatch_list?: Json | null
          overdue_list?: Json | null
          period_label: string
          report_period: Database["public"]["Enums"]["report_period"]
          scope?: string | null
          scope_label?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          template_version?: string | null
          year: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          exported_format?: string[] | null
          file_urls?: Json | null
          filter_applied?: Json | null
          id?: string
          items_snapshot?: Json | null
          kpi_data?: Json
          mismatch_list?: Json | null
          overdue_list?: Json | null
          period_label?: string
          report_period?: Database["public"]["Enums"]["report_period"]
          scope?: string | null
          scope_label?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          template_version?: string | null
          year?: number
        }
        Relationships: []
      }
      vmp_sheet_row_extras: {
        Row: {
          created_at: string
          extra_json: Json
          object_code: string
          sheet_row_number: number
          sync_run_id: string
          validation_code: string
        }
        Insert: {
          created_at?: string
          extra_json?: Json
          object_code: string
          sheet_row_number: number
          sync_run_id: string
          validation_code: string
        }
        Update: {
          created_at?: string
          extra_json?: Json
          object_code?: string
          sheet_row_number?: number
          sync_run_id?: string
          validation_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "vmp_sheet_row_extras_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "vmp_sheet_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_sheet_rows: {
        Row: {
          object_code: string
          row_hash: string
          sheet_row_number: number
          sync_run_id: string
          validation_code: string
          values_json: Json
        }
        Insert: {
          object_code: string
          row_hash: string
          sheet_row_number: number
          sync_run_id: string
          validation_code: string
          values_json: Json
        }
        Update: {
          object_code?: string
          row_hash?: string
          sheet_row_number?: number
          sync_run_id?: string
          validation_code?: string
          values_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "vmp_sheet_rows_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "vmp_sheet_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_sheet_sync_backups: {
        Row: {
          created_at: string
          dataset: string
          row_count: number
          rows_json: Json
          sync_run_id: string
        }
        Insert: {
          created_at?: string
          dataset: string
          row_count: number
          rows_json: Json
          sync_run_id: string
        }
        Update: {
          created_at?: string
          dataset?: string
          row_count?: number
          rows_json?: Json
          sync_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vmp_sheet_sync_backups_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "vmp_sheet_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_sheet_sync_runs: {
        Row: {
          checksum: string
          completed_at: string | null
          created_at: string
          duplicate_validation_count: number
          headers: Json
          id: string
          object_count: number
          result: Json | null
          sheet_gid: string
          sheet_id: string
          source_row_count: number
          started_at: string
          status: string
          tab_name: string
          unique_validation_count: number
        }
        Insert: {
          checksum: string
          completed_at?: string | null
          created_at?: string
          duplicate_validation_count?: number
          headers: Json
          id?: string
          object_count: number
          result?: Json | null
          sheet_gid: string
          sheet_id: string
          source_row_count: number
          started_at?: string
          status?: string
          tab_name: string
          unique_validation_count: number
        }
        Update: {
          checksum?: string
          completed_at?: string | null
          created_at?: string
          duplicate_validation_count?: number
          headers?: Json
          id?: string
          object_count?: number
          result?: Json | null
          sheet_gid?: string
          sheet_id?: string
          source_row_count?: number
          started_at?: string
          status?: string
          tab_name?: string
          unique_validation_count?: number
        }
        Relationships: []
      }
      vmp_source_objects: {
        Row: {
          area_code: string | null
          created_at: string
          critical_point: string | null
          department: string | null
          edited_on_web: boolean
          extra: Json
          first_month: number | null
          frequency_months: number | null
          id: string
          is_active: boolean
          line: string | null
          note: string | null
          object_code: string
          object_kind: string
          object_name: string | null
          report_class: string | null
          show_flag: string | null
          source_row: number
          source_tab: string
          status: string | null
          updated_at: string
          updated_by: string | null
          validate_flag: string | null
          validate_reason: string | null
          workdays: number | null
          year_ref: number | null
        }
        Insert: {
          area_code?: string | null
          created_at?: string
          critical_point?: string | null
          department?: string | null
          edited_on_web?: boolean
          extra?: Json
          first_month?: number | null
          frequency_months?: number | null
          id?: string
          is_active?: boolean
          line?: string | null
          note?: string | null
          object_code: string
          object_kind: string
          object_name?: string | null
          report_class?: string | null
          show_flag?: string | null
          source_row: number
          source_tab: string
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          validate_flag?: string | null
          validate_reason?: string | null
          workdays?: number | null
          year_ref?: number | null
        }
        Update: {
          area_code?: string | null
          created_at?: string
          critical_point?: string | null
          department?: string | null
          edited_on_web?: boolean
          extra?: Json
          first_month?: number | null
          frequency_months?: number | null
          id?: string
          is_active?: boolean
          line?: string | null
          note?: string | null
          object_code?: string
          object_kind?: string
          object_name?: string | null
          report_class?: string | null
          show_flag?: string | null
          source_row?: number
          source_tab?: string
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          validate_flag?: string | null
          validate_reason?: string | null
          workdays?: number | null
          year_ref?: number | null
        }
        Relationships: []
      }
      vmp_source_rows: {
        Row: {
          id: number
          imported_at: string
          payload: Json
          row_number: number
          source_tab: string
        }
        Insert: {
          id?: never
          imported_at?: string
          payload: Json
          row_number: number
          source_tab: string
        }
        Update: {
          id?: never
          imported_at?: string
          payload?: Json
          row_number?: number
          source_tab?: string
        }
        Relationships: []
      }
      vmp_staff_emails: {
        Row: {
          created_at: string
          department: string | null
          email: string
          id: string
          is_active: boolean
          note: string | null
          staff_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          id?: string
          is_active?: boolean
          note?: string | null
          staff_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          is_active?: boolean
          note?: string | null
          staff_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error_details: Json | null
          error_message: string | null
          execution_id: string | null
          finished_at: string | null
          id: string
          input_summary: Json | null
          max_retries: number | null
          output_summary: Json | null
          parent_run_id: string | null
          retry_count: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_status"]
          triggered_by: string | null
          workflow_id: string
          workflow_name: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          execution_id?: string | null
          finished_at?: string | null
          id?: string
          input_summary?: Json | null
          max_retries?: number | null
          output_summary?: Json | null
          parent_run_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status: Database["public"]["Enums"]["workflow_status"]
          triggered_by?: string | null
          workflow_id: string
          workflow_name: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          execution_id?: string | null
          finished_at?: string | null
          id?: string
          input_summary?: Json | null
          max_retries?: number | null
          output_summary?: Json | null
          parent_run_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          triggered_by?: string | null
          workflow_id?: string
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vmp_status_current: {
        Row: {
          classification: string | null
          computed_status: Database["public"]["Enums"]["item_status"] | null
          criticality: Database["public"]["Enums"]["criticality"] | null
          criticality_score: number | null
          days_to_deadline: number | null
          deadline_protocol: string | null
          deadline_report: string | null
          deadline_validation: string | null
          deadline_vmp: string | null
          department: string | null
          dept_short: string | null
          derived_mismatch: string | null
          derived_status: string | null
          has_mismatch: string | null
          id: string | null
          is_doc_complete: boolean | null
          object_code: string | null
          object_name: string | null
          owner_name: string | null
          status_protocol: Database["public"]["Enums"]["phase_status"] | null
          status_report: Database["public"]["Enums"]["phase_status"] | null
          status_validation: Database["public"]["Enums"]["phase_status"] | null
          status_vmp: Database["public"]["Enums"]["phase_status"] | null
          validation_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vmp_objects_department_fkey"
            columns: ["department"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_plan_items_object_code_fkey"
            columns: ["object_code"]
            isOneToOne: false
            referencedRelation: "vmp_objects"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      auth_user_dept: { Args: never; Returns: string }
      auth_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      calculate_deadlines: {
        Args: { p_report_class?: string; target_date: string }
        Returns: {
          dl_protocol: string
          dl_report: string
          dl_validation: string
        }[]
      }
      check_doc_mismatch: {
        Args: { item: Database["public"]["Tables"]["vmp_plan_items"]["Row"] }
        Returns: string
      }
      compute_item_status: {
        Args: { item: Database["public"]["Tables"]["vmp_plan_items"]["Row"] }
        Returns: Database["public"]["Enums"]["item_status"]
      }
      compute_item_status_v2: {
        Args: { item: Database["public"]["Tables"]["vmp_plan_items"]["Row"] }
        Returns: string
      }
      is_admin_or_qa: { Args: never; Returns: boolean }
      rpc_alert_context: {
        Args: { p_limit?: number; p_validation_code: string }
        Returns: Json
      }
      rpc_apply_sheet_sync: {
        Args: { p_op: string; p_patch: Json; p_validation_code: string }
        Returns: Json
      }
      rpc_check_data_quality: { Args: { p_year?: number }; Returns: Json }
      rpc_create_plan_item: {
        Args: {
          p_object_code: string
          p_occurrence?: number
          p_patch?: Json
          p_validation_type: string
          p_year?: number
        }
        Returns: Json
      }
      rpc_dashboard_kpi: { Args: { p_year?: number }; Returns: Json }
      rpc_deactivate_object: {
        Args: { p_code: string; p_reason: string }
        Returns: Json
      }
      rpc_delete_alert_recipient: { Args: { p_id: string }; Returns: Json }
      rpc_delete_plan_item: {
        Args: { p_reason: string; p_validation_code: string }
        Returns: Json
      }
      rpc_delete_product_gmp: { Args: { p_bfo_code: string }; Returns: Json }
      rpc_delete_source_object: {
        Args: { p_object_code: string; p_object_kind: string; p_reason: string }
        Returns: Json
      }
      rpc_delete_source_row: {
        Args: { p_row_number: number; p_source_tab: string }
        Returns: Json
      }
      rpc_delete_staff_email: { Args: { p_id: string }; Returns: Json }
      rpc_due_alerts: {
        Args: { p_soon_days?: number; p_year?: number }
        Returns: Json
      }
      rpc_generate_timeline: {
        Args: { p_commit?: boolean; p_year?: number }
        Returns: Json
      }
      rpc_get_audit_logs: {
        Args: {
          p_action?: string
          p_from_date?: string
          p_limit?: number
          p_offset?: number
          p_record_id?: string
          p_table_name?: string
          p_to_date?: string
          p_user_email?: string
        }
        Returns: Json
      }
      rpc_get_item_version: {
        Args: { p_validation_code: string }
        Returns: number
      }
      rpc_get_missing_items: { Args: { p_year?: number }; Returns: Json }
      rpc_get_vmp_dashboard: {
        Args: {
          p_include_cancelled?: boolean
          p_include_missing?: boolean
          p_year?: number
        }
        Returns: Json
      }
      rpc_get_vmp_watermark: { Args: { p_year?: number }; Returns: Json }
      rpc_list_source_tabs: { Args: never; Returns: Json }
      rpc_mark_alert_sent: {
        Args: { p_error?: string; p_idempotency_key: string; p_ok: boolean }
        Returns: Json
      }
      rpc_reconcile_orphan_objects: {
        Args: { p_codes_in_sheet: string[] }
        Returns: Json
      }
      rpc_refresh_computed_status: { Args: never; Returns: Json }
      rpc_register_alert: {
        Args: {
          p_body_preview?: string
          p_idempotency_key: string
          p_recipient_email: string
          p_recipient_name?: string
          p_subject?: string
          p_type: string
          p_validation_code: string
        }
        Returns: Json
      }
      rpc_resolve_missing: {
        Args: {
          p_decision: string
          p_reason: string
          p_validation_code: string
        }
        Returns: Json
      }
      rpc_resolve_outbox: {
        Args: { p_error?: string; p_id: number; p_ok: boolean }
        Returns: Json
      }
      rpc_rollback_vmp_sheet_sync: {
        Args: { p_sync_run_id: string }
        Returns: Json
      }
      rpc_set_item_state: {
        Args: { p_reason: string; p_state: string; p_validation_code: string }
        Returns: Json
      }
      rpc_sync_vmp_sheet_snapshot: {
        Args: {
          p_headers: Json
          p_rows: Json
          p_sheet_gid: string
          p_sheet_id: string
          p_tab_name: string
        }
        Returns: Json
      }
      rpc_sync_vmp_sheet_snapshot_with_extras: {
        Args: {
          p_headers: Json
          p_rows: Json
          p_sheet_gid: string
          p_sheet_id: string
          p_tab_name: string
        }
        Returns: Json
      }
      rpc_update_progress:
        | {
            Args: {
              p_patch: Json
              p_reason?: string
              p_sheet_patch?: Json
              p_validation_code: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_expected_version?: number
              p_patch: Json
              p_reason?: string
              p_sheet_patch?: Json
              p_validation_code: string
            }
            Returns: Json
          }
      rpc_upsert_alert_recipient: {
        Args: { p_id: string; p_patch: Json }
        Returns: Json
      }
      rpc_upsert_object: {
        Args: {
          p_area: string
          p_classification: string
          p_code: string
          p_criticality: string
          p_department: string
          p_frequency_months: number
          p_name: string
          p_notes?: string
        }
        Returns: Json
      }
      rpc_upsert_product_gmp: {
        Args: { p_bfo_code: string; p_patch: Json }
        Returns: Json
      }
      rpc_upsert_source_object: {
        Args: { p_object_code: string; p_object_kind: string; p_patch: Json }
        Returns: Json
      }
      rpc_upsert_source_row: {
        Args: { p_payload: Json; p_row_number: number; p_source_tab: string }
        Returns: Json
      }
      rpc_upsert_staff_email: {
        Args: { p_id: string; p_patch: Json }
        Returns: Json
      }
      validate_plan_item: {
        Args: { item: Database["public"]["Tables"]["vmp_plan_items"]["Row"] }
        Returns: Json
      }
      vmp_parse_depts: { Args: { p_raw: string }; Returns: string[] }
      vmp_sheet_classification: { Args: { p_value: string }; Returns: string }
      vmp_sheet_criticality: {
        Args: { p_report_class: string; p_score: string }
        Returns: Database["public"]["Enums"]["criticality"]
      }
      vmp_sheet_date: { Args: { p_value: string }; Returns: string }
      vmp_sheet_department: { Args: { p_value: string }; Returns: string }
      vmp_sheet_number: { Args: { p_value: string }; Returns: number }
      vmp_sheet_status: {
        Args: { p_value: string }
        Returns: Database["public"]["Enums"]["phase_status"]
      }
      vmp_sheet_value: {
        Args: { p_index: number; p_values: Json }
        Returns: string
      }
    }
    Enums: {
      audit_action:
        | "INSERT"
        | "UPDATE"
        | "DELETE"
        | "LOGIN"
        | "LOGOUT"
        | "EXPORT"
        | "STATUS_CHANGE"
        | "DEADLINE_CHANGE"
        | "APPROVAL"
        | "AI_GENERATE"
        | "CONFIG_CHANGE"
      criticality: "high" | "medium" | "low"
      item_status: "plan" | "todo" | "prog" | "done" | "over"
      notification_ch: "email" | "dashboard" | "both"
      phase_status: "not_started" | "in_progress" | "completed" | "overdue"
      quality_severity: "error" | "warning" | "info"
      report_period: "weekly" | "monthly" | "quarterly" | "annual" | "custom"
      report_status:
        | "draft"
        | "ai_generated"
        | "qa_reviewing"
        | "approved"
        | "archived"
      user_role: "admin" | "qa_manager" | "department_user" | "viewer"
      workflow_status: "running" | "success" | "failed" | "partial"
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
      audit_action: [
        "INSERT",
        "UPDATE",
        "DELETE",
        "LOGIN",
        "LOGOUT",
        "EXPORT",
        "STATUS_CHANGE",
        "DEADLINE_CHANGE",
        "APPROVAL",
        "AI_GENERATE",
        "CONFIG_CHANGE",
      ],
      criticality: ["high", "medium", "low"],
      item_status: ["plan", "todo", "prog", "done", "over"],
      notification_ch: ["email", "dashboard", "both"],
      phase_status: ["not_started", "in_progress", "completed", "overdue"],
      quality_severity: ["error", "warning", "info"],
      report_period: ["weekly", "monthly", "quarterly", "annual", "custom"],
      report_status: [
        "draft",
        "ai_generated",
        "qa_reviewing",
        "approved",
        "archived",
      ],
      user_role: ["admin", "qa_manager", "department_user", "viewer"],
      workflow_status: ["running", "success", "failed", "partial"],
    },
  },
} as const

