import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UICustomizationProvider } from "@/contexts/UICustomizationContext";

import { AppLayout } from "@/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import AddProduct from "@/pages/AddProduct";
import ProductList from "@/pages/ProductList";
import Categories from "@/pages/Categories";
import Collections from "@/pages/Collections";
import Orders from "@/pages/Orders";
import Customers from "@/pages/Customers";
import Offers from "@/pages/Offers";
import Conditions from "@/pages/Conditions";
import Gallery from "@/pages/Gallery";
import Settings from "@/pages/Settings";
import AdminSettings from "@/pages/AdminSettings";
import StoreSettings from "@/pages/StoreSettings";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60000,
    },
  },
});

function EditProductPage() {
  const { id } = useParams();
  return <AddProduct key={`edit-${id}`} />;
}

function SeoProductPage() {
  const { id } = useParams();
  return <AddProduct key={`seo-${id}`} />;
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UICustomizationProvider>
          <TooltipProvider>
            <BrowserRouter>
              <Toaster />
              <Sonner />
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/products/add" element={<AddProduct key="add" />} />
                  <Route path="/products/edit/:id" element={<EditProductPage />} />
                  <Route path="/products/:id/seo" element={<SeoProductPage />} />
                  <Route path="/products/list" element={<ProductList />} />
                  <Route path="/categories/:type" element={<Categories />} />
                  <Route path="/collections" element={<Collections />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/offers" element={<Offers />} />
                  <Route path="/conditions" element={<Conditions />} />
                  <Route path="/gallery" element={<Gallery />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/admin" element={<AdminSettings />} />
                  <Route path="/settings/store" element={<StoreSettings />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </UICustomizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
