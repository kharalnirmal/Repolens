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
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: never;
        Update: never;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
