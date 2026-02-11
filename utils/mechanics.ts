
import { GameState, TimeSegment, StatType, Intent, Item } from '../types';
import { INITIAL_STATS, TUTORIAL_INSTRUCTIONS } from '../constants';

export const advanceTime = (currentSegment: TimeSegment, slotsUsed: number): { segment: TimeSegment, slots: number, newDay: boolean } => {
  const segments = Object.values(TimeSegment);
  const currentIndex = segments.indexOf(currentSegment);

  // If we are in a mandatory 0-slot segment (Pre-Dawn, Post-Night), move immediately
  if (currentSegment === TimeSegment.PRE_DAWN) {
    return { segment: TimeSegment.DAWN, slots: 0, newDay: false };
  }
  if (currentSegment === TimeSegment.POST_NIGHT) {
    return { segment: TimeSegment.PRE_DAWN, slots: 0, newDay: true };
  }

  // Normal segments have 3 slots
  if (slotsUsed < 2) {
    return { segment: currentSegment, slots: slotsUsed + 1, newDay: false };
  } else {
    // Move to next segment
    const nextIndex = currentIndex + 1;
    if (nextIndex < segments.length) {
      return { segment: segments[nextIndex], slots: 0, newDay: false };
    } else {
      // End of day loop (should hit Post-Night logic ideally, but fail-safe)
      return { segment: TimeSegment.PRE_DAWN, slots: 0, newDay: true };
    }
  }
};

export const calculateStats = (baseStats: Record<StatType, number>, equipped: GameState['equipped']): Record<StatType, number> => {
  const currentStats = { ...baseStats };
  
  // Reset dynamic stats that are recalculated from gear (like Presentation/Social Class components)
  // For now, we just add modifiers.
  
  const items = Object.values(equipped).filter((i): i is Item => i !== null && i !== undefined);
  
  items.forEach(item => {
    Object.entries(item.stats).forEach(([stat, value]) => {
      const statKey = stat as StatType;
      if (currentStats[statKey] !== undefined && value !== undefined) {
        currentStats[statKey] += value;
      }
    });
  });
  
  return currentStats;
};

export const constructChoicePrompt = (
    gameState: GameState,
    intent: Intent
): string => {
    const { time, location, stats, npcRelationships } = gameState;
    const rels = Object.entries(npcRelationships)
        .map(([npc, rel]) => `${npc} (Trust:${rel.trust}, Attraction:${rel.attraction})`)
        .join(', ');

    let contextAddendum = "";
    if (gameState.config?.tutorial && gameState.time.day === 0) {
        contextAddendum = `\n\n${TUTORIAL_INSTRUCTIONS}\n\nIMPORTANT: If the current situation matches a PHASE in the Tutorial Instructions, you MUST generate the specific choices listed in the [CHOICE BLOCK] for that phase that align with the player's intent if possible, or general valid choices from the script.`;
    }

    return `
    You are the Game Engine for "Lily's Life".
    
    **Context:**
    - Time: ${time.segment}
    - Location: ${location}
    - NPCs Present: (Infer from location)
    - Player Relationships: ${rels}
    - Player Stats: Confidence ${stats.CONFIDENCE}, Will ${stats.WILL}, Grace ${stats.GRACE}
    ${contextAddendum}
    
    **Player Intent:**
    The player wants to: **${intent.type}** with a **${intent.manner}** manner.
    
    **Task:**
    Generate exactly 4 distinct narrative dialogue/action choices for the player based on this intent.
    
    **Mandatory Rules:**
    1. Choice 1 (High Impact): The most direct, extreme embodiment of ${intent.type} + ${intent.manner}.
    2. Choice 2 (Subtle): A moderated, safer version of the intent.
    3. Choice 3 (Skill Check): An option that relies on a Base Stat (WILL, WIT, GRACE, or CONFIDENCE). Label the check in brackets, e.g., "[WIT] ...".
    4. Choice 4 (Neutral Out): A non-committal, deflective, or simple option.

    **Output Format:**
    Return ONLY a JSON array of 4 strings. Do not write anything else.
    Example:
    [
        "Kiss him passionately right now.",
        "Smile and lean in closer.",
        "[CONFIDENCE] Stare him down and dare him to move.",
        "Step back and change the subject."
    ]
    `;
};

export const constructGeminiPrompt = (
  gameState: GameState,
  intent: Intent | null,
  userText: string
): string => {
  const { time, location, stats, equipped, npcRelationships, config } = gameState;
  
  const equippedList = Object.entries(equipped)
    .filter(([_, item]) => item !== null)
    .map(([slot, item]) => `${slot}: ${item!.name}`)
    .join(', ') || "Naked";

  const rels = Object.entries(npcRelationships)
    .map(([npc, rel]) => `${npc} (Trust:${rel.trust})`)
    .join(', ');

  let prompt = `
    You are the RPG Game Engine for "Lily's Life". You manage the story AND the mathematical state of the game.

    **CURRENT STATE:**
    - Time: ${time.segment} (Day ${time.day})
    - Location: ${location}
    - Outfit: ${equippedList}
    - NPC Relationships: ${rels}
    
    **PLAYER STATS:**
    - Core: Confidence (${stats.CONFIDENCE}), Will (${stats.WILL}), Wit (${stats.WIT}), Grace (${stats.GRACE})
    - State: Vitality (${stats.VITALITY}), Finance ($${stats.FINANCE}), Blush (${stats.BLUSH})
    - Environment: Danger (${stats.DANGER}), Social Class (${stats.SOCIAL_CLASS})
    
    **PLAYER INPUT:**
    - Action: "${userText}"
    - Intent: ${intent ? `${intent.type} (${intent.manner})` : 'General Action'}
    
    **GAME MECHANICS RULES (YOU MUST ENFORCE THESE):**
    1. **Vitality Cost**: Every action consumes 1-5 VITALITY depending on effort. If VITALITY < 10, the player is exhausted.
    2. **Finance**: If the player buys something (coffee, clothes, taxi), deduct the EXACT cost from FINANCE.
    3. **Skill Checks**: If the user chose a [STAT] option (e.g. [WIT]), roll internally. If successful, increase that Stat by 1. If failed, decrease CONFIDENCE.
    4. **Relationships**: Update Trust/Attraction based on dialogue.
    5. **Location**: If the narrative implies moving (e.g., "I leave the house"), update the 'location' field to the closest matching ID from your database.
    
    **OUTPUT FORMAT:**
    You MUST respond with a valid JSON object containing the narrative and the state updates.
    
    JSON Schema:
    {
      "narrative": "string (The story response in second person 'You...')",
      "updates": {
        "statChanges": { "VITALITY": number, "CONFIDENCE": number, ... },
        "relationshipChanges": { "NPC_Name": { "trust": number, "attraction": number } },
        "moneyChange": number (negative for cost, positive for gain),
        "locationChange": "string (optional, only if moving)",
        "itemGained": ["string (optional item IDs)"]
      }
    }
  `;

  // Inject Tutorial Instructions if Tutorial is ON and it is Day 0
  if (config?.tutorial && time.day === 0) {
    prompt += `\n\n${TUTORIAL_INSTRUCTIONS}`;
  }

  return prompt;
};
