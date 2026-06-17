export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string
          name: string
          email: string
          role: 'admin' | 'employee'
          qualification: 'shop' | 'post' | 'both'
          target_hours: number
          availability: Json
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          role?: 'admin' | 'employee'
          qualification?: 'shop' | 'post' | 'both'
          target_hours?: number
          availability?: Json
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          role?: 'admin' | 'employee'
          qualification?: 'shop' | 'post' | 'both'
          target_hours?: number
          availability?: Json
          active?: boolean
          created_at?: string
        }
      }
      blocker_days: {
        Row: {
          id: string
          employee_id: string
          date: string
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          date: string
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          date?: string
          reason?: string | null
          created_at?: string
        }
      }
      shifts: {
        Row: {
          id: string
          date: string
          shift_type: 'morning' | 'afternoon' | 'saturday'
          area: 'shop' | 'post'
          employee_id: string | null
          schedule_id: string
          is_open: boolean
          created_at: string
        }
        Insert: {
          id?: string
          date: string
          shift_type: 'morning' | 'afternoon' | 'saturday'
          area: 'shop' | 'post'
          employee_id?: string | null
          schedule_id: string
          is_open?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          date?: string
          shift_type?: 'morning' | 'afternoon' | 'saturday'
          area?: 'shop' | 'post'
          employee_id?: string | null
          schedule_id?: string
          is_open?: boolean
          created_at?: string
        }
      }
      schedules: {
        Row: {
          id: string
          month: string
          status: 'draft' | 'published'
          published_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          month: string
          status?: 'draft' | 'published'
          published_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          month?: string
          status?: 'draft' | 'published'
          published_at?: string | null
          created_at?: string
        }
      }
    }
  }
}