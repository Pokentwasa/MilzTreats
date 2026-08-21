(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------------
     Render modules from site-config.js into:
       - #learnCards   (section 04, short copy)
       - #journeyAccordion (section 05, long copy, native <details>)
     Edit js/site-config.js to change module content — it updates both.
     --------------------------------------------------------------------- */
  function renderModules() {
    var modules = cfg.modules || [];
    var cardsHost = document.getElementById("learnCards");
    var accordionHost = document.getElementById("journeyAccordion");
    if (!cardsHost || !accordionHost) return;

    var cardsHtml = "";
    var accordionHtml = "";

    modules.forEach(function (m, i) {
      cardsHtml +=
        '<article class="learn-card" data-reveal style="--d:' + (i % 3) + '">' +
          '<span class="learn-card__number">' + m.number + "</span>" +
          '<h3 class="learn-card__title">' + m.title + "</h3>" +
          '<p class="learn-card__desc">' + m.short + "</p>" +
        "</article>";

      accordionHtml +=
        '<details class="journey-item"' + (i === 0 ? " open" : "") + '>' +
          '<summary class="journey-item__summary">' +
            '<span class="journey-item__num">' + m.number + "</span>" +
            '<span class="journey-item__title">' + m.title + "</span>" +
            '<span class="journey-item__plus" aria-hidden="true"></span>' +
          "</summary>" +
          '<div class="journey-item__body"><p>' + m.long + "</p></div>" +
        "</details>";
    });

    cardsHost.innerHTML = cardsHtml;
    accordionHost.innerHTML = accordionHtml;
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
     Magnetic CTA buttons (desktop only, subtle pull toward cursor)
     --------------------------------------------------------------------- */
  function initMagnetic() {
    if (reduceMotion || window.matchMedia("(pointer: coarse)").matches) return;
    var buttons = document.querySelectorAll("[data-magnetic]");

    buttons.forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var rect = btn.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width / 2;
        var y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = "translate(" + x * 0.18 + "px, " + y * 0.35 + "px)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transform = "translate(0,0)";
      });
    });
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
    initMagnetic();
    initMobileCta();
    initScrollIndicator();
  });
})();
