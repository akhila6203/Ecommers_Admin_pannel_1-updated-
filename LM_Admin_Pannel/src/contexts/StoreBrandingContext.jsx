import { createContext, useContext, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, getStoreInformation } from "@/services/settingsService";
import { resolveUploadUrl } from "@/utils/imageUrl";
import { getProfile } from "@/services/authService";


const StoreBrandingContext = createContext(null);

function resolveLogoUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return resolveUploadUrl(url, "settings");
}

function updateFavicon(logoUrl) {
  if (!logoUrl) return;
  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = logoUrl;
}

export function StoreBrandingProvider({ children }) {
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
  queryKey: ["adminProfile"],
  queryFn: () => getProfile().then((r) => r.data || {}),
  staleTime: 0,
});
const storeId = profile?.store_id || profile?.storeId || null;
const isLoggedIn = !!profile?.id;
// const storeId = profile?.store_id || profile?.storeId || "super";

  const { data: settingsData } = useQuery({
    // queryKey: ["settings"],
    queryKey: ["settings", storeId],
    queryFn: () => getSettings().then((r) => r.data?.settings || {}),
    staleTime: 60000,
    enabled: isLoggedIn,
  });

  const { data: storeInfoData } = useQuery({
    // queryKey: ["settings", "store-information"],
    queryKey: ["settings", "store-information", storeId],
    queryFn: () => getStoreInformation().then((r) => r.data || {}),
    staleTime: 60000,
    enabled: isLoggedIn,
  });

  const branding = useMemo(() => {
    const storeSettings = settingsData?.store || {};
    const storeInfo = storeInfoData || {};
    const logoUrl = resolveLogoUrl(
      storeInfo.storeLogo || storeSettings?.logoUrl?.value || ""
    );
    
    const storeName =
  storeInfo.companyName || storeSettings?.storeName?.value || "Ecommerce Admin Panel";
    // const storeName =
    //   storeInfo.companyName || storeSettings?.storeName?.value || "LM Shopping Mall";
    const logoSize = Number(storeSettings?.logoSize?.value) || 36;
    return { logoUrl, storeName, logoSize };
  }, [settingsData, storeInfoData]);

  useEffect(() => {
  if (isLoggedIn && branding.logoUrl) {
    updateFavicon(branding.logoUrl);
  }
}, [isLoggedIn, branding.logoUrl]);

useEffect(() => {
  if (isLoggedIn && branding.storeName) {
    document.title = `${branding.storeName} Admin Panel`;
  }
}, [isLoggedIn, branding.storeName]);
//   useEffect(() => {
//     if (branding.logoUrl) updateFavicon(branding.logoUrl);
//   }, [branding.logoUrl]);
  
//   useEffect(() => {
//   if (branding.storeName) {
//     document.title = `${branding.storeName} Admin Panel`;
//   }
// }, [branding.storeName]);



  const refreshBranding = () => {
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    // queryClient.invalidateQueries({ queryKey: ["settings", "store-information"] });
  };

  
  return (
    <StoreBrandingContext.Provider value={{ ...branding, refreshBranding }}>
      {children}
    </StoreBrandingContext.Provider>
  );
}

export function useStoreBranding() {
  const ctx = useContext(StoreBrandingContext);
  if (!ctx) {
    return {
      logoUrl: "",
      storeName: "LM Shopping Mall",
      logoSize: 36,
      refreshBranding: () => {},
    };
  }
  return ctx;
}


// import { createContext, useContext, useEffect, useMemo } from "react";
// import { useQuery, useQueryClient } from "@tanstack/react-query";
// import { getSettings, getStoreInformation } from "@/services/settingsService";
// import { resolveUploadUrl } from "@/utils/imageUrl";
// import { getProfile } from "@/services/authService";


// const StoreBrandingContext = createContext(null);

// function resolveLogoUrl(url) {
//   if (!url) return "";
//   if (url.startsWith("http://") || url.startsWith("https://")) return url;
//   return resolveUploadUrl(url, "settings");
// }

// function updateFavicon(logoUrl) {
//   if (!logoUrl) return;
//   let link = document.querySelector("link[rel='icon']");
//   if (!link) {
//     link = document.createElement("link");
//     link.rel = "icon";
//     document.head.appendChild(link);
//   }
//   link.href = logoUrl;
// }

// export function StoreBrandingProvider({ children }) {
//   const queryClient = useQueryClient();

//   const { data: profile } = useQuery({
//   queryKey: ["adminProfile"],
//   queryFn: () => getProfile().then((r) => r.data || {}),
//   staleTime: 0,
// });
// const storeId = profile?.store_id || profile?.storeId || "super";

//   const { data: settingsData } = useQuery({
//     // queryKey: ["settings"],
//     queryKey: ["settings", storeId],
//     queryFn: () => getSettings().then((r) => r.data?.settings || {}),
//     staleTime: 60000,
//   });

//   const { data: storeInfoData } = useQuery({
//     // queryKey: ["settings", "store-information"],
//     queryKey: ["settings", "store-information", storeId],
//     queryFn: () => getStoreInformation().then((r) => r.data || {}),
//     staleTime: 60000,
//   });

//   const branding = useMemo(() => {
//     const storeSettings = settingsData?.store || {};
//     const storeInfo = storeInfoData || {};
//     const logoUrl = resolveLogoUrl(
//       storeInfo.storeLogo || storeSettings?.logoUrl?.value || ""
//     );
    
//     const storeName =
//       storeInfo.companyName || storeSettings?.storeName?.value || "LM Shopping Mall";
//     const logoSize = Number(storeSettings?.logoSize?.value) || 36;
//     return { logoUrl, storeName, logoSize };
//   }, [settingsData, storeInfoData]);

//   useEffect(() => {
//     if (branding.logoUrl) updateFavicon(branding.logoUrl);
//   }, [branding.logoUrl]);
  
//   useEffect(() => {
//   if (branding.storeName) {
//     document.title = `${branding.storeName} Admin Panel`;
//   }
// }, [branding.storeName]);



//   const refreshBranding = () => {
//     queryClient.invalidateQueries({ queryKey: ["settings"] });
//     // queryClient.invalidateQueries({ queryKey: ["settings", "store-information"] });
//   };

  
//   return (
//     <StoreBrandingContext.Provider value={{ ...branding, refreshBranding }}>
//       {children}
//     </StoreBrandingContext.Provider>
//   );
// }

// export function useStoreBranding() {
//   const ctx = useContext(StoreBrandingContext);
//   if (!ctx) {
//     return {
//       logoUrl: "",
//       storeName: "LM Shopping Mall",
//       logoSize: 36,
//       refreshBranding: () => {},
//     };
//   }
//   return ctx;
// }
