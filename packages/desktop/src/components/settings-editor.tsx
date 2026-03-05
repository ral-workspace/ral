import { useState, useMemo } from "react";
import {
  cn,
  Input,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Separator,
} from "@helm/ui";
import { IconSearch, IconRotate } from "@tabler/icons-react";
import { useTheme } from "next-themes";
import {
  SETTINGS_METADATA,
  SETTING_SECTIONS,
  DEFAULT_SETTINGS,
} from "../settings";
import { useSettingsStore } from "../stores";
import type { Settings, SettingSection, SettingMeta } from "../settings";
import { PluginSettings } from "./plugin-settings";

type SettingEntry = [keyof Settings, SettingMeta];

/** Group entries by category, preserving insertion order. */
function groupByCategory(entries: SettingEntry[]) {
  const groups: { category: string; entries: SettingEntry[] }[] = [];
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const cat = entry[1].category;
    const idx = seen.get(cat);
    if (idx !== undefined) {
      groups[idx].entries.push(entry);
    } else {
      seen.set(cat, groups.length);
      groups.push({ category: cat, entries: [entry] });
    }
  }
  return groups;
}

export function SettingsEditor() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const { setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingSection>("Editor");
  const [search, setSearch] = useState("");

  const allEntries = useMemo(
    () => Object.entries(SETTINGS_METADATA) as SettingEntry[],
    [],
  );

  const filteredEntries = useMemo(() => {
    if (search) {
      const q = search.toLowerCase();
      return allEntries.filter(
        ([key, meta]) =>
          key.toLowerCase().includes(q) ||
          meta.label.toLowerCase().includes(q) ||
          meta.description.toLowerCase().includes(q),
      );
    }
    return allEntries.filter(([, meta]) => meta.section === activeSection);
  }, [allEntries, activeSection, search]);

  const categoryGroups = useMemo(
    () => groupByCategory(filteredEntries),
    [filteredEntries],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="flex items-center gap-2 px-5 py-3">
        <IconSearch className="size-3.5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search settings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 flex-1 border-none bg-transparent text-sm shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Section nav */}
        <div className="w-36 shrink-0 overflow-y-auto px-3">
          <div className="flex flex-col gap-0.5">
            {SETTING_SECTIONS.map((sec) => (
              <button
                key={sec}
                onClick={() => {
                  setActiveSection(sec);
                  setSearch("");
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-xs transition-colors",
                  !search && activeSection === sec
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {sec}
              </button>
            ))}
          </div>
        </div>

        {/* Settings list */}
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          {!search && activeSection === "Plugins" ? (
            <PluginSettings />
          ) : filteredEntries.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <span className="text-xs text-muted-foreground">
                No settings found
              </span>
            </div>
          ) : (
            <div className="space-y-6">
              {categoryGroups.map(({ category, entries }) => (
                <div key={category} className="space-y-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    {category}
                  </h2>
                  <ItemGroup className="rounded-lg bg-card">
                    {entries.map(([key, meta], i) => (
                      <div key={key}>
                        {i > 0 && <Separator />}
                        <SettingItem
                          meta={meta}
                          value={settings[key]}
                          defaultValue={DEFAULT_SETTINGS[key]}
                          onChange={(val) => {
                            updateSettings({ [key]: val } as Partial<Settings>);
                            if (key === "ui.colorTheme")
                              setTheme(val as string);
                          }}
                        />
                      </div>
                    ))}
                  </ItemGroup>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingItem({
  meta,
  value,
  defaultValue,
  onChange,
}: {
  meta: SettingMeta;
  value: unknown;
  defaultValue: unknown;
  onChange: (val: unknown) => void;
}) {
  const isModified = JSON.stringify(value) !== JSON.stringify(defaultValue);

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle className="text-xs">
          {meta.label}
          {isModified && (
            <button
              onClick={() => onChange(defaultValue)}
              title="Reset to default"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <IconRotate className="size-3" />
            </button>
          )}
        </ItemTitle>
        <ItemDescription className="text-[11px]">
          {meta.description}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <SettingControl meta={meta} value={value} onChange={onChange} />
      </ItemActions>
    </Item>
  );
}

function SettingControl({
  meta,
  value,
  onChange,
}: {
  meta: SettingMeta;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  if (meta.type === "boolean") {
    return (
      <Switch
        checked={Boolean(value)}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  }

  if (meta.type === "select" && meta.options) {
    return (
      <Select value={String(value)} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {meta.options.map((opt) => (
            <SelectItem key={opt} value={opt} className="text-xs">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (meta.type === "number") {
    return (
      <Input
        type="number"
        value={Number(value)}
        min={meta.min}
        max={meta.max}
        onChange={(e) => {
          const num = Number(e.target.value);
          if (!Number.isNaN(num)) onChange(num);
        }}
        className="h-7 w-20 text-xs"
      />
    );
  }

  return (
    <Input
      type="text"
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-48 text-xs"
    />
  );
}
