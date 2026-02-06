import { useState, useRef, useCallback } from 'react';

// 타이머 훅
export function useTimer(initialValue = 0) {
  const [time, setTime] = useState(initialValue);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const start = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    startTimeRef.current = Date.now() - time * 1000;

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setTime(elapsed);
    }, 100);
  }, [isRunning, time]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTime(initialValue);
    startTimeRef.current = null;
  }, [stop, initialValue]);

  const getFormattedTime = useCallback(() => {
    const seconds = Math.floor(time);
    const decimals = Math.floor((time % 1) * 10);
    return `${seconds}.${decimals}`;
  }, [time]);

  return {
    time,
    isRunning,
    start,
    stop,
    reset,
    getFormattedTime
  };
}

export default useTimer;
