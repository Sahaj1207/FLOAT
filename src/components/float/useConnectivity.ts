import { useEffect, useState } from "react";
import { ConnectivityState, getConnectivity, subscribeToConnectivity } from "../../platform";

/** Live Wi-Fi / Bluetooth state (null until the first read). */
export function useConnectivity(): [ConnectivityState | null, (state: ConnectivityState) => void] {
  const [state, setState] = useState<ConnectivityState | null>(null);
  useEffect(() => {
    let isMounted = true;
    getConnectivity().then((s) => isMounted && s && setState(s));
    const unlisten = subscribeToConnectivity((s) => isMounted && setState(s));
    return () => {
      isMounted = false;
      unlisten.then((fn) => fn());
    };
  }, []);
  return [state, setState];
}
