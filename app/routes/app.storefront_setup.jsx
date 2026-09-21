/* global process */
import { useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { listBundleDiscounts } from "../services/bundle-discount.server";
import { listVolumeDiscounts } from "../services/volume-discount.server";

const SUPPORT_EMAIL = "vikasprasad2903@gmail.com";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const [themesResult, bundleResult, quantityResult] = await Promise.allSettled([
    admin.graphql(`#graphql
      query StorefrontThemes {
        themes(first: 50) { nodes { id name role } }
      }`),
    listBundleDiscounts(admin),
    listVolumeDiscounts(admin),
  ]);

  const themeResponse = themesResult.status === "fulfilled"
    ? await themesResult.value.json()
    : null;
  const themes = (themeResponse?.data?.themes?.nodes || []).map((theme) => ({
    ...theme,
    numericId: theme.id.split("/").pop(),
  }));
  const bundleOffers = bundleResult.status === "fulfilled" ? bundleResult.value.discounts : [];
  const quantityOffers = quantityResult.status === "fulfilled" ? quantityResult.value.discounts : [];

  return {
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    themes,
    bundleOffers,
    quantityOffers,
    loadError: [
      ...(themesResult.status === "rejected" ? ["Themes could not be loaded."] : themeResponse?.errors?.map((error) => error.message) || []),
      ...(bundleResult.status === "rejected" ? ["Bundle offers could not be loaded."] : bundleResult.value.graphqlErrors.map((error) => error.message)),
      ...(quantityResult.status === "rejected" ? ["Quantity offers could not be loaded."] : quantityResult.value.graphqlErrors.map((error) => error.message)),
    ].join(" ") || null,
  };
};

export default function StorefrontSetupPage() {
  const { shop, apiKey, themes, bundleOffers, quantityOffers, loadError } = useLoaderData();
  const liveThemes = themes.filter((theme) => theme.role === "MAIN");
  const [selectedThemeId, setSelectedThemeId] = useState(liveThemes[0]?.id || themes[0]?.id || "");
  const selectedTheme = useMemo(
    () => themes.find((theme) => theme.id === selectedThemeId) || themes[0],
    [selectedThemeId, themes],
  );

  return (
    <s-page heading="Storefront setup">
      <div style={pageStyle}>
        <section style={heroStyle}>
          <div>
            <div style={heroEyebrowStyle}>Easy setup</div>
            <h2 style={{ margin: "0.25rem 0", fontSize: "1.45rem" }}>Add your offer to your store in 3 simple steps</h2>
            <p style={heroCopyStyle}>You do not need to edit code. Choose a theme, open the right template, then save it in Shopify’s theme editor.</p>
          </div>
        </section>

        {loadError ? <s-banner tone="warning"><s-paragraph>{loadError}</s-paragraph></s-banner> : null}

        <div style={metricGridStyle}>
          <Metric label="Bundle offers" value={bundleOffers.length} detail={`${bundleOffers.filter((offer) => offer.status === "ACTIVE").length} active`} />
          <Metric label="Quantity offers" value={quantityOffers.length} detail={`${quantityOffers.filter((offer) => offer.status === "ACTIVE").length} active`} />
          <Metric label="Store themes" value={themes.length} detail={`${liveThemes.length} live theme`} />
        </div>

        <section style={quickStartStyle}>
          <SetupStep number="1" title="Choose a theme" detail="Start with a preview or development theme if possible. You can test safely before changing your live store." />
          <SetupStep number="2" title="Pick your offer type" detail="Use the unified bundle page for fixed price, buy-X-get-Y-free, and percentage offers. Use Quantity offers for a product page." />
          <SetupStep number="3" title="Save and test" detail="In Shopify’s editor, add the block, choose its settings, click Save, and test the offer before publishing." />
        </section>

        <section style={sectionStyle}>
          <div><div style={eyebrowStyle}>Step 1</div><h3 style={titleStyle}>Choose the theme you want to change</h3><p style={copyStyle}>A preview or development theme is safest for testing. Your live theme is already visible to customers.</p></div>
          {themes.length ? <>
            <label style={selectLabelStyle}>Theme to customize<select value={selectedThemeId} onChange={(event) => setSelectedThemeId(event.target.value)} style={selectStyle}>{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name} — {theme.role === "MAIN" ? "Live" : theme.role === "DEVELOPMENT" ? "Development" : "Preview"}</option>)}</select></label>
            {selectedTheme ? <ThemeCard theme={selectedTheme} shop={shop} apiKey={apiKey} /> : null}
          </> : <p style={copyStyle}>We could not find a theme. Please reopen this page, or email us and we’ll help.</p>}
        </section>

        <section style={sectionStyle}>
          <div><div style={eyebrowStyle}>Step 2</div><h3 style={titleStyle}>Choose what you want to show shoppers</h3><p style={copyStyle}>Use the buttons above to open Shopify’s theme editor. There, add the offer block, choose your products and colors, then click Save.</p></div>
          <div style={templateGridStyle}>
            <TemplateCard name="Unified bundle page" type="For a bundle page" description="Let shoppers choose products from one collection and automatically qualify for fixed price, free-item, or percentage offers." steps={["Create a Page template.", "Add the unified bundle page and choose the collection.", "Configure the enabled offer tiers and save."]} />
            <TemplateCard name="Quantity offers" type="For a product page" description="Show quantity savings, such as buy 2 and save more, on a product page." steps={["Create a Product template.", "Add Quantity offers to Product information.", "Assign the template to the products you want."]} />
          </div>
        </section>

        <section style={tipStyle}>
          <strong>Step 3 — Save and check:</strong> make sure the products, quantities, and savings in the block match the offer you created in this app. Then add the offer to cart to make sure it works before publishing.
        </section>

        <section style={supportStyle}>
          <div>
            <div style={eyebrowStyle}>Need help?</div>
            <h3 style={titleStyle}>Having trouble setting up your website template?</h3>
            <p style={copyStyle}>Email us with your store URL, theme name, and a short description of the issue. We’ll help you get the block set up.</p>
          </div>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={supportLinkStyle}>Email {SUPPORT_EMAIL}</a>
        </section>
      </div>
    </s-page>
  );
}

