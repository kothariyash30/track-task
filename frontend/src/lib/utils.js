import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// hours_logged is stored as a decimal (e.g. 3.5), but "3.5h" reads as 3 hours 5 minutes
// to most people rather than 3 hours 30 minutes — spell out hours and minutes instead.
export function formatHoursMinutes(hoursDecimal) {
  const totalMinutes = Math.round(Number(hoursDecimal || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
