
import { StatType, TimeSegment, Item, GameState } from './types';

export const GAME_START_TEXT = "You wake up. The room is familiar, yet... different. You catch a glimpse of yourself in the mirror. This isn't the body you went to sleep in. It's Pre-Dawn. The house is quiet.";

export const TUTORIAL_START_TEXT = `The alarm isn't what wakes you. It’s the weight. Or rather, the lack of it.
You blink, staring at a ceiling that looks familiar but feels wrong. The air in the room is different—softer, smelling faintly of lavender and old books. You go to rub the sleep from your eyes, but your hand feels… small. Delicate.
You sit up, the sheets sliding down your chest, and the sensation is immediate. A rush of cold air hits skin that shouldn't be there. Panic, cold and sharp, spikes in your chest. You scramble out of bed, your center of gravity completely thrown off, and stumble toward the full-length mirror in the corner.
You freeze.
Eli is gone. Staring back at you is a stranger—a woman with messy blonde hair, wide terrified eyes, and a body that hums with a nervous, electric energy. You touch your face, and the reflection mimics the movement instantly. This is real. This is you.`;

export const TUTORIAL_PHASE_1_CHOICES = [
    "[ CURIOSITY ] Lean in closer. Inspect the reflection.",
    "[ PANIC ] Stumble backward. Rush to the bathroom.",
    "[ PHYSIOLOGICAL ] Focus on the sensation. Ground yourself."
];

export const TUTORIAL_INSTRUCTIONS = `
[SYSTEM INSTRUCTION: STRICT NARRATIVE RAILS]
You are running the "Tutorial Phase" of Lily's Life. You must adhere to the following script phases based on the player's location and actions.

GLOBAL RULES:
1. Do NOT hallucinate new locations or NPCs until Phase 6 is complete.
2. If a [CHOICE BLOCK] is defined, you MUST offer similar choices in your JSON output.
3. Keep the tone immersive, slightly disorienting (body swap), and sensory-focused.

PHASE 1: THE AWAKENING (Current)
LOCATION: home_lily_bedroom
CONTEXT: Player has just woken up in Lily's body.
OBJECTIVE: React to the new body.
NEXT STEP: Move to Bathroom/Shower.

PHASE 2: THE SHOWER (Archetype Lock)
TRIGGER: Player enters 'home_lily_shower' or chooses to wash up.
NARRATIVE: The physical sensation of the water is overwhelming. The player must choose an emotional archetype.
[CHOICE BLOCK]:
- [ EUPHORIC ] "Finally." (Unlock Vixen)
- [ EXCITED ] "This is wild." (Unlock Thrill-Seeker)
- [ BITTER ] "Just my luck." (Unlock Cynic)
- [ RESISTANT ] "No, no, no." (Unlock Resister)
- [ ANALYTICAL ] "Assess data." (Unlock Analyst)

PHASE 3: THE WARDROBE (Inventory Gate)
TRIGGER: Player enters 'home_lily_closet'.
MECHANIC: The player CANNOT leave the bedroom area until they equip 'Underwear_Top' and 'Underwear_Bottom'.
FAIL STATE: If they try to leave naked, force them back: "You can't go out there like this. Mitch is downstairs."

PHASE 4: THE BRO HUG (Social Test)
TRIGGER: Player enters 'home_mitch_livingroom'.
NPC: Mitch (Best Friend, doesn't know you swapped).
ACTION: Mitch gives a physical "bro hug".
NARRATIVE: Describe the height difference, the smell of him, and the awkwardness of being held as a woman by your best bro.

PHASE 5: THE WORLD
TRIGGER: Player leaves the house.
NARRATIVE: The sensory overload of the wind, the gaze of strangers, the "Male Gaze" stat activating for the first time.

[SYSTEM INSTRUCTION: CHOICE GENERATION]
For any Phase that includes a [CHOICE BLOCK], you MUST append the choices to the end of your response using the following format exactly.
$$$CHOICES$$$
["Choice 1", "Choice 2", "Choice 3", "Choice 4"]
`;

// --- NPC CONFIGURATION ---

