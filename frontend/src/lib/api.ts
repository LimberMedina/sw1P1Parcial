// src/lib/api.ts
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api", // ✅ fallback al proxy de Vite
  withCredentials: false,
});

export type ApiError = { message?: string; error?: string };

export const getErrorMessage = (e: unknown) => {
  if (axios.isAxiosError(e)) {
    return (
      (e.response?.data as ApiError)?.message ||
      (e.response?.data as ApiError)?.error ||
      e.message
    );
  }
  return "Error inesperado";
};
