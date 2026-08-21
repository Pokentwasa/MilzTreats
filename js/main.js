(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------------
     One simple line icon per module, keyed by module number. Swap these
     for whatever fits the real course content.
     --------------------------------------------------------------------- */
  var MODULE_ICONS = {
    "01": '<path d="M12 4c-1 1-1 3 0 4M9 6c-.6.7-.6 2 0 2.6M15 6c.6.7.6 2 0 2.6M12 8v9M8 21c1-4 2-6 4-6s3 2 4 6" stroke-linecap="round" stroke-linejoin="round"/>',
    "02": '<path d="M7 3v6a5 5 0 0 0 10 0V3M6 3h12" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 21h8M12 17v4" stroke-linecap="round"/>',
    "03": '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 13h16" stroke-linecap="round"/>',
    "04": '<path d="M12 3c3 3 3 6 0 8-3-2-3-5 0-8z"/><path d="M12 11v3M9 14h6l1.5 7h-9L9 14z" stroke-linecap="round" stroke-linejoin="round"/>',
    "05": '<path d="M6 4l6 6-8 8 2 2 8-8 6 6" stroke-linecap="round" stroke-linejoin="round"/>',
    "06": '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 9l8-5 8 5M12 9v11" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  /* ---------------------------------------------------------------------
     Render modules from site-config.js into #learnCards (short copy).
     Edit js/site-config.js to change module content.
     --------------------------------------------------------------------- */
  function renderModules() {
    var modules = cfg.modules || [];
    var cardsHost = document.getElementById("learnCards");
    if (!cardsHost) return;

    var cardsHtml = "";

    modules.forEach(function (m, i) {
      var icon = MODULE_ICONS[m.number] || MODULE_ICONS["01"];
      cardsHtml +=
        '<article class="learn-card" data-reveal style="--d:' + (i % 3) + '">' +
          '<span class="icon-chip"><svg viewBox="0 0 24 24" fill="none">' + icon + "</svg></span>" +
          '<h3 class="learn-card__title">' + m.number + " · " + m.title + "</h3>" +
          '<p class="learn-card__desc">' + m.short + "</p>" +
        "</article>";
    });

    cardsHost.innerHTML = cardsHtml;
  }

  /* ---------------------------------------------------------------------
     Populate price, zip filename references, and social links from config
     --------------------------------------------------------------------- */
  function renderConfigValues() {
    var course = cfg.course || {};
    document.querySelectorAll(".js-price-currency").forEach(function (el) {
      el.textContent = course.currency || "R";
    });
    document.querySelectorAll(".js-price-amount").forEach(function (el) {
      el.textContent = course.price != null ? course.price : "—";
    });

    var social = cfg.social || {};
    var ig = document.getElementById("footerInstagram");
    var tt = document.getElementById("footerTiktok");
    var em = document.getElementById("footerEmail");
    if (ig && social.instagram) ig.href = social.instagram;
    if (tt && social.tiktok) tt.href = social.tiktok;
    if (em && social.email) em.href = "mailto:" + social.email;

    var year = document.getElementById("footerYear");
    if (year) year.textContent = new Date().getFullYear();
  }

  /* ---------------------------------------------------------------------
     Sticky nav: hide on scroll down, show on scroll up
     --------------------------------------------------------------------- */
  function initNavScroll() {
    var nav = document.getElementById("siteNav");
    if (!nav) return;
    var lastY = window.scrollY;
    var ticking = false;

    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y > 140 && y > lastY) {
          nav.classList.add("nav--hidden");
        } else {
          nav.classList.remove("nav--hidden");
        }
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------------------------------------------------------------------
     Mobile menu toggle
     --------------------------------------------------------------------- */
  function initMobileMenu() {
    var burger = document.getElementById("burgerBtn");
    var menu = document.getElementById("mobileMenu");
    if (!burger || !menu) return;

    burger.addEventListener("click", function () {
      var open = burger.getAttribute("aria-expanded") === "true";
      burger.setAttribute("aria-expanded", String(!open));
      burger.setAttribute("aria-label", open ? "Open menu" : "Close menu");
      menu.classList.toggle("is-open", !open);
    });

    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        burger.setAttribute("aria-expanded", "false");
        burger.setAttribute("aria-label", "Open menu");
        menu.classList.remove("is-open");
      });
    });
  }

  /* ---------------------------------------------------------------------
     Scroll-triggered reveal
     --------------------------------------------------------------------- */
  function initReveal() {
    var items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );

    items.forEach(function (el) { observer.observe(el); });
  }

  /* ---------------------------------------------------------------------
     Sticky mobile "Get Started" CTA — appears after hero, hides near pricing
     --------------------------------------------------------------------- */
  function initMobileCta() {
    var cta = document.getElementById("mobileCta");
    var hero = document.getElementById("top");
    var pricing = document.getElementById("pricing");
    if (!cta || !hero || !pricing || !("IntersectionObserver" in window)) return;

    var pastHero = false;
    var inPricing = false;

    var heroObs = new IntersectionObserver(function (entries) {
      pastHero = !entries[0].isIntersecting;
      update();
    }, { threshold: 0 });
    heroObs.observe(hero);

    var pricingObs = new IntersectionObserver(function (entries) {
      inPricing = entries[0].isIntersecting;
      update();
    }, { threshold: 0.2 });
    pricingObs.observe(pricing);

    function update() {
      cta.classList.toggle("is-visible", pastHero && !inPricing);
    }
  }

  /* ---------------------------------------------------------------------
     Hero scroll indicator — jumps to the course intro section
     --------------------------------------------------------------------- */
  function initScrollIndicator() {
    var btn = document.getElementById("scrollIndicator");
    var target = document.getElementById("course");
    if (!btn || !target) return;
    btn.addEventListener("click", function () {
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  /* ---------------------------------------------------------------------
     Init
     --------------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    renderModules();
    renderConfigValues();
    initNavScroll();
    initMobileMenu();
    initReveal();
    initMobileCta();
    initScrollIndicator();
  });
})();
