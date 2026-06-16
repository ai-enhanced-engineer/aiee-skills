# Mobile Offline Sync Reference

## Database Selection Guide

### WatermelonDB 0.27.x
- **Install**: `npm install @nozbe/watermelondb` + native setup (JSI adapter requires CMake on Android with `-DANDROID_STL=c++_shared`)
- **Best for**: Complex relational data, reactive/observable queries, 10k+ records, apps needing built-in sync protocol
- **Architecture**: JSI-based SQLite adapter with C++ implementation; lazy loading; queries run on separate native thread
- **React Native compatibility**: 0.76+ support in progress (track GitHub issues)
- **Sync**: Built-in push/pull protocol with `synchronize()` function

### expo-sqlite (SDK 53)
- **Install**: `npx expo install expo-sqlite`
- **Best for**: Expo managed workflow, simpler relational needs, projects wanting synchronous APIs
- **Key APIs**: `openDatabaseSync()`, `getAllSync()`, `runSync()`, `firstSync()`
- **SQLCipher**: Enable via config plugin `["expo-sqlite", { "useSQLCipher": true, "enableFTS": true }]` in app.json
- **AsyncStorage compat**: `expo-sqlite/async-storage` drop-in replacement

### op-sqlite 15.x
- **Install**: `npm install @op-engineering/op-sqlite` (requires native module setup, no Expo Go)
- **Best for**: Performance-critical apps, advanced SQLite features (FTS5, sqlite-vec, cr-sqlite, JSONB)
- **Performance**: Up to 5x faster, 5x less memory than bridge-based solutions; Android gains up to 8x
- **Caveat**: Real-world benchmarks with TypeORM show less dramatic improvements; gains depend on query patterns

### MMKV v4 (Nitro Module)
- **Install**: `npm install react-native-mmkv`
- **Best for**: User preferences, session tokens, feature flags, small cached data, upload progress persistence
- **Performance**: 30x faster than AsyncStorage; 80% faster reads, 500% faster writes; fully synchronous
- **Not for**: Relational data, complex queries, large datasets

### RealmJS 12.x (Avoid for New Projects)
- **Status**: Automatic Sync and TLS Encryption features deprecated as of September 30, 2025
- **Migration guidance**: Prefer WatermelonDB or PowerSync for new projects; existing Realm apps should plan migration path

## Offline-First Architecture

### Core Principle
Local storage serves as the source of truth. Synchronization functions as an enhancement layer rather than a requirement. Every user action writes to the local database first, updates the UI immediately, and queues a sync operation.

### Optimistic UI Pattern
1. User performs action (e.g., captures inspection)
2. Write to local DB with `syncStatus: 'pending'`
3. UI updates reactively (instant feedback)
4. Sync operation queued with entity type, ID, and payload
5. On success: clear pending flag; on failure: show conflict indicator and schedule retry

### Operation Log
Each pending change is recorded as a `SyncOperation` with type (CREATE/UPDATE/DELETE), entity reference, payload, retry count, and timestamp. The queue processes operations sequentially. Failed operations use exponential backoff (`2^retryCount * 1000ms`). After 3 retries, operations are marked as conflicts for user resolution.

### Sync-on-Reconnect
A NetInfo listener tracks connectivity state. When the app transitions from offline to online, it triggers immediate queue processing. This catches the common field scenario where a worker returns to an area with signal.

## Conflict Resolution Strategies

| Strategy | When to Use | Complexity |
|----------|-------------|------------|
| **Last-Write-Wins** | Single-user-per-record patterns (most field apps); compare `localUpdatedAt` vs `serverUpdatedAt` | Low |
| **Server-Wins** | Read-heavy apps where server data is authoritative | Low |
| **Client-Wins** | Draft-first or offline-primary workflows | Low |
| **Manual Merge** | Critical data where field and office workers may edit the same record | Medium |
| **CRDTs (Yjs, Automerge)** | Real-time collaborative editing; multiple users editing same document simultaneously | High |

For construction, inspection, and agriculture field-capture apps, last-write-wins covers the vast majority of cases because records typically have single-user ownership in the field.

## Background Sync Patterns

### expo-background-task (SDK 53+)
Replaces deprecated `expo-background-fetch`. Uses `BGTaskScheduler` (iOS) and `WorkManager` (Android). Define tasks via `TaskManager.defineTask()`, register with `BackgroundTask.registerTaskAsync()`.

### Platform Constraints

| Platform | API | Min Interval | Max Runtime | Notes |
|----------|-----|--------------|-------------|-------|
| **iOS** | BGTaskScheduler | ~15 min (suggested) | 30 seconds | ML-based scheduling; may run less frequently based on battery/usage patterns |
| **Android** | WorkManager | 15 min | 10 minutes | More reliable; respects Doze mode |

iOS background task timing is non-deterministic. The `minimumInterval` is a suggestion. iOS may run tasks every 20 minutes to hours based on battery level, network availability, and usage patterns. It can take days for BGTaskScheduler's ML algorithm to learn when to trigger tasks.

### Bare RN Alternative
`react-native-background-fetch` 4.x provides more control for bare React Native projects with `enableHeadless: true` support.

## Large File Offline Patterns

### Disk Quota Management
Monitor free space with `FileSystem.getFreeDiskStorageAsync()`. Cleanup policies:
- **Age-based**: Delete local copy of synced videos after 7 days
- **Size-based**: Delete oldest synced when total exceeds 2 GB
- **Free space**: Aggressive cleanup when less than 500 MB free
- **Manual**: User-triggered clear of all synced files

