# Mobile Offline Sync Examples

Production TypeScript examples for offline-first React Native field-capture applications.

## WatermelonDB Model and Schema Definition

```typescript
// schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 3,
  tables: [
    tableSchema({
      name: 'inspections',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'gps_latitude', type: 'number', isOptional: true },
        { name: 'gps_longitude', type: 'number', isOptional: true },
        { name: 'captured_at', type: 'number' },
        { name: 'sync_status', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'video_attachments',
      columns: [
        { name: 'inspection_id', type: 'string', isIndexed: true },
        { name: 'local_uri', type: 'string' },
        { name: 'remote_url', type: 'string', isOptional: true },
        { name: 'file_size', type: 'number' },
        { name: 'sync_status', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});

// models/Inspection.ts
import { Model } from '@nozbe/watermelondb';
import { field, date, children, writer } from '@nozbe/watermelondb/decorators';

export class Inspection extends Model {
  static table = 'inspections';
  static associations = {
    video_attachments: { type: 'has_many' as const, foreignKey: 'inspection_id' },
  };

  @field('title') title!: string;
  @field('notes') notes!: string;
  @field('gps_latitude') gpsLatitude!: number;
  @field('gps_longitude') gpsLongitude!: number;
  @field('captured_at') capturedAt!: number;
  @field('sync_status') syncStatus!: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @children('video_attachments') videoAttachments!: any;

  @writer async markSynced() {
    await this.update((record) => {
      record.syncStatus = 'synced';
    });
  }

  @writer async markConflict() {
    await this.update((record) => {
      record.syncStatus = 'conflict';
    });
  }
}
```

## MMKV Store Setup with Zustand Persistence

```typescript
// stores/appStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'app-storage' });

const mmkvStorage = {
  getItem: (name: string): string | null => {
    return storage.getString(name) ?? null;
  },
  setItem: (name: string, value: string): void => {
    storage.set(name, value);
  },
  removeItem: (name: string): void => {
    storage.delete(name);
  },
};

interface AppState {
  lastSyncTimestamp: number | null;
  pendingSyncCount: number;
  isOnline: boolean;
  syncInProgress: boolean;
  setLastSync: (timestamp: number) => void;
  setPendingCount: (count: number) => void;
  setOnline: (online: boolean) => void;
  setSyncInProgress: (inProgress: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      lastSyncTimestamp: null,
      pendingSyncCount: 0,
      isOnline: true,
      syncInProgress: false,
      setLastSync: (timestamp) => set({ lastSyncTimestamp: timestamp }),
      setPendingCount: (count) => set({ pendingSyncCount: count }),
      setOnline: (online) => set({ isOnline: online }),
      setSyncInProgress: (inProgress) => set({ syncInProgress: inProgress }),
    }),
    {
      name: 'app-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        lastSyncTimestamp: state.lastSyncTimestamp,
        pendingSyncCount: state.pendingSyncCount,
      }),
    }
  )
);
```

## Offline Operation Queue

```typescript
// sync/operationQueue.ts
import { MMKV } from 'react-native-mmkv';

const queueStorage = new MMKV({ id: 'sync-queue' });

type OperationType = 'CREATE' | 'UPDATE' | 'DELETE';

interface SyncOperation {
  id: string;
  type: OperationType;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  retryCount: number;
  lastError?: string;
  priority: 'high' | 'normal' | 'low';
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getQueue(): SyncOperation[] {
  const raw = queueStorage.getString('operations');
  return raw ? JSON.parse(raw) : [];
}

function saveQueue(queue: SyncOperation[]): void {
  queueStorage.set('operations', JSON.stringify(queue));
}

export function enqueue(
  type: OperationType,
  entity: string,
  entityId: string,
  payload: Record<string, unknown>,
  priority: 'high' | 'normal' | 'low' = 'normal'
): void {
  const queue = getQueue();
  queue.push({
    id: generateId(),
    type,
    entity,
    entityId,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
    priority,
  });
  saveQueue(queue);
}

export function dequeue(): SyncOperation | null {
  const queue = getQueue();
  if (queue.length === 0) return null;

  const priorityOrder = { high: 0, normal: 1, low: 2 };
  queue.sort((a, b) => {
    if (a.priority !== b.priority) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.createdAt - b.createdAt;
  });

  return queue[0];
}

export function markCompleted(operationId: string): void {
  const queue = getQueue().filter((op) => op.id !== operationId);
  saveQueue(queue);
}

export function markFailed(operationId: string, error: string): void {
  const queue = getQueue();
  const op = queue.find((o) => o.id === operationId);
  if (op) {
    op.retryCount += 1;
    op.lastError = error;
  }
  saveQueue(queue);
}

export function getPendingCount(): number {
  return getQueue().length;
}

export function getFailedOperations(): SyncOperation[] {
  return getQueue().filter((op) => op.retryCount >= 3);
}
```