function ThemeCard({ theme, shop, apiKey }) {
  const isLive = theme.role === "MAIN";
  const status = isLive ? "Live theme" : theme.role === "DEVELOPMENT" ? "Development preview" : "Preview theme";
  const editorBase = `https://${shop}/admin/themes/${theme.numericId}/editor`;
  const pageUrl = `${editorBase}?template=page&addAppBlockId=${apiKey}/bundle&target=newAppsSection`;
  const productUrl = `${editorBase}?template=product&addAppBlockId=${apiKey}/quantity_offers&target=mainSection`;
  return <article style={{ ...themeCardStyle, borderColor: isLive ? "#059669" : "#dbe4ea" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "start" }}><strong>{theme.name}</strong><span style={{ ...statusStyle, background: isLive ? "#d1fae5" : "#eff6ff", color: isLive ? "#047857" : "#1d4ed8" }}>{status}</span></div>
    <p style={copyStyle}>{isLive ? "This theme is live, so any saved changes can be visible to shoppers." : "This theme is not live yet, so it is a safe place to test."}</p>
    <div style={buttonRowStyle}><a href={pageUrl} target="_top" style={buttonStyle}>Set up unified bundle page</a><a href={productUrl} target="_top" style={secondaryButtonStyle}>Set up quantity offers</a></div>
    <p style={editorHintStyle}>Each button opens Shopify’s theme editor. Add the block, select the settings you want, and click Save.</p>
  </article>;
}

function TemplateCard({ name, type, description, steps }) {
  return <article style={templateCardStyle}><span style={typeStyle}>{type}</span><h4 style={{ margin: "0.6rem 0 0.4rem" }}>{name}</h4><p style={copyStyle}>{description}</p><ol style={stepsStyle}>{steps.map((step) => <li key={step}>{step}</li>)}</ol></article>;
}

function SetupStep({ number, title, detail }) {
  return <article style={setupStepStyle}><span style={stepNumberStyle}>{number}</span><div><strong style={{ color: "#0f172a" }}>{title}</strong><p style={{ ...copyStyle, marginTop: "0.25rem", fontSize: "0.84rem" }}>{detail}</p></div></article>;
}

