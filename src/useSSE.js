import { useEffect } from 'react';

/**
 * Subscribe to the server's SSE stream.
 * @param {Object} handlers - Map of event name → callback function
 *   e.g. { 'trip-groups-changed': (data) => reload() }
 */
export function useSSE(handlers) {
  useEffect(() => {
    let es;
    let retryTimeout;

    function connect() {
      es = new EventSource('/api/events');

      Object.entries(handlers).forEach(([event, handler]) => {
        es.addEventListener(event, (e) => {
          try {
            const data = JSON.parse(e.data);
            handler(data);
          } catch (_) {
            handler({});
          }
        });
      });

      es.onerror = () => {
        es.close();
        // Reconnect after 3 seconds if the connection drops
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (es) es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
