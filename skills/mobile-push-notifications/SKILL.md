---
name: mobile-push-notifications
description: Push notification patterns for React Native using expo-notifications and Firebase Cloud Messaging v1. FCM/APNs setup, token management, rich notifications, deep linking, background handling, and server-side sending. Use for implementing push notifications in mobile apps.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/mobile-push-notifications
updated: 2026-04-18
---

# Mobile Push Notifications

Push notification patterns for React Native applications using expo-notifications and Firebase Cloud Messaging (FCM) v1 HTTP API.

## Library Decision

| Criterion | expo-notifications | react-native-firebase + Notifee |
|-----------|-------------------|--------------------------------|
| Expo managed workflow | Native support, low setup | Requires config plugin |
| Rich notifications | Basic (images, categories) | Full control (big picture, actions) |
| Firebase ecosystem | Separate integration | Native analytics, topics, receipts |
| Local notifications | Built-in scheduling | Requires Notifee addon |
| Best for | New Expo SDK 53+ projects, MVPs | Existing Firebase projects, enterprise |

New Expo managed projects generally use expo-notifications. Projects deeply integrated with Firebase or needing advanced notification styling (big picture, inline reply, grouped) typically use react-native-firebase with Notifee.

## Real-Time Communication Quick Reference

| Mechanism | App State | Direction | Use Case |
|-----------|-----------|-----------|----------|
| Push notifications | Any (including killed) | Server to device | Alerts, updates, background sync triggers |
| WebSocket | Foreground only | Bidirectional | Chat, gaming, typing indicators |
| SSE | Foreground only | Server to client | Live feeds, stock prices, dashboards |

A hybrid pattern (WebSocket while active, push when backgrounded) covers most real-time needs.

## Critical Context

FCM legacy APIs shut down July 2024. All implementations use the v1 HTTP API with OAuth 2.0 short-lived tokens. APNs token-based JWT authentication is the current standard; certificate-based auth is deprecated.

SDK 53+ requires development builds for push notification testing on Android. Expo Go no longer supports push on Android.

Permission priming screens (showing a custom modal before the system prompt) achieve 70-85% opt-in rates compared to 40-60% for cold permission requests on first launch.

## File Reference

- `reference.md` - FCM v1 setup, APNs auth, token management, notification handling patterns, channels/categories, server-side sending, platform gotchas, anti-patterns
- `examples.md` - Production code examples: token registration, handlers, deep linking, rich notifications, server senders (Node.js/Python), permission priming, preferences screen, local scheduling, complete setup
