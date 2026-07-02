import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, AlertCircle, } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TableSkeleton } from "@/components/PageQueryState";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { getProducts, deleteProduct,} from "@/services/productService";
import { resolveUploadUrl } from "@/utils/imageUrl";

export default function ProductList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // const [pageSize] = useState(20);

  const { data: productsResponse, isLoading, error, refetch } = useQuery({
    queryKey: ["products", page, pageSize],
    queryFn: () => getProducts({ page, limit: pageSize }),
  });

  const products = productsResponse?.data || [];
  const pagination = productsResponse?.pagination;

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted.");
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete product");
    },
  });

  // const featuredMutation = useMutation({
  //   mutationFn: (id) => toggleFeatured(id),
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["products"] });
  //     toast.success("Featured status toggled");
  //   },
  //   onError: (err) => {
  //     toast.error(err.response?.data?.message || err.message || "Failed to toggle featured");
  //   },
  // });

  const handleDelete = (id) => {
    if (window.confirm("Delete this product?")) {
      deleteMutation.mutate(id);
    }
  };

  const statusBadge = (status) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
      status === "active" || status === "Active"
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        : status === "inactive" || status === "Inactive"
        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
    }`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1) || "—"}
    </span>
  );

  const getImageSrc = (product) => {
    const thumbFromImages = product.images?.find((img) => img.image_type === "thumbnail")?.image;
    const fallbackImage = product.images?.[0]?.image;
    const imagePath = thumbFromImages || product.thumbnail || fallbackImage;
    if (imagePath) {
      return resolveUploadUrl(imagePath, "products");
    }
    return null;
  };

  if (isLoading) {
    return <TableSkeleton rows={8} cols={6} />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive">Failed to load products.</p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Product List</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pagination?.total ?? products.length} products
            {pagination ? ` · Page ${pagination.page} of ${pagination.totalPages}` : ""}
          </p>
        </div>
      </div>

      <DataTable
        columns={[
          {
            key: "image", label: "Image",
            render: (r) => {
              const src = getImageSrc(r);
              return src ? (
                <img src={src} alt={r.name} className="w-10 h-10 rounded-md object-cover border border-border" />
              ) : (
                <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center text-[10px] text-muted-foreground">N/A</div>
              );
            },
          },
          { key: "name", label: "Product Name" },
          {
            key: "category", label: "Category",
            render: (r) => [r.category_name, r.sub_category_name, r.child_category_name].filter(Boolean).join(" › "),
          },
          { key: "brand", label: "Brand", render: (r) => r.brand || "—" },
          {
            key: "variant_count", label: "Variants",
            render: (r) => (
              r.variant_count > 0
                ? <span className="text-sm">{r.variant_count}</span>
                : <span className="text-muted-foreground">—</span>
            ),
          },
          { key: "price", label: "Price", render: (r) => `₹${Number(r.price)?.toLocaleString()}` },
          { key: "offer_price", label: "Offer", render: (r) => r.offer_price ? `₹${Number(r.offer_price)?.toLocaleString()}` : "—" },
          { key: "discount_percentage", label: "Disc %", render: (r) => r.discount_percentage ? `${r.discount_percentage}%` : "—" },
          { key: "fabric", label: "Fabric", render: (r) => r.fabric || "—" },
          { key: "stock", label: "Stock" },
          // {
          //   key: "is_featured", label: "Featured",
          //   render: (r) => (
          //     <button
          //       onClick={() => featuredMutation.mutate(r.id)}
          //       disabled={featuredMutation.isPending}
          //       className={`p-1 rounded-md transition ${
          //         r.is_featured ? "text-yellow-500 hover:text-yellow-600" : "text-muted-foreground hover:text-yellow-500"
          //       }`}
          //       title={r.is_featured ? "Remove from featured" : "Mark as featured"}
          //     >
          //       <Star className={`w-4 h-4 ${r.is_featured ? "fill-current" : ""}`} />
          //     </button>
          //   ),
          // },
          { key: "status", label: "Status", render: (r) => statusBadge(r.status) },
          {
            key: "actions", label: "Actions",
            render: (r) => (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigate(`/products/edit/${r.id}`, { state: { product: r } })}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-primary hover:bg-primary/10 transition"
                  title="Edit product"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={deleteMutation.isPending}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10 transition"
                  title="Delete product"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
          },
        ]}
        data={products}
        searchPlaceholder="Search products..."
        itemLabel="products"
        paginate={true}
      />

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground self-center">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
