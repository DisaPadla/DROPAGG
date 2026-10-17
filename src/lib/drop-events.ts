import { AvailabilityStatus } from "@prisma/client";

/**
 * Time window (48 hours) during which a newly discovered product is badged as "NEW DROP".
 */
export const NEW_DROP_WINDOW_HOURS = 48;
export const NEW_DROP_WINDOW_MS = NEW_DROP_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * Time window (7 days) during which a restock event (OUT_OF_STOCK -> IN_STOCK) keeps the "RESTOCKED" badge active.
 */
export const RESTOCK_WINDOW_DAYS = 7;
export const RESTOCK_WINDOW_MS = RESTOCK_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type DropEventType = "RESTOCK" | "NEW_DROP" | "PRICE_DROP";

export interface ExistingVariantSnapshot {
  id?: string;
  availability: AvailabilityStatus | "IN_STOCK" | "OUT_OF_STOCK";
  rawPrice: number | string | { toNumber?: () => number } | null | undefined;
}

export interface IncomingVariantSnapshot {
  availability: AvailabilityStatus | "IN_STOCK" | "OUT_OF_STOCK";
  rawPrice: number | string;
}

export interface DetectedDropChange {
  shouldRecord: boolean;
  eventType: DropEventType | null;
  previousStatus: AvailabilityStatus;
  newStatus: AvailabilityStatus;
  previousPrice?: number;
  newPrice?: number;
}

export interface ProductDropBadges {
  isNewDrop: boolean;
  isRestocked: boolean;
  hasPriceDrop: boolean;
  isSoldOut: boolean;
  restockedSizes: string[];
  latestDropEventAt: string | null;
}

/**
 * Safely converts a number, numeric string, or Prisma Decimal into a JS number.
 */
export function toNumericPrice(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value);
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

/**
 * Pure state-transition evaluator for product variants during ingestion.
 *
 * Tracks three event types in `DropEvent`:
 * 1. `RESTOCK`: Existing variant transitions from `OUT_OF_STOCK` -> `IN_STOCK`.
 * 2. `NEW_DROP`: Brand-new variant is created with `IN_STOCK` (`IN_STOCK` -> `IN_STOCK`).
 * 3. `PRICE_DROP`: Existing variant in stock drops in price (`rawPrice < existing.rawPrice`).
 */
export function evaluateVariantDropEvent(
  existingVariant: ExistingVariantSnapshot | null | undefined,
  incomingVariant: IncomingVariantSnapshot
): DetectedDropChange {
  const newStatus: AvailabilityStatus =
    incomingVariant.availability === "IN_STOCK" ? "IN_STOCK" : "OUT_OF_STOCK";
  const newPrice = toNumericPrice(incomingVariant.rawPrice);

  // Case 1: New variant discovered for the first time
  if (!existingVariant) {
    if (newStatus === "IN_STOCK") {
      return {
        shouldRecord: true,
        eventType: "NEW_DROP",
        previousStatus: "IN_STOCK",
        newStatus: "IN_STOCK",
        newPrice: Number.isFinite(newPrice) ? newPrice : undefined,
      };
    }

    return {
      shouldRecord: false,
      eventType: null,
      previousStatus: "OUT_OF_STOCK",
      newStatus: "OUT_OF_STOCK",
    };
  }

  const prevStatus: AvailabilityStatus =
    existingVariant.availability === "IN_STOCK" ? "IN_STOCK" : "OUT_OF_STOCK";
  const prevPrice = toNumericPrice(existingVariant.rawPrice);

  // Case 2: Restock (OUT_OF_STOCK -> IN_STOCK)
  if (prevStatus === "OUT_OF_STOCK" && newStatus === "IN_STOCK") {
    return {
      shouldRecord: true,
      eventType: "RESTOCK",
      previousStatus: "OUT_OF_STOCK",
      newStatus: "IN_STOCK",
      previousPrice: Number.isFinite(prevPrice) ? prevPrice : undefined,
      newPrice: Number.isFinite(newPrice) ? newPrice : undefined,
    };
  }

  // Case 3: Price Drop while variant is in stock
  const isPriceDropped =
    Number.isFinite(prevPrice) &&
    Number.isFinite(newPrice) &&
    prevPrice > 0 &&
    newPrice > 0 &&
    prevPrice - newPrice >= 0.01;

  if (newStatus === "IN_STOCK" && isPriceDropped) {
    return {
      shouldRecord: true,
      eventType: "PRICE_DROP",
      previousStatus: prevStatus,
      newStatus: "IN_STOCK",
      previousPrice: prevPrice,
      newPrice: newPrice,
    };
  }

  return {
    shouldRecord: false,
    eventType: null,
    previousStatus: prevStatus,
    newStatus: newStatus,
  };
}

