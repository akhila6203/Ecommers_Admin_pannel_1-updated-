import { useState } from "react";
import { Pencil, Trash2, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { getCoupons, getCoupon, createCoupon, updateCoupon, deleteCoupon, getAllCouponUsage } from "@/services/couponService";

const emptyForm = {
  code: "",
  discount: "",
  startDate: "",
  endDate: "",
  status: "Active",
};

export default function Offers() {
  const queryClient = useQueryClient();

  const { data: couponsResponse, isLoading, error, refetch } = useQuery({
    queryKey: ["coupons"],
    queryFn: () => getCoupons(),
  });
  const coupons = couponsResponse?.data || [];

  const { data: usageResponse, isLoading: usageLoading } = useQuery({
    queryKey: ["couponUsage"],
    queryFn: () => getAllCouponUsage({ limit: 100 }),
  });
  const usageHistory = usageResponse?.data || [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["coupons"] });
    queryClient.invalidateQueries({ queryKey: ["couponUsage"] });
  };

  const addMutation = useMutation({
    mutationFn: (data) => createCoupon(data),
    onSuccess: () => { invalidate(); toast.success("Coupon added."); },
    onError: (err) => toast.error(err.response?.data?.message || err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCoupon(id, data),
    onSuccess: () => { invalidate(); toast.success("Coupon updated."); },
    onError: (err) => toast.error(err.response?.data?.message || err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCoupon(id),
    onSuccess: () => { invalidate(); toast.success("Coupon deleted."); },
    onError: (err) => toast.error(err.response?.data?.message || err.message),
  });

  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [openModal, setOpenModal] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.code || !form.discount) {
      return toast.error("Fill required fields.");
    }

    const payload = {
      code: form.code,
      type: "percentage",
      value: parseFloat(form.discount) || 0,
      start_date: form.startDate || null,
      expiry_date: form.endDate || null,
      status: form.status?.toLowerCase() || "active",
    };

    if (!editing) {
      Object.assign(payload, {
        minimum_order_amount: 0,
        maximum_discount: 0,
        usage_limit: 0,
        per_user_limit: 1,
        description: null,
        is_for_new_customers: 0,
      });
    }

    if (editing) {
      updateMutation.mutate({ id: editing, data: payload });
      setEditing(null);
    } else {
      addMutation.mutate(payload);
    }

    setForm(emptyForm);
    setOpenModal(false);
  };

  const handleAddClick = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenModal(true);
  };

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return "";
    if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return dateStr.slice(0, 10);
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().split("T")[0];
  };

  const handleEdit = async (coupon) => {
    try {
      const res = await getCoupon(coupon.id);
      const c = res?.data || coupon;

      setEditing(c.id);
      setForm({
        code: c.code || "",
        discount: c.value !== undefined && c.value !== null ? String(c.value) : "",
        startDate: formatDateForInput(c.start_date || c.startDate),
        endDate: formatDateForInput(c.expiry_date || c.end_date || c.endDate),
        status: c.status
          ? c.status.charAt(0).toUpperCase() + c.status.slice(1).toLowerCase()
          : "Active",
      });
      setOpenModal(true);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to load coupon");
    }
  };

  const handleDelete = (id) => {
    if (window.confirm("Delete this coupon?")) {
      deleteMutation.mutate(id);
    }
  };

  const closeModal = () => {
    setOpenModal(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const inputClass =
    "h-10 px-3 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  if (isLoading) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto flex items-center justify-center min-h-[300px] gap-2 text-destructive">
        <span>Failed to load coupons. Please try again.</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Offers / Coupons
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage discount coupons
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddClick}
          className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Coupon
        </button>
      </div>

      {/* Coupons Table */}
      <DataTable
        columns={[
          {
            key: "code",
            label: "Code",
            render: (r) => (
              <span className="font-mono font-semibold text-primary">
                {r.code}
              </span>
            ),
          },
          {
            key: "value",
            label: "Discount",
            render: (r) => `${r.value}${r.type === 'percentage' ? '%' : ' flat'}`,
          },
          { key: "start_date", label: "Start Date", render: (r) => r.start_date ? new Date(r.start_date).toLocaleDateString() : "—" },
          { key: "expiry_date", label: "End Date", render: (r) => r.expiry_date ? new Date(r.expiry_date).toLocaleDateString() : "—" },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  r.status === "active" || r.status === "Active"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {r.status}
              </span>
            ),
          },
          {
            key: "actions",
            label: "Actions",
            render: (r) => (
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(r)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10"
                >
                  <Pencil className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDelete(r.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ),
          },
        ]}
        data={coupons}
        searchPlaceholder="Search coupons..."
        itemLabel="coupons"
      />

      <div>
        <h2 className="text-lg font-heading font-semibold text-foreground mb-1">Coupon Usage History</h2>
        <p className="text-sm text-muted-foreground mb-4">Records when customers apply coupons on orders</p>
        {usageLoading ? (
          <div className="flex items-center justify-center min-h-[120px]">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <DataTable
            columns={[
              { key: "user_name", label: "User Name" },
              { key: "user_email", label: "User Email" },
              { key: "coupon_code", label: "Coupon Code", render: (r) => <span className="font-mono font-semibold text-primary">{r.coupon_code}</span> },
              { key: "discount", label: "Discount", render: (r) => `₹${Number(r.discount || 0).toLocaleString()}` },
              { key: "order_id", label: "Order ID", render: (r) => r.order_number || r.order_id || "—" },
              { key: "date_used", label: "Date Used", render: (r) => r.date_used ? new Date(r.date_used).toLocaleString() : "—" },
            ]}
            data={usageHistory}
            searchPlaceholder="Search usage..."
            itemLabel="usage records"
          />
        )}
      </div>

      {/* Modal Popup */}
      {openModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />

          <div className="relative w-full max-w-[500px] bg-card rounded-2xl border border-border shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="text-xl font-semibold text-foreground">
                {editing ? "Update Coupon" : "Add Coupon"}
              </h2>

              <button
                type="button"
                onClick={closeModal}
                className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-6 space-y-4"
            >
              <div>
                <label className="text-sm font-medium block mb-1">
                  Coupon Code *
                </label>
                <input
                  value={form.code}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  className={`w-full ${inputClass}`}
                  placeholder="LMFEST20"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">
                  Discount % *
                </label>
                <input
                  type="number"
                  value={form.discount}
                  onChange={(e) =>
                    setForm({ ...form, discount: e.target.value })
                  }
                  className={`w-full ${inputClass}`}
                  placeholder="20"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value })
                  }
                  className={`w-full ${inputClass}`}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value })
                  }
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="submit"
                  className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {editing ? "Update" : "Add Coupon"}
                </button>

                {editing && (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="h-10 px-4 rounded-lg bg-secondary text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
