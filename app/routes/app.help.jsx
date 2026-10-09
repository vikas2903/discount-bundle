/* global process */
import { useLoaderData, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { checkSubscription, getPlanDetails } from "../utils/billing.server";

const DEFAULT_SUPPORT_EMAIL = "vikasprasad2903@gmail.com";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const subscription = await checkSubscription(billing);

  return {
    plan: getPlanDetails(subscription),
    shop: session?.shop || "",
    supportEmail: process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL,
  };
};

export default function HelpPage() {
  const { plan, shop, supportEmail } = useLoaderData();
  const { search } = useLocation();
  const volumeDiscountsHref = buildEmbeddedHref("/app/volume_discounts", search, shop);
  const bundleOffersHref = buildEmbeddedHref(
    plan.isPro ? "/app/disocunt_bundle" : "/app/billing",
    search,
    shop,
  );
  const storefrontSetupHref = buildEmbeddedHref("/app/storefront_setup", search, shop);
  const billingHref = buildEmbeddedHref("/app/billing", search, shop);

  return (
    <s-page heading="Help & support">
      <div style={pageStyle}>
        <section style={heroStyle}>
          <div>
            <div style={heroEyebrowStyle}>We are here to help</div>
            <h2 style={heroTitleStyle}>Set up, test, and confidently launch your offers.</h2>
            <p style={heroCopyStyle}>Use this guide after installing or updating the app, and before sending shoppers to an offer.</p>
          </div>
          <div style={supportContactStyle}>
            <a href={"mailto:" + supportEmail} style={emailButtonStyle}>Email support</a>
            <a href={"mailto:" + supportEmail} style={emailAddressStyle}>{supportEmail}</a>
          </div>
        </section>

        <section style={updateNoticeStyle}>
          <strong>After an app or theme update:</strong> Open your theme editor and check that the offer block is still present, its settings still match the active offer, and the correct theme is published. Save and place one test order before making the offer public.
        </section>

        <section style={cardStyle}>
          <div><div style={eyebrowStyle}>Before you go live</div><h2 style={titleStyle}>Four checks that prevent most customer issues</h2></div>
          <div style={stepsGridStyle}>
            <Step number="1" title="Create and activate the offer" copy="Set the products or collection, quantities, and savings in the app. A draft or inactive offer cannot apply at checkout." />
            <Step number="2" title="Match the theme block to the offer" copy="The products, required quantity, and saving shown in the storefront block should match the active offer exactly." />
            <Step number="3" title="Add the block to the right template" copy="Use a Product template for quantity offers and a Page template for the unified bundle page. Save the theme after adding it." />
            <Step number="4" title="Test as a shopper" copy="Use the selected product or bundle page, choose an available variant, meet the required quantity, then confirm the automatic discount in cart or checkout." />
          </div>
          <div style={linkRowStyle}>
            <s-link href={volumeDiscountsHref}>Open Quantity offers</s-link>
            <s-link href={bundleOffersHref}>{plan.isPro ? "Open Bundle offers" : "Upgrade for Bundle offers"}</s-link>
            <s-link href={storefrontSetupHref}>Open Website Template Setup</s-link>
          </div>
        </section>

        <section style={cardStyle}>
          <div><div style={eyebrowStyle}>Website template setup</div><h2 style={titleStyle}>Put the right offer in the right place</h2></div>
          <div style={setupGridStyle}>
            <SetupCard
              title="Quantity offers on product pages"
              description="Use this for buy-more-save-more offers on an individual product page."
              steps={[
                "Open Website Template Setup and choose the theme you want to edit.",
                "Open a Product template, then add the Quantity offers app block to Product information.",
                "Choose the offer product and configure the tiers to match your active quantity offer.",
                "Save the template and assign that template to the intended product if needed.",
              ]}
            />
            <SetupCard
              title="Unified bundle page"
              description="Use this when shoppers should build a bundle from a collection on a dedicated page."
              steps={[
                "Open Website Template Setup and choose the theme you want to edit.",
                "Create or open a Page template, then add the Unified bundle page app block.",
                "Choose the collection and configure the bundle type, quantity, and saving to match the active bundle offer.",
                "Save the template, assign it to a Shopify page, and use that page link in your store navigation or campaigns.",
              ]}
            />
          </div>
          <p style={noteStyle}>Tip: Test changes on a development or preview theme first. Saving a live theme can immediately change what customers see.</p>
          <s-link href={storefrontSetupHref}>Open Website Template Setup</s-link>
        </section>

        <section style={cardStyle}>
          <div><div style={eyebrowStyle}>Offer feature guide</div><h2 style={titleStyle}>Bundle discounts</h2></div>
          <p style={copyStyle}>Bundle discounts are automatic offers for customers who buy a qualifying group of products. They are available on Pro.</p>
          <div style={featureGridStyle}>
            <FeatureGroup title="Offer details and schedule" items={[
              "Offer name: an internal name that helps you find and manage the offer.",
              "Customer message: the confirmation text shown with the automatic discount in cart or checkout.",
              "Start and end date: schedule the offer in advance. Leave the end date empty to keep it active until you turn it off.",
            ]} />
            <FeatureGroup title="Bundle tiers and savings" items={[
              "Multiple tiers: create different qualifying bundle sizes, such as buy 2 or buy 4.",
              "Fixed bundle price: set one total price for the qualifying bundle.",
              "Percentage off: reduce the eligible bundle by a percentage.",
              "Buy X, get Y free: require a purchase quantity and add one or more free items.",
              "Tier bundle cap: optionally limit how many times one tier can apply in an order.",
            ]} />
            <FeatureGroup title="How the discount applies" items={[
              "Apply once: discount one complete qualifying bundle per order.",
              "Repeat: apply the discount to every complete qualifying bundle in the cart.",
              "Limit bundles or discounted items: cap the number of bundles or items that can receive the saving.",
              "Item priority: choose whether Shopify uses the cheapest or most expensive eligible items first when a limit applies.",
            ]} />
            <FeatureGroup title="Eligibility and combinations" items={[
              "Eligible products: include all products, chosen collections, or individually selected products.",
              "Excluded products, minimum cart value, and minimum eligible quantity: add extra qualification rules.",
              "Customers: make the offer available to everyone, selected customer segments, or signed-in new customers only.",
              "Discount combinations: choose whether compatible product, order, or shipping discounts may combine with this offer.",
            ]} />
          </div>
          <p style={noteStyle}>Use the live cart preview in the bundle editor to estimate the result for a sample item price and quantity. It is an estimate; Shopify calculates the final discount from the real cart and active discount rules.</p>
          <s-link href={bundleOffersHref}>{plan.isPro ? "Open Bundle offers" : "Upgrade for Bundle offers"}</s-link>
        </section>

        <section style={cardStyle}>
          <div><div style={eyebrowStyle}>Offer feature guide</div><h2 style={titleStyle}>Quantity discounts</h2></div>
          <p style={copyStyle}>Quantity discounts reward shoppers who buy enough of an eligible product. Shopify applies the saving automatically—customers do not enter a coupon code or add product attributes.</p>
          <div style={featureGridStyle}>
            <FeatureGroup title="Offer details and schedule" items={[
              "Offer name: an internal name for managing the offer.",
              "Cart message: customer-facing text displayed with the automatic saving; it is not a discount code.",
              "New offers are inactive by default. Activate the offer when it is ready for shoppers.",
              "Start and end date: after activation, schedule when the offer begins and, optionally, when it stops.",
            ]} />
            <FeatureGroup title="Quantity saving options" items={[
              "Set one or more quantity tiers, such as buy 2 and save 5%, or buy 3 and save 15%.",
              "For each tier, choose the minimum number of eligible items and either a percentage or fixed amount off each item.",
              "For each cart line, the highest qualifying tier is used.",
            ]} />
            <FeatureGroup title="Targeting and customers" items={[
              "All products: every product can qualify.",
              "Selected collections: only products inside the collections you choose can qualify.",
              "Selected products: only the exact products you choose can qualify.",
              "New customers only: apply only when Shopify identifies the shopper as having no earlier orders.",
              "Free plan: one active quantity offer. Pro: unlimited quantity offers and access to bundle offers.",
            ]} />
            <FeatureGroup title="Limits and important behavior" items={[
              "Apply once, repeat, or limit applications: control how many qualifying product lines receive the saving in one order.",
              "Item priority: when applications are limited, choose whether the cheapest or most expensive qualifying lines receive the saving first.",
              "Discount combinations: choose whether product, order, or shipping discounts can combine with this offer.",
              "The product must match targeting and meet the quantity tier. Product attributes do not activate this discount.",
              "Only one active quantity offer can cover the same targeting scope at a time, preventing conflicting savings.",
            ]} />
          </div>
          <s-link href={volumeDiscountsHref}>Open Quantity offers</s-link>
        </section>

        <section style={cardStyle}>
          <div><div style={eyebrowStyle}>What shoppers experience</div><h2 style={titleStyle}>Expected customer journey</h2></div>
          <div style={journeyGridStyle}>
            <Journey title="Quantity offer" copy="The shopper selects a tier and an available variant. The block adds the selected quantity to Shopify cart, then opens the cart or checkout. The discount is automatic only when the cart meets the active offer rules." />
            <Journey title="Bundle offer" copy="The shopper selects the required products and variants from the bundle page. After the bundle is added to cart, Shopify checks the bundle offer rules and applies an eligible automatic discount." />
            <Journey title="Checkout and other discounts" copy="A visible block is not a guarantee of a discount. Product availability, cart contents, active offer status, and Shopify discount-combination rules can all affect the final price." />
          </div>
        </section>

        <section style={cardStyle}>
          <div><div style={eyebrowStyle}>Troubleshooting</div><h2 style={titleStyle}>Fix common setup and customer issues</h2></div>
          <div style={faqGridStyle}>
            <Faq question="The app block is not visible on my store" answer="Confirm you edited the published theme, added the block to the correct Product or Page template, saved the theme, and assigned that template to the correct product or page. If you tested a preview theme, customers will not see those changes until that theme is published." />
            <Faq question="The block is visible but the discount is not applied" answer="Check that the offer is active, the qualifying products belong to the selected collection, the cart meets the exact quantity requirement, and the block settings match the offer. Also test without another automatic discount or discount code, because Shopify discount rules can affect which discount is applied." />
            <Faq question="A product or variant cannot be selected" answer="Make sure the product is available on the Online Store sales channel and the selected variant is in stock. For a bundle, the product must also be in the collection selected in the app block." />
            <Faq question="The Add to cart button shows an error or does not continue" answer="Test with an in-stock variant and the standard Shopify cart or checkout first. If you use custom checkout code or a third-party checkout provider, temporarily remove that custom code and test again; provider code must be approved for storefront use and must not contain private keys." />
            <Faq question="My saved changes are not showing" answer="Verify the selected theme is the live theme, save the theme editor, and open the storefront in a private browser window. If the block was changed after an update, recheck its settings and avoid adding duplicate offer blocks to the same template." />
            <Faq question="I need help from support" answer={"Email " + supportEmail + " with your store URL, theme name, product or page URL, offer name, a screenshot, and the exact steps a shopper followed. Please do not send store passwords or private API keys."} />
          </div>
        </section>

        <section style={cardStyle}>
          <div><div style={eyebrowStyle}>Plan and billing</div><h2 style={titleStyle}>{plan.isPro ? "Your Pro plan is active" : "You are on the Free plan"}</h2></div>
          <p style={copyStyle}>{plan.isPro ? "Manage or cancel your subscription in Shopify Admin under Settings and Billing." : "The Free plan includes one active quantity offer. Start a 14-day Pro trial for bundle offers and unlimited quantity offers."}</p>
          <s-link href={billingHref}>Open Plans & billing</s-link>
        </section>
      </div>
    </s-page>
  );
}

