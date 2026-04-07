import api from "./client";

export type DocumentLinkImageResponseDTO = {
  id: number;
  imageUrl: string;
  sortOrder: number;
  createdAt?: string | null;
};

export type DocumentLinkDetailDTO = {
  id: number;
  title: string;
  url: string;
  note?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  images: DocumentLinkImageResponseDTO[];
};

export type DocumentLinkListItemDTO = {
  id: number;
  title: string;
  url: string;
  note?: string | null;
  imageCount: number;
  firstImageUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  images?: DocumentLinkImageResponseDTO[] | null;
};

export type SpringPage<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
};

export type DocumentLinkImageInput = {
  imageUrl: string;
  sortOrder?: number | null;
};

export async function fetchDocumentLinks(params: {
  title?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: string;
  embedImages?: boolean;
}): Promise<SpringPage<DocumentLinkListItemDTO>> {
  const { data } = await api.get<SpringPage<DocumentLinkListItemDTO>>("/api/v1/document-links", {
    params: {
      title: params.title?.trim() || undefined,
      page: params.page ?? 0,
      size: params.size ?? 20,
      sortBy: params.sortBy ?? "createdAt",
      sortDir: params.sortDir ?? "desc",
      embedImages: params.embedImages ?? false,
    },
  });
  return data;
}

export async function getDocumentLink(id: number): Promise<DocumentLinkDetailDTO> {
  const { data } = await api.get<DocumentLinkDetailDTO>(`/api/v1/document-links/${id}`);
  return data;
}

export async function createDocumentLink(body: {
  title: string;
  url: string;
  note?: string | null;
  images?: DocumentLinkImageInput[];
}): Promise<DocumentLinkDetailDTO> {
  const { data } = await api.post<DocumentLinkDetailDTO>("/api/v1/document-links", body);
  return data;
}

export async function updateDocumentLink(
  id: number,
  body: Partial<{
    title: string | null;
    url: string | null;
    note: string | null;
    images: DocumentLinkImageInput[] | null;
  }>,
): Promise<DocumentLinkDetailDTO> {
  const { data } = await api.patch<DocumentLinkDetailDTO>(`/api/v1/document-links/${id}`, body);
  return data;
}

export async function deleteDocumentLink(id: number): Promise<void> {
  await api.delete(`/api/v1/document-links/${id}`);
}

export async function addDocumentLinkImage(
  linkId: number,
  body: DocumentLinkImageInput,
): Promise<DocumentLinkDetailDTO> {
  const { data } = await api.post<DocumentLinkDetailDTO>(
    `/api/v1/document-links/${linkId}/images`,
    body,
  );
  return data;
}

export async function uploadDocumentLinkImage(
  linkId: number,
  file: File,
  sortOrder?: number | null,
): Promise<DocumentLinkDetailDTO> {
  const fd = new FormData();
  fd.append("file", file);
  if (sortOrder != null && sortOrder !== undefined) {
    fd.append("sortOrder", String(sortOrder));
  }
  const { data } = await api.post<DocumentLinkDetailDTO>(
    `/api/v1/document-links/${linkId}/images/upload`,
    fd,
  );
  return data;
}

export async function removeDocumentLinkImage(
  linkId: number,
  imageId: number,
): Promise<DocumentLinkDetailDTO> {
  const { data } = await api.delete<DocumentLinkDetailDTO>(
    `/api/v1/document-links/${linkId}/images/${imageId}`,
  );
  return data;
}

/** External image URLs can use <img src> directly; local paths need authenticated preview API + blob. */
export function isHttpImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith("http://") || u.startsWith("https://");
}

export async function fetchDocumentImagePreviewBlob(linkId: number, imageId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(
    `/api/v1/document-links/${linkId}/images/${imageId}/preview`,
    { responseType: "blob" },
  );
  return data;
}

export function parseApiError(err: unknown, fallback = "Đã xảy ra lỗi"): string {
  const ax = err as {
    response?: { data?: { message?: string | string[] }; status?: number };
    message?: string;
  };
  const raw = ax.response?.data?.message;
  if (typeof raw === "string" && raw.trim()) return raw;
  if (Array.isArray(raw)) return raw.filter(Boolean).join(", ");
  if (typeof ax.message === "string" && ax.message && !ax.message.startsWith("Request failed")) {
    return ax.message;
  }
  return fallback;
}
