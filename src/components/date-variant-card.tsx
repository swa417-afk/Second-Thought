import { useEffect, useState } from "react";
import {
  DATE_VARIANT_EVENT,
  type DateVariantSelection,
} from "@/lib/evidence/date-variants";
import { TemporalSuggestionCard } from "@/components/temporal-suggestion-card";

export function DateVariantSuggestionHost() {
  const [selection, setSelection] = useState<DateVariantSelection | null>(null);

  useEffect(() => {
    const onVariant = (event: Event) => {
      const detail = (event as CustomEvent<DateVariantSelection>).detail;
      if (detail?.cardRequired) setSelection(detail);
    };
    window.addEventListener(DATE_VARIANT_EVENT, onVariant);
    return () => window.removeEventListener(DATE_VARIANT_EVENT, onVariant);
  }, []);

  return <TemporalSuggestionCard selection={selection} />;
}