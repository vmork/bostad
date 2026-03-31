import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
