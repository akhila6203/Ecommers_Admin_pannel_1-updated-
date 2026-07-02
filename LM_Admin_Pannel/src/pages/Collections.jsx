import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import PageQueryState, { TableSkeleton, EmptyState } from "@/components/PageQueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
} from "@/services/collectionService";
import { getProducts } from "@/services/productService";

import { resolveUploadUrl } from "@/utils/imageUrl";

const emptyForm = { name: "", label: "", description: "", status: "active", product_ids: [] };

export default function Collections() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["collections", page],
    queryFn: () => getCollections({ page, limit: 20 }),
  });

  const collections = data?.data || [];
  const pagination = data?.pagination;

  const { data: viewData, isLoading: viewLoading } = useQuery({
    queryKey: ["collection", viewId],
    queryFn: () => getCollection(viewId),
    enabled: !!viewId,
  });

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["products", "picker"],
    queryFn: () => getProducts({ page: 1, limit: 500 }),
    enabled: modalOpen,
  });
  const allProducts = productsData?.data || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["collections"] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = new FormData();
      payload.append("name", form.name);
      payload.append("label", form.label || "");
      payload.append("description", form.description || "");
      payload.append("status", form.status);
      payload.append("product_ids", JSON.stringify(form.product_ids));
      if (imageFile) payload.append("image", imageFile);
      if (editing) return updateCollection(editing, payload);
      return createCollection(payload);
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setImageFile(null);
      setImagePreview(null);
      toast.success(editing ? "Collection updated." : "Collection created.");
    },
    onError: (err) => toast.error(err.response?.data?.message || err.message || "Failed to save collection"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCollection(id),
    onSuccess: () => {
      invalidate();
      toast.success("Collection deleted.");
    },
    onError: (err) => toast.error(err.message || "Failed to delete collection"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview(null);
    setModalOpen(true);
  };

  const openEdit = async (col) => {
    setEditing(col.id);
    try {
      const res = await getCollection(col.id);
      const full = res.data;
      setForm({
        name: full.name || "",
        label: full.label || "",
        description: full.description || "",
        status: full.status || "active",
        product_ids: (full.products || []).map((p) => p.id),
      });
      setImageFile(null);
      setImagePreview(full.image ? resolveUploadUrl(full.image, "collections") : null);
      setModalOpen(true);
    } catch (err) {
      toast.error(err.message || "Failed to load collection");
    }
  };

  const toggleProduct = (productId) => {
    setForm((f) => ({
      ...f,
      product_ids: f.product_ids.includes(productId)
        ? f.product_ids.filter((id) => id !== productId)
        : [...f.product_ids, productId],
    }));
  };

  const statusBadge = (status) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
      status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
    }`}>
      {status}
    </span>
  );

  return (
    <PageQueryState
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      skeleton={<TableSkeleton rows={6} cols={5} />}
      loadingMessage="Loading collections..."
    >
      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Collections</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage product collections ({pagination?.total ?? collections.length} total)
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            New Collection
          </Button>
        </div>

        {collections.length === 0 ? (
          <EmptyState
            message="No collections yet. Create your first collection."
            action={<Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Create Collection</Button>}
          />
        ) : (
          <DataTable
            columns={[
              {
                key: "image",
                label: "Cover",
                render: (r) =>
                  r.image ? (
                    <img
                      src={resolveUploadUrl(r.image, "collections")}
                      alt={r.name}
                      className="w-12 h-12 rounded-md object-cover border border-border"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center text-[10px] text-muted-foreground">
                      N/A
                    </div>
                  ),
              },
              { key: "name", label: "Name" },
              { key: "label", label: "Label", render: (r) => r.label || "—" },
              { key: "slug", label: "Slug" },
              { key: "product_count", label: "Products", render: (r) => r.product_count ?? 0 },
              { key: "status", label: "Status", render: (r) => statusBadge(r.status) },
              {
                key: "actions",
                label: "Actions",
                render: (r) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setViewId(r.id)} title="View">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (window.confirm(`Delete collection "${r.name}"?`)) deleteMutation.mutate(r.id);
                      }}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
            data={collections}
            emptyMessage="No collections found."
            itemLabel="collections"
            paginate={true}
          />
        )}

        {/* {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground self-center">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )} */}

        {/* Create/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editing ? "Edit Collection" : "New Collection"}</h2>
                <button onClick={() => setModalOpen(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Label</Label>
                  <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. New Arrivals" className="mt-1" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1" />
                </div>
                <div>
                  <Label>Cover Image</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    className="mt-1"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setImageFile(file);
                      setImagePreview(file ? URL.createObjectURL(file) : imagePreview);
                    }}
                  />
                  {imagePreview && (
                    <div className="mt-2 relative w-32 h-32 border border-border rounded-lg overflow-hidden">
                      <img src={imagePreview} alt="Collection cover" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Used as collection cover/banner image</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <Label>Products ({form.product_ids.length} selected)</Label>
                  <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
                    {productsLoading ? (
                      <p className="text-xs text-muted-foreground p-2">Loading products...</p>
                    ) : allProducts.length ? (
                      allProducts.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={form.product_ids.includes(p.id)}
                            onChange={() => toggleProduct(p.id)}
                          />
                          <span className="flex-1 truncate">{p.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">₹{(p.offer_price || p.price || 0).toLocaleString()}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground p-2">No products available. Add products first.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()}>
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* View Modal */}
        {viewId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Collection Details</h2>
                <button onClick={() => setViewId(null)}><X className="w-5 h-5" /></button>
              </div>
              {viewLoading ? (
                <TableSkeleton rows={3} cols={3} />
              ) : (
                <>
                  <p><strong>Name:</strong> {viewData?.data?.name}</p>
                  {viewData?.data?.label && <p><strong>Label:</strong> {viewData.data.label}</p>}
                  <p className="text-sm text-muted-foreground">{viewData?.data?.description || "No description"}</p>
                  <h3 className="font-medium">Products ({viewData?.data?.products?.length || 0})</h3>
                  <ul className="text-sm space-y-1">
                    {(viewData?.data?.products || []).map((p) => (
                      <li key={p.id} className="flex justify-between border-b border-border py-1">
                        <span>{p.name}</span>
                        <span>₹{(p.offer_price || p.price || 0).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </PageQueryState>
  );
}
