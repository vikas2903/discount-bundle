/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { DEFAULT_BUNDLE_CONFIG } from "../../utils/bundle-discount";

export function BundleDiscountForm({ action = "create", collections, defaultValues, submitLabel, loading = false, error }) {
  const shopify = useAppBridge();
  const initial = useMemo(() => normalizeInitial(defaultValues), [defaultValues]);
  const [title, setTitle] = useState(initial.title);
  const [message, setMessage] = useState(initial.config.messages.confirmation);
  const [schedule, setSchedule] = useState([
    toDateTimeInput(initial.startsAt) || currentDateTimeInput(),
    toDateTimeInput(initial.endsAt),
  ]);
  const [tiers, setTiers] = useState(initial.config.bundleTiers);
  const [application, setApplication] = useState(initial.config.application);
  const [eligibility, setEligibility] = useState(initial.config.eligibility);
  const [combinations, setCombinations] = useState(initial.config.combinations);
  const [messages, setMessages] = useState(initial.config.messages);
  const [testQuantity, setTestQuantity] = useState(4);
  const [testUnitPrice, setTestUnitPrice] = useState(749);
  const selectedCollections = collections.filter((item) => eligibility.selectedCollectionIds.includes(item.id));
  const sortedTiers = [...tiers].sort((left, right) => Number(right.quantity) - Number(left.quantity));
  const previewTier = sortedTiers.find((tier) => Number(tier.quantity) + (tier.discountType === "free" ? Number(tier.freeQuantity) : 0) <= testQuantity) || sortedTiers[sortedTiers.length - 1];
  const groupSize = previewTier ? Number(previewTier.quantity) + (previewTier.discountType === "free" ? Number(previewTier.freeQuantity) : 0) : 0;
  const theoreticalBundles = groupSize ? Math.floor(testQuantity / groupSize) : 0;
  const bundleCap = application.method === "once" ? 1 : application.method === "limit_bundles" ? Number(application.maxBundles) || 0 : theoreticalBundles;
  const itemCap = application.method === "limit_items" ? Number(application.maxDiscountedItems) || 0 : Infinity;
  const previewBundles = Math.max(0, Math.min(theoreticalBundles, bundleCap || theoreticalBundles, groupSize ? Math.floor(itemCap / groupSize) : 0));
  const discountedItems = previewBundles * groupSize;
  const savingValue = !previewTier ? 0 : previewTier.discountType === "percentage" ? testUnitPrice * discountedItems * Number(previewTier.value) / 100 : previewTier.discountType === "free" ? testUnitPrice * previewBundles * Number(previewTier.freeQuantity) : Math.max(0, testUnitPrice * groupSize - Number(previewTier.value)) * previewBundles;
  const estimatedSavings = `Estimated savings: ${savingValue.toFixed(2)}`;

  return <>
    <style>{`
      .bundle-page-shell{width:calc(100vw - 32px);max-width:none;margin-left:calc(50% - 50vw + 16px);margin-right:calc(50% - 50vw + 16px);padding:4px 0 28px;color:#182b3a}
      .bundle-page-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 0 14px}
      .bundle-page-header h1{margin:0 0 3px;font-size:22px;line-height:1.25;letter-spacing:-.02em;color:#172033}
      .bundle-page-header p{margin:0;color:#66788a;font-size:13px}.bundle-header-actions{display:flex;gap:8px;align-items:center}
      .bundle-builder{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,400px);gap:14px;align-items:start;width:100%}
      .bundle-main{display:grid;gap:10px;min-width:0}.bundle-card{border:1px solid #dce5eb;border-radius:7px;padding:14px;background:#fff;box-shadow:0 1px 2px rgba(15,35,52,.025)}
      .bundle-card strong{color:#213547}.bundle-side{display:grid;gap:10px;position:sticky;top:12px}.bundle-side .bundle-card{padding:13px}
      .bundle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}.bundle-schedule-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 16px}.bundle-field{display:grid;gap:5px;font-size:11px;font-weight:700;color:#53697c}
      .bundle-input,.bundle-select,.bundle-area{width:100%;box-sizing:border-box;min-height:36px;border:1px solid #cfdce6;border-radius:5px;padding:8px 10px;background:#fff;font:inherit;font-size:12px;color:#203447;box-shadow:inset 0 1px 2px rgba(20,46,66,.025)}
      .bundle-input:focus,.bundle-select:focus,.bundle-area:focus{outline:2px solid #a8dfca;border-color:#009a62}.bundle-area{min-height:64px;resize:vertical}
      .bundle-option{display:flex;gap:8px;align-items:flex-start;padding:7px 1px;border:0;border-radius:4px;cursor:pointer;font-size:12px;color:#30485b}.bundle-option small{color:#6f8293;line-height:1.35}.bundle-option input{accent-color:#008f5a;margin:2px 3px 0 0}
      .bundle-tier{border:1px solid #e0e9ee;border-radius:6px;padding:11px;display:grid;gap:10px;background:#fff}.bundle-tier>strong{font-size:12px}.bundle-actions{display:flex;gap:7px;flex-wrap:wrap}
      .bundle-button{min-height:34px;border:1px solid #cbd9e2;border-radius:5px;background:#fff;padding:7px 11px;color:#243a4b;cursor:pointer;font:inherit;font-size:11px;font-weight:700}.bundle-button:hover{background:#f5f9fa}.bundle-button:disabled{opacity:.55;cursor:not-allowed}
      .bundle-button.primary{background:#173a4b;color:#fff;border-color:#173a4b}.bundle-back-button{white-space:nowrap}.bundle-note{margin:0;color:#718395;font-size:11px;line-height:1.45}.bundle-badge{display:inline-flex;width:max-content;align-items:center;border-radius:4px;padding:5px 8px;background:#e8f8f0;color:#00834f;font-size:11px;font-weight:700}
      .bundle-save-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.bundle-save-option{display:grid;gap:3px;min-height:51px;padding:9px 10px;border:1px solid #dce6ec;border-radius:5px;background:#fff;color:#334b5c;text-align:left;cursor:pointer;font:inherit;font-size:11px}.bundle-save-option span{font-weight:750}.bundle-save-option small{color:#708292;font-size:10px}.bundle-save-option.is-selected{border-color:#009b62;background:#f1fcf6;box-shadow:inset 0 0 0 1px #009b62}.bundle-save-option.is-selected span{color:#008957}
      .bundle-main>.bundle-button.primary{justify-self:end;margin:4px 0 0;min-width:142px}.bundle-side .bundle-grid{gap:8px}.bundle-side .bundle-field{font-size:10px}
      @media(max-width:960px){.bundle-builder{grid-template-columns:minmax(0,1fr) 310px}.bundle-save-options{grid-template-columns:1fr}}
      @media(max-width:760px){.bundle-page-shell{width:100%;margin:0;padding:4px 0 28px}.bundle-page-header{align-items:flex-start;flex-direction:column}.bundle-builder{grid-template-columns:1fr}.bundle-side{position:static;grid-template-columns:1fr}.bundle-grid,.bundle-schedule-grid{grid-template-columns:1fr}.bundle-save-options{grid-template-columns:1fr}.bundle-main>.bundle-button.primary{width:100%}}
    `}</style>
    <div className="bundle-builder">
      <input type="hidden" name="intent" value={action} />
      <input type="hidden" name="startsAt" value={schedule[0] || ""} />
      <input type="hidden" name="endsAt" value={schedule[1] || ""} />
      <input type="hidden" name="applicationMethod" value={application.method} />
      <input type="hidden" name="itemPriority" value={application.priority} />
      <input type="hidden" name="maxBundles" value={application.maxBundles || ""} />
      <input type="hidden" name="maxDiscountedItems" value={application.maxDiscountedItems || ""} />
      <input type="hidden" name="productMode" value={eligibility.productMode} />
      <input type="hidden" name="customerMode" value={eligibility.customerMode} />
      <input type="hidden" name="newCustomersOnly" value={String(eligibility.newCustomersOnly)} />
      <input type="hidden" name="combineProductDiscounts" value={String(combinations.productDiscounts)} />
      <input type="hidden" name="combineOrderDiscounts" value={String(combinations.orderDiscounts)} />
      <input type="hidden" name="combineShippingDiscounts" value={String(combinations.shippingDiscounts)} />
      <div className="bundle-main">
        <Card number="1" title="Offer details" description="Name your automatic bundle offer and decide when it runs.">
          <div className="bundle-grid"><Field label="Offer name"><input className="bundle-input" name="title" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field><Field label="Start date & time"><input className="bundle-input" type="datetime-local" value={schedule[0] || ""} onChange={(event) => setSchedule([event.target.value, schedule[1]])} required /></Field><Field label="Customer message"><input className="bundle-input" name="message" value={message} onChange={(event) => { setMessage(event.target.value); setMessages({...messages,confirmation:event.target.value}); }} /></Field><Field label="End date & time (optional)"><input className="bundle-input" type="datetime-local" value={schedule[1] || ""} min={schedule[0] || undefined} onChange={(event) => setSchedule([schedule[0], event.target.value])} /></Field></div>
          <p className="bundle-note">Leave the end date empty to keep this offer active until you remove it.</p>
        </Card>
        <Card number="2" title="Choose how shoppers save" description="Choose a fixed bundle price, a percentage discount, or a buy-X-get-Y-free offer.">
          <div className="bundle-actions"><button className="bundle-button" type="button" onClick={() => setTiers([...tiers,{quantity:nextQuantity(tiers),freeQuantity:0,discountType:"fixed_price",value:"",maxBundles:0}])}>+ Add tier</button></div>
          <div style={{display:"grid",gap:10}}>{tiers.map((tier,index) => <Tier key={`${tier.quantity}-${index}`} tier={tier} index={index} total={tiers.length} onChange={(field,value) => setTiers(tiers.map((item,itemIndex) => itemIndex === index ? {...item,[field]:value} : item))} onMove={(direction) => setTiers(move(tiers,index,direction))} onRemove={() => setTiers(tiers.filter((_,itemIndex) => itemIndex !== index))} />)}</div>
        </Card>
        <Card number="3" title="Discount application limits" description="These limits are enforced by the Shopify Discount Function, not only in the preview.">
          <div style={{display:"grid",gap:8}}>{[
            ["once","Apply once per order","Discount one complete qualifying bundle."], ["repeat","Repeat for every qualifying bundle","Discount every complete group in the cart."], ["limit_bundles","Limit number of bundles","Cap the number of complete bundles per order."], ["limit_items","Limit discounted items","Cap the number of eligible items used by bundles."],
          ].map(([value,label,detail]) => <label className="bundle-option" key={value}><input type="radio" checked={application.method===value} onChange={() => setApplication({...application,method:value})} /><span><strong>{label}</strong><br/><small>{detail}</small></span></label>)}</div>
          <div className="bundle-grid" style={{marginTop:12}}>{application.method === "limit_bundles" ? <Field label="Maximum bundles"><input className="bundle-input" type="number" min="1" value={application.maxBundles||""} onChange={(event) => setApplication({...application,maxBundles:event.target.value})}/></Field> : null}{application.method === "limit_items" ? <Field label="Maximum discounted items"><input className="bundle-input" type="number" min="1" value={application.maxDiscountedItems||""} onChange={(event) => setApplication({...application,maxDiscountedItems:event.target.value})}/></Field> : null}<Field label="Item priority"><select className="bundle-select" value={application.priority} onChange={(event) => setApplication({...application,priority:event.target.value})}><option value="cheapest">Cheapest eligible items first</option><option value="most_expensive">Most expensive eligible items first</option></select></Field></div>
        </Card>
        <Card number="4" title="Discount combinations" description="Only Shopify's product, order, and shipping combination classes are available.">
          <div className="bundle-grid">{[["productDiscounts","Product discounts"],["orderDiscounts","Order discounts"],["shippingDiscounts","Shipping discounts"]].map(([key,label]) => <label className="bundle-option" key={key}><input type="checkbox" checked={combinations[key]} onChange={(event) => setCombinations({...combinations,[key]:event.target.checked})}/><span>{label}</span></label>)}</div><p className="bundle-note">“Other app discounts” cannot be selected separately: Shopify applies the combination class rules to all compatible discounts. Enable only the classes you intend to stack.</p>
        </Card>
        <Card number="5" title="Eligible products & customers" description="Choose the exact products and customers that can use this offer.">
          <div className="bundle-grid"><Field label="Product eligibility"><select className="bundle-select" value={eligibility.productMode} onChange={(event) => setEligibility({...eligibility,productMode:event.target.value})}><option value="all">All products</option><option value="collections">Selected collections</option><option value="products">Selected products</option></select></Field><Field label="Customer eligibility"><select className="bundle-select" value={eligibility.customerMode} onChange={(event) => setEligibility({...eligibility,customerMode:event.target.value})}><option value="all">All customers</option><option value="segments">Customer segments</option></select></Field></div>
          {eligibility.productMode === "collections" ? <PickerSummary label="Collections" names={selectedCollections.map((item) => item.title)} action="Choose collections" onClick={async () => { const selected = await shopify.resourcePicker({type:"collection",action:"select",multiple:true,selectionIds:eligibility.selectedCollectionIds.map((id)=>({id}))}); if(selected) setEligibility({...eligibility,selectedCollectionIds:selected.map((item)=>item.id)}); }} /> : null}
          {eligibility.productMode === "products" ? <PickerSummary label="Products" names={eligibility.selectedProductIds} action="Choose products" onClick={async () => { const selected = await shopify.resourcePicker({type:"product",action:"select",multiple:true,selectionIds:eligibility.selectedProductIds.map((id)=>({id}))}); if(selected) setEligibility({...eligibility,selectedProductIds:selected.map((item)=>item.id)}); }} /> : null}
          <div className="bundle-grid"><Field label="Excluded product IDs"><textarea className="bundle-area" value={eligibility.excludedProductIds.join("\n")} onChange={(event) => setEligibility({...eligibility,excludedProductIds:splitIds(event.target.value)})} placeholder="gid://shopify/Product/123" /></Field><Field label="Customer segment IDs"><textarea className="bundle-area" disabled={eligibility.customerMode!=="segments"} value={eligibility.customerSegmentIds.join("\n")} onChange={(event) => setEligibility({...eligibility,customerSegmentIds:splitIds(event.target.value)})} placeholder="gid://shopify/Segment/123" /></Field><Field label="Minimum cart value"><input className="bundle-input" type="number" min="0" value={eligibility.minimumCartValue||""} onChange={(event) => setEligibility({...eligibility,minimumCartValue:event.target.value})}/></Field><Field label="Minimum eligible quantity"><input className="bundle-input" type="number" min="0" value={eligibility.minimumQuantity||""} onChange={(event) => setEligibility({...eligibility,minimumQuantity:event.target.value})}/></Field></div>
          <label className="bundle-option"><input type="checkbox" checked={eligibility.newCustomersOnly} onChange={(event) => setEligibility({...eligibility,newCustomersOnly:event.target.checked})}/><span><strong>New customers only</strong><br/><small>Enforced only for signed-in customers with zero Shopify orders.</small></span></label><p className="bundle-note">Per-customer and total historical usage limits are not available for Shopify automatic app discounts, so they are deliberately not shown as selectable settings.</p>
          {eligibility.selectedCollectionIds.map((id)=><input key={id} type="hidden" name="selectedCollectionIds" value={id}/>)}{eligibility.selectedProductIds.map((id)=><input key={id} type="hidden" name="selectedProductIds" value={id}/>)}{eligibility.excludedProductIds.map((id)=><input key={id} type="hidden" name="excludedProductIds" value={id}/>)}{eligibility.customerSegmentIds.map((id)=><input key={id} type="hidden" name="customerSegmentIds" value={id}/>)}
        </Card>
        <Card number="6" title="Schedule & storefront message" description="Set when the offer starts and ends, plus the message shoppers see after it is applied.">
          <div className="bundle-schedule-grid">
            <Field label="Start date & time"><input className="bundle-input" type="datetime-local" value={schedule[0] || ""} onChange={(event) => setSchedule([event.target.value, schedule[1]])} required /></Field>
            <Field label="End date & time (optional)"><input className="bundle-input" type="datetime-local" value={schedule[1] || ""} min={schedule[0] || undefined} onChange={(event) => setSchedule([schedule[0], event.target.value])} /></Field>
            <Field label="Cart message"><input className="bundle-input" value={message} onChange={(event) => { setMessage(event.target.value); setMessages({...messages,confirmation:event.target.value}); }} /></Field>
          </div>
          <p className="bundle-note">The same schedule and cart message are shown in Offer details above. They are repeated here to match the final storefront setup section.</p>
          {[["productPage","productPageMessage"],["cartDrawer","cartDrawerMessage"],["cartPage","cartPageMessage"],["remainingQuantity","remainingQuantityMessage"]].map(([key,name]) => <input key={key} type="hidden" name={name} value={messages[key] || ""} />)}
        </Card>
        {error ? <s-banner tone="critical"><s-paragraph>{error}</s-paragraph></s-banner> : null}<button className="bundle-button primary" type="submit" disabled={loading}>{loading ? "Saving…" : submitLabel}</button>
      </div>
      <aside className="bundle-side"><Card title="Offer at a glance"><Summary label="When it runs" value={formatScheduleTime(schedule[0]) || "Not scheduled"}/><Summary label="Eligible products" value={eligibility.productMode === "all" ? "All products" : eligibility.productMode === "collections" ? `${selectedCollections.length} collections` : `${eligibility.selectedProductIds.length} products`}/><Summary label="Cart message" value={message || "No message"}/></Card><Card title="Live cart preview"><div className="bundle-grid"><Field label="Eligible items in cart"><input className="bundle-input" type="number" min="0" value={testQuantity} onChange={(event)=>setTestQuantity(Number(event.target.value)||0)}/></Field><Field label="Example item price"><input className="bundle-input" type="number" min="0" value={testUnitPrice} onChange={(event)=>setTestUnitPrice(Number(event.target.value)||0)}/></Field></div><p className="bundle-badge">{discountedItems} eligible items discounted</p><Summary label="Applicable tier" value={previewTier ? tierLabel(previewTier) : "No tier qualifies"}/><Summary label="Estimated saving" value={previewBundles ? estimatedSavings : "Add more eligible items"}/><Summary label="Remaining items" value={String(Math.max(0,(groupSize || 0) - (testQuantity % (groupSize || 1))))}/><p className="bundle-note">Estimate only. Shopify calculates final savings after all active discounts and cart prices are evaluated.</p></Card></aside>
    </div>
  </>;
}

