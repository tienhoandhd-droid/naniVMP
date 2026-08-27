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
          effective_business_role: string | null
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
          effective_business_role?: string | null
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
          effective_business_role?: string | null
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
      audit_logs_archive: {
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
      audit_logs_purge_log: {
        Row: {
          breakdown: Json | null
          criteria: string
          date_from: string | null
          date_to: string | null
          id: number
          purged_at: string
          purged_by: string | null
          reason: string
          row_count: number
          table_name: string
        }
        Insert: {
          breakdown?: Json | null
          criteria: string
          date_from?: string | null
          date_to?: string | null
          id?: number
          purged_at?: string
          purged_by?: string | null
          reason: string
          row_count: number
          table_name: string
        }
        Update: {
          breakdown?: Json | null
          criteria?: string
          date_from?: string | null
          date_to?: string | null
          id?: number
          purged_at?: string
          purged_by?: string | null
          reason?: string
          row_count?: number
          table_name?: string
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
          pham_vi: string | null
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
          pham_vi?: string | null
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
          pham_vi?: string | null
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
      vmp_ai_bi_danh: {
        Row: {
          bi_danh: string
          ghi_chu: string | null
          gia_tri: string | null
          id: number
          loai: string
        }
        Insert: {
          bi_danh: string
          ghi_chu?: string | null
          gia_tri?: string | null
          id?: number
          loai: string
        }
        Update: {
          bi_danh?: string
          ghi_chu?: string | null
          gia_tri?: string | null
          id?: number
          loai?: string
        }
        Relationships: []
      }
      vmp_ai_bo_kiem: {
        Row: {
          cau_hoi: string
          ghi_chu: string | null
          ma: string
          mong_doi: Json
        }
        Insert: {
          cau_hoi: string
          ghi_chu?: string | null
          ma: string
          mong_doi: Json
        }
        Update: {
          cau_hoi?: string
          ghi_chu?: string | null
          ma?: string
          mong_doi?: Json
        }
        Relationships: []
      }
      vmp_ai_bo_nho: {
        Row: {
          id: number
          loai: string
          nguoi: string
          nhac_cuoi: string | null
          noi_dung: string
          quan_trong: number
          so_lan_nhac: number
          tang: string
          tao_luc: string
          tu_khoa: string[]
        }
        Insert: {
          id?: never
          loai: string
          nguoi: string
          nhac_cuoi?: string | null
          noi_dung: string
          quan_trong?: number
          so_lan_nhac?: number
          tang: string
          tao_luc?: string
          tu_khoa?: string[]
        }
        Update: {
          id?: never
          loai?: string
          nguoi?: string
          nhac_cuoi?: string | null
          noi_dung?: string
          quan_trong?: number
          so_lan_nhac?: number
          tang?: string
          tao_luc?: string
          tu_khoa?: string[]
        }
        Relationships: []
      }
      vmp_ai_cache: {
        Row: {
          cau_hoi_goc: string
          dau_van: string
          dung_gan_nhat: string | null
          het_han_luc: string
          id: number
          khoa_cau_hoi: string
          nguon: string
          so_lan_dung: number
          tao_luc: string
          tra_loi: string
        }
        Insert: {
          cau_hoi_goc: string
          dau_van: string
          dung_gan_nhat?: string | null
          het_han_luc?: string
          id?: never
          khoa_cau_hoi: string
          nguon: string
          so_lan_dung?: number
          tao_luc?: string
          tra_loi: string
        }
        Update: {
          cau_hoi_goc?: string
          dau_van?: string
          dung_gan_nhat?: string | null
          het_han_luc?: string
          id?: never
          khoa_cau_hoi?: string
          nguon?: string
          so_lan_dung?: number
          tao_luc?: string
          tra_loi?: string
        }
        Relationships: []
      }
      vmp_ai_cache_ngu_nghia: {
        Row: {
          cau_hoi: string
          cau_hoi_khoa: string
          created_at: string
          hit_count: number
          id: number
          invalidated_at: string | null
          invalidated_reason: string | null
          is_valid: boolean
          phan_hoi: Json
          phu_thuoc: string
          vector: string
        }
        Insert: {
          cau_hoi: string
          cau_hoi_khoa: string
          created_at?: string
          hit_count?: number
          id?: number
          invalidated_at?: string | null
          invalidated_reason?: string | null
          is_valid?: boolean
          phan_hoi: Json
          phu_thuoc?: string
          vector: string
        }
        Update: {
          cau_hoi?: string
          cau_hoi_khoa?: string
          created_at?: string
          hit_count?: number
          id?: number
          invalidated_at?: string | null
          invalidated_reason?: string | null
          is_valid?: boolean
          phan_hoi?: Json
          phu_thuoc?: string
          vector?: string
        }
        Relationships: []
      }
      vmp_ai_cau_hoi_vang: {
        Row: {
          bat: boolean
          cau_hoi: string
          created_at: string
          ghi_chu: string | null
          id: number
          mong_doi: Json
          nhom: string
        }
        Insert: {
          bat?: boolean
          cau_hoi: string
          created_at?: string
          ghi_chu?: string | null
          id?: number
          mong_doi: Json
          nhom?: string
        }
        Update: {
          bat?: boolean
          cau_hoi?: string
          created_at?: string
          ghi_chu?: string | null
          id?: number
          mong_doi?: Json
          nhom?: string
        }
        Relationships: []
      }
      vmp_ai_cham_diem_log: {
        Row: {
          chay_luc: string
          dat: number
          ghi_chu: string | null
          id: number
          tong: number
          truot: Json
        }
        Insert: {
          chay_luc?: string
          dat: number
          ghi_chu?: string | null
          id?: number
          tong: number
          truot?: Json
        }
        Update: {
          chay_luc?: string
          dat?: number
          ghi_chu?: string | null
          id?: number
          tong?: number
          truot?: Json
        }
        Relationships: []
      }
      vmp_ai_chat_log: {
        Row: {
          answer: string | null
          created_at: string
          duong_tra_loi: string | null
          error: string | null
          id: number
          latency_ms: number | null
          model: string | null
          question: string
          so_lac: Json | null
          sources: Json
          ty_le_bam: number | null
          user_email: string | null
          user_id: string | null
          y_dinh: string | null
        }
        Insert: {
          answer?: string | null
          created_at?: string
          duong_tra_loi?: string | null
          error?: string | null
          id?: never
          latency_ms?: number | null
          model?: string | null
          question: string
          so_lac?: Json | null
          sources?: Json
          ty_le_bam?: number | null
          user_email?: string | null
          user_id?: string | null
          y_dinh?: string | null
        }
        Update: {
          answer?: string | null
          created_at?: string
          duong_tra_loi?: string | null
          error?: string | null
          id?: never
          latency_ms?: number | null
          model?: string | null
          question?: string
          so_lac?: Json | null
          sources?: Json
          ty_le_bam?: number | null
          user_email?: string | null
          user_id?: string | null
          y_dinh?: string | null
        }
        Relationships: []
      }
      vmp_ai_dong_nghia: {
        Row: {
          bat: boolean
          cach_goi: string
          id: number
          nhom: string | null
          tu_chuan: string
        }
        Insert: {
          bat?: boolean
          cach_goi: string
          id?: never
          nhom?: string | null
          tu_chuan: string
        }
        Update: {
          bat?: boolean
          cach_goi?: string
          id?: never
          nhom?: string | null
          tu_chuan?: string
        }
        Relationships: []
      }
      vmp_ai_giong: {
        Row: {
          bat: boolean
          cau: string
          id: number
          ngu_canh: string
        }
        Insert: {
          bat?: boolean
          cau: string
          id?: never
          ngu_canh: string
        }
        Update: {
          bat?: boolean
          cau?: string
          id?: never
          ngu_canh?: string
        }
        Relationships: []
      }
      vmp_ai_hoi_thoai: {
        Row: {
          cau_hoi: string
          cho_lam_ro: boolean
          id: number
          phien: string
          tao_luc: string
          y_dinh: string | null
        }
        Insert: {
          cau_hoi: string
          cho_lam_ro?: boolean
          id?: never
          phien: string
          tao_luc?: string
          y_dinh?: string | null
        }
        Update: {
          cau_hoi?: string
          cho_lam_ro?: boolean
          id?: never
          phien?: string
          tao_luc?: string
          y_dinh?: string | null
        }
        Relationships: []
      }
      vmp_ai_mo_hinh: {
        Row: {
          bac: string
          bat: boolean
          ghi_chu: string | null
          loi_gan_nhat: string | null
          loi_lien_tiep: number
          luc_loi: string | null
          ma: string
          mien_phi: boolean
          nghi_den: string | null
          nha_cung_cap: string
          so_lan_goi: number
          so_lan_loi: number
          ten: string
          thu_tu: number
          tre_tb_ms: number | null
        }
        Insert: {
          bac: string
          bat?: boolean
          ghi_chu?: string | null
          loi_gan_nhat?: string | null
          loi_lien_tiep?: number
          luc_loi?: string | null
          ma: string
          mien_phi?: boolean
          nghi_den?: string | null
          nha_cung_cap: string
          so_lan_goi?: number
          so_lan_loi?: number
          ten: string
          thu_tu: number
          tre_tb_ms?: number | null
        }
        Update: {
          bac?: string
          bat?: boolean
          ghi_chu?: string | null
          loi_gan_nhat?: string | null
          loi_lien_tiep?: number
          luc_loi?: string | null
          ma?: string
          mien_phi?: boolean
          nghi_den?: string | null
          nha_cung_cap?: string
          so_lan_goi?: number
          so_lan_loi?: number
          ten?: string
          thu_tu?: number
          tre_tb_ms?: number | null
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
      vmp_ai_trich_dan_tam: {
        Row: {
          created_at: string
          id: number
          phien: string
          trich: Json
        }
        Insert: {
          created_at?: string
          id?: never
          phien?: string
          trich?: Json
        }
        Update: {
          created_at?: string
          id?: never
          phien?: string
          trich?: Json
        }
        Relationships: []
      }
      vmp_alert_recipients: {
        Row: {
          ai_report_enabled: boolean
          ai_report_schedule: string
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
          version: number
        }
        Insert: {
          ai_report_enabled?: boolean
          ai_report_schedule?: string
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
          version?: number
        }
        Update: {
          ai_report_enabled?: boolean
          ai_report_schedule?: string
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
          version?: number
        }
        Relationships: []
      }
      vmp_assignment_matrix: {
        Row: {
          created_at: string
          created_by: string | null
          department: string
          id: string
          is_active: boolean
          line: string
          note: string | null
          staff_name: string
          updated_at: string
          updated_by: string | null
          vai_tro: string
          validation_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department: string
          id?: string
          is_active?: boolean
          line?: string
          note?: string | null
          staff_name: string
          updated_at?: string
          updated_by?: string | null
          vai_tro?: string
          validation_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string
          id?: string
          is_active?: boolean
          line?: string
          note?: string | null
          staff_name?: string
          updated_at?: string
          updated_by?: string | null
          vai_tro?: string
          validation_type?: string
        }
        Relationships: []
      }
      vmp_assignment_rules: {
        Row: {
          category: string
          created_at: string
          expected_2026: number | null
          id: number
          is_active: boolean
          match_areas: string[] | null
          match_dept: string | null
          match_kind: string | null
          match_name_re: string | null
          owner_name: string
          priority: number
          support_name: string | null
          work_group: string
        }
        Insert: {
          category: string
          created_at?: string
          expected_2026?: number | null
          id: number
          is_active?: boolean
          match_areas?: string[] | null
          match_dept?: string | null
          match_kind?: string | null
          match_name_re?: string | null
          owner_name: string
          priority: number
          support_name?: string | null
          work_group: string
        }
        Update: {
          category?: string
          created_at?: string
          expected_2026?: number | null
          id?: number
          is_active?: boolean
          match_areas?: string[] | null
          match_dept?: string | null
          match_kind?: string | null
          match_name_re?: string | null
          owner_name?: string
          priority?: number
          support_name?: string | null
          work_group?: string
        }
        Relationships: []
      }
      vmp_catalog_changes: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          apply_reason: string | null
          apply_result: Json | null
          created_at: string
          created_by: string | null
          id: string
          impact: Json | null
          last_error: string | null
          new_data: Json
          object_code: string
          object_kind: string
          old_data: Json
          source_version: number
          status: string
          timeline_revision: number
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          apply_reason?: string | null
          apply_result?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: Json | null
          last_error?: string | null
          new_data?: Json
          object_code: string
          object_kind: string
          old_data?: Json
          source_version: number
          status?: string
          timeline_revision: number
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          apply_reason?: string | null
          apply_result?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: Json | null
          last_error?: string | null
          new_data?: Json
          object_code?: string
          object_kind?: string
          old_data?: Json
          source_version?: number
          status?: string
          timeline_revision?: number
        }
        Relationships: []
      }
      vmp_catalog_import_batches: {
        Row: {
          batch_reason: string | null
          committed_at: string | null
          committed_result: Json | null
          created_at: string
          dataset: string
          file_hash: string | null
          fingerprint: string
          id: string
          so_khong_doi: number
          so_loi: number
          so_sua: number
          so_tao_moi: number
          status: string
          template_version: string
          total_rows: number
          uploaded_by: string
        }
        Insert: {
          batch_reason?: string | null
          committed_at?: string | null
          committed_result?: Json | null
          created_at?: string
          dataset: string
          file_hash?: string | null
          fingerprint: string
          id?: string
          so_khong_doi?: number
          so_loi?: number
          so_sua?: number
          so_tao_moi?: number
          status?: string
          template_version: string
          total_rows?: number
          uploaded_by: string
        }
        Update: {
          batch_reason?: string | null
          committed_at?: string | null
          committed_result?: Json | null
          created_at?: string
          dataset?: string
          file_hash?: string | null
          fingerprint?: string
          id?: string
          so_khong_doi?: number
          so_loi?: number
          so_sua?: number
          so_tao_moi?: number
          status?: string
          template_version?: string
          total_rows?: number
          uploaded_by?: string
        }
        Relationships: []
      }
      vmp_catalog_import_rows: {
        Row: {
          batch_id: string
          business_key: string
          classification: string
          current_snapshot: Json | null
          errors: Json
          expected_version: number | null
          id: string
          input: Json
          object_kind: string | null
          patch: Json
          row_number: number
          row_reason: string | null
        }
        Insert: {
          batch_id: string
          business_key?: string
          classification: string
          current_snapshot?: Json | null
          errors?: Json
          expected_version?: number | null
          id?: string
          input: Json
          object_kind?: string | null
          patch?: Json
          row_number: number
          row_reason?: string | null
        }
        Update: {
          batch_id?: string
          business_key?: string
          classification?: string
          current_snapshot?: Json | null
          errors?: Json
          expected_version?: number | null
          id?: string
          input?: Json
          object_kind?: string | null
          patch?: Json
          row_number?: number
          row_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vmp_catalog_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "vmp_catalog_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_chat_giong: {
        Row: {
          bat: boolean
          created_at: string
          ghi_chu: string | null
          id: number
          noi_dung: string
          ten: string
          tu_khoa: string[]
          updated_at: string
          uu_tien: number
        }
        Insert: {
          bat?: boolean
          created_at?: string
          ghi_chu?: string | null
          id?: number
          noi_dung: string
          ten: string
          tu_khoa?: string[]
          updated_at?: string
          uu_tien?: number
        }
        Update: {
          bat?: boolean
          created_at?: string
          ghi_chu?: string | null
          id?: number
          noi_dung?: string
          ten?: string
          tu_khoa?: string[]
          updated_at?: string
          uu_tien?: number
        }
        Relationships: []
      }
      vmp_chat_loi_cho: {
        Row: {
          bat: boolean
          created_at: string
          id: number
          loai: string
          nguon: string | null
          noi_dung: string
        }
        Insert: {
          bat?: boolean
          created_at?: string
          id?: number
          loai: string
          nguon?: string | null
          noi_dung: string
        }
        Update: {
          bat?: boolean
          created_at?: string
          id?: number
          loai?: string
          nguon?: string | null
          noi_dung?: string
        }
        Relationships: []
      }
      vmp_danh_gia_anh_huong: {
        Row: {
          ah_de_xuat: number | null
          ah_hien_tai: number | null
          bo_phan: string | null
          cach_xep: string | null
          danh_gia_luc: string
          diem_phuc_tap: number | null
          lech: number | null
          ma_doi_tuong: string
          phan_loai: string | null
          so_hang_muc: number | null
          ten: string
          trong_yeu_de_xuat: number | null
          trong_yeu_hien_tai: number | null
        }
        Insert: {
          ah_de_xuat?: number | null
          ah_hien_tai?: number | null
          bo_phan?: string | null
          cach_xep?: string | null
          danh_gia_luc?: string
          diem_phuc_tap?: number | null
          lech?: number | null
          ma_doi_tuong: string
          phan_loai?: string | null
          so_hang_muc?: number | null
          ten: string
          trong_yeu_de_xuat?: number | null
          trong_yeu_hien_tai?: number | null
        }
        Update: {
          ah_de_xuat?: number | null
          ah_hien_tai?: number | null
          bo_phan?: string | null
          cach_xep?: string | null
          danh_gia_luc?: string
          diem_phuc_tap?: number | null
          lech?: number | null
          ma_doi_tuong?: string
          phan_loai?: string | null
          so_hang_muc?: number | null
          ten?: string
          trong_yeu_de_xuat?: number | null
          trong_yeu_hien_tai?: number | null
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
      vmp_diem_truoc_khi_doi: {
        Row: {
          ah_cu: number | null
          chup_luc: string | null
          diem_cu: number | null
          nguon_cu: string | null
          object_code: string | null
          object_name: string | null
          pt_cu: number | null
        }
        Insert: {
          ah_cu?: number | null
          chup_luc?: string | null
          diem_cu?: number | null
          nguon_cu?: string | null
          object_code?: string | null
          object_name?: string | null
          pt_cu?: number | null
        }
        Update: {
          ah_cu?: number | null
          chup_luc?: string | null
          diem_cu?: number | null
          nguon_cu?: string | null
          object_code?: string | null
          object_name?: string | null
          pt_cu?: number | null
        }
        Relationships: []
      }
      vmp_email_cho_phep: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          ghi_chu: string | null
          is_active: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          ghi_chu?: string | null
          is_active?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          ghi_chu?: string | null
          is_active?: boolean
        }
        Relationships: []
      }
      vmp_item_assignments: {
        Row: {
          assignment_kind: string
          assignment_role: string | null
          change_reason: string | null
          created_at: string
          created_by: string | null
          employee_code: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          normalized_staff_name: string | null
          performer_id: string | null
          source: string
          source_text: string | null
          staff_name: string
          unresolved_reason: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
          validation_code: string
        }
        Insert: {
          assignment_kind: string
          assignment_role?: string | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          employee_code?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          normalized_staff_name?: string | null
          performer_id?: string | null
          source: string
          source_text?: string | null
          staff_name: string
          unresolved_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          validation_code: string
        }
        Update: {
          assignment_kind?: string
          assignment_role?: string | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          employee_code?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          normalized_staff_name?: string | null
          performer_id?: string | null
          source?: string
          source_text?: string | null
          staff_name?: string
          unresolved_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          validation_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "vmp_item_assignments_performer_id_fkey"
            columns: ["performer_id"]
            isOneToOne: false
            referencedRelation: "vmp_performers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_item_assignments_validation_code_fkey"
            columns: ["validation_code"]
            isOneToOne: false
            referencedRelation: "vmp_plan_items"
            referencedColumns: ["validation_code"]
          },
        ]
      }
      vmp_kb_chunks: {
        Row: {
          content: string
          embedding: string | null
          heading: string | null
          id: number
          ord: number
          source: string
          updated_at: string
        }
        Insert: {
          content: string
          embedding?: string | null
          heading?: string | null
          id?: never
          ord?: number
          source: string
          updated_at?: string
        }
        Update: {
          content?: string
          embedding?: string | null
          heading?: string | null
          id?: never
          ord?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      vmp_kb_documents: {
        Row: {
          content: string | null
          embedding: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          id?: never
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          id?: never
          metadata?: Json | null
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
      vmp_performers: {
        Row: {
          access_areas: string[]
          access_class: string | null
          created_at: string
          department: string | null
          email: string | null
          email_sent_confirmed: boolean
          employee_code: string | null
          id: string
          is_active: boolean
          normalized_full_name: string | null
          note: string | null
          performer_name: string
          role_title: string | null
          scope_area_ids: string[]
          scope_departments: string[]
          scope_factory_ids: string[]
          scope_line_ids: string[]
          updated_at: string
          updated_by: string | null
          user_id: string | null
          version: number
        }
        Insert: {
          access_areas?: string[]
          access_class?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          email_sent_confirmed?: boolean
          employee_code?: string | null
          id?: string
          is_active?: boolean
          normalized_full_name?: string | null
          note?: string | null
          performer_name: string
          role_title?: string | null
          scope_area_ids?: string[]
          scope_departments?: string[]
          scope_factory_ids?: string[]
          scope_line_ids?: string[]
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          version?: number
        }
        Update: {
          access_areas?: string[]
          access_class?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          email_sent_confirmed?: boolean
          employee_code?: string | null
          id?: string
          is_active?: boolean
          normalized_full_name?: string | null
          note?: string | null
          performer_name?: string
          role_title?: string | null
          scope_area_ids?: string[]
          scope_departments?: string[]
          scope_factory_ids?: string[]
          scope_line_ids?: string[]
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          version?: number
        }
        Relationships: []
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
          department_text: string | null
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
          owner_person_id: string | null
          qa_approved_at: string | null
          qa_approved_by: string | null
          report_class: string | null
          requires_qa_approval: boolean | null
          scheduled_at: string | null
          scheduled_date: string | null
          secondary_owner: string | null
          sheet_row_id: string | null
          source_sheet_data: Json
          source_sheet_row: number | null
          source_sync_run_id: string | null
          status_protocol: Database["public"]["Enums"]["phase_status"] | null
          status_protocol_text: string | null
          status_report: Database["public"]["Enums"]["phase_status"] | null
          status_report_text: string | null
          status_validation: Database["public"]["Enums"]["phase_status"] | null
          status_validation_text: string | null
          status_vmp: Database["public"]["Enums"]["phase_status"] | null
          status_vmp_text: string | null
          support_person_id: string | null
          updated_at: string | null
          updated_by: string | null
          validation_code: string
          validation_type: string
          version: number
          work_group: string | null
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
          department_text?: string | null
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
          owner_person_id?: string | null
          qa_approved_at?: string | null
          qa_approved_by?: string | null
          report_class?: string | null
          requires_qa_approval?: boolean | null
          scheduled_at?: string | null
          scheduled_date?: string | null
          secondary_owner?: string | null
          sheet_row_id?: string | null
          source_sheet_data?: Json
          source_sheet_row?: number | null
          source_sync_run_id?: string | null
          status_protocol?: Database["public"]["Enums"]["phase_status"] | null
          status_protocol_text?: string | null
          status_report?: Database["public"]["Enums"]["phase_status"] | null
          status_report_text?: string | null
          status_validation?: Database["public"]["Enums"]["phase_status"] | null
          status_validation_text?: string | null
          status_vmp?: Database["public"]["Enums"]["phase_status"] | null
          status_vmp_text?: string | null
          support_person_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          validation_code: string
          validation_type?: string
          version?: number
          work_group?: string | null
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
          department_text?: string | null
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
          owner_person_id?: string | null
          qa_approved_at?: string | null
          qa_approved_by?: string | null
          report_class?: string | null
          requires_qa_approval?: boolean | null
          scheduled_at?: string | null
          scheduled_date?: string | null
          secondary_owner?: string | null
          sheet_row_id?: string | null
          source_sheet_data?: Json
          source_sheet_row?: number | null
          source_sync_run_id?: string | null
          status_protocol?: Database["public"]["Enums"]["phase_status"] | null
          status_protocol_text?: string | null
          status_report?: Database["public"]["Enums"]["phase_status"] | null
          status_report_text?: string | null
          status_validation?: Database["public"]["Enums"]["phase_status"] | null
          status_validation_text?: string | null
          status_vmp?: Database["public"]["Enums"]["phase_status"] | null
          status_vmp_text?: string | null
          support_person_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          validation_code?: string
          validation_type?: string
          version?: number
          work_group?: string | null
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
            foreignKeyName: "vmp_plan_items_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "vmp_performers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_plan_items_source_sync_run_id_fkey"
            columns: ["source_sync_run_id"]
            isOneToOne: false
            referencedRelation: "vmp_sheet_sync_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_plan_items_support_person_id_fkey"
            columns: ["support_person_id"]
            isOneToOne: false
            referencedRelation: "vmp_performers"
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
          is_active: boolean
          mixing_tank: string | null
          note: string | null
          primary_pack: string | null
          product_name: string | null
          production_line: string | null
          source_row: number
          strength: string | null
          updated_at: string
          version: number
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
          is_active?: boolean
          mixing_tank?: string | null
          note?: string | null
          primary_pack?: string | null
          product_name?: string | null
          production_line?: string | null
          source_row: number
          strength?: string | null
          updated_at?: string
          version?: number
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
          is_active?: boolean
          mixing_tank?: string | null
          note?: string | null
          primary_pack?: string | null
          product_name?: string | null
          production_line?: string | null
          source_row?: number
          strength?: string | null
          updated_at?: string
          version?: number
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
      vmp_rls_siet_log: {
        Row: {
          cmd: string
          doi_luc: string
          id: number
          policyname: string
          tablename: string
          vai_cu: string
          vai_moi: string
        }
        Insert: {
          cmd: string
          doi_luc?: string
          id?: number
          policyname: string
          tablename: string
          vai_cu: string
          vai_moi: string
        }
        Update: {
          cmd?: string
          doi_luc?: string
          id?: number
          policyname?: string
          tablename?: string
          vai_cu?: string
          vai_moi?: string
        }
        Relationships: []
      }
      vmp_role_permissions: {
        Row: {
          hanh_dong: string
          muc: string
          updated_at: string
          updated_by: string | null
          vai_tro: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          hanh_dong: string
          muc?: string
          updated_at?: string
          updated_by?: string | null
          vai_tro: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          hanh_dong?: string
          muc?: string
          updated_at?: string
          updated_by?: string | null
          vai_tro?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      vmp_scope_areas: {
        Row: {
          code: string
          created_at: string
          factory_id: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          factory_id: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          factory_id?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vmp_scope_areas_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "vmp_scope_factories"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_scope_factories: {
        Row: {
          code: string
          created_at: string
          department_id: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department_id: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department_id?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vmp_scope_factories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_scope_lines: {
        Row: {
          area_id: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          area_id: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          area_id?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vmp_scope_lines_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "vmp_scope_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      vmp_screen_permissions: {
        Row: {
          actions: string[]
          business_role: string
          can_view: boolean
          data_scope: string
          screen_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actions?: string[]
          business_role: string
          can_view?: boolean
          data_scope?: string
          screen_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actions?: string[]
          business_role?: string
          can_view?: boolean
          data_scope?: string
          screen_id?: string
          updated_at?: string
          updated_by?: string | null
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
      vmp_source_assignment_resolutions: {
        Row: {
          assignment_kind: string
          change_reason: string
          created_at: string
          created_by: string | null
          normalized_source_name: string
          performer_id: string | null
          source: string
          updated_at: string
          updated_by: string | null
          validation_code: string
        }
        Insert: {
          assignment_kind: string
          change_reason: string
          created_at?: string
          created_by?: string | null
          normalized_source_name: string
          performer_id?: string | null
          source: string
          updated_at?: string
          updated_by?: string | null
          validation_code: string
        }
        Update: {
          assignment_kind?: string
          change_reason?: string
          created_at?: string
          created_by?: string | null
          normalized_source_name?: string
          performer_id?: string | null
          source?: string
          updated_at?: string
          updated_by?: string | null
          validation_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "vmp_source_assignment_resolutions_performer_id_fkey"
            columns: ["performer_id"]
            isOneToOne: false
            referencedRelation: "vmp_performers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_source_assignment_resolutions_validation_code_fkey"
            columns: ["validation_code"]
            isOneToOne: false
            referencedRelation: "vmp_plan_items"
            referencedColumns: ["validation_code"]
          },
        ]
      }
      vmp_source_objects: {
        Row: {
          area_code: string | null
          complexity_score: number | null
          created_at: string
          critical_point: string | null
          criticality_score: number | null
          criticality_source: string
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
          owner_name: string | null
          owner_person_id: string | null
          quality_impact_score: number | null
          report_class: string | null
          show_flag: string | null
          source_row: number
          source_tab: string
          status: string | null
          support_name: string | null
          support_person_id: string | null
          timeline_applied_revision: number
          timeline_revision: number
          updated_at: string
          updated_by: string | null
          validate_flag: string | null
          validate_reason: string | null
          version: number
          work_group: string | null
          workdays: number | null
          year_ref: number | null
        }
        Insert: {
          area_code?: string | null
          complexity_score?: number | null
          created_at?: string
          critical_point?: string | null
          criticality_score?: number | null
          criticality_source?: string
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
          owner_name?: string | null
          owner_person_id?: string | null
          quality_impact_score?: number | null
          report_class?: string | null
          show_flag?: string | null
          source_row: number
          source_tab: string
          status?: string | null
          support_name?: string | null
          support_person_id?: string | null
          timeline_applied_revision?: number
          timeline_revision?: number
          updated_at?: string
          updated_by?: string | null
          validate_flag?: string | null
          validate_reason?: string | null
          version?: number
          work_group?: string | null
          workdays?: number | null
          year_ref?: number | null
        }
        Update: {
          area_code?: string | null
          complexity_score?: number | null
          created_at?: string
          critical_point?: string | null
          criticality_score?: number | null
          criticality_source?: string
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
          owner_name?: string | null
          owner_person_id?: string | null
          quality_impact_score?: number | null
          report_class?: string | null
          show_flag?: string | null
          source_row?: number
          source_tab?: string
          status?: string | null
          support_name?: string | null
          support_person_id?: string | null
          timeline_applied_revision?: number
          timeline_revision?: number
          updated_at?: string
          updated_by?: string | null
          validate_flag?: string | null
          validate_reason?: string | null
          version?: number
          work_group?: string | null
          workdays?: number | null
          year_ref?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vmp_source_objects_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "vmp_performers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_source_objects_support_person_id_fkey"
            columns: ["support_person_id"]
            isOneToOne: false
            referencedRelation: "vmp_performers"
            referencedColumns: ["id"]
          },
        ]
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
      vmp_active_item_assignments: {
        Row: {
          assignment_kind: string | null
          change_reason: string | null
          created_at: string | null
          created_by: string | null
          employee_code: string | null
          expires_at: string | null
          grants_access: boolean | null
          id: string | null
          is_active: boolean | null
          normalized_staff_name: string | null
          performer_id: string | null
          source: string | null
          source_text: string | null
          staff_name: string | null
          unresolved_reason: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
          validation_code: string | null
        }
        Insert: {
          assignment_kind?: string | null
          change_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          employee_code?: string | null
          expires_at?: string | null
          grants_access?: never
          id?: string | null
          is_active?: boolean | null
          normalized_staff_name?: string | null
          performer_id?: string | null
          source?: string | null
          source_text?: string | null
          staff_name?: string | null
          unresolved_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          validation_code?: string | null
        }
        Update: {
          assignment_kind?: string | null
          change_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          employee_code?: string | null
          expires_at?: string | null
          grants_access?: never
          id?: string | null
          is_active?: boolean | null
          normalized_staff_name?: string | null
          performer_id?: string | null
          source?: string | null
          source_text?: string | null
          staff_name?: string | null
          unresolved_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          validation_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vmp_item_assignments_performer_id_fkey"
            columns: ["performer_id"]
            isOneToOne: false
            referencedRelation: "vmp_performers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vmp_item_assignments_validation_code_fkey"
            columns: ["validation_code"]
            isOneToOne: false
            referencedRelation: "vmp_plan_items"
            referencedColumns: ["validation_code"]
          },
        ]
      }
      vmp_ai_tu_dien: {
        Row: {
          gia_tri: string | null
          khoa: string | null
          loai: string | null
        }
        Relationships: []
      }
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
      duoc_phep: {
        Args: { p_hanh_dong: string; p_vai_tro: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_qa: { Args: never; Returns: boolean }
      item_permissions_mode: { Args: never; Returns: string }
      ly_do_khong_sua_duoc: {
        Args: { p_uid: string; p_validation_code: string }
        Returns: string
      }
      match_vmp_kb: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      muc_quyen: {
        Args: { p_hanh_dong: string; p_vai_tro: string }
        Returns: string
      }
      muc_xem: { Args: { p_bieu_thuc: string; p_vai: string }; Returns: string }
      rpc_active_rules: { Args: never; Returns: Json }
      rpc_ai_cache_doc: { Args: { p_question: string }; Returns: Json }
      rpc_ai_cache_nn_luu: {
        Args: { p_cau_hoi: string; p_phan_hoi: Json; p_vector: string }
        Returns: Json
      }
      rpc_ai_cache_nn_tim: {
        Args: {
          p_cau_hoi: string
          p_nguong?: number
          p_phien?: string
          p_vector?: string
        }
        Returns: Json
      }
      rpc_ai_cham_tra_cuu: { Args: { p_ghi_chu?: string }; Returns: Json }
      rpc_ai_chay_bo_kiem: { Args: { p_nguoi?: Json }; Returns: Json }
      rpc_ai_chon_mo_hinh: { Args: { p_question: string }; Returns: Json }
      rpc_ai_context: {
        Args: { p_question?: string; p_row_limit?: number; p_year?: number }
        Returns: Json
      }
      rpc_ai_context_goc: {
        Args: { p_question?: string; p_row_limit?: number; p_year?: number }
        Returns: Json
      }
      rpc_ai_context_gon: {
        Args: { p_question?: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_do_kho: { Args: { p_question: string }; Returns: Json }
      rpc_ai_do_thuc_the: {
        Args: { p_loai?: string; p_question: string }
        Returns: Json
      }
      rpc_ai_doc_trang_thai: {
        Args: { p_question: string; p_ten?: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_dung_cau_tra_loi: {
        Args: { p_hieu: Json; p_question: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_dung_cau_tra_loi_goc: {
        Args: { p_hieu: Json; p_question: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_ghep_ngu_canh: {
        Args: { p_phien: string; p_question: string }
        Returns: Json
      }
      rpc_ai_ghi_ket_qua: {
        Args: { p_loi?: string; p_ma: string; p_ok: boolean; p_tre_ms?: number }
        Returns: Json
      }
      rpc_ai_ghi_nho: {
        Args: {
          p_loai: string
          p_nguoi: string
          p_noi_dung: string
          p_quan_trong?: number
          p_tu_khoa?: string[]
        }
        Returns: Json
      }
      rpc_ai_goi_y_chip: { Args: { p_cau_hoi: string }; Returns: Json }
      rpc_ai_goi_y_tiep: {
        Args: { p_hieu: Json; p_year?: number }
        Returns: Json
      }
      rpc_ai_hieu_cau_hoi: { Args: { p_question: string }; Returns: Json }
      rpc_ai_hieu_tu_khoa: {
        Args: { p_cau_hoi: string; p_k?: number }
        Returns: Json
      }
      rpc_ai_ho_so_nguoi: {
        Args: { p_ten: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_khong_hieu: { Args: { p_question: string }; Returns: string }
      rpc_ai_kiem_chung: {
        Args: { p_du_lieu: string; p_tra_loi: string }
        Returns: Json
      }
      rpc_ai_kiem_mo_ho: { Args: { p_question: string }; Returns: Json }
      rpc_ai_lay_giong: { Args: { p_tin_xau?: boolean }; Returns: Json }
      rpc_ai_mail_targets: {
        Args: { p_bo_qua_lich?: boolean; p_ngay?: string }
        Returns: Json
      }
      rpc_ai_mo_rong_cau_hoi: { Args: { p_question: string }; Returns: Json }
      rpc_ai_muc_luc: { Args: never; Returns: Json }
      rpc_ai_ngu_canh_nap_san: {
        Args: { p_question: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_ngu_canh_phan_tich: {
        Args: { p_phien?: string; p_question: string }
        Returns: Json
      }
      rpc_ai_ngu_canh_tam_ly: {
        Args: { p_question: string; p_ten?: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_nho_lai: {
        Args: { p_cau_hoi?: string; p_nguoi: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_phan_tich_cau_hoi: {
        Args: { p_cau_hoi: string; p_phien?: string }
        Returns: Json
      }
      rpc_ai_suc_khoe: { Args: never; Returns: Json }
      rpc_ai_tam_su: {
        Args: { p_nguoi?: Json; p_question: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_thong_ke_loc: {
        Args: { p_cau_hoi: string; p_k?: number }
        Returns: Json
      }
      rpc_ai_tim_nguoi_mo: {
        Args: { p_question: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_tra_loi_nhanh: {
        Args: {
          p_nguoi?: Json
          p_phien?: string
          p_question: string
          p_year?: number
        }
        Returns: Json
      }
      rpc_ai_trong_diem: { Args: { p_hieu: Json }; Returns: Json }
      rpc_ai_ve_nguoi_hoi: {
        Args: { p_nguoi: Json; p_question: string; p_year?: number }
        Returns: Json
      }
      rpc_ai_xa_giao: {
        Args: { p_nguoi?: Json; p_question: string }
        Returns: Json
      }
      rpc_alert_context: {
        Args: { p_limit?: number; p_validation_code: string }
        Returns: Json
      }
      rpc_apply_assignments: { Args: { p_overwrite?: boolean }; Returns: Json }
      rpc_apply_catalog_change: {
        Args: {
          p_change_id: string
          p_expected_timeline_revision?: number
          p_reason: string
        }
        Returns: Json
      }
      rpc_apply_sheet_sync: {
        Args: { p_op: string; p_patch: Json; p_validation_code: string }
        Returns: Json
      }
      rpc_catalog_history: {
        Args: { p_filters?: Json; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      rpc_catalog_history_detail: { Args: { p_id: string }; Returns: Json }
      rpc_check_data_quality: { Args: { p_year?: number }; Returns: Json }
      rpc_cleanup_orphan_source_assignment_resolutions: {
        Args: { p_reason: string }
        Returns: Json
      }
      rpc_commit_catalog_import: {
        Args: { p_batch_id: string; p_reason: string }
        Returns: Json
      }
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
      rpc_delete_performer: { Args: { p_id: string }; Returns: Json }
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
      rpc_import_item_permission_staff: {
        Args: { p_reason: string; p_rows: Json }
        Returns: Json
      }
      rpc_item_assignments: {
        Args: { p_person_id?: string; p_validation_code?: string }
        Returns: Json
      }
      rpc_item_permission_account_candidates: {
        Args: { p_query?: string }
        Returns: Json
      }
      rpc_item_permission_directory: {
        Args: { p_query?: string }
        Returns: Json
      }
      rpc_item_permission_preflight: { Args: never; Returns: Json }
      rpc_item_permission_scope_catalog: { Args: never; Returns: Json }
      rpc_item_progress_history: {
        Args: { p_limit?: number; p_offset?: number; p_validation_code: string }
        Returns: Json
      }
      rpc_kb_search: {
        Args: { p_embedding: string; p_k?: number; p_min_score?: number }
        Returns: Json
      }
      rpc_kb_search_text: {
        Args: { p_k?: number; p_query: string }
        Returns: Json
      }
      rpc_lay_giong: {
        Args: { p_cau_hoi: string; p_k?: number }
        Returns: Json
      }
      rpc_lien_ket_tai_khoan: {
        Args: { p_performer_id: string; p_user_id: string }
        Returns: Json
      }
      rpc_link_item_permission_account: {
        Args: {
          p_expected_version: number
          p_person_id: string
          p_reason: string
          p_user_id: string
        }
        Returns: Json
      }
      rpc_list_catalog_changes: {
        Args: {
          p_limit?: number
          p_object_kind?: string
          p_offset?: number
          p_status?: string
        }
        Returns: Json
      }
      rpc_list_catalog_dataset: {
        Args: {
          p_dataset: string
          p_filters?: Json
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: Json
      }
      rpc_list_source_tabs: { Args: never; Returns: Json }
      rpc_luat_xem: { Args: never; Returns: Json }
      rpc_mark_alert_sent: {
        Args: { p_error?: string; p_idempotency_key: string; p_ok: boolean }
        Returns: Json
      }
      rpc_my_editable_progress_rights: { Args: never; Returns: Json }
      rpc_my_ui_access: { Args: never; Returns: Json }
      rpc_nguoi_va_quyen: { Args: never; Returns: Json }
      rpc_preview_catalog_change: {
        Args: { p_change_id: string }
        Returns: Json
      }
      rpc_preview_item_rights: {
        Args: { p_person_id?: string; p_validation_code?: string }
        Returns: Json
      }
      rpc_recalc_criticality: { Args: { p_only_auto?: boolean }; Returns: Json }
      rpc_reconcile_orphan_objects: {
        Args: { p_codes_in_sheet: string[] }
        Returns: Json
      }
      rpc_refresh_computed_status: { Args: never; Returns: Json }
      rpc_refresh_source_item_assignments: { Args: never; Returns: Json }
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
      rpc_resolve_source_item_assignment: {
        Args: { p_assignment_id: string; p_person_id: string; p_reason: string }
        Returns: Json
      }
      rpc_rollback_vmp_sheet_sync: {
        Args: { p_sync_run_id: string }
        Returns: Json
      }
      rpc_save_alert_recipient: {
        Args: {
          p_expected_version?: number
          p_id: string
          p_patch: Json
          p_reason?: string
        }
        Returns: Json
      }
      rpc_save_catalog_object: {
        Args: {
          p_expected_version?: number
          p_object_code: string
          p_object_kind: string
          p_patch: Json
          p_reason?: string
        }
        Returns: Json
      }
      rpc_save_product_gmp: {
        Args: {
          p_bfo_code: string
          p_expected_version?: number
          p_patch: Json
          p_reason?: string
        }
        Returns: Json
      }
      rpc_set_assignment: {
        Args: {
          p_department: string
          p_line: string
          p_staff_name: string
          p_vai_tro: string
          p_validation_type: string
        }
        Returns: Json
      }
      rpc_set_catalog_import_row_reason: {
        Args: { p_batch_id: string; p_reason: string; p_row_number: number }
        Returns: Json
      }
      rpc_set_email_cho_phep: {
        Args: { p_cho_phep: boolean; p_email: string; p_ghi_chu?: string }
        Returns: Json
      }
      rpc_set_item_assignment: {
        Args: {
          p_action: string
          p_assignment_kind: string
          p_assignment_role: string
          p_expected_primary_assignment_id?: string
          p_person_id: string
          p_reason: string
          p_validation_code: string
        }
        Returns: Json
      }
      rpc_set_item_performer: {
        Args: { p_performer_name: string; p_validation_code: string }
        Returns: Json
      }
      rpc_set_item_performer_by_id: {
        Args: {
          p_person_id: string
          p_reason: string
          p_validation_code: string
        }
        Returns: Json
      }
      rpc_set_item_permissions_mode: {
        Args: { p_mode: string; p_reason: string }
        Returns: Json
      }
      rpc_set_item_state: {
        Args: { p_reason: string; p_state: string; p_validation_code: string }
        Returns: Json
      }
      rpc_set_role_permission: {
        Args: { p_hanh_dong: string; p_muc: string; p_vai_tro: string }
        Returns: Json
      }
      rpc_set_user_role: {
        Args: {
          p_department: string
          p_pham_vi?: string
          p_reason?: string
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      rpc_source_warnings: { Args: { p_year?: number }; Returns: Json }
      rpc_stage_catalog_import: {
        Args: {
          p_dataset: string
          p_file_hash?: string
          p_fingerprint: string
          p_rows?: Json
          p_template_version: string
        }
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
      rpc_tim_tri_thuc: {
        Args: { p_cau_hoi: string; p_k?: number; p_vector?: string }
        Returns: Json
      }
      rpc_trang_thai_he_thong: { Args: never; Returns: Json }
      rpc_update_progress: {
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
      rpc_upsert_item_permission_staff: {
        Args: {
          p_expected_version: number
          p_patch: Json
          p_person_id: string
          p_reason: string
        }
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
      rpc_upsert_performer: {
        Args: { p_id: string; p_patch: Json }
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
      screen_access_mode: { Args: never; Returns: string }
      validate_plan_item: {
        Args: { item: Database["public"]["Tables"]["vmp_plan_items"]["Row"] }
        Returns: Json
      }
      vmp_ai_dau_van: { Args: never; Returns: string }
      vmp_ai_khoa_cau_hoi: { Args: { p_q: string }; Returns: string }
      vmp_allowed_timeline_fields: {
        Args: { p_uid: string; p_validation_code: string }
        Returns: string[]
      }
      vmp_business_role: { Args: { p_uid: string }; Returns: string }
      vmp_business_role_unresolved_reason: {
        Args: { p_uid: string }
        Returns: string
      }
      vmp_can_view_item: {
        Args: { p_uid: string; p_validation_code: string }
        Returns: boolean
      }
      vmp_can_view_my_item: {
        Args: { p_validation_code: string }
        Returns: boolean
      }
      vmp_catalog_timeline_fields: { Args: never; Returns: string[] }
      vmp_don_dau_vet_dong_bo: { Args: { p_giu?: number }; Returns: Json }
      vmp_hang_muc_da_co_tien_do: {
        Args: { p_validation_code: string }
        Returns: boolean
      }
      vmp_harden_dashboard_object_scope: { Args: never; Returns: undefined }
      vmp_import_chuan_hoa: {
        Args: { p_kieu: string; p_v: Json }
        Returns: Json
      }
      vmp_import_cot: {
        Args: { p_dataset: string }
        Returns: {
          bat_buoc: boolean
          cot: string
          kieu: string
        }[]
      }
      vmp_item_rights: {
        Args: { p_uid: string; p_validation_code: string }
        Returns: {
          area_match: boolean
          assignment_sources: string[]
          can_view: boolean
          editable_fields: string[]
          scope_match: boolean
          view_reason: string
        }[]
      }
      vmp_item_rights_before_assignment_only_qa: {
        Args: { p_uid: string; p_validation_code: string }
        Returns: {
          area_match: boolean
          assignment_sources: string[]
          can_view: boolean
          editable_fields: string[]
          scope_match: boolean
          view_reason: string
        }[]
      }
      vmp_item_rights_before_canonical_scope: {
        Args: { p_uid: string; p_validation_code: string }
        Returns: {
          area_match: boolean
          assignment_sources: string[]
          can_view: boolean
          editable_fields: string[]
          scope_match: boolean
          view_reason: string
        }[]
      }
      vmp_item_scope_matches: {
        Args: { p_person_id: string; p_validation_code: string }
        Returns: {
          area_match: boolean
          factory_match: boolean
          line_match: boolean
          scope_match: boolean
        }[]
      }
      vmp_item_scope_path_count: {
        Args: { p_validation_code: string }
        Returns: number
      }
      vmp_jsonb_text_array: {
        Args: { p_key: string; p_value: Json }
        Returns: string[]
      }
      vmp_jsonb_uuid_array: {
        Args: { p_key: string; p_value: Json }
        Returns: string[]
      }
      vmp_khong_dau: { Args: { t: string }; Returns: string }
      vmp_loai_tham_dinh: {
        Args: {
          p_object_code: string
          p_object_kind: string
          p_year: number
          p_year_ref: number
        }
        Returns: string[]
      }
      vmp_luu_tru_nhat_ky: { Args: { p_thang?: number }; Returns: Json }
      vmp_ma_phan_loai: { Args: { p_kind: string }; Returns: string }
      vmp_manager_principal: {
        Args: { p_uid: string }
        Returns: {
          access_areas: string[]
          performer_department: string
          principal_kind: string
          profile_department: string
          scope_departments: string[]
        }[]
      }
      vmp_my_item_rights: {
        Args: { p_validation_code: string }
        Returns: {
          area_match: boolean
          assignment_sources: string[]
          can_view: boolean
          editable_fields: string[]
          scope_match: boolean
          view_reason: string
        }[]
      }
      vmp_normalize_person_name: { Args: { p_name: string }; Returns: string }
      vmp_parse_depts: { Args: { p_raw: string }; Returns: string[] }
      vmp_parse_scheduled_at: { Args: { p_value: string }; Returns: string }
      vmp_phase_status_text: {
        Args: { p: Database["public"]["Enums"]["phase_status"] }
        Returns: string
      }
      vmp_score_complexity: {
        Args: { p_kind: string; p_name: string; p_report_class?: string }
        Returns: number
      }
      vmp_score_quality_impact: {
        Args: { p_department: string; p_kind: string; p_name: string }
        Returns: number
      }
      vmp_score_quality_impact_de_xuat: {
        Args: { p_department: string; p_kind: string; p_name: string }
        Returns: number
      }
      vmp_set_item_assignment_unhardened: {
        Args: {
          p_action: string
          p_assignment_kind: string
          p_person_id: string
          p_reason: string
          p_validation_code: string
        }
        Returns: Json
      }
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
      vmp_tinh_moc_thoi_gian: {
        Args: {
          p_first_month: number
          p_freq_months: number
          p_lan_thu: number
          p_report_class: string
          p_validation_type: string
          p_workdays: number
          p_year: number
        }
        Returns: {
          deadline_protocol: string
          deadline_report: string
          deadline_validation: string
          deadline_vmp: string
          thieu: string[]
        }[]
      }
      vmp_unfiltered_security_definer_item_readers: {
        Args: never
        Returns: {
          signature: string
        }[]
      }
      vmp_upsert_item_permission_staff_before_focused_enforcement: {
        Args: {
          p_expected_version: number
          p_patch: Json
          p_person_id: string
          p_reason: string
        }
        Returns: Json
      }
      vmp_upsert_item_permission_staff_department_unchecked: {
        Args: { p_patch: Json; p_person_id: string; p_reason: string }
        Returns: Json
      }
      vmp_upsert_item_permission_staff_unvalidated: {
        Args: { p_patch: Json; p_person_id: string; p_reason: string }
        Returns: Json
      }
      vmp_upsert_source_object_before_person_id: {
        Args: { p_object_code: string; p_object_kind: string; p_patch: Json }
        Returns: Json
      }
      vmp_valid_access_areas: { Args: { p_areas: string[] }; Returns: boolean }
      vmp_valid_permission_scope: {
        Args: {
          p_areas: string[]
          p_departments: string[]
          p_factories: string[]
          p_lines: string[]
        }
        Returns: boolean
      }
      vmp_valid_person_department: {
        Args: { p_department: string }
        Returns: boolean
      }
      vmp_valid_scope_departments: {
        Args: { p_scope: string[] }
        Returns: boolean
      }
      vmp_visible_plan_items: {
        Args: never
        Returns: {
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
          department_text: string | null
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
          owner_person_id: string | null
          qa_approved_at: string | null
          qa_approved_by: string | null
          report_class: string | null
          requires_qa_approval: boolean | null
          scheduled_at: string | null
          scheduled_date: string | null
          secondary_owner: string | null
          sheet_row_id: string | null
          source_sheet_data: Json
          source_sheet_row: number | null
          source_sync_run_id: string | null
          status_protocol: Database["public"]["Enums"]["phase_status"] | null
          status_protocol_text: string | null
          status_report: Database["public"]["Enums"]["phase_status"] | null
          status_report_text: string | null
          status_validation: Database["public"]["Enums"]["phase_status"] | null
          status_validation_text: string | null
          status_vmp: Database["public"]["Enums"]["phase_status"] | null
          status_vmp_text: string | null
          support_person_id: string | null
          updated_at: string | null
          updated_by: string | null
          validation_code: string
          validation_type: string
          version: number
          work_group: string | null
          year: number
        }[]
        SetofOptions: {
          from: "*"
          to: "vmp_plan_items"
          isOneToOne: false
          isSetofReturn: true
        }
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

