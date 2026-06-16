# React Native Modern Patterns — Examples

All examples use TypeScript targeting React Native 0.76+ with New Architecture.

---

## Zustand Store with MMKV Persistence

```typescript
// store/storage.ts
import { MMKV } from 'react-native-mmkv';
import { StateStorage } from 'zustand/middleware';

export const mmkv = new MMKV({ id: 'app-storage' });

export const mmkvStorage: StateStorage = {
  getItem: (name: string) => {
    const value = mmkv.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => {
    mmkv.set(name, value);
  },
  removeItem: (name: string) => {
    mmkv.delete(name);
  },
};
```

```typescript
// store/auth.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './storage';

interface User {
  id: string;
  email: string;
  displayName: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const { user, token } = await response.json();
          set({ user, token, isLoading: false });
        } catch {
          set({ isLoading: false });
          throw new Error('Login failed');
        }
      },

      logout: () => set({ user: null, token: null }),

      setToken: (token) => set({ token }),
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
    }
  )
);
```

```typescript
// store/settings.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './storage';

type Theme = 'light' | 'dark' | 'system';

interface SettingsState {
  theme: Theme;
  notificationsEnabled: boolean;
  locale: string;
  setTheme: (theme: Theme) => void;
  toggleNotifications: () => void;
  setLocale: (locale: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      notificationsEnabled: true,
      locale: 'en',
      setTheme: (theme) => set({ theme }),
      toggleNotifications: () =>
        set((state) => ({ notificationsEnabled: !state.notificationsEnabled })),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
```

---

## TanStack Query Setup with Offline Support

```typescript
// api/query-client.ts
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { mmkvStorage } from '../store/storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 24 * 60 * 60 * 1000, // 24 hours
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: mmkvStorage,
  key: 'react-query-cache',
});
```

```typescript
// api/hooks/useUsers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface UpdateUserPayload {
  displayName?: string;
  avatarUrl?: string;
}

const API_BASE = 'https://api.example.com';

async function fetchWithAuth(url: string, options?: RequestInit) {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export function useUser(userId: string) {
  return useQuery<User>({
    queryKey: ['users', userId],
    queryFn: () => fetchWithAuth(`/users/${userId}`),
    staleTime: 10 * 60 * 1000,
  });
}

export function useUsers() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => fetchWithAuth('/users'),
  });
}

export function useUpdateUser(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateUserPayload) =>
      fetchWithAuth(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ['users', userId] });
      const previousUser = queryClient.getQueryData<User>(['users', userId]);

      queryClient.setQueryData<User>(['users', userId], (old) =>
        old ? { ...old, ...newData } : old
      );

      return { previousUser };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousUser) {
        queryClient.setQueryData(['users', userId], context.previousUser);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

```tsx
// App.tsx — wrapping with PersistQueryClientProvider
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persister } from './api/query-client';

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <Navigation />
    </PersistQueryClientProvider>
  );
}
```

---

## React Navigation 7.x Typed Stack/Tab Configuration

```typescript
// navigation/RootNavigator.tsx
import {
  createStaticNavigation,
  StaticParamList,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DetailScreen } from '../screens/DetailScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { useAuth } from '../hooks/useAuth';

// Stack within the Home tab
const HomeStack = createNativeStackNavigator({
  screens: {
    HomeList: {
      screen: HomeScreen,
      options: { title: 'Home' },
      linking: { path: '' },
    },
    Detail: {
      screen: DetailScreen,
      options: { title: 'Detail' },
      linking: { path: 'detail/:id' },
    },
  },
});

// Bottom tabs
const MainTabs = createBottomTabNavigator({
  screenOptions: {
    tabBarActiveTintColor: '#6366f1',
  },
  screens: {
    HomeTab: {
      screen: HomeStack,
      options: {
        title: 'Home',
        headerShown: false,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="home-outline" size={size} color={color} />
        ),
      },
    },
    ProfileTab: {
      screen: ProfileScreen,
      options: {
        title: 'Profile',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="person-outline" size={size} color={color} />
        ),
      },
      linking: { path: 'profile' },
    },
    SettingsTab: {
      screen: SettingsScreen,
      options: {
        title: 'Settings',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="settings-outline" size={size} color={color} />
        ),
      },
      linking: { path: 'settings' },
    },
  },
});

