// Get the API URL based on the current environment
export function getApiUrl(): string {
  // Always use relative path /api to leverage Next.js rewrites
  // This works for localhost, network WiFi, and ngrok
  return '/api';
}
