/**
 * Feature flags for Sakhi Vault
 * Allows enabling or toggling sub-systems easily
 */
export interface FeatureFlags {
  maps: boolean;
  notifications: boolean;
  language: 'en' | 'ur' | 'both';
  dashboard: boolean;
  offline: boolean;
  aiPipeline: boolean;
  voiceRecording: boolean;
  pdfExport: boolean;
  circle: boolean;
}

export const featureFlags: FeatureFlags = {
  maps: false, // Geotagging/locations flag for future expansion
  notifications: true,
  language: 'both', // Both English and Urdu supported
  dashboard: true,
  offline: false, // Set to true to force zero-network local offline mode
  aiPipeline: true,
  voiceRecording: true,
  pdfExport: true,
  circle: true, // "Sakhi Circle" anonymous pattern matching module
};