### Prioritized Upload Queue
Upload jobs carry priority (high/normal/low), progress state (uploadedBytes/totalBytes), and status. Within the same priority, newest items upload first (matches user expectation of seeing recent work synced first). Queue state persists to MMKV so it survives app restarts and crashes.

### Resumable Uploads
- **tus protocol** (`react-native-tus-client` 3.x): Open protocol for resumable uploads; supports `findPreviousUploads()` to resume interrupted transfers
- **Chunked uploads** (`react-native-chunk-upload`): 500 KB segments as the 2026 standard chunk size; save chunk index to MMKV on each success

### Video Compression
- **react-native-compressor** 1.10.x: WhatsApp-level compression, only 50 KB APK increase (vs 9 MB for FFmpeg); recommended for field apps
- **FFmpeg** (`ffmpeg-kit-react-native`): **RETIRED Jan 2025** — binaries removed from registries Apr 2025. Community fork `@beedeez/ffmpeg-kit-react-native` exists but stability is uncertain

Target compressed size: 20-50 MB per video for reliable upload over intermittent connections.

## Data Migration and Schema Evolution

### WatermelonDB Migrations
Use `schemaMigrations()` with versioned steps (`addColumns`, `createTable`). Each migration increments `toVersion` by one. A common convention is to create migration definitions before bumping the schema version (catches errors earlier). Released migrations are treated as immutable to avoid data corruption in production.

### SQLite Version Tracking
Create a `migrations` table with `(id, name, applied_at)`. A migration runner checks applied names against the migration list and executes pending ones in order. Each migration runs its SQL then inserts its name into the tracking table.

### Drizzle ORM (Type-Safe Alternative)
`drizzle-orm/expo-sqlite` provides type-safe query building and migration management for expo-sqlite projects. In 2026, type-safe query builders are the standard for large projects.

### Backward Compatibility Rules
1. Additive-only changes (new columns/tables) avoid breaking older app versions sharing the same database
2. New columns are typically nullable initially so older app versions can still write rows
3. Provide sensible defaults for new columns
4. Mark columns deprecated before removal
5. Support N-2 to N app versions accessing same database

## Security

### Database Encryption
SQLCipher provides AES-256 encryption for SQLite databases. Available in expo-sqlite (SDK 52+), op-sqlite, and dedicated wrappers. Set the encryption key via `PRAGMA key` after opening the database.

### Secure Key Storage
- **expo-secure-store**: Store encryption keys with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility and optional biometric authentication via `requireAuthentication: true`
- **react-native-keychain**: Biometric protection with `ACCESS_CONTROL.BIOMETRY_CURRENT_SET` and `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY`

Keys are stored in the Secure Enclave (iOS) or Android Keystore and never leave secure hardware.

### Data Expiration
Define policies per entity type with max age and action (delete/archive/encrypt). Typical policies: inspection drafts expire after 30 days, synced videos after 7 days, user sessions after 24 hours.

## Network Detection

`@react-native-community/netinfo` 11.x provides connectivity state and reachability testing. Configure with a custom `reachabilityUrl` pointing to the app's API health endpoint. The `reachabilityTest` function validates the server response. Listen for state changes to trigger sync-on-reconnect.

## Testing Offline Scenarios

### Network Simulation
- **iOS**: Settings > Developer > Network Link Conditioner > "100% Loss" or custom profile
- **Android**: `adb shell settings put global airplane_mode_on 1`
- **Programmatic**: Mock `@react-native-community/netinfo` in dev builds with `{ isConnected: false, isInternetReachable: false }`

### Conflict Testing
Create records locally, simulate a server version with a different timestamp, and verify the conflict resolution function returns the expected winner based on the configured strategy.

### Database Mocking
WatermelonDB provides a LokiJS in-memory adapter (`@nozbe/watermelondb/adapters/lokijs`) for unit tests that runs without native modules.

### E2E Frameworks
- **Maestro**: YAML-based, minimal setup, no codebase changes required; suited for QA teams
- **Detox**: JS/TS, complex setup, full network mocking; suited for developers and CI/CD

## Anti-Patterns

### Storage

| Anti-Pattern | Pattern |
|--------------|---------|
| AsyncStorage for large data (6 MB iOS limit) | SQLite or WatermelonDB for structured data |
| Storing video files in the database | Store file path in DB, video in filesystem |
| No encryption for PII | SQLCipher + secure key storage for sensitive data |
| Unbounded cache growth | Implement age/size/free-space cleanup policies |

### Sync

| Anti-Pattern | Pattern |
|--------------|---------|
| Treating network requests as source of truth | Local database is source of truth |
| Syncing on every individual change | Batch and debounce sync operations |
| No conflict resolution strategy | Explicit resolution (at minimum, last-write-wins) |
| No retry logic for failed syncs | Exponential backoff queue with max retries |
| Blocking UI during sync | Optimistic updates with background sync |

### Video Upload

| Anti-Pattern | Pattern |
|--------------|---------|
| Single-request upload for large files | Chunked or tus resumable upload |
| Uploading uncompressed video | Compress to 20-50 MB before queuing |
| In-memory upload queue | Persist queue state to DB or MMKV |
| No progress persistence | Save chunk progress; resume on restart |

### Background Sync

| Anti-Pattern | Pattern |
|--------------|---------|
| Expecting exact background intervals | Handle irregular timing; iOS is non-deterministic |
| Long-running background tasks | Split work into chunks (30s iOS limit) |
| Ignoring Android Doze mode | Use WorkManager for reliable scheduling |
| Heavy sync without checking battery state | Check battery level before large uploads |