function Card({number,title,description,children}) { return <section className="bundle-card"><div style={{display:"grid",gap:4,marginBottom:14}}><div style={{display:"flex",gap:8,alignItems:"center"}}>{number?<span className="bundle-badge" style={{background:"#183b4d",color:"#fff"}}>{number}</span>:null}<strong>{title}</strong></div>{description?<p className="bundle-note">{description}</p>:null}</div><div style={{display:"grid",gap:12}}>{children}</div></section>; }
function Field({label,children}) { return <label className="bundle-field"><span>{label}</span>{children}</label>; }
function Summary({label,value}) { return <div style={{padding:"10px",border:"1px solid #e2e8f0",borderRadius:8}}><div className="bundle-note">{label}</div><strong style={{fontSize:13}}>{value}</strong></div>; }
function PickerSummary({label,names,action,onClick}) { return <div className="bundle-option" style={{justifyContent:"space-between",marginTop:10}}><span><strong>{label}</strong><br/><small>{names.length?names.join(", "):"None selected"}</small></span><button className="bundle-button" type="button" onClick={onClick}>{action}</button></div>; }
function Tier({tier,index,total,onChange,onMove,onRemove}) {
  const choices = [
    ["fixed_price", "Fixed bundle price", "Set a total price for the bundle"],
    ["percentage", "Percentage off", "Apply a discount percentage"],
    ["free", "Buy X Get Y Free", "Give free items with purchase"],
  ];
  const selectType = (discountType) => onChange("discountType", discountType);

  return <div className="bundle-tier">
    <input type="hidden" name="bundleTierQuantity" value={tier.quantity}/><input type="hidden" name="bundleTierDiscountType" value={tier.discountType}/><input type="hidden" name="bundleTierFreeQuantity" value={tier.discountType === "free" ? tier.freeQuantity || 1 : tier.freeQuantity || 0}/><input type="hidden" name="bundleTierValue" value={tier.value}/><input type="hidden" name="bundleTierMaxBundles" value={tier.maxBundles||0}/>
    <strong>Set bundle tier {index + 1}</strong>
    <div className="bundle-save-options">
      {choices.map(([value,label,detail]) => <button key={value} className={`bundle-save-option ${tier.discountType === value ? "is-selected" : ""}`} type="button" onClick={() => selectType(value)}><span>{label}</span><small>{detail}</small></button>)}
    </div>
    <div className="bundle-grid">
      <Field label="Bundle quantity"><input className="bundle-input" type="number" min="2" value={tier.quantity} onChange={(event)=>onChange("quantity",event.target.value)}/></Field>
      <Field label={tier.discountType === "free" ? "Free quantity" : tier.discountType === "percentage" ? "Percentage off" : "Bundle price"}><input className="bundle-input" type="number" min="0" max={tier.discountType === "percentage" ? "100":undefined} value={tier.discountType === "free" ? tier.freeQuantity||1 : tier.value} onChange={(event)=>onChange(tier.discountType === "free" ? "freeQuantity" : "value",event.target.value)}/></Field>
      <Field label="Tier bundle cap (optional)"><input className="bundle-input" type="number" min="0" value={tier.maxBundles||""} onChange={(event)=>onChange("maxBundles",event.target.value)}/></Field>
    </div>
    <div className="bundle-actions"><button className="bundle-button" type="button" disabled={!index} onClick={()=>onMove(-1)}>Move up</button><button className="bundle-button" type="button" disabled={index===total-1} onClick={()=>onMove(1)}>Move down</button><button className="bundle-button" type="button" disabled={total===1} onClick={onRemove}>Remove tier</button></div>
  </div>;
}
function normalizeInitial(values) {
  const config = values?.config || DEFAULT_BUNDLE_CONFIG;
  return {
    title: values?.title || "Bundle Discount",
    startsAt: values?.startsAt || new Date().toISOString(),
    endsAt: values?.endsAt || "",
    config: {
      ...DEFAULT_BUNDLE_CONFIG,
      ...config,
      application: {...DEFAULT_BUNDLE_CONFIG.application, ...config.application},
      eligibility: {...DEFAULT_BUNDLE_CONFIG.eligibility, ...config.eligibility, selectedCollectionIds: config.eligibility?.selectedCollectionIds || config.selectedCollectionIds || []},
      combinations: {...DEFAULT_BUNDLE_CONFIG.combinations, ...config.combinations},
      messages: {...DEFAULT_BUNDLE_CONFIG.messages, ...config.messages, confirmation: config.messages?.confirmation || config.message || DEFAULT_BUNDLE_CONFIG.message},
      bundleTiers: (config.bundleTiers || DEFAULT_BUNDLE_CONFIG.bundleTiers).map((tier) => ({...tier, maxBundles: tier.maxBundles || 0})),
    },
  };
}
function toDateTimeInput(value) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; return formatDateTimeInput(date); }
function currentDateTimeInput() { return formatDateTimeInput(new Date()); }
function formatDateTimeInput(date) { const pad = (value) => String(value).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function formatScheduleTime(value) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function nextQuantity(tiers) { return Math.max(...tiers.map((tier)=>Number(tier.quantity)||1),1)+1; }
function move(items,index,direction) { const next=[...items]; const target=index+direction; if(target<0||target>=next.length)return next; [next[index],next[target]]=[next[target],next[index]]; return next; }
function splitIds(value) { return String(value||"").split(/[\n,]+/).map((item)=>item.trim()).filter(Boolean); }
function tierLabel(tier) { return tier.discountType === "percentage" ? `Buy ${tier.quantity}, ${tier.value}% off` : tier.discountType === "free" ? `Buy ${tier.quantity}, get ${tier.freeQuantity} free` : `Buy ${tier.quantity} for ${tier.value}`; }
