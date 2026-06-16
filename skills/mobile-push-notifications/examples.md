# Push Notifications Examples

## expo-notifications Setup with Token Registration

```typescript
// services/notifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface PushTokens {
  expoPushToken: string;
  devicePushToken: string;
}

export async function registerForPushNotifications(): Promise<PushTokens | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  // Android 13+ requires runtime permission
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return null;
  }

  const expoPushToken = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });

  const devicePushToken = await Notifications.getDevicePushTokenAsync();

  return {
    expoPushToken: expoPushToken.data,
    devicePushToken: devicePushToken.data,
  };
}

export async function sendTokenToServer(
  userId: string,
  token: string,
  platform: 'ios' | 'android'
): Promise<void> {
  await fetch('https://api.example.com/push-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      token,
      platform,
      lastActive: new Date().toISOString(),
    }),
  });
}
```

## Notification Handler (Foreground + Background + Tap Response)

```typescript
// hooks/useNotifications.ts
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';

// Configure foreground behavior — call this at module level, before component mount
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useNotificationListeners() {
  const navigation = useNavigation();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Foreground: notification received while app is open
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data;
        // Update in-app badge counts, show in-app toast, etc.
        console.log('Foreground notification:', data);
      }
    );

    // User tapped notification (from any state)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        handleNotificationNavigation(data, navigation);
      }
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [navigation]);
}

function handleNotificationNavigation(
  data: Record<string, unknown>,
  navigation: any
): void {
  if (data.screen && typeof data.screen === 'string') {
    const params = (data.params as Record<string, unknown>) ?? {};
    navigation.navigate(data.screen, params);
  }
}
```

```typescript
// Background handler — register in app entry point (index.ts or App.tsx top-level)
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error }) => {
  if (error) {
    console.error('Background notification error:', error);
    return;
  }
  const notification = (data as { notification: Notifications.Notification }).notification;
  // Sync data, update local storage, etc.
});

Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
```

## Deep Link Handler (Navigate to Specific Screen)

```typescript
// navigation/linking.ts
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { LinkingOptions } from '@react-navigation/native';

type RootStackParamList = {
  Home: undefined;
  OrderDetails: { orderId: string };
  Chat: { chatId: string };
  Profile: undefined;
};

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'myapp://'],
  config: {
    screens: {
      Home: 'home',
      OrderDetails: 'order/:orderId',
      Chat: 'chat/:chatId',
      Profile: 'profile',
    },
  },
  async getInitialURL(): Promise<string | null> {
    // Check if app was opened from a notification (cold start)
    const response = await Notifications.getLastNotificationResponseAsync();
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string') {
      return url;
    }
    // Fall back to standard deep link
    return Linking.getInitialURL();
  },
  subscribe(listener: (url: string) => void) {
    // Notification tap while app is running
    const notificationSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === 'string') {
          listener(url);
        }
      }
    );

    // Standard deep links
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      listener(url);
    });

    return () => {
      notificationSub.remove();
      linkingSub.remove();
    };
  },
};
```

```tsx
// App.tsx — wire up linking
import { NavigationContainer } from '@react-navigation/native';
import { linking } from './navigation/linking';

export default function App() {
  return (
    <NavigationContainer linking={linking}>
      {/* Stack navigator with Home, OrderDetails, Chat, Profile screens */}
    </NavigationContainer>
  );
}
```

## Rich Notification with Image and Action Buttons

```typescript
// Using expo-notifications categories
import * as Notifications from 'expo-notifications';

// Define categories at app startup
export async function setupNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync('order_update', [
    {
      identifier: 'view_order',
      buttonTitle: 'View Order',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'mark_delivered',
      buttonTitle: 'Mark Delivered',
      options: { opensAppToForeground: false },
    },
  ]);

  await Notifications.setNotificationCategoryAsync('message', [
    {
      identifier: 'reply',
      buttonTitle: 'Reply',
      textInput: {
        submitButtonTitle: 'Send',
        placeholder: 'Type your reply...',
      },
    },
    {
      identifier: 'mark_read',
      buttonTitle: 'Mark as Read',
      options: { opensAppToForeground: false },
    },
  ]);
}

// Rich notification with image (local trigger example)
export async function showRichNotification(
  title: string,
  body: string,
  imageUrl: string,
  category: string,
  data: Record<string, unknown>
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      categoryIdentifier: category,
      data,
      attachments: [{ url: imageUrl }],
      sound: 'default',
    },
    trigger: null,
  });
}
```

