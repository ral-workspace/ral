import { useEffect } from "react";
import {
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@helm/ui";
import { IconCheck, IconDownload, IconTrash, IconLoader2 } from "@tabler/icons-react";
import { usePluginStore, AVAILABLE_PLUGINS } from "../stores/plugin-store";

export function PluginSettings() {
  const { installedPlugins, loadingId, loadInstalled, installPlugin, uninstallPlugin } =
    usePluginStore();

  useEffect(() => {
    loadInstalled();
  }, [loadInstalled]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">AI Plugins</h2>
        <p className="text-[11px] text-muted-foreground">
          Plugins teach the AI agent new skills like creating databases, presentations, and spreadsheets.
        </p>
        <ItemGroup className="rounded-lg bg-card">
          {AVAILABLE_PLUGINS.map((plugin) => {
            const isInstalled = Object.keys(installedPlugins).some(
              (key) => key.startsWith(plugin.npmPackage) && installedPlugins[key],
            );
            const isLoading = loadingId === plugin.id;

            return (
              <Item key={plugin.id} size="sm">
                <ItemContent>
                  <ItemTitle className="text-xs">{plugin.name}</ItemTitle>
                  <ItemDescription className="text-[11px]">
                    {plugin.description}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {isLoading ? (
                    <Button variant="ghost" size="xs" disabled>
                      <IconLoader2 className="size-3 animate-spin" />
                    </Button>
                  ) : isInstalled ? (
                    <div className="flex items-center gap-1">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <IconCheck className="size-3" />
                        Installed
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => uninstallPlugin(plugin.id)}
                        title="Uninstall"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <IconTrash className="size-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => installPlugin(plugin.id)}
                    >
                      <IconDownload className="size-3" />
                      Install
                    </Button>
                  )}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      </div>
    </div>
  );
}
