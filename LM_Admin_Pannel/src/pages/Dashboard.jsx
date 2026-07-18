import { Package, FolderTree, ShoppingCart, Users, Image } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "@/services/dashboardService";
import { getProducts } from "@/services/productService";
import PageQueryState, { TableSkeleton } from "@/components/PageQueryState";
import { resolveUploadUrl } from "@/utils/imageUrl";

const statusColors = {
  delivered: "bg-green-100 text-green-700",
  shipped: "bg-blue-100 text-blue-700",
  processing: "bg-orange-100 text-orange-700",
  pending: "bg-yellow-100 text-yellow-700",
};

function formatStatus(status) {
  if (!status) return "";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function getProductImage(product) {
  const thumbnailImage = product.images?.find(
    (image) => image.image_type === "thumbnail"
  )?.image;

  const firstGalleryImage = product.images?.[0]?.image;

  const imagePath =
    thumbnailImage ||
    product.thumbnail ||
    product.image ||
    product.imageUrl ||
    firstGalleryImage;

  return imagePath
    ? resolveUploadUrl(imagePath, "products")
    : null;
}

export default function Dashboard() {
  const { data: statsResponse, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
    refetchInterval: 30000,
  });

  const { data: productsResponse } = useQuery({
    queryKey: ["products", "dashboard-lowstock"],
    queryFn: () => getProducts({ page: 1, limit: 50, status: "active" }),
    refetchInterval: 60000,
  });

  const stats = statsResponse?.data;
  const statistics = stats?.statistics;
  const recentOrders = stats?.recentOrders || [];
  const topSelling = stats?.topProducts || [];
  const allProducts = productsResponse?.data || [];
  const lowStockProducts = allProducts.filter((p) => (p.stock || p.quantity || 0) <= 10).slice(0, 5);

  return (
    <PageQueryState
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      skeleton={<TableSkeleton rows={8} cols={4} />}
      loadingMessage="Loading dashboard..."
    >
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, Admin. Manage your fashion store here.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard title="Total Products" value={statistics?.totalProducts ?? 0} icon={<Package className="w-5 h-5 text-primary" />} delay={0} />
          <StatCard title="Total Categories" value={statistics?.totalCategories ?? 0} icon={<FolderTree className="w-5 h-5 text-primary" />} delay={0.05} />
          <StatCard title="Total Orders" value={statistics?.totalOrders ?? 0} icon={<ShoppingCart className="w-5 h-5 text-primary" />} delay={0.1} />
          <StatCard title="Total Customers" value={statistics?.totalCustomers ?? 0} icon={<Users className="w-5 h-5 text-primary" />} delay={0.15} />
          <StatCard title="Total Banners" value={statistics?.totalBanners ?? 0} icon={<Image className="w-5 h-5 text-primary" />} delay={0.25} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-heading font-semibold text-foreground mb-4">Recent Orders</h3>
            <DataTable
              columns={[
                { key: "order_number", label: "Order ID" },
                { key: "customer_name", label: "Customer", render: (r) => r.customer_name || "—" },
                { key: "total_amount", label: "Amount", render: (r) => `₹${(r.total_amount || 0).toLocaleString()}` },
                {
                  key: "order_status",
                  label: "Status",
                  render: (r) => {
                    const status = (r.order_status || r.status || "").toLowerCase();
                    return (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[status] || "bg-secondary"}`}>
                        {formatStatus(r.order_status || r.status)}
                      </span>
                    );
                  },
                },
              ]}
              data={recentOrders.slice(0, 5)}
              emptyMessage="No orders yet."
              paginate={false}
              searchable={false}
              embedded
            />
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-heading font-semibold text-foreground mb-4">Top Selling Products</h3>
            <DataTable
              columns={[
                // {
                //   key: "image",
                //   label: "Image",
                //   render: (r) => (
                //     <img src={r.thumbnail || r.imageUrl} alt={r.name} className="w-10 h-10 rounded-lg object-cover" />
                //   ),
                // },
                {
  key: "image",
  label: "Image",
  render: (product) => {
    const imageSrc = getProductImage(product);

    return imageSrc ? (
      <img
        src={imageSrc}
        alt={product.name || "Product"}
        className="w-12 h-12 rounded-lg object-cover border border-border"
      />
    ) : (
      <span className="text-xs text-muted-foreground">No image</span>
    );
  },
},
                { key: "name", label: "Product" },
                { key: "sales", label: "Sales", render: (r) => r.total_qty ?? r.total_sales ?? 0 },
                { key: "price", label: "Price", render: (r) => `₹${(r.offer_price || r.price || 0).toLocaleString()}` },
              ]}
              data={topSelling.length > 0 ? topSelling.slice(0, 5) : allProducts.slice(0, 5)}
              emptyMessage="No products yet."
              paginate={false}
              searchable={false}
              embedded
            />
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-heading font-semibold text-foreground mb-4">Low Stock Products</h3>
          <DataTable
            columns={[
              { key: "name", label: "Product" },
              { key: "category", label: "Category", render: (r) => r.category_name || "—" },
              {
                key: "stock",
                label: "Stock",
                render: (r) => (
                  <Badge variant={(r.stock || 0) <= 5 ? "destructive" : "secondary"}>
                    {r.stock ?? 0} left
                  </Badge>
                ),
              },
            ]}
            data={lowStockProducts}
            emptyMessage="All products are well stocked."
            paginate={false}
            searchable={false}
            embedded
          />
        </div>
      </div>
    </PageQueryState>
  );
}



// import { Package, FolderTree, ShoppingCart, Users, Image } from "lucide-react";
// import { StatCard } from "@/components/StatCard";
// import { DataTable } from "@/components/DataTable";
// import { Badge } from "@/components/ui/badge";
// import { useQuery } from "@tanstack/react-query";
// import { getDashboardStats } from "@/services/dashboardService";
// import { getProducts } from "@/services/productService";
// import PageQueryState, { TableSkeleton } from "@/components/PageQueryState";

// const statusColors = {
//   delivered: "bg-green-100 text-green-700",
//   shipped: "bg-blue-100 text-blue-700",
//   processing: "bg-orange-100 text-orange-700",
//   pending: "bg-yellow-100 text-yellow-700",
// };

// function formatStatus(status) {
//   if (!status) return "";
//   return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
// }

// export default function Dashboard() {
//   const { data: statsResponse, isLoading, error, refetch } = useQuery({
//     queryKey: ["dashboard-stats"],
//     queryFn: getDashboardStats,
//     refetchInterval: 30000,
//   });

//   const { data: productsResponse } = useQuery({
//     queryKey: ["products", "dashboard-lowstock"],
//     queryFn: () => getProducts({ page: 1, limit: 50, status: "active" }),
//     refetchInterval: 60000,
//   });

//   const stats = statsResponse?.data;
//   const statistics = stats?.statistics;
//   const recentOrders = stats?.recentOrders || [];
//   const topSelling = stats?.topProducts || [];
//   const allProducts = productsResponse?.data || [];
//   const lowStockProducts = allProducts.filter((p) => (p.stock || p.quantity || 0) <= 10).slice(0, 5);

//   return (
//     <PageQueryState
//       isLoading={isLoading}
//       error={error}
//       onRetry={refetch}
//       skeleton={<TableSkeleton rows={8} cols={4} />}
//       loadingMessage="Loading dashboard..."
//     >
//       <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
//         <div>
//           <h1 className="text-2xl font-heading font-bold text-foreground">Dashboard</h1>
//           <p className="text-sm text-muted-foreground mt-1">
//             Welcome back, Admin. Manage your fashion store here.
//           </p>
//         </div>

//         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
//           <StatCard title="Total Products" value={statistics?.totalProducts ?? 0} icon={<Package className="w-5 h-5 text-primary" />} delay={0} />
//           <StatCard title="Total Categories" value={statistics?.totalCategories ?? 0} icon={<FolderTree className="w-5 h-5 text-primary" />} delay={0.05} />
//           <StatCard title="Total Orders" value={statistics?.totalOrders ?? 0} icon={<ShoppingCart className="w-5 h-5 text-primary" />} delay={0.1} />
//           <StatCard title="Total Customers" value={statistics?.totalCustomers ?? 0} icon={<Users className="w-5 h-5 text-primary" />} delay={0.15} />
//           <StatCard title="Total Banners" value={statistics?.totalBanners ?? 0} icon={<Image className="w-5 h-5 text-primary" />} delay={0.25} />
//         </div>

//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//           <div className="bg-card rounded-xl border border-border p-6">
//             <h3 className="font-heading font-semibold text-foreground mb-4">Recent Orders</h3>
//             <DataTable
//               columns={[
//                 { key: "order_number", label: "Order ID" },
//                 { key: "customer_name", label: "Customer", render: (r) => r.customer_name || "—" },
//                 { key: "total_amount", label: "Amount", render: (r) => `₹${(r.total_amount || 0).toLocaleString()}` },
//                 {
//                   key: "order_status",
//                   label: "Status",
//                   render: (r) => {
//                     const status = (r.order_status || r.status || "").toLowerCase();
//                     return (
//                       <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[status] || "bg-secondary"}`}>
//                         {formatStatus(r.order_status || r.status)}
//                       </span>
//                     );
//                   },
//                 },
//               ]}
//               data={recentOrders.slice(0, 5)}
//               emptyMessage="No orders yet."
//               paginate={false}
//               searchable={false}
//               embedded
//             />
//           </div>

//           <div className="bg-card rounded-xl border border-border p-6">
//             <h3 className="font-heading font-semibold text-foreground mb-4">Top Selling Products</h3>
//             <DataTable
//               columns={[
//                 {
//                   key: "image",
//                   label: "Image",
//                   render: (r) => (
//                     <img src={r.thumbnail || r.imageUrl} alt={r.name} className="w-10 h-10 rounded-lg object-cover" />
//                   ),
//                 },
//                 { key: "name", label: "Product" },
//                 { key: "sales", label: "Sales", render: (r) => r.total_qty ?? r.total_sales ?? 0 },
//                 { key: "price", label: "Price", render: (r) => `₹${(r.offer_price || r.price || 0).toLocaleString()}` },
//               ]}
//               data={topSelling.length > 0 ? topSelling.slice(0, 5) : allProducts.slice(0, 5)}
//               emptyMessage="No products yet."
//               paginate={false}
//               searchable={false}
//               embedded
//             />
//           </div>
//         </div>

//         <div className="bg-card rounded-xl border border-border p-6">
//           <h3 className="font-heading font-semibold text-foreground mb-4">Low Stock Products</h3>
//           <DataTable
//             columns={[
//               { key: "name", label: "Product" },
//               { key: "category", label: "Category", render: (r) => r.category_name || "—" },
//               {
//                 key: "stock",
//                 label: "Stock",
//                 render: (r) => (
//                   <Badge variant={(r.stock || 0) <= 5 ? "destructive" : "secondary"}>
//                     {r.stock ?? 0} left
//                   </Badge>
//                 ),
//               },
//             ]}
//             data={lowStockProducts}
//             emptyMessage="All products are well stocked."
//             paginate={false}
//             searchable={false}
//             embedded
//           />
//         </div>
//       </div>
//     </PageQueryState>
//   );
// }
