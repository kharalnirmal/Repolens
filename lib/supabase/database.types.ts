export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      analyses: {
        Row: {
          commit_sha: string | null;
          completed_at: string | null;
          coverage: Json | null;
          created_at: string;
          error_message: string | null;
          framework: string | null;
          id: string;
          organization_id: string;
          project_id: string;
          stage: string | null;
          started_at: string | null;
          status: string;
          status_message: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "analyses_organization_id_project_id_fkey";
            columns: ["organization_id", "project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      edges: {
        Row: {
          analysis_id: string;
          created_at: string;
          id: string;
          kind: string;
          organization_id: string;
          source_file_id: string;
          specifier: string;
          target_file_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      explanations: {
        Row: {
          analysis_id: string;
          content: string;
          content_hash: string;
          created_at: string;
          file_id: string | null;
          folder_path: string | null;
          id: string;
          model: string;
          organization_id: string;
          prompt_version: string;
          shown_paths: string[];
        };
        Insert: {
          analysis_id: string;
          content: string;
          content_hash: string;
          created_at?: string;
          file_id?: string | null;
          folder_path?: string | null;
          id?: string;
          model: string;
          organization_id: string;
          prompt_version: string;
          shown_paths: string[];
        };
        Update: never;
        Relationships: [];
      };
      files: {
        Row: {
          analysis_id: string;
          content: string;
          content_hash: string;
          created_at: string;
          exports: string[];
          id: string;
          line_count: number;
          module_kind: string | null;
          organization_id: string;
          path: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      file_roles: {
        Row: {
          analysis_id: string;
          created_at: string;
          file_id: string;
          id: string;
          organization_id: string;
          role: string;
          source: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          repository_name: string;
          repository_url: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      role_classification_cache: {
        Row: {
          content_hash: string;
          created_at: string;
          model: string;
          organization_id: string;
          prompt_version: string;
          role: string;
        };
        Insert: {
          content_hash: string;
          created_at?: string;
          model: string;
          organization_id: string;
          prompt_version: string;
          role: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_or_get_analysis: {
        Args: {
          p_repository_name: string;
          p_repository_url: string;
        };
        Returns: {
          analysis_id: string;
          analysis_status: string;
          was_created: boolean;
        }[];
      };
      delete_repository_project: {
        Args: {
          p_project_id: string;
        };
        Returns: boolean;
      };
      get_analysis_graph: {
        Args: {
          p_analysis_id: string;
        };
        Returns: Json;
      };
      get_role_classifications: {
        Args: {
          p_content_hashes: string[];
          p_model: string;
          p_organization_id: string;
          p_prompt_version: string;
        };
        Returns: {
          content_hash: string;
          role: string;
        }[];
      };
      restart_failed_analysis: {
        Args: {
          p_analysis_id: string;
        };
        Returns: boolean;
      };
      set_analysis_run_state: {
        Args: {
          p_analysis_id: string;
          p_error_message?: string | null;
          p_stage: string;
          p_status: string;
          p_status_message: string;
        };
        Returns: undefined;
      };
      store_analysis_result: {
        Args:
          | {
              p_analysis_id: string;
              p_commit_sha: string;
              p_coverage: Json;
              p_edges: Json;
              p_file_roles?: Json;
              p_files: Json;
              p_framework: string | null;
              p_routes?: Json;
            }
          | {
              p_analysis_id: string;
              p_commit_sha: string;
              p_coverage: Json;
              p_edges: Json;
              p_files: Json;
              p_framework: string | null;
            };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
