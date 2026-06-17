import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = []
  const date = new Date(year, month, 1)
  while (date.getMonth() === month) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

export function getDayName(date: Date): string {
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  return days[date.getDay()]
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

export function isSaturday(date: Date): boolean {
  return date.getDay() === 6
}

export function getShiftHours(shiftType: string): string {
  switch (shiftType) {
    case 'morning': return '09:00–14:00'
    case 'afternoon': return '14:00–19:00'
    case 'saturday': return '09:00–15:00'
    default: return ''
  }
}