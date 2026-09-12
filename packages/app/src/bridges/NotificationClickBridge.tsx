import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useHostBridge } from "../context/host-bridge-context";

export function NotificationClickBridge() {
  const navigate = useNavigate();
  const bridge = useHostBridge();

  useEffect(() => {
    const off = bridge.onNotificationClicked?.((route) => navigate(route));
    return off;
  }, [bridge, navigate]);

  return null;
}
