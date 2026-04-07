import { useEffect, useState } from "react";

import { fetchDocumentImagePreviewBlob, isHttpImageUrl } from "../../api/documentLinks.api";

type Props = {
  linkId: number;
  imageId: number;
  imageUrl: string;
  alt?: string;
  className?: string;
};

/**
 * Renders http(s) images directly; local paths load via authenticated preview (blob) because <img> cannot send Bearer.
 */
export default function DocumentLinkImagePreview({ linkId, imageId, imageUrl, alt = "", className }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = imageUrl?.trim() ?? "";
    if (!raw || isHttpImageUrl(raw)) {
      setBlobUrl(null);
      setError(false);
      setLoading(false);
      return;
    }

    let created: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setBlobUrl(null);

    void (async () => {
      try {
        const blob = await fetchDocumentImagePreviewBlob(linkId, imageId);
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setBlobUrl(created);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [linkId, imageId, imageUrl]);

  const raw = imageUrl?.trim() ?? "";
  if (!raw) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  if (isHttpImageUrl(raw)) {
    return <img src={raw} alt={alt} className={className} loading="lazy" />;
  }

  if (error) {
    return <span className="text-xs text-red-500">Không tải ảnh</span>;
  }

  if (loading || !blobUrl) {
    return <div className={`bg-gray-100 dark:bg-gray-800 animate-pulse rounded ${className ?? ""}`} />;
  }

  return <img src={blobUrl} alt={alt} className={className} loading="lazy" />;
}
