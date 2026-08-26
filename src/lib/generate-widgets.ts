import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DesignAnalysis } from "./elementor-builder";
import {
  availableWidgets,
  mergeRemoteWidgets,
  missingLayoutRoles,
  neededRolesFromAnalysis,
  type WidgetControl,
  type WidgetRole,
} from "./elementor-widgets";
import { classifyPageKind } from "./layout-plan";
import { dataDir } from "./paths";
import { zipPlugin } from "./plugin";
import type { Site } from "./types";
import type { RemoteElementorWidget, RemotePlugin } from "./wordpress";
import { deployZip, listElementorWidgets, listPlugins } from "./wordpress";

export const GENERATED_PLUGIN_SLUG = "plugin-agent-widgets";

const ROLE_WIDGETS: Array<{
  role: WidgetRole;
  type: string;
  title: string;
  className: string;
}> = [
  { role: "header", type: "plugin_agent_header", title: "Generated Header", className: "Plugin_Agent_Widget_Header" },
  { role: "blogHero", type: "plugin_agent_blog_hero", title: "Generated Blog Hero", className: "Plugin_Agent_Widget_Blog_Hero" },
  { role: "takeaways", type: "plugin_agent_takeaways", title: "Generated Takeaways", className: "Plugin_Agent_Widget_Takeaways" },
  { role: "articleCta", type: "plugin_agent_article_cta", title: "Generated Article CTA", className: "Plugin_Agent_Widget_Article_Cta" },
  { role: "faq", type: "plugin_agent_faq", title: "Generated FAQ", className: "Plugin_Agent_Widget_Faq" },
  { role: "downloadCta", type: "plugin_agent_download_cta", title: "Generated Download CTA", className: "Plugin_Agent_Widget_Download_Cta" },
  { role: "relatedPosts", type: "plugin_agent_related_posts", title: "Generated Related Posts", className: "Plugin_Agent_Widget_Related_Posts" },
  { role: "footer", type: "plugin_agent_footer", title: "Generated Footer", className: "Plugin_Agent_Widget_Footer" },
];

export type GeneratedWidgetsResult = {
  plugins: RemotePlugin[];
  remoteWidgets: RemoteElementorWidget[];
  generated: WidgetRole[];
  installed: boolean;
  version?: string;
};

export function generatedPluginZipPath(): string {
  return path.join(dataDir(), "generated", `${GENERATED_PLUGIN_SLUG}.zip`);
}

export async function ensureGeneratedWidgets(options: {
  site?: Site;
  plugins: RemotePlugin[];
  remoteWidgets: RemoteElementorWidget[];
  analysis: DesignAnalysis;
  filename?: string;
}): Promise<GeneratedWidgetsResult> {
  const merged = mergeRemoteWidgets(availableWidgets(options.plugins), options.remoteWidgets);
  if (classifyPageKind(options.analysis, merged, options.filename) === "landing") {
    return {
      plugins: options.plugins,
      remoteWidgets: options.remoteWidgets,
      generated: [],
      installed: false,
    };
  }
  const needed = neededRolesFromAnalysis(options.analysis.sections);
  const missing = missingLayoutRoles(merged, needed);
  if (missing.length === 0) {
    return {
      plugins: options.plugins,
      remoteWidgets: options.remoteWidgets,
      generated: [],
      installed: false,
    };
  }

  const version = `1.${Date.now().toString().slice(-6)}`;
  const dir = path.join(dataDir(), "generated", GENERATED_PLUGIN_SLUG);
  await writeGeneratedPlugin(dir, missing, version);
  const zip = await zipPlugin(dir, GENERATED_PLUGIN_SLUG);
  await mkdir(path.dirname(generatedPluginZipPath()), { recursive: true });
  await writeFile(generatedPluginZipPath(), zip);

  let plugins = options.plugins;
  let remoteWidgets = [...options.remoteWidgets];
  let installed = false;

  const canDeploy = Boolean(
    options.site?.url &&
      options.site.username &&
      options.site.password &&
      options.plugins.some(
        (plugin) => plugin.status === "active" && plugin.file.toLowerCase().startsWith("elementor/"),
      ),
  );

  if (canDeploy && options.site) {
    try {
      await deployZip({
        site: options.site,
        zip,
        filename: `${GENERATED_PLUGIN_SLUG}.zip`,
        slug: GENERATED_PLUGIN_SLUG,
        activate: true,
      });
      plugins = await listPlugins(options.site);
      remoteWidgets = await listElementorWidgets(options.site);
      installed = true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "deploy failed";
      throw new Error(`Generated widgets for ${missing.join(", ")}, but WordPress would not install them: ${detail}`);
    }
  }

  const have = new Set(remoteWidgets.map((widget) => widget.type));
  for (const synthetic of syntheticRemoteWidgets(missing)) {
    if (!have.has(synthetic.type)) {
      remoteWidgets.push(synthetic);
      have.add(synthetic.type);
    }
  }

  return { plugins, remoteWidgets, generated: missing, installed, version };
}

