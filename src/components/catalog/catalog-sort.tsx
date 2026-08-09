"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/context/language-context";

function CatalogSortContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  const currentSort = searchParams.get("sortBy") || "newest_drops";

  const handleSortChange = (value: string | null) => {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "newest_drops") {
      params.delete("sortBy");
    } else {
      params.set("sortBy", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
      <Select value={currentSort} onValueChange={handleSortChange}>
        <SelectTrigger className="w-[260px] h-9 text-xs font-semibold bg-background">
          <SelectValue placeholder={t.sortBy} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest_drops">{t.newestDrops}</SelectItem>
          <SelectItem value="newest_stores">{t.newestStores}</SelectItem>
          <SelectItem value="price_asc">{t.priceAsc}</SelectItem>
          <SelectItem value="price_desc">{t.priceDesc}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function CatalogSort() {
  return (
    <Suspense fallback={<div className="w-[260px] h-9 bg-muted/40 animate-pulse rounded-md" />}>
      <CatalogSortContent />
    </Suspense>
  );
}
