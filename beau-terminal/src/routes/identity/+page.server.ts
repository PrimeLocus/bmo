import type { PageServerLoad } from './$types.js';
import { getEmergenceArtifact } from '$lib/server/identity/emergence.js';
import { getActiveNatalProfile } from '$lib/server/identity/natal.js';
import { getAllVoiceModels, getActiveVoiceModel } from '$lib/server/identity/voice.js';

export const load: PageServerLoad = async () => {
  return {
    emergence: getEmergenceArtifact(),
    natal: getActiveNatalProfile(),
    voiceModels: getAllVoiceModels(),
    activeVoice: getActiveVoiceModel(),
  };
};
