import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowRight, FiEye, FiEyeOff, FiLock, FiUser } from "react-icons/fi";
import { signIn, normalizeRoles, pickErrMsg, getUserAccount } from "../../api/auth.api";
import { AUTH_TOKEN_REFRESHED_EVENT, persistAccessToken } from "../../api/client";
import toast from "react-hot-toast";

type FormErrors = {
  username?: string | null;
  password?: string | null;
};

export default function SignInForm() {
  const navigate = useNavigate();
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
      persistAccessToken(data.accessToken, storage);
      storage.setItem("username", data.username);
      storage.setItem("roles", JSON.stringify(normalizeRoles(data.roles)));
      if (data.userId != null) storage.setItem("userId", String(data.userId));

      
      toast.success("Đăng nhập thành công!");
      
      const roles = normalizeRoles(data.roles);
      const isSuperAdmin = roles.some((role: string) => role === "SUPERADMIN" || role === "SUPER_ADMIN" || role === "Super Admin");
      const notifyAuthReady = () => {
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent(AUTH_TOKEN_REFRESHED_EVENT, {
              detail: { accessToken: data.accessToken },
            })
          );
        }, 100);
      };
      const loadPostLoginData = () => {
        window.setTimeout(() => {
          if (data.userId != null) {
            void getUserAccount(Number(data.userId))
              .then((profile) => {
                storage.setItem("user", JSON.stringify(profile));
              })
              .catch(() => {
                // Profile is not critical for entering the app.
              });
          }
        }, 1500);
      };
      
      if (isSuperAdmin) {
        loadPostLoginData();
        navigate("/superadmin/home");
        notifyAuthReady();
      } else {
        // Team triển khai: sau đăng nhập chuyển thẳng tới Thống kê triển khai
        let team: string | null = null;
        try {
          if (data.userId != null) {
            const user = await getUserAccount(Number(data.userId));
            storage.setItem("user", JSON.stringify(user));
            team = user?.team ? String(user.team).toUpperCase() : null;
          }
        } catch {
          // ignore
        }
        if (team === "DEPLOYMENT") {
          navigate("/deployment-dashboard");
          notifyAuthReady();
        } else {
          navigate("/home");
          notifyAuthReady();
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
    <div className="sign-in-card">
      <div className="text-center">
        <img src="/images/logo/logo.png" alt="TAG Technology Group" width={500} height={253} className="mx-auto -mt-4 w-48 sm:w-56" />
        <h1 className="text-2xl font-extrabold tracking-tight text-[#102650] sm:text-3xl">
          Đăng nhập hệ thống
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
          Vui lòng nhập thông tin tài khoản để tiếp tục
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-7 space-y-5">
        {err && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {err}
          </div>
        )}

        <div>
          <label htmlFor="sign-in-username" className="sr-only">Tên đăng nhập</label>
          <div className="relative">
            <FiUser className="sign-in-field-icon" aria-hidden="true" />
            <input
              id="sign-in-username"
              placeholder="Tên đăng nhập"
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
              aria-describedby={errors.username ? "username-error" : undefined}
              className="sign-in-field"
            />
          </div>
          {errors.username && (
            <p id="username-error" className="mt-1.5 block text-xs font-medium text-red-700">
              {errors.username}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="sign-in-password" className="sr-only">Mật khẩu</label>
          <div className="relative">
            <FiLock className="sign-in-field-icon" aria-hidden="true" />
            <input
              id="sign-in-password"
              type={showPassword ? "text" : "password"}
              placeholder="Mật khẩu"
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
              aria-describedby={errors.password ? "password-error" : undefined}
              className="sign-in-field sign-in-field-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-500 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? (
                <FiEye size={20} aria-hidden="true" />
              ) : (
                <FiEyeOff size={20} aria-hidden="true" />
              )}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="mt-1.5 block text-xs font-medium text-red-700">
              {errors.password}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-[#102650]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemember(e.target.checked)}
              className="size-5 accent-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            />
            <span>Ghi nhớ đăng nhập</span>
          </label>

          <Link to="/forgot-password" className="text-sm font-medium text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
            Quên mật khẩu?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="sign-in-submit"
        >
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          {!loading && <FiArrowRight size={23} aria-hidden="true" />}
        </button>
      </form>
    </div>
  );
}