export const NPC_IMAGES: Record<string, string> = {
  "Ramone": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_00_Ramone_01.png?raw=true",
  "Ashley": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_02_Ashley_02.png?raw=true",
  "Mitch": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_03_Mitch_02.png?raw=true",
  "Marcus": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_04_Marcus_01.png?raw=true",
  "Tiffany": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_05_Tiffany_01.png?raw=true",
  "Alistar": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_06_Alistar_01.png?raw=true",
  "Roxy": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_07_Roxy_01.png?raw=true",
  "Tano": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_08_Tano_01.png?raw=true",
  "The Agent": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_09_TheAgent_01.png?raw=true",
  "Aric": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_10_Aric_01.png?raw=true",
  "Finn": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_11_Finn_01.png?raw=true",
  "Jax": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_12_Jax_01.png?raw=true",
  "Veronica": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_13_Veronica_01.png?raw=true",
  "Benji": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_14_Benji_01.png?raw=true",
  "Cassian": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_15_Cassian_01.png?raw=true",
  "Nova": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_16_Nova_01.png?raw=true",
  "Esther": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_17_Esther_01.png?raw=true",
  "The Stranger": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_18_TheStranger_01.png?raw=true",
  "Brock": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_19_Brock_01.png?raw=true",
  "Duke": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_20_Duke_01.png?raw=true",
  "Jeb": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_21_Jeb_01.png?raw=true",
  "Vic": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_22_Vic_01.png?raw=true",
  "Kwame": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_23_Kwame_01.png?raw=true",
  "Simone": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_24_Simone_01.png?raw=true",
  "Tristan": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_25_Tristan_01.png?raw=true",
  "Oscar": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_26_Oscar_01.png?raw=true",
  "Rhiannon": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_27_Rhiannon_01.png?raw=true",
  "Fern": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_28_Fern_01.png?raw=true",
  "Jasper": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_29_Jasper_01.png?raw=true",
  "Ranger Elias": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_30_RangerElias_01.png?raw=true",
  "Ranger Skye": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_31_RangerSkye_01.png?raw=true",
  "The Shadow": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_32_TheShadow_01.png?raw=true",
  "The Roughneck": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_33_TheRoughneck_01.png?raw=true",
  "Dorian": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_34_Dorian_01.png?raw=true",
  "Sally": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_35_Sally_01.png?raw=true",
  "Coach Elara": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_36_CoachElara_01.png?raw=true",
  "Elana": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_37_Elana_01.png?raw=true",
  "Nia": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_38_Nia_01.png?raw=true",
  "Zachary": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_39_Zachary_01.png?raw=true",
  "Helena": "https://github.com/SalamancaTech/LL-Game/blob/main/assets/NPCs/profiles/NPC_Profile_40_Helena_01.png?raw=true"
};

export const INITIAL_STATS: Record<StatType, number> = {
  [StatType.CONFIDENCE]: 10,
  [StatType.WILL]: 10,
  [StatType.WIT]: 10,
  [StatType.GRACE]: 10,
  [StatType.UTILITY]: 10,
  [StatType.AWARENESS]: 10,
  [StatType.VITALITY]: 100,
  [StatType.FINANCE]: 100,
  [StatType.SOCIAL_CLASS]: 0,
  [StatType.BLUSH]: 0,
  [StatType.FATIGUE]: 0,
  [StatType.VULNERABILITY]: 0,
  [StatType.MALE_GAZE]: 0,
  [StatType.FEMALE_JUDGE]: 0,
  [StatType.DANGER]: 0,
};

// Generate initial relationships. 
// Known main characters have specific starting values. 
// Everyone else in the Image Database gets initialized to 0.
const STARTING_RELATIONSHIPS: Record<string, any> = {
    "Mitch": { trust: 100, attraction: 0, familiarity: 100 },
    "Ashley": { trust: 50, attraction: 0, familiarity: 50 },
    "Veronica": { trust: 10, attraction: 0, familiarity: 0 },
    "Jax": { trust: 10, attraction: 0, familiarity: 0 },
};

const initRelationships = () => {
    const rels: Record<string, any> = {};
    // Iterate over all available images to ensure every character exists in DB
    Object.keys(NPC_IMAGES).forEach(name => {
        rels[name] = STARTING_RELATIONSHIPS[name] || { trust: 0, attraction: 0, familiarity: 0 };
    });
    return rels;
};

export const INITIAL_GAME_STATE: GameState = {
  stats: { ...INITIAL_STATS },
  inventory: [],
  equipped: {
    top: null,
    bottom: null,
    footwear: null,
    underwearTop: null,
    underwearBottom: null,
    accessory: null,
    fullBody: null,
  },
  time: {
    day: 0,
    segment: TimeSegment.PRE_DAWN,
    slotsUsed: 0,
  },
  location: 'home_lily_bedroom',
  history: [
    { role: 'model', text: "Welcome to Lily's Life.\nPlease enter your API Key in Settings or Load a Game to begin." }
  ],
  npcRelationships: initRelationships(),
};