export interface UpsertVariantWithDropEventParams {
  productId: string;
  externalId?: string;
  size: string;
  color: string;
  sku?: string;
  availability: AvailabilityStatus;
  rawPrice: number;
  compareAtPrice?: number | null;
  currency: string;
  normalizedPrice: number;
}

export interface DropEventRecord {
  id?: string;
  variantId?: string;
  previousStatus?: AvailabilityStatus | string | null;
  newStatus?: AvailabilityStatus | string | null;
  detectedAt?: string | Date | number | null;
}

export interface DropBadgeVariant {
  id?: string;
  size?: string | null;
  availability?: AvailabilityStatus | string | null;
  createdAt?: string | Date | number | null;
  isRestocked?: boolean;
  dropEvents?: DropEventRecord[] | null;
}

export interface DropBadgeProduct {
  id?: string;
  createdAt?: string | Date | number | null;
  isNewDrop?: boolean;
  isRestocked?: boolean;
  hasPriceDrop?: boolean;
  variants?: DropBadgeVariant[] | null;
  dropEvents?: DropEventRecord[] | null;
}

interface VariantUpdatePayload {
  availability: AvailabilityStatus;
  rawPrice: number;
  currency: string;
  normalizedPrice: number;
  sku?: string;
  compareAtPrice?: number | null;
}

interface VariantCreatePayload extends VariantUpdatePayload {
  productId: string;
  externalId?: string;
  size: string;
  color: string;
}

export interface DropEventPrismaClient {
  productVariant: {
    findUnique: (args: {
      where: { productId_size_color: { productId: string; size: string; color: string } };
      select: { id: true; availability: true; rawPrice: true };
    }) => Promise<ExistingVariantSnapshot | null>;
    upsert: (args: {
      where: { productId_size_color: { productId: string; size: string; color: string } };
      update: VariantUpdatePayload;
      create: VariantCreatePayload;
    }) => Promise<{ id: string }>;
  };
  dropEvent?: {
    create: (args: {
      data: {
        variantId: string;
        previousStatus: AvailabilityStatus;
        newStatus: AvailabilityStatus;
      };
    }) => Promise<unknown>;
  };
}

/**
 * Upserts a ProductVariant and automatically records a DropEvent when a
 * Restock (OUT_OF_STOCK -> IN_STOCK), New Drop, or Price Drop occurs.
 */
export async function upsertVariantWithDropEvent(
  prismaClient: DropEventPrismaClient,
  params: UpsertVariantWithDropEventParams
) {
  const {
    productId,
    externalId,
    size,
    color,
    sku,
    availability,
    rawPrice,
    compareAtPrice,
    currency,
    normalizedPrice,
  } = params;

  let existingVariant: ExistingVariantSnapshot | null = null;
  try {
    existingVariant = await prismaClient.productVariant.findUnique({
      where: {
        productId_size_color: {
          productId,
          size,
          color,
        },
      },
      select: {
        id: true,
        availability: true,
        rawPrice: true,
      },
    });
  } catch (err) {
    console.warn("[DropEvent] Failed to inspect existing variant before upsert:", err);
  }

  const updateData: VariantUpdatePayload = {
    availability,
    rawPrice,
    currency,
    normalizedPrice,
  };
  if (sku !== undefined) {
    updateData.sku = sku;
  }
  if (compareAtPrice !== undefined) {
    updateData.compareAtPrice = compareAtPrice;
  }

  const createData: VariantCreatePayload = {
    productId,
    externalId,
    size,
    color,
    sku,
    availability,
    rawPrice,
    currency,
    normalizedPrice,
  };
  if (compareAtPrice !== undefined) {
    createData.compareAtPrice = compareAtPrice;
  }

  const variant = await prismaClient.productVariant.upsert({
    where: {
      productId_size_color: {
        productId,
        size,
        color,
      },
    },
    update: updateData,
    create: createData,
  });

  const evaluation = evaluateVariantDropEvent(existingVariant, {
    availability,
    rawPrice,
  });

  let dropEvent = null;
  if (evaluation.shouldRecord && variant?.id && prismaClient.dropEvent) {
    try {
      dropEvent = await prismaClient.dropEvent.create({
        data: {
          variantId: variant.id,
          previousStatus: evaluation.previousStatus,
          newStatus: evaluation.newStatus,
        },
      });
    } catch (err) {
      console.warn(`[DropEvent] Failed to record ${evaluation.eventType} event for variant ${variant.id}:`, err);
    }
  }

  return {
    variant,
    dropEvent,
    evaluation,
  };
}

