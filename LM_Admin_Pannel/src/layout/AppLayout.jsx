import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { SidebarContext } from "./SidebarContext";
import { StoreBrandingProvider } from "@/contexts/StoreBrandingContext";

export function AppLayout() {
  // const [collapsed, setCollapsed] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <StoreBrandingProvider>
      <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
        <div className="flex min-h-screen w-full bg-background">
          <Sidebar />

          <div
  className="flex-1 flex flex-col min-w-0 transition-all duration-300"
  style={{
    marginLeft:
      window.innerWidth >= 1024
        ? collapsed
          ? 72
          : 260
        : window.innerWidth >= 768
        ? 72
        : 0,
  }}
>
          {/* <div
            className="flex-1 flex flex-col min-w-0 transition-all duration-300 lg:ml-[260px] md:ml-[72px] ml-0"
            style={{ marginLeft: undefined }}
          > */}
            <Header />
            <main className="flex-1 overflow-auto pt-16">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarContext.Provider>
    </StoreBrandingProvider>
  );
}

// import { useState } from "react";
// import { Outlet } from "react-router-dom";
// import { Sidebar } from "./Sidebar";
// import { Header } from "./Header";
// import { SidebarContext } from "./SidebarContext";
// import { StoreBrandingProvider } from "@/contexts/StoreBrandingContext";

// export function AppLayout() {
//   const [collapsed, setCollapsed] = useState(false);

//   return (
//     <StoreBrandingProvider>
//       <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
//         <div className="flex min-h-screen w-full bg-background">
//           <Sidebar />
//           <div
//             className="flex-1 flex flex-col min-w-0 transition-all duration-300"
//             style={{ marginLeft: collapsed ? 72 : 260 }}
//           >
//             <Header />
//             <main className="flex-1 overflow-auto pt-16">
//               <Outlet />
//             </main>
//           </div>
//         </div>
//       </SidebarContext.Provider>
//     </StoreBrandingProvider>
//   );
// }
