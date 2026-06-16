---
name: mobile-offline-sync
description: Offline-first patterns for React Native including local databases (WatermelonDB, expo-sqlite, MMKV), background sync, conflict resolution, and large file offline queues. Use for field-capture apps with unreliable connectivity.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/mobile-offline-sync
updated: 2026-04-18
---

# Mobile Offline Sync

Offline-first architecture patterns for React Native field-capture applications (construction, inspection, agriculture) where connectivity is unreliable and large files must be captured locally then synced later.

## Database Decision Matrix

| Library | Use Case | Performance | Sync |
|---------|----------|-------------|------|
| **WatermelonDB 0.27** | Complex relational data, 10k+ records, reactive queries | Excellent (lazy load, native thread) | Built-in protocol |
| **expo-sqlite SDK 53** | Expo managed workflow, simpler relational needs | Good (sync API available) | Manual or PowerSync |
| **op-sqlite 15.x** | Performance-critical, advanced SQLite features (FTS5, sqlite-vec) | Best raw speed (5x less memory) | PowerSync |
| **MMKV v4** | Preferences, session tokens, feature flags, small cached data | 30x faster than AsyncStorage | N/A (key-value only) |

**RealmJS sync features deprecated September 2025.** Avoid for new projects; existing apps should plan migration.

## Sync Strategy Quick Reference

- **Optimistic UI**: Write locally first, update UI immediately, queue sync operation with `pendingSync` flag
- **Queue-based**: Operation log with retry counts and exponential backoff; replay on reconnect via NetInfo listener
- **CRDTs (Yjs, Automerge)**: Reserve for collaborative editing scenarios; most field apps use last-write-wins safely since records have single-user ownership

## Large File Offline Queue

For video capture: compress to 20-50 MB with react-native-compressor, persist upload queue and chunk progress to MMKV, use tus protocol or 500 KB chunked uploads for resumable transfers across app restarts.

## Cross-References

- **[reference.md](./reference.md)**: Database install commands, conflict resolution strategies, background sync setup, security patterns, anti-patterns table
- **[examples.md](./examples.md)**: Production TypeScript for WatermelonDB models, MMKV+Zustand stores, sync managers, video capture flows, migration patterns