export const ITEM_DATABASE: Item[] = [
  // Footwear
  {
    id: 'foot_sneakers_chucks_01',
    name: 'White Converse',
    type: 'Footwear',
    basePrice: 30,
    description: 'Classic canvas high-tops.',
    tags: ['Low Class', 'Neutral'],
    stats: {
      [StatType.UTILITY]: 3,
      [StatType.SOCIAL_CLASS]: -1,
      [StatType.AWARENESS]: -5,
    }
  },
  {
    id: 'foot_heels_pumps_01',
    name: 'Red Pumps',
    type: 'Footwear',
    basePrice: 70,
    description: 'Extremely high, crimson leather stiletto heels.',
    tags: ['High Class', 'Feminine', 'Restrictive'],
    stats: {
      [StatType.UTILITY]: -10,
      [StatType.SOCIAL_CLASS]: 10,
      [StatType.MALE_GAZE]: 8,
      [StatType.FEMALE_JUDGE]: 10,
      [StatType.AWARENESS]: 20,
    }
  },
  // Bottoms
  {
    id: 'btm_pants_yoga_01',
    name: 'Yoga Pants',
    type: 'Bottom',
    basePrice: 40,
    description: 'Skin-tight athletic pants.',
    tags: ['Medium Class', 'Feminine', 'Revealing'],
    stats: {
      [StatType.UTILITY]: 8,
      [StatType.SOCIAL_CLASS]: -3,
      [StatType.MALE_GAZE]: 15,
      [StatType.FEMALE_JUDGE]: 10,
    }
  },
  {
    id: 'btm_skirt_mini_01',
    name: 'Black Mini Skirt',
    type: 'Bottom',
    basePrice: 35,
    description: 'A very short, high-risk fabric skirt.',
    tags: ['Low Class', 'Feminine', 'High Risk'],
    stats: {
      [StatType.UTILITY]: -2,
      [StatType.SOCIAL_CLASS]: 2,
      [StatType.MALE_GAZE]: 12,
      [StatType.AWARENESS]: 10,
    }
  },
  // Tops
  {
    id: 'top_blouse_silk_01',
    name: 'Silk Blouse',
    type: 'Top',
    basePrice: 60,
    description: 'Long-sleeved, high-collared blouse in delicate material.',
    tags: ['Medium Class', 'Feminine', 'Professional'],
    stats: {
      [StatType.UTILITY]: -3,
      [StatType.SOCIAL_CLASS]: 15,
      [StatType.FEMALE_JUDGE]: 8,
      [StatType.MALE_GAZE]: 3,
    }
  },
   {
    id: 'top_tank_wifebeater_01',
    name: 'Stained Tank',
    type: 'Top',
    basePrice: 5,
    description: 'A thin, ripped cotton tank top.',
    tags: ['Low Class', 'Masculine', 'Trashy'],
    stats: {
      [StatType.UTILITY]: 1,
      [StatType.SOCIAL_CLASS]: -10,
      [StatType.FEMALE_JUDGE]: -10,
      [StatType.MALE_GAZE]: 5,
    }
  },
  // Underwear (Essential for Phase 3)
  {
    id: 'und_top_lace_01',
    name: 'Black Lace Bra',
    type: 'Underwear_Top',
    basePrice: 45,
    description: 'Delicate and itchy.',
    tags: ['Feminine', 'Lingerie'],
    stats: { [StatType.MALE_GAZE]: 5 }
  },
  {
    id: 'und_btm_lace_01',
    name: 'Black Lace Panties',
    type: 'Underwear_Bottom',
    basePrice: 35,
    description: 'Matching set. Very drafty.',
    tags: ['Feminine', 'Lingerie'],
    stats: { [StatType.MALE_GAZE]: 5 }
  },
  // Full Body
  {
    id: 'outfit_dress_sundress_01',
    name: 'Flowery Sundress',
    type: 'FullBody',
    basePrice: 50,
    description: 'A light, low-cut dress with a flowing skirt.',
    tags: ['Medium Class', 'Feminine'],
    stats: {
      [StatType.UTILITY]: -1,
      [StatType.SOCIAL_CLASS]: 5,
      [StatType.MALE_GAZE]: 8,
      [StatType.AWARENESS]: 10,
    }
  }
];

// Helper to prepopulate inventory for testing
INITIAL_GAME_STATE.inventory = [...ITEM_DATABASE];
