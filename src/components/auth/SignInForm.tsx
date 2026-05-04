import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EyeCloseIcon, EyeIcon } from "../../icons";
import { signIn, normalizeRoles, pickErrMsg, getUserAccount } from "../../api/auth.api";
import api from "../../api/client";
import toast from "react-hot-toast";
import { useNotification } from "../../context/NotificationContext";

type FormErrors = {
  username?: string | null;
  password?: string | null;
};

export default function SignInForm() {
  const navigate = useNavigate();
  const { clearNotifications, loadNotifications } = useNotification();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onChange =
    (k: "username" | "password") =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setForm((s) => ({ ...s, [k]: value }));
        setErrors((prev) => ({ ...prev, [k]: validateField(k, value) }));
      };

  const validateField = (
    k: "username" | "password",
    value: string
  ): string | null => {
    if (k === "username") {
      if (!value.trim()) return "Tên đăng nhập là bắt buộc";
      if (value.length < 6) return "Tên đăng nhập phải từ 6 ký tự";
      if (!/^[a-zA-Z0-9]+$/.test(value))
        return "Chỉ dùng chữ và số, không có khoảng trắng/ký tự đặc biệt";
      return null;
    }
    if (k === "password") {
      if (!value) return "Mật khẩu là bắt buộc";
      if (value.length < 8) return "Mật khẩu phải từ 8 ký tự";
      return null;
    }
    return null;
  };

  const validateForm = (): boolean => {
    const usernameErr = validateField("username", form.username);
    const passwordErr = validateField("password", form.password);
    const nextErrors: FormErrors = { username: usernameErr, password: passwordErr };
    setErrors(nextErrors);
    return !usernameErr && !passwordErr;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (!validateForm()) return;

    setLoading(true);
    try {
      clearNotifications();
      localStorage.removeItem("access_token");
      localStorage.removeItem("token");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("username");
      localStorage.removeItem("roles");
      localStorage.removeItem("user");
      localStorage.removeItem("userId");
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("accessToken");
      sessionStorage.removeItem("username");
      sessionStorage.removeItem("roles");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("userId");

      const data = await signIn({
        username: form.username.trim(),
        password: form.password,
      });

      const storage = remember ? localStorage : sessionStorage;
      storage.setItem("access_token", data.accessToken);
      storage.setItem("username", data.username);
      storage.setItem("roles", JSON.stringify(normalizeRoles(data.roles)));
      if (data.userId != null) storage.setItem("userId", String(data.userId));

      api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
      
      try {
        if (data.userId != null) {
          const profile = await getUserAccount(Number(data.userId));
          storage.setItem("user", JSON.stringify(profile));
          // console.log("User profile fetched and stored:", profile.team, profile.roles);
          await loadNotifications(20);
        }
      } catch (err) {
        // console.warn("Could not fetch user profile after sign-in:", err);
      }

      toast.success("Đăng nhập thành công!");
      
      const roles = normalizeRoles(data.roles);
      const isSuperAdmin = roles.some((role: string) => role === "SUPERADMIN" || role === "SUPER_ADMIN" || role === "Super Admin");
      
      if (isSuperAdmin) {
        navigate("/superadmin/home");
      } else {
        // Team triển khai: sau đăng nhập chuyển thẳng tới Thống kê triển khai
        const userJson = storage.getItem("user");
        let team: string | null = null;
        if (userJson) {
          try {
            const user = JSON.parse(userJson) as { team?: string };
            team = user?.team ? String(user.team).toUpperCase() : null;
          } catch {
            // ignore
          }
        }
        if (team === "DEPLOYMENT") {
          navigate("/deployment-dashboard");
        } else {
          navigate("/home");
        }
      }
    } catch (err: unknown) {
      const errorMsg = pickErrMsg(err);
      setErr(errorMsg);
      toast.error(errorMsg || "Đăng nhập thất bại!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* <Link to="/" className="inline-flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
          <div className="grid grid-cols-2 gap-0.5">
            <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />
            <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />
            <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />
            <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />
          </div>
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-900">ManagerTAG</span>
      </Link> */}

      <div className="mt-0 align-center text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Chào mừng trở lại
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Vui lòng nhập thông tin để truy cập hệ thống.
        </p>
      </div>

<form
  onSubmit={onSubmit}
  noValidate
  className="mt-10 space-y-6 rounded-3xl border border-white/35 bg-gradient-to-br from-white/20 via-white/10 to-blue-500/20 p-10 shadow-[0_12px_40px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
>
        {err && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </div>
        )}

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-black/85">
            Tên đăng nhập<span className="text-red-500">*</span>
          </label>
          <input
            placeholder="Nhập tên đăng nhập"
            value={form.username}
            onChange={onChange("username")}
            onBlur={() => {
              setErrors((prev: FormErrors) => ({
                ...prev,
                username: validateField("username", form.username),
              }));
            }}
            autoComplete="username"
            aria-invalid={!!errors.username}
            aria-describedby="username-error"
            className={`w-full rounded-2xl border py-3.5 px-5 text-base text-slate-800 placeholder:text-slate-400/90 shadow-inner backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-300/45 ${
              errors.username
                ? "border-red-300/70 bg-white/85 focus:border-red-300"
                : "border-white/35 bg-white/90 focus:border-blue-300"
            }`}
          />
          {errors.username && (
            <p id="username-error" className="mt-1.5 block text-xs font-medium text-red-700 dark:text-red-300">
              {errors.username}
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-black/85">
            Mật khẩu<span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={form.password}
              onChange={onChange("password")}
              onBlur={() => {
                setErrors((prev: FormErrors) => ({
                  ...prev,
                  password: validateField("password", form.password),
                }));
              }}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby="password-error"
              className={`w-full rounded-2xl border py-3.5 pl-5 pr-12 text-base text-slate-800 placeholder:text-slate-400/90 shadow-inner backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-300/45 ${
                errors.password
                  ? "border-red-300/70 bg-white/85 focus:border-red-300"
                  : "border-white/35 bg-white/90 focus:border-blue-300"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/70 hover:text-slate-700"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? (
                <EyeIcon className="fill-slate-500 size-5" />
              ) : (
                <EyeCloseIcon className="fill-slate-500 size-5" />
              )}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="mt-1.5 block text-xs font-medium text-red-700 dark:text-red-300">
              {errors.password}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-black/90">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemember(e.target.checked)}
              className="h-5 w-5 rounded-md border-white/45 bg-white/10 text-blue-500 focus:ring-blue-300/50"
            />
            <span>Ghi nhớ đăng nhập</span>
          </label>

          <Link to="/forgot-password" className="text-sm font-semibold text-sky-500 transition-colors hover:text-sky-300 hover:underline">
            Quên mật khẩu?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 py-3.5 text-xl font-bold text-white shadow-[0_10px_30px_rgba(37,99,235,0.45)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
