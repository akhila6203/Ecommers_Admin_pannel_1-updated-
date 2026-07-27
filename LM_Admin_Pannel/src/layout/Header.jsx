// import { Search, ExternalLink, LogOut, User, Store, ChevronDown, X, Moon, Sun, Sparkles } from "lucide-react";
import { useState } from "react";
import { Search, ExternalLink, LogOut, User, Store, ChevronDown, X, Moon, Sun, Sparkles, Menu } from "lucide-react";
import { logout as logoutApi } from "@/services/authService";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./SidebarContext";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/services/authService";
import { useTheme } from "@/contexts/ThemeContext";
import { useStoreBranding } from "@/contexts/StoreBrandingContext";


const ADMIN_SEARCH_ITEMS = [
  {
    label: "Dashboard",
    path: "/",
    keywords: ["dashboard", "home", "overview", "stats"],
  },
  {
    label: "Add Product",
    path: "/products/add",
    keywords: ["add product", "create product", "new product"],
  },
  {
    label: "Product List",
    path: "/products/list",
    keywords: [
      "product",
      "products",
      "product list",
      "manage products",
      "inventory",
      "stock",
    ],
  },
  {
    label: "Main Categories",
    path: "/categories/main",
    keywords: [
      "category",
      "categories",
      "main category",
      "main categories",
    ],
  },
  {
    label: "Sub Categories",
    path: "/categories/sub",
    keywords: [
      "sub category",
      "sub categories",
      "subcategory",
      "subcategories",
    ],
  },
  {
    label: "Child Categories",
    path: "/categories/child",
    keywords: [
      "child category",
      "child categories",
      "childcategory",
    ],
  },
  {
    label: "Collections",
    path: "/collections",
    keywords: ["collection", "collections"],
  },
  {
    label: "Orders",
    path: "/orders",
    keywords: [
      "order",
      "orders",
      "order list",
      "shipping",
      "shipment",
      "tracking",
    ],
  },
  {
    label: "Customers",
    path: "/customers",
    keywords: [
      "customer",
      "customers",
      "customer list",
      "users",
      "buyers",
    ],
  },
  {
    label: "Offers / Coupons",
    path: "/offers",
    keywords: [
      "offer",
      "offers",
      "coupon",
      "coupons",
      "discount",
      "discounts",
    ],
  },
  {
    label: "Banners",
    path: "/gallery",
    keywords: [
      "banner",
      "banners",
      "gallery",
      "banner video",
      "media",
    ],
  },
  {
    label: "Pages",
    path: "/conditions",
    keywords: [
      "page",
      "pages",
      "privacy",
      "terms",
      "contact",
      "about",
      "conditions",
    ],
  },
  {
    label: "Store Settings",
    path: "/settings/store",
    keywords: [
      "store settings",
      "store",
      "shipping settings",
      "payment settings",
      "integration",
      "shiprocket",
      "razorpay",
      "whatsapp",
    ],
  },
  {
    label: "Admin Settings",
    path: "/settings/admin",
    keywords: [
      "admin settings",
      "admin",
      "profile",
      "administrator",
    ],
  },
];