// Root with auth groups
const RootStack = createNativeStackNavigator({
  screenOptions: { headerShown: false },
  groups: {
    Auth: {
      // Note: This callback runs inside the navigator's render context.
      // useAuth() works here because the static API evaluates these during render.
      if: () => !useAuth().isSignedIn,
      screens: {
        Login: {
          screen: LoginScreen,
          linking: { path: 'login' },
        },
        Register: {
          screen: RegisterScreen,
          linking: { path: 'register' },
        },
      },
      screenOptions: {
        animationTypeForReplace: 'pop',
      },
    },
    App: {
      if: () => useAuth().isSignedIn,
      screens: {
        Main: {
          screen: MainTabs,
          linking: { path: '' },
        },
      },
    },
  },
});

// Global type declarations
type RootStackParamList = StaticParamList<typeof RootStack>;
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

export const Navigation = createStaticNavigation(RootStack);
```

---

## Expo Router File-Based Routing Setup

```
app/
  _layout.tsx          # Root layout
  (tabs)/
    _layout.tsx        # Tab layout
    index.tsx          # Home tab (/)
    profile.tsx        # Profile tab (/profile)
    settings.tsx       # Settings tab (/settings)
  (auth)/
    _layout.tsx        # Auth layout
    login.tsx          # /login
    register.tsx       # /register
  detail/
    [id].tsx           # /detail/:id
  +not-found.tsx       # 404
```

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Redirect } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="detail/[id]" options={{ headerShown: true }} />
    </Stack>
  );
}
```

```tsx
// app/(tabs)/_layout.tsx
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';

export default function TabLayout() {
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#6366f1' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

```tsx
// app/detail/[id].tsx
import { useLocalSearchParams, Stack } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { useUser } from '../../api/hooks/useUsers';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: user, isLoading, error } = useUser(id);

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <>
      <Stack.Screen options={{ title: user?.displayName ?? 'Detail' }} />
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold' }}>
          {user?.displayName}
        </Text>
        <Text style={{ color: '#6b7280', marginTop: 4 }}>{user?.email}</Text>
      </View>
    </>
  );
}
```

---

## NativeWind Styled Component

```tsx
// components/Card.tsx
import { View, Text, Pressable } from 'react-native';
import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  onPress?: () => void;
}

export function Card({ title, subtitle, children, onPress }: CardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm
                 border border-gray-100 dark:border-gray-700
                 active:scale-[0.98] active:opacity-90"
    >
      <View className="mb-2">
        <Text className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </Text>
        {subtitle && (
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {subtitle}
          </Text>
        )}
      </View>
      {children && <View className="mt-2">{children}</View>}
    </Pressable>
  );
}
```

```tsx
// components/Badge.tsx
import { View, Text } from 'react-native';

type Variant = 'success' | 'warning' | 'error' | 'info';

const variantClasses: Record<Variant, { container: string; text: string }> = {
  success: { container: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' },
  warning: { container: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200' },
  error: { container: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200' },
  info: { container: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200' },
};

interface BadgeProps {
  label: string;
  variant?: Variant;
}

export function Badge({ label, variant = 'info' }: BadgeProps) {
  const styles = variantClasses[variant];
  return (
    <View className={`px-3 py-1 rounded-full ${styles.container}`}>
      <Text className={`text-xs font-medium ${styles.text}`}>{label}</Text>
    </View>
  );
}
```

---

## FlashList with Optimized Rendering

```tsx
// components/UserList.tsx
import { FlashList } from '@shopify/flash-list';
import { View, Text, Image, Pressable, RefreshControl } from 'react-native';
import { useCallback, useState } from 'react';
import { useUsers } from '../api/hooks/useUsers';

interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

interface UserItemProps {
  user: User;
  onPress: (userId: string) => void;
}

function UserItem({ user, onPress }: UserItemProps) {
  return (
    <Pressable
      onPress={() => onPress(user.id)}
      className="flex-row items-center px-4 py-3 bg-white dark:bg-gray-800
                 border-b border-gray-100 dark:border-gray-700"
    >
      <Image
        source={
          user.avatarUrl
            ? { uri: user.avatarUrl }
            : require('../assets/default-avatar.png')
        }
        className="w-12 h-12 rounded-full bg-gray-200"
      />
      <View className="ml-3 flex-1">
        <Text className="text-base font-medium text-gray-900 dark:text-white">
          {user.displayName}
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          {user.email}
        </Text>
      </View>
    </Pressable>
  );
}

interface UserListProps {
  onUserPress: (userId: string) => void;
}

export function UserList({ onUserPress }: UserListProps) {
  const { data: users, isLoading, refetch } = useUsers();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: User }) => (
      <UserItem user={item} onPress={onUserPress} />
    ),
    [onUserPress]
  );

  return (
    <FlashList
      data={users ?? []}
      renderItem={renderItem}
      estimatedItemSize={68}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      ListEmptyComponent={
        isLoading ? null : (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-gray-500">No users found</Text>
          </View>
        )
      }
    />
  );
}
```

---

## react-hook-form + zod Validation

```tsx
// screens/CreateProfileScreen.tsx
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const profileSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name requires at least 2 characters')
    .max(50, 'Display name cannot exceed 50 characters'),
  email: z.string().email('Enter a valid email address'),
  bio: z
    .string()
    .max(280, 'Bio cannot exceed 280 characters')
    .optional()
    .default(''),
  website: z
    .string()
    .url('Enter a valid URL')
    .optional()
    .or(z.literal('')),
  age: z.coerce
    .number({ invalid_type_error: 'Enter a valid number' })
    .int()
    .min(13, 'Minimum age is 13')
    .max(120, 'Enter a valid age'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function FormField({ label, error, children }: FormFieldProps) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </Text>
      {children}
      {error && (
        <Text className="text-sm text-red-600 dark:text-red-400 mt-1">
          {error}
        </Text>
      )}
    </View>
  );
}

