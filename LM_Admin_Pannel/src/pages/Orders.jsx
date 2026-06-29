import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import PageQueryState, { TableSkeleton } from "@/components/PageQueryState";
import { Button } from "@/components/ui/button";
// import { Label } from "@/components/ui/label";
import {
  getOrders,
  getOrder,
  getOrderStats,
  // updateOrderStatus,
  // updatePaymentStatus,
  // cancelOrder,
  createShiprocketShipment,
  syncShiprocketTracking,
  generateShiprocketLabel,
  scheduleShiprocketPickup,
} from "@/services/orderService";

const ORDER_STATUSES = ["pending", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];

function formatStatus(status) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusBadge(status) {
  const s = (status || "").toLowerCase();
  const colors = {
    delivered: "bg-green-100 text-green-700",
    shipped: "bg-blue-100 text-blue-700",
    packed: "bg-indigo-100 text-indigo-700",
    confirmed: "bg-yellow-100 text-yellow-700",
    pending: "bg-orange-100 text-orange-700",
    cancelled: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[s] || "bg-secondary"}`}>
      {formatStatus(status)}
    </span>
  );
}

function paymentBadge(status) {
  const s = (status || "").toLowerCase();
  const colors = {
    paid: "bg-green-100 text-green-700",
    pending: "bg-orange-100 text-orange-700",
    failed: "bg-red-100 text-red-700",
    refunded: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[s] || "bg-secondary"}`}>
      {formatStatus(status)}
    </span>
  );
}

export default function Orders() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [detailId, setDetailId] = useState(null);
  // const [statusDraft, setStatusDraft] = useState("");
  // const [paymentDraft, setPaymentDraft] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["orders", page, statusFilter],
    queryFn: () => getOrders({ page, limit: 20, ...(statusFilter ? { status: statusFilter } : {}) }),
  });

  const { data: statsData } = useQuery({
    queryKey: ["orders-stats"],
    queryFn: getOrderStats,
  });

  const orders = data?.data || [];
  const pagination = data?.pagination;
  const stats = statsData?.data;

  const { data: orderDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["order", detailId],
    queryFn: () => getOrder(detailId),
    enabled: !!detailId,
  });

  const order = orderDetail?.data;

  // useEffect(() => {
  //   if (order) {
  //     setStatusDraft(order.order_status || "");
  //     setPaymentDraft(order.payment_status || "");
  //   }
  // }, [order]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["orders-stats"] });
    if (detailId) queryClient.invalidateQueries({ queryKey: ["order", detailId] });
  };

  // const statusMutation = useMutation({
  //   mutationFn: ({ id, status }) => updateOrderStatus(id, status),
  //   onSuccess: () => { invalidate(); toast.success("Order status updated."); },
  //   onError: (err) => toast.error(err.message || "Failed to update status"),
  // });

  // const paymentMutation = useMutation({
  //   mutationFn: ({ id, paymentStatus }) => updatePaymentStatus(id, paymentStatus),
  //   onSuccess: () => { invalidate(); toast.success("Payment status updated."); },
  //   onError: (err) => toast.error(err.message || "Failed to update payment"),
  // });

  // const cancelMutation = useMutation({
  //   mutationFn: (id) => cancelOrder(id),
  //   onSuccess: () => {
  //     invalidate();
  //     setStatusDraft("cancelled");
  //     toast.success("Order cancelled.");
  //   },
  //   onError: (err) => toast.error(err.message || "Failed to cancel order"),
  // });

  const shiprocketCreateMutation = useMutation({
    mutationFn: (id) => createShiprocketShipment(id),
    onSuccess: () => {
      invalidate();
      toast.success("Shiprocket shipment created.");
    },
    onError: (err) =>
  toast.error(
    err.response?.data?.message ||
    err.response?.data?.data?.message ||
    err.message ||
    "Failed to create Shiprocket shipment"
  ),
    // onError: (err) => toast.error(err.message || "Failed to create Shiprocket shipment"),
  });

  const shiprocketSyncMutation = useMutation({
    mutationFn: (id) => syncShiprocketTracking(id),
    onSuccess: () => {
      invalidate();
      toast.success("Tracking synced from Shiprocket.");
    },
    onError: (err) => toast.error(err.message || "Failed to sync tracking"),
  });

  const labelMutation = useMutation({
  mutationFn: (id) => generateShiprocketLabel(id),
  onSuccess: () => {
    invalidate();
    toast.success("Shipping label generated.");
  },
  onError: (err) => toast.error(err.response?.data?.message || "Failed to generate label"),
});

