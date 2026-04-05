import { useEffect } from 'react';

/**
 * Subscribe to the server's SSE stream.
 *
 * @param {Object} handlers  - Map of event name → callback(data)
 * @param {Function} onStatus - Optional callback(status) where status is
 *                              'connected' | 'reconnecting'
 *
 * The hook fires onStatus('reconnecting') immediately when the connection
 * drops and onStatus('connected') as soon as the stream re-opens.
 */
export function useSSE(handlers, onStatus) {
  useEffect(() => {
    let es;
    let retryTimeout;
    let alive = true;   // guard against calling setState after unmount

    function connect() {
      es = new EventSource('/api/events');

      // The server sends a synthetic 'connected' event on open
      es.addEventListener('connected', () => {
        if (alive && onStatus) onStatus('connected');
      });

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
        if (alive && onStatus) onStatus('reconnecting');
        // Reconnect after 3 seconds if the connection drops
        retryTimeout = setTimeout(() => {
          if (alive) connect();
        }, 3000);
      };
    }

    connect();

    return () => {
      alive = false;
      clearTimeout(retryTimeout);
      if (es) es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
