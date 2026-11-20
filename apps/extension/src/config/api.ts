/** Production API — fixed for all users (not editable in UI). */
export const API_BASE_URL = 'https://darshan.totallylearns.com';

export function resolveApiBaseUrl(_stored?: string): string {
  return API_BASE_URL.replace(/\/$/, '');
}