
export enum StatType {
  // Base Stats (Aptitude)
  CONFIDENCE = 'CONFIDENCE',
  WILL = 'WILL',
  WIT = 'WIT',
  GRACE = 'GRACE',
  UTILITY = 'UTILITY',
  AWARENESS = 'AWARENESS',
  
  // Dynamic Stats (State)
  VITALITY = 'VITALITY',
  FINANCE = 'FINANCE',
  SOCIAL_CLASS = 'SOCIAL_CLASS',
  BLUSH = 'BLUSH',
  FATIGUE = 'FATIGUE',
  VULNERABILITY = 'VULNERABILITY',
  
  // Environmental
  MALE_GAZE = 'MALE_GAZE',
  FEMALE_JUDGE = 'FEMALE_JUDGE',
  DANGER = 'DANGER'
}

export enum TimeSegment {
  PRE_DAWN = 'Pre-Dawn',
  DAWN = 'Dawn',
  MORNING = 'Morning',
  DAY = 'Day',
  EVENING = 'Evening',
  NIGHT = 'Night',
  POST_NIGHT = 'Post-Night'
}

export interface Item {
  id: string;
  name: string;
  type: 'Top' | 'Bottom' | 'Footwear' | 'Accessory' | 'Underwear_Top' | 'Underwear_Bottom' | 'FullBody';
  basePrice: number;
  stats: Partial<Record<StatType, number>>;
  description: string;
  tags: string[]; // e.g., "Feminine", "High Class", "Revealing"
}

export interface GameConfig {
  nsfw: boolean;
  intensity: 'Light' | 'Full';
  tutorial: boolean;
  firstTimeEvents: boolean;
}

export interface GameState {
  stats: Record<StatType, number>;
  inventory: Item[];
  equipped: {
    top?: Item | null;
    bottom?: Item | null;
    footwear?: Item | null;
    underwearTop?: Item | null;
    underwearBottom?: Item | null;
    accessory?: Item | null;
    fullBody?: Item | null;
  };
  time: {
    day: number;
    segment: TimeSegment;
    slotsUsed: number; // 0-3
  };
  location: string;
  history: { role: 'user' | 'model'; text: string; retracted?: boolean }[];
  npcRelationships: Record<string, { trust: number; attraction: number; familiarity: number; isFavorite?: boolean }>;
  config?: GameConfig;
}

export interface Intent {
  type: 'Question' | 'Request' | 'Confess' | 'Praise' | 'Act' | 'Challenge' | 'Lie';
  manner: 'Neutral' | 'Curious' | 'Serious' | 'Sarcastic' | 'Humorous' | 'Teasing' | 'Flirty' | 'Aggressive' | 'Hesitant';
}

export interface GameEngineResponse {
  narrative: string;
  updates: {
    statChanges?: Partial<Record<StatType, number>>;
    relationshipChanges?: Record<string, { trust?: number; attraction?: number; familiarity?: number }>;
    moneyChange?: number; // Positive for gain, negative for spent
    locationChange?: string; // New location ID if moved
    itemGained?: string[]; // IDs of items
    itemLost?: string[]; // IDs of items
  };
}