## Network-Aware Sync Manager

```typescript
// sync/syncManager.ts
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as OperationQueue from './operationQueue';
import { useAppStore } from '../stores/appStore';

const MAX_RETRIES = 3;
const API_BASE = 'https://api.fieldcapture.example.com';

let wasOffline = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

async function executeOperation(op: ReturnType<typeof OperationQueue.dequeue>): Promise<void> {
  if (!op) return;

  const endpoints: Record<string, string> = {
    CREATE: `${API_BASE}/${op.entity}`,
    UPDATE: `${API_BASE}/${op.entity}/${op.entityId}`,
    DELETE: `${API_BASE}/${op.entity}/${op.entityId}`,
  };

  const methods: Record<string, string> = {
    CREATE: 'POST',
    UPDATE: 'PUT',
    DELETE: 'DELETE',
  };

  const response = await fetch(endpoints[op.type], {
    method: methods[op.type],
    headers: { 'Content-Type': 'application/json' },
    body: op.type !== 'DELETE' ? JSON.stringify(op.payload) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
  }
}

export async function processQueue(): Promise<void> {
  const store = useAppStore.getState();
  if (store.syncInProgress) return;

  store.setSyncInProgress(true);

  try {
    let op = OperationQueue.dequeue();
    while (op) {
      if (op.retryCount >= MAX_RETRIES) {
        // Remove permanently failed operations to prevent infinite loop
        OperationQueue.markCompleted(op.id); // or move to a dead-letter queue
        op = OperationQueue.dequeue();
        continue;
      }

      try {
        await executeOperation(op);
        OperationQueue.markCompleted(op.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        OperationQueue.markFailed(op.id, message);

        // Stop processing on network errors; resume on next reconnect
        if (message.includes('Network request failed')) break;
      }

      op = OperationQueue.dequeue();
    }

    store.setLastSync(Date.now());
    store.setPendingCount(OperationQueue.getPendingCount());
  } finally {
    store.setSyncInProgress(false);
  }
}

export function startNetworkListener(): () => void {
  NetInfo.configure({
    reachabilityUrl: `${API_BASE}/ping`,
    reachabilityTest: async (response) => response.status === 200,
    reachabilityRequestTimeout: 15_000,
  });

  const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const isOnline = !!(state.isConnected && state.isInternetReachable);
    useAppStore.getState().setOnline(isOnline);

    if (isOnline && wasOffline) {
      processQueue();
    }

    wasOffline = !isOnline;
  });

  return unsubscribe;
}

export function startPeriodicSync(intervalMs: number = 5 * 60 * 1000): () => void {
  const tick = async () => {
    const { isOnline } = useAppStore.getState();
    if (isOnline && OperationQueue.getPendingCount() > 0) {
      await processQueue();
    }
    syncTimer = setTimeout(tick, intervalMs);
  };

  tick();

  return () => {
    if (syncTimer) clearTimeout(syncTimer);
  };
}
```

## Conflict Resolution Handler

```typescript
// sync/conflictResolver.ts

type SyncStatus = 'synced' | 'pending' | 'conflict';

interface SyncableRecord {
  id: string;
  localUpdatedAt: number;
  serverUpdatedAt?: number;
  syncStatus: SyncStatus;
  [key: string]: unknown;
}

type Strategy = 'last-write-wins' | 'server-wins' | 'client-wins' | 'manual';

interface ConflictResult<T extends SyncableRecord> {
  resolved: T;
  strategy: Strategy;
  hadConflict: boolean;
}

export function resolveConflict<T extends SyncableRecord>(
  local: T,
  server: T,
  strategy: Strategy = 'last-write-wins'
): ConflictResult<T> {
  switch (strategy) {
    case 'last-write-wins': {
      const serverTime = server.serverUpdatedAt ?? 0;
      if (local.localUpdatedAt > serverTime) {
        return {
          resolved: { ...local, syncStatus: 'pending' as SyncStatus },
          strategy,
          hadConflict: true,
        };
      }
      return {
        resolved: { ...server, syncStatus: 'synced' as SyncStatus },
        strategy,
        hadConflict: true,
      };
    }

    case 'server-wins':
      return {
        resolved: { ...server, syncStatus: 'synced' as SyncStatus },
        strategy,
        hadConflict: true,
      };

    case 'client-wins':
      return {
        resolved: { ...local, syncStatus: 'pending' as SyncStatus },
        strategy,
        hadConflict: true,
      };

    case 'manual':
      return {
        resolved: { ...local, syncStatus: 'conflict' as SyncStatus },
        strategy,
        hadConflict: true,
      };
  }
}

export function mergeFields<T extends SyncableRecord>(
  local: T,
  server: T,
  fieldPriorities: Record<string, 'local' | 'server'>
): T {
  const merged = { ...server };

  for (const [field, priority] of Object.entries(fieldPriorities)) {
    if (priority === 'local' && field in local) {
      (merged as Record<string, unknown>)[field] = (local as Record<string, unknown>)[field];
    }
  }

  merged.syncStatus = 'pending';
  merged.localUpdatedAt = Date.now();
  return merged;
}
```

