import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Send, Link, Upload, ImageIcon } from "lucide-react";
import { resolveImageUrl } from "@/components/AboutUsPageBuilder";
import { useStoreBranding } from "@/contexts/StoreBrandingContext";
import {
  getStoreInformation,
  updateStoreInformation,
  uploadSettingsImage,
  getIntegrationSettings,
  updateIntegrationSettings,
  testEmailSettings,
  testShiprocketConnection,
} from "@/services/settingsService";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TAB_FROM_PARAM = {
  "store-information": "store-information",
  "store-profile": "store-information",
  "integrations": "integrations",
};

function resolveTabFromParams(searchParams) {
  const param = searchParams.get("tab") || searchParams.get("section");
  return TAB_FROM_PARAM[param] || "store-information";
}

const TABS = [
  { id: "store-information", label: "Store Information" },
  { id: "integrations", label: "Integrations" },
];

const GST_TYPES = ["Regular", "Composition", "Unregistered", "SEZ", "Export"];

const EMPTY_STORE = {
  companyName: "",
  contactEmail: "",
  websiteUrl: "",
  gstin: "",
  pan: "",
  cin: "",
  gstStateCode: "",
  gstRegistrationType: "Regular",
  facebookUrl: "",
  instagramUrl: "",
  linkedinUrl: "",
  youtubeUrl: "",
  whatsappNumber: "",
  whatsappMessage: "",
  storeAddress: "",
  city: "",
  state: "",
  country: "",
  postalCode: "",
  storeLogo: "",
  storeBanner: "",
};

const EMPTY_INTEGRATIONS = {
  // Razorpay
  razorpay_key_id: "",
  razorpay_key_secret: "",
  razorpay_enabled: false,

  // WhatsApp
  whatsapp_enabled: false,
  whatsapp_provider: "360dialog",
  whatsapp_api_key: "",
  whatsapp_phone_number: "",
  whatsapp_template_name: "",
  whatsapp_phone_number_id: "",
  whatsapp_business_account_id: "",

  // Shiprocket
  shiprocket_email: "",
  shiprocket_password: "",
  shiprocket_channel_id: "",
  shiprocket_pickup_location: "",
  shiprocket_enabled: false,

  // Refund Settings
  refund_enabled: false,
  refund_auto: false,
  refund_days: "7",

  // Email Settings
  smtp_host: "",
  smtp_port: "",
  smtp_username: "",
  smtp_password: "",
  sender_email: "",
};

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <Label className="text-sm font-medium">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ImageUploadField({ label, value, onUpload, uploading, variant = "logo" }) {
  const previewUrl = value ? resolveImageUrl(value) : null;
  const isBanner = variant === "banner";

  return (
    <Field label={label}>
      <div className="rounded-lg border border-border bg-secondary/10 p-3 space-y-3 h-full">
        <div
          className={`relative overflow-hidden rounded-md border border-border bg-muted flex items-center justify-center ${
            isBanner ? "h-24 w-full" : "h-24 w-24"
          }`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImageIcon className="w-5 h-5" />
              <span className="text-[10px]">No image</span>
            </div>
          )}
        </div>
        <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-md cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition text-xs text-muted-foreground">
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Uploading..." : "Choose file"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>
      </div>
    </Field>
  );
}

