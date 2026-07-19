'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ItemCode, Level } from '@/lib/scoring/constants';
import type { OverrideInput } from '@/lib/db/reviewRepo';
import type { ReviewOverride } from '@/lib/types/evaluation';

interface OverrideEntry {
  level_override: Level;
  override_reason: string | null;
}

interface ReviewOverridesContextValue {
  overrides: Map<ItemCode, OverrideEntry>;
  setOverride: (code: ItemCode, level: Level, reason: string | null) => void;
  clearOverride: (code: ItemCode) => void;
  toOverrideInputArray: () => OverrideInput[];
}

const ReviewOverridesContext = createContext<ReviewOverridesContextValue | null>(null);

function toInitialMap(initialOverrides: ReviewOverride[]): Map<ItemCode, OverrideEntry> {
  return new Map(
    initialOverrides.map((o) => [
      o.item_code as ItemCode,
      { level_override: o.level_override, override_reason: o.override_reason },
    ]),
  );
}

export function ReviewOverridesProvider({
  children,
  initialOverrides = [],
}: {
  children: React.ReactNode;
  initialOverrides?: ReviewOverride[];
}) {
  const [overrides, setOverrides] = useState<Map<ItemCode, OverrideEntry>>(() =>
    toInitialMap(initialOverrides),
  );

  const setOverride = useCallback((code: ItemCode, level: Level, reason: string | null) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(code, { level_override: level, override_reason: reason });
      return next;
    });
  }, []);

  const clearOverride = useCallback((code: ItemCode) => {
    setOverrides((prev) => {
      if (!prev.has(code)) return prev;
      const next = new Map(prev);
      next.delete(code);
      return next;
    });
  }, []);

  const toOverrideInputArray = useCallback((): OverrideInput[] => {
    return Array.from(overrides.entries()).map(([item_code, entry]) => ({
      item_code,
      level_override: entry.level_override,
      override_reason: entry.override_reason,
    }));
  }, [overrides]);

  const value = useMemo(
    () => ({ overrides, setOverride, clearOverride, toOverrideInputArray }),
    [overrides, setOverride, clearOverride, toOverrideInputArray],
  );

  return (
    <ReviewOverridesContext.Provider value={value}>{children}</ReviewOverridesContext.Provider>
  );
}

export function useReviewOverrides(): ReviewOverridesContextValue {
  const ctx = useContext(ReviewOverridesContext);
  if (ctx === null) {
    throw new Error('useReviewOverrides는 ReviewOverridesProvider 내부에서만 호출할 수 있습니다.');
  }
  return ctx;
}