## Background Sync Task Registration

```typescript
// sync/backgroundSync.ts
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { processQueue } from './syncManager';
import { getPendingCount } from './operationQueue';

const SYNC_TASK_NAME = 'FIELD_CAPTURE_BACKGROUND_SYNC';

TaskManager.defineTask(SYNC_TASK_NAME, async () => {
  const pendingCount = getPendingCount();
  if (pendingCount === 0) {
    return BackgroundTask.BackgroundTaskResult.NoData;
  }

  try {
    await processQueue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('[BackgroundSync] Failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (isRegistered) return;

  await BackgroundTask.registerTaskAsync(SYNC_TASK_NAME, {
    minimumInterval: 15 * 60, // 15 minutes (platform minimum)
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

export async function unregisterBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (!isRegistered) return;

  await BackgroundTask.unregisterTaskAsync(SYNC_TASK_NAME);
}

export async function getBackgroundSyncStatus(): Promise<{
  registered: boolean;
  taskName: string;
}> {
  const registered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  return { registered, taskName: SYNC_TASK_NAME };
}
```

## Video Offline Capture Flow

```typescript
// capture/videoCapture.ts
import * as FileSystem from 'expo-file-system';
import { Video } from 'react-native-compressor';
import NetInfo from '@react-native-community/netinfo';
import { enqueue } from '../sync/operationQueue';

const VIDEO_PENDING_DIR = `${FileSystem.documentDirectory}videos/pending/`;
const VIDEO_UPLOADED_DIR = `${FileSystem.documentDirectory}videos/uploaded/`;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface CaptureResult {
  inspectionId: string;
  videoId: string;
  compressedSize: number;
}

export async function ensureDirectories(): Promise<void> {
  const pendingInfo = await FileSystem.getInfoAsync(VIDEO_PENDING_DIR);
  if (!pendingInfo.exists) {
    await FileSystem.makeDirectoryAsync(VIDEO_PENDING_DIR, { intermediates: true });
  }

  const uploadedInfo = await FileSystem.getInfoAsync(VIDEO_UPLOADED_DIR);
  if (!uploadedInfo.exists) {
    await FileSystem.makeDirectoryAsync(VIDEO_UPLOADED_DIR, { intermediates: true });
  }
}

export async function captureAndQueue(
  rawVideoUri: string,
  inspectionData: {
    title: string;
    notes?: string;
    latitude: number;
    longitude: number;
  },
  database: any
): Promise<CaptureResult> {
  const inspectionId = generateUUID();
  const videoId = generateUUID();

  // Step 1: Compress video (target 20-50 MB)
  const compressedUri = await Video.compress(rawVideoUri, {
    compressionMethod: 'auto',
    maxSize: 1280,
    bitrate: 2_000_000,
  });

  // Step 2: Move to persistent local storage
  const permanentPath = `${VIDEO_PENDING_DIR}${videoId}.mp4`;
  await FileSystem.moveAsync({ from: compressedUri, to: permanentPath });

  const fileInfo = await FileSystem.getInfoAsync(permanentPath, { size: true });
  const fileSize = fileInfo.exists ? (fileInfo as any).size ?? 0 : 0;

  // Step 3: Create database records
  await database.write(async () => {
    await database.get('inspections').create((record: any) => {
      record._raw.id = inspectionId;
      record.title = inspectionData.title;
      record.notes = inspectionData.notes ?? '';
      record.gpsLatitude = inspectionData.latitude;
      record.gpsLongitude = inspectionData.longitude;
      record.capturedAt = Date.now();
      record.syncStatus = 'pending';
    });

    await database.get('video_attachments').create((record: any) => {
      record._raw.id = videoId;
      record.inspectionId = inspectionId;
      record.localUri = permanentPath;
      record.fileSize = fileSize;
      record.syncStatus = 'pending';
    });
  });

  // Step 4: Queue sync operations
  enqueue('CREATE', 'inspections', inspectionId, {
    title: inspectionData.title,
    notes: inspectionData.notes,
    latitude: inspectionData.latitude,
    longitude: inspectionData.longitude,
    capturedAt: Date.now(),
  });

  enqueue('CREATE', 'video_attachments', videoId, {
    inspectionId,
    localUri: permanentPath,
    fileSize,
  }, 'normal');

  // Step 5: Attempt immediate sync if online
  const networkState = await NetInfo.fetch();
  if (networkState.isConnected && networkState.isInternetReachable) {
    const { processQueue } = await import('../sync/syncManager');
    processQueue();
  }

  return { inspectionId, videoId, compressedSize: fileSize };
}
```