export function syntheticRemoteWidgets(roles: WidgetRole[]): RemoteElementorWidget[] {
  return ROLE_WIDGETS.filter((item) => roles.includes(item.role)).map((item) => ({
    type: item.type,
    title: item.title,
    plugin: GENERATED_PLUGIN_SLUG,
    custom: true,
    controls: syntheticControls(item.role),
  }));
}

export async function writeGeneratedPlugin(dir: string, roles: WidgetRole[], version: string) {
  const specs = ROLE_WIDGETS.filter((item) => roles.includes(item.role));
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await writeFile(path.join(dir, "assets", "widgets.css"), WIDGET_CSS, "utf8");
  await writeFile(path.join(dir, "plugin-agent-widgets.php"), mainPluginPhp(specs, version), "utf8");
}

function phpStr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function defaultHeading(role: WidgetRole): { before: string; highlight: string; after: string } {
  if (role === "blogHero") return { before: "Headline from your ", highlight: "design", after: "" };
  if (role === "takeaways") return { before: "Key ", highlight: "Takeaways", after: "" };
  if (role === "articleCta") return { before: "Want a ", highlight: "fuller schedule?", after: "" };
  if (role === "faq") return { before: "Frequently asked ", highlight: "questions", after: "" };
  if (role === "downloadCta") return { before: "10 Ways to ", highlight: "get started", after: "" };
  if (role === "relatedPosts") return { before: "Related ", highlight: "posts", after: "" };
  return { before: "", highlight: "", after: "" };
}

function syntheticControls(role: WidgetRole): Record<string, WidgetControl> {
  const heading = defaultHeading(role);
  const base: Record<string, WidgetControl> = {
    heading_before: { type: "text", default: heading.before },
    heading_highlight: { type: "text", default: heading.highlight },
    heading_after: { type: "text", default: heading.after },
  };
  if (role === "blogHero") {
    return {
      ...base,
      text: { type: "textarea", default: "Replace this with the hero copy from your design." },
      cta_text: { type: "text", default: "Primary action" },
    };
  }
  if (role === "takeaways") {
    return {
      ...base,
      items: {
        type: "repeater",
        fields: ["text"],
        default: [
          { text: "Takeaway from the article — first point" },
          { text: "Takeaway from the article — second point" },
          { text: "Takeaway from the article — third point" },
          { text: "Takeaway from the article — fourth point" },
        ],
      },
    };
  }
  if (role === "faq") {
    return {
      ...base,
      items: {
        type: "repeater",
        fields: ["question", "answer"],
        default: [
          {
            question: "How does this section work?",
            answer: "Drop a design and Plugin Agent fills this FAQ from the widget defaults. Edit each item in Elementor.",
          },
          {
            question: "Can we replace these questions?",
            answer: "Yes. Open the widget and edit the repeater.",
          },
        ],
      },
    };
  }
  if (role === "articleCta") {
    return {
      ...base,
      text: { type: "textarea", default: "See how this section can help. Replace this line in Elementor." },
      cta_text: { type: "text", default: "Schedule a Demo Now" },
    };
  }
  if (role === "downloadCta") {
    return {
      ...base,
      text: { type: "textarea", default: "A practical checklist you can implement today." },
      cta_text: { type: "text", default: "Download Free Checklist" },
    };
  }
  if (role === "header") {
    return {
      logo_alt: { type: "text", default: "Site name" },
      phone: { type: "text", default: "(555) 010-0100" },
      cta_text: { type: "text", default: "Let's Get Started" },
    };
  }
  if (role === "footer") {
    return {
      logo_alt: { type: "text", default: "Site name" },
      tagline: { type: "textarea", default: "Generated footer — replace links in Elementor." },
      phone: { type: "text", default: "(555) 010-0100" },
    };
  }
  return base;
}

