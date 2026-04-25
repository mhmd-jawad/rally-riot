import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse a UTC datetime string from the API (which has no timezone suffix) as UTC. */
export function parseUTC(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  return new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
}
