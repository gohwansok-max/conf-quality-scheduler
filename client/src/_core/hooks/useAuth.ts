export function useAuth(options?: { redirectOnUnauthenticated?: boolean; redirectPath?: string }) {
  return {
    user: null,
    loading: false,
    error: null,
    isAuthenticated: true,
    refresh: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  };
}
