# Push Notifications Reference

## FCM v1 HTTP API

### Setup and Authentication

The v1 endpoint is `https://fcm.googleapis.com/v1/projects/{project-id}/messages:send`. Authentication uses OAuth 2.0 access tokens (short-lived, ~1 hour) instead of the legacy static server key. A service account JSON key file generates these tokens.

The message structure supports platform-specific blocks (`android`, `apns`, `webpush`) alongside a common `notification` and `data` payload. Maximum payload size is 4KB.

### Quotas and Rate Limits

| Limit | Value |
|-------|-------|
| Default project quota | 600,000 messages/minute |
| High-volume (request increase) | Up to 2M messages/minute |
| Per-device limit | 240 messages/minute, 5,000/hour |
| Topic fanout concurrency | 1,000 concurrent fanouts |
| Topic subscription rate | 3,000 QPS per project |
| Batch send limit | 500 tokens per call |

Quota exceeded returns HTTP 429 `RESOURCE_EXHAUSTED`. The `sendMulticast` method is deprecated; `sendEachForMulticast` is the current batch API.

### Topic Messaging

Topics suit public broadcast content (weather, news, scores). Each app instance supports up to 2,000 topic subscriptions. Resubscribe monthly and on token refresh. Topics are not appropriate for sensitive or private data, nor single-user topics.

## APNs Setup

### Token-Based JWT Authentication

Token-based auth (ES256 signing with P-256 curve) is the current standard. The signing key never expires but can be revoked. One key works across multiple apps and both sandbox and production environments. JWTs are valid for 1 hour and should be reused during that window.

Certificate-based authentication is deprecated. The legacy binary protocol is discontinued.

### Connection Best Practices

APNs requires HTTP/2. Connections should remain open; rapid open/close triggers DoS detection. Monitor for 410 responses indicating invalid device tokens.

### Interruption Levels (iOS 15+)

| Level | Requirement | Use Case |
|-------|-------------|----------|
| Default | None | Normal notifications |
| Time-sensitive | iOS 15+ | Delivery updates, urgent messages |
| Critical alerts | Apple entitlement approval | Medical, security, home automation |

Time-sensitive notifications use `"interruption-level": "time-sensitive"` in the APNs payload. Critical alerts require an explicit entitlement from Apple.

## expo-notifications Configuration

### Required Packages

`expo-notifications`, `expo-device`, and `expo-constants` form the core dependency set. The `expo-notifications` config plugin in `app.json`/`app.config.js` handles the notification icon, color, sounds, and iOS background modes (`UIBackgroundModes: ["remote-notification"]`).

Android requires `google-services.json` in the project root and a Service Account Key JSON for server-side sending.

### Managed vs Bare Workflow

In managed workflow, expo-notifications provides native support with minimal configuration. In bare workflow, both expo-notifications and react-native-firebase work; the latter offers tighter Firebase integration.

### Expo Push API vs Direct FCM/APNs

The Expo Push API provides a unified token format and minimal setup but limited delivery visibility and introduces vendor dependency on Expo servers. Direct FCM/APNs integration requires credential management but offers full delivery receipts, native Firebase integration, and no vendor lock-in. Direct integration is typical for production deployments; the Expo Push API suits prototypes and managed workflow MVPs.

## Token Management

### Registration and Refresh

Tokens are retrieved via `getExpoPushTokenAsync` (Expo token) or `getDevicePushTokenAsync` (native FCM/APNs token). Token retrieval requires a physical device; simulators/emulators do not support push.

Store each token with a timestamp on the server. Call `getToken()` on every app open to capture refreshes and multi-device scenarios. Listen for `onTokenRefresh` events and update the server record immediately.

### Staleness Detection

FCM marks tokens stale after 270 days of inactivity. Implement monthly cleanup: delete tokens with no activity in the staleness window. On send failure with code `messaging/registration-token-not-registered` or HTTP 404/UNREGISTERED, delete the token from the database immediately.

## Notification Handling

### Foreground

Call `setNotificationHandler` before any notifications arrive. This controls whether the system displays an alert, plays a sound, and sets the badge while the app is in the foreground. Without this handler, foreground notifications are silently consumed.

### Background

Data-only messages (no `notification` key in payload) trigger the background message handler. Register this handler early (in `index.js` before `AppRegistry.registerComponent` for react-native-firebase, or via `TaskManager.defineTask` + `Notifications.registerTaskAsync` for expo-notifications).

### Killed State

When the app is killed, notification messages display via the system tray. Data-only messages on iOS are delayed until the JS runtime loads. For critical updates, include both `notification` and `data` keys so the system guarantees display, then fetch fresh data when the user taps.

### Message Type Behavior Matrix

| Message Type | Foreground | Background | Killed |
|-------------|-----------|-----------|--------|
| Notification | `onMessage` fires, no system tray | System shows notification | System shows notification |
| Data-only | `onMessage` fires | Background handler fires | Delayed until JS loads (iOS) |

## Rich Notifications

### Images and Media

expo-notifications supports `attachments` with remote URLs or local assets. Notifee provides richer control: `AndroidStyle.BIGPICTURE` for large images, `largeIcon` for avatars, and iOS attachments.