```typescript
// Using Notifee for richer Android styling
import notifee, { AndroidStyle, AndroidImportance } from '@notifee/react-native';

export async function showRichAndroidNotification(
  title: string,
  body: string,
  imageUrl: string,
  avatarUrl: string
): Promise<void> {
  const channelId = await notifee.createChannel({
    id: 'orders',
    name: 'Order Updates',
    importance: AndroidImportance.HIGH,
  });

  await notifee.displayNotification({
    title,
    body,
    android: {
      channelId,
      largeIcon: avatarUrl,
      style: {
        type: AndroidStyle.BIGPICTURE,
        picture: imageUrl,
      },
      actions: [
        { title: 'View Order', pressAction: { id: 'view_order' } },
        { title: 'Get Directions', pressAction: { id: 'directions' } },
      ],
    },
    ios: {
      attachments: [{ url: imageUrl }],
    },
  });
}

// Handle action button press
notifee.onBackgroundEvent(async ({ type, detail }) => {
  // EventType is imported statically at the top of this module
  if (type === EventType.ACTION_PRESS) {
    switch (detail.pressAction?.id) {
      case 'view_order':
        // Navigate to order screen
        break;
      case 'directions':
        // Open maps app
        break;
    }
  }
});
```

## Server-Side: Node.js FCM v1 Sender

```typescript
// server/notifications.ts
import * as admin from 'firebase-admin';

admin.initializeApp({
  credential: admin.credential.cert(
    require('./service-account.json')
  ),
});

interface SendOptions {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  channelId?: string;
}

export async function sendPushNotification(options: SendOptions): Promise<string> {
  const { token, title, body, data = {}, imageUrl, channelId = 'default' } = options;

  const message: admin.messaging.Message = {
    token,
    notification: { title, body, ...(imageUrl && { imageUrl }) },
    data,
    android: {
      priority: 'high',
      notification: {
        channelId,
        clickAction: 'OPEN_APP',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          ...(data.category && { category: data.category }),
        },
      },
    },
  };

  try {
    return await admin.messaging().send(message);
  } catch (error: unknown) {
    const fbError = error as { code?: string };
    if (fbError.code === 'messaging/registration-token-not-registered') {
      await deleteInvalidToken(token);
    }
    throw error;
  }
}

export async function sendBatchNotifications(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
  const invalidTokens: string[] = [];

  // Process in chunks of 500 (FCM batch limit)
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const message: admin.messaging.MulticastMessage = {
      tokens: chunk,
      notification: { title, body },
      data,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    response.responses.forEach((res, idx) => {
      if (!res.success && res.error?.code === 'messaging/registration-token-not-registered') {
        invalidTokens.push(chunk[idx]);
      }
    });
  }

  // Clean up invalid tokens
  if (invalidTokens.length > 0) {
    await deleteInvalidTokens(invalidTokens);
  }

  return {
    successCount: tokens.length - invalidTokens.length,
    failureCount: invalidTokens.length,
    invalidTokens,
  };
}

export async function sendToTopic(
  topic: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<string> {
  return admin.messaging().send({
    topic,
    notification: { title, body },
    data,
  });
}

async function deleteInvalidToken(token: string): Promise<void> {
  // Implementation: remove token from database
}

async function deleteInvalidTokens(tokens: string[]): Promise<void> {
  // Implementation: batch remove tokens from database
}
```

## Server-Side: Python FCM v1 Sender

