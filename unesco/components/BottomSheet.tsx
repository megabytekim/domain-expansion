"use client";

import { useRef, useCallback, type ReactNode } from "react";

type SheetState = "closed" | "half" | "full";

interface BottomSheetProps {
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  children: ReactNode;
}

const SNAP_POINTS: Record<SheetState, number> = {
  closed: 0,
  half: 40,
  full: 85,
};

export default function BottomSheet({ state, onStateChange, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, startHeight: 0, dragging: false });

  const height = SNAP_POINTS[state];

  const snapToNearest = useCallback(
    (currentHeight: number) => {
      const distances = (Object.entries(SNAP_POINTS) as [SheetState, number][]).map(
        ([s, h]) => [s, Math.abs(currentHeight - h)] as [SheetState, number]
      );
      distances.sort((a, b) => a[1] - b[1]);
      onStateChange(distances[0][0]);
    },
    [onStateChange]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { startY: e.clientY, startHeight: SNAP_POINTS[state], dragging: true };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [state]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const vh = window.innerHeight;
    const newHeight = Math.max(0, Math.min(95, dragRef.current.startHeight + (dy / vh) * 100));
    sheetRef.current.style.height = `${newHeight}vh`;
    sheetRef.current.style.transition = "none";
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.dragging || !sheetRef.current) return;
      dragRef.current.dragging = false;
      const dy = dragRef.current.startY - e.clientY;
      const vh = window.innerHeight;
      const finalHeight = dragRef.current.startHeight + (dy / vh) * 100;
      sheetRef.current.style.height = "";
      sheetRef.current.style.transition = "";
      snapToNearest(finalHeight);
    },
    [snapToNearest]
  );

  if (state === "closed") return null;

  return (
    <div
      ref={sheetRef}
      className="absolute bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl shadow-2xl z-20 flex flex-col transition-all duration-300 ease-out border-t border-gray-700"
      style={{ height: `${height}vh` }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="w-10 h-1 bg-gray-600 rounded-full" />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
}
