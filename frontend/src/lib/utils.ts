import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AllocationMethod, ListingFurnishing, ListingTenureType } from "../api/models";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Treat date-only strings as local dates so they do not shift a day in negative timezones.
export function parseDateValue(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDateTimestamp(value: Date | string | null | undefined) {
  return parseDateValue(value)?.getTime() ?? null;
}

// 12 -> "12th"
export function numberWithSuffix(x: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = Math.abs(x) % 100;
  return x + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

export function formatDuration(durationMs: number, indicateRelative = true): string {
  // If indicateRelative is true, return string like "just now", "5 minutes ago", "2 hours ago", "3
  // days ago"

  if (indicateRelative && durationMs < 60 * 1000) {
    return "just now";
  }

  const suffix = indicateRelative ? " ago" : "";

  if (durationMs < 60 * 60 * 1000) {
    const minutes = Math.floor(durationMs / (60 * 1000));
    return `${minutes} minute${minutes > 1 ? "s" : ""} ${suffix}`;
  }
  if (durationMs < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(durationMs / (60 * 60 * 1000));
    return `${hours} hour${hours > 1 ? "s" : ""} ${suffix}`;
  }
  if (durationMs < 30 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(durationMs / (24 * 60 * 60 * 1000));
    return `${days} day${days > 1 ? "s" : ""} ${suffix}`;
  }
  if (durationMs < 365 * 24 * 60 * 60 * 1000) {
    const months = Math.floor(durationMs / (30 * 24 * 60 * 60 * 1000));
    return `${months} month${months > 1 ? "s" : ""} ${suffix}`;
  }
  const years = Math.floor(durationMs / (365 * 24 * 60 * 60 * 1000));
  const months = Math.floor(durationMs / (30 * 24 * 60 * 60 * 1000));
  return `${years} year${years > 1 ? "s" : ""} ${months > 0 ? `${months} month${months > 1 ? "s" : ""} ` : ""}${suffix}`;
}

export function formatUpdatedAt(updatedAt: string | null) {
  if (!updatedAt) return null;
  const parsedUpdatedAt = new Date(updatedAt).getTime();
  if (Number.isNaN(parsedUpdatedAt)) return null;
  const timeDelta = Date.now() - parsedUpdatedAt;
  return formatDuration(timeDelta);
}

export function formatShortDate(value: Date | string | null | undefined) {
  const parsed = parseDateValue(value);
  if (!parsed) return null;

  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatLeaseStartLabel(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value === "asap") return "ASAP";
  return formatShortDate(value);
}

export function formatLeaseEndLabel(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value === "indefinite") return "Indef.";
  return formatShortDate(value);
}

export function formatAllocationMethodLabel(value: AllocationMethod | null | undefined) {
  switch (value) {
    case "queue_points":
      return "Queue";
    case "application_date":
      return "Apply date";
    case "manual_request":
      return "Request";
    case "random":
      return "Random";
    case "unknown":
      return "Unknown";
    default:
      return null;
  }
}

export function formatFurnishingLabel(value: ListingFurnishing | null | undefined) {
  switch (value) {
    case "full":
      return "Furnished";
    case "partial":
      return "Part-furn.";
    case "none":
      return "Unfurnished";
    default:
      return value;
  }
}

export function formatTenureTypeLabel(value: ListingTenureType | null | undefined) {
  switch (value) {
    case "first_hand":
      return "1st hand";
    case "second_hand_private":
      return "2nd hand";
    case "second_hand_shared":
      return "Shared";
    default:
      return value;
  }
}