function SlidePanel({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-80 bg-card border-l border-border shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-heading font-semibold text-foreground">{title}</h3>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Header() {
  const { collapsed, setMobileOpen } = useSidebar();
  // const { collapsed } = useSidebar();
  const navigate = useNavigate();
  const { logoUrl, storeName, logoSize } = useStoreBranding();
  const { data: adminProfile } = useQuery({
    queryKey: ["adminProfile"],
    queryFn: () => getProfile().then((r) => r.data || {}),
    staleTime: 300000,
  });
  const admin = {
    name: adminProfile?.name ?? "",
    email: adminProfile?.email ?? "",
  };
  const { isDark, toggle: toggleTheme } = useTheme();
  const [openPanel, setOpenPanel] = useState("none");
  const [search, setSearch] = useState("");
  const [showSearchResults, setShowSearchResults] =
  useState(false);

  const normalizedSearch = search.trim().toLowerCase();

const filteredSearchItems = normalizedSearch
  ? ADMIN_SEARCH_ITEMS.filter((item) => {
      const searchableText = [
        item.label,
        ...item.keywords,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    }).slice(0, 6)
  : [];

const openSearchItem = (item) => {
  navigate(item.path);
  setSearch("");
  setShowSearchResults(false);
};

const handleSearchSubmit = (event) => {
  event.preventDefault();

  if (!normalizedSearch) {
    return;
  }

  if (filteredSearchItems.length > 0) {
    openSearchItem(filteredSearchItems[0]);
  }
};

  const closePanel = () => setOpenPanel("none");
  const togglePanel = (panel) => setOpenPanel((prev) => (prev === panel ? "none" : panel));
  const initials = admin.name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "LA";

  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to logout?")) return;
    setLoggingOut(true);
    closePanel();
    try {
      await logoutApi();
    } catch (err) {
      // Proceed with logout even if API call fails
    }
    
    // localStorage.removeItem("lm_admin_token");
    // localStorage.removeItem("lm_admin_user");
    // localStorage.removeItem("lm_admin_refresh_token");
    navigate("/login");
    setLoggingOut(false);
  };

  return (
    <>
    <header
  className="fixed top-0 right-0 z-30 h-16 bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-3 sm:px-6 transition-all duration-300"
  style={{
    left:
      window.innerWidth >= 1024
        ? collapsed
          ? 72
          : 260
        : window.innerWidth >= 768
        ? 72
        : 0,
  }}
>
    {/* <header
  className="fixed top-0 right-0 left-0 md:left-[72px] lg:left-[260px] z-30 h-16 bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-3 sm:px-6 transition-all duration-300"
> */}
      {/* <header
        className="fixed top-0 right-0 z-30 h-16 bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-6 transition-all duration-300"
        style={{ left: collapsed ? 72 : 260 }}
      > */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
    onClick={() => setMobileOpen(true)}
    className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
  >
    <Menu className="w-5 h-5" />
  </button>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={storeName}
              style={{ width: Math.min(logoSize, 32), height: Math.min(logoSize, 32) }}
              className="rounded-md object-contain shrink-0 block"
              // className="rounded-md object-contain shrink-0 hidden sm:block"
            />
          ) : (
            <div
              style={{ width: 32, height: 32 }}
              className="rounded-md bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20"
              // className="rounded-md bg-primary flex items-center justify-center shrink-0 hidden sm:flex shadow-sm shadow-primary/20"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
          )}
          {/* <div className="relative max-w-md flex-1 hidden sm:block">
          
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, orders, customers..."
            className="w-full h-10 pl-10 pr-4 rounded-lg bg-secondary border border-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition"
          />
        </div> */}
        <div className="relative max-w-md flex-1 hidden sm:block">
  <form
    onSubmit={handleSearchSubmit}
    className="relative"
  >
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />

    <input
      type="text"
      value={search}
      onChange={(event) => {
        setSearch(event.target.value);
        setShowSearchResults(true);
      }}
      onFocus={() =>
        setShowSearchResults(true)
      }
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setShowSearchResults(false);
        }
      }}
      placeholder="Search products, orders, customers..."
      autoComplete="off"
      className="w-full h-10 pl-10 pr-10 rounded-lg bg-secondary border border-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition"
    />

    {search && (
      <button
        type="button"
        onClick={() => {
          setSearch("");
          setShowSearchResults(false);
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label="Clear search"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </form>

  {showSearchResults &&
    normalizedSearch && (
      <div className="absolute left-0 right-0 top-[46px] z-50 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        {filteredSearchItems.length > 0 ? (
          <div className="py-1">
            {filteredSearchItems.map(
              (item) => (
                <button
                  key={item.path}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    openSearchItem(item);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-foreground transition hover:bg-secondary"
                >
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />

                  <div className="min-w-0">
                    <p className="font-medium">
                      {item.label}
                    </p>

                    <p className="truncate text-xs text-muted-foreground">
                      {item.path}
                    </p>
                  </div>
                </button>
              )
            )}
          </div>
        ) : (
          <div className="px-4 py-4 text-sm text-muted-foreground">
            No admin page found for
            <span className="ml-1 font-medium text-foreground">
              “{search}”
            </span>
          </div>
        )}
      </div>
    )}
</div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex gap-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
            // onClick={() => window.open("https://lmshoppingmall.com", "_blank")}
            onClick={() => window.open("http://localhost:8082/", "_blank")}
          >
            <ExternalLink className="w-4 h-4" />
            View Website
          </Button>

          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* <button
            onClick={() => togglePanel("notifications")}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition relative text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-card" />
          </button> */}

          <button
            onClick={() => togglePanel("profile")}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-secondary ml-1"
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-xs">
              {initials}
            </div>
            <span className="hidden md:inline text-sm font-medium text-foreground">{admin.name}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${openPanel === "profile" ? "rotate-180" : ""}`} />
          </button>
        </div>
      </header>

      {/* <SlidePanel open={openPanel === "notifications"} onClose={closePanel} title="Notifications">
        <div className="px-4 py-2 flex items-center justify-between border-b border-border">
          <span className="text-[11px] font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            {notifications.filter((n) => n.unread).length} new
          </span>
        </div>
        <div>
          {notifications.map((n, i) => (
            <div
              key={i}
              className={`px-4 py-4 flex items-start gap-3 hover:bg-secondary/50 cursor-pointer transition-colors border-b border-border/50 ${
                n.unread ? "bg-primary/[0.03]" : ""
              }`}
            >
              {n.unread && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
              <div className={n.unread ? "" : "ml-5"}>
                <p className="text-sm text-foreground leading-snug">{n.text}</p>
                <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      </SlidePanel> */}

      <SlidePanel open={openPanel === "profile"} onClose={closePanel} title="Account">
        <div className="p-5 flex items-center gap-4 border-b border-border">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
            {initials}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{admin.name}</p>
            <p className="text-xs text-muted-foreground">{admin.email}</p>
          </div>
        </div>
        <div className="p-3 space-y-1">
          <button
            onClick={() => { closePanel(); navigate("/settings/admin?section=profile"); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-foreground hover:bg-secondary transition-colors"
          >
            <User className="w-4 h-4 text-muted-foreground" />
            Admin Profile
          </button>
          <button
            onClick={() => { closePanel(); navigate("/settings/store?section=store-profile"); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-foreground hover:bg-secondary transition-colors"
          >
            <Store className="w-4 h-4 text-muted-foreground" />
            Store Profile
          </button>
          <div className="border-t border-border my-2" />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </SlidePanel>
    </>
  );
}




// // import { Search, ExternalLink, LogOut, User, Store, ChevronDown, X, Moon, Sun, Sparkles } from "lucide-react";
// import { useState } from "react";
// import { Search, ExternalLink, LogOut, User, Store, ChevronDown, X, Moon, Sun, Sparkles, Menu } from "lucide-react";
// import { logout as logoutApi } from "@/services/authService";
// import { useNavigate } from "react-router-dom";
// import { AnimatePresence, motion } from "framer-motion";
// import { Button } from "@/components/ui/button";
// import { useSidebar } from "./SidebarContext";
// import { useQuery } from "@tanstack/react-query";
// import { getProfile } from "@/services/authService";
// import { useTheme } from "@/contexts/ThemeContext";
// import { useStoreBranding } from "@/contexts/StoreBrandingContext";



// function SlidePanel({ open, onClose, title, children }) {
//   return (
//     <AnimatePresence>
//       {open && (
//         <>
//           <motion.div
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             exit={{ opacity: 0 }}
//             className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
//             onClick={onClose}
//           />
//           <motion.div
//             initial={{ x: "100%" }}
//             animate={{ x: 0 }}
//             exit={{ x: "100%" }}
//             transition={{ type: "spring", damping: 30, stiffness: 300 }}
//             className="fixed right-0 top-0 z-50 h-full w-80 bg-card border-l border-border shadow-2xl flex flex-col"
//           >
//             <div className="flex items-center justify-between px-5 py-4 border-b border-border">
//               <h3 className="font-heading font-semibold text-foreground">{title}</h3>
//               <button
//                 onClick={onClose}
//                 className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition"
//               >
//                 <X className="w-4 h-4" />
//               </button>
//             </div>
//             <div className="flex-1 overflow-y-auto">{children}</div>
//           </motion.div>
//         </>
//       )}
//     </AnimatePresence>
//   );
// }

// export function Header() {
//   const { collapsed, setMobileOpen } = useSidebar();
//   // const { collapsed } = useSidebar();
//   const navigate = useNavigate();
//   const { logoUrl, storeName, logoSize } = useStoreBranding();
//   const { data: adminProfile } = useQuery({
//     queryKey: ["adminProfile"],
//     queryFn: () => getProfile().then((r) => r.data || {}),
//     staleTime: 300000,
//   });
//   const admin = {
//     name: adminProfile?.name ?? "",
//     email: adminProfile?.email ?? "",
//   };
//   const { isDark, toggle: toggleTheme } = useTheme();
//   const [openPanel, setOpenPanel] = useState("none");
//   const [search, setSearch] = useState("");


//   const closePanel = () => setOpenPanel("none");
//   const togglePanel = (panel) => setOpenPanel((prev) => (prev === panel ? "none" : panel));
//   const initials = admin.name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "LA";

//   const [loggingOut, setLoggingOut] = useState(false);

//   const handleLogout = async () => {
//     if (!window.confirm("Are you sure you want to logout?")) return;
//     setLoggingOut(true);
//     closePanel();
//     try {
//       await logoutApi();
//     } catch (err) {
//       // Proceed with logout even if API call fails
//     }
    
//     // localStorage.removeItem("lm_admin_token");
//     // localStorage.removeItem("lm_admin_user");
//     // localStorage.removeItem("lm_admin_refresh_token");
//     navigate("/login");
//     setLoggingOut(false);
//   };

//   return (
//     <>
//     <header
//   className="fixed top-0 right-0 z-30 h-16 bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-3 sm:px-6 transition-all duration-300"
//   style={{
//     left:
//       window.innerWidth >= 1024
//         ? collapsed
//           ? 72
//           : 260
//         : window.innerWidth >= 768
//         ? 72
//         : 0,
//   }}
// >
//     {/* <header
//   className="fixed top-0 right-0 left-0 md:left-[72px] lg:left-[260px] z-30 h-16 bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-3 sm:px-6 transition-all duration-300"
// > */}
//       {/* <header
//         className="fixed top-0 right-0 z-30 h-16 bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-6 transition-all duration-300"
//         style={{ left: collapsed ? 72 : 260 }}
//       > */}
//         <div className="flex items-center gap-3 flex-1 min-w-0">
//           <button
//     onClick={() => setMobileOpen(true)}
//     className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
//   >
//     <Menu className="w-5 h-5" />
//   </button>
//           {logoUrl ? (
//             <img
//               src={logoUrl}
//               alt={storeName}
//               style={{ width: Math.min(logoSize, 32), height: Math.min(logoSize, 32) }}
//               className="rounded-md object-contain shrink-0 block"
//               // className="rounded-md object-contain shrink-0 hidden sm:block"
//             />
//           ) : (
//             <div
//               style={{ width: 32, height: 32 }}
//               className="rounded-md bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20"
//               // className="rounded-md bg-primary flex items-center justify-center shrink-0 hidden sm:flex shadow-sm shadow-primary/20"
//             >
//               <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
//             </div>
//           )}
//           {/* <div className="relative max-w-md flex-1 hidden sm:block">
          
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
//           <input
//             type="text"
//             value={search}
//             onChange={(e) => setSearch(e.target.value)}
//             placeholder="Search products, orders, customers..."
//             className="w-full h-10 pl-10 pr-4 rounded-lg bg-secondary border border-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition"
//           />
//         </div> */}

//         </div>

//         <div className="flex items-center gap-2">
//           <Button
//             variant="outline"
//             size="sm"
//             className="hidden sm:flex gap-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
//             // onClick={() => window.open("https://lmshoppingmall.com", "_blank")}
//             onClick={() => window.open("http://localhost:8082/", "_blank")}
//           >
//             <ExternalLink className="w-4 h-4" />
//             View Website
//           </Button>

//           <button
//             onClick={toggleTheme}
//             className="w-9 h-9 rounded-lg flex items-center justify-center transition text-muted-foreground hover:bg-secondary hover:text-foreground"
//             title={isDark ? "Switch to light mode" : "Switch to dark mode"}
//           >
//             {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
//           </button>

//           {/* <button
//             onClick={() => togglePanel("notifications")}
//             className="w-9 h-9 rounded-lg flex items-center justify-center transition relative text-muted-foreground hover:bg-secondary hover:text-foreground"
//           >
//             <Bell className="w-4 h-4" />
//             <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-card" />
//           </button> */}

//           <button
//             onClick={() => togglePanel("profile")}
//             className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-secondary ml-1"
//           >
//             <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-xs">
//               {initials}
//             </div>
//             <span className="hidden md:inline text-sm font-medium text-foreground">{admin.name}</span>
//             <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${openPanel === "profile" ? "rotate-180" : ""}`} />
//           </button>
//         </div>
//       </header>

