/**
 * lib/stores/authStore.ts — Authentication state with Zustand
 *
 * INTERVIEW POINT — Why Zustand over Context + useReducer:
 *
 * Context re-renders EVERY consumer when ANY value changes.
 * If AuthContext holds {user, token, theme, notifications}, updating
 * notifications re-renders every component that reads user too.
 *
 * Zustand uses a subscription model — components subscribe to specific
 * slices. Only subscribers of the changed slice re-render.
 *
 * Context is fine for static/rarely-changing values (theme, locale).
 * Zustand is correct for frequently-changing global state (auth, UI state).
 *
 * INTERVIEW POINT — Why NOT Redux here:
 * Redux shines when you need time-travel debugging, complex derived state,
 * or multiple reducers composing together. For auth state (a few fields,
 * two actions: login/logout), Redux is 5x the boilerplate with no benefit.
 * "Use the simplest tool that solves the problem."
 *
 * INTERVIEW POINT — Zustand persist middleware:
 * We persist auth state to sessionStorage (not localStorage) so the user
 * stays logged in on page refresh but is logged out when they close the tab.
 * For "remember me" functionality you'd switch to localStorage.
 * JWT validation still happens server-side on every request — the client
 * store is just for displaying the user's name and avoiding a loading flash.
 */

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  email: string
  fullName: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean

  // Actions — co-located with state (Zustand pattern)
  // INTERVIEW POINT: In Redux, actions are separate from state.
  // In Zustand, actions live in the same object. Less indirection,
  // same functionality.
  login: (user: User) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: (user) =>
        set({
          user,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
        }),

      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
    }),
    {
      name: "traderos-auth",       // sessionStorage key
      storage: createJSONStorage(() => sessionStorage),
      // Only persist these fields — don't persist action functions
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// ── Selectors ─────────────────────────────────────────────────────────────────
// Extract these so components subscribe to only what they need.
// INTERVIEW POINT: This is the selector pattern from Redux, applied to Zustand.
// A component using useAuthStore(selectUser) only re-renders when user changes,
// not when isAuthenticated changes.

export const selectUser = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectLogin = (state: AuthState) => state.login
export const selectLogout = (state: AuthState) => state.logout