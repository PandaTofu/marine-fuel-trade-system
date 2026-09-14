import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Brand, Language } from "./components";
export default function Public() {
  const { t } = useTranslation();
  return (
    <div className="public">
      <div className="utility">
        <div className="container">
          VESSEL TRADE MANAGEMENT <span>{t("tagline")}</span>
        </div>
      </div>
      <header className="public-header container">
        <Brand />
        <nav>
          {["about", "services", "network", "contact"].map((k) => (
            <a key={k} href={"#" + k}>
              {t(k)}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <Language />
          <Link className="nav-portal" to="/app">
            {t("login")} ↗
          </Link>
        </div>
      </header>
      <main>
        <section className="hero">
          <img src="/assets/marine-hero.png" alt="" />
          <div className="hero-overlay" />
          <div className="container hero-content">
            <div className="eyebrow">ENERGY FOR EVERY VOYAGE</div>
            <h1>{t("hero")}</h1>
            <p>{t("heroCopy")}</p>
            <a className="orange-button" href="#services">
              {t("explore")} ↗
            </a>
          </div>
          <div className="hero-bottom container">
            <span>MARINE FUELS & SUPPLY SOLUTIONS</span>
            <a href="#about">↓</a>
          </div>
        </section>
        <div className="service-strip container">
          {["fuel", "lube", "portService"].map((k, i) => (
            <a key={k} href="#services">
              <span>0{i + 1}</span>
              {t(k)}
              <b>↗</b>
            </a>
          ))}
        </div>
        <section id="about" className="container section about-grid">
          <div>
            <div className="eyebrow">ABOUT US</div>
            <h2>{t("aboutTitle")}</h2>
          </div>
          <p>{t("aboutCopy")}</p>
        </section>
        <section id="services" className="pale">
          <div className="container section">
            <div className="eyebrow">OUR SOLUTIONS</div>
            <h2>{t("services")}</h2>
            <div className="product-grid">
              {[
                ["fuel", "fuelCopy", "◈"],
                ["lube", "lubeCopy", "▥"],
                ["portService", "portCopy", "⚓"],
              ].map(([title, copy, icon], i) => (
                <article key={title}>
                  <div className={"product-art art-" + i}>
                    <span>0{i + 1}</span>
                    <b>{icon}</b>
                  </div>
                  <div className="product-body">
                    <h3>{t(title)}</h3>
                    <p>{t(copy)}</p>
                    <a href="#contact">{t("contact")} ↗</a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="network" className="network">
          <div className="container section about-grid">
            <div>
              <div className="eyebrow">CONNECTED TO YOUR VOYAGE</div>
              <h2>{t("networkTitle")}</h2>
              <p>{t("networkCopy")}</p>
            </div>
            <div className="port-network">
              {["shanghai", "ningbo", "zhoushan"].map((k, i) => (
                <div key={k}>
                  <span>0{i + 1}</span>
                  <h3>{t(k)}</h3>
                  <span>↗</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="contact" className="container section about-grid">
          <div>
            <div className="eyebrow">LET’S TALK</div>
            <h2>{t("contactTitle")}</h2>
            <p>{t("contactCopy")}</p>
          </div>
          <div className="contact-card">
            <small>{t("sampleContact")}</small>
            <p>business@example.com</p>
            <span>{t("sample")}</span>
          </div>
        </section>
      </main>
      <footer>
        <div className="container">
          <Brand />
          <p>© 2026 VESSEL TRADE MANAGEMENT</p>
          <small>{t("sample")}</small>
        </div>
      </footer>
    </div>
  );
}
