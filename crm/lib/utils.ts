import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Helper cho shadcn/ui — gộp className conditional + dedupe Tailwind classes */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
