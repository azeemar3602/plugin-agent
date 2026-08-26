import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAVY = "#0A2148";
const NAVY_DEEP = "#071A38";
const YELLOW = "#F5C400";
const ACCENT = "#3AA0D8";
const INK = "#121417";
const MUTED = "#5C6570";
const LIGHT = "#F3F5F7";
const WHITE = "#FFFFFF";
const FAQ_BLUE = "#2E6BDB";

const IMG_HERO =
  "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1400&q=80";
const IMG_AVATAR =
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&h=120&q=80";
const RELATED = [
  {
    img: "https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=800&q=80",
    cat: "Practice Management",
    title: "7 Ways To Improve Client Retention At Your Vet Clinic",
    meta: "July 14, 2026 • 9 Min Read",
  },
  {
    img: "https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=800&q=80",
    cat: "Client Communications",
    title: "What Pet Owners Actually Want From Clinic Reminders",
    meta: "June 22, 2026 • 6 Min Read",
  },
  {
    img: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=800&q=80",
    cat: "Practice Management",
    title: "How After-Hours Call Routing Protects Your Front Desk",
    meta: "May 30, 2026 • 8 Min Read",
  },
  {
    img: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=800&q=80",
    cat: "Client Communications",
    title: "A Simple Script For Confirming Tomorrow's Appointments",
    meta: "April 18, 2026 • 5 Min Read",
  },
];

let n = 0;
function eid() {
  n += 1;
  return `ax${n.toString(16).padStart(6, "0")}`;
}

function widget(type, settings) {
  return { id: eid(), elType: "widget", widgetType: type, settings, elements: [] };
}

function column(size, children, extra = {}) {
  return {
    id: eid(),
    elType: "column",
    settings: {
      _column_size: size,
      _inline_size: null,
      ...extra,
    },
    elements: children,
  };
}

function section(settings, columns) {
  return {
    id: eid(),
    elType: "section",
    isInner: false,
    settings: {
      layout: "boxed",
      gap: "no",
      content_width: { unit: "%", size: 100 },
      background_background: "classic",
      ...settings,
    },
    elements: columns,
  };
}

function innerSection(settings, columns) {
  return {
    id: eid(),
    elType: "section",
    isInner: true,
    settings: {
      layout: "boxed",
      gap: "extended",
      background_background: "classic",
      ...settings,
    },
    elements: columns,
  };
}

function pad(top, right, bottom, left) {
  return { unit: "px", top: String(top), right: String(right), bottom: String(bottom), left: String(left), isLinked: false };
}

function radius(value) {
  const v = String(value);
  return { unit: "px", top: v, right: v, bottom: v, left: v, isLinked: true };
}

function html(markup) {
  return widget("html", { html: markup });
}

function text(markup, color = INK, align = "left") {
  return widget("text-editor", { editor: markup, align, text_color: color });
}

function button(label, opts = {}) {
  return widget("button", {
    text: label,
    align: opts.align || "left",
    link: { url: opts.url || "#", is_external: "", nofollow: "" },
    background_color: opts.bg || YELLOW,
    button_text_color: opts.color || INK,
    hover_color: WHITE,
    hover_background_color: NAVY,
    size: opts.size || "md",
    border_radius: radius(8),
    button_padding: pad(14, 22, 14, 22),
  });
}

function image(url, extra = {}) {
  return widget("image", {
    image: { url, id: "", alt: extra.alt || "", source: "url" },
    image_size: "full",
    align: extra.align || "center",
    border_radius: extra.radius ? radius(extra.radius) : undefined,
    ...extra.settings,
  });
}

function heading(title, size, color, align = "left") {
  return widget("heading", {
    title,
    header_size: size,
    align,
    title_color: color,
  });
}

function iconFa(value, color, size = 36) {
  return widget("icon", {
    selected_icon: { value, library: "fa-solid" },
    primary_color: color,
    size: { unit: "px", size },
    align: "center",
  });
}

function iconList(items, color = INK) {
  return widget("icon-list", {
    icon_list: items.map((text) => ({
      _id: eid(),
      text,
      selected_icon: { value: "fas fa-check", library: "fa-solid" },
    })),
    icon_color: ACCENT,
    text_color: color,
    space_between: { unit: "px", size: 12 },
  });
}