export function CreateProfileScreen() {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      email: '',
      bio: '',
      website: '',
      age: undefined as unknown as number,
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      Alert.alert('Success', 'Profile created');
    } catch {
      Alert.alert('Error', 'Failed to create profile');
    }
  };

  return (
    <ScrollView className="flex-1 bg-white dark:bg-gray-900 p-4">
      <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Create Profile
      </Text>

      <FormField label="Display Name" error={errors.displayName?.message}>
        <Controller
          control={control}
          name="displayName"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                         text-gray-900 dark:text-white bg-white dark:bg-gray-800"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              placeholder="Your name"
              autoCapitalize="words"
            />
          )}
        />
      </FormField>

      <FormField label="Email" error={errors.email?.message}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                         text-gray-900 dark:text-white bg-white dark:bg-gray-800"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          )}
        />
      </FormField>

      <FormField label="Age" error={errors.age?.message}>
        <Controller
          control={control}
          name="age"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                         text-gray-900 dark:text-white bg-white dark:bg-gray-800"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value?.toString() ?? ''}
              placeholder="Your age"
              keyboardType="number-pad"
            />
          )}
        />
      </FormField>

      <FormField label="Bio (optional)" error={errors.bio?.message}>
        <Controller
          control={control}
          name="bio"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                         text-gray-900 dark:text-white bg-white dark:bg-gray-800 h-24"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              placeholder="Tell us about yourself"
              multiline
              textAlignVertical="top"
            />
          )}
        />
      </FormField>

      <FormField label="Website (optional)" error={errors.website?.message}>
        <Controller
          control={control}
          name="website"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                         text-gray-900 dark:text-white bg-white dark:bg-gray-800"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              placeholder="https://yoursite.com"
              keyboardType="url"
              autoCapitalize="none"
            />
          )}
        />
      </FormField>

      <Pressable
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
        className="bg-indigo-600 rounded-lg py-3 items-center mt-2
                   active:bg-indigo-700 disabled:opacity-50"
      >
        <Text className="text-white font-semibold text-base">
          {isSubmitting ? 'Creating...' : 'Create Profile'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

---

## Turbo Module Skeleton

```typescript
// modules/device-info/src/DeviceInfoModule.ts
import { NativeModule, requireNativeModule } from 'expo-modules-core';

interface DeviceInfoModuleInterface extends NativeModule {
  getDeviceId(): string;
  getBatteryLevel(): number;
  getFreeDiskSpace(): number;
  isEmulator(): boolean;
  getSystemUptimeAsync(): Promise<number>;
}

export default requireNativeModule<DeviceInfoModuleInterface>('DeviceInfo');
```

```swift
// modules/device-info/ios/DeviceInfoModule.swift
import ExpoModulesCore
import UIKit

public class DeviceInfoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeviceInfo")

    Function("getDeviceId") { () -> String in
      UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
    }

    Function("getBatteryLevel") { () -> Float in
      UIDevice.current.isBatteryMonitoringEnabled = true
      return UIDevice.current.batteryLevel
    }

    Function("getFreeDiskSpace") { () -> Int64 in
      let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
      if let values = try? paths.last?.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
         let capacity = values.volumeAvailableCapacityForImportantUsage {
        return capacity
      }
      return 0
    }

    Function("isEmulator") { () -> Bool in
      #if targetEnvironment(simulator)
        return true
      #else
        return false
      #endif
    }

    AsyncFunction("getSystemUptimeAsync") { () -> Double in
      ProcessInfo.processInfo.systemUptime
    }
  }
}
```

```kotlin
// modules/device-info/android/src/main/java/com/example/deviceinfo/DeviceInfoModule.kt
package com.example.deviceinfo

import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceInfoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceInfo")

    Function("getDeviceId") {
      Settings.Secure.getString(
        appContext.reactContext?.contentResolver,
        Settings.Secure.ANDROID_ID
      ) ?: "unknown"
    }

    Function("getBatteryLevel") {
      val batteryManager = appContext.reactContext?.getSystemService(
        android.content.Context.BATTERY_SERVICE
      ) as? android.os.BatteryManager
      (batteryManager?.getIntProperty(
        android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY
      ) ?: -1) / 100f
    }

    Function("getFreeDiskSpace") {
      val stat = StatFs(Environment.getDataDirectory().path)
      stat.availableBlocksLong * stat.blockSizeLong
    }

    Function("isEmulator") {
      Build.FINGERPRINT.startsWith("generic") ||
        Build.FINGERPRINT.startsWith("unknown") ||
        Build.MODEL.contains("Emulator") ||
        Build.MANUFACTURER.contains("Genymotion")
    }

    AsyncFunction("getSystemUptimeAsync") {
      SystemClock.elapsedRealtime().toDouble() / 1000.0
    }
  }
}
```

---

## EAS Build Configuration

```json
// eas.json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      },
      "env": {
        "APP_ENV": "development",
        "API_URL": "https://api.dev.example.com"
      }
    },
    "preview": {
      "extends": "production",
      "distribution": "internal",
      "channel": "preview",
      "env": {
        "APP_ENV": "preview",
        "API_URL": "https://api.staging.example.com"
      }
    },
    "production": {
      "autoIncrement": true,
      "channel": "production",
      "env": {
        "APP_ENV": "production",
        "API_URL": "https://api.example.com"
      },
      "ios": {
        "resourceClass": "m-medium"
      },
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "dev@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "XXXXXXXXXX"
      },
      "android": {
        "serviceAccountKeyPath": "./google-services.json",
        "track": "internal"
      }
    }
  }
}
```

```javascript
// app.config.js
export default ({ config }) => ({
  ...config,
  name: 'MyApp',
  slug: 'my-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  updates: {
    url: 'https://u.expo.dev/your-project-id',
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'sdkVersion',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.example.myapp',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.example.myapp',
  },
  plugins: [
    'expo-router',
    ['expo-camera', { cameraPermission: 'Allow $(PRODUCT_NAME) to access your camera' }],
    ['expo-location', { locationWhenInUsePermission: 'Allow $(PRODUCT_NAME) to use your location' }],
  ],
  extra: {
    apiUrl: process.env.API_URL,
    appEnv: process.env.APP_ENV ?? 'development',
    eas: {
      projectId: 'your-project-id',
    },
  },
});
```

## SDK Migration: Icon Glyphmap Verification

Verify icon names exist before using — glyphmaps change between Expo SDK versions without deprecation warnings:

```bash
# Check if a specific icon name exists in a glyphmap
node -e "const icons = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/AntDesign.json'); console.log('scan1' in icons)"

# List all available icon names for a set
node -e "const icons = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/AntDesign.json'); console.log(Object.keys(icons).sort().join('\n'))" | grep -i scan
```

## AsyncStorage v3.x: Local Maven Repo Fix

`@react-native-async-storage/async-storage` v3.x ships `storage-android` as a local `.aar` not on Maven Central. Add the local repo to `android/build.gradle`:

```groovy
// android/build.gradle — allprojects.repositories block
allprojects {
    repositories {
        // ... existing repos ...
        maven {
            url "$rootDir/../node_modules/@react-native-async-storage/async-storage/android/local_repo"
        }
    }
}
```

Note: `npx expo prebuild --clean` wipes `android/build.gradle`. Use an Expo config plugin or `expo-build-properties` for persistence.
