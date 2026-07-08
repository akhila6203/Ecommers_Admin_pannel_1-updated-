// import { useState } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSidebar } from "./SidebarContext";
import {
  LayoutDashboard, Package, Plus, List, FolderTree, Layers,
  ShoppingCart, Users, Tag, Star, Image, Settings,
  ChevronLeft, ChevronRight,ChevronDown, Shirt, Sparkles, Store, UserCog,
  FileText, X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/services/authService";
import { useStoreBranding } from "@/contexts/StoreBrandingContext";

const navGroups = [
  {
    label: null,
    items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/" }],
  },
  {
    label: "Products",
    icon: Package,
    items: [
      { label: "Add Product", icon: Plus, path: "/products/add" },
      { label: "Product List", icon: List, path: "/products/list" },
    ],
  },
  {
    label: "Categories",
    icon: FolderTree,
    items: [
      { label: "Main Categories", icon: Layers, path: "/categories/main" },
      { label: "Sub Categories", icon: Layers, path: "/categories/sub" },
      { label: "Child Categories", icon: Layers, path: "/categories/child" },
    ],
  },
  {
    label: "Collections",
    icon: Sparkles,
    items: [{ label: "Manage Collections", icon: Sparkles, path: "/collections" }],
  },
  {
    label: null,
    items: [
      { label: "Orders", icon: ShoppingCart, path: "/orders" },
      { label: "Customers", icon: Users, path: "/customers" },
      { label: "Offers / Coupons", icon: Tag, path: "/offers" },
      { label: "Banners", icon: Image, path: "/gallery" },
      { label: "Pages", icon: FileText, path: "/conditions" },
    ],
  },
   {
    label: "Settings",
    icon: Settings,
    items: [
      { label: "Store Settings", icon: Store, path: "/settings/store" },
      { label: "Admin Settings", icon: UserCog, path: "/settings/admin" },
    ],
  },
];

function isItemActive(pathname, itemPath) {
  if (itemPath === "/") return pathname === "/";
  return pathname === itemPath || pathname.startsWith(itemPath + "/");
}

function SidebarGroup({ group, collapsed, isOpen, onToggle, setMobileOpen  }) {
  const location = useLocation();
  const hasActiveChild = group.items.some((item) => isItemActive(location.pathname, item.path));

  if (!group.label) {
    return (
      <div className="space-y-0.5 mb-2">
        {group.items.map((item) => {
          const isActive = isItemActive(location.pathname, item.path);
          return (
 <NavLink
  key={item.path}
  to={item.path}
  onClick={() => setMobileOpen(false)}
  title={collapsed ? item.label : ""}
  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
    collapsed ? "justify-center" : ""
  } ${
    isActive
      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
      : "text-foreground/70 hover:bg-primary/5 hover:text-foreground"
  }`}
>
  <item.icon className="w-[18px] h-[18px] shrink-0" />
  {!collapsed && <span className="truncate">{item.label}</span>}
</NavLink>
           
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-1">
      {!collapsed ? (
        <button
          onClick={onToggle}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
            hasActiveChild ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          <group.icon className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">{group.label}</span>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.div>
        </button>
      ) : (
        <div className="flex justify-center py-2">
          <div className={`w-6 h-0.5 rounded-full ${hasActiveChild ? "bg-primary" : "bg-border"}`} />
        </div>
      )}

      <AnimatePresence initial={false}>
        {(isOpen || collapsed) && (
          <motion.div
            initial={collapsed ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={`space-y-0.5 ${!collapsed ? "mt-1 ml-3 pl-3 border-l border-border" : "mt-1"}`}>
              {group.items.map((item) => {
                const isActive = isItemActive(location.pathname, item.path);
                return (
                  <NavLink
  key={item.path}
  to={item.path}
  onClick={() => setMobileOpen(false)}
  title={collapsed ? item.label : ""}
  className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
    collapsed ? "justify-center" : ""
  } ${
    isActive
      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
      : "text-foreground/70 hover:bg-primary/5 hover:text-foreground"
  }`}
>
  <item.icon className="w-[18px] h-[18px] shrink-0" />
  {!collapsed && <span className="truncate">{item.label}</span>}
</NavLink>
                
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar() {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  // const { collapsed, setCollapsed } = useSidebar();
  const location = useLocation();
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
  const initials = admin.name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "LA";

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    navGroups.forEach((group) => {
      if (group.label) {
        initial[group.label] = group.items.some((item) => isItemActive(location.pathname, item.path));
      }
    });
    return initial;
  });

  const toggleGroup = (label) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // const effectiveCollapsed = true;
  const [isTablet, setIsTablet] = useState(false);

useEffect(() => {
  const checkSize = () => {
    setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
  };

  checkSize();
  window.addEventListener("resize", checkSize);
  return () => window.removeEventListener("resize", checkSize);
}, []);

const effectiveCollapsed = isTablet ? true : collapsed;
  
  return (
      <>
      
      {mobileOpen && (
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
        onClick={() => setMobileOpen(false)}
      />
    )}


<aside
  className={`
    fixed left-0 top-0 z-50 md:z-40
    h-screen flex flex-col
    bg-card border-r border-border
    transition-all duration-300

    ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
    md:translate-x-0

    ${
      isTablet
        ? "w-[72px]"
        : collapsed
        ? "lg:w-[72px]"
        : "lg:w-[260px]"
    }

    w-[260px]
    overflow-hidden
  `}
>
    {/* <aside
      className={`fixed left-0 top-0 z-50 md:z-40 h-screen flex flex-col bg-card border-r border-border transition-all duration-300
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0
       w-[260px] md:w-[72px] lg:w-[260px] overflow-hidden
        `}
    > */}
    {/* <aside
       className={`fixed left-0 top-0 z-40 h-screen flex flex-col bg-card border-r border-border transition-all duration-300 ${
         collapsed ? "w-[72px]" : "w-[260px]"
       }`}
     > */}
      <div className="h-16 flex items-center px-5 border-b border-border gap-3 shrink-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={storeName}
            style={{ width: logoSize, height: logoSize }}
            className="rounded-lg object-contain shrink-0"
          />
        ) : (
          <div
            style={{ width: logoSize, height: logoSize }}
            className="rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-md shadow-primary/25"
          >
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
        )}
        {!effectiveCollapsed  && (
          <div className="min-w-0">
            <span className="font-heading font-bold text-base text-foreground tracking-tight block truncate">
              {storeName || "LM Shopping Mall"}
            </span>
            <span className="text-[10px] text-muted-foreground">Admin Panel</span>
          </div>
        )}
        <button
  onClick={() => setMobileOpen(false)}
  className="ml-auto md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary"
>
  <X className="w-4 h-4" />
</button>
      </div>

      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {navGroups.map((group, i) => (
          <SidebarGroup
  key={group.label || `group-${i}`}
  group={group}
  collapsed={effectiveCollapsed}
  // collapsed={collapsed}
  isOpen={group.label ? (openGroups[group.label] ?? false) : true}
  onToggle={() => group.label && toggleGroup(group.label)}
  setMobileOpen={setMobileOpen}
/>
          // <SidebarGroup
          //   key={group.label || `group-${i}`}
          //   group={group}
          //   collapsed={false}
          //   // collapsed={collapsed}
          //   collapsed={window.innerWidth >= 768 && window.innerWidth < 1024 ? true : collapsed}
          //   isOpen={group.label ? (openGroups[group.label] ?? false) : true}
          //   onToggle={() => group.label && toggleGroup(group.label)}
          // />
        ))}
      </nav>

      <div className="p-3 border-t border-border space-y-1 shrink-0">
        <div
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50 ${
            effectiveCollapsed ? "justify-center" : ""
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-xs shrink-0">
            {initials}
          </div>
          {!effectiveCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{admin.name || "Admin"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{admin.email || "admin@lmshoppingmall.com"}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors text-sm"
          // className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors text-sm"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
    </>
  );
}



// import { useState } from "react";
// import { NavLink, useLocation } from "react-router-dom";
// import { useSidebar } from "./SidebarContext";
// import {
//   LayoutDashboard, Package, Plus, List, FolderTree, Layers,
//   ShoppingCart, Users, Tag, Star, Image, Settings,
//   ChevronLeft, ChevronRight,ChevronDown, Shirt, Sparkles, Store, UserCog,
//   FileText,
// } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { useQuery } from "@tanstack/react-query";
// import { getProfile } from "@/services/authService";
// import { useStoreBranding } from "@/contexts/StoreBrandingContext";

// const navGroups = [
//   {
//     label: null,
//     items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/" }],
//   },
//   {
//     label: "Products",
//     icon: Package,
//     items: [
//       { label: "Add Product", icon: Plus, path: "/products/add" },
//       { label: "Product List", icon: List, path: "/products/list" },
//     ],
//   },
//   {
//     label: "Categories",
//     icon: FolderTree,
//     items: [
//       { label: "Main Categories", icon: Layers, path: "/categories/main" },
//       { label: "Sub Categories", icon: Layers, path: "/categories/sub" },
//       { label: "Child Categories", icon: Layers, path: "/categories/child" },
//     ],
//   },
//   {
//     label: "Collections",
//     icon: Sparkles,
//     items: [{ label: "Manage Collections", icon: Sparkles, path: "/collections" }],
//   },
//   {
//     label: null,
//     items: [
//       { label: "Orders", icon: ShoppingCart, path: "/orders" },
//       { label: "Customers", icon: Users, path: "/customers" },
//       { label: "Offers / Coupons", icon: Tag, path: "/offers" },
//       { label: "Banners", icon: Image, path: "/gallery" },
//       { label: "Pages", icon: FileText, path: "/conditions" },
//     ],
//   },
//    {
//     label: "Settings",
//     icon: Settings,
//     items: [
//       { label: "Store Settings", icon: Store, path: "/settings/store" },
//       { label: "Admin Settings", icon: UserCog, path: "/settings/admin" },
//     ],
//   },
// ];

// function isItemActive(pathname, itemPath) {
//   if (itemPath === "/") return pathname === "/";
//   return pathname === itemPath || pathname.startsWith(itemPath + "/");
// }

// function SidebarGroup({ group, collapsed, isOpen, onToggle }) {
//   const location = useLocation();
//   const hasActiveChild = group.items.some((item) => isItemActive(location.pathname, item.path));

//   if (!group.label) {
//     return (
//       <div className="space-y-0.5 mb-2">
//         {group.items.map((item) => {
//           const isActive = isItemActive(location.pathname, item.path);
//           return (
//             <NavLink
//               key={item.path}
//               to={item.path}
//               className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
//                 collapsed ? "justify-center" : ""
//               } ${
//                 isActive
//                   ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
//                   : "text-foreground/70 hover:bg-primary/5 hover:text-foreground"
//               }`}
//             >
//               <item.icon className="w-[18px] h-[18px] shrink-0" />
//               {!collapsed && <span>{item.label}</span>}
//             </NavLink>
//           );
//         })}
//       </div>
//     );
//   }

//   return (
//     <div className="mb-1">
//       {!collapsed ? (
//         <button
//           onClick={onToggle}
//           className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
//             hasActiveChild ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
//           }`}
//         >
//           <group.icon className="w-4 h-4 shrink-0" />
//           <span className="flex-1 text-left">{group.label}</span>
//           <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
//             <ChevronDown className="w-3.5 h-3.5" />
//           </motion.div>
//         </button>
//       ) : (
//         <div className="flex justify-center py-2">
//           <div className={`w-6 h-0.5 rounded-full ${hasActiveChild ? "bg-primary" : "bg-border"}`} />
//         </div>
//       )}

//       <AnimatePresence initial={false}>
//         {(isOpen || collapsed) && (
//           <motion.div
//             initial={collapsed ? false : { height: 0, opacity: 0 }}
//             animate={{ height: "auto", opacity: 1 }}
//             exit={{ height: 0, opacity: 0 }}
//             transition={{ duration: 0.25, ease: "easeInOut" }}
//             className="overflow-hidden"
//           >
//             <div className={`space-y-0.5 ${!collapsed ? "mt-1 ml-3 pl-3 border-l border-border" : "mt-1"}`}>
//               {group.items.map((item) => {
//                 const isActive = isItemActive(location.pathname, item.path);
//                 return (
//                   <NavLink
//                     key={item.path}
//                     to={item.path}
//                     className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
//                       collapsed ? "justify-center" : ""
//                     } ${
//                       isActive
//                         ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
//                         : "text-foreground/70 hover:bg-primary/5 hover:text-foreground"
//                     }`}
//                   >
//                     <item.icon className="w-[18px] h-[18px] shrink-0" />
//                     {!collapsed && <span>{item.label}</span>}
//                   </NavLink>
//                 );
//               })}
//             </div>
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// export function Sidebar() {
//   const { collapsed, setCollapsed } = useSidebar();
//   const location = useLocation();
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
//   const initials = admin.name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "LA";

//   const [openGroups, setOpenGroups] = useState(() => {
//     const initial = {};
//     navGroups.forEach((group) => {
//       if (group.label) {
//         initial[group.label] = group.items.some((item) => isItemActive(location.pathname, item.path));
//       }
//     });
//     return initial;
//   });

//   const toggleGroup = (label) => {
//     setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
//   };

//   return (
//     <aside
//       className={`fixed left-0 top-0 z-40 h-screen flex flex-col bg-card border-r border-border transition-all duration-300 ${
//         collapsed ? "w-[72px]" : "w-[260px]"
//       }`}
//     >
//       <div className="h-16 flex items-center px-5 border-b border-border gap-3 shrink-0">
//         {logoUrl ? (
//           <img
//             src={logoUrl}
//             alt={storeName}
//             style={{ width: logoSize, height: logoSize }}
//             className="rounded-lg object-contain shrink-0"
//           />
//         ) : (
//           <div
//             style={{ width: logoSize, height: logoSize }}
//             className="rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-md shadow-primary/25"
//           >
//             <Sparkles className="w-4 h-4 text-primary-foreground" />
//           </div>
//         )}
//         {!collapsed && (
//           <div className="min-w-0">
//             <span className="font-heading font-bold text-base text-foreground tracking-tight block truncate">
//               {storeName || "LM Shopping Mall"}
//             </span>
//             <span className="text-[10px] text-muted-foreground">Admin Panel</span>
//           </div>
//         )}
//       </div>

//       <nav className="flex-1 py-4 px-3 overflow-y-auto">
//         {navGroups.map((group, i) => (
//           <SidebarGroup
//             key={group.label || `group-${i}`}
//             group={group}
//             collapsed={collapsed}
//             isOpen={group.label ? (openGroups[group.label] ?? false) : true}
//             onToggle={() => group.label && toggleGroup(group.label)}
//           />
//         ))}
//       </nav>

//       <div className="p-3 border-t border-border space-y-1 shrink-0">
//         <div
//           className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50 ${
//             collapsed ? "justify-center" : ""
//           }`}
//         >
//           <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-xs shrink-0">
//             {initials}
//           </div>
//           {!collapsed && (
//             <div className="min-w-0 flex-1">
//               <p className="text-sm font-semibold text-foreground truncate">{admin.name || "Admin"}</p>
//               <p className="text-[11px] text-muted-foreground truncate">{admin.email || "admin@lmshoppingmall.com"}</p>
//             </div>
//           )}
//         </div>
//         <button
//           onClick={() => setCollapsed(!collapsed)}
//           className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors text-sm"
//         >
//           {collapsed ? (
//             <ChevronRight className="w-4 h-4" />
//           ) : (
//             <>
//               <ChevronLeft className="w-4 h-4" />
//               <span>Collapse</span>
//             </>
//           )}
//         </button>
//       </div>
//     </aside>
//   );
// }
