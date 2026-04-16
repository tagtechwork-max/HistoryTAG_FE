import React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <div className="relative hidden min-h-[280px] flex-1 lg:block lg:min-h-screen">
          <img
            src="/backlogin.png"
            alt="ManagerTAG hero background"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/45 to-cyan-950/30" />
          <div className="absolute inset-0 flex flex-col justify-end p-10 xl:p-14">
            <h2 className="max-w-lg text-3xl font-bold leading-tight text-white xl:text-4xl">
              Atmospheric Precision.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/85">
              Kiến tạo không gian làm việc chuyên nghiệp với nền tảng quản trị thông minh ManagerTAG
              Enterprise.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