const content = [
  section(
    {
      layout: "full_width",
      background_color: WHITE,
      padding: pad(10, 40, 10, 40),
    },
    [
      column(50, [
        html(
          `<p style="margin:0;font-size:13px;color:${MUTED};display:flex;align-items:center;gap:8px">🕒 Mon – Fri: 8:30 – 6:30</p>`,
        ),
      ]),
      column(50, [
        html(
          `<p style="margin:0;font-size:13px;color:${INK};text-align:right">Call Us: <a href="tel:18559829466" style="color:${INK};font-weight:700;text-decoration:none">(855) 982-9466</a></p>`,
        ),
      ]),
    ],
  ),

  section(
    {
      background_color: WHITE,
      padding: pad(16, 40, 16, 40),
    },
    [
      column(22, [
        html(
          `<div style="display:flex;align-items:center;gap:10px">
            <div style="width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,${ACCENT} 45%,${YELLOW} 45%);"></div>
            <div style="line-height:1.1">
              <div style="font-weight:800;letter-spacing:.04em;color:${NAVY};font-size:13px">AXION</div>
              <div style="font-size:10px;letter-spacing:.18em;color:${MUTED}">COMMUNICATIONS</div>
            </div>
          </div>`,
        ),
      ]),
      column(48, [
        html(
          `<nav style="display:flex;justify-content:center;gap:22px;font-size:14px;font-weight:600;color:${INK};padding-top:8px">
            <a href="#" style="color:${INK};text-decoration:none">Products ▾</a>
            <a href="#" style="color:${INK};text-decoration:none">Solutions ▾</a>
            <a href="#" style="color:${INK};text-decoration:none">Company ▾</a>
            <a href="#" style="color:${INK};text-decoration:none">Resources ▾</a>
            <a href="#" style="color:${INK};text-decoration:none">Our Network ▾</a>
          </nav>`,
        ),
      ]),
      column(30, [
        innerSection({ padding: pad(0, 0, 0, 0), gap: "narrow" }, [
          column(70, [button("Let's Get Started →", { align: "right" })]),
          column(30, [
            html(
              `<p style="margin:10px 0 0;text-align:right;font-weight:700"><a href="#" style="color:${NAVY};text-decoration:none">Login</a></p>`,
            ),
          ]),
        ]),
      ]),
    ],
  ),

  section({ background_color: WHITE, padding: pad(36, 80, 8, 80) }, [
    column(100, [
      html(
        `<h1 style="margin:0;font-size:48px;line-height:1.15;font-weight:800;color:${INK};letter-spacing:-.02em">How Can Vets Reduce <span style="color:${ACCENT}">No-Shows</span> At Their Clinic Effectively?</h1>`,
      ),
      html(
        `<div style="display:flex;align-items:center;gap:10px;margin-top:18px">
          <img src="${IMG_AVATAR}" alt="Author" width="36" height="36" style="border-radius:50%;object-fit:cover" />
          <span style="font-weight:700;color:${INK}">T</span>
          <span style="color:${MUTED}">May 12, 2026</span>
        </div>`,
      ),
    ]),
  ]),

  section({ background_color: WHITE, padding: pad(28, 80, 24, 80) }, [
    column(
      42,
      [
        html(
          `<h3 style="margin:0 0 16px;font-size:28px;font-weight:800;color:${INK}">Key <span style="color:${ACCENT}">Takeaways</span></h3>`,
        ),
        iconList([
          "Two-way SMS reminders recover more appointments than voicemail.",
          "Confirmations the afternoon before cut same-day no-shows hardest.",
          "After-hours routing keeps emergency calls off the front desk.",
          "A three-doctor clinic can recapture a five-figure year from the 9:40 AM gap.",
        ]),
      ],
      {
        background_background: "classic",
        background_color: LIGHT,
        border_radius: radius(16),
        padding: pad(28, 28, 28, 28),
      },
    ),
    column(58, [image(IMG_HERO, { alt: "Veterinarian working at a clinic desk", radius: 16 })]),
  ]),

  section({ background_color: WHITE, padding: pad(20, 80, 12, 80) }, [
    column(100, [
      html(
        `<h2 style="margin:0 0 16px;font-size:34px;line-height:1.2;font-weight:800;color:${INK}">The 9:40 AM Gap That Costs Your Clinic $180</h2>`,
      ),
      text(
        `<p>The slot is on the board. The chart is pulled. Then 9:40 AM comes and the client is not in the lobby. For most general practices that empty hour is not a free coffee break — it is a lost exam, a delayed surgery day, and a technician team that still has to be paid.</p>
         <p>At a typical outpatient fee, a single missed appointment is about $180 in production. Multiply that across a week of “we tried calling yesterday” and the no-show rate stops looking like a client problem and starts looking like a communications system problem.</p>`,
      ),
    ]),
  ]),

  section({ background_color: WHITE, padding: pad(12, 80, 12, 80) }, [
    column(100, [
      html(
        `<h2 style="margin:0 0 16px;font-size:34px;line-height:1.2;font-weight:800;color:${INK}">Why Vet <span style="color:${ACCENT}">No-Shows</span> Aren't Like Other No-Shows</h2>`,
      ),
      text(
        `<p>Pet owners are not skipping a haircut. They are juggling school drop-off, a nervous animal, and a clinic that may only pick up between 8:30 and noon. A one-way reminder that dumps into voicemail does not give them a way to reschedule, so they simply do not come.</p>
         <p>Veterinary no-shows also cluster around first-thing and last-thing slots — the same windows where your doctors are most productive. That is why a generic “appointment reminder tool” underperforms in clinics: it was built for restaurants, not for patients who cannot speak for themselves.</p>`,
      ),
    ]),
  ]),

  section({ background_color: WHITE, padding: pad(12, 80, 8, 80) }, [
    column(100, [
      html(
        `<h2 style="margin:0 0 8px;font-size:34px;line-height:1.2;font-weight:800;color:${INK}">Three Communication Fixes That Actually Move the <span style="color:${ACCENT}">No-Show Rate</span></h2>`,
      ),
    ]),
  ]),

  ...[
    {
      n: "1",
      title: "Two-Way SMS Reminders, Not Broadcast Blasts",
      body: "Send the reminder on the channel owners already answer. Let them reply YES, NEED TO MOVE, or DROP-OFF so the slot is either locked or released while you can still fill it.",
      bullets: [
        "First ping 48 hours out, second ping the afternoon before.",
        "Include the pet name, doctor, and a one-tap confirm.",
        "Route “I need to reschedule” to a live inbox, not a dead-end keyword.",
      ],
    },
    {
      n: "2",
      title: "Auto-Attendant Routing That Protects The Front Desk",
      body: "Missed inbound calls are tomorrow’s no-shows. If a client cannot reach you to confirm, they assume the clinic will call them back — and then they stop trying.",
      bullets: [
        "Split new clients, pharmacy, and doctor lines at the greeting.",
        "Overflow to a trained after-hours path instead of voicemail.",
        "Capture the pet’s name before the hold music starts.",
      ],
    },
    {
      n: "3",
      title: "Outbound Confirmation Calls For High-Value Visits",
      body: "Surgery, dentistry, and new-patient exams deserve a live voice, not only a text. A short confirmation call the day before recovers the appointments that SMS cannot.",
      bullets: [
        "Priority queue: anesthesia, euthanasia consults, first visits.",
        "Leave a callback number that actually rings a person.",
        "Log the outcome on the appointment so the floor knows who is coming.",
      ],
    },
  ].map((block) =>
    section({ background_color: WHITE, padding: pad(8, 80, 8, 80) }, [
      column(100, [
        html(
          `<h3 style="margin:0 0 10px;font-size:22px;font-weight:800;color:${INK}">${block.n}. ${block.title}</h3>`,
        ),
        text(`<p>${block.body}</p>`),
        iconList(block.bullets),
      ]),
    ]),
  ),

  section(
    {
      layout: "full_width",
      background_color: NAVY,
      padding: pad(28, 48, 28, 48),
      border_radius: radius(0),
    },
    [
      column(12, [iconFa("fas fa-bell", YELLOW, 42)]),
      column(58, [
        html(
          `<p style="margin:8px 0 0;font-size:20px;line-height:1.45;font-weight:700;color:${WHITE}">Want fewer no-shows and a fuller schedule? See how automated reminders and online booking can help your clinic.</p>`,
        ),
      ]),
      column(30, [button("Schedule A Demo Now →", { align: "right" })]),
    ],
  ),

  section({ background_color: WHITE, padding: pad(36, 80, 16, 80) }, [
    column(100, [
      html(
        `<h2 style="margin:0 0 16px;font-size:34px;line-height:1.2;font-weight:800;color:${INK}">A Worked Example: <span style="color:${ACCENT}">The Three-Doctor Practice</span></h2>`,
      ),
      text(
        `<p>A three-doctor mixed-animal clinic in the suburbs was running a 12% no-show rate on outpatient exams. They were already sending email reminders. Clients said they “never saw them.” After moving confirmations to two-way SMS and adding a live overflow path after 6:30, same-week no-shows dropped to 5% in 45 days.</p>
         <p>The recovered hours paid for the communications stack in the first month. More important: technicians stopped rebuilding the day around empty slots, and the 9:40 AM gap mostly disappeared from the board.</p>`,
      ),
    ]),
  ]),

  section({ background_color: WHITE, padding: pad(24, 80, 8, 80) }, [
    column(100, [
      html(
        `<h2 style="margin:0 0 8px;font-size:34px;line-height:1.2;font-weight:800;color:${INK}">Frequently Asked <span style="color:${ACCENT}">Questions</span></h2>`,
      ),
    ]),
  ]),

  section({ background_color: WHITE, padding: pad(8, 80, 24, 80) }, [
    column(100, [
      widget("accordion", {
        tabs: [
          {
            _id: eid(),
            tab_title: "How Can Axion Help Reduce Missed Appointments At Our Veterinary Clinic?",
            tab_content:
              "<p>Axion puts two-way reminders, caller routing, and after-hours coverage on one stack built for clinics. Confirmations go out as SMS clients actually answer. Unconfirmed visits escalate to a live call. Emergency and pharmacy traffic is split off the front desk so appointment lines stay clear.</p>",
          },
          {
            _id: eid(),
            tab_title: "Can We Keep Our Existing Phone Number?",
            tab_content:
              "<p>Yes. Your published clinic number stays the same. Calls are pointed at Axion’s routing layer so clients never have to learn a new digit string, and your existing marketing, Google listing, and printed materials keep working.</p>",
          },
          {
            _id: eid(),
            tab_title: "Does Axion Support After-Hours Calls And Emergency Routing?",
            tab_content:
              "<p>After 6:30, callers can be offered emergency instructions, a doctor-on-call path, or a next-morning callback — whatever your medical director sets. You are not forced into a generic answering service script.</p>",
          },
          {
            _id: eid(),
            tab_title: "Do Pet Owners Need To Download An App?",
            tab_content:
              "<p>No. Reminders and replies run over standard text messaging. Online booking is a browser link you can drop into SMS, email, or your website.</p>",
          },
          {
            _id: eid(),
            tab_title: "How Fast Can A Clinic Go Live?",
            tab_content:
              "<p>Most practices are confirming on SMS within a couple of weeks: number port or call-path setup, reminder templates with pet names, and a short rehearsal with the front desk.</p>",
          },
          {
            _id: eid(),
            tab_title: "Will This Work With The Practice-Management Software We Already Use?",
            tab_content:
              "<p>Axion is built to sit beside the PMS you already run. Appointment data feeds reminders; confirmation outcomes can be written back so the floor sees who is coming without a second login.</p>",
          },
        ],
        border_color: "#D9DEE6",
        title_background: LIGHT,
        title_color: FAQ_BLUE,
        tab_active_color: NAVY,
        content_background_color: NAVY,
        content_text_color: WHITE,
        icon_align: "right",
        selected_icon: { value: "fas fa-chevron-down", library: "fa-solid" },
        selected_active_icon: { value: "fas fa-chevron-up", library: "fa-solid" },
      }),
    ]),
  ]),

  section(
    {
      layout: "full_width",
      background_color: YELLOW,
      padding: pad(28, 48, 28, 48),
    },
    [
      column(12, [iconFa("fas fa-clipboard-list", NAVY, 42)]),
      column(58, [
        html(
          `<p style="margin:4px 0 0;font-size:22px;font-weight:800;color:${INK}">10 Ways to Reduce No-Shows at Your Clinic</p>
           <p style="margin:6px 0 0;font-size:16px;color:${INK}">A practical checklist you can implement today.</p>`,
        ),
      ]),
      column(30, [
        button("Download Free Checklist →", {
          align: "right",
          bg: NAVY,
          color: WHITE,
        }),
      ]),
    ],
  ),

  section({ background_color: WHITE, padding: pad(40, 64, 12, 64) }, [
    column(100, [heading("Related posts", "h3", NAVY, "left")]),
  ]),

  section({ background_color: WHITE, padding: pad(8, 64, 48, 64), gap: "extended" }, [
    ...RELATED.map((post) =>
      column(25, [
        image(post.img, { alt: post.title, radius: 14 }),
        html(
          `<p style="margin:12px 0 6px;font-size:12px;font-weight:700;color:${ACCENT};text-transform:capitalize">${post.cat}</p>
           <p style="margin:0 0 10px;font-size:16px;line-height:1.35;font-weight:800;color:${INK}">${post.title}</p>
           <p style="margin:0;font-size:12px;color:${MUTED}">${post.meta}</p>`,
        ),
      ]),
    ),
  ]),

  section(
    {
      layout: "full_width",
      background_color: NAVY_DEEP,
      padding: pad(48, 64, 28, 64),
    },
    [
      column(32, [
        html(
          `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <div style="width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,${ACCENT} 45%,${YELLOW} 45%);"></div>
            <div style="font-weight:800;letter-spacing:.08em;color:${WHITE}">AXION</div>
          </div>
          <p style="color:#c9d3e0;font-size:14px;line-height:1.6;margin:0 0 18px">Communication systems for veterinary clinics — phones, reminders, and after-hours coverage that keep the appointment book full.</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:${YELLOW}">(855) 982-9466</p>`,
        ),
      ]),
      ...["Products", "Solutions", "Company", "Resources"].map((label) =>
        column(17, [
          heading(label, "h5", WHITE, "left"),
          html(
            `<p style="color:#c9d3e0;font-size:14px;line-height:1.9;margin:0">
              <a href="#" style="color:#c9d3e0;text-decoration:none">Overview</a><br/>
              <a href="#" style="color:#c9d3e0;text-decoration:none">For clinics</a><br/>
              <a href="#" style="color:#c9d3e0;text-decoration:none">Support</a>
            </p>`,
          ),
        ]),
      ),
    ],
  ),

  section(
    {
      layout: "full_width",
      background_color: NAVY_DEEP,
      padding: pad(16, 64, 20, 64),
    },
    [
      column(60, [
        html(
          `<p style="margin:0;font-size:12px;color:#9aa7b8">© 2026 Axion Communications. All rights reserved.</p>`,
        ),
      ]),
      column(40, [
        html(
          `<p style="margin:0;font-size:12px;color:#9aa7b8;text-align:right">
            <a href="#" style="color:#9aa7b8;text-decoration:none">Privacy</a> ·
            <a href="#" style="color:#9aa7b8;text-decoration:none">Terms</a> ·
            <a href="#" style="color:#9aa7b8;text-decoration:none">Security</a>
          </p>`,
        ),
      ]),
    ],
  ),
];

const document = {
  version: "0.4",
  title: "How Can Vets Reduce No-Shows At Their Clinic Effectively?",
  type: "page",
  page_settings: {
    background_background: "classic",
    background_color: WHITE,
    hide_title: "yes",
  },
  content,
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "templates");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "axion-vets-reduce-no-shows.json");
writeFileSync(outFile, JSON.stringify(document, null, 2));
console.log("Wrote", outFile, "sections", content.length);