function isTimestampWithinWindow(
  timestamp: string | Date | number | null | undefined,
  windowMs: number,
  nowMs: number = Date.now()
): boolean {
  if (!timestamp) return false;
  const timeMs =
    typeof timestamp === "number"
      ? timestamp
      : timestamp instanceof Date
      ? timestamp.getTime()
      : new Date(timestamp).getTime();

  if (Number.isNaN(timeMs)) return false;
  const ageMs = nowMs - timeMs;
  // Allow up to 5 minutes of clock skew into the future
  return ageMs <= windowMs && ageMs >= -5 * 60 * 1000;
}

/**
 * Determines whether a product qualifies for the "NEW DROP" badge (released within the last 48h).
 */
export function isProductNewDrop(
  product?: DropBadgeProduct | null,
  nowMs: number = Date.now()
): boolean {
  if (!product) return false;

  // Primary check: product.createdAt within 48 hours
  if (product.createdAt) {
    const createdMs =
      product.createdAt instanceof Date
        ? product.createdAt.getTime()
        : new Date(product.createdAt).getTime();

    if (!Number.isNaN(createdMs)) {
      const ageMs = nowMs - createdMs;
      return ageMs <= NEW_DROP_WINDOW_MS && ageMs >= -5 * 60 * 1000;
    }
  }

  // Secondary check: inspect variant creation timestamps or initial NEW_DROP events
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    let hasAnyVariantCreatedAt = false;
    for (const v of product.variants) {
      if (v?.createdAt && !Number.isNaN(new Date(v.createdAt).getTime())) {
        hasAnyVariantCreatedAt = true;
        if (isTimestampWithinWindow(v.createdAt, NEW_DROP_WINDOW_MS, nowMs)) {
          return true;
        }
      }
    }

    // If variants have valid createdAt timestamps and none are within 48h, the product is not a new drop
    if (hasAnyVariantCreatedAt) {
      return false;
    }

    let hasAnyVariantDropEvents = false;
    for (const v of product.variants) {
      if (!Array.isArray(v?.dropEvents)) continue;
      hasAnyVariantDropEvents = true;

      const inStockEvents = v.dropEvents.filter(
        (de: DropEventRecord) =>
          de?.previousStatus === "IN_STOCK" && de?.newStatus === "IN_STOCK"
      );
      const hasRestockHistory = v.dropEvents.some(
        (de: DropEventRecord) =>
          de?.previousStatus === "OUT_OF_STOCK" && de?.newStatus === "IN_STOCK"
      );
      const hasOlderEventOutsideWindow = v.dropEvents.some(
        (de: DropEventRecord) =>
          de?.detectedAt &&
          !Number.isNaN(new Date(de.detectedAt).getTime()) &&
          !isTimestampWithinWindow(de.detectedAt, NEW_DROP_WINDOW_MS, nowMs)
      );

      // A genuine NEW_DROP without variant.createdAt has its initial IN_STOCK->IN_STOCK event within 48h
      // and no prior history outside the 48h window or prior restock events
      if (
        !hasRestockHistory &&
        !hasOlderEventOutsideWindow &&
        inStockEvents.some((de: DropEventRecord) =>
          isTimestampWithinWindow(de?.detectedAt, NEW_DROP_WINDOW_MS, nowMs)
        )
      ) {
        return true;
      }
    }

    if (hasAnyVariantDropEvents && typeof product.isNewDrop !== "boolean") {
      return false;
    }
  }

  // Final fallback when timestamps/events were stripped in a lightweight projection
  if (typeof product.isNewDrop === "boolean") {
    return product.isNewDrop;
  }

  return false;
}

/**
 * Determines whether a product qualifies for the "RESTOCKED" badge
 * (at least one currently available variant transitioned from OUT_OF_STOCK -> IN_STOCK).
 */
