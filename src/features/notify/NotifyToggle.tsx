// Bouton cloche de la barre du haut : active ou coupe les notifications (demande la permission au navigateur la première fois).
import { useHydrated } from "@tanstack/react-router";
import { Icon } from "~/components/ds";
import { toaster } from "~/lib/actions";
import { m } from "~/lib/i18n";
import { notificationsSupported } from "./Notifier";
import { setNotifyEnabled, useNotifyEnabled } from "./store";

export function NotifyToggle({ className }: { className: string }) {
  const hydrated = useHydrated();
  const enabled = useNotifyEnabled();
  const permission = hydrated && notificationsSupported() ? Notification.permission : "default";
  const on = enabled && permission === "granted";

  const toggle = async () => {
    if (!notificationsSupported()) return;
    if (on) {
      setNotifyEnabled(false);
      toaster.create({ title: m.notify_notifications_off(), duration: 1800 });
      return;
    }
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (p !== "granted") {
      toaster.create({
        title: m.notify_notifications_blocked_by_chrome(),
        description: m.notify_allow_them_127_0_0(),
        type: "error",
        duration: 6000,
      });
      return;
    }
    setNotifyEnabled(true);
    new Notification(m.notify_n2_notifications(), {
      body: m.notify_new_urgent_items_meeting_5(),
    });
  };

  const label = on ? m.notify_notifications_click_turn_off() : m.notify_turn_notifications();
  return (
    <button type="button" onClick={toggle} aria-label={label} aria-pressed={on} title={label} className={className}>
      <Icon name={on ? "bell" : "bellOff"} size={16} />
    </button>
  );
}