### Action Buttons

expo-notifications uses notification categories (`setNotificationCategoryAsync`) with identifiers, button titles, and optional text input. Notifee uses per-notification `actions` arrays with `pressAction` identifiers, handled via `onBackgroundEvent`.

### Deep Linking

Notification payloads include a `url` or `screen`/`params` in the `data` field. The React Navigation `linking` configuration integrates with `getLastNotificationResponseAsync` (for cold starts) and `addNotificationResponseReceivedListener` (for warm starts). This unified approach handles both notification-based and standard deep links.

## Android Notification Channels

Channels are mandatory on Android 8+ (API 26). Create channels before displaying any notification. Without a valid channel, notifications are silent or hidden.

Channels have importance levels (`HIGH`, `DEFAULT`, `LOW`, `MIN`) that control sound, vibration, and heads-up display. Users can modify channel settings in system preferences; the app cannot override user choices after creation.

Typical channel structure: high-importance for orders/alerts, default for messages, low for marketing/promotions.

## iOS Notification Categories

Categories define action buttons and behaviors attached to notifications. Each category has an identifier referenced in the APNs `category` field. Actions can open the app to foreground, run in background, or accept text input.

## Background and Silent Push

Data-only messages with `"content-available": 1` (iOS) and `"priority": "high"` (Android) trigger background processing. iOS limits background execution to 30 seconds and treats these as low priority with no delivery guarantee. Android Doze mode delays non-high-priority messages.

For reliable background sync, send a visible notification that triggers a data fetch on tap, rather than relying solely on silent push.

## Server-Side Sending

### Node.js (firebase-admin)

Initialize with `admin.credential.cert()` using the service account JSON. Single sends use `admin.messaging().send(message)`. Batch sends (up to 500 tokens) use `admin.messaging().sendEachForMulticast(message)`. Handle `messaging/registration-token-not-registered` errors by deleting invalid tokens.

### Python (firebase-admin)

Initialize with `credentials.Certificate()`. Single sends use `messaging.send(message)`. Batch sends use `messaging.send_each(messages)` with a 500-message limit. The response object provides `success_count` and `failure_count`.

### Scheduled Sending

FCM has no native scheduling. Options include Cloud Scheduler + Cloud Functions (GCP), or custom job queues (Bull/BullMQ for Node.js, Celery for Python) with delay parameters.

### User Preference Management

Server-side preference schemas typically track: global push toggle, per-category toggles (orders, chat, marketing, system), quiet hours with timezone, and device list with platform and last-active timestamp. Check preferences before every send.

## Permission UX

### Opt-in Rate by Strategy

| Strategy | Opt-in Rate |
|----------|-------------|
| First launch (cold prompt) | 40-60% |
| After onboarding flow | 65-75% |
| After value demonstration | 70-85% |
| Contextual (post-purchase, post-action) | 80%+ |

Platform averages (2025): Android 81.5%, iOS 43.9%.

### Pre-Permission Priming

A custom modal shown before the system permission dialog explains notification value and gives the user a soft opt-out ("Maybe Later"). Only users who tap "Enable" see the system prompt. This prevents wasting the one-time iOS permission dialog on users who would decline.

## Platform-Specific Gotchas

### iOS

- No push in simulator; physical device required
- System permission prompt fires only once; denied users must go to Settings
- Background fetch is low priority with no delivery guarantee
- APNs certificate-based auth is deprecated; use token-based JWT
- Badge count requires server-side management for cross-device consistency
- Custom notification sounds must be in the Xcode bundle in correct format

### Android

- Missing notification channel results in silent/hidden notifications
- Doze mode delays non-high-priority FCM messages
- `SCHEDULE_EXACT_ALARM` permission needed for reliable scheduled notifications
- Foreground notifications require `setNotificationHandler` to display
- Battery optimization may kill background services; inform users to whitelist
- `setBackgroundMessageHandler` must register before app component mounts
- Android 13+ requires runtime `POST_NOTIFICATIONS` permission

## Anti-Patterns

| Anti-Pattern | Pattern |
|-------------|---------|
| Not handling token refresh | Listen for token changes, update server on every refresh |
| Storing tokens without timestamps | Store lastActive timestamp, clean stale tokens monthly |
| Skipping Android channel creation | Create all channels at app startup before any notification |
| Assuming push delivery is guaranteed | Use notification+data messages, handle tap to fetch fresh data |
| Ignoring invalid token errors | Delete tokens on UNREGISTERED/404 responses immediately |
| Synchronous push sending in request handlers | Enqueue to job queue, process asynchronously |
| Same generic message to all users | Segment users, personalize content |
| Requesting permission on first launch | Show priming screen after demonstrating value |
| Sending during user quiet hours | Implement timezone-aware quiet hours with server-side checks |
| Putting sensitive data in notification body | Use data-only message, fetch sensitive content on app open |
| No delivery monitoring | Track delivery rates, error rates, opt-out rates |
| No in-app preference controls | Provide per-category toggles and quiet hours settings |