export default function StoreSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = resolveTabFromParams(searchParams);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));
  const [dirtyTabs, setDirtyTabs] = useState({});
  const queryClient = useQueryClient();
  const { refreshBranding } = useStoreBranding();

  const [storeInfo, setStoreInfo] = useState(EMPTY_STORE);
  const [integrations, setIntegrations] = useState(EMPTY_INTEGRATIONS);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  const [testingShiprocket, setTestingShiprocket] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  const markDirty = useCallback((tab) => {
    setDirtyTabs((prev) => ({ ...prev, [tab]: true }));
  }, []);

  const markClean = useCallback((tab) => {
    setDirtyTabs((prev) => ({ ...prev, [tab]: false }));
  }, []);

  const handleTabChange = (tab) => {
    if (dirtyTabs[activeTab]) {
      const proceed = window.confirm(
        "You have unsaved changes on this tab. Switch anyway? Your changes will be lost."
      );
      if (!proceed) return;
      markClean(activeTab);
    }
    setActiveTab(tab);
    setVisitedTabs((prev) => new Set([...prev, tab]));
    setSearchParams({ tab });
  };

  useEffect(() => {
    const hasDirty = Object.values(dirtyTabs).some(Boolean);
    const onBeforeUnload = (e) => {
      if (hasDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyTabs]);

  const storeQuery = useQuery({
    queryKey: ["settings", "store-information"],
    queryFn: getStoreInformation,
    enabled: visitedTabs.has("store-information"),
  });

  const integrationsQuery = useQuery({
    queryKey: ["settings", "integrations"],
    queryFn: () => getIntegrationSettings().then((r) => r.data),
    enabled: visitedTabs.has("integrations"),
  });

  const storeInitialized = useRef(false);
  useEffect(() => {
    if (storeQuery.data && !storeInitialized.current) {
      setStoreInfo({ ...EMPTY_STORE, ...storeQuery.data?.data });
      storeInitialized.current = true;
    }
  }, [storeQuery.data]);

  const integrationsInitialized = useRef(false);
  useEffect(() => {
    if (integrationsQuery.data && !integrationsInitialized.current) {
      setIntegrations({ ...EMPTY_INTEGRATIONS, ...integrationsQuery.data });
      integrationsInitialized.current = true;
    }
  }, [integrationsQuery.data]);

  const storeMutation = useMutation({
    mutationFn: updateStoreInformation,
    onSuccess: (res) => {
      setStoreInfo({ ...EMPTY_STORE, ...res.data });
      storeInitialized.current = true;
      markClean("store-information");
      queryClient.invalidateQueries({ queryKey: ["settings", "store-information"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      refreshBranding();
      toast.success("Store information saved successfully!");
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to save store information"),
  });

  const integrationsMutation = useMutation({
    mutationFn: updateIntegrationSettings,
    onSuccess: (res) => {
      setIntegrations({ ...EMPTY_INTEGRATIONS, ...res.data });
      integrationsInitialized.current = true;
      markClean("integrations");
      queryClient.invalidateQueries({ queryKey: ["settings", "integrations"] });
      toast.success("Integrations saved successfully!");
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to save integrations"),
  });

  const updateStoreField = (field, value) => {
    setStoreInfo((prev) => ({ ...prev, [field]: value }));
    markDirty("store-information");
  };

  const updateIntegrationField = (field, value) => {
    setIntegrations((prev) => ({ ...prev, [field]: value }));
    markDirty("integrations");
  };

  const handleLogoUpload = async (file) => {
    setLogoUploading(true);
    try {
      const url = await uploadSettingsImage(file);
      updateStoreField("storeLogo", url);
      toast.success("Logo uploaded.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Logo upload failed");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleBannerUpload = async (file) => {
    setBannerUploading(true);
    try {
      const url = await uploadSettingsImage(file);
      updateStoreField("storeBanner", url);
      toast.success("Banner uploaded.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Banner upload failed");
    } finally {
      setBannerUploading(false);
    }
  };

  const handleTestShiprocket = async () => {
    setTestingShiprocket(true);
    try {
      const res = await testShiprocketConnection({
        email: integrations.shiprocket_email,
        password: integrations.shiprocket_password,
        channel_id: integrations.shiprocket_channel_id,
      });
      toast.success(res.data?.message || res.message || "Shiprocket connection verified!");
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to test Shiprocket connection");
    } finally {
      setTestingShiprocket(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await testEmailSettings({
        smtp_host: integrations.smtp_host,
        smtp_port: integrations.smtp_port,
        smtp_username: integrations.smtp_username,
        smtp_password: integrations.smtp_password,
        sender_email: integrations.sender_email,
      });
      toast.success(res.data?.message || res.message || "SMTP test email sent successfully!");
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "SMTP test connection failed");
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSaveIntegrations = (e) => {
    e.preventDefault();
    integrationsMutation.mutate(integrations);
  };

  const tabLoading = {
    "store-information": storeQuery.isLoading,
    "integrations": integrationsQuery.isLoading,
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Store Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your store profile, integrations, gateways, and configurations.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full flex flex-wrap justify-start border-b rounded-none bg-transparent p-0 h-auto gap-0">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 py-3 text-sm font-medium data-[state=active]:text-primary text-muted-foreground whitespace-nowrap"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Store Information */}
        <TabsContent value="store-information" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Store Information</CardTitle>
              <CardDescription>Basic company details, tax info, social links, and branding.</CardDescription>
            </CardHeader>
            <CardContent>
              {tabLoading["store-information"] ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Company Name">
                      <Input
                        value={storeInfo.companyName}
                        onChange={(e) => updateStoreField("companyName", e.target.value)}
                        placeholder="Your company name"
                      />
                    </Field>
                    <Field label="Contact Email">
                      <Input
                        type="email"
                        value={storeInfo.contactEmail}
                        onChange={(e) => updateStoreField("contactEmail", e.target.value)}
                        placeholder="contact@store.com"
                      />
                    </Field>
                    <Field label="Website URL">
                      <Input
                        value={storeInfo.websiteUrl}
                        onChange={(e) => updateStoreField("websiteUrl", e.target.value)}
                        placeholder="https://yourstore.com"
                      />
                    </Field>
                    <Field label="GSTIN">
                      <Input
                        value={storeInfo.gstin}
                        onChange={(e) => updateStoreField("gstin", e.target.value)}
                        placeholder="22AAAAA0000A1Z5"
                      />
                    </Field>
                    <Field label="PAN">
                      <Input
                        value={storeInfo.pan}
                        onChange={(e) => updateStoreField("pan", e.target.value)}
                        placeholder="AAAAA0000A"
                      />
                    </Field>
                    <Field label="CIN">
                      <Input
                        value={storeInfo.cin}
                        onChange={(e) => updateStoreField("cin", e.target.value)}
                        placeholder="U12345AB2020PTC000000"
                      />
                    </Field>
                    <Field label="GST State Code">
                      <Input
                        value={storeInfo.gstStateCode}
                        onChange={(e) => updateStoreField("gstStateCode", e.target.value)}
                        placeholder="36"
                      />
                    </Field>
                    <Field label="GST Registration Type">
                      <Select
                        value={storeInfo.gstRegistrationType}
                        onValueChange={(val) => updateStoreField("gstRegistrationType", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GST_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Facebook URL">
                      <Input
                        value={storeInfo.facebookUrl}
                        onChange={(e) => updateStoreField("facebookUrl", e.target.value)}
                        placeholder="https://facebook.com/yourpage"
                      />
                    </Field>
                    <Field label="Instagram URL">
                      <Input
                        value={storeInfo.instagramUrl}
                        onChange={(e) => updateStoreField("instagramUrl", e.target.value)}
                        placeholder="https://instagram.com/yourpage"
                      />
                    </Field>
                    <Field label="LinkedIn URL">
                      <Input
                        value={storeInfo.linkedinUrl}
                        onChange={(e) => updateStoreField("linkedinUrl", e.target.value)}
                        placeholder="https://linkedin.com/company/yourpage"
                      />
                    </Field>
                    <Field label="YouTube URL">
                      <Input
                        value={storeInfo.youtubeUrl}
                        onChange={(e) => updateStoreField("youtubeUrl", e.target.value)}
                        placeholder="https://youtube.com/@yourchannel"
                      />
                    </Field>
                    <Field label="WhatsApp Number">
                      <Input
                        value={storeInfo.whatsappNumber}
                        onChange={(e) => updateStoreField("whatsappNumber", e.target.value)}
                        placeholder="+91 9876543210"
                      />
                    </Field>
                    <Field label="WhatsApp Message">
                      <Input
                        value={storeInfo.whatsappMessage}
                        onChange={(e) => updateStoreField("whatsappMessage", e.target.value)}
                        placeholder="Hi, I have a question about..."
                      />
                    </Field>
                    <Field label="Store Address" className="md:col-span-2">
                      <Textarea
                        value={storeInfo.storeAddress}
                        onChange={(e) => updateStoreField("storeAddress", e.target.value)}
                        rows={2}
                        placeholder="Street address"
                      />
                    </Field>
                    <Field label="City">
                      <Input
                        value={storeInfo.city}
                        onChange={(e) => updateStoreField("city", e.target.value)}
                      />
                    </Field>
                    <Field label="State">
                      <Input
                        value={storeInfo.state}
                        onChange={(e) => updateStoreField("state", e.target.value)}
                      />
                    </Field>
                    <Field label="Country">
                      <Input
                        value={storeInfo.country}
                        onChange={(e) => updateStoreField("country", e.target.value)}
                      />
                    </Field>
                    <Field label="Postal Code">
                      <Input
                        value={storeInfo.postalCode}
                        onChange={(e) => updateStoreField("postalCode", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                    <ImageUploadField
                      label="Store Logo"
                      value={storeInfo.storeLogo}
                      uploading={logoUploading}
                      onUpload={handleLogoUpload}
                      variant="logo"
                    />
                    <ImageUploadField
                      label="Store Banner"
                      value={storeInfo.storeBanner}
                      uploading={bannerUploading}
                      onUpload={handleBannerUpload}
                      variant="banner"
                    />
                  </div>
                  <Button
                    onClick={() => storeMutation.mutate(storeInfo)}
                    disabled={storeMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {storeMutation.isPending ? "Saving..." : "Save Store Information"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Third-Party Integrations</CardTitle>
              <CardDescription>Configure payment gateways, logistics, refunds, transactional emails, and SMS.</CardDescription>
            </CardHeader>
            <CardContent>
              {tabLoading["integrations"] ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <form onSubmit={handleSaveIntegrations} className="space-y-8">
                  {/* PAYMENT GATEWAYS */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold border-b pb-2 text-foreground">Payment Gateways</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Razorpay */}
                      <Card className="border border-border/60">
                        <CardHeader className="py-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">Razorpay Integration</CardTitle>
                            <Switch
                              checked={integrations.razorpay_enabled === true || integrations.razorpay_enabled === "true"}
                              onCheckedChange={(val) => updateIntegrationField("razorpay_enabled", val)}
                            />
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 py-2">
                          <div>
                            <Label className="text-xs font-medium">Key ID</Label>
                            <Input
                              value={integrations.razorpay_key_id}
                              onChange={(e) => updateIntegrationField("razorpay_key_id", e.target.value)}
                              placeholder="rzp_test_..."
                              disabled={!(integrations.razorpay_enabled === true || integrations.razorpay_enabled === "true")}
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">Key Secret</Label>
                            <Input
                              type="password"
                              value={integrations.razorpay_key_secret}
                              onChange={(e) => updateIntegrationField("razorpay_key_secret", e.target.value)}
                              placeholder="••••••••••••••••"
                              disabled={!(integrations.razorpay_enabled === true || integrations.razorpay_enabled === "true")}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* WHATSAPP */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold border-b pb-2 text-foreground">WhatsApp Integration</h3>
                    <Card className="border border-border/60">
                      <CardHeader className="py-4 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-semibold">WhatsApp Business API</CardTitle>
                          <CardDescription className="text-xs mt-0.5">Send order updates and notifications via WhatsApp</CardDescription>
                        </div>
                        <Switch
                          checked={integrations.whatsapp_enabled === true || integrations.whatsapp_enabled === "true"}
                          onCheckedChange={(val) => updateIntegrationField("whatsapp_enabled", val)}
                        />
                      </CardHeader>
                      <CardContent className="space-y-3 py-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs font-medium">Provider</Label>
                            <Select
                              value={integrations.whatsapp_provider || "360dialog"}
                              onValueChange={(val) => updateIntegrationField("whatsapp_provider", val)}
                              disabled={!(integrations.whatsapp_enabled === true || integrations.whatsapp_enabled === "true")}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select provider" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="360dialog">360dialog</SelectItem>
                                <SelectItem value="meta">Meta Cloud API</SelectItem>
                                
                                {/* <SelectItem value="360dialog">360dialog</SelectItem> */}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs font-medium">OTP Template Name</Label>
                            <Input
                              value={integrations.whatsapp_template_name || ""}
                              onChange={(e) => updateIntegrationField("whatsapp_template_name", e.target.value)}
                              placeholder="e.g. authentication_code"
                              disabled={!(integrations.whatsapp_enabled === true || integrations.whatsapp_enabled === "true")}
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">API Key / Access Token</Label>
                            <Input
                              type="password"
                              value={integrations.whatsapp_api_key}
                              onChange={(e) => updateIntegrationField("whatsapp_api_key", e.target.value)}
                              placeholder="••••••••••••••••"
                              disabled={!(integrations.whatsapp_enabled === true || integrations.whatsapp_enabled === "true")}
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">WhatsApp Business Number</Label>
                            <Input
                              value={integrations.whatsapp_phone_number}
                              onChange={(e) => updateIntegrationField("whatsapp_phone_number", e.target.value)}
                              placeholder="+91 9876543210"
                              disabled={!(integrations.whatsapp_enabled === true || integrations.whatsapp_enabled === "true")}
                            />
                          </div>
                          {integrations.whatsapp_provider === "meta" && (
  <>
    <div>
      <Label className="text-xs font-medium">Phone Number ID</Label>
      <Input
        value={integrations.whatsapp_phone_number_id || ""}
        onChange={(e) => updateIntegrationField("whatsapp_phone_number_id", e.target.value)}
        placeholder="Meta Phone Number ID"
        disabled={!(integrations.whatsapp_enabled === true || integrations.whatsapp_enabled === "true")}
      />
    </div>

    <div>
      <Label className="text-xs font-medium">Business Account ID</Label>
      <Input
        value={integrations.whatsapp_business_account_id || ""}
        onChange={(e) => updateIntegrationField("whatsapp_business_account_id", e.target.value)}
        placeholder="Meta WABA ID"
        disabled={!(integrations.whatsapp_enabled === true || integrations.whatsapp_enabled === "true")}
      />
    </div>
  </>
)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Used for registration and forgot-password OTP via 360dialog WhatsApp authentication templates.
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* SHIPROCKET */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold border-b pb-2 text-foreground">Logistics (Shiprocket)</h3>
                    <Card className="border border-border/60">
                      <CardHeader className="py-4 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-semibold">Shiprocket Integration</CardTitle>
                          <CardDescription className="text-xs mt-0.5">Automate shipping, labels, and tracking synchronization</CardDescription>
                        </div>
                        <Switch
                          checked={integrations.shiprocket_enabled === true || integrations.shiprocket_enabled === "true"}
                          onCheckedChange={(val) => updateIntegrationField("shiprocket_enabled", val)}
                        />
                      </CardHeader>
                      <CardContent className="space-y-4 py-2">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <Label className="text-xs font-medium">Email Address</Label>
                            <Input
                              type="email"
                              value={integrations.shiprocket_email}
                              onChange={(e) => updateIntegrationField("shiprocket_email", e.target.value)}
                              placeholder="shiprocket@domain.com"
                              disabled={!(integrations.shiprocket_enabled === true || integrations.shiprocket_enabled === "true")}
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">Password</Label>
                            <Input
                              type="password"
                              value={integrations.shiprocket_password}
                              onChange={(e) => updateIntegrationField("shiprocket_password", e.target.value)}
                              placeholder="••••••••••••••••"
                              disabled={!(integrations.shiprocket_enabled === true || integrations.shiprocket_enabled === "true")}
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">Channel ID</Label>
                            <Input
                              value={integrations.shiprocket_channel_id}
                              onChange={(e) => updateIntegrationField("shiprocket_channel_id", e.target.value)}
                              placeholder="e.g. 123456"
                              disabled={!(integrations.shiprocket_enabled === true || integrations.shiprocket_enabled === "true")}
                            />
                          </div>
                          <div>
  <Label className="text-xs font-medium">Pickup Location</Label>
  <Input
    value={integrations.shiprocket_pickup_location}
    onChange={(e) => updateIntegrationField("shiprocket_pickup_location", e.target.value)}
    placeholder="e.g. Primary / LM Warehouse"
    disabled={!(integrations.shiprocket_enabled === true || integrations.shiprocket_enabled === "true")}
  />
</div>
                        </div>
                        <div className="flex justify-start pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestShiprocket}
                            disabled={testingShiprocket || !(integrations.shiprocket_enabled === true || integrations.shiprocket_enabled === "true")}
                          >
                            {testingShiprocket ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link className="w-4 h-4 mr-2" />}
                            Test Connection
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* REFUND SETTINGS */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold border-b pb-2 text-foreground">Refund Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between border border-border/60 rounded-xl p-4 bg-card">
                        <div>
                          <Label className="font-semibold text-sm">Refund Enabled</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">Toggle customer self-service refund requests</p>
                        </div>
                        <Switch
                          checked={integrations.refund_enabled === true || integrations.refund_enabled === "true"}
                          onCheckedChange={(val) => updateIntegrationField("refund_enabled", val)}
                        />
                      </div>
                      <div className="flex items-center justify-between border border-border/60 rounded-xl p-4 bg-card">
                        <div>
                          <Label className="font-semibold text-sm">Auto Refund</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">Process refund automatically after approval</p>
                        </div>
                        <Switch
                          checked={integrations.refund_auto === true || integrations.refund_auto === "true"}
                          onCheckedChange={(val) => updateIntegrationField("refund_auto", val)}
                          disabled={!(integrations.refund_enabled === true || integrations.refund_enabled === "true")}
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium">Refund Eligibility Window (Days)</Label>
                        <Input
                          type="number"
                          value={integrations.refund_days}
                          onChange={(e) => updateIntegrationField("refund_days", e.target.value)}
                          placeholder="7"
                          disabled={!(integrations.refund_enabled === true || integrations.refund_enabled === "true")}
                        />
                      </div>
                    </div>
                  </div>

                  {/* SMTP EMAIL SETTINGS */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold border-b pb-2 text-foreground">Transactional Email (SMTP)</h3>
                    <Card className="border border-border/60">
                      <CardContent className="space-y-4 pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs font-medium">SMTP Host</Label>
                            <Input
                              value={integrations.smtp_host}
                              onChange={(e) => updateIntegrationField("smtp_host", e.target.value)}
                              placeholder="smtp.gmail.com"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">SMTP Port</Label>
                            <Input
                              value={integrations.smtp_port}
                              onChange={(e) => updateIntegrationField("smtp_port", e.target.value)}
                              placeholder="587"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">SMTP Username</Label>
                            <Input
                              value={integrations.smtp_username}
                              onChange={(e) => updateIntegrationField("smtp_username", e.target.value)}
                              placeholder="username@gmail.com"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">SMTP Password</Label>
                            <Input
                              type="password"
                              value={integrations.smtp_password}
                              onChange={(e) => updateIntegrationField("smtp_password", e.target.value)}
                              placeholder="••••••••••••••••"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-xs font-medium">Sender Email Address</Label>
                            <Input
                              type="email"
                              value={integrations.sender_email}
                              onChange={(e) => updateIntegrationField("sender_email", e.target.value)}
                              placeholder="noreply@domain.com"
                            />
                          </div>
                        </div>
                        <div className="flex justify-start pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestEmail}
                            disabled={testingEmail}
                          >
                            {testingEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                            Test Email Connection
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Save Button */}
                  <div className="pt-4">
                    <Button
                      type="submit"
                      disabled={integrationsMutation.isPending}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {integrationsMutation.isPending ? "Saving..." : "Save Integrations"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