function mainPluginPhp(
  specs: Array<{ role: WidgetRole; type: string; title: string; className: string }>,
  version: string,
): string {
  const classes = specs.map((spec) => widgetClassPhp(spec)).join("\n\n");
  return `<?php
/**
 * Plugin Name: Plugin Agent Widgets
 * Description: Elementor widgets generated by Plugin Agent when the connected site did not already have matching widgets for a dropped design.
 * Version: ${phpStr(version)}
 * Author: Plugin Agent
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Requires Plugins: elementor
 * License: GPLv2 or later
 */

defined('ABSPATH') || exit;

add_action('elementor/elements/categories_registered', 'plugin_agent_widgets_category');
add_action('elementor/widgets/register', 'plugin_agent_widgets_register');
add_action('elementor/widgets/widgets_registered', 'plugin_agent_widgets_register');
add_action('elementor/frontend/after_enqueue_styles', 'plugin_agent_widgets_styles');

function plugin_agent_widgets_category($elements_manager) {
    $elements_manager->add_category(
        'plugin-agent',
        array('title' => 'Plugin Agent', 'icon' => 'fa fa-plug')
    );
}

function plugin_agent_widgets_styles() {
    wp_enqueue_style(
        'plugin-agent-widgets',
        plugins_url('assets/widgets.css', __FILE__),
        array(),
        '${phpStr(version)}'
    );
}

function plugin_agent_widgets_register($widgets_manager) {
    static $done = false;
    if ($done || !class_exists('\\Elementor\\Widget_Base')) {
        return;
    }
    $done = true;

${classes}

    $widgets = array(
${specs.map((spec) => `        new ${spec.className}(),`).join("\n")}
    );
    foreach ($widgets as $widget) {
        if (method_exists($widgets_manager, 'register')) {
            $widgets_manager->register($widget);
        } else {
            $widgets_manager->register_widget_type($widget);
        }
    }
}
`;
}

function widgetClassPhp(spec: { role: WidgetRole; type: string; title: string; className: string }): string {
  return `    class ${spec.className} extends \\Elementor\\Widget_Base {
        public function get_name() { return '${spec.type}'; }
        public function get_title() { return '${phpStr(spec.title)}'; }
        public function get_icon() { return 'eicon-site-identity'; }
        public function get_categories() { return array('plugin-agent'); }
        public function get_style_depends() { return array('plugin-agent-widgets'); }

        protected function register_controls() {
${indent(controlsPhp(spec.role), 8)}
        }

        protected function render() {
            $s = $this->get_settings_for_display();
${indent(renderPhp(spec.role), 8)}
        }
    }`;
}

function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line.length ? pad + line.replace(/^\s+/, (ws) => ws) : line))
    .join("\n");
}

