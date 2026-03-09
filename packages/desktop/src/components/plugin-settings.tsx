import { useEffect, useState, useMemo } from "react";
import { cn, Button, Badge, getPluginIcon } from "@helm/ui";
import {
  IconCircleCheckFilled,
  IconDownload,
  IconTrash,
  IconLoader2,
  IconArrowLeft,
  IconExternalLink,
} from "@tabler/icons-react";
import { usePluginStore } from "../stores/plugin-store";
import type { MarketplacePlugin } from "../stores/plugin-store";

type Tab = "built-in" | "discover" | "installed";

const BUILTIN_MARKETPLACE = "helm-plugins";

function PluginAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const Icon = getPluginIcon(name);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-accent",
        size === "lg" ? "size-14" : "size-9",
      )}
    >
      <Icon className={size === "lg" ? "size-7" : "size-4.5"} />
    </div>
  );
}

function getSourceUrl(source: MarketplacePlugin["source"]): string | undefined {
  if (typeof source === "object" && source.url) return source.url;
  return undefined;
}

/* ─── Detail view ─── */

function PluginDetail({
  plugin,
  isInstalled,
  isLoading,
  onInstall,
  onUninstall,
  onBack,
}: {
  plugin: MarketplacePlugin;
  isInstalled: boolean;
  isLoading: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onBack: () => void;
}) {
  const sourceUrl = getSourceUrl(plugin.source);

  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconArrowLeft className="size-3" />
        Back
      </button>

      {/* Header */}
      <div className="flex gap-4">
        <PluginAvatar name={plugin.name} size="lg" />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{plugin.name}</h2>
            {plugin.category && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                {plugin.category}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {plugin.author?.name}
          </span>
          {plugin.version && (
            <span className="text-[10px] text-muted-foreground/60">
              v{plugin.version}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-start">
          {isLoading ? (
            <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
          ) : isInstalled ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-green-500">
                <IconCircleCheckFilled className="size-3.5" />
                Installed
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onUninstall}
                title="Uninstall"
                className="size-6 text-muted-foreground hover:text-destructive"
              >
                <IconTrash className="size-3.5" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="xs" className="h-7 text-xs" onClick={onInstall}>
              <IconDownload className="size-3.5" />
              Install
            </Button>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-medium text-foreground">Description</h3>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {plugin.description}
        </p>
      </div>

      {/* Metadata */}
      <div className="space-y-2 rounded-lg border bg-card p-3">
        {plugin.author?.name && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Author</span>
            <span className="text-[11px] text-foreground">{plugin.author.name}</span>
          </div>
        )}
        {plugin.version && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Version</span>
            <span className="text-[11px] text-foreground">{plugin.version}</span>
          </div>
        )}
        {plugin.category && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Category</span>
            <span className="text-[11px] text-foreground">{plugin.category}</span>
          </div>
        )}
        {sourceUrl && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Source</span>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-foreground hover:underline"
            >
              Repository
              <IconExternalLink className="size-3" />
            </a>
          </div>
        )}
      </div>

      {/* Tags */}
      {plugin.tags && plugin.tags.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium text-foreground">Tags</h3>
          <div className="flex flex-wrap gap-1">
            {plugin.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Card (list item) ─── */

function PluginCard({
  plugin,
  isInstalled,
  onSelect,
}: {
  plugin: MarketplacePlugin;
  isInstalled: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className="relative flex h-24 cursor-pointer gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40"
      onClick={onSelect}
    >
      {isInstalled && (
        <Badge variant="secondary" className="absolute -right-1.5 -top-1.5 gap-0.5 text-[9px] px-1.5 py-0 text-green-500">
          <IconCircleCheckFilled className="size-3" />
          Installed
        </Badge>
      )}
      <PluginAvatar name={plugin.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">{plugin.name}</span>
          {plugin.category && (
            <Badge variant="secondary" className="shrink-0 text-[9px] px-1.5 py-0">
              {plugin.category}
            </Badge>
          )}
        </div>
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {plugin.description}
        </p>
        <div className="mt-auto pt-1">
          <span className="text-[10px] text-muted-foreground/60">
            {plugin.author?.name}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ─── */

export function PluginSettings() {
  const {
    plugins,
    installedPlugins,
    loadingId,
    isLoading,
    fetchMarketplace,
    loadInstalled,
    installPlugin,
    uninstallPlugin,
  } = usePluginStore();

  const [tab, setTab] = useState<Tab>("built-in");
  const [selected, setSelected] = useState<MarketplacePlugin | null>(null);

  useEffect(() => {
    fetchMarketplace();
    loadInstalled();
  }, [fetchMarketplace, loadInstalled]);

  const installedNames = useMemo(() => {
    const names = new Set<string>();
    for (const [key, enabled] of Object.entries(installedPlugins)) {
      if (enabled) names.add(key);
    }
    return names;
  }, [installedPlugins]);

  const builtinList = useMemo(
    () => plugins.filter((p) => p.marketplace === BUILTIN_MARKETPLACE),
    [plugins],
  );

  const discoverPlugins = useMemo(
    () => plugins.filter((p) => p.marketplace !== BUILTIN_MARKETPLACE),
    [plugins],
  );

  const grouped = useMemo(() => {
    const groups: Record<string, MarketplacePlugin[]> = {};
    for (const plugin of discoverPlugins) {
      const cat = plugin.category ?? "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(plugin);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [discoverPlugins]);

  const installedList = useMemo(
    () => plugins.filter((p) => installedNames.has(p.name)),
    [plugins, installedNames],
  );

  /* Detail view */
  if (selected) {
    return (
      <PluginDetail
        plugin={selected}
        isInstalled={installedNames.has(selected.name)}
        isLoading={loadingId === selected.name}
        onInstall={() => installPlugin(selected.name)}
        onUninstall={() => uninstallPlugin(selected.name)}
        onBack={() => setSelected(null)}
      />
    );
  }

  const renderGrid = (items: MarketplacePlugin[]) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map((plugin) => (
        <PluginCard
          key={plugin.name}
          plugin={plugin}
          isInstalled={installedNames.has(plugin.name)}
          onSelect={() => setSelected(plugin)}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Plugins</h2>
        <p className="text-[11px] text-muted-foreground">
          Browse and install plugins from the official Claude Code marketplace.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {(["built-in", "discover", "installed"] as const).map((t) => {
          const labels: Record<Tab, string> = {
            "built-in": "Built-in",
            discover: "Discover",
            installed: `Installed (${installedNames.size})`,
          };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1 text-xs transition-colors",
                tab === t
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "built-in" ? (
        builtinList.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <span className="text-xs text-muted-foreground">No built-in plugins</span>
          </div>
        ) : (
          renderGrid(builtinList)
        )
      ) : tab === "discover" ? (
        discoverPlugins.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <span className="text-xs text-muted-foreground">No plugins found</span>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([category, items]) => (
              <div key={category} className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground capitalize">{category}</h3>
                {renderGrid(items)}
              </div>
            ))}
          </div>
        )
      ) : installedList.length === 0 ? (
        <div className="flex h-32 items-center justify-center">
          <span className="text-xs text-muted-foreground">No plugins installed</span>
        </div>
      ) : (
        renderGrid(installedList)
      )}
    </div>
  );
}
