export type PlayerEventStatus = 
  | 'NOT_REGISTERED'
  | 'MAIN_LIST'
  | 'WAITLIST'
  | 'PROMOTED_FROM_WAITLIST'
  | 'LEFT_EVENT'
  | 'EVENT_CLOSED';

export type PlayerProfileDetails = {
  id: string;
  name?: string;
  phone?: string;
  avatar_path?: string;
  has_global_priority?: boolean;
};

export type RegistrationResult = {
  success: boolean;
  stage: "validation" | "form_data" | "player_lookup" | "player_creation" | "photo_upload" | "player_update" | "group_requests" | "verification" | "unexpected" | "duplicate_check";
  code?: string;
  userMessage: string;
  technicalMessage?: string;
  details?: any;
  hint?: string;
  playerId?: string;
  groups?: string[];
  version?: string;
  has_global_priority?: boolean;
};
