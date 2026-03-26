import { useMemo, useState } from "react";
import CryptoJS from "crypto-js";
import PageMeta from "../../components/common/PageMeta";

type HashAlgorithm = "SHA-256" | "SHA-1" | "SHA-512" | "MD5";
type MacFormat = "hex" | "base64";

function computeHmac(algorithm: HashAlgorithm, plainText: string, secretKey: string): CryptoJS.lib.WordArray {
  switch (algorithm) {
    case "SHA-1":
      return CryptoJS.HmacSHA1(plainText, secretKey);
    case "SHA-512":
      return CryptoJS.HmacSHA512(plainText, secretKey);
    case "MD5":
      return CryptoJS.HmacMD5(plainText, secretKey);
    case "SHA-256":
    default:
      return CryptoJS.HmacSHA256(plainText, secretKey);
  }
}

function toMacString(wordArray: CryptoJS.lib.WordArray, format: MacFormat): string {
  return format === "base64"
    ? CryptoJS.enc.Base64.stringify(wordArray)
    : wordArray.toString(CryptoJS.enc.Hex);
}

export default function ToolEncryption() {
  const [generatePlainText, setGeneratePlainText] = useState("");
  const [generateSecretKey, setGenerateSecretKey] = useState("");
  const [generateAlgo, setGenerateAlgo] = useState<HashAlgorithm>("SHA-256");
  const [generateFormat, setGenerateFormat] = useState<MacFormat>("hex");
  const [generatedMac, setGeneratedMac] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [verifyPlainText, setVerifyPlainText] = useState("");
  const [verifySecretKey, setVerifySecretKey] = useState("");
  const [verifyAlgo, setVerifyAlgo] = useState<HashAlgorithm>("SHA-256");
  const [verifyProvidedMac, setVerifyProvidedMac] = useState("");
  const [verifyResult, setVerifyResult] = useState<"idle" | "success" | "failed">("idle");

  const [quickHashInput, setQuickHashInput] = useState("");

  const quickMd5 = useMemo(() => {
    if (!quickHashInput) return "";
    return CryptoJS.MD5(quickHashInput).toString(CryptoJS.enc.Hex);
  }, [quickHashInput]);

  const quickSha256 = useMemo(() => {
    if (!quickHashInput) return "";
    return CryptoJS.SHA256(quickHashInput).toString(CryptoJS.enc.Hex);
  }, [quickHashInput]);

  const handleCopy = (value: string) => {
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {
        // ignore copy error
      });
    }
  };

  const handleGenerateMac = () => {
    setGenerateError(null);
    setGeneratedMac("");
    if (!generatePlainText.trim()) {
      setGenerateError("Vui lòng nhập plain text để tạo MAC.");
      return;
    }
    if (!generateSecretKey.trim()) {
      setGenerateError("Vui lòng nhập secret key.");
      return;
    }
    try {
      const mac = computeHmac(generateAlgo, generatePlainText, generateSecretKey);
      setGeneratedMac(toMacString(mac, generateFormat));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Không thể tạo HMAC";
      setGenerateError(message);
    }
  };

  const handleVerifyMac = () => {
    setVerifyResult("idle");
    if (!verifyPlainText.trim() || !verifySecretKey.trim() || !verifyProvidedMac.trim()) {
      setVerifyResult("failed");
      return;
    }

    try {
      const expected = toMacString(computeHmac(verifyAlgo, verifyPlainText, verifySecretKey), "hex").trim().toLowerCase();
      const provided = verifyProvidedMac.trim().toLowerCase();
      setVerifyResult(expected === provided ? "success" : "failed");
    } catch {
      setVerifyResult("failed");
    }
  };

  return (
    <>
      <PageMeta
        title="Tool Encryption"
        description="Generate and verify HMAC, plus quick hash utilities."
      />
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Tool Encryption</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Tạo và xác thực HMAC cho payload nhanh, đồng thời hỗ trợ hash nhanh MD5/SHA-256.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Generate HMAC</h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enter Plain Text to Compute Hash
                  </label>
                  <textarea
                    value={generatePlainText}
                    onChange={(e) => setGeneratePlainText(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enter the Secret Key
                  </label>
                  <textarea
                    value={generateSecretKey}
                    onChange={(e) => setGenerateSecretKey(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select Cryptographic Hash Function
                  </label>
                  <select
                    value={generateAlgo}
                    onChange={(e) => setGenerateAlgo(e.target.value as HashAlgorithm)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  >
                    <option value="SHA-256">SHA-256</option>
                    <option value="SHA-1">SHA-1</option>
                    <option value="SHA-512">SHA-512</option>
                    <option value="MD5">MD5</option>
                  </select>
                </div>
                <div>
                  <p className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Output MAC Format</p>
                  <div className="flex items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="mac-format"
                        checked={generateFormat === "hex"}
                        onChange={() => setGenerateFormat("hex")}
                      />
                      Hex
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="mac-format"
                        checked={generateFormat === "base64"}
                        onChange={() => setGenerateFormat("base64")}
                      />
                      Base64
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateMac}
                  className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  Generate MAC
                </button>
                {generateError ? <p className="text-xs text-red-500">{generateError}</p> : null}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">HMAC Result:</p>
                    <button
                      type="button"
                      onClick={() => handleCopy(generatedMac)}
                      disabled={!generatedMac}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="min-h-[84px] break-all rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                    {generatedMac || "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Verify HMAC</h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enter Plain Text Used for HMAC
                  </label>
                  <textarea
                    value={verifyPlainText}
                    onChange={(e) => setVerifyPlainText(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enter Secret Key
                  </label>
                  <textarea
                    value={verifySecretKey}
                    onChange={(e) => setVerifySecretKey(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select Cryptographic Hash Function
                  </label>
                  <select
                    value={verifyAlgo}
                    onChange={(e) => setVerifyAlgo(e.target.value as HashAlgorithm)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  >
                    <option value="SHA-256">SHA-256</option>
                    <option value="SHA-1">SHA-1</option>
                    <option value="SHA-512">SHA-512</option>
                    <option value="MD5">MD5</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enter Provided MAC (Hex)
                  </label>
                  <textarea
                    value={verifyProvidedMac}
                    onChange={(e) => setVerifyProvidedMac(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleVerifyMac}
                  className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  Verify MAC
                </button>
                <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800">
                  {verifyResult === "idle" && <span className="text-gray-500 dark:text-gray-400">Chưa kiểm tra</span>}
                  {verifyResult === "success" && <span className="font-medium text-green-600 dark:text-green-400">MAC hợp lệ</span>}
                  {verifyResult === "failed" && <span className="font-medium text-red-600 dark:text-red-400">MAC không hợp lệ</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Quick Hash (MD5 / SHA-256)</h2>
            <textarea
              value={quickHashInput}
              onChange={(e) => setQuickHashInput(e.target.value)}
              rows={2}
              className="mb-4 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              placeholder="Nhập text để tạo hash..."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">MD5</p>
                  <button
                    type="button"
                    onClick={() => handleCopy(quickMd5)}
                    disabled={!quickMd5}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Copy
                  </button>
                </div>
                <div className="min-h-[56px] break-all rounded-lg bg-gray-50 px-2 py-1.5 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                  {quickMd5 || "—"}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">SHA-256</p>
                  <button
                    type="button"
                    onClick={() => handleCopy(quickSha256)}
                    disabled={!quickSha256}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Copy
                  </button>
                </div>
                <div className="min-h-[56px] break-all rounded-lg bg-gray-50 px-2 py-1.5 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                  {quickSha256 || "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