## Disk Quota Monitor and Cleanup

```typescript
// storage/diskManager.ts
import * as FileSystem from 'expo-file-system';
import { MMKV } from 'react-native-mmkv';

const storageMetrics = new MMKV({ id: 'storage-metrics' });

const VIDEO_PENDING_DIR = `${FileSystem.documentDirectory}videos/pending/`;
const VIDEO_UPLOADED_DIR = `${FileSystem.documentDirectory}videos/uploaded/`;
const MAX_CACHED_VIDEOS = 50;
const MIN_FREE_SPACE_MB = 500;
const MAX_UPLOADED_CACHE_MB = 2048;

interface DiskStatus {
  freeSpaceGB: number;
  pendingVideosMB: number;
  uploadedCacheMB: number;
  needsCleanup: boolean;
}

export async function getDiskStatus(): Promise<DiskStatus> {
  const freeBytes = await FileSystem.getFreeDiskStorageAsync();
  const freeSpaceGB = freeBytes / (1024 * 1024 * 1024);

  const pendingVideosMB = await getDirectorySizeMB(VIDEO_PENDING_DIR);
  const uploadedCacheMB = await getDirectorySizeMB(VIDEO_UPLOADED_DIR);

  const needsCleanup =
    freeSpaceGB < MIN_FREE_SPACE_MB / 1024 ||
    uploadedCacheMB > MAX_UPLOADED_CACHE_MB;

  storageMetrics.set('lastCheck', Date.now());
  storageMetrics.set('freeSpaceGB', freeSpaceGB);

  return { freeSpaceGB, pendingVideosMB, uploadedCacheMB, needsCleanup };
}

async function getDirectorySizeMB(dirPath: string): Promise<number> {
  const dirInfo = await FileSystem.getInfoAsync(dirPath);
  if (!dirInfo.exists) return 0;

  const files = await FileSystem.readDirectoryAsync(dirPath);
  let totalBytes = 0;

  for (const file of files) {
    const info = await FileSystem.getInfoAsync(`${dirPath}${file}`, { size: true });
    if (info.exists) {
      totalBytes += (info as any).size ?? 0;
    }
  }

  return totalBytes / (1024 * 1024);
}

export async function cleanupUploadedVideos(): Promise<number> {
  const dirInfo = await FileSystem.getInfoAsync(VIDEO_UPLOADED_DIR);
  if (!dirInfo.exists) return 0;

  const files = await FileSystem.readDirectoryAsync(VIDEO_UPLOADED_DIR);

  // Get file info with timestamps for sorting
  const fileDetails = await Promise.all(
    files.map(async (name) => {
      const path = `${VIDEO_UPLOADED_DIR}${name}`;
      const info = await FileSystem.getInfoAsync(path, { size: true });
      return {
        name,
        path,
        size: info.exists ? ((info as any).size ?? 0) : 0,
        modTime: info.exists ? ((info as any).modificationTime ?? 0) : 0,
      };
    })
  );

  // Sort oldest first
  fileDetails.sort((a, b) => a.modTime - b.modTime);

  // Delete oldest files beyond cache limit
  const toDelete = fileDetails.slice(0, Math.max(0, fileDetails.length - MAX_CACHED_VIDEOS));
  let freedBytes = 0;

  for (const file of toDelete) {
    await FileSystem.deleteAsync(file.path, { idempotent: true });
    freedBytes += file.size;
  }

  return freedBytes / (1024 * 1024);
}

export async function aggressiveCleanup(): Promise<void> {
  // Delete all uploaded cache
  const uploadedInfo = await FileSystem.getInfoAsync(VIDEO_UPLOADED_DIR);
  if (uploadedInfo.exists) {
    await FileSystem.deleteAsync(VIDEO_UPLOADED_DIR, { idempotent: true });
    await FileSystem.makeDirectoryAsync(VIDEO_UPLOADED_DIR, { intermediates: true });
  }
}

export async function moveToUploaded(videoId: string): Promise<void> {
  const pendingPath = `${VIDEO_PENDING_DIR}${videoId}.mp4`;
  const uploadedPath = `${VIDEO_UPLOADED_DIR}${videoId}.mp4`;

  const info = await FileSystem.getInfoAsync(pendingPath);
  if (info.exists) {
    await FileSystem.moveAsync({ from: pendingPath, to: uploadedPath });
  }
}
```