function Step({ number, title, copy }) {
  return <div style={stepStyle}><span style={stepNumberStyle}>{number}</span><div><h3 style={stepTitleStyle}>{title}</h3><p style={copyStyle}>{copy}</p></div></div>;
}

function SetupCard({ title, description, steps }) {
  return <article style={setupCardStyle}><h3 style={setupTitleStyle}>{title}</h3><p style={copyStyle}>{description}</p><ol style={listStyle}>{steps.map((step) => <li key={step}>{step}</li>)}</ol></article>;
}

function Journey({ title, copy }) {
  return <article style={journeyStyle}><h3 style={setupTitleStyle}>{title}</h3><p style={copyStyle}>{copy}</p></article>;
}

function FeatureGroup({ title, items }) {
  return <article style={featureGroupStyle}><h3 style={setupTitleStyle}>{title}</h3><ul style={featureListStyle}>{items.map((item) => <li key={item}>{item}</li>)}</ul></article>;
}

function Faq({ question, answer }) {
  return <details style={faqStyle}><summary style={faqQuestionStyle}>{question}</summary><p style={faqAnswerStyle}>{answer}</p></details>;
}

function buildEmbeddedHref(path, search, shop) {
  const searchParams = new URLSearchParams(search);

  if (shop && !searchParams.has("shop")) {
    searchParams.set("shop", shop);
  }

  const query = searchParams.toString();
  return query ? path + "?" + query : path;
}

