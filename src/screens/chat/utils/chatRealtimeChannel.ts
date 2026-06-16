export function canUseRealtimeBroadcastChannel(channel: any): boolean {
  if (!channel) return false;

  try {
    if (typeof channel.canPush === "function") {
      return channel.canPush() === true;
    }
  } catch {
    return false;
  }

  const state = String(channel.state ?? channel._state ?? "").toLowerCase();
  return state === "joined" || state === "subscribed";
}
