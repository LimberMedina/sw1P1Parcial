import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RegisterSchema, type RegisterInput } from "../lib/zodSchemas";
import { api, getErrorMessage } from "../lib/api";
import { useAuth } from "../state/AuthContext";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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

export default function Register() {
  const { setAuth, /* opcional */ loginWithGoogle } = useAuth() as any;
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(RegisterSchema) });

  const onSubmit = async (values: RegisterInput) => {
    setServerError(null);
    try {
      // 1) Registrar
      await api.post("/users/register", values);
      // 2) Loguear automáticamente
      const { data } = await api.post("/auth/login", {
        email: values.email,
        password: values.password,
      });
      setAuth(data.access_token, data.user);
      navigate("/app");
    } catch (e) {
      setServerError(getErrorMessage(e));
    }
  };

  const onGoogle = async () => {
    try {
      if (typeof loginWithGoogle === "function") {
        await loginWithGoogle(); // si tu AuthContext lo expone
        return;
      }
      const base = import.meta.env.VITE_API_URL || "";
      const redirect = `${window.location.origin}/app`;
      const url = `${base.replace(
        /\/$/,
        ""
      )}/auth/google?redirect=${encodeURIComponent(redirect)}`;
      window.location.href = url;
    } catch (e) {
      setServerError(getErrorMessage(e));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur p-6 md:p-8">
          {/* Header */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-slate-900/90 text-white grid place-items-center shadow">
              <span className="text-lg font-semibold">UML</span>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">
              Crear cuenta
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Regístrate para empezar a diagramar.
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
            Registrarme con Google
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
                Nombre
              </label>
              <input
                {...register("name")}
                placeholder="Tu nombre"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition
                ${
                  errors.name
                    ? "border-rose-400 focus:ring-2 focus:ring-rose-200"
                    : "border-slate-300 focus:ring-2 focus:ring-slate-300"
                }`}
                autoComplete="name"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-rose-600">
                  {errors.name.message}
                </p>
              )}
            </div>

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
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Contraseña
              </label>
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
                  autoComplete="new-password"
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
              {isSubmitting ? "Creando…" : "Crear cuenta"}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-slate-600">
            ¿Ya tienes cuenta?{" "}
            <Link
              to="/login"
              className="font-medium text-slate-900 hover:underline"
            >
              Inicia sesión
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Al registrarte aceptas nuestros Términos y la Política de Privacidad.
        </p>
      </div>
    </div>
  );
}
