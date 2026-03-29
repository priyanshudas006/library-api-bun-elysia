
export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "admin" | "member";
  phone?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserPayload {
  id: string;
  email: string;
  role: "admin" | "member";
}

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  genre?: string;
  publisher?: string;
  published_year?: number;
  total_copies: number;
  available_copies: number;
  created_at: Date;
  updated_at: Date;
}

export interface BorrowRecord {
  id: string;
  user_id: string;
  book_id: string;
  borrowed_at: Date;
  due_date: Date;
  returned_at?: Date;
  status: "borrowed" | "returned" | "overdue";
  created_at: Date;
}

export interface Fine {
  id: string;
  borrow_record_id: string;
  user_id: string;
  amount: number;
  days_overdue: number;
  is_paid: boolean;
  paid_at?: Date;
  created_at: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}