function controlsPhp(role: WidgetRole): string {
  const heading = `        $this->start_controls_section('content', array('label' => 'Content'));
        $this->add_control('heading_before', array('label' => 'Heading before', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => '${phpStr(defaultHeading(role).before)}'));
        $this->add_control('heading_highlight', array('label' => 'Highlight', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => '${phpStr(defaultHeading(role).highlight)}'));
        $this->add_control('heading_after', array('label' => 'Heading after', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => '${phpStr(defaultHeading(role).after)}'));`;
  if (role === "blogHero") {
    return `${heading}
        $this->add_control('text', array('label' => 'Support text', 'type' => \\Elementor\\Controls_Manager::TEXTAREA, 'default' => 'Replace this with the hero copy from your design.'));
        $this->add_control('image', array('label' => 'Image', 'type' => \\Elementor\\Controls_Manager::MEDIA));
        $this->add_control('cta_text', array('label' => 'Button', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => 'Primary action'));
        $this->end_controls_section();`;
  }
  if (role === "takeaways") {
    return `${heading}
        $repeater = new \\Elementor\\Repeater();
        $repeater->add_control('text', array('label' => 'Text', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => 'Takeaway from the article', 'label_block' => true));
        $this->add_control('items', array(
            'label' => 'Takeaways',
            'type' => \\Elementor\\Controls_Manager::REPEATER,
            'fields' => $repeater->get_controls(),
            'default' => array(
                array('text' => 'Takeaway from the article — first point'),
                array('text' => 'Takeaway from the article — second point'),
                array('text' => 'Takeaway from the article — third point'),
                array('text' => 'Takeaway from the article — fourth point'),
            ),
            'title_field' => '{{{ text }}}',
        ));
        $this->end_controls_section();`;
  }
  if (role === "faq") {
    return `${heading}
        $repeater = new \\Elementor\\Repeater();
        $repeater->add_control('question', array('label' => 'Question', 'type' => \\Elementor\\Controls_Manager::TEXT, 'label_block' => true));
        $repeater->add_control('answer', array('label' => 'Answer', 'type' => \\Elementor\\Controls_Manager::TEXTAREA));
        $this->add_control('items', array(
            'label' => 'Questions',
            'type' => \\Elementor\\Controls_Manager::REPEATER,
            'fields' => $repeater->get_controls(),
            'default' => array(
                array('question' => 'How does this section work?', 'answer' => 'Drop a design and Plugin Agent fills this FAQ from the widget defaults. Edit each item in Elementor.'),
                array('question' => 'Can we replace these questions?', 'answer' => 'Yes. Open the widget and edit the repeater.'),
            ),
            'title_field' => '{{{ question }}}',
        ));
        $this->end_controls_section();`;
  }
  if (role === "articleCta" || role === "downloadCta") {
    const cta = role === "downloadCta" ? "Download Free Checklist" : "Schedule a Demo Now";
    const text =
      role === "downloadCta"
        ? "A practical checklist you can implement today."
        : "See how this section can help. Replace this line in Elementor.";
    return `${heading}
        $this->add_control('text', array('label' => 'Text', 'type' => \\Elementor\\Controls_Manager::TEXTAREA, 'default' => '${phpStr(text)}'));
        $this->add_control('cta_text', array('label' => 'Button', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => '${phpStr(cta)}'));
        $this->add_control('cta_link', array('label' => 'Link', 'type' => \\Elementor\\Controls_Manager::URL, 'default' => array('url' => '#')));
        $this->end_controls_section();`;
  }
  if (role === "header") {
    return `        $this->start_controls_section('content', array('label' => 'Content'));
        $this->add_control('logo_alt', array('label' => 'Brand', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => 'Site name'));
        $this->add_control('phone', array('label' => 'Phone', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => '(555) 010-0100'));
        $this->add_control('cta_text', array('label' => 'CTA', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => '${phpStr("Let's Get Started")}'));
        $this->end_controls_section();`;
  }
  if (role === "footer") {
    return `        $this->start_controls_section('content', array('label' => 'Content'));
        $this->add_control('logo_alt', array('label' => 'Brand', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => 'Site name'));
        $this->add_control('tagline', array('label' => 'Tagline', 'type' => \\Elementor\\Controls_Manager::TEXTAREA, 'default' => 'Generated footer — replace links in Elementor.'));
        $this->add_control('phone', array('label' => 'Phone', 'type' => \\Elementor\\Controls_Manager::TEXT, 'default' => '(555) 010-0100'));
        $this->end_controls_section();`;
  }
  return `${heading}
        $this->end_controls_section();`;
}