function Metric({ label, value, detail }) { return <article style={metricStyle}><span style={{ color: "#64748b", fontSize: "0.84rem", fontWeight: 700 }}>{label}</span><strong style={{ display: "block", fontSize: "1.7rem", marginTop: "0.25rem" }}>{value}</strong><span style={{ color: "#64748b", fontSize: "0.8rem" }}>{detail}</span></article>; }

const pageStyle = { display: "grid", gap: "1rem", maxWidth: "1120px" };
const heroStyle = { padding: "1.35rem", borderRadius: "1rem", background: "linear-gradient(135deg, #0f172a, #075985)", color: "#fff" };
const heroEyebrowStyle = { color: "#a7f3d0", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" };
const heroCopyStyle = { margin: 0, maxWidth: "720px", color: "#e0f2fe", lineHeight: 1.55 };
const eyebrowStyle = { color: "#047857", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" };
const titleStyle = { margin: "0.2rem 0 0", fontSize: "1.15rem" };
const copyStyle = { margin: 0, color: "#475569", lineHeight: 1.5, fontSize: "0.9rem" };
const metricGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.8rem" };
const metricStyle = { padding: "1rem", background: "#fff", border: "1px solid #dbe4ea", borderRadius: "0.85rem" };
const sectionStyle = { display: "grid", gap: "1rem", padding: "1.15rem", background: "#fff", border: "1px solid #dbe4ea", borderRadius: "1rem" };
const quickStartStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" };
const setupStepStyle = { display: "flex", gap: "0.7rem", padding: "0.9rem", border: "1px solid #dbe4ea", borderRadius: "0.8rem", background: "#fff" };
const stepNumberStyle = { display: "grid", flex: "0 0 auto", placeItems: "center", width: "1.65rem", height: "1.65rem", borderRadius: "50%", background: "#047857", color: "#fff", fontSize: "0.8rem", fontWeight: 800 };
const themeCardStyle = { display: "grid", gap: "0.8rem", padding: "1rem", border: "1px solid", borderRadius: "0.8rem", background: "#fff" };
const statusStyle = { flex: "0 0 auto", padding: "0.25rem 0.5rem", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 800 };
const buttonRowStyle = { display: "flex", gap: "0.45rem", flexWrap: "wrap" };
const selectLabelStyle = { display: "grid", gap: "0.4rem", maxWidth: "600px", color: "#334155", fontSize: "0.86rem", fontWeight: 750 };
const selectStyle = { width: "100%", minHeight: "42px", padding: "0.55rem 0.7rem", border: "1px solid #94a3b8", borderRadius: "0.55rem", background: "#fff", color: "#0f172a", font: "inherit" };
const buttonStyle = { padding: "0.5rem 0.7rem", borderRadius: "0.5rem", background: "#047857", color: "#fff", textDecoration: "none", fontWeight: 750, fontSize: "0.8rem" };
const secondaryButtonStyle = { ...buttonStyle, background: "#eff6ff", color: "#1e3a8a" };
const templateGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.8rem" };
const templateCardStyle = { padding: "1rem", border: "1px solid #dbe4ea", borderRadius: "0.8rem", background: "#f8fafc" };
const typeStyle = { padding: "0.2rem 0.5rem", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8", fontSize: "0.7rem", fontWeight: 800 };
const stepsStyle = { margin: "0.8rem 0 0", paddingLeft: "1.2rem", display: "grid", gap: "0.45rem", color: "#334155", fontSize: "0.85rem", lineHeight: 1.45 };
const tipStyle = { padding: "1rem", borderRadius: "0.8rem", background: "#ecfdf5", color: "#065f46", lineHeight: 1.5 };
const editorHintStyle = { margin: 0, padding: "0.65rem 0.75rem", borderRadius: "0.55rem", background: "#f0f9ff", color: "#075985", fontSize: "0.82rem", lineHeight: 1.45 };
const supportStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", padding: "1.1rem", borderRadius: "0.85rem", border: "1px solid #bfdbfe", background: "#eff6ff" };
const supportLinkStyle = { display: "inline-flex", alignItems: "center", minHeight: "2.5rem", padding: "0 0.85rem", borderRadius: "0.55rem", background: "#1d4ed8", color: "#fff", fontWeight: 750, fontSize: "0.86rem", textDecoration: "none" };
