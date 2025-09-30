// src/pages/Login.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginInput } from "../lib/zodSchemas";
import { useAuth } from "../state/AuthContext";
import { useState } from "react";
import { getErrorMessage } from "../lib/api";
import { Link, useNavigate, useLocation } from "react-router-dom";

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 11v3.8h5.4c-.2 1.4-1.6 4-5.4 4-3.2 0-5.8-2.7-5.8-6s2.6-6 5.8-6c1.8 0 3 .7 3.7 1.3l2.5-2.4C16.8 4 14.6 3 12 3 6.9 3 2.8 7 2.8 12s4.1 9 9.2 9c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1-.2-1.4H12z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function Login() {
  const { login, /* opcional */ loginWithGoogle } = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();

  const [serverError, setServerError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  // Resuelve a dónde enviar tras login (editor si viene de ahí)
  function getPostLoginRedirect(): string {
    const params = new URLSearchParams(location.search);

    // ?from=editor&project=<id>&share=<token?>
    if (params.get("from") === "editor") {
      const pid =
        params.get("project") || params.get("pid") || params.get("id");
      const share = params.get("share");
      if (pid) {
        return `/project/${pid}${
          share ? `?share=${encodeURIComponent(share)}` : ""
        }`;
      }
    }

    // ?next=/ruta... o ?redirect=/ruta...
    const qpNext = params.get("next") || params.get("redirect");
    if (qpNext && qpNext.startsWith("/")) return qpNext;

    // location.state.from pasado por navigate
    const st: any = (location as any).state;
    if (st?.from && typeof st.from === "string" && st.from.startsWith("/")) {
      return st.from;
    }

    // sessionStorage (opcional si lo guardaste antes de /login)
    try {
      const ss = sessionStorage.getItem("postLoginRedirect");
      if (ss && ss.startsWith("/")) return ss;
    } catch {}

    // fallback
    return "/app";
  }

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate(getPostLoginRedirect(), { replace: true });
    } catch (e) {
      setServerError(getErrorMessage(e));
    }
  };

  const onGoogle = async () => {
    try {
      // Si tu AuthContext lo soporta, pásale el destino
      if (typeof loginWithGoogle === "function") {
        await loginWithGoogle(getPostLoginRedirect());
        return;
      }
      // Fallback: OAuth del backend con redirect completo
      const base = (import.meta as any).env?.VITE_API_URL || "";
      const redirectPath = getPostLoginRedirect();
      const redirectAbs = `${window.location.origin}${redirectPath}`;
      const url = `${String(base).replace(
        /\/$/,
        ""
      )}/auth/google?redirect=${encodeURIComponent(redirectAbs)}`;
      window.location.href = url;
    } catch (e) {
      setServerError(getErrorMessage(e));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur p-6 md:p-8">
          {/* Header */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-slate-900/90 text-white grid place-items-center shadow">
              <span className="text-lg font-semibold">UML</span>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">
              Iniciar sesión
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Ingresa con tu correo o usa tu cuenta de Google.
            </p>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={onGoogle}
            className="group mb-5 inline-flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400/50 disabled:opacity-60"
            disabled={isSubmitting}
          >
            <GoogleIcon className="h-5 w-5 text-slate-700 group-hover:scale-105 transition" />
            Continuar con Google
          </button>

          {/* Divider */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-slate-500">
                o con email
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                {...register("email")}
                placeholder="tucorreo@ejemplo.com"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition
                ${
                  errors.email
                    ? "border-rose-400 focus:ring-2 focus:ring-rose-200"
                    : "border-slate-300 focus:ring-2 focus:ring-slate-300"
                }`}
                autoComplete="email"
                inputMode="email"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-rose-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                <Link
                  to="/reset-password"
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              <div
                className={`relative flex items-stretch rounded-xl border ${
                  errors.password ? "border-rose-400" : "border-slate-300"
                }`}
              >
                <input
                  type={showPass ? "text" : "password"}
                  {...register("password")}
                  placeholder="••••••••"
                  className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-300"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  aria-label={
                    showPass ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPass ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              {errors.password && (
                <p className="mt-1 text-xs text-rose-600">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Server error */}
            {serverError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {serverError}
              </div>
            )}

            {/* Submit */}
            <button
              disabled={isSubmitting}
              className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400/50 disabled:opacity-60"
            >
              {isSubmitting ? "Ingresando…" : "Entrar"}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-slate-600">
            ¿No tienes cuenta?{" "}
            <Link
              to="/register"
              className="font-medium text-slate-900 hover:underline"
            >
              Regístrate
            </Link>
          </p>
        </div>

        {/* Nota de seguridad / copy */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Al continuar aceptas nuestros Términos y la Política de Privacidad.
        </p>
      </div>
    </div>
  );
}
