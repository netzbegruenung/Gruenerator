/**
 * Type definitions for Custom Prompts
 */

export interface CustomPrompt {
  id: string;
  name: string;
  slug: string;
  prompt: string;
  description?: string;
  is_public: boolean;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at?: string;
  is_owner?: boolean;
  owner_first_name?: string;
  owner_last_name?: string;
  saved_at?: string;
}

export interface CustomPromptCreateData {
  prompt: string;
  is_public?: boolean;
}

export interface CustomPromptUpdateData {
  id: string;
  prompt?: string;
  is_public?: boolean;
}