## SQLite Migration Pattern

```typescript
// db/sqliteMigrations.ts
import * as SQLite from 'expo-sqlite';

interface Migration {
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    name: '001_create_inspections',
    sql: `
      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        gps_latitude REAL,
        gps_longitude REAL,
        captured_at INTEGER NOT NULL,
        sync_status TEXT DEFAULT 'pending',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `,
  },
  {
    name: '002_create_video_attachments',
    sql: `
      CREATE TABLE IF NOT EXISTS video_attachments (
        id TEXT PRIMARY KEY,
        inspection_id TEXT NOT NULL REFERENCES inspections(id),
        local_uri TEXT NOT NULL,
        remote_url TEXT,
        file_size INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'pending',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `,
  },
  {
    name: '003_add_video_attachments_index',
    sql: `CREATE INDEX IF NOT EXISTS idx_video_inspection ON video_attachments(inspection_id)`,
  },
  {
    name: '004_create_sync_operations',
    sql: `
      CREATE TABLE IF NOT EXISTS sync_operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        priority TEXT DEFAULT 'normal',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `,
  },
];

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // Create migrations tracking table
  db.runSync(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const applied = db.getAllSync<{ name: string }>('SELECT name FROM migrations');
  const appliedNames = new Set(applied.map((r) => r.name));

  for (const migration of migrations) {
    if (!appliedNames.has(migration.name)) {
      db.execSync(migration.sql);
      db.runSync('INSERT INTO migrations (name) VALUES (?)', [migration.name]);
      console.log(`[Migration] Applied: ${migration.name}`);
    }
  }
}

export function getMigrationStatus(db: SQLite.SQLiteDatabase): {
  applied: string[];
  pending: string[];
} {
  const applied = db.getAllSync<{ name: string }>('SELECT name FROM migrations ORDER BY id');
  const appliedNames = new Set(applied.map((r) => r.name));

  return {
    applied: applied.map((r) => r.name),
    pending: migrations.filter((m) => !appliedNames.has(m.name)).map((m) => m.name),
  };
}
```

## Sync Status Indicator Component

```typescript
// components/SyncStatusIndicator.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useAppStore } from '../stores/appStore';

type SyncStatus = 'synced' | 'syncing' | 'pending' | 'conflict' | 'error' | 'offline';

const STATUS_CONFIG: Record<SyncStatus, { label: string; color: string; icon: string }> = {
  synced: { label: 'All synced', color: '#16a34a', icon: '\u2713' },
  syncing: { label: 'Syncing...', color: '#2563eb', icon: '\u21BB' },
  pending: { label: 'Pending sync', color: '#d97706', icon: '\u2191' },
  conflict: { label: 'Conflict', color: '#dc2626', icon: '\u26A0' },
  error: { label: 'Sync error', color: '#dc2626', icon: '\u2717' },
  offline: { label: 'Offline', color: '#6b7280', icon: '\u2022' },
};

interface Props {
  recordSyncStatus?: 'synced' | 'pending' | 'conflict' | 'error';
}

export function SyncStatusIndicator({ recordSyncStatus }: Props) {
  const { isOnline, syncInProgress, pendingSyncCount } = useAppStore();
  const [pulseAnim] = useState(() => new Animated.Value(1));

  const status: SyncStatus = (() => {
    if (recordSyncStatus === 'conflict') return 'conflict';
    if (recordSyncStatus === 'error') return 'error';
    if (!isOnline) return 'offline';
    if (syncInProgress) return 'syncing';
    if (recordSyncStatus === 'pending' || pendingSyncCount > 0) return 'pending';
    return 'synced';
  })();

  useEffect(() => {
    if (status === 'syncing') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
    pulseAnim.setValue(1);
  }, [status, pulseAnim]);

  const config = STATUS_CONFIG[status];

  return (
    <Animated.View style={[styles.container, { opacity: status === 'syncing' ? pulseAnim : 1 }]}>
      <View style={[styles.dot, { backgroundColor: config.color }]}>
        <Text style={styles.icon}>{config.icon}</Text>
      </View>
      <Text style={[styles.label, { color: config.color }]}>
        {config.label}
        {status === 'pending' && pendingSyncCount > 0 ? ` (${pendingSyncCount})` : ''}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  icon: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
});
```
