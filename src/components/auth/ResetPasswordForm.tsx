import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Button from "../ui/button/Button";
import { resetPassword, pickErrMsg, pickFieldErrors } from "../../api/auth.api";
import toast from "react-hot-toast";

export default function ResetPasswordForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    token: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const tokenFromUrl = searchParams.get("token");
    if (tokenFromUrl) {
      setForm((prev) => ({ ...prev, token: tokenFromUrl }));
    }
  }, [searchParams]);

  const validate = () => {
    const errors: Record<string, string> = {};

    if (!form.token.trim()) {
      errors.token = "Mã xác nhận không được để trống";
    }

    if (!form.newPassword) {
      errors.newPassword = "Mật khẩu mới không được để trống";
    } else if (form.newPassword.length < 8) {
      errors.newPassword = "Mật khẩu phải có ít nhất 8 ký tự";
    }

    if (!form.confirmPassword) {
      errors.confirmPassword = "Xác nhận mật khẩu không được để trống";
    } else if (form.newPassword !== form.confirmPassword) {
      errors.confirmPassword = "Mật khẩu không khớp";
    }

    return errors;
  };

  const onChange =
    (key: "token" | "newPassword" | "confirmPassword") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
      if (fieldErr[key]) setFieldErr((prev) => ({ ...prev, [key]: "" }));
    };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setFieldErr({});

    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErr(errors);
      setErr("Vui lòng kiểm tra lại thông tin đã nhập.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword({
        token: form.token.trim(),
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
      });
      toast.success("Đặt lại mật khẩu thành công!");
      setSuccess(true);
      setTimeout(() => {
        navigate("/signin");
      }, 1500);
    } catch (ex: unknown) {
      const e = ex as any;
      const fe = pickFieldErrors(e);
      const errorMsg = pickErrMsg(e);
      if (Object.keys(fe).length) setFieldErr(fe);
      setErr(errorMsg);
      toast.error(errorMsg || "Đặt lại mật khẩu thất bại!");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (hasError: boolean) =>
    `w-full h-12 px-4 text-gray-900 bg-white/95 border rounded-lg transition-all ${
      hasError
        ? "border-red-400 ring-2 ring-red-400/30"
        : "border-white/30 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
    }`;

  if (success) {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-10 shadow-2xl">
          <div className="flex justify-center mb-4">
            <svg className="w-16 h-16 text-green-400" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="25" stroke="currentColor" strokeWidth="2" />
              <path d="M14 27l7 7 17-17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Thành công!</h2>
          <p className="text-blue-100 text-sm">Đang chuyển về trang đăng nhập...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          Đặt lại mật khẩu
        </h1>
        <p className="text-blue-100 text-sm">
          Nhập mật khẩu mới của bạn
        </p>
      </div>

      {/* Form Card */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
              {err}
            </div>
          )}

          {/* Token Field */}
          <div className="space-y-2">
            <Label className="text-white/90 text-sm font-medium">
              Mã xác nhận <span className="text-red-400">*</span>
            </Label>
            <Input
              placeholder="Nhập mã xác nhận"
              value={form.token}
              onChange={onChange("token")}
              aria-invalid={!!fieldErr.token}
              aria-describedby="token-error"
              className={inputClass(!!fieldErr.token)}
            />
            {fieldErr.token && (
              <p id="token-error" className="text-sm text-red-300">
                {fieldErr.token}
              </p>
            )}
          </div>

          {/* New Password Field */}
          <div className="space-y-2">
            <Label className="text-white/90 text-sm font-medium">
              Mật khẩu mới <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu mới"
                value={form.newPassword}
                onChange={onChange("newPassword")}
                autoComplete="new-password"
                aria-invalid={!!fieldErr.newPassword}
                aria-describedby="password-error"
                className={`${inputClass(!!fieldErr.newPassword)} pr-12`}
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
            {fieldErr.newPassword && (
              <p id="password-error" className="text-sm text-red-300">
                {fieldErr.newPassword}
              </p>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-2">
            <Label className="text-white/90 text-sm font-medium">
              Xác nhận mật khẩu <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Nhập lại mật khẩu mới"
                value={form.confirmPassword}
                onChange={onChange("confirmPassword")}
                autoComplete="new-password"
                aria-invalid={!!fieldErr.confirmPassword}
                aria-describedby="confirm-password-error"
                className={`${inputClass(!!fieldErr.confirmPassword)} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showConfirmPassword ? (
                  <EyeIcon className="fill-gray-500 size-5" />
                ) : (
                  <EyeCloseIcon className="fill-gray-500 size-5" />
                )}
              </button>
            </div>
            {fieldErr.confirmPassword && (
              <p id="confirm-password-error" className="text-sm text-red-300">
                {fieldErr.confirmPassword}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
            type="submit"
          >
            {loading ? "Đang xử lý..." : "Đặt lại mật khẩu"}
          </Button>
        </form>
      </div>

      {/* Back to login */}
      <div className="mt-5 text-center">
        <button
          onClick={() => navigate("/signin")}
          className="text-sm text-blue-300 hover:text-blue-200 transition-colors"
        >
          ← Quay lại đăng nhập
        </button>
      </div>
    </div>
  );
}