```python
# server/notifications.py
import firebase_admin
from firebase_admin import credentials, messaging
from typing import Optional

cred = credentials.Certificate('service-account.json')
firebase_admin.initialize_app(cred)


def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: Optional[dict[str, str]] = None,
    image_url: Optional[str] = None,
    channel_id: str = 'default',
) -> str:
    """Send a push notification to a single device."""
    notification = messaging.Notification(
        title=title,
        body=body,
        image=image_url,
    )

    message = messaging.Message(
        token=token,
        notification=notification,
        data=data or {},
        android=messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                channel_id=channel_id,
                click_action='OPEN_APP',
            ),
        ),
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(
                    sound='default',
                    badge=1,
                ),
            ),
        ),
    )

    try:
        return messaging.send(message)
    except messaging.UnregisteredError:
        delete_invalid_token(token)
        raise


def send_batch_notifications(
    tokens: list[str],
    title: str,
    body: str,
    data: Optional[dict[str, str]] = None,
) -> dict:
    """Send notifications to multiple devices in batches of 500."""
    invalid_tokens: list[str] = []
    success_count = 0
    failure_count = 0

    for i in range(0, len(tokens), 500):
        chunk = tokens[i:i + 500]
        messages = [
            messaging.Message(
                token=t,
                notification=messaging.Notification(title=title, body=body),
                data=data or {},
            )
            for t in chunk
        ]

        response = messaging.send_each(messages)
        success_count += response.success_count
        failure_count += response.failure_count

        for idx, send_response in enumerate(response.responses):
            if send_response.exception and isinstance(
                send_response.exception, messaging.UnregisteredError
            ):
                invalid_tokens.append(chunk[idx])

    if invalid_tokens:
        delete_invalid_tokens(invalid_tokens)

    return {
        'success_count': success_count,
        'failure_count': failure_count,
        'invalid_tokens': invalid_tokens,
    }


def send_to_topic(
    topic: str,
    title: str,
    body: str,
    data: Optional[dict[str, str]] = None,
) -> str:
    """Send a notification to all subscribers of a topic."""
    message = messaging.Message(
        topic=topic,
        notification=messaging.Notification(title=title, body=body),
        data=data or {},
    )
    return messaging.send(message)


def delete_invalid_token(token: str) -> None:
    """Remove an invalid token from the database."""
    # Implementation: DELETE FROM push_tokens WHERE token = ?
    pass


def delete_invalid_tokens(tokens: list[str]) -> None:
    """Batch remove invalid tokens from the database."""
    # Implementation: DELETE FROM push_tokens WHERE token IN (?)
    pass
```

## Permission Priming Screen Component

```tsx
// screens/NotificationPrimingScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';

interface NotificationPrimingProps {
  onComplete: (granted: boolean) => void;
}

export function NotificationPrimingScreen({ onComplete }: NotificationPrimingProps) {
  const [requesting, setRequesting] = useState(false);

  const handleEnable = async () => {
    setRequesting(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      onComplete(status === 'granted');
    } catch {
      onComplete(false);
    } finally {
      setRequesting(false);
    }
  };

  const handleSkip = () => {
    onComplete(false);
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/notification-bell.png')}
        style={styles.image}
        accessibilityLabel="Notification bell illustration"
      />

      <Text style={styles.title}>Stay in the loop</Text>

      <Text style={styles.description}>
        Get notified about things that matter to you:
      </Text>

      <View style={styles.benefitsList}>
        <BenefitItem icon="package" text="Order status updates" />
        <BenefitItem icon="message" text="New messages from your contacts" />
        <BenefitItem icon="bell" text="Important account alerts" />
      </View>

      <Text style={styles.disclaimer}>
        You can customize which notifications you receive in Settings at any time.
      </Text>

      <TouchableOpacity
        style={styles.enableButton}
        onPress={handleEnable}
        disabled={requesting}
        accessibilityRole="button"
      >
        <Text style={styles.enableButtonText}>
          {requesting ? 'Requesting...' : 'Enable Notifications'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={handleSkip}
        accessibilityRole="button"
      >
        <Text style={styles.skipButtonText}>Maybe Later</Text>
      </TouchableOpacity>
    </View>
  );
}

function BenefitItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.benefitRow}>
      <Text style={styles.benefitIcon}>{icon === 'package' ? '\u{1F4E6}' : icon === 'message' ? '\u{1F4AC}' : '\u{1F514}'}</Text>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  image: { width: 120, height: 120, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#1A1A1A' },
  description: { fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center' },
  benefitsList: { width: '100%', marginBottom: 24 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  benefitIcon: { fontSize: 20, marginRight: 12 },
  benefitText: { fontSize: 16, color: '#333' },
  disclaimer: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 24 },
  enableButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  enableButtonText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  skipButton: { paddingVertical: 12 },
  skipButtonText: { color: '#007AFF', fontSize: 16 },
});
```

## Notification Preferences Screen

