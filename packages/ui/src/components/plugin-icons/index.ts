import type { ComponentType, SVGProps } from "react";
import { IconDatabase, IconPresentation, IconPuzzle, IconTable } from "@tabler/icons-react";
import SupabaseIcon from "./brand/supabase";
import PineconeIcon from "./brand/pinecone";
import FigmaIcon from "./brand/figma";
import FirebaseIcon from "./brand/firebase";
import VercelIcon from "./brand/vercel";
import TypeScriptIcon from "./brand/typescript";
import PythonIcon from "./brand/python";
import GoIcon from "./brand/go";
import RustIcon from "./brand/rust";
import PhpIcon from "./brand/php";
import SwiftIcon from "./brand/swift";
import KotlinIcon from "./brand/kotlin";
import JavaIcon from "./brand/java";
import ClaudeIcon from "./brand/claude";
import StripeIcon from "./brand/stripe";
import FirecrawlIcon from "./brand/firecrawl";
import SentryIcon from "./brand/sentry";
import GithubIcon from "./brand/github";
import LinearIcon from "./brand/linear";
import NotionIcon from "./brand/notion";
import SlackIcon from "./brand/slack";
import AsanaIcon from "./brand/asana";
import AtlassianIcon from "./brand/atlassian";
import GitlabIcon from "./brand/gitlab";
import PlaywrightIcon from "./brand/playwright";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Exact name match
const pluginIconMap: Record<string, IconComponent> = {
  supabase: SupabaseIcon,
  pinecone: PineconeIcon,
  figma: FigmaIcon,
  firebase: FirebaseIcon,
  vercel: VercelIcon,
  "typescript-lsp": TypeScriptIcon,
  "pyright-lsp": PythonIcon,
  "gopls-lsp": GoIcon,
  "rust-analyzer-lsp": RustIcon,
  "php-lsp": PhpIcon,
  "swift-lsp": SwiftIcon,
  "kotlin-lsp": KotlinIcon,
  "jdtls-lsp": JavaIcon,
  stripe: StripeIcon,
  firecrawl: FirecrawlIcon,
  sentry: SentryIcon,
  github: GithubIcon,
  linear: LinearIcon,
  notion: NotionIcon,
  slack: SlackIcon,
  asana: AsanaIcon,
  atlassian: AtlassianIcon,
  gitlab: GitlabIcon,
  playwright: PlaywrightIcon,
  database: IconDatabase,
  spreadsheet: IconTable,
  presentation: IconPresentation,
};

// Prefix/keyword match for Claude-related plugins
const claudePlugins = new Set([
  "agent-sdk-dev",
  "pr-review-toolkit",
  "commit-commands",
  "feature-dev",
  "security-guidance",
  "code-review",
  "code-simplifier",
  "explanatory-output-style",
  "learning-output-style",
  "frontend-design",
  "playground",
  "ralph-loop",
  "hookify",
  "plugin-dev",
  "claude-code-setup",
  "claude-md-management",
  "skill-creator",
]);

export function getPluginIcon(name: string): IconComponent {
  const key = name.toLowerCase();
  if (pluginIconMap[key]) return pluginIconMap[key];
  if (claudePlugins.has(key)) return ClaudeIcon;
  return IconPuzzle;
}

export {
  SupabaseIcon,
  PineconeIcon,
  FigmaIcon,
  FirebaseIcon,
  VercelIcon,
  TypeScriptIcon,
  PythonIcon,
  GoIcon,
  RustIcon,
  PhpIcon,
  SwiftIcon,
  KotlinIcon,
  JavaIcon,
  ClaudeIcon,
  StripeIcon,
  FirecrawlIcon,
  SentryIcon,
  GithubIcon,
  LinearIcon,
  NotionIcon,
  SlackIcon,
  AsanaIcon,
  AtlassianIcon,
  GitlabIcon,
  PlaywrightIcon,
};
