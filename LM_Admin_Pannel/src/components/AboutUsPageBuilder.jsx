import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadSettingsImage } from "@/services/settingsService";

// const API_ORIGIN = "http://localhost:5000";
const API_ORIGIN = "https://api.lmshowroom.com";

const LAYOUTS = {
  "1-column": { label: "1 Column (Full)", count: 1 },
  "2-column": { label: "2 Columns 50/50", count: 2 },
  "3-column": { label: "3 Columns Equal", count: 3 },
};

const COLUMN_TYPES = {
  "text-btn": "Text + Btn",
  image: "Image Only",
};

export const resolveImageUrl = (path) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_ORIGIN}/${path.replace(/^\//, "")}`;
};

const createColumn = (type = "text-btn", existing = {}) => ({
  type: existing.type || type,
  heading: existing.heading || "",
  content: existing.content || "",
  buttonLabel: existing.buttonLabel || "",
  buttonLink: existing.buttonLink || "",
  image: existing.image || "",
});

const createRow = (layout = "1-column", existing = {}) => {
  const count = LAYOUTS[layout]?.count || 1;
  const existingCols = existing.columns || [];
  const columns = Array.from({ length: count }, (_, i) =>
    createColumn(existingCols[i]?.type || "text-btn", existingCols[i] || {})
  );
  return {
    layout: existing.layout || layout,
    backgroundImage: existing.backgroundImage || "",
    columns,
  };
};

const normalizeSections = (sections) => {
  if (!Array.isArray(sections) || sections.length === 0) {
    return [createRow("1-column")];
  }
  return sections.map((row) => createRow(row.layout || "1-column", row));
};

export default function AboutUsPageBuilder({ initialSections, onSave, isSaving, onChange }) {
  const [rows, setRows] = useState(() => normalizeSections(initialSections));
  const [uploadingKey, setUploadingKey] = useState(null);

  useEffect(() => {
    setRows(normalizeSections(initialSections));
  }, [initialSections]);

  useEffect(() => {
    onChange?.(rows);
  }, [rows, onChange]);

  const updateRow = (rowIndex, updater) => {
    setRows((prev) => prev.map((row, i) => (i === rowIndex ? updater(row) : row)));
  };

  const handleLayoutChange = (rowIndex, layout) => {
    updateRow(rowIndex, (row) => createRow(layout, row));
  };

  const handleRemoveRow = (rowIndex) => {
    if (rows.length <= 1) {
      toast.error("At least one row is required.");
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== rowIndex));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, createRow("1-column")]);
  };

  const handleColumnTypeChange = (rowIndex, colIndex, type) => {
    updateRow(rowIndex, (row) => {
      const columns = [...row.columns];
      const prev = columns[colIndex] || {};
      columns[colIndex] = createColumn(type, {
        ...prev,
        type,
        ...(type === "image"
          ? { heading: "", content: "", buttonLabel: "", buttonLink: "" }
          : { image: "" }),
      });
      return { ...row, columns };
    });
  };

  const handleColumnFieldChange = (rowIndex, colIndex, field, value) => {
    updateRow(rowIndex, (row) => {
      const columns = [...row.columns];
      columns[colIndex] = { ...columns[colIndex], [field]: value };
      return { ...row, columns };
    });
  };

  const handleImageUpload = async (rowIndex, colIndex, file, target) => {
    if (!file) return;
    const key = `${rowIndex}-${colIndex}-${target}`;
    setUploadingKey(key);
    try {
      const url = await uploadSettingsImage(file, "about");
      if (target === "background") {
        updateRow(rowIndex, (row) => ({ ...row, backgroundImage: url }));
      } else {
        handleColumnFieldChange(rowIndex, colIndex, "image", url);
      }
      toast.success("Image uploaded.");
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Upload failed");
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSave = () => {
    const payload = rows.map(({ layout, backgroundImage, columns }) => ({
      layout,
      backgroundImage,
      columns: columns.map((col) => {
        if (col.type === "image") {
          return { type: "image", image: col.image || "" };
        }
        return {
          type: "text-btn",
          heading: col.heading || "",
          content: col.content || "",
          buttonLabel: col.buttonLabel || "",
          buttonLink: col.buttonLink || "",
        };
      }),
    }));
    onSave(payload);
  };

  const gridClass = (layout) => {
    if (layout === "2-column") return "grid-cols-1 md:grid-cols-2";
    if (layout === "3-column") return "grid-cols-1 md:grid-cols-3";
    return "grid-cols-1";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-semibold text-lg text-foreground">Manage Page Sections</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Edit your sections below. Drag and drop is not supported yet, but rows will save in the order shown.
        </p>
      </div>

      <div className="space-y-6">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-foreground"
          >
            {/* Row Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-secondary/20">
              <span className="text-sm font-bold tracking-wide">ROW #{rowIndex + 1}</span>
              <div className="flex items-center gap-2">
                <Select value={row.layout} onValueChange={(val) => handleLayoutChange(rowIndex, val)}>
                  <SelectTrigger className="w-[180px] h-9 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LAYOUTS).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => handleRemoveRow(rowIndex)}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Section Background */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Section Background (Optional)
                </Label>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Input
                    type="file"
                    accept="image/*"
                    className="max-w-xs"
                    disabled={uploadingKey === `${rowIndex}-bg-background`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(rowIndex, null, file, "background");
                      e.target.value = "";
                    }}
                  />
                  {row.backgroundImage && (
                    <img
                      src={resolveImageUrl(row.backgroundImage)}
                      alt="Section background"
                      className="h-16 w-24 object-cover rounded border border-border"
                    />
                  )}
                </div>
              </div>

              {/* Columns */}
              <div className={`grid gap-4 ${gridClass(row.layout)}`}>
                {row.columns.map((col, colIndex) => (
                  <div
                    key={colIndex}
                    className="rounded-lg border border-border bg-secondary/10 p-4 space-y-3"
                  >
                    <span className="inline-block text-xs font-medium text-muted-foreground mb-1">
                      Column {colIndex + 1}
                    </span>
                    <div>
                      <Label className="text-sm font-medium">Column Type:</Label>
                      <Select
                        value={col.type}
                        onValueChange={(val) => handleColumnTypeChange(rowIndex, colIndex, val)}
                      >
                        <SelectTrigger className="mt-1.5 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(COLUMN_TYPES).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {col.type === "text-btn" ? (
                      <>
                        <div>
                          <Label className="text-sm">Heading</Label>
                          <Input
                            value={col.heading}
                            onChange={(e) =>
                              handleColumnFieldChange(rowIndex, colIndex, "heading", e.target.value)
                            }
                            className="mt-1.5"
                            placeholder="Our Story"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Content</Label>
                          <Textarea
                            value={col.content}
                            onChange={(e) =>
                              handleColumnFieldChange(rowIndex, colIndex, "content", e.target.value)
                            }
                            rows={5}
                            className="mt-1.5"
                            placeholder="Write your section content..."
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-sm">Button Label</Label>
                            <Input
                              value={col.buttonLabel}
                              onChange={(e) =>
                                handleColumnFieldChange(rowIndex, colIndex, "buttonLabel", e.target.value)
                              }
                              className="mt-1.5"
                              placeholder="Btn Label"
                            />
                          </div>
                          <div>
                            <Label className="text-sm">Button Link</Label>
                            <Input
                              value={col.buttonLink}
                              onChange={(e) =>
                                handleColumnFieldChange(rowIndex, colIndex, "buttonLink", e.target.value)
                              }
                              className="mt-1.5"
                              placeholder="Btn Link"
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div>
                        <Label className="text-sm">Upload Main Image</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          className="mt-1.5"
                          disabled={uploadingKey === `${rowIndex}-${colIndex}-image`}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(rowIndex, colIndex, file, "column");
                            e.target.value = "";
                          }}
                        />
                        {col.image && (
                          <img
                            src={resolveImageUrl(col.image)}
                            alt="Column"
                            className="mt-3 w-full max-h-40 object-cover rounded border border-border"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="button" variant="outline" onClick={handleAddRow}>
          <Plus className="w-4 h-4 mr-2" />
          Add New Row
        </Button>
        <Button
          type="button"
          className="bg-orange-500 hover:bg-orange-600 text-white"
          onClick={handleSave}
          disabled={isSaving}
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
