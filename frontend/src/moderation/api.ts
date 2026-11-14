import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, type Schemas } from '../api/client'

export type Report = Schemas['QueueItem']
export type Stats = Schemas['ModerationStats']
export type AuditEntry = Schemas['AuditOut']
export type ManagedUser = Schemas['ManagedUser']
export type ReviewedStatus = 'verified' | 'rejected' | 'cleared' | 'merged'
export type AuditAction = 'verify' | 'reject' | 'clear' | 'merge' | 'suspend' | 'reinstate' | 'role'
export type UserStatus = 'active' | 'suspended' | 'unverified'
export type Role = 'user' | 'moderator'

const REFRESH_MS = 30_000  // moderators watch these screens; keep them close to live
const AUDIT_PAGE = 25
export const USERS_PAGE = 10
export const MIN_RADIUS_M = 5
export const MAX_RADIUS_M = 200
export const DEFAULT_RADIUS_M = 30

/** The overview numbers. */
export function useStats() {
  return useQuery({
    queryKey: ['moderation', 'stats'],
    queryFn: () => unwrap(api.GET('/api/moderation/stats')),
    refetchInterval: REFRESH_MS,
  })
}

/** Reports waiting for review, oldest first. */
export function useQueue() {
  return useQuery({
    queryKey: ['moderation', 'queue'],
    queryFn: () => unwrap(api.GET('/api/moderation/queue', { params: { query: { limit: 100 } } })),
    refetchInterval: REFRESH_MS,
  })
}

/** Reports already decided, most recent decision first. */
export function useReviewed(statuses: ReviewedStatus[], enabled = true) {
  return useQuery({
    queryKey: ['moderation', 'reviewed', statuses],
    queryFn: () => unwrap(api.GET('/api/moderation/incidents', { params: { query: { status: statuses, limit: 50 } } })),
    enabled,
  })
}

/** One report in full, with the open reports near it. */
export function useReport(id: number | null) {
  return useQuery({
    queryKey: ['moderation', 'report', id],
    queryFn: () => unwrap(api.GET('/api/moderation/incidents/{incident_id}', { params: { path: { incident_id: id! } } })),
    enabled: id !== null,
  })
}

/** Which roads verifying a report with this radius would close. */
export function useClosurePreview(id: number, radiusM: number, enabled: boolean) {
  return useQuery({
    queryKey: ['moderation', 'preview', id, radiusM],
    queryFn: () => unwrap(api.GET('/api/moderation/incidents/{incident_id}/closure-preview', {
      params: { path: { incident_id: id }, query: { radius_m: radiusM } },
    })),
    enabled,
    placeholderData: keepPreviousData,  // keep the old lines on the map while the slider moves
  })
}

type Decision =
  | { action: 'verify'; id: number; radiusM: number }
  | { action: 'reject'; id: number; reason: string }
  | { action: 'clear'; id: number }
  | { action: 'merge'; id: number; intoId: number }

/** Send a moderator's decision on a report. */
function decide(decision: Decision) {
  const params = { path: { incident_id: decision.id } }
  switch (decision.action) {
    case 'verify':
      return unwrap(api.POST('/api/incidents/{incident_id}/verify', { params, body: { radius_m: decision.radiusM } }))
    case 'reject':
      return unwrap(api.POST('/api/incidents/{incident_id}/reject', { params, body: { reason: decision.reason } }))
    case 'clear':
      return unwrap(api.POST('/api/incidents/{incident_id}/clear', { params }))
    case 'merge':
      return unwrap(api.POST('/api/incidents/{incident_id}/merge', { params, body: { into_id: decision.intoId } }))
  }
}

/** Verify, reject, clear or merge a report; afterwards everything that shows reports or closures reloads. */
export function useDecision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: decide,
    onSuccess: () => {
      for (const key of ['moderation', 'incidents', 'incident', 'closures', 'my-reports', 'route', 'nearest']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

/** The audit log, newest first, a page at a time; optionally one kind of action. */
export function useAudit(action: AuditAction | null) {
  return useInfiniteQuery({
    queryKey: ['moderation', 'audit', action],
    queryFn: ({ pageParam }) => unwrap(api.GET('/api/audit', {
      params: { query: { limit: AUDIT_PAGE, ...(pageParam && { before_id: pageParam }), ...(action && { action }) } },
    })),
    initialPageParam: 0,
    getNextPageParam: (page) => (page.length === AUDIT_PAGE ? page[page.length - 1].id : undefined),
  })
}

export type UserFilters = { q: string; role: Role | null; status: UserStatus | null; page: number }

/** A page of accounts matching a search and filters. */
export function useUsers({ q, role, status, page }: UserFilters) {
  return useQuery({
    queryKey: ['moderation', 'users', q, role, status, page],
    queryFn: () => unwrap(api.GET('/api/moderation/users', {
      params: { query: { q, limit: USERS_PAGE, offset: page * USERS_PAGE, ...(role && { role }), ...(status && { status }) } },
    })),
    placeholderData: keepPreviousData,  // keep the table in place while the next page or search loads
  })
}

type UserAction =
  | { action: 'suspend'; id: number; reason: string }
  | { action: 'reinstate'; id: number }
  | { action: 'role'; id: number; role: Role }

/** Suspend or reinstate an account, or change its role. */
export function useUserAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (change: UserAction) => {
      const params = { path: { user_id: change.id } }
      if (change.action === 'suspend') {
        return unwrap(api.POST('/api/moderation/users/{user_id}/suspend', { params, body: { reason: change.reason } }))
      }
      if (change.action === 'reinstate') return unwrap(api.POST('/api/moderation/users/{user_id}/reinstate', { params }))
      return unwrap(api.POST('/api/moderation/users/{user_id}/role', { params, body: { role: change.role } }))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moderation'] }),
  })
}
