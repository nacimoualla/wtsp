import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Configure notification handler (how notifications are presented when app is foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Request permissions and get push token (for push notifications)
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Permission not granted for push notifications');
    return null;
  }

  // Get the token
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Expo push token:', token);
    return token;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

// Schedule a local notification (for foreground messages)
export async function showLocalNotification(title: string, body: string, data?: any) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: null, // show immediately
  });
}

// Set up listeners for notification events (optional)
export function setupNotificationListeners(
  onReceived?: (notification: Notifications.Notification) => void,
  onTapped?: (response: Notifications.NotificationResponse) => void
) {
  const receivedSub = Notifications.addNotificationReceivedListener(notification => {
    onReceived?.(notification);
  });

  const tappedSub = Notifications.addNotificationResponseReceivedListener(response => {
    onTapped?.(response);
  });

  return () => {
    receivedSub.remove();
    tappedSub.remove();
  };
}