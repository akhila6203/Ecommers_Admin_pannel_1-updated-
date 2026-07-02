import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Trash2, UserCheck, Eye, X, Heart, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import PageQueryState, { TableSkeleton, EmptyState } from "@/components/PageQueryState";
import { Button } from "@/components/ui/button";
import {
  getCustomers,
  getCustomer,
  getCustomerAnalytics,
  blockCustomer,
  deleteCustomer,
} from "@/services/customerService";

export default function Customers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customers", page],
    queryFn: () => getCustomers({ page, limit: 20 }),
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["customers-analytics"],
    queryFn: getCustomerAnalytics,
  });

  const { data: customerDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["customer", detailId],
    queryFn: () => getCustomer(detailId),
    enabled: !!detailId,
  });

  const customers = data?.data || [];
  const pagination = data?.pagination;
  const analytics = analyticsData?.data;
  const customer = customerDetail?.data;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customers"] });

  const blockMutation = useMutation({
    mutationFn: (id) => blockCustomer(id),
    onSuccess: (res) => {
      invalidate();
      if (detailId) queryClient.invalidateQueries({ queryKey: ["customer", detailId] });
      toast.success(res.message || "Customer status updated.");
    },
    onError: (err) => toast.error(err.message || "Failed to update customer"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCustomer(id),
    onSuccess: () => {
      invalidate();
      setDetailId(null);
      toast.success("Customer deleted.");
    },
    onError: (err) => toast.error(err.message || "Failed to delete customer"),
  });

  const handleBlock = (customerRow) => {
    const action = customerRow.status === "blocked" ? "unblock" : "block";
    const name = `${customerRow.first_name || ""} ${customerRow.last_name || ""}`.trim() || customerRow.email;
    if (window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} customer "${name}"?`)) {
      blockMutation.mutate(customerRow.id);
    }
  };

  const handleDelete = (customerRow) => {
    const name = `${customerRow.first_name || ""} ${customerRow.last_name || ""}`.trim() || customerRow.email;
    if (window.confirm(`Permanently delete customer "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate(customerRow.id);
    }
  };

  const statusBadge = (status) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
      status === "blocked" ? "bg-red-100 text-red-700" : status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
    }`}>
      {status || "active"}
    </span>
  );

  return (
    <PageQueryState
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      skeleton={<TableSkeleton rows={6} cols={5} />}
    >
      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Website users synced to backend — {pagination?.total ?? customers.length} registered customers
          </p>
        </div>

        {analytics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-heading font-bold text-primary">{analytics.total}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Customers</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-heading font-bold text-green-600">{analytics.active}</p>
              <p className="text-xs text-muted-foreground mt-1">Active</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-heading font-bold text-red-600">{analytics.blocked}</p>
              <p className="text-xs text-muted-foreground mt-1">Blocked</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-heading font-bold text-blue-600">{analytics.newThisMonth}</p>
              <p className="text-xs text-muted-foreground mt-1">New This Month</p>
            </div>
          </div>
        )}

        {customers.length === 0 ? (
          <EmptyState message="No customers yet. Users will appear here when they register on the website." />
        ) : (
          <DataTable
            columns={[
              {
                key: "name",
                label: "Name",
                render: (r) => `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.name || "—",
              },
              { key: "email", label: "Email" },
              { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
              { key: "order_count", label: "Orders", render: (r) => r.order_count ?? r.total_orders ?? 0 },
              {
                key: "cart_count",
                label: "Cart",
                render: (r) => (
                  <span className="inline-flex items-center gap-1">
                    <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
                    {r.cart_count ?? 0}
                  </span>
                ),
              },
              {
                key: "wishlist_count",
                label: "Wishlist",
                render: (r) => (
                  <span className="inline-flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-muted-foreground" />
                    {r.wishlist_count ?? 0}
                  </span>
                ),
              },
              {
                key: "total_spent",
                label: "Total Spent",
                render: (r) => `₹${Number(r.total_spent_amount ?? r.total_spent ?? 0).toLocaleString()}`,
              },
              { key: "status", label: "Status", render: (r) => statusBadge(r.status) },
              {
                key: "actions",
                label: "Actions",
                render: (r) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setDetailId(r.id)} title="View details">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBlock(r)}
                      disabled={blockMutation.isPending}
                      title={r.status === "blocked" ? "Unblock" : "Block"}
                    >
                      {r.status === "blocked" ? <UserCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(r)}
                      disabled={deleteMutation.isPending}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
            data={customers}
            searchPlaceholder="Search by name or email..."
            searchKeys={["first_name", "last_name", "email", "phone"]}
            itemLabel="customers"
            paginate={true}
            paginate={true}
            page={page}
            setPage={setPage}
            pagination={pagination}
          />
        )}

        {/* {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground self-center">Page {pagination.page} of {pagination.totalPages}</span>
            <Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )} */}

        {detailId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {customer ? `${customer.first_name} ${customer.last_name}` : "Customer Details"}
                </h2>
                <button type="button" onClick={() => setDetailId(null)}><X className="w-5 h-5" /></button>
              </div>

              {detailLoading ? (
                <TableSkeleton rows={4} cols={2} />
              ) : customer ? (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Email:</span> {customer.email}</div>
                    <div><span className="text-muted-foreground">Phone:</span> {customer.phone || "—"}</div>
                    <div><span className="text-muted-foreground">Status:</span> {statusBadge(customer.status)}</div>
                    <div><span className="text-muted-foreground">Joined:</span> {customer.created_at ? new Date(customer.created_at).toLocaleDateString() : "—"}</div>
                    <div><span className="text-muted-foreground">Cart Items:</span> {customer.cart_count ?? customer.cart_items?.length ?? 0}</div>
                    <div><span className="text-muted-foreground">Wishlist Items:</span> {customer.wishlist_count ?? customer.wishlist_items?.length ?? 0}</div>
                  </div>

                  {(customer.cart_items?.length > 0) && (
                    <div>
                      <h3 className="font-medium mb-2 flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Cart</h3>
                      <ul className="text-sm space-y-1 border border-border rounded-lg p-3">
                        {customer.cart_items.map((item) => (
                          <li key={item.id} className="flex justify-between">
                            <span>{item.product_name} × {item.quantity}</span>
                            <span>₹{Number(item.item_price || item.offer_price || item.price || 0).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(customer.wishlist_items?.length > 0) && (
                    <div>
                      <h3 className="font-medium mb-2 flex items-center gap-2"><Heart className="w-4 h-4" /> Wishlist</h3>
                      <ul className="text-sm space-y-1 border border-border rounded-lg p-3">
                        {customer.wishlist_items.map((item) => (
                          <li key={item.id} className="flex justify-between">
                            <span>{item.product_name}</span>
                            <span>₹{Number(item.offer_price || item.price || 0).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(customer.orders?.length > 0) && (
                    <div>
                      <h3 className="font-medium mb-2">Orders ({customer.orders.length})</h3>
                      <ul className="text-sm space-y-1 border border-border rounded-lg p-3">
                        {customer.orders.map((order) => (
                          <li key={order.id} className="flex justify-between">
                            <span>#{order.order_number} — {order.order_status}</span>
                            <span>₹{Number(order.total_amount || 0).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Customer not found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </PageQueryState>
  );
}