export function isProductRestocked(
  product?: DropBadgeProduct | null,
  nowMs: number = Date.now()
): boolean {
  if (!product) return false;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const isSoldOut =
    variants.length > 0 &&
    variants.every((v: DropBadgeVariant) => v?.availability === "OUT_OF_STOCK");

  if (isSoldOut) return false;

  let hasDropEventsMetadata = false;

  for (const v of variants) {
    if (Array.isArray(v?.dropEvents)) {
      hasDropEventsMetadata = true;
    }

    if (v?.availability === "OUT_OF_STOCK") continue;

    if (Array.isArray(v?.dropEvents)) {
      const hasRestockEvent = v.dropEvents.some((de: DropEventRecord) => {
        if (de?.previousStatus !== "OUT_OF_STOCK" || de?.newStatus !== "IN_STOCK") {
          return false;
        }
        // If detectedAt is provided, verify it is within the restock window; otherwise accept
        if (!de.detectedAt) return true;
        return isTimestampWithinWindow(de.detectedAt, RESTOCK_WINDOW_MS, nowMs);
      });
      if (hasRestockEvent) return true;
    } else if (v?.isRestocked === true) {
      return true;
    }
  }

  if (Array.isArray(product.dropEvents)) {
    hasDropEventsMetadata = true;
    const hasProductRestock = product.dropEvents.some((de: DropEventRecord) => {
      if (de?.previousStatus !== "OUT_OF_STOCK" || de?.newStatus !== "IN_STOCK") {
        return false;
      }
      if (!de.detectedAt) return true;
      return isTimestampWithinWindow(de.detectedAt, RESTOCK_WINDOW_MS, nowMs);
    });
    if (hasProductRestock) return true;
  }

  // Only fall back to precomputed boolean if dropEvents arrays are not present on variants
  if (!hasDropEventsMetadata && product.isRestocked === true) {
    return true;
  }

  return false;
}

/**
 * Computes all drop-related badge flags and metadata for a product card.
 */
export function getProductDropBadges(
  product?: DropBadgeProduct | null,
  nowMs: number = Date.now()
): ProductDropBadges {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const isSoldOut =
    variants.length > 0 &&
    variants.every((v: DropBadgeVariant) => v?.availability === "OUT_OF_STOCK");

  const isNewDrop = isProductNewDrop(product, nowMs);
  const isRestocked = isProductRestocked(product, nowMs);

  const restockedSizesSet = new Set<string>();
  let hasPriceDrop = false;
  let hasDropEventsMetadata = false;
  let latestDropMs = -1;

  const productCreatedMs = product?.createdAt ? new Date(product.createdAt).getTime() : NaN;

  for (const v of variants) {
    if (!Array.isArray(v?.dropEvents)) continue;
    hasDropEventsMetadata = true;

    const variantCreatedMs = v?.createdAt ? new Date(v.createdAt).getTime() : productCreatedMs;
    let inStockToInStockCount = 0;
    let earliestRestockMs = Infinity;

    for (const de of v.dropEvents) {
      if (de?.detectedAt) {
        const dtMs = new Date(de.detectedAt).getTime();
        if (!Number.isNaN(dtMs) && dtMs > latestDropMs) {
          latestDropMs = dtMs;
        }
      }

      if (de?.previousStatus === "OUT_OF_STOCK" && de?.newStatus === "IN_STOCK") {
        if (de?.detectedAt) {
          const rMs = new Date(de.detectedAt).getTime();
          if (!Number.isNaN(rMs) && rMs < earliestRestockMs) {
            earliestRestockMs = rMs;
          }
        } else {
          earliestRestockMs = 0;
        }

        if (
          v?.availability !== "OUT_OF_STOCK" &&
          (!de.detectedAt || isTimestampWithinWindow(de.detectedAt, RESTOCK_WINDOW_MS, nowMs))
        ) {
          if (v.size) {
            restockedSizesSet.add(String(v.size));
          }
        }
      }

      if (de?.previousStatus === "IN_STOCK" && de?.newStatus === "IN_STOCK") {
        inStockToInStockCount++;
        if (de?.detectedAt && !Number.isNaN(variantCreatedMs)) {
          const dtMs = new Date(de.detectedAt).getTime();
          if (!Number.isNaN(dtMs) && dtMs - variantCreatedMs > 60 * 1000) {
            hasPriceDrop = true;
          }
        }
      }
    }

    // If a variant has 2+ IN_STOCK->IN_STOCK events, or an IN_STOCK->IN_STOCK event after a restock,
    // at least one of those events is guaranteed to be a PRICE_DROP.
    if (inStockToInStockCount >= 2) {
      hasPriceDrop = true;
    } else if (inStockToInStockCount === 1 && earliestRestockMs < Infinity) {
      const inStockDe = v.dropEvents.find(
        (de: DropEventRecord) =>
          de?.previousStatus === "IN_STOCK" && de?.newStatus === "IN_STOCK"
      );
      const deMs = inStockDe?.detectedAt ? new Date(inStockDe.detectedAt).getTime() : Infinity;
      if (Number.isNaN(deMs) || deMs >= earliestRestockMs) {
        hasPriceDrop = true;
      }
    }
  }

  if (!hasDropEventsMetadata && product?.hasPriceDrop === true) {
    hasPriceDrop = true;
  }

  return {
    isNewDrop,
    isRestocked,
    hasPriceDrop,
    isSoldOut,
    restockedSizes: Array.from(restockedSizesSet),
    latestDropEventAt: latestDropMs > 0 ? new Date(latestDropMs).toISOString() : null,
  };
}