function headingHtml(tag = "h2"): string {
  return `        $before = isset($s['heading_before']) ? $s['heading_before'] : '';
        $hi = isset($s['heading_highlight']) ? $s['heading_highlight'] : '';
        $after = isset($s['heading_after']) ? $s['heading_after'] : '';
        echo '<${tag} class="pa-heading">' . esc_html($before);
        if ($hi) echo ' <span class="pa-highlight">' . esc_html($hi) . '</span>';
        echo ' ' . esc_html($after) . '</${tag}>';`;
}

function renderPhp(role: WidgetRole): string {
  if (role === "header") {
    return `        $brand = !empty($s['logo_alt']) ? $s['logo_alt'] : 'Site';
        echo '<div class="pa-section pa-header"><div class="pa-shell">';
        echo '<div class="pa-header-bar"><span class="pa-logo">' . esc_html($brand) . '</span>';
        echo '<nav class="pa-nav"><a href="#">Products</a><a href="#">Solutions</a><a href="#">Company</a><a href="#">Resources</a></nav>';
        echo '<a class="pa-btn pa-btn-gold" href="#">' . esc_html(!empty($s['cta_text']) ? $s['cta_text'] : 'Let\\'s Get Started') . '</a></div></div></div>';`;
  }
  if (role === "footer") {
    return `        $brand = !empty($s['logo_alt']) ? $s['logo_alt'] : 'Site';
        echo '<div class="pa-section pa-footer"><div class="pa-shell">';
        echo '<div class="pa-footer-main"><div><strong class="pa-logo">' . esc_html($brand) . '</strong>';
        echo '<p>' . esc_html(!empty($s['tagline']) ? $s['tagline'] : '') . '</p>';
        echo '<a class="pa-gold-phone" href="#">' . esc_html(!empty($s['phone']) ? $s['phone'] : '') . '</a></div>';
        echo '<div class="pa-footer-cols"><div><h3>Products</h3><a href="#">Overview</a></div><div><h3>Company</h3><a href="#">About</a></div><div><h3>Resources</h3><a href="#">Blog</a></div></div></div>';
        echo '<div class="pa-footer-bottom"><span>&copy; ' . esc_html($brand) . '</span><span>Privacy · Terms</span></div></div></div>';`;
  }
  if (role === "blogHero") {
    return `        $img = isset($s['image']['url']) ? $s['image']['url'] : '';
        echo '<div class="pa-section pa-hero"><div class="pa-shell pa-split">';
        echo '<div class="pa-copy">';
${headingHtml("h1")}
        echo '<p class="pa-text">' . esc_html(!empty($s['text']) ? $s['text'] : '') . '</p>';
        if (!empty($s['cta_text'])) echo '<a class="pa-btn pa-btn-gold" href="#">' . esc_html($s['cta_text']) . '</a>';
        echo '</div>';
        if ($img) echo '<div class="pa-media"><img src="' . esc_url($img) . '" alt="" /></div>';
        echo '</div></div>';`;
  }
  if (role === "takeaways") {
    return `        echo '<div class="pa-section"><div class="pa-shell">';
${headingHtml()}
        echo '<ul class="pa-takeaways">';
        $items = isset($s['items']) && is_array($s['items']) ? $s['items'] : array();
        foreach ($items as $item) {
            $text = isset($item['text']) ? $item['text'] : '';
            if ($text === '') continue;
            echo '<li><span class="pa-check" aria-hidden="true"></span><span>' . esc_html($text) . '</span></li>';
        }
        echo '</ul></div></div>';`;
  }
  if (role === "faq") {
    return `        echo '<div class="pa-section"><div class="pa-shell">';
${headingHtml()}
        echo '<div class="pa-faq">';
        $items = isset($s['items']) && is_array($s['items']) ? $s['items'] : array();
        $i = 0;
        foreach ($items as $item) {
            $q = isset($item['question']) ? $item['question'] : '';
            $a = isset($item['answer']) ? $item['answer'] : '';
            if ($q === '') continue;
            $open = $i === 0 ? ' open' : '';
            echo '<details class="pa-faq-item"' . $open . '><summary>' . esc_html($q) . '</summary><p>' . esc_html($a) . '</p></details>';
            $i++;
        }
        echo '</div></div></div>';`;
  }
  if (role === "articleCta") {
    return `        $url = isset($s['cta_link']['url']) ? $s['cta_link']['url'] : '#';
        echo '<div class="pa-section"><div class="pa-shell"><div class="pa-banner pa-banner-navy">';
${headingHtml()}
        echo '<p class="pa-text">' . esc_html(!empty($s['text']) ? $s['text'] : '') . '</p>';
        echo '<a class="pa-btn pa-btn-gold" href="' . esc_url($url) . '">' . esc_html(!empty($s['cta_text']) ? $s['cta_text'] : 'Learn more') . '</a>';
        echo '</div></div></div>';`;
  }
  if (role === "downloadCta") {
    return `        $url = isset($s['cta_link']['url']) ? $s['cta_link']['url'] : '#';
        echo '<div class="pa-section"><div class="pa-shell"><div class="pa-banner pa-banner-gold">';
${headingHtml()}
        echo '<p class="pa-text">' . esc_html(!empty($s['text']) ? $s['text'] : '') . '</p>';
        echo '<a class="pa-btn pa-btn-navy" href="' . esc_url($url) . '">' . esc_html(!empty($s['cta_text']) ? $s['cta_text'] : 'Download') . '</a>';
        echo '</div></div></div>';`;
  }
  if (role === "relatedPosts") {
    return `        echo '<div class="pa-section"><div class="pa-shell">';
${headingHtml()}
        echo '<div class="pa-cards">';
        foreach (array('Practice Management', 'Client Communications', 'Reminders', 'After hours') as $cat) {
            echo '<article class="pa-card"><div class="pa-card-media"></div><span class="pa-cat">' . esc_html($cat) . '</span><h3>Related article placeholder</h3><p class="pa-muted">Replace with real posts in Elementor or WordPress.</p></article>';
        }
        echo '</div></div></div>';`;
  }
  return `        echo '<div class="pa-section"><div class="pa-shell">';
${headingHtml()}
        echo '</div></div>';`;
}