const pageStyle = {
  display: "grid",
  gap: "1rem",
  width: "calc(100vw - 2rem)",
  maxWidth: "none",
  marginLeft: "calc(50% - 50vw + 1rem)",
  marginRight: "calc(50% - 50vw + 1rem)",
  boxSizing: "border-box",
};
const heroStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", padding: "1.25rem", borderRadius: "1rem", background: "linear-gradient(135deg, #0f172a, #065f46)", color: "#fff" };
const heroEyebrowStyle = { color: "#a7f3d0", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.05em" };
const heroTitleStyle = { margin: "0.2rem 0", fontSize: "1.35rem" };
const heroCopyStyle = { margin: 0, color: "rgba(255,255,255,0.9)", lineHeight: 1.5 };
const emailButtonStyle = { display: "inline-flex", alignItems: "center", minHeight: "2.5rem", padding: "0 0.9rem", borderRadius: "0.6rem", background: "#fff", color: "#065f46", fontWeight: 800, textDecoration: "none" };
const supportContactStyle = { display: "grid", gap: "0.4rem", justifyItems: "start" };
const emailAddressStyle = { color: "rgba(255,255,255,0.9)", fontSize: "0.86rem" };
const updateNoticeStyle = { padding: "0.95rem 1rem", borderRadius: "0.8rem", background: "#fffbeb", border: "1px solid #fde68a", color: "#713f12", lineHeight: 1.55 };
const cardStyle = { display: "grid", gap: "0.85rem", padding: "1.1rem", border: "1px solid #e2e8f0", borderRadius: "1rem", background: "#fff" };
const eyebrowStyle = { color: "#047857", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.05em" };
const titleStyle = { margin: "0.15rem 0 0", fontSize: "1.15rem", color: "#0f172a" };
const copyStyle = { margin: 0, color: "#475569", lineHeight: 1.55 };
const stepsGridStyle = { display: "grid", gap: "0.8rem" };
const stepStyle = { display: "flex", gap: "0.75rem", alignItems: "flex-start" };
const stepNumberStyle = { flex: "0 0 auto", width: "1.8rem", height: "1.8rem", display: "grid", placeItems: "center", borderRadius: "50%", background: "#dcfce7", color: "#047857", fontWeight: 800 };
const stepTitleStyle = { margin: "0 0 0.15rem", color: "#0f172a", fontSize: "1rem" };
const linkRowStyle = { display: "flex", gap: "1rem", flexWrap: "wrap" };
const setupGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.8rem" };
const setupCardStyle = { display: "grid", gap: "0.65rem", padding: "1rem", border: "1px solid #dbe4ea", borderRadius: "0.8rem", background: "#f8fafc" };
const setupTitleStyle = { margin: 0, color: "#0f172a", fontSize: "1rem" };
const listStyle = { display: "grid", gap: "0.45rem", margin: 0, paddingLeft: "1.25rem", color: "#334155", lineHeight: 1.5 };
const noteStyle = { margin: 0, padding: "0.75rem 0.85rem", borderRadius: "0.65rem", background: "#ecfdf5", color: "#065f46", lineHeight: 1.5 };
const featureGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.8rem" };
const featureGroupStyle = { display: "grid", gap: "0.6rem", padding: "1rem", border: "1px solid #dbe4ea", borderRadius: "0.8rem", background: "#f8fafc" };
const featureListStyle = { display: "grid", gap: "0.5rem", margin: 0, paddingLeft: "1.2rem", color: "#475569", lineHeight: 1.5 };
const journeyGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" };
const journeyStyle = { display: "grid", gap: "0.5rem", padding: "0.9rem", border: "1px solid #dbe4ea", borderRadius: "0.8rem" };
const faqGridStyle = { display: "grid", gap: "0.6rem" };
const faqStyle = { padding: "0.8rem", border: "1px solid #e2e8f0", borderRadius: "0.7rem" };
const faqQuestionStyle = { cursor: "pointer", color: "#0f172a", fontWeight: 750 };
const faqAnswerStyle = { margin: "0.6rem 0 0", color: "#475569", lineHeight: 1.55 };
