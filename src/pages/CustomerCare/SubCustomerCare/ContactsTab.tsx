import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { FiUser, FiPhone, FiMail, FiSettings, FiFileText, FiPlus, FiEdit2, FiTrash2, FiX, FiSave } from "react-icons/fi";
import {
  getHospitalContacts,
  createHospitalContact,
  updateHospitalContact,
  deleteHospitalContact,
  type HospitalContactResponseDTO,
  type HospitalContactRequestDTO
} from "../../../api/hospitalContact.api";

export interface Contact {
  id: number;
  name: string;
  role: string;
  roleType: "it" | "accountant" | "nurse";
  phone?: string;
  email?: string;
}

interface ContactsTabProps {
  hospitalId?: number;
  canManage?: boolean;
  onContactsChange?: (contacts: Contact[]) => void;
}

const getRoleIcon = (roleType: Contact["roleType"]) => {
  switch (roleType) {
    case "it": return <FiSettings className="h-4 w-4 text-blue-500" />;
    case "accountant": return <FiFileText className="h-4 w-4 text-gray-500" />;
    case "nurse": return <FiUser className="h-4 w-4 text-gray-500" />;
    default: return <FiUser className="h-4 w-4 text-gray-500" />;
  }
};

export default function ContactsTab({ 
  hospitalId,
  canManage = false,
  onContactsChange
}: ContactsTabProps) {
  const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactForm, setContactForm] = useState<Omit<Contact, "id">>({
    name: "",
    role: "",
    roleType: "it",
    phone: "",
    email: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load contacts from API when hospitalId is available
  useEffect(() => {
    if (hospitalId) {
      loadContacts();
    }
  }, [hospitalId]);

  const loadContacts = async () => {
    if (!hospitalId) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await getHospitalContacts(hospitalId);
      // Convert API response to Contact format
      const convertedContacts: Contact[] = data.map((item: HospitalContactResponseDTO) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        roleType: item.roleType as Contact["roleType"],
        phone: item.phone || undefined,
        email: item.email || undefined
      }));
      setContacts(convertedContacts);
      // Notify parent component if callback provided
      if (onContactsChange) {
        onContactsChange(convertedContacts);
      }
    } catch (err: any) {
      console.error("Error loading contacts:", err);
      setError(err?.response?.data?.message || err?.message || "Không thể tải danh sách liên hệ");
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = () => {
    setEditingContact(null);
    setContactForm({
      name: "",
      role: "",
      roleType: "it",
      phone: "",
      email: ""
    });
    setShowContactModal(true);
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name,
      role: contact.role,
      roleType: contact.roleType,
      phone: contact.phone || "",
      email: contact.email || ""
    });
    setShowContactModal(true);
  };

  const handleDeleteContact = async (contactId: number) => {
    const ok = await askConfirm({
      title: "Xóa liên hệ?",
      message: "Bạn có chắc muốn xóa liên hệ này?",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;

    if (!hospitalId) {
      const updatedContacts = contacts.filter((c) => c.id !== contactId);
      setContacts(updatedContacts);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await deleteHospitalContact(hospitalId, contactId, canManage);
      // Reload contacts after delete
      await loadContacts();
      // onContactsChange will be called in loadContacts
    } catch (err: any) {
      console.error("Error deleting contact:", err);
      const msg = err?.response?.data?.message || err?.message || "Không thể xóa liên hệ";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveContact = async () => {
    if (!contactForm.name.trim() || !contactForm.role.trim()) {
      toast.error("Vui lòng điền đầy đủ thông tin (Tên và Vai trò)");
      return;
    }

    if (!hospitalId) {
      // Fallback: local save if no hospitalId
      let updatedContacts: Contact[];
      if (editingContact) {
        updatedContacts = contacts.map(c => 
          c.id === editingContact.id 
            ? { ...contactForm, id: editingContact.id }
            : c
        );
      } else {
        const newContact: Contact = {
          ...contactForm,
          id: Math.max(...contacts.map(c => c.id), 0) + 1
        };
        updatedContacts = [...contacts, newContact];
      }
      setContacts(updatedContacts);
      setShowContactModal(false);
      setEditingContact(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: HospitalContactRequestDTO = {
        name: contactForm.name.trim(),
        role: contactForm.role.trim(),
        roleType: contactForm.roleType,
        phone: contactForm.phone?.trim() || null,
        email: contactForm.email?.trim() || null
      };

      if (editingContact) {
        // Update existing contact
        await updateHospitalContact(hospitalId, editingContact.id, payload, canManage);
      } else {
        // Create new contact
        await createHospitalContact(hospitalId, payload, canManage);
      }

      // Reload contacts after save
      await loadContacts();
      // onContactsChange will be called in loadContacts
      setShowContactModal(false);
      setEditingContact(null);
    } catch (err: any) {
      console.error("Error saving contact:", err);
      const msg = err?.response?.data?.message || err?.message || "Không thể lưu liên hệ";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseContactModal = () => {
    setShowContactModal(false);
    setEditingContact(null);
    setContactForm({
      name: "",
      role: "",
      roleType: "it",
      phone: "",
      email: ""
    });
  };

  return (
    <div className="space-y-4">
      {/* Header với button thêm */}
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Nhân sự phụ trách (Key Contact)
        </h3>
        <button 
          onClick={handleAddContact}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiPlus className="h-4 w-4" />
          Thêm liên hệ
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && contacts.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Đang tải...</p>
          </div>
        </div>
      )}

      {/* Danh sách contacts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contacts.map((contact) => (
          <div key={contact.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition dark:bg-gray-700/50 dark:border-gray-700">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="shrink-0">{getRoleIcon(contact.roleType)}</div>
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{contact.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{contact.role}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEditContact(contact)}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition dark:hover:bg-blue-900/20"
                  title="Sửa"
                >
                  <FiEdit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteContact(contact.id)}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition dark:hover:bg-red-900/20"
                  title="Xóa"
                >
                  <FiTrash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {contact.phone && (
              <a 
                href={`tel:${contact.phone}`}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline mb-2 dark:text-blue-400"
              >
                <FiPhone className="h-3.5 w-3.5" />
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a 
                href={`mailto:${contact.email}`}
                className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 hover:underline dark:text-purple-400"
              >
                <FiMail className="h-3.5 w-3.5" />
                {contact.email}
              </a>
            )}
          </div>
        ))}
      </div>

      {contacts.length === 0 && (
        <div className="text-center py-12">
          <FiUser className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">Chưa có thông tin liên hệ</p>
          <button 
            onClick={handleAddContact}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
          >
            <FiPlus className="h-4 w-4" />
            Thêm liên hệ đầu tiên
          </button>
        </div>
      )}

      {/* Modal form thêm/sửa contact */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full dark:bg-gray-800">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingContact ? "Sửa liên hệ" : "Thêm liên hệ"}
              </h3>
              <button
                onClick={handleCloseContactModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveContact(); }} className="p-6 space-y-4">
              {/* Tên */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tên <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="Nhập tên"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>

              {/* Vai trò */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Vai trò <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactForm.role}
                  onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                  placeholder="Ví dụ: Quản lý, Kế toán, Điều dưỡng..."
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>

              {/* Loại vai trò */}
              {/* <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Loại vai trò
                </label>
                <select
                  value={contactForm.roleType}
                  onChange={(e) => setContactForm({ ...contactForm, roleType: e.target.value as Contact["roleType"] })}
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                >
                  <option value="it">IT</option>
                  <option value="accountant">Kế toán</option>
                  <option value="nurse">Điều dưỡng</option>
                </select>
              </div> */}

              {/* Số điện thoại */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Số điện thoại
                </label>
                <input
                  type="tel"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  placeholder="Nhập số điện thoại"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  placeholder="Nhập email"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleCloseContactModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                >
                  <FiSave className="h-4 w-4" />
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {genericConfirmDialog}
    </div>
  );
}