//       {/* <SlidePanel open={openPanel === "notifications"} onClose={closePanel} title="Notifications">
//         <div className="px-4 py-2 flex items-center justify-between border-b border-border">
//           <span className="text-[11px] font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
//             {notifications.filter((n) => n.unread).length} new
//           </span>
//         </div>
//         <div>
//           {notifications.map((n, i) => (
//             <div
//               key={i}
//               className={`px-4 py-4 flex items-start gap-3 hover:bg-secondary/50 cursor-pointer transition-colors border-b border-border/50 ${
//                 n.unread ? "bg-primary/[0.03]" : ""
//               }`}
//             >
//               {n.unread && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
//               <div className={n.unread ? "" : "ml-5"}>
//                 <p className="text-sm text-foreground leading-snug">{n.text}</p>
//                 <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
//               </div>
//             </div>
//           ))}
//         </div>
//       </SlidePanel> */}

//       <SlidePanel open={openPanel === "profile"} onClose={closePanel} title="Account">
//         <div className="p-5 flex items-center gap-4 border-b border-border">
//           <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
//             {initials}
//           </div>
//           <div>
//             <p className="text-sm font-semibold text-foreground">{admin.name}</p>
//             <p className="text-xs text-muted-foreground">{admin.email}</p>
//           </div>
//         </div>
//         <div className="p-3 space-y-1">
//           <button
//             onClick={() => { closePanel(); navigate("/settings/admin?section=profile"); }}
//             className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-foreground hover:bg-secondary transition-colors"
//           >
//             <User className="w-4 h-4 text-muted-foreground" />
//             Admin Profile
//           </button>
//           <button
//             onClick={() => { closePanel(); navigate("/settings/store?section=store-profile"); }}
//             className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-foreground hover:bg-secondary transition-colors"
//           >
//             <Store className="w-4 h-4 text-muted-foreground" />
//             Store Profile
//           </button>
//           <div className="border-t border-border my-2" />
//           <button
//             onClick={handleLogout}
//             className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
//           >
//             <LogOut className="w-4 h-4" />
//             Logout
//           </button>
//         </div>
//       </SlidePanel>
//     </>
//   );
// }


