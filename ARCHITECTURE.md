# Runion App Structure

Runion is implemented as a mobile-first PWA and can be used as a foundation for a Flutter or React Native app. The current codebase covers product logic, information architecture, UI, offline behavior, and adapter boundaries for native integrations.

## Information Architecture

- Home: greeting, daily activity, weekly distance, run streak, health status, weather, AI coach, recent activities, and challenges.
- Run Tracking: GPS tracking, distance, pace, average pace, time, calories, elevation gain, heart rate, auto-pause, voice prompts, and live route map.
- Activities: run history, weekly/monthly/yearly views, total statistics, personal records, charts, and route heatmap.
- Training Plans: 5K, 10K, half marathon, marathon, custom goals, adaptive AI planning, and calendar.
- Community: friends, likes, comments, leaderboards, groups, and shared challenges.
- Profile: profile image, personal bests, run history, achievements, settings, privacy, and data export.

## Clean Architecture And MVVM

Recommended target structure for Flutter or React Native:

```text
src/
  app/
    navigation/
    theme/
    di/
  features/
    run_tracking/
      domain/entities/run.dart
      domain/repositories/run_repository.dart
      domain/use_cases/start_run.dart
      data/datasources/gps_datasource.dart
      data/repositories/run_repository_impl.dart
      presentation/view_models/run_view_model.dart
      presentation/screens/run_screen.dartx
    training_plans/
    statistics/
    community/
    profile/
    ai_coach/
    health/
  core/
    network/
    privacy/
    offline/
    analytics/
```

Mapping in this PWA:

- `index.html`: app shell, navigation, semantic screen region.
- `styles.css`: design system, responsive layouts, dark/light mode.
- `app.js`: ViewModel state, use cases, local data sources, GPS adapter, UI renderer.
- `service-worker.js`: offline app shell and cache strategy.
- `backend/`: Firebase and REST concept as a scalable backend starting point.

## Database Model

Firestore collections:

```text
users/{userId}
  displayName: string
  photoUrl: string
  locale: string
  privacy: { profileVisibility, activityVisibility, analyticsConsent }
  healthConnections: { appleHealth, healthConnect, garmin, polar }
  createdAt, updatedAt

users/{userId}/runs/{runId}
  title: string
  startedAt, endedAt
  distanceMeters: number
  durationSeconds: number
  movingSeconds: number
  avgPaceSecPerKm: number
  avgHeartRate: number
  maxHeartRate: number
  calories: number
  elevationGainMeters: number
  route: GeoPoint[]
  splits: [{ km, durationSeconds, paceSecPerKm, avgHr }]
  visibility: private|friends|public
  source: phone|watch|garmin|polar|fit_import

trainingPlans/{planId}
  type: 5k|10k|half_marathon|marathon|custom
  level: beginner|intermediate|advanced
  weeks: number
  workouts: [{ dayOffset, kind, target, intensity, duration }]

users/{userId}/activePlans/{activePlanId}
  planId: string
  startedAt: timestamp
  goal: string
  adaptationState: map
  completedWorkoutIds: string[]

challenges/{challengeId}
  title: string
  period: monthly|weekly|custom
  target: { metric, value }
  rewardBadgeId: string

activities/{activityId}
  userId: string
  runId: string
  visibility: string
  likeCount: number
  commentCount: number

activities/{activityId}/comments/{commentId}
  userId: string
  body: string
  createdAt: timestamp
```

## API Concept

REST endpoints for external devices and partners:

```http
POST /v1/runs
GET /v1/runs?from=2026-06-01&to=2026-06-30
GET /v1/runs/{runId}
POST /v1/runs/{runId}/export?format=gpx|fit
POST /v1/device-connections/garmin/callback
POST /v1/device-connections/polar/callback
GET /v1/training-plans/recommendation
POST /v1/ai-coach/analyze-run
GET /v1/leaderboards/{groupId}
```

Firebase:

- Authentication: Apple, Google, email, optional passkeys.
- Cloud Firestore: users, runs, plans, community data.
- Cloud Functions: AI coach, exports, push notifications, partner webhooks.
- Cloud Messaging: training reminders, challenge updates, live tracking.
- Storage: profile images and GPX/FIT exports.

## Design System

- Colors: black/white foundation, green for action and performance, blue for analytics and social signals.
- Radius: 8 px for cards and controls.
- Typography: system UI, tabular numbers for running metrics.
- Components: `HeroCard`, `MetricCard`, `RunMap`, `ActivityRow`, `PlanCard`, `ChallengeCard`, `CoachCard`, `BottomNav`, `PrivacyRow`.
- Accessibility: semantic regions, `aria-label`s, high contrast, large touch targets, no color-only status communication.

## User Flows

1. Onboarding: sign-up, privacy choices, health connections, goal selection.
2. Start run: Home -> Quick Start -> GPS permission -> live run -> Save -> AI analysis.
3. Training plan: choose goal -> generate plan -> calendar -> complete workout -> adapt plan.
4. Community: share activity -> friends react -> leaderboard/challenge updates.
5. Data export: Profile -> Settings -> Export -> generate GPX/FIT/JSON.

## Privacy And GDPR

- Privacy by default: activities start as private.
- Data minimization: raw GPS is persisted only for saved runs.
- Consent: health, AI analysis, push notifications, and community sharing are separate opt-ins.
- Rights: export, deletion, correction, and consent withdrawal.
- Security: user-scoped Firestore Rules, token-based partner APIs, server-side webhook signatures.

## Performance

- Offline-first app shell through the Service Worker.
- GPS points are filtered by minimum distance.
- Route rendering uses Canvas.
- Native apps can virtualize long activity lists.
- Sync conflicts are resolved through `updatedAt`, `source`, and server-side merge rules.

## Sample Data

```json
{
  "user": {
    "id": "u_lena",
    "displayName": "Lena Mueller",
    "privacy": { "activityVisibility": "friends", "analyticsConsent": true }
  },
  "run": {
    "id": "r_101",
    "title": "Morning Run",
    "distanceMeters": 8200,
    "durationSeconds": 2490,
    "avgHeartRate": 151,
    "calories": 548,
    "elevationGainMeters": 44,
    "source": "phone"
  },
  "plan": {
    "type": "10k",
    "goal": "Sub 52",
    "weeks": 10,
    "nextWorkout": "4 x 1 km @ 5:00"
  }
}
```
