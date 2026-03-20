import { useEffect, useState } from "react";
import CryptoJS from "crypto-js";
import PageMeta from "../../components/common/PageMeta";

export default function ToolEncryption() {
  const [input, setInput] = useState("");
  const [md5, setMd5] = useState("");
  const [sha256, setSha256] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!input) {
      setMd5("");
      setSha256("");
      return;
    }
    try {
      const md5Hash = CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
      const shaHash = CryptoJS.SHA256(input).toString(CryptoJS.enc.Hex);
      setMd5(md5Hash);
      setSha256(shaHash);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Không thể tạo hash";
      setError(message);
      setMd5("");
      setSha256("");
    }
  }, [input]);

  const handleCopy = (value: string) => {
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {
        // ignore copy error
      });
    }
  };

  return (
    <>
      <PageMeta
        title="Tool mã hóa"
        description="Công cụ mã hóa nhanh chuỗi văn bản sang MD5 và SHA-256 trong hệ thống TAG."
      />
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Tool mã hóa</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Nhập nội dung cần mã hóa, hệ thống sẽ sinh ra giá trị MD5 và SHA-256 tương ứng.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nội dung cần mã hóa
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              placeholder="Nhập text cần mã hóa..."
            />
            {error && (
              <p className="mt-2 text-xs text-red-500">
                {error}
              </p>
            )}
            {/* <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Mã hóa được cập nhật tự động mỗi khi bạn thay đổi nội dung.
            </p> */}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">MD5</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">128-bit hash</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(md5)}
                  disabled={!md5}
                  className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Sao chép
                </button>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-100 break-all min-h-[2.5rem]">
                {md5 || "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">SHA-256</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">256-bit hash</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(sha256)}
                  disabled={!sha256}
                  className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Sao chép
                </button>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-100 break-all min-h-[2.5rem]">
                {sha256 || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

