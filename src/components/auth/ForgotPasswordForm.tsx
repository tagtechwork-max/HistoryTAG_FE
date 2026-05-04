import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Button from "../ui/button/Button";
import { forgotPassword, pickErrMsg, pickFieldErrors } from "../../api/auth.api";
import toast from "react-hot-toast";

export default function ForgotPasswordForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  const validateEmail = (value: string): string | null => {
    if (!value.trim()) return "Email không được để trống";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return "Email không hợp lệ";
    return null;
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (fieldErr.email) setFieldErr((prev) => ({ ...prev, email: "" }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setFieldErr({});

    const emailError = validateEmail(email);
    if (emailError) {
      setFieldErr({ email: emailError });
      setErr("Vui lòng kiểm tra lại email đã nhập.");
      return;
    }

    setLoading(true);
    try {
      await forgotPassword({ email: email.trim() });
      toast.success("Email khôi phục mật khẩu đã được gửi!");
      navigate("/reset-password");
    } catch (ex: unknown) {
      const e = ex as any;
      const fe = pickFieldErrors(e);
      const errorMsg = pickErrMsg(e);
      if (Object.keys(fe).length) setFieldErr(fe);
      setErr(errorMsg);
      toast.error(errorMsg || "Gửi email thất bại!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          Quên mật khẩu
        </h1>
        <p className="text-black-100 text-sm">
          Nhập email của bạn để nhận link đặt lại mật khẩu
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

          {/* Email Field */}
          <div className="space-y-2">
            <Label className="text-black/90 text-sm font-medium">
              Email <span className="text-red-400">*</span>
            </Label>
            <Input
              type="email"
              placeholder="Nhập email của bạn"
              value={email}
              onChange={onChange}
              onBlur={() => {
                setFieldErr((prev) => ({
                  ...prev,
                  email: validateEmail(email) || "",
                }));
              }}
              autoComplete="email"
              aria-invalid={!!fieldErr.email}
              aria-describedby="email-error"
              className={`w-full h-12 px-4 text-gray-900 bg-white/95 border rounded-lg transition-all ${
                fieldErr.email
                  ? "border-red-400 ring-2 ring-red-400/30"
                  : "border-white/30 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              }`}
            />
            {fieldErr.email && (
              <p id="email-error" className="text-sm text-red-300">
                {fieldErr.email}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
            type="submit"
          >
            {loading ? "Đang gửi..." : "Gửi email khôi phục"}
          </Button>
        </form>
      </div>

      {/* Back to login */}
      <div className="mt-5 text-center">
        <Link
          to="/signin"
          className="text-sm text-blue-300 hover:text-blue-200 transition-colors"
        >
          ← Quay lại đăng nhập
        </Link>
      </div>
    </div>
  );
}