const WIDGET_CSS = `.pa-section{--pa-blue:#115696;--pa-blue-2:#3972C5;--pa-gold:#FFD800;--pa-ink:#1C1C1C;box-sizing:border-box;width:100%;margin:0;padding:clamp(36px,5vw,72px) 0;color:var(--pa-ink);font-family:inherit}
.pa-section *,.pa-section *::before,.pa-section *::after{box-sizing:border-box}
.pa-shell{width:100%;max-width:1180px;margin:0 auto;padding:0 clamp(16px,3vw,24px)}
.pa-heading{margin:0 0 .45em;font-weight:800;line-height:1.12;letter-spacing:-.02em}
.pa-section h1.pa-heading{font-size:clamp(2rem,4.2vw,3.4rem)}
.pa-section h2.pa-heading{font-size:clamp(1.6rem,3vw,2.5rem);text-align:center}
.pa-highlight{color:var(--pa-blue-2)}
.pa-text{margin:0 0 1em;line-height:1.6;color:rgba(28,28,28,.78)}
.pa-muted{color:rgba(28,28,28,.55);font-size:.92rem}
.pa-split{display:flex;flex-wrap:wrap;gap:clamp(24px,4vw,48px);align-items:center}
.pa-copy,.pa-media{min-width:0;flex:1 1 280px}
.pa-media img{display:block;width:100%;border-radius:22px;object-fit:cover}
.pa-btn{display:inline-flex;align-items:center;justify-content:center;padding:13px 22px;border-radius:999px;font-weight:700;text-decoration:none;border:0}
.pa-btn-gold{background:linear-gradient(90deg,#FFD800,#FFE761);color:#000}
.pa-btn-navy{background:linear-gradient(90deg,#115696,#3972C5);color:#fff}
.pa-header{padding:18px 0}
.pa-header-bar{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;background:var(--pa-blue);color:#fff;border-radius:999px;padding:10px 16px 10px 18px}
.pa-logo{font-weight:800;color:#fff}
.pa-nav{display:flex;flex-wrap:wrap;gap:8px 16px;flex:1;justify-content:center}
.pa-nav a{color:#fff;text-decoration:none}
.pa-hero{background:#f7f9fb;background-image:linear-gradient(#e8eef4 1px,transparent 1px),linear-gradient(90deg,#e8eef4 1px,transparent 1px);background-size:28px 28px;padding-top:clamp(28px,4vw,48px);padding-bottom:clamp(28px,4vw,48px)}
.pa-hero .pa-heading{text-align:left}
.pa-takeaways{list-style:none;margin:24px auto 0;padding:0;max-width:720px;font-weight:700}
.pa-takeaways li{display:flex;gap:10px;align-items:flex-start;margin:12px 0}
.pa-check{width:22px;height:22px;border-radius:50%;background:#22c55e;flex:0 0 22px;position:relative}
.pa-check::after{content:"";position:absolute;left:7px;top:4px;width:6px;height:11px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
.pa-faq{display:flex;flex-direction:column;gap:12px;max-width:800px;margin:20px auto 0}
.pa-faq-item{background:#f4f6f9;border-radius:16px;padding:4px 8px}
.pa-faq-item[open]{background:linear-gradient(150deg,#0d3d66,#0a2c4d);color:#fff}
.pa-faq-item summary{cursor:pointer;font-weight:700;padding:16px 14px}
.pa-faq-item p{margin:0 14px 16px;color:inherit;opacity:.85}
.pa-banner{display:flex;flex-wrap:wrap;align-items:center;gap:18px 24px;border-radius:24px;padding:clamp(22px,3vw,32px) clamp(22px,4vw,40px)}
.pa-banner .pa-heading{text-align:left;margin:0;font-size:clamp(1.2rem,2vw,1.6rem);flex:1 1 240px}
.pa-banner-navy{background:linear-gradient(150deg,#1a67ac,#0d3d66);color:#fff}
.pa-banner-navy .pa-highlight{color:var(--pa-gold)}
.pa-banner-navy .pa-text{color:rgba(255,255,255,.85)}
.pa-banner-gold{background:linear-gradient(90deg,#FFD800,#FFE761);color:var(--pa-ink)}
.pa-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:24px}
.pa-card{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 26px rgba(17,86,150,.08);min-width:0}
.pa-card-media{aspect-ratio:16/10;background:#eef6ff}
.pa-cat{display:inline-block;margin:12px 16px 0;color:var(--pa-blue);font-weight:700;font-size:.8rem}
.pa-card h3{margin:8px 16px 4px;font-size:1.05rem}
.pa-card .pa-muted{margin:0 16px 16px}
.pa-footer{background:linear-gradient(180deg,#115696,#3972C5);color:#fff;padding-top:56px;padding-bottom:28px}
.pa-footer .pa-heading,.pa-footer a,.pa-footer p{color:#fff}
.pa-gold-phone{color:var(--pa-gold);font-weight:800;font-size:1.3rem;text-decoration:none}
.pa-footer-main{display:flex;flex-wrap:wrap;gap:28px}
.pa-footer-cols{display:flex;flex-wrap:wrap;gap:22px;flex:2 1 420px}
.pa-footer-cols a{display:block;padding:4px 0;text-decoration:none}
.pa-footer-bottom{display:flex;justify-content:space-between;gap:12px;border-top:1px solid rgba(255,255,255,.25);padding-top:14px;margin-top:18px}
@media (max-width:900px){
  .pa-cards{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pa-nav{display:none}
  .pa-header-bar{border-radius:22px}
}
@media (max-width:640px){
  .pa-cards{grid-template-columns:1fr}
}
`;
