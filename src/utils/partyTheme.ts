import { Party } from '../models/Party';
import { PartyTheme, PartyType } from '../config/partyThemes';

export interface UserTheme extends PartyTheme {
  partyType: PartyType;
  partyName: string;
}

/** Theme for the party a user belongs to, or null (default theme) when there is none. */
export async function getThemeForParty(partyId: unknown): Promise<UserTheme | null> {
  if (!partyId) return null;
  const party = await Party.findById(partyId).select('name partyType theme').lean();
  if (!party?.theme?.primary) return null;
  return { ...party.theme, partyType: party.partyType, partyName: party.name } as UserTheme;
}
