import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";
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
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8 -mt-18 ">
        <h1 className="text-3xl font-bold text-white-600 mb-2">
          Đăng nhập
        </h1>
        {/* <p className="text-white-800 text-sm">
          Đăng nhập để tiếp tục trải nghiệm
        </p> */}
      </div>

      {/* Form Card */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl mt-10">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          {err && (
            <div className="bg-red-500/20 border border-red-400/50 text-red-100 text-sm rounded-lg p-3">
              {err}
            </div>
          )}

          {/* Username Field */}
          <div className="space-y-2">
            <Label className="text-white/90 text-sm font-medium">
              Tên đăng nhập <span className="text-red-400">*</span>
            </Label>
            <Input
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
              className={`w-full h-12 px-4 text-gray-900 bg-white/95 border rounded-lg transition-all ${
                errors.username
                  ? "border-red-400 ring-2 ring-red-400/30"
                  : "border-white/30 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              }`}
            />
            {errors.username && (
              <p id="username-error" className="text-sm text-red-300">
                {errors.username}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <Label className="text-white/90 text-sm font-medium">
              Mật khẩu <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu"
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
                className={`w-full h-12 px-4 pr-12 text-gray-900 bg-white/95 border rounded-lg transition-all ${
                  errors.password
                    ? "border-red-400 ring-2 ring-red-400/30"
                    : "border-white/30 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? (
                  <EyeIcon className="fill-gray-500 size-5" />
                ) : (
                  <EyeCloseIcon className="fill-gray-500 size-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="text-sm text-red-300">
                {errors.password}
              </p>
            )}
          </div>

          {/* Remember & Forgot */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={remember}
                onChange={(e: React.ChangeEvent<HTMLInputElement> | boolean) => {
                  if (typeof e === "boolean") setRemember(e);
                  else setRemember(e.target.checked);
                }}
                className="w-4 h-4"
              />
              <span className="text-sm text-white/80">
                Ghi nhớ đăng nhập
              </span>
            </label>

            <Link
              to="/forgot-password"
              className="text-sm text-blue-300 hover:text-blue-200 transition-colors"
            >
              Quên mật khẩu?
            </Link>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
      </div>
    </div>
  );
}
