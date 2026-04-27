import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse API datetimes as club-local wall time unless they include an explicit timezone. */
export function parseUTC(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  return new Date(dateStr);
}
