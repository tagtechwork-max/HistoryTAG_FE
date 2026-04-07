import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AiOutlineClose,
  AiOutlineDelete,
  AiOutlineEdit,
  AiOutlineEye,
  AiOutlineLink,
  AiOutlinePlus,
  AiOutlineSearch,
  AiOutlineUpload,
} from "react-icons/ai";

import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Pagination from "../../components/common/Pagination";
import DocumentLinkImagePreview from "../../components/documentLink/DocumentLinkImagePreview";
import {
  addDocumentLinkImage,
  createDocumentLink,
  deleteDocumentLink,
  fetchDocumentLinks,
  getDocumentLink,
  parseApiError,
  removeDocumentLinkImage,
  type DocumentLinkDetailDTO,
  type DocumentLinkImageInput,
  type DocumentLinkListItemDTO,
  updateDocumentLink,
  uploadDocumentLinkImage,
} from "../../api/documentLinks.api";

function formatDt(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN");
  } catch {
    return iso;
  }
}

export default function DocumentLinksPage() {
  const [rows, setRows] = useState<DocumentLinkListItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [titleSearch, setTitleSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DocumentLinkDetailDTO | null>(null);
  const [saving, setSaving] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formNote, setFormNote] = useState("");
  const [createImageRows, setCreateImageRows] = useState<{ imageUrl: string; sortOrder: string }[]>([]);

  const [newImageUrl, setNewImageUrl] = useState("");
  const [newImageSort, setNewImageSort] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DocumentLinkListItemDTO | null>(null);

  /** Full-screen image viewer (modal ảnh đính kèm). */
  const [imageViewer, setImageViewer] = useState<{
    linkId: number;
    imageId: number;
    imageUrl: string;
  } | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchDocumentLinks({
        title: appliedSearch || undefined,
        page,
        size,
        sortBy,
        sortDir,
        embedImages: false,
      });
      setRows(res.content);
      setTotalElements(res.totalElements);
      setTotalPages(res.totalPages);
    } catch (e) {
      toast.error(parseApiError(e, "Không tải được danh sách"));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, page, size, sortBy, sortDir]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!imageViewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImageViewer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imageViewer]);

  const openCreate = () => {
    setEditingId(null);
    setDetail(null);
    setFormTitle("");
    setFormUrl("");
    setFormNote("");
    setCreateImageRows([]);
    setNewImageUrl("");
    setNewImageSort("");
    setModalOpen(true);
  };

  const openEdit = async (row: DocumentLinkListItemDTO) => {
    setEditingId(row.id);
    setModalOpen(true);
    setSaving(true);
    try {
      const d = await getDocumentLink(row.id);
      setDetail(d);
      setFormTitle(d.title);
      setFormUrl(d.url);
      setFormNote(d.note ?? "");
      setNewImageUrl("");
      setNewImageSort("");
    } catch (e) {
      toast.error(parseApiError(e, "Không tải chi tiết"));
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const sortedImages = useMemo(() => {
    if (!detail?.images?.length) return [];
    return [...detail.images].sort((a, b) => {
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (so !== 0) return so;
      return a.id - b.id;
    });
  }, [detail]);

  const handleSaveCreate = async () => {
    const t = formTitle.trim();
    const u = formUrl.trim();
    if (!t || !u) {
      toast.error("Tiêu đề và URL là bắt buộc.");
      return;
    }
    const images: DocumentLinkImageInput[] = [];
    for (const r of createImageRows) {
      const u = r.imageUrl.trim();
      if (!u) continue;
      let so: number | undefined;
      if (r.sortOrder.trim()) {
        const n = parseInt(r.sortOrder, 10);
        if (Number.isNaN(n)) {
          toast.error("Thứ tự ảnh phải là số.");
          return;
        }
        so = n;
      }
      images.push({ imageUrl: u, sortOrder: so });
    }
    setSaving(true);
    try {
      const created = await createDocumentLink({
        title: t,
        url: u,
        note: formNote.trim() || null,
        images: images.length ? images : undefined,
      });
      toast.success("Đã tạo link tài liệu.");
      void loadList();
      setEditingId(created.id);
      setDetail(created);
      setFormTitle(created.title);
      setFormUrl(created.url);
      setFormNote(created.note ?? "");
      setCreateImageRows([]);
    } catch (e) {
      toast.error(parseApiError(e, "Không tạo được"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMeta = async () => {
    if (editingId == null) return;
    const t = formTitle.trim();
    const u = formUrl.trim();
    if (!t || !u) {
      toast.error("Tiêu đề và URL là bắt buộc.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateDocumentLink(editingId, {
        title: t,
        url: u,
        note: formNote.trim() ? formNote.trim() : null,
      });
      setDetail(updated);
      toast.success("Đã cập nhật.");
      void loadList();
    } catch (e) {
      toast.error(parseApiError(e, "Không cập nhật được"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddImageUrl = async () => {
    if (editingId == null || !detail) return;
    const url = newImageUrl.trim();
    if (!url) {
      toast.error("Nhập URL ảnh.");
      return;
    }
    const so = newImageSort.trim() ? parseInt(newImageSort, 10) : undefined;
    if (newImageSort.trim() && Number.isNaN(so)) {
      toast.error("Thứ tự phải là số.");
      return;
    }
    setSaving(true);
    try {
      const d = await addDocumentLinkImage(editingId, { imageUrl: url, sortOrder: so ?? null });
      setDetail(d);
      setNewImageUrl("");
      setNewImageSort("");
      toast.success("Đã thêm ảnh.");
      void loadList();
    } catch (e) {
      toast.error(parseApiError(e, "Không thêm ảnh được"));
    } finally {
      setSaving(false);
    }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || editingId == null) return;
    setSaving(true);
    try {
      const so = newImageSort.trim() ? parseInt(newImageSort, 10) : undefined;
      if (newImageSort.trim() && Number.isNaN(so)) {
        toast.error("Thứ tự phải là số.");
        return;
      }
      const d = await uploadDocumentLinkImage(editingId, file, so);
      setDetail(d);
      toast.success("Đã upload ảnh.");
      void loadList();
    } catch (err) {
      toast.error(parseApiError(err, "Upload thất bại"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveImage = async (imageId: number) => {
    if (editingId == null) return;
    setSaving(true);
    try {
      const d = await removeDocumentLinkImage(editingId, imageId);
      setDetail(d);
      toast.success("Đã xóa ảnh.");
      void loadList();
    } catch (e) {
      toast.error(parseApiError(e, "Không xóa ảnh được"));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteDocumentLink(deleteTarget.id);
      toast.success("Đã xóa.");
      setDeleteTarget(null);
      void loadList();
    } catch (e) {
      toast.error(parseApiError(e, "Không xóa được"));
    } finally {
      setSaving(false);
    }
  };

  const applySearch = () => {
    setAppliedSearch(titleSearch.trim());
    setPage(0);
  };

  return (
    <>
      <PageMeta
        title="Tiện ích | Link tài liệu"
        description="Quản lý link tài liệu tập trung (URL + ảnh preview)."
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <AiOutlineLink className="text-2xl text-brand-500" />
              Link tài liệu
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Lưu URL tài liệu và ảnh minh họa (chỉ lưu đường dẫn, không lưu file trong DB).
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            <AiOutlinePlus className="text-lg" />
            Thêm link
          </button>
        </div>

        <ComponentCard title="Danh sách">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Tìm theo tiêu đề
              </label>
              <div className="flex gap-2">
                <input
                  value={titleSearch}
                  onChange={(e) => setTitleSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applySearch()}
                  placeholder="Nhập từ khóa..."
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={applySearch}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  <AiOutlineSearch />
                  Tìm
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Sắp xếp</label>
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setPage(0);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="createdAt">Ngày tạo</option>
                  <option value="updatedAt">Cập nhật</option>
                  <option value="title">Tiêu đề</option>
                </select>
                <select
                  value={sortDir}
                  onChange={(e) => {
                    setSortDir(e.target.value as "asc" | "desc");
                    setPage(0);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="desc">Giảm dần</option>
                  <option value="asc">Tăng dần</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tiêu đề</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ảnh</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tạo lúc</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900/20">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                      Đang tải...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                      Không có dữ liệu.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/80 dark:hover:bg-white/5">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white max-w-[200px] truncate">
                        {row.title}
                      </td>
                      <td className="px-4 py-3 text-sm text-brand-600 max-w-xs truncate">
                        <a href={row.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {row.url}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-600">{row.imageCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDt(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => void openEdit(row)}
                            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-white/10"
                            title="Sửa"
                          >
                            <AiOutlineEdit className="text-lg" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Xóa"
                          >
                            <AiOutlineDelete className="text-lg" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && totalElements > 0 && (
            <Pagination
              currentPage={page}
              totalPages={Math.max(1, totalPages)}
              totalItems={totalElements}
              itemsPerPage={size}
              onPageChange={(p) => setPage(p)}
              onItemsPerPageChange={(s) => {
                setSize(s);
                setPage(0);
              }}
              itemsPerPageOptions={[5, 10, 20, 50]}
            />
          )}
        </ComponentCard>
      </div>

      {/* Modal create / edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            role="dialog"
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 dark:ring-1 dark:ring-white/10"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingId == null ? "Thêm link tài liệu" : "Sửa link tài liệu"}
            </h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Tiêu đề *</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">URL tài liệu *</label>
                <input
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Ghi chú</label>
                <textarea
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {editingId == null && (
                <div className="rounded-lg border border-dashed border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Ảnh (tuỳ chọn, khi tạo)</p>
                  {createImageRows.map((r, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                      <input
                        placeholder="URL ảnh"
                        value={r.imageUrl}
                        onChange={(e) => {
                          const next = [...createImageRows];
                          next[idx] = { ...next[idx], imageUrl: e.target.value };
                          setCreateImageRows(next);
                        }}
                        className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
                      />
                      <input
                        placeholder="STT"
                        value={r.sortOrder}
                        onChange={(e) => {
                          const next = [...createImageRows];
                          next[idx] = { ...next[idx], sortOrder: e.target.value };
                          setCreateImageRows(next);
                        }}
                        className="w-16 rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
                      />
                      <button
                        type="button"
                        onClick={() => setCreateImageRows(createImageRows.filter((_, i) => i !== idx))}
                        className="text-red-600 text-sm"
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCreateImageRows([...createImageRows, { imageUrl: "", sortOrder: "" }])}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    + Thêm dòng URL ảnh
                  </button>
                </div>
              )}
            </div>

            {editingId != null && detail && (
              <div className="mt-4 rounded-lg border border-gray-100 p-3 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Ảnh đính kèm</p>
                <ul className="space-y-2 max-h-56 overflow-y-auto">
                  {sortedImages.map((im) => (
                    <li
                      key={im.id}
                      className="flex items-start justify-between gap-2 text-xs bg-gray-50 dark:bg-gray-800/50 rounded px-2 py-1.5"
                    >
                      <div className="flex gap-2 min-w-0 flex-1 items-start">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            setImageViewer({
                              linkId: editingId,
                              imageId: im.id,
                              imageUrl: im.imageUrl,
                            })
                          }
                          className="shrink-0 rounded border border-gray-200 dark:border-gray-600 overflow-hidden focus:outline-hidden focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                          title="Xem ảnh"
                        >
                          <DocumentLinkImagePreview
                            linkId={editingId}
                            imageId={im.id}
                            imageUrl={im.imageUrl}
                            className="h-16 w-16 object-cover"
                            alt=""
                          />
                        </button>
                        <span className="break-all text-gray-700 dark:text-gray-200 pt-0.5">{im.imageUrl}</span>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0 items-stretch sm:flex-row sm:items-center">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            setImageViewer({
                              linkId: editingId,
                              imageId: im.id,
                              imageUrl: im.imageUrl,
                            })
                          }
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:bg-gray-800 dark:text-brand-300 dark:hover:bg-brand-900/30 disabled:opacity-50"
                          title="Xem ảnh"
                        >
                          <AiOutlineEye className="text-base" />
                          Xem
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleRemoveImage(im.id)}
                          className="inline-flex items-center justify-center rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20"
                        >
                          Xóa
                        </button>
                      </div>
                    </li>
                  ))}
                  {sortedImages.length === 0 && (
                    <li className="text-xs text-gray-500">Chưa có ảnh.</li>
                  )}
                </ul>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">URL ảnh mới</label>
                    <input
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-gray-500">Thứ tự</label>
                    <input
                      value={newImageSort}
                      onChange={(e) => setNewImageSort(e.target.value)}
                      placeholder="auto"
                      className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleAddImageUrl()}
                    className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium dark:bg-gray-800"
                  >
                    Thêm URL
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm cursor-pointer dark:border-gray-700">
                    <AiOutlineUpload />
                    Upload file
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={saving} />
                  </label>
                  <span className="text-xs text-gray-500">PNG, JPG, GIF, WEBP — lưu trên server, DB chỉ giữ path.</span>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700"
              >
                Đóng
              </button>
              {editingId == null ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveCreate()}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  Tạo mới
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveMeta()}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  Lưu thông tin
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-screen image viewer */}
      {imageViewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh"
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 p-4"
          onClick={() => setImageViewer(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 z-10 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            onClick={() => setImageViewer(null)}
            aria-label="Đóng"
          >
            <AiOutlineClose className="text-2xl" />
          </button>
          <div
            className="max-h-[90vh] max-w-[95vw] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <DocumentLinkImagePreview
              linkId={imageViewer.linkId}
              imageId={imageViewer.imageId}
              imageUrl={imageViewer.imageUrl}
              className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
              alt="Xem ảnh"
            />
          </div>
          <p className="mt-3 text-center text-xs text-white/70">Nhấn ra ngoài hoặc Esc để đóng</p>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <p className="text-sm text-gray-800 dark:text-gray-100">
              Xóa link <span className="font-semibold">{deleteTarget.title}</span>?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleConfirmDelete()}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