const pickupMutation = useMutation({
  mutationFn: (id) => scheduleShiprocketPickup(id),
  onSuccess: () => {
    invalidate();
    toast.success("Pickup scheduled.");
  },
  onError: (err) => toast.error(err.response?.data?.message || "Failed to schedule pickup"),
});

  const statusCards = [
    { key: "", label: "All", count: stats?.total_orders ?? pagination?.total ?? orders.length },
    { key: "pending", label: "Pending", count: stats?.by_status?.pending ?? 0 },
    { key: "confirmed", label: "Confirmed", count: stats?.by_status?.confirmed ?? 0 },
    { key: "shipped", label: "Shipped", count: stats?.by_status?.shipped ?? 0 },
    { key: "delivered", label: "Delivered", count: stats?.by_status?.delivered ?? 0 },
  ];

  return (
    <PageQueryState
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      skeleton={<TableSkeleton rows={6} cols={6} />}
    >
      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time orders from website checkout — {pagination?.total ?? orders.length} total
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-heading font-bold text-primary">{stats.today_orders}</p>
              <p className="text-xs text-muted-foreground mt-1">Today&apos;s Orders</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-heading font-bold text-green-600">₹{Number(stats.today_revenue || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Today&apos;s Revenue</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-heading font-bold">{stats.total_orders}</p>
              <p className="text-xs text-muted-foreground mt-1">All Orders</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-heading font-bold">₹{Number(stats.total_revenue || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Revenue</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {statusCards.map(({ key, label, count }) => (
            <button
              key={key || "all"}
              type="button"
              onClick={() => { setStatusFilter(key); setPage(1); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                statusFilter === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:bg-secondary"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        <DataTable
          columns={[
            { key: "order_number", label: "Order ID" },
            {
              key: "customer_name",
              label: "Customer",
              render: (r) => r.shipping_name || `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email || "—",
            },
            {
              key: "items_count",
              label: "Items",
              render: (r) => r.items_count ?? "—",
            },
            {
              key: "total_amount",
              label: "Amount",
              render: (r) => `₹${(r.total_amount || 0).toLocaleString()}`,
            },
            {
              key: "payment_method",
              label: "Payment",
              render: (r) => (r.payment_method || "online").toUpperCase(),
            },
            {
              key: "payment_status",
              label: "Paid",
              render: (r) => paymentBadge(r.payment_status),
            },
            {
              key: "created_at",
              label: "Date",
              render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"),
            },
            {
              key: "order_status",
              label: "Status",
              render: (r) => statusBadge(r.order_status || r.status),
            },
            {
              key: "actions",
              label: "",
              render: (r) => (
                <Button size="sm" variant="outline" onClick={() => setDetailId(r.id)}>
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Button>
              ),
            },
          ]}
          data={orders}
          searchPlaceholder="Search orders..."
          itemLabel="orders"
          paginate={false}
        />

        {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground self-center">Page {pagination.page} of {pagination.totalPages}</span>
            <Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}

        {detailId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Order #{order?.order_number || detailId}</h2>
                <button type="button" onClick={() => setDetailId(null)}><X className="w-5 h-5" /></button>
              </div>

              {detailLoading ? (
                <TableSkeleton rows={4} cols={2} />
              ) : order ? (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Customer:</span> {order.customer?.first_name} {order.customer?.last_name || order.shipping_name}</div>
                    <div><span className="text-muted-foreground">Email:</span> {order.email || order.customer?.email || "—"}</div>
                    <div><span className="text-muted-foreground">Phone:</span> {order.phone || order.shipping_phone || "—"}</div>
                    <div><span className="text-muted-foreground">Total:</span> ₹{(order.total_amount || 0).toLocaleString()}</div>
                    <div><span className="text-muted-foreground">Payment:</span> {(order.payment_method || "online").toUpperCase()} — {paymentBadge(order.payment_status)}</div>
                    <div><span className="text-muted-foreground">Source:</span> Website Checkout</div>
                  </div>

                  <div className="text-sm border border-border rounded-lg p-3">
                    <p className="font-medium mb-1">Shipping Address</p>
                    <p>{order.shipping_name}, {order.shipping_phone}</p>
                    <p>{order.shipping_address}, {order.shipping_city}, {order.shipping_state} — {order.shipping_pincode}</p>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">Items</h3>
                    <ul className="text-sm space-y-1 border border-border rounded-lg p-3">
                      {(order.items || []).map((item) => (
                        <li key={item.id} className="flex justify-between">
                          <span>{item.product_name || item.name} × {item.quantity}</span>
                          <span>₹{(item.total_price || item.price || 0).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {(order.timeline?.length > 0) && (
                    <div>
                      <h3 className="font-medium mb-2">Timeline</h3>
                      <ul className="text-sm space-y-1 border border-border rounded-lg p-3">
                        {order.timeline.map((entry, idx) => (
                          <li key={idx} className="flex justify-between text-muted-foreground">
                            <span>{formatStatus(entry.status)} — {entry.note}</span>
                            <span>{entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(order.awb_code || order.courier_name || order.tracking_url) && (
                    <div className="text-sm border border-border rounded-lg p-3 space-y-1">
                      <p className="font-medium mb-1">Shiprocket Tracking</p>
                      {order.courier_name && (
                        <p><span className="text-muted-foreground">Courier:</span> {order.courier_name}</p>
                      )}
                      {order.awb_code && (
                        <p><span className="text-muted-foreground">AWB:</span> {order.awb_code}</p>
                      )}
                      {order.tracking_url && (
                        <a
                          href={order.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-xs"
                        >
                          Open tracking link
                        </a>
                      )}
                    </div>
                  )}

                  {/* <div className="flex flex-wrap gap-2">
  <Button
    size="sm"
    onClick={() => shiprocketCreateMutation.mutate(detailId)}
    disabled={!!order.awb_code || order.payment_status !== "paid" || shiprocketCreateMutation.isPending}
  >
    Create Shipment
  </Button>

  <Button
    size="sm"
    variant="secondary"
    onClick={() => labelMutation.mutate(detailId)}
    disabled={!order.awb_code || labelMutation.isPending}
  >
    Generate Label
  </Button>

  <Button
    size="sm"
    variant="secondary"
    onClick={() => pickupMutation.mutate(detailId)}
    disabled={!order.awb_code || pickupMutation.isPending}
  >
    Schedule Pickup
  </Button>

  <Button
    size="sm"
    variant="outline"
    onClick={() => shiprocketSyncMutation.mutate(detailId)}
    disabled={!order.awb_code || shiprocketSyncMutation.isPending}
  >
    Sync Tracking
  </Button>

  {order.shiprocket_label_url && (
    <a
      href={order.shiprocket_label_url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-primary underline self-center"
    >
      Download Label
    </a>
  )}
</div> */}

                  <div className="mt-4 space-y-3">
  <h4 className="font-medium">Shipment Workflow</h4>

  <div className="flex flex-wrap gap-2">
    <Button
  size="sm"
  onClick={() => shiprocketCreateMutation.mutate(detailId)}
  disabled={
    !!order.awb_code ||
    order.payment_status !== "paid" ||
    ["shipped", "out_for_delivery", "delivered", "cancelled", "returned", "refunded"].includes(order.order_status) ||
    shiprocketCreateMutation.isPending
  }
>
  {order.awb_code ? "Shipment Created" : "Create Shipment"}
</Button>
    {/* <Button
      size="sm"
      onClick={() => shiprocketCreateMutation.mutate(detailId)}
      disabled={
        !!order.awb_code ||
        order.payment_status !== "paid" ||
        shiprocketCreateMutation.isPending
      }
      
    >
      {order.awb_code ? "Shipment Created" : "Create Shipment"}
    </Button> */}

    <Button
      size="sm"
      variant="secondary"
      onClick={() => labelMutation.mutate(detailId)}
      disabled={!order.awb_code || labelMutation.isPending}
    >
      Generate Label
    </Button>

    <Button
      size="sm"
      variant="secondary"
      onClick={() => pickupMutation.mutate(detailId)}
      disabled={!order.awb_code || pickupMutation.isPending}
    >
      Schedule Pickup
    </Button>

    <Button
      size="sm"
      variant="outline"
      onClick={() => shiprocketSyncMutation.mutate(detailId)}
      disabled={!order.awb_code || shiprocketSyncMutation.isPending}
    >
      Sync Tracking
    </Button>

    {order.shiprocket_label_url && (
      <a
        href={order.shiprocket_label_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary underline self-center"
      >
        Download Label
      </a>
    )}
  </div>

  {order.awb_code && (
    <div className="border rounded-lg p-3 text-sm space-y-1">
      <p>
        <span className="text-muted-foreground">Courier:</span>{" "}
        {order.courier_name || order.shipping_method || "Shiprocket"}
      </p>
      <p>
        <span className="text-muted-foreground">AWB:</span>{" "}
        {order.awb_code}
      </p>
      <p>
        <span className="text-muted-foreground">Pickup:</span>{" "}
        {order.shiprocket_pickup_status || "Not scheduled"}
      </p>

      {order.tracking_url && (
        <a
          href={order.tracking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          Open Tracking
        </a>
      )}
    </div>
  )}

  <div className="text-xs text-muted-foreground">
    Payment Status:{" "}
    <span className="font-medium capitalize">
      {order.payment_status}
    </span>
    {" "} | Order Status:{" "}
    <span className="font-medium capitalize">
      {String(order.order_status || "").replaceAll("_", " ")}
    </span>
  </div>
</div>
                  {/* <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Order Status</Label>
                      <select
                        value={statusDraft}
                        onChange={(e) => setStatusDraft(e.target.value)}
                        className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>{formatStatus(s)}</option>
                        ))}
                      </select>
                      <Button
                        className="mt-2 w-full"
                        size="sm"
                        onClick={() => statusMutation.mutate({ id: detailId, status: statusDraft })}
                        disabled={statusMutation.isPending}
                      >
                        Update Status
                      </Button>
                    </div>
                    <div>
                      <Label>Payment Status</Label>
                      <select
                        value={paymentDraft}
                        onChange={(e) => setPaymentDraft(e.target.value)}
                        className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                      >
                        {PAYMENT_STATUSES.map((s) => (
                          <option key={s} value={s}>{formatStatus(s)}</option>
                        ))}
                      </select>
                      <Button
                        className="mt-2 w-full"
                        size="sm"
                        variant="secondary"
                        onClick={() => paymentMutation.mutate({ id: detailId, paymentStatus: paymentDraft })}
                        disabled={paymentMutation.isPending}
                      >
                        Update Payment
                      </Button>
                    </div>
                  </div> */}

                  {/* {order.order_status !== "cancelled" && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (window.confirm("Cancel this order? Stock will be restored.")) {
                          cancelMutation.mutate(detailId);
                        }
                      }}
                      disabled={cancelMutation.isPending}
                    >
                      Cancel Order
                    </Button>
                  )} */}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Order not found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </PageQueryState>
  );
}
