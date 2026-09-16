import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

// مقارنة العقارات — a real, in-memory selection of real listing ids, shared
// across the app via Context (same pattern as I18nProvider). Deliberately
// NOT persisted to Supabase or AsyncStorage: this is a session-scoped
// comparison tray, not user account data, so no new table is needed. It
// resets when the app is fully restarted, which is the correct behavior
// for a "currently comparing" selection.

export const MAX_COMPARE = 4;

type ToggleResult = 'added' | 'removed' | 'limit_reached';

type ComparisonContextValue = {
  selectedIds: string[];
  isSelected: (listingId: string) => boolean;
  toggleListing: (listingId: string) => ToggleResult;
  removeListing: (listingId: string) => void;
  clearAll: () => void;
  maxCompare: number;
};

const ComparisonContext = createContext<ComparisonContextValue | undefined>(undefined);

export function ComparisonProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const isSelected = useCallback((listingId: string) => selectedIds.includes(listingId), [selectedIds]);

  const toggleListing = useCallback((listingId: string): ToggleResult => {
    let result: ToggleResult = 'added';
    setSelectedIds((prev) => {
      if (prev.includes(listingId)) {
        result = 'removed';
        return prev.filter((id) => id !== listingId);
      }
      if (prev.length >= MAX_COMPARE) {
        result = 'limit_reached';
        return prev;
      }
      result = 'added';
      return [...prev, listingId];
    });
    return result;
  }, []);

  const removeListing = useCallback((listingId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== listingId));
  }, []);

  const clearAll = useCallback(() => setSelectedIds([]), []);

  const value = useMemo<ComparisonContextValue>(
    () => ({ selectedIds, isSelected, toggleListing, removeListing, clearAll, maxCompare: MAX_COMPARE }),
    [selectedIds, isSelected, toggleListing, removeListing, clearAll]
  );

  return <ComparisonContext.Provider value={value}>{children}</ComparisonContext.Provider>;
}

export function useComparison(): ComparisonContextValue {
  const ctx = useContext(ComparisonContext);
  if (!ctx) throw new Error('useComparison must be used within a ComparisonProvider');
  return ctx;
}
