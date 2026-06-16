import React, { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import { navigateByDeepLink } from '@/navigation/navigationRef';

import {
  ensureChatNotificationCategory,
  ensureChatNotificationChannel,
  handleNotificationResponse as handleChatNotificationResponse,
  installForegroundNotificationPolicy,
  registerChatPushTaskAsync,
} from '@/lib/push/chatPushRuntime';
import {
  ensureSocialNotificationCategory,
  ensureSocialNotificationChannel,
  handleNotificationResponse as handleSocialNotificationResponse,
} from '@/lib/push/socialPushRuntime';

function extractDeepLinkFromResponse(response: Notifications.NotificationResponse): string | null {
  const data = response?.notification?.request?.content?.data as Record<string, any> | undefined;
  if (!data || typeof data !== 'object') return null;

  const candidates = [
    data.deeplink,
    data.deepLink,
    data.url,
    data.link,
    data.extra_deeplink,
  ];

  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (value) return value;
  }

  return null;
}

async function handleGenericDeepLinkResponse(response: Notifications.NotificationResponse) {
  const deeplink = extractDeepLinkFromResponse(response);
  if (!deeplink) return false;
  return navigateByDeepLink(deeplink);
}

async function handleBootstrapLastResponse() {
  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (!lastResponse) return;

  const handledByChat = await handleChatNotificationResponse(lastResponse);
  if (handledByChat) {
    await (Notifications as any).clearLastNotificationResponseAsync?.();
    return;
  }

  const handledBySocial = await handleSocialNotificationResponse(lastResponse);
  if (handledBySocial) {
    await (Notifications as any).clearLastNotificationResponseAsync?.();
    return;
  }

  const handledByGenericLink = await handleGenericDeepLinkResponse(lastResponse);
  if (handledByGenericLink) {
    await (Notifications as any).clearLastNotificationResponseAsync?.();
  }
}

export default function PushNotificationRuntime() {
  useEffect(() => {
    let mounted = true;

    installForegroundNotificationPolicy();

    (async () => {
      try {
        await Promise.all([
          ensureChatNotificationCategory(),
          ensureChatNotificationChannel(),
          registerChatPushTaskAsync(),
          ensureSocialNotificationCategory(),
          ensureSocialNotificationChannel(),
        ]);

        if (mounted) {
          await handleBootstrapLastResponse();
        }
      } catch (error) {
        console.warn('[push/runtime] bootstrap failed:', error);
      }
    })();

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      (async () => {
        try {
          const handledByChat = await handleChatNotificationResponse(response);
          if (handledByChat) {
            await (Notifications as any).clearLastNotificationResponseAsync?.();
            return;
          }

          const handledBySocial = await handleSocialNotificationResponse(response);
          if (handledBySocial) {
            await (Notifications as any).clearLastNotificationResponseAsync?.();
            return;
          }

          const handledByGenericLink = await handleGenericDeepLinkResponse(response);
          if (handledByGenericLink) {
            await (Notifications as any).clearLastNotificationResponseAsync?.();
          }
        } catch (error) {
          console.warn('[push/runtime] response handler failed:', error);
        }
      })();
    });

    return () => {
      mounted = false;
      responseSub.remove();
    };
  }, []);

  return null;
}