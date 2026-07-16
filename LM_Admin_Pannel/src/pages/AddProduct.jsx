import { useState, useEffect, useRef, Fragment } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, X, GripVertical, AlertCircle,
  Image as ImageIcon, Upload, Check,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createProduct, updateProduct, getProduct, getVariantOptions, getProductSeo } from "@/services/productService";
import { getCategoryHierarchy } from "@/services/categoryService";
import { getCollections } from "@/services/collectionService";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreatableMultiInput } from "@/components/CreatableMultiInput";

// ─── Helpers ───
import { resolveUploadUrl } from "@/utils/imageUrl";

const emptyForm = {
  name: "", slug: "",
  category_id: "", sub_category_id: "", child_category_id: "",
  brand: "", vendor: "", stock: "",
  price: "", compare_at_price: "", cost_price: "",
  charge_tax: false, gst_percent: "",
  short_description: "", long_description: "",
  product_type: "", tags: "",
  status: "active",
};

const emptySeo = {
  seo_title: "",
  seo_description: "",
};

const PRESET_OPTIONS = ["Size", "Color", "Fabric", "Material", "Custom Option"];

const parseOptionValues = (raw) => {
  if (!raw?.trim()) return [];
  return raw.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
};

const parseStoredOptionValues = (opt) => {
  if (Array.isArray(opt.option_values)) return opt.option_values;
  try {
    return typeof opt.option_values === "string" ? JSON.parse(opt.option_values) : [];
  } catch {
    return [];
  }
};

const comboKey = (options) => options.map((o) => `${o.name}:${o.value}`).join("|");

const getOptionValue = (combo, name) =>
  combo.find((o) => o.name?.toLowerCase() === name.toLowerCase())?.value || null;

const getVariantColor = (variant) => {
  if (variant.options?.length) {
    return getOptionValue(variant.options, "color") || variant.color || null;
  }
  return variant.color || null;
};

const getUniqueColors = (variantRows) => {
  const colors = new Set();
  for (const v of variantRows || []) {
    const color = getVariantColor(v);
    if (color) colors.add(color);
  }
  return [...colors];
};

const getColorImagePreviews = (color, variantColorImages = {}) => {
  if (!color) return [];
  const colorState = variantColorImages[color] || {};
  return [
    ...(colorState.existing || []).map((img) => ({ id: img.id, url: img.url, type: "existing" })),
    ...(colorState.previews || []).map((url, i) => ({ id: `new-${i}`, url, type: "new", previewIndex: i })),
  ];
};

const buildColorImageMapFromVariants = (variantRows) => {
  const colorImageMap = {};
  for (const variant of variantRows || []) {
    const color = getVariantColor(variant);
    if (!color || !variant.images?.length) continue;
    if (!colorImageMap[color]) {
      colorImageMap[color] = {
        existing: variant.images.map((img) => ({
          id: img.id,
          url: resolveUploadUrl(img.image, "products"),
        })),
        newFiles: [],
        removedIds: [],
        previews: [],
      };
    }
  }
  return colorImageMap;
};

const parseStockValue = (val) => {
  const n = Number.parseInt(String(val ?? "0").trim(), 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
};

const parsePriceValue = (val, fallback = 0) => {
  const n = Number.parseFloat(String(val ?? fallback));
  return Number.isNaN(n) || n < 0 ? fallback : n;
};

const deriveProductStockFromVariants = (variantRows) =>
  (variantRows || []).reduce((sum, v) => sum + parseStockValue(v.stock), 0);

const divideStockEqually = (totalStock, count) => {
  const total = parseStockValue(totalStock);
  if (!count) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
};

const redistributeVariantStock = (variantRows, totalStock) => {
  const portions = divideStockEqually(totalStock, variantRows.length);
  return variantRows.map((v, i) => ({ ...v, stock: portions[i] }));
};

const variantEditKey = (variant) => variant._key || String(variant.id);

const deriveProductPricesFromVariants = (variantRows, fallbackPrice = 0, fallbackOffer = 0) => {
  if (!variantRows?.length) {
    return {
      price: parsePriceValue(fallbackPrice),
      offer_price: parsePriceValue(fallbackOffer),
    };
  }
  let selected = null;
  for (const v of variantRows) {
    const offer = parsePriceValue(v.offer_price ?? v.price, 0);
    const compare = parsePriceValue(v.price ?? offer, offer);
    if (!selected || offer < selected.offer_price) {
      selected = { price: compare, offer_price: offer };
    }
  }
  return selected || {
    price: parsePriceValue(fallbackPrice),
    offer_price: parsePriceValue(fallbackOffer),
  };
};

const buildCombinations = (variantOptions, existingVariants, defaults) => {
  if (!variantOptions.length) return [];

  const optionArrays = variantOptions
    .map((opt) => ({
      name: opt.option_name,
      values: parseStoredOptionValues(opt),
    }))
    .filter((o) => o.values.length > 0);

  if (!optionArrays.length) return [];

  const combos = optionArrays.reduce(
    (acc, opt) => acc.flatMap((a) => opt.values.map((v) => [...a, { name: opt.name, value: v }])),
    [[]]
  );

  const existingByKey = new Map(
    existingVariants.map((v) => [v._key || comboKey(v.options || []), v])
  );

  return combos.map((combo, index) => {
    const key = comboKey(combo);
    const existing = existingByKey.get(key);
    return {
      id: existing?.id ?? `local-${key || index}`,
      _key: key,
      label: combo.map((c) => c.value).join(" / "),
      options: combo,
      sku: existing?.sku ?? "",
      price: existing?.price ?? defaults.price,
      offer_price: existing?.offer_price ?? defaults.offer_price,
      stock: existing?.stock ?? parseStockValue(defaults.stock),
      size: getOptionValue(combo, "size") || combo[0]?.value || null,
      color: getOptionValue(combo, "color") || combo[1]?.value || null,
      fabric: getOptionValue(combo, "fabric") || null,
      images: existing?.images || [],
    };
  });
};

const mapDbVariantsToLocal = (dbVariants, variantOptions) =>
  dbVariants.map((v) => {
    let options = [];
    if (v.option_values) {
      try {
        options = typeof v.option_values === "string" ? JSON.parse(v.option_values) : v.option_values;
      } catch {
        options = [];
      }
    }
    if (!options.length) {
      options = variantOptions
        .map((opt, i) => ({
          name: opt.option_name,
          value: i === 0 ? v.size : i === 1 ? v.color : null,
        }))
        .filter((o) => o.value);
    }
    return {
      ...v,
      sku: v.sku || "",
      stock: parseStockValue(v.stock),
      price: v.price ?? "",
      offer_price: v.offer_price ?? "",
      fabric: v.fabric || getOptionValue(options, "fabric") || "",
      images: v.images || [],
      _key: comboKey(options),
      label: options.map((o) => o.value).join(" / ") || v.sku || "Variant",
      options,
    };
  });

const buildFormFromProduct = (product) => ({
  name: product.name || "",
  slug: product.slug || "",
  category_id: String(product.category_id || ""),
  sub_category_id: String(product.sub_category_id || ""),
  child_category_id: String(product.child_category_id || ""),
  brand: product.brand || "",
  vendor: product.vendor || "",
  stock: String(product.stock ?? ""),
  price: String(product.offer_price || product.price || ""),
  compare_at_price: String(product.price || ""),
  cost_price: String(product.cost_price || ""),
  charge_tax: Number(product.gst_percent || 0) > 0,
  gst_percent: String(product.gst_percent || ""),
  short_description: product.short_description || "",
  long_description: product.long_description || "",
  product_type: product.product_type || "",
  tags: product.tags || "",
  status: product.status || "active",
});

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "code-block"],
    [{ color: [] }, { background: [] }],
    ["link", "image"],
    ["clean"],
  ],
};

const quillFormats = [
  "header",
  "bold", "italic", "underline", "strike",
  "list", "bullet",
  "blockquote", "code-block",
  "color", "background",
  "link", "image",
];

export default function AddProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isAddMode = location.pathname === "/products/add";
  const isEditRoute = location.pathname.includes("/products/edit/");
  const isSeoRoute = location.pathname.endsWith("/seo");
  const productId = isAddMode ? null : id;
  const isEditing = isEditRoute && Boolean(productId);
  const needsProductLoad = Boolean(productId);
  const listProduct = location.state?.product;

  const [activeTab, setActiveTab] = useState(isSeoRoute ? "seo" : "info");
  const [form, setForm] = useState(emptyForm);
  const [seo, setSeo] = useState(emptySeo);
  const [thumbnail, setThumbnail] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [thumbnailPreview, setThumbnailPreview] = useState(null);
  const [galleryPreview, setGalleryPreview] = useState([]);
  const [existingGalleryImages, setExistingGalleryImages] = useState([]);
  const [removedImageIds, setRemovedImageIds] = useState([]);
  const [variantColorImages, setVariantColorImages] = useState({});

  // Variant options state
  const [variantOptions, setVariantOptions] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState("Size");
  const [customOptionName, setCustomOptionName] = useState("");
  const [newOptionValueTags, setNewOptionValueTags] = useState([]);
  const [optionValueDrafts, setOptionValueDrafts] = useState({});
  const [variants, setVariants] = useState([]);
  const [editingVariantKey, setEditingVariantKey] = useState(null);
  const [editVariantData, setEditVariantData] = useState({});
  const variantsInitialized = useRef(false);
  const hydratedProductId = useRef(null);

  // Collections state
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([]);

  // Reset local edit state when switching between products
  useEffect(() => {
    if (!productId) {
      hydratedProductId.current = null;
      variantsInitialized.current = false;
      return;
    }
    if (hydratedProductId.current !== String(productId)) {
      variantsInitialized.current = false;
      setVariantOptions([]);
      setVariants([]);
      setEditingVariantKey(null);
      setEditVariantData({});
      setExistingGalleryImages([]);
      setRemovedImageIds([]);
      setThumbnail(null);
      setGalleryFiles([]);
      setGalleryPreview([]);
      setVariantColorImages({});
      setSelectedCollectionIds([]);
    }
  }, [productId]);

  // ─── Load existing product (edit mode) ───
  const {
    data: productResponse,
    isLoading: productLoading,
    isFetching: productFetching,
    isError: productError,
    error: productFetchError,
    refetch: refetchProduct,
  } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => getProduct(productId),
    enabled: needsProductLoad,
  });
  const productData = productResponse?.data;

  const { data: hierarchyResponse = {}, isLoading: catLoading } = useQuery({
    queryKey: ["categoryHierarchy"],
    queryFn: () => getCategoryHierarchy(),
  });

  const categories = hierarchyResponse?.data || [];

  // Load collections
  const { data: collectionsResponse } = useQuery({
    queryKey: ["collections"],
    queryFn: () => getCollections({ limit: 100 }),
  });
  const allCollections = collectionsResponse?.data || [];

  // Load variant options when editing
  const { data: optionsResponse = {}, isFetched: optionsFetched } = useQuery({
    queryKey: ["variantOptions", productId],
    queryFn: () => getVariantOptions(productId),
    enabled: needsProductLoad,
  });
  const existingOptions = optionsResponse?.data || [];

  // Load SEO when editing
  const { data: seoResponse } = useQuery({
    queryKey: ["productSeo", productId],
    queryFn: () => getProductSeo(productId),
    enabled: needsProductLoad,
  });
  const existingSeo = seoResponse?.data;

  // Populate form when product data loads (basic fields — list row or full API)
  useEffect(() => {
    const source =
      productData ||
      (listProduct && String(listProduct.id) === String(productId) ? listProduct : null);
    if (!source || !productId) return;
    if (hydratedProductId.current === String(productId) && !productData) return;

    setForm(buildFormFromProduct(source));

    if (source.collection_ids?.length) {
      setSelectedCollectionIds(source.collection_ids);
    }

    if (source.images && source.images.length > 0) {
      const galleryImgs = source.images.filter((img) => img.image_type === "gallery");
      setExistingGalleryImages(
        galleryImgs.map((img) => ({
          id: img.id,
          url: resolveUploadUrl(img.image, "products"),
          image_type: "gallery",
        }))
      );

      const thumbImg = source.images.find((img) => img.image_type === "thumbnail") || source.images[0];
      if (thumbImg) {
        setThumbnailPreview(resolveUploadUrl(thumbImg.image, "products"));
      }
    } else if (source.thumbnail) {
      setThumbnailPreview(resolveUploadUrl(source.thumbnail, "products"));
    }

    hydratedProductId.current = String(productId);
  }, [productData, listProduct, productId]);

  // Variant color images — only from full product API (never mixed with gallery)
  useEffect(() => {
    if (!productData?.variants?.length) return;
    setVariantColorImages(buildColorImageMapFromVariants(productData.variants));
  }, [productData]);

  // Populate variant options and variants when editing (wait for full product data)
  useEffect(() => {
    if (!needsProductLoad || variantsInitialized.current) return;
    if (productLoading || !optionsFetched || !productData) return;

    if (existingOptions.length) {
      setVariantOptions(existingOptions);
      if (productData.variants?.length) {
        setVariants(mapDbVariantsToLocal(productData.variants, existingOptions));
      }
    } else if (productData.variants?.length) {
      setVariants(mapDbVariantsToLocal(productData.variants, []));
    }
    variantsInitialized.current = true;
  }, [needsProductLoad, productLoading, optionsFetched, existingOptions, productData, productId]);
  useEffect(() => {
    if (existingSeo) {
      setSeo({
        seo_title: existingSeo.seo_title || "",
        seo_description: existingSeo.seo_description || "",
      });
    }
  }, [existingSeo]);

  // Populate SEO when loaded
  const regenerateVariants = (nextOptions, prevVariants = variants) => {
    const built = buildCombinations(nextOptions, prevVariants, {
      price: form.compare_at_price || form.price || "0",
      offer_price: form.price || "0",
      stock: form.stock || "0",
    });
    return redistributeVariantStock(built, form.stock);
  };

  const syncProductStockFromVariants = (nextVariants) => {
    if (!nextVariants.length) return;
    const totalStock = deriveProductStockFromVariants(nextVariants);
    setForm((f) => ({ ...f, stock: String(totalStock) }));
  };

  const syncProductPriceFromVariants = (nextVariants) => {
    if (!nextVariants.length) return;
    const prices = deriveProductPricesFromVariants(
      nextVariants,
      form.compare_at_price || form.price,
      form.price
    );
    setForm((f) => ({
      ...f,
      price: String(prices.offer_price),
      compare_at_price: String(prices.price),
    }));
  };

  // ─── Category hierarchy helpers ───
  const selectedMain = form.category_id
    ? categories.find((c) => String(c.id) === String(form.category_id))
    : null;
  const subCategories = selectedMain?.sub_categories || [];
  const selectedSub = form.sub_category_id
    ? subCategories.find((s) => String(s.id) === String(form.sub_category_id))
    : null;
  const childCategories = selectedSub?.child_categories || [];

  const handleMainChange = (value) => {
    setForm((f) => ({ ...f, category_id: value, sub_category_id: "", child_category_id: "" }));
  };
  const handleSubChange = (value) => {
    setForm((f) => ({ ...f, sub_category_id: value, child_category_id: "" }));
  };

  // ─── Form change handlers ───
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => {
      const updated = { ...f, [name]: type === "checkbox" ? checked : value };
      if (name === "name" && !f.slug) {
        updated.slug = value
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
      }
      // Auto-calc discount based on compare_at_price vs price
      if ((name === "price" || name === "compare_at_price") && type !== "checkbox") {
        const sellingPrice = parseFloat(name === "price" ? value : f.price);
        const comparePrice = parseFloat(name === "compare_at_price" ? value : f.compare_at_price);
        // No longer storing discount_percentage in form but we keep the logic
      }
      return updated;
    });

    if (name === "stock") {
      const stockVal = parseStockValue(value);
      setVariants((prev) => {
        if (!prev.length) return prev;
        return redistributeVariantStock(prev, stockVal);
      });
    }
  };

  // const handleSwitchChange = (name) => (checked) => {
  //   setForm((f) => ({ ...f, [name]: checked }));
  // };
  const handleSwitchChange = (name) => (checked) => {
  setForm((f) => {
    const updated = {
      ...f,
      [name]: checked,
    };

    if (
      name === "charge_tax" &&
      !checked
    ) {
      updated.gst_percent = "";
    }

    return updated;
  });
};

  const handleSeoChange = (e) => {
    const { name, value } = e.target;
    setSeo((s) => ({ ...s, [name]: value }));
  };

  const handleSlugChange = (e) => {
    const value = e.target.value
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    setForm((f) => ({ ...f, slug: value }));
  };

  // ─── Form change handlers ───
  const handleThumbnailChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setThumbnail(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  };

  const handleGalleryChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setGalleryFiles((prev) => [...prev, ...files]);
    setGalleryPreview((prev) => [...prev, ...files.map((file) => URL.createObjectURL(file))]);
    e.target.value = "";
  };

  const handleRemoveExistingGalleryImage = (imageId) => {
    setRemovedImageIds((prev) => [...prev, imageId]);
    setExistingGalleryImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  const handleRemoveNewGalleryImage = (index) => {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setGalleryPreview((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVariantColorImagesChange = (color, files) => {
    const fileList = Array.from(files || []);
    if (!fileList.length) return;
    setVariantColorImages((prev) => ({
      ...prev,
      [color]: {
        existing: prev[color]?.existing || [],
        newFiles: [...(prev[color]?.newFiles || []), ...fileList],
        removedIds: prev[color]?.removedIds || [],
        previews: [
          ...(prev[color]?.previews || []),
          ...fileList.map((f) => URL.createObjectURL(f)),
        ],
      },
    }));
  };

  const handleRemoveVariantColorImage = (color, imageId) => {
    setVariantColorImages((prev) => ({
      ...prev,
      [color]: {
        ...prev[color],
        existing: (prev[color]?.existing || []).filter((img) => img.id !== imageId),
        removedIds: [...(prev[color]?.removedIds || []), imageId],
      },
    }));
  };

  const handleRemoveVariantColorNewImage = (color, previewIndex) => {
    setVariantColorImages((prev) => {
      const colorState = prev[color] || { existing: [], newFiles: [], previews: [], removedIds: [] };
      const newFiles = [...(colorState.newFiles || [])];
      const previews = [...(colorState.previews || [])];
      newFiles.splice(previewIndex, 1);
      previews.splice(previewIndex, 1);
      return {
        ...prev,
        [color]: { ...colorState, newFiles, previews },
      };
    });
  };

  // ─── Mutations ───
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = new FormData();

      // Core fields
      payload.append("name", form.name);
      payload.append("slug", form.slug || "");
      if (form.category_id) payload.append("category_id", form.category_id);
      if (form.sub_category_id) payload.append("sub_category_id", form.sub_category_id);
      if (form.child_category_id) payload.append("child_category_id", form.child_category_id);
      payload.append("brand", form.brand || "");
      payload.append("vendor", form.vendor || "");
      payload.append("product_type", form.product_type || "");

      const stockToSave = variants.length
        ? deriveProductStockFromVariants(variants)
        : parseStockValue(form.stock);
      const pricesToSave = variants.length
        ? deriveProductPricesFromVariants(variants, form.compare_at_price || form.price, form.price)
        : {
            price: parsePriceValue(form.compare_at_price || form.price),
            offer_price: parsePriceValue(form.price),
          };

      payload.append("stock", String(stockToSave));
      payload.append("price", String(pricesToSave.price));
      payload.append("offer_price", String(pricesToSave.offer_price));
      payload.append("cost_price", form.cost_price || "0");

      // Auto-calc discount
      const cmpPrice = pricesToSave.price;
      const sellPrice = pricesToSave.offer_price;
      if (cmpPrice > 0 && sellPrice > 0 && sellPrice < cmpPrice) {
        payload.append("discount_percentage", String(Math.round(((cmpPrice - sellPrice) / cmpPrice) * 100)));
      } else {
        payload.append("discount_percentage", "0");
      }

      payload.append(
  "gst_percent",
  form.charge_tax
    ? String(
        Number(form.gst_percent || 0)
      )
    : "0"
);
      // payload.append("gst_percent", form.charge_tax ? form.gst_percent || "0" : "0");
      payload.append("short_description", form.short_description || "");
      payload.append("long_description", form.long_description || "");
      payload.append("tags", form.tags || "");
      payload.append("status", form.status || "active");

      payload.append("collection_ids", JSON.stringify(selectedCollectionIds));

      // Product images — separate thumbnail and gallery uploads
      if (thumbnail) payload.append("thumbnail", thumbnail);
      for (const file of galleryFiles) {
        payload.append("gallery_images", file);
      }
      if (removedImageIds.length) {
        payload.append("removed_image_ids", JSON.stringify(removedImageIds));
      }

      // Variant images grouped by color (Flipkart-style)
      const variantImageMeta = {};
      const variantImageFiles = [];
      for (const color of getUniqueColors(variants)) {
        const colorState = variantColorImages[color] || { existing: [], newFiles: [], removedIds: [] };
        const newIndexes = [];
        for (const file of colorState.newFiles || []) {
          newIndexes.push(variantImageFiles.length);
          variantImageFiles.push(file);
        }
        variantImageMeta[color] = {
          existing_image_ids: (colorState.existing || []).map((img) => img.id),
          removed_image_ids: colorState.removedIds || [],
          new_file_indexes: newIndexes,
        };
      }
      if (Object.keys(variantImageMeta).length) {
        payload.append("variant_image_meta", JSON.stringify(variantImageMeta));
      }
      for (const file of variantImageFiles) {
        payload.append("variant_images", file);
      }

      // Variants + SEO (single request)
      if (variantOptions.length > 0) {
        payload.append(
          "variant_options",
          JSON.stringify(
            variantOptions.map((o, i) => ({
              option_name: o.option_name,
              option_values: parseStoredOptionValues(o),
              sort_order: i,
            }))
          )
        );
        payload.append(
          "variants",
          JSON.stringify(
            variants.map((v) => ({
              sku: String(v.sku || "").trim(),
              price: parsePriceValue(v.price, pricesToSave.price),
              offer_price: parsePriceValue(v.offer_price, pricesToSave.offer_price),
              stock: parseStockValue(v.stock),
              options: v.options,
              size: v.size,
              color: v.color,
              fabric: v.fabric,
            }))
          )
        );
      }
      payload.append("seo_data", JSON.stringify(seo));

      if (isEditing) {
        await updateProduct(productId, payload);
      } else {
        const result = await createProduct(payload);
        return result;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      if (isEditing && productId) {
        await queryClient.invalidateQueries({ queryKey: ["product", productId] });
        await queryClient.invalidateQueries({ queryKey: ["variantOptions", productId] });
        await queryClient.invalidateQueries({ queryKey: ["productSeo", productId] });
      }

      toast.success(isEditing ? "Product updated successfully!" : "Product added successfully!");
      if (!isEditing) {
        setForm(emptyForm);
        setSeo(emptySeo);
        setVariantOptions([]);
        setVariants([]);
        setThumbnail(null);
        setGalleryFiles([]);
        setThumbnailPreview(null);
        setGalleryPreview([]);
        setExistingGalleryImages([]);
        setRemovedImageIds([]);
        setVariantColorImages({});
        setSelectedCollectionIds([]);
        variantsInitialized.current = false;
      }
      navigate("/products/list");
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save product");
    },
  });

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const missing = [];
    if (!form.name?.trim()) missing.push("Product Title");
    if (!form.category_id) missing.push("Category");
    if (!form.price) missing.push("Price");

    if (
  form.charge_tax &&
  (
    form.gst_percent === "" ||
    Number(form.gst_percent) <= 0 ||
    Number(form.gst_percent) > 100
  )
) {
  missing.push(
    "Valid GST Rate between 0 and 100"
  );
}

    if (missing.length > 0) {
      setActiveTab("info");
      toast.error(`Please fill required fields: ${missing.join(", ")}.`);
      return;
    }
    saveMutation.mutate();
  };

  // ─── Variant Options (local state) ───
  const handleAddOption = () => {
    const optionName = selectedPreset === "Custom Option" ? customOptionName.trim() : selectedPreset;
    if (!optionName) {
      toast.error("Option name is required (e.g. Size, Color)");
      return;
    }
    const values = [...newOptionValueTags];
    if (values.length < 1) {
      toast.error("Add at least one option value");
      return;
    }
    if (variantOptions.some((o) => o.option_name.toLowerCase() === optionName.toLowerCase())) {
      toast.error("This option already exists");
      return;
    }
    setVariantOptions((prev) => {
      const next = [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          option_name: optionName,
          option_values: values,
          sort_order: prev.length,
        },
      ];
      setVariants((vPrev) => regenerateVariants(next, vPrev));
      return next;
    });
    setNewOptionValueTags([]);
    setCustomOptionName("");
  };

  const handleRemoveOption = (optionId) => {
    setVariantOptions((prev) => {
      const next = prev.filter((o) => o.id !== optionId);
      setVariants((vPrev) => (next.length ? regenerateVariants(next, vPrev) : []));
      return next;
    });
  };

  const handleOptionNameChange = (optionId, value) => {
    setVariantOptions((prev) => {
      const next = prev.map((opt) =>
        opt.id === optionId ? { ...opt, option_name: value } : opt
      );
      setVariants((vPrev) => regenerateVariants(next, vPrev));
      return next;
    });
  };

  const handleAddOptionValue = (optionId) => {
    const draft = optionValueDrafts[optionId]?.trim();
    if (!draft) return;

    setVariantOptions((prev) => {
      const next = prev.map((opt) => {
        if (opt.id !== optionId) return opt;
        const values = parseStoredOptionValues(opt);
        if (values.includes(draft)) return opt;
        return { ...opt, option_values: [...values, draft] };
      });
      setVariants((vPrev) => regenerateVariants(next, vPrev));
      return next;
    });
    setOptionValueDrafts((prev) => ({ ...prev, [optionId]: "" }));
  };

  const handleRemoveOptionValue = (optionId, valueToRemove) => {
    const removedOption = variantOptions.find((o) => o.id === optionId);
    if (removedOption?.option_name?.toLowerCase() === "color") {
      setVariantColorImages((prev) => {
        const next = { ...prev };
        delete next[valueToRemove];
        return next;
      });
    }

    setVariantOptions((prev) => {
      const next = prev
        .map((opt) => {
          if (opt.id !== optionId) return opt;
          const values = parseStoredOptionValues(opt).filter((v) => v !== valueToRemove);
          return { ...opt, option_values: values };
        })
        .filter((opt) => parseStoredOptionValues(opt).length > 0);
      setVariants((vPrev) => (next.length ? regenerateVariants(next, vPrev) : []));
      return next;
    });
  };

  const handleEditVariant = (variant) => {
    setEditingVariantKey(variantEditKey(variant));
    setEditVariantData({
      price: variant.price ?? "",
      offer_price: variant.offer_price ?? "",
      stock: String(parseStockValue(variant.stock)),
      sku: variant.sku ?? "",
    });
  };

  const handleVariantFieldChange = (e) => {
    const { name, value } = e.target;
    setEditVariantData((d) => ({ ...d, [name]: value }));
  };

  const handleSaveVariant = (variantKey) => {
    setVariants((prev) => {
      const updated = prev.map((v) =>
        variantEditKey(v) === variantKey
          ? {
              ...v,
              sku: String(editVariantData.sku || "").trim(),
              price: editVariantData.price ?? v.price,
              offer_price: editVariantData.offer_price ?? v.offer_price,
              stock: parseStockValue(editVariantData.stock),
            }
          : v
      );
      syncProductStockFromVariants(updated);
      syncProductPriceFromVariants(updated);
      return updated;
    });
    setEditingVariantKey(null);
    setEditVariantData({});
  };

  const handleCancelEditVariant = () => {
    setEditingVariantKey(null);
    setEditVariantData({});
  };

  const handleDeleteVariant = (variantKey) => {
    if (!window.confirm("Delete this variant?")) return;
    setVariants((prev) => {
      const updated = prev.filter((v) => variantEditKey(v) !== variantKey);
      syncProductStockFromVariants(updated);
      syncProductPriceFromVariants(updated);
      return updated;
    });
    if (editingVariantKey === variantKey) {
      setEditingVariantKey(null);
      setEditVariantData({});
    }
  };

  // ─── Collection toggle ───
  const toggleCollection = (collId) => {
    setSelectedCollectionIds((prev) =>
      prev.includes(collId)
        ? prev.filter((id) => id !== collId)
        : [...prev, collId]
    );
  };

  const hasProductSource =
    Boolean(productData) ||
    (listProduct && String(listProduct.id) === String(productId));

  // ─── Loading / Error states ───
  if (needsProductLoad && !hasProductSource && (productLoading || productFetching)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading product details...</p>
      </div>
    );
  }

  if (needsProductLoad && productError && !hasProductSource) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive">
          {productFetchError?.response?.data?.message || productFetchError?.message || "Failed to load product."}
        </p>
        <Button variant="outline" onClick={() => refetchProduct()}>Retry</Button>
        <Button variant="ghost" onClick={() => navigate("/products/list")}>Back to Product List</Button>
      </div>
    );
  }

  // ─── Styles ───
  const inputClass = "w-full";
  const labelClass = "text-sm font-medium text-foreground mb-1.5 block";

  // ─── SEO Preview data ───
  const seoHandle = form.slug || form.name?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "product";
  const seoPreviewTitle = seo.seo_title || form.name || "Product Title";
  const seoPreviewUrl = `https://yourstore.com/products/${seoHandle}`;
  const seoPreviewDesc = seo.seo_description || form.short_description || "Add a description to see how this product might appear in a search engine listing.";

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            {isEditing ? "Edit Product" : "Add Product"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isEditing ? "Update product details, variants, and SEO settings" : "Create a new product with variants and SEO"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/products/list")}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> {isEditing ? "Update Product" : "Save Product"}</>
            )}
          </Button>
        </div>
      </div>

      {/* ─── Main Layout: Content + Sidebar ─── */}
      <div className="flex flex-col lg:flex-row gap-6 mt-6">
        {/* ════ Main Content ════ */}
        <div className="flex-1 min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto gap-0">
              <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 py-3 text-sm font-medium data-[state=active]:text-primary text-muted-foreground">
                Product Info
              </TabsTrigger>
              <TabsTrigger value="variants" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 py-3 text-sm font-medium data-[state=active]:text-primary text-muted-foreground">
                Variants
              </TabsTrigger>
              <TabsTrigger value="seo" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 py-3 text-sm font-medium data-[state=active]:text-primary text-muted-foreground">
                SEO
              </TabsTrigger>
            </TabsList>

            {/* ═══════════════ Tab 1: Product Info ═══════════════ */}
            <TabsContent value="info" className="mt-6 space-y-6">
              {/* ─── Product Title ─── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Product Details</CardTitle>
                  <CardDescription>Basic information about your product</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name" className={labelClass}>Product Title *</Label>
                      <Input
                        id="name"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="e.g. Banarasi Silk Saree"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">The name shown to customers on your store</p>
                    </div>
                    <div>
                      <Label htmlFor="brand" className={labelClass}>Brand</Label>
                      <Input
                        id="brand"
                        name="brand"
                        value={form.brand}
                        onChange={handleChange}
                        placeholder="Brand name"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ─── Pricing ─── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pricing</CardTitle>
                  <CardDescription>Set product price, compare at price, and cost per item</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="price" className={labelClass}>Price (₹) *</Label>
                    <Input id="price" name="price" type="number" step="0.01" value={form.price} onChange={handleChange} placeholder="4999" required />
                    <p className="text-xs text-muted-foreground mt-1">The selling price</p>
                  </div>
                  <div>
                    <Label htmlFor="compare_at_price" className={labelClass}>Compare at Price (₹)</Label>
                    <Input id="compare_at_price" name="compare_at_price" type="number" step="0.01" value={form.compare_at_price} onChange={handleChange} placeholder="6999" />
                    <p className="text-xs text-muted-foreground mt-1">Original price shown as strikethrough</p>
                  </div>
                  <div>
                    <Label htmlFor="cost_price" className={labelClass}>Cost per Item (₹)</Label>
                    <Input id="cost_price" name="cost_price" type="number" step="0.01" value={form.cost_price} onChange={handleChange} placeholder="2500" />
                    <p className="text-xs text-muted-foreground mt-1">What you paid (not shown to customers)</p>
                  </div>
                  <div>
                    <Label htmlFor="stock" className={labelClass}>Stock Quantity</Label>
                    <Input id="stock" name="stock" type="number" min="0" step="1" value={form.stock} onChange={handleChange} placeholder="100" />
                    <p className="text-xs text-muted-foreground mt-1">Available inventory for this product</p>
                  </div>
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-4">
                      <Switch checked={form.charge_tax} onCheckedChange={handleSwitchChange("charge_tax")} id="charge_tax" />
                      <Label htmlFor="charge_tax" className="text-sm font-medium cursor-pointer">Charge Tax</Label>
                    </div>
                    {/* {form.charge_tax && (
                      <div className="mt-3 max-w-xs">
                        <Label htmlFor="gst_percent" className={labelClass}>GST Rate (%)</Label>
                        <Input id="gst_percent" name="gst_percent" type="number" value={form.gst_percent} onChange={handleChange} placeholder="12" />
                      </div>
                    )} */}
                    {form.charge_tax && (
  <div className="mt-3 max-w-xs">
    <Label
      htmlFor="gst_percent"
      className={labelClass}
    >
      GST Rate (%) *
    </Label>

    <Input
      id="gst_percent"
      name="gst_percent"
      type="number"
      min="0"
      max="100"
      step="0.01"
      value={form.gst_percent}
      onChange={handleChange}
      placeholder="e.g. 5, 12, 18"
      required={form.charge_tax}
    />

    <p className="text-xs text-muted-foreground mt-1">
      Product selling price already includes this GST.
    </p>
  </div>
)}
                  </div>
                </CardContent>
              </Card>

              {/* ─── Media ─── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Media</CardTitle>
                  <CardDescription>
                    Product-level thumbnail and gallery images. Color-specific variant images are managed separately in the Variants tab.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Thumbnail */}
                  <div>
                    <Label className={labelClass}>Thumbnail Image</Label>
                    <div className="mt-1">
                      <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition bg-secondary/30">
                        {thumbnailPreview ? (
                          <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Upload className="w-8 h-8" />
                            <span className="text-sm">Click to upload thumbnail</span>
                            <span className="text-xs">Recommended: 800×800px</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" onChange={handleThumbnailChange} className="hidden" />
                      </label>
                    </div>
                  </div>
                  {/* Gallery — product-level only, not variant color images */}
                  <div>
                    <Label className={labelClass}>Product Gallery Images</Label>
                    <p className="text-xs text-muted-foreground mb-2">General product photos shown on the product page. Not linked to color variants.</p>
                    <div className="mt-1 space-y-2">
                      {(existingGalleryImages.length > 0 || galleryPreview.length > 0) && (
                        <div className="grid grid-cols-3 gap-2">
                          {existingGalleryImages.map((img) => (
                            <div key={`existing-${img.id}`} className="relative aspect-square border border-border rounded overflow-hidden">
                              <img src={img.url} alt="" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => handleRemoveExistingGalleryImage(img.id)}
                                className="absolute top-1 right-1 bg-background/90 rounded-full p-0.5"
                              >
                                <X className="w-3 h-3 text-destructive" />
                              </button>
                              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1">
                                Gallery
                              </span>
                            </div>
                          ))}
                          {galleryPreview.map((preview, i) => (
                            <div key={`new-${i}`} className="relative aspect-square border border-border rounded overflow-hidden">
                              <img src={preview} alt={`New ${i + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => handleRemoveNewGalleryImage(i)}
                                className="absolute top-1 right-1 bg-background/90 rounded-full p-0.5"
                              >
                                <X className="w-3 h-3 text-destructive" />
                              </button>
                              <span className="absolute bottom-0 left-0 right-0 bg-primary/70 text-white text-[10px] px-1">New</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition bg-secondary/30">
                        <div className="flex flex-col items-center gap-1 text-muted-foreground">
                          <ImageIcon className="w-6 h-6" />
                          <span className="text-sm">Add gallery images</span>
                        </div>
                        <input type="file" multiple accept="image/*" onChange={handleGalleryChange} className="hidden" />
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ─── Descriptions ─── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Description</CardTitle>
                  <CardDescription>Short summary and rich text full description</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="short_description" className={labelClass}>Short Description</Label>
                    <Textarea id="short_description" name="short_description" value={form.short_description} onChange={handleChange} rows={3} placeholder="Brief product summary for listings and search results..." />
                    <p className="text-xs text-muted-foreground mt-1">{form.short_description?.length || 0}/160 characters</p>
                  </div>
                  <div>
                    <Label htmlFor="long_description" className={labelClass}>Full Description (Rich Text)</Label>
                    <div className="rich-editor-wrapper mt-1">
                      <ReactQuill
                        theme="snow"
                        value={form.long_description}
                        onChange={(value) => setForm((f) => ({ ...f, long_description: value }))}
                        modules={quillModules}
                        formats={quillFormats}
                        placeholder="Detailed product description, features, specifications, care instructions..."
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

            </TabsContent>

            {/* ═══════════════ Tab 2: Variants ═══════════════ */}
            <TabsContent value="variants" className="mt-6 space-y-6">
              {isEditing && (productLoading || productFetching) && !productData && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-secondary/30 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading variant and color image data...
                </div>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Variants</CardTitle>
                  <CardDescription>
                    Add options like Size or Color. Combinations are generated automatically as you build options.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_auto] gap-3 items-end">
                    <div>
                      <Label className={labelClass}>Option Name</Label>
                      <div className={selectedPreset === "Custom Option" ? "flex gap-2" : ""}>
                        <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                          <SelectTrigger className={`h-10 ${selectedPreset === "Custom Option" ? "w-[130px] shrink-0" : "w-full"}`}>
                            <SelectValue placeholder="Select option" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRESET_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedPreset === "Custom Option" && (
                          <Input
                            value={customOptionName}
                            onChange={(e) => setCustomOptionName(e.target.value)}
                            placeholder="Custom name"
                            className="h-10 flex-1"
                          />
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className={labelClass}>Option Values</Label>
                      <CreatableMultiInput
                        values={newOptionValueTags}
                        onChange={setNewOptionValueTags}
                        placeholder="Small, Medium, Large, XL"
                      />
                    </div>
                    <div className="md:pb-0">
                      <Button onClick={handleAddOption} className="h-10 w-full md:w-auto md:min-w-[120px]">
                        <Plus className="w-4 h-4 mr-2" /> Add Option
                      </Button>
                    </div>
                  </div>

                  {variantOptions.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <Label className={labelClass}>Options</Label>
                      {variantOptions.map((opt) => {
                        const values = parseStoredOptionValues(opt);
                        return (
                          <div key={opt.id} className="rounded-lg border border-border p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                              <Input
                                value={opt.option_name}
                                onChange={(e) => handleOptionNameChange(opt.id, e.target.value)}
                                placeholder="Option name"
                                className="h-9"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleRemoveOption(opt.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {values.map((val) => (
                                <Badge key={`${opt.id}-${val}`} variant="secondary" className="text-xs pr-1">
                                  <span>{val}</span>
                                  <button
                                    type="button"
                                    className="ml-1 inline-flex"
                                    onClick={() => handleRemoveOptionValue(opt.id, val)}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Input
                                value={optionValueDrafts[opt.id] || ""}
                                onChange={(e) =>
                                  setOptionValueDrafts((prev) => ({ ...prev, [opt.id]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddOptionValue(opt.id);
                                  }
                                }}
                                placeholder="Add another value"
                                className="h-9"
                              />
                              <Button type="button" variant="outline" onClick={() => handleAddOptionValue(opt.id)}>
                                Add
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {variants.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Color Images</CardTitle>
                    <CardDescription>
                      Upload images per color variant. Each color has its own image set — all sizes of the same color share these images (like Flipkart/Amazon).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {getUniqueColors(variants).map((color) => {
                      const allPreviews = getColorImagePreviews(color, variantColorImages);
                      return (
                        <div key={color} className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge className="text-sm px-3 py-1">{color}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {allPreviews.length} image{allPreviews.length !== 1 ? "s" : ""} assigned to <strong>{color}</strong>
                              </span>
                            </div>
                            <label className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer hover:underline font-medium">
                              <Upload className="w-3.5 h-3.5" />
                              Add images for {color}
                              <input
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleVariantColorImagesChange(color, e.target.files)}
                              />
                            </label>
                          </div>
                          {allPreviews.length > 0 ? (
                            <div className="flex flex-wrap gap-3">
                              {allPreviews.map((img, index) => (
                                <div key={`${color}-${img.id}`} className="relative group">
                                  <div className="w-24 h-24 border-2 border-border rounded-lg overflow-hidden shadow-sm">
                                    <img src={img.url} alt={`${color} image ${index + 1}`} className="w-full h-full object-cover" />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      img.type === "existing"
                                        ? handleRemoveVariantColorImage(color, img.id)
                                        : handleRemoveVariantColorNewImage(color, img.previewIndex)
                                    }
                                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  <div className="mt-1 text-center">
                                    <span className="text-[10px] font-medium text-primary block">{color}</span>
                                    <span className="text-[9px] text-muted-foreground">#{index + 1}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 py-3 px-4 rounded-md border border-dashed border-border bg-background">
                              <ImageIcon className="w-4 h-4 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground">No images assigned to <strong>{color}</strong> yet — upload above</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {variants.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Variants ({variants.length})</CardTitle>
                    <CardDescription>
                      Set SKU, pricing, and stock for each variant. Color images are shown in the Images column.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Variant</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Images</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">SKU</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Price (₹)</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Offer (₹)</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Stock</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variants.map((v) => {
                          const variantColor = getVariantColor(v);
                          const colorImages = getColorImagePreviews(variantColor, variantColorImages);
                          return (
                          <Fragment key={variantEditKey(v)}>
                            <tr className="border-b border-border/50 hover:bg-secondary/20 transition">
                              {editingVariantKey === variantEditKey(v) ? (
                                <>
                                  <td className="py-2 px-3 font-medium">{v.label}</td>
                                  <td className="py-2 px-3">
                                    {colorImages.length > 0 ? (
                                      <div className="flex gap-1">
                                        {colorImages.slice(0, 3).map((img) => (
                                          <img key={img.id} src={img.url} alt="" className="w-8 h-8 rounded object-cover border border-border" />
                                        ))}
                                        {colorImages.length > 3 && (
                                          <span className="text-xs text-muted-foreground self-center">+{colorImages.length - 3}</span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3">
                                    <Input name="sku" value={editVariantData.sku} onChange={handleVariantFieldChange} className="h-8 text-xs w-28" placeholder="SKU" />
                                  </td>
                                  <td className="py-2 px-3">
                                    <Input name="price" type="number" value={editVariantData.price} onChange={handleVariantFieldChange} className="h-8 text-xs w-24" />
                                  </td>
                                  <td className="py-2 px-3">
                                    <Input name="offer_price" type="number" value={editVariantData.offer_price} onChange={handleVariantFieldChange} className="h-8 text-xs w-24" />
                                  </td>
                                  <td className="py-2 px-3">
                                    <Input name="stock" type="number" min="0" step="1" value={editVariantData.stock} onChange={handleVariantFieldChange} className="h-8 text-xs w-20" />
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex gap-1">
                                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleSaveVariant(variantEditKey(v))}>
                                        <Check className="w-4 h-4" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancelEditVariant}>
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-2 px-3 font-medium">{v.label}</td>
                                  <td className="py-2 px-3">
                                    {colorImages.length > 0 ? (
                                      <div className="space-y-1">
                                        {variantColor && (
                                          <Badge variant="outline" className="text-[10px] h-5 px-1.5">{variantColor}</Badge>
                                        )}
                                        <div className="flex gap-1">
                                          {colorImages.slice(0, 4).map((img, idx) => (
                                            <div key={img.id} className="relative">
                                              <img
                                                src={img.url}
                                                alt={`${variantColor} ${idx + 1}`}
                                                className="w-9 h-9 rounded object-cover border-2 border-primary/30"
                                                title={`${variantColor} — image ${idx + 1}`}
                                              />
                                              <span className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                                {idx + 1}
                                              </span>
                                            </div>
                                          ))}
                                          {colorImages.length > 4 && (
                                            <span className="text-xs text-muted-foreground self-center">+{colorImages.length - 4}</span>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-amber-600 dark:text-amber-400">
                                        {variantColor ? `No images for ${variantColor}` : "—"}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-xs">{v.sku || "—"}</td>
                                  <td className="py-2 px-3">₹{v.price || "-"}</td>
                                  <td className="py-2 px-3">₹{v.offer_price || "-"}</td>
                                  <td className="py-2 px-3">{parseStockValue(v.stock)}</td>
                                  <td className="py-2 px-3">
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => handleEditVariant(v)}>
                                        Edit
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => handleDeleteVariant(variantEditKey(v))}>
                                        Delete
                                      </Button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ═══════════════ Tab 3: SEO ═══════════════ */}
            <TabsContent value="seo" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Search engine listing</CardTitle>
                  <CardDescription>
                    Add a title and description to see how this product might appear in a search engine listing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Search Preview */}
                  <div>
                    <Label className={labelClass}>Search preview</Label>
                    <div className="mt-1.5 bg-white border border-border rounded-lg p-4 max-w-[600px]">
                      <p className="text-[#202124] text-xs mb-1 font-normal">
                        {seoPreviewUrl.length > 70 ? seoPreviewUrl.substring(0, 70) + "..." : seoPreviewUrl}
                      </p>
                      <p className="text-[#1a0dab] text-lg leading-6 font-normal hover:underline cursor-pointer mb-1">
                        {seoPreviewTitle.length > 60 ? seoPreviewTitle.substring(0, 60) + "..." : seoPreviewTitle}
                      </p>
                      <p className="text-[#545454] text-sm leading-5">
                        {seoPreviewDesc.length > 160 ? seoPreviewDesc.substring(0, 157) + "..." : seoPreviewDesc}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4 max-w-xl">
                    <div>
                      <Label htmlFor="seo_title" className={labelClass}>SEO Title</Label>
                      <Input
                        id="seo_title"
                        name="seo_title"
                        value={seo.seo_title}
                        onChange={handleSeoChange}
                        placeholder={form.name || "Product title"}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {seo.seo_title?.length || 0} of 70 characters used
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="seo_description" className={labelClass}>Meta Description</Label>
                      <Textarea
                        id="seo_description"
                        name="seo_description"
                        value={seo.seo_description}
                        onChange={handleSeoChange}
                        rows={3}
                        placeholder={form.short_description || "Brief description for search results"}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {seo.seo_description?.length || 0} of 160 characters used
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="slug" className={labelClass}>URL Handle</Label>
                      <div className="flex items-center gap-0 mt-1.5">
                        <span className="inline-flex items-center h-10 px-3 text-sm text-muted-foreground bg-secondary/50 border border-r-0 border-border rounded-l-md whitespace-nowrap">
                          yourstore.com/products/
                        </span>
                        <Input
                          id="slug"
                          name="slug"
                          value={form.slug}
                          onChange={handleSlugChange}
                          placeholder={seoHandle}
                          className="rounded-l-none"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ════ Right Sidebar ════ */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          {/* ─── Status ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select name="status" value={form.status} onValueChange={(val) => setForm((f) => ({ ...f, status: val }))}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* ─── Product Organization ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Product Organization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Product Type */}
              <div>
                <Label htmlFor="product_type" className={labelClass}>Product Type</Label>
                <Input id="product_type" name="product_type" value={form.product_type} onChange={handleChange} placeholder="e.g. Saree, Kurta, Electronics" />
              </div>

              {/* Vendor */}
              <div>
                <Label htmlFor="vendor" className={labelClass}>Vendor</Label>
                <Input id="vendor" name="vendor" value={form.vendor} onChange={handleChange} placeholder="Vendor name" />
              </div>

              {/* Category */}
              <div>
                <Label className={labelClass}>Category *</Label>
                <div className="space-y-2">
                  <Select name="category_id" value={form.category_id} onValueChange={handleMainChange} required>
                    <SelectTrigger><SelectValue placeholder="Main category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select name="sub_category_id" value={form.sub_category_id} onValueChange={handleSubChange} disabled={!form.category_id}>
                    <SelectTrigger><SelectValue placeholder="Sub category" /></SelectTrigger>
                    <SelectContent>
                      {subCategories.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select name="child_category_id" value={form.child_category_id} onValueChange={(val) => setForm((f) => ({ ...f, child_category_id: val }))} disabled={!form.sub_category_id}>
                    <SelectTrigger><SelectValue placeholder="Child category" /></SelectTrigger>
                    <SelectContent>
                      {childCategories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Collections */}
              <div>
                <Label className={labelClass}>Collections</Label>
                <div className="space-y-1.5 mt-1 max-h-40 overflow-y-auto border border-border rounded-md p-2">
                  {allCollections.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-1">No collections available</p>
                  ) : (
                    allCollections.map((coll) => (
                      <label key={coll.id} className="flex items-center gap-2 cursor-pointer py-1 px-1 rounded hover:bg-secondary/30 transition">
                        <input
                          type="checkbox"
                          checked={selectedCollectionIds.includes(coll.id)}
                          onChange={() => toggleCollection(coll.id)}
                          className="rounded border-border"
                        />
                        <span className="text-sm">{coll.name}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Select collections this product belongs to
                </p>
              </div>

              {/* Tags */}
              <div>
                <Label htmlFor="tags" className={labelClass}>Tags</Label>
                <Input id="tags" name="tags" value={form.tags} onChange={handleChange} placeholder="Comma-separated tags" />
                <p className="text-xs text-muted-foreground mt-1">Used for search and filtering</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
