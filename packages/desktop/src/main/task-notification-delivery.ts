import { notificationTargetView, type DesktopNotificationPayload } from '../../electron/main/notifications'

export async function deliverTaskNotification(
  payload: DesktopNotificationPayload,
  pet: (speech: { id: string; text: string }) => Promise<boolean>,
  fallback: () => void,
): Promise<void> {
  if (payload.readAt != null) return
  if (notificationTargetView(payload.url) === 'tasks' && !payload.topic?.startsWith('approval:')) {
    try {
      if (await pet({
        id: `notification:${payload.id}`.slice(0, 256),
        text: `${payload.title}\n${payload.body}`.slice(0, 2000),
      })) return
    } catch {
    }
  }
  fallback()
}
