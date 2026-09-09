/**
 * TREATS BY MILZ — SITE CONFIG
 * ------------------------------------------------------------------
 * Edit this file to change course details across the whole site.
 * The `modules` array drives the "WHAT YOU'LL LEARN" card grid
 * (section 04) — edit a module here and it updates on the site.
 * Each module's `long` field isn't currently used on the page (it
 * was written for the course-breakdown accordion, which was removed
 * as duplicate content) — kept here in case that section comes back.
 *
 * Everything here is placeholder copy — swap in the real course
 * details, price and links before launch.
 * ------------------------------------------------------------------
 */

window.SITE_CONFIG = {
  brand: {
    name: "Treats by Milz",
    tagline: "Learn. Bake. Create.",
  },

  // TODO: set the real one-time price before launch
  course: {
    name: "The Digital Baking Course",
    currency: "R",
    price: 160,
    priceNote: "Once-off payment. Instant access after payment.",
    zipFileName: "treats-by-milz-course.zip",
  },

  // TODO: replace with real course modules from Milz
  modules: [
    {
      number: "01",
      title: "The Basics",
      short: "Equipment, ingredients and the fundamentals before you bake a single thing.",
      long:
        "We start in the kitchen, not the oven. What to buy, what you already own that'll do the job, and the handful of ingredients worth spending a bit more on. No fancy equipment required.",
    },
    {
      number: "02",
      title: "Preparation",
      short: "Measuring, mixing methods and getting your kitchen bake-ready.",
      long:
        "Precision matters more than instinct at this stage. You'll learn how Milz measures, preps and sets up before the mixer even turns on — the part most people skip and regret.",
    },
    {
      number: "03",
      title: "The Bake",
      short: "Batter, oven timing and turning ingredients into a proper sponge.",
      long:
        "The technical heart of the course. Batter consistency, oven behaviour, doneness cues — the stuff that separates a dry, sunken cake from one that holds its shape and its crumb.",
    },
    {
      number: "04",
      title: "Decorating",
      short: "Icing, piping and the hands-on techniques that give a cake its finish.",
      long:
        "Crumb coats, smooth finishes, piping control. You'll watch it done slowly, close-up, at a pace you can actually follow — then go do it yourself.",
    },
    {
      number: "05",
      title: "Finishing",
      short: "Detailing, smoothing and the small touches that separate good from great.",
      long:
        "The last 10% that makes a cake look intentional instead of homemade-by-accident. Edges, texture, the tiny corrections that are easy once you've seen them once.",
    },
    {
      number: "06",
      title: "Presentation",
      short: "Plating, packaging and sending a cake out looking like it's from a studio.",
      long:
        "How it leaves the kitchen matters. Boxing, transport, that last look before it goes out the door — presented the way Treats by Milz presents everything.",
    },
  ],

  // TODO: replace with real socials — email is real (from Terms doc), IG/TikTok still placeholders
  social: {
    instagram: "https://instagram.com/treatsbymilz",
    tiktok: "https://tiktok.com/@treatsbymilz",
    email: "milisatyhefu@gmail.com",
  },

  links: {
    terms: "/terms.html",
  },
};