```tsx
// screens/NotificationPreferencesScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  TouchableOpacity,
  Linking,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';

interface Category {
  key: string;
  label: string;
  description: string;
}

const CATEGORIES: Category[] = [
  { key: 'orderUpdates', label: 'Order Updates', description: 'Shipping, delivery, and order status' },
  { key: 'chatMessages', label: 'Messages', description: 'New messages from your contacts' },
  { key: 'marketing', label: 'Promotions', description: 'Deals, offers, and recommendations' },
  { key: 'systemAlerts', label: 'Account Alerts', description: 'Security, billing, and account changes' },
];

export function NotificationPreferencesScreen() {
  const [systemEnabled, setSystemEnabled] = useState<boolean | null>(null);
  const [preferences, setPreferences] = useState<Record<string, boolean>>({
    orderUpdates: true,
    chatMessages: true,
    marketing: false,
    systemAlerts: true,
  });

  useEffect(() => {
    checkSystemPermission();
  }, []);

  const checkSystemPermission = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setSystemEnabled(status === 'granted');
  };

  const togglePreference = async (key: string, value: boolean) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);

    await fetch('https://api.example.com/notification-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: updated }),
    });
  };

  return (
    <ScrollView style={styles.container}>
      {systemEnabled === false && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Notifications are disabled in system settings.
          </Text>
          <TouchableOpacity onPress={() => Linking.openSettings()}>
            <Text style={styles.warningLink}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionHeader}>Notification Categories</Text>

      {CATEGORIES.map((cat) => (
        <View key={cat.key} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{cat.label}</Text>
            <Text style={styles.rowDescription}>{cat.description}</Text>
          </View>
          <Switch
            value={preferences[cat.key] ?? false}
            onValueChange={(value) => togglePreference(cat.key, value)}
            disabled={!systemEnabled}
          />
        </View>
      ))}

      <TouchableOpacity
        style={styles.systemSettingsButton}
        onPress={() => Linking.openSettings()}
      >
        <Text style={styles.systemSettingsText}>Open System Notification Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  warningBanner: {
    backgroundColor: '#FFF3CD',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  warningText: { flex: 1, color: '#856404', fontSize: 14 },
  warningLink: { color: '#007AFF', fontWeight: '600', marginLeft: 8 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: '#1A1A1A' },
  rowDescription: { fontSize: 13, color: '#999', marginTop: 2 },
  systemSettingsButton: {
    alignItems: 'center',
    padding: 16,
    marginTop: 24,
  },
  systemSettingsText: { color: '#007AFF', fontSize: 16 },
});
```

## Local Notification Scheduling

```typescript
// services/localNotifications.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function scheduleReminder(
  title: string,
  body: string,
  date: Date,
  data: Record<string, unknown> = {}
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: { type: 'date', date },
  });
}

export async function scheduleDailyReminder(
  title: string,
  body: string,
  hour: number,
  minute: number
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'default' },
    trigger: { type: 'daily', hour, minute },
  });
}

export async function scheduleDelayedNotification(
  title: string,
  body: string,
  delaySeconds: number,
  data: Record<string, unknown> = {}
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default' },
    trigger: { type: 'timeInterval', seconds: delaySeconds, repeats: false },
  });
}

export async function cancelScheduledNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return Notifications.getAllScheduledNotificationsAsync();
}
```

## Complete Setup: app.config.js + Handler + Server

```javascript
// app.config.js
export default ({ config }) => ({
  ...config,
  plugins: [
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#ffffff',
        sounds: ['./assets/notification-sound.wav'],
      },
    ],
  ],
  ios: {
    ...config.ios,
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    ...config.android,
    googleServicesFile: './google-services.json',
  },
});
```

```typescript
// App.tsx — complete wiring
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { linking } from './navigation/linking';
import { registerForPushNotifications, sendTokenToServer } from './services/notifications';
import { setupNotificationCategories } from './services/categories';
import { useNotificationListeners } from './hooks/useNotifications';

const Stack = createNativeStackNavigator();

// Foreground handler — module-level, runs before component mount
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  useNotificationListeners();

  useEffect(() => {
    async function init() {
      await setupNotificationCategories();
      const tokens = await registerForPushNotifications();
      if (tokens) {
        await sendTokenToServer('current-user-id', tokens.devicePushToken, Platform.OS as 'ios' | 'android');
      }
    }
    init();
  }, []);

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator>
        {/* Screen definitions */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

```typescript
// index.ts — background task registration (must be outside App component)
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error }) => {
  if (error) {
    console.error('Background task error:', error);
    return;
  }
  const notification = (data as { notification: Notifications.Notification }).notification;
  const payload = notification.request.content.data;

  // Background processing: sync data, update local cache, etc.
  if (payload.type === 'sync') {
    // Trigger data sync
  }
});

Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
```

## Android Notification Channels Setup

```typescript
// services/channels.ts
import * as Notifications from 'expo-notifications';

export async function createNotificationChannels(): Promise<void> {
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Order Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'order_sound.wav',
    description: 'Updates about your order status',
  });

  await Notifications.setNotificationChannelAsync('chat', {
    name: 'Chat Messages',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'New messages from your contacts',
  });

  await Notifications.setNotificationChannelAsync('marketing', {
    name: 'Promotions',
    importance: Notifications.AndroidImportance.LOW,
    description: 'Deals, offers, and recommendations',
  });

  await Notifications.setNotificationChannelAsync('system', {
    name: 'System Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Important account and security notifications',
  });
}
```
