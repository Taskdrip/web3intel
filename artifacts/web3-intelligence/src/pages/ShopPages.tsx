import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Box, Check,
  ChevronDown, CircleDollarSign, Clipboard, Clock3, Cpu, ExternalLink, FileText,
  Filter, LockKeyhole, PackageCheck, Plus, Search, ShieldCheck, ShoppingBag,
  SlidersHorizontal, Truck, WalletCards, X,
} from 'lucide-react';
import {
  getGetAdminShopPaymentSettingsQueryKey, getGetShopPaymentInstructionsQueryKey,
  getGetShopProductQueryKey, getListAdminShopOrdersQueryKey, getListAdminShopProductsQueryKey,
  getListMyShopOrdersQueryKey, getListShopProductsQueryKey, useCreateAdminShopProduct,
  useCreateShopOrder, useGetAdminShopPaymentSettings, useGetShopPaymentInstructions,
  useGetShopProduct, useListAdminShopOrders, useListAdminShopProducts,
  useListMyShopOrders, useListShopProducts, useSubmitShopPaymentReference,
  useUpdateAdminShopOrder, useUpdateAdminShopPaymentSettings, useUpdateAdminShopProduct,
} from '@workspace/api-client-react';
import type {
  ShopOrder, ShopOrderStatus, ShopPaymentSettingsInput, ShopProduct, ShopProductInput,
} from '@workspace/api-client-react';
import { useWalletAuth } from '../components/wallet-auth';
import './ShopPages.css';

const categories = [
  'All equipment & tools', 'ASIC miners', 'Mini miners', 'Mining accessories',
  'Software', 'Scripts', 'Applications', 'Web3 & blockchain templates',
  'Accessories', 'Mining services & tools', 'Other',
] as const;

const orderStatusLabels: Record<ShopOrderStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  payment_submitted: 'Reference submitted',
  paid: 'Payment reviewed',
  processing: 'Processing',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
};

const productInitial: ShopProductInput = {
  title: '',
  category: 'ASIC miners',
  saleType: 'direct',
  fulfillment: 'physical',
  summary: '',
  description: '',
  specs: '',
  imageUrl: null,
  priceCents: null,
  priceCurrency: 'USD',
  affiliateUrl: null,
  status: 'draft',
};

function asErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const message = error.message;
    if (message.includes('401') || message.toLowerCase().includes('unauthorized')) return 'Sign in with an authorized account to continue.';
    if (message.includes('403') || message.toLowerCase().includes('forbidden')) return 'This action is restricted to marketplace administrators.';
    return message;
  }
  return 'The marketplace could not complete that request. Please try again.';
}

function formatMoney(cents: number | null | undefined, currency = 'USD') {
  if (cents === null || cents === undefined) return 'Price not listed';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(value?: string) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function ShopHeader({ section, description }: { section: string; description: string }) {
  return <div className="shop-heading">
    <div className="shop-heading-eyebrow"><span className="shop-live-dot" /> WEB3 INTELLIGENCE <span className="shop-heading-sep">/</span> MARKETPLACE</div>
    <div className="shop-heading-row">
      <div><h1>{section}</h1><p>{description}</p></div>
      <nav className="shop-quick-links" aria-label="Marketplace account links">
        <Link href="/shop/orders" className="shop-text-link" data-testid="link-shop-orders"><PackageCheck size={15} /> My orders</Link>
        <Link href="/shop/manage" className="shop-text-link" data-testid="link-shop-manage"><SlidersHorizontal size={15} /> Manage</Link>
      </nav>
    </div>
  </div>;
}

function ShopNotice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'success' | 'error' | 'warning' }) {
  return <div className={`shop-notice shop-notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

function ShopLoading({ label = 'Loading marketplace' }: { label?: string }) {
  return <div className="shop-skeleton-grid" role="status" aria-label={label} data-testid="status-shop-loading">
    {Array.from({ length: 4 }, (_, index) => <div className="shop-skeleton-card" key={index}>
      <div className="shop-skeleton-art" /><div className="shop-skeleton-line short" /><div className="shop-skeleton-line" /><div className="shop-skeleton-line medium" />
    </div>)}
  </div>;
}

function ProductVisual({ product }: { product: ShopProduct }) {
  const mark = product.category === 'ASIC miners' ? '01' : product.category === 'Mini miners' ? '02' : product.fulfillment === 'digital' ? '03' : '04';
  return <div className="shop-product-visual" role="img" aria-label={`${product.title}; illustrative product image`}>
    <span className="shop-visual-index">FIELD NOTE / {mark}</span>
    {!product.imageUrl && <div className="shop-visual-emblem"><Cpu size={36} strokeWidth={1.15} /></div>}
    {product.imageUrl && <img
      className="shop-product-image"
      src={product.imageUrl}
      alt=""
      loading="lazy"
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
    />}
    <span className="shop-visual-image-note">ILLUSTRATIVE IMAGE · VERIFY EXACT ITEM</span>
    <span className="shop-visual-category">{product.category}</span>
    <span className="shop-visual-grid" />
  </div>;
}

function ProductCard({ product }: { product: ShopProduct }) {
  const isAffiliate = product.saleType === 'affiliate';
  return <article className="shop-product-card" data-testid={`card-shop-product-${product.id}`}>
    <Link href={`/shop/${product.slug}`} className="shop-card-link" aria-label={`View ${product.title}`} data-testid={`link-product-${product.id}`}>
      <ProductVisual product={product} />
      <div className="shop-card-body">
        <div className="shop-card-topline"><span className="shop-category-label">{product.category}</span><span className={`shop-sale-chip ${isAffiliate ? 'affiliate' : 'direct'}`}>{isAffiliate ? 'Referral' : 'Direct'}</span></div>
        <h2>{product.title}</h2>
        <p className="shop-card-summary">{product.summary}</p>
        <div className="shop-card-footer">
          <span className="shop-price">{formatMoney(product.priceCents, product.priceCurrency)}</span>
          <span className="shop-card-arrow" aria-hidden="true"><ArrowRight size={16} /></span>
        </div>
      </div>
    </Link>
    {isAffiliate && <div className="shop-referral-caption"><ExternalLink size={12} /> Referral link · merchant checkout</div>}
  </article>;
}

export function ShopPage() {
  const productsQuery = useListShopProducts();
  const [category, setCategory] = useState<string>(categories[0]);
  const [saleType, setSaleType] = useState<'all' | 'direct' | 'affiliate'>('all');
  const [search, setSearch] = useState('');
  const products = productsQuery.data ?? [];
  const filtered = useMemo(() => products.filter((product) => {
    const matchesCategory = category === categories[0] || product.category === category;
    const matchesSale = saleType === 'all' || product.saleType === saleType;
    const matchesSearch = `${product.title} ${product.category} ${product.summary}`.toLowerCase().includes(search.toLowerCase().trim());
    return matchesCategory && matchesSale && matchesSearch;
  }), [category, products, saleType, search]);

  return <div className="shop-page">
    <ShopHeader section="Tools for the work." description="A considered shelf of mining equipment and Web3 tools, inside your research terminal." />
    <section className="shop-intro-band">
      <div className="shop-intro-copy"><span className="shop-section-index">01 / THE SHOP</span><h2>Buy directly.<br /><em>Or follow the source.</em></h2>
        <p>Every listing tells you who handles checkout. Direct orders are reviewed by our team; referral links take you to the original merchant.</p>
      </div>
      <div className="shop-intro-aside"><div className="shop-trust-mark"><ShieldCheck size={18} /><span>Clear route to checkout</span></div><div className="shop-route-legend"><span><i className="route-dot direct-dot" /> Direct order</span><span><i className="route-dot referral-dot" /> Merchant referral</span></div></div>
      <span className="shop-intro-watermark" aria-hidden="true">W3</span>
    </section>
    <div className="shop-toolbar">
      <label className="shop-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search equipment and tools" aria-label="Search marketplace products" data-testid="input-shop-search" /></label>
      <label className="shop-filter"><Filter size={14} /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by product category" data-testid="select-shop-category">
        {categories.map((item) => <option key={item} value={item}>{item}</option>)}
      </select><ChevronDown size={13} /></label>
      <div className="shop-sale-filters" role="group" aria-label="Checkout type">
        {(['all', 'direct', 'affiliate'] as const).map((type) => <button key={type} type="button" className={saleType === type ? 'active' : ''} onClick={() => setSaleType(type)} data-testid={`filter-shop-${type}`}>{type === 'all' ? 'All routes' : type === 'direct' ? 'Direct' : 'Referral'}</button>)}
      </div>
    </div>
    {productsQuery.isLoading ? <ShopLoading label="Loading products" /> :
      productsQuery.isError ? <ShopNotice kind="error"><AlertCircle size={17} /><span>Listings are unavailable. {asErrorMessage(productsQuery.error)}</span><button type="button" onClick={() => productsQuery.refetch()} data-testid="button-retry-shop-products">Retry</button></ShopNotice> :
        filtered.length > 0 ? <>
          <div className="shop-results-line"><span><strong>{filtered.length}</strong> {filtered.length === 1 ? 'listing' : 'listings'} <span className="shop-muted">from the marketplace catalog</span></span><span>Checkout type shown on every listing</span></div>
          <section className="shop-product-grid" aria-label="Marketplace product listings">{filtered.map((product) => <ProductCard key={product.id} product={product} />)}</section>
        </> : <div className="shop-empty panel-like" data-testid="empty-shop-products"><div className="shop-empty-icon"><Search size={21} /></div><span className="shop-section-index">{products.length ? 'NO MATCHES' : 'CATALOG QUIET'}</span><h2>{products.length ? 'Nothing in this part of the shelf.' : 'No active listings yet.'}</h2><p>{products.length ? 'Try a different category or clear your search.' : 'Published equipment and tools will appear here when the catalog is ready.'}</p>{(search || category !== categories[0] || saleType !== 'all') && <button className="shop-button secondary" type="button" onClick={() => { setSearch(''); setCategory(categories[0]); setSaleType('all'); }} data-testid="button-clear-shop-filters">Clear filters</button>}</div>}
    <footer className="shop-page-foot"><span>Web3 Intelligence / Marketplace</span><span>Referral links are disclosed. Product details are supplied by each listing.</span></footer>
  </div>;
}

function OrderForm({ product }: { product: ShopProduct }) {
  const client = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const walletAuth = useWalletAuth();
  const createOrder = useCreateShopOrder();
  const [submittedOrder, setSubmittedOrder] = useState<ShopOrder | null>(null);
  const [formError, setFormError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const instructionsQuery = useGetShopPaymentInstructions();
  const instructions = instructionsQuery.data;
  const isSignedInToApp = Boolean(isSignedIn || walletAuth.session.authenticated);
  const isPhysical = product.fulfillment === 'physical';
  const priceUnavailable = product.priceCents === null;

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const form = new FormData(event.currentTarget);
    const orderData = {
      productId: product.id,
      quantity,
      customerName: String(form.get('customerName') ?? '').trim(),
      customerEmail: String(form.get('customerEmail') ?? '').trim(),
      ...(isPhysical ? {
        shippingAddress: String(form.get('shippingAddress') ?? '').trim(),
        shippingCity: String(form.get('shippingCity') ?? '').trim(),
        shippingRegion: String(form.get('shippingRegion') ?? '').trim(),
        shippingPostalCode: String(form.get('shippingPostalCode') ?? '').trim(),
        shippingCountry: String(form.get('shippingCountry') ?? '').trim(),
      } : {}),
    };
    createOrder.mutate({ data: orderData }, {
      onSuccess: (order) => {
        setSubmittedOrder(order);
        void client.invalidateQueries({ queryKey: getListMyShopOrdersQueryKey() });
      },
      onError: (error) => setFormError(asErrorMessage(error)),
    });
  }

  if (submittedOrder) return <section className="shop-checkout-result" data-testid="status-shop-order-created">
    <div className="shop-success-icon"><Check size={20} /></div><span className="shop-section-index">ORDER RECEIVED</span>
    <h3>Order {submittedOrder.orderNumber} is on its way to review.</h3>
    <p>Payment is not verified automatically. Use the manual instructions below, then submit your payment reference for a person to review.</p>
    <div className="shop-order-total"><span>Order total</span><strong>{formatMoney(submittedOrder.unitPriceCents * submittedOrder.quantity, submittedOrder.currency)}</strong></div>
    <Link className="shop-button primary" href="/shop/orders" data-testid="link-created-order"><PackageCheck size={15} /> View my orders</Link>
    {instructionsQuery.isLoading ? <div className="shop-inline-loading">Loading payment instructions…</div> : instructionsQuery.isError ? <ShopNotice kind="error"><AlertCircle size={16} /> Payment instructions could not be loaded. <button type="button" onClick={() => instructionsQuery.refetch()}>Retry</button></ShopNotice> : instructions?.configured && <PaymentInstructions instructions={instructions} />}
  </section>;

  if (!isLoaded || walletAuth.isLoading) return <section className="shop-checkout"><div className="shop-inline-loading" role="status">Checking your account…</div></section>;
  if (!isSignedInToApp) return <section className="shop-checkout">
    <div className="shop-checkout-head"><div><span className="shop-section-index">DIRECT ORDER</span><h2>Sign in to place an order</h2></div><span className="shop-checkout-total">{formatMoney(product.priceCents, product.priceCurrency)}</span></div>
    <ShopNotice kind="info"><LockKeyhole size={15} /> Direct orders are tied to an account so you can follow payment review and fulfillment.</ShopNotice>
    <Link className="shop-button primary shop-sign-in-cta" href="/sign-in" data-testid="link-shop-checkout-sign-in">Sign in to continue <ArrowRight size={14} /></Link>
  </section>;

  const checkoutUnavailable = priceUnavailable || instructionsQuery.isLoading || instructionsQuery.isError || !instructions?.configured;
  return <section className="shop-checkout">
    <div className="shop-checkout-head"><div><span className="shop-section-index">DIRECT ORDER</span><h2>Start your order</h2></div><span className="shop-checkout-total">{formatMoney(product.priceCents, product.priceCurrency)}</span></div>
    {priceUnavailable && <ShopNotice kind="warning"><CircleDollarSign size={16} /> This listing has no price set, so checkout is unavailable. Contact the marketplace team for details.</ShopNotice>}
    {instructionsQuery.isError && !instructionsQuery.isLoading && <ShopNotice kind="warning"><AlertCircle size={16} /> Checkout instructions are currently unavailable. <button type="button" onClick={() => instructionsQuery.refetch()} data-testid="button-retry-payment-instructions">Retry</button></ShopNotice>}
    {instructions && !instructions.configured && <ShopNotice kind="warning"><WalletCards size={16} /> Checkout is not available until an administrator configures the public receiving address and payment instructions.</ShopNotice>}
    <form className="shop-form" onSubmit={submitOrder}>
      <div className="shop-form-grid">
        <label className="shop-field"><span>Name</span><input name="customerName" required minLength={2} maxLength={140} placeholder="Your name" data-testid="input-order-name" /></label>
        <label className="shop-field"><span>Email</span><input name="customerEmail" type="email" required maxLength={254} placeholder="you@example.com" data-testid="input-order-email" /></label>
        {isPhysical && <>
          <label className="shop-field shop-field-wide"><span>Shipping address</span><input name="shippingAddress" required minLength={5} maxLength={300} placeholder="Street and number" data-testid="input-order-address" /></label>
          <label className="shop-field"><span>City</span><input name="shippingCity" required minLength={2} maxLength={100} data-testid="input-order-city" /></label>
          <label className="shop-field"><span>Region / state</span><input name="shippingRegion" maxLength={100} data-testid="input-order-region" /></label>
          <label className="shop-field"><span>Postal code</span><input name="shippingPostalCode" maxLength={40} data-testid="input-order-postal" /></label>
          <label className="shop-field"><span>Country</span><input name="shippingCountry" required minLength={2} maxLength={100} data-testid="input-order-country" /></label>
        </>}
        <label className="shop-field shop-quantity"><span>Quantity</span><select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} data-testid="select-order-quantity">{Array.from({ length: 10 }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      {formError && <ShopNotice kind="error"><AlertCircle size={16} />{formError}</ShopNotice>}
      {createOrder.isError && !formError && <ShopNotice kind="error"><AlertCircle size={16} />{asErrorMessage(createOrder.error)}</ShopNotice>}
      <div className="shop-form-foot"><span><LockKeyhole size={13} /> You send crypto yourself; a person reviews the transaction reference.</span><button className="shop-button primary" type="submit" disabled={createOrder.isPending || checkoutUnavailable} data-testid="button-create-shop-order">{createOrder.isPending ? 'Sending order…' : checkoutUnavailable ? 'Checkout unavailable' : 'Place direct order'} <ArrowRight size={15} /></button></div>
    </form>
    {instructionsQuery.isLoading && <div className="shop-inline-loading">Loading manual payment details…</div>}
    {instructions?.configured && <PaymentInstructions instructions={instructions} />}
  </section>;
}

function PaymentInstructions({ instructions }: { instructions: { asset: string; network: string; receivingAddress: string; instructions: string } }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(instructions.receivingAddress);
      setCopied(true);
      setCopyError('');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError('Copy unavailable here. Select and copy the address manually.');
    }
  }
  return <div className="shop-payment-instructions" data-testid="panel-payment-instructions">
    <div className="shop-payment-title"><WalletCards size={16} /><div><strong>Manual crypto payment</strong><span>Payment is not checked automatically.</span></div></div>
    <div className="shop-payment-meta"><span>{instructions.asset}</span><i>/</i><span>{instructions.network}</span></div>
    <div className="shop-address-row"><code>{instructions.receivingAddress}</code><button type="button" onClick={() => void copyAddress()} aria-label="Copy receiving address" data-testid="button-copy-payment-address">{copied ? <Check size={15} /> : <Clipboard size={15} />}<span>{copied ? 'Copied' : 'Copy'}</span></button></div>
    {instructions.instructions && <p>{instructions.instructions}</p>}
    {copyError && <span className="shop-copy-error" role="status">{copyError}</span>}
    <div className="shop-manual-warning"><AlertCircle size={14} /> Verify the asset and network before sending. Only submit a reference after you have made the transfer.</div>
  </div>;
}

export function ShopProductPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? '';
  const productQuery = useGetShopProduct(slug, { query: { enabled: Boolean(slug), queryKey: getGetShopProductQueryKey(slug) } });
  const product = productQuery.data;

  return <div className="shop-page">
    <div className="shop-back-row"><Link href="/shop" className="shop-back-link" data-testid="link-back-shop"><ArrowLeft size={15} /> Back to marketplace</Link><span>LISTING / {slug || '—'}</span></div>
    {productQuery.isLoading ? <div className="shop-product-detail-skeleton"><div /><div><span /><span /><span /></div></div> :
      productQuery.isError ? <ShopNotice kind="error"><AlertCircle size={17} /><span>We couldn’t load this listing. {asErrorMessage(productQuery.error)}</span><button type="button" onClick={() => productQuery.refetch()} data-testid="button-retry-shop-product">Retry</button></ShopNotice> :
        !product ? <div className="shop-empty panel-like" data-testid="empty-shop-product"><span className="shop-section-index">LISTING NOT FOUND</span><h2>This listing is not available.</h2><p>It may have been removed or the address may be incorrect.</p><Link className="shop-button secondary" href="/shop">Return to marketplace</Link></div> :
          <div className="shop-detail-layout">
            <div className="shop-detail-main">
              <div className="shop-detail-visual"><ProductVisual product={product} /></div>
              <div className="shop-detail-overview">
                <div className="shop-detail-labels"><span className="shop-category-label">{product.category}</span><span className={`shop-sale-chip ${product.saleType}`}>{product.saleType === 'affiliate' ? 'Referral listing' : 'Direct listing'}</span><span className="shop-fulfillment">{product.fulfillment === 'physical' ? <Truck size={13} /> : <FileText size={13} />}{product.fulfillment}</span></div>
                <h1>{product.title}</h1><p className="shop-detail-summary">{product.summary}</p>
                <div className="shop-detail-description">{product.description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
              </div>
              {product.specs.trim() && <section className="shop-specs">
                <div className="shop-subsection-heading"><span className="shop-section-index">LISTING DETAILS</span><h2>Specifications supplied</h2></div>
                <div className="shop-specs-copy">{product.specs.split('\n').filter(Boolean).map((line, index) => <div key={`${line}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{line}</p></div>)}</div>
              </section>}
              <div className="shop-detail-updated"><Clock3 size={13} /> Listing updated {formatDate(product.updatedAt)}</div>
            </div>
            <aside className="shop-detail-aside">
              <div className="shop-buy-card">
                <span className="shop-section-index">{product.saleType === 'affiliate' ? 'MERCHANT REFERRAL' : 'DIRECT FROM MARKETPLACE'}</span>
                <div className="shop-detail-price">{formatMoney(product.priceCents, product.priceCurrency)}</div>
                {product.saleType === 'affiliate' ? <>
                  <ShopNotice kind="info"><ExternalLink size={15} /> This is a referral link. The merchant handles checkout, payment, and fulfillment.</ShopNotice>
                  {product.affiliateUrl ? <a className="shop-button primary shop-affiliate-cta" href={product.affiliateUrl} target="_blank" rel="noopener noreferrer" data-testid="link-affiliate-destination">Continue to merchant <ArrowUpRight size={15} /></a> : <ShopNotice kind="warning"><AlertCircle size={15} /> Merchant destination is not available for this listing.</ShopNotice>}
                  <p className="shop-affiliate-disclosure">We may receive a referral commission if you purchase through this link. Your price is determined by the merchant.</p>
                </> : <>
                  <div className="shop-direct-promise"><BadgeCheck size={15} /><span>Order placed with the marketplace. Payment references are reviewed by a person.</span></div>
                  {product.priceCents === null && <ShopNotice kind="warning"><CircleDollarSign size={15} /> Pricing has not been listed for this item.</ShopNotice>}
                  <OrderForm product={product} />
                </>}
              </div>
              <div className="shop-aside-foot"><ShieldCheck size={15} /><span>Checkout route is identified before you leave this listing.</span></div>
            </aside>
          </div>}
  </div>;
}

function OrderPaymentReference({ order, onSaved }: { order: ShopOrder; onSaved: () => void }) {
  const submitReference = useSubmitShopPaymentReference();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    submitReference.mutate({ id: order.id, data: { paymentReference: reference.trim() } }, {
      onSuccess: () => { setOpen(false); setReference(''); onSaved(); },
      onError: (reason) => setError(asErrorMessage(reason)),
    });
  }
  if (order.status !== 'awaiting_payment') return null;
  return <div className="shop-reference-area">
    {!open ? <button type="button" className="shop-button secondary compact" onClick={() => setOpen(true)} data-testid={`button-submit-reference-${order.id}`}>Submit payment reference <ArrowRight size={14} /></button> :
      <form className="shop-reference-form" onSubmit={submit}>
        <label className="shop-field"><span>Transaction reference / ID</span><input value={reference} onChange={(event) => setReference(event.target.value)} minLength={8} maxLength={300} required placeholder="Paste the reference from your wallet or exchange" data-testid={`input-payment-reference-${order.id}`} /></label>
        <p>A submitted reference means awaiting human review. It does not confirm payment.</p>
        {error && <ShopNotice kind="error"><AlertCircle size={14} />{error}</ShopNotice>}
        {submitReference.isError && !error && <ShopNotice kind="error"><AlertCircle size={14} />{asErrorMessage(submitReference.error)}</ShopNotice>}
        <div className="shop-reference-actions"><button type="button" className="shop-button secondary compact" onClick={() => { setOpen(false); setError(''); }}>Cancel</button><button type="submit" className="shop-button primary compact" disabled={submitReference.isPending} data-testid={`button-send-reference-${order.id}`}>{submitReference.isPending ? 'Submitting…' : 'Send for review'}</button></div>
      </form>}
  </div>;
}

export function ShopOrdersPage() {
  const client = useQueryClient();
  const ordersQuery = useListMyShopOrders();
  const instructionsQuery = useGetShopPaymentInstructions();
  const orders = ordersQuery.data ?? [];
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const refreshOrders = () => { void client.invalidateQueries({ queryKey: getListMyShopOrdersQueryKey() }); };
  return <div className="shop-page">
    <ShopHeader section="Your orders." description="A clear record of direct purchases and their human-reviewed payment status." />
    <div className="shop-orders-tools"><Link href="/shop" className="shop-back-link"><ArrowLeft size={15} /> Browse the marketplace</Link>
      <button type="button" className="shop-button secondary compact" onClick={() => setInstructionsOpen((open) => !open)} data-testid="button-toggle-payment-instructions"><WalletCards size={14} /> {instructionsOpen ? 'Hide payment details' : 'Payment details'}</button>
    </div>
    {instructionsOpen && (instructionsQuery.isLoading ? <div className="shop-inline-loading">Loading payment instructions…</div> : instructionsQuery.isError ? <ShopNotice kind="error"><AlertCircle size={15} />{asErrorMessage(instructionsQuery.error)} <button type="button" onClick={() => instructionsQuery.refetch()}>Retry</button></ShopNotice> : instructionsQuery.data?.configured ? <PaymentInstructions instructions={instructionsQuery.data} /> : <ShopNotice kind="warning"><WalletCards size={15} />Manual payment details are not configured.</ShopNotice>)}
    {ordersQuery.isLoading ? <div className="shop-order-skeleton" role="status" aria-label="Loading your orders"><div /><div /><div /></div> :
      ordersQuery.isError ? <ShopNotice kind="error"><AlertCircle size={17} /><span>Orders could not be loaded. {asErrorMessage(ordersQuery.error)}</span><button type="button" onClick={() => ordersQuery.refetch()} data-testid="button-retry-my-orders">Retry</button></ShopNotice> :
        orders.length === 0 ? <div className="shop-empty panel-like" data-testid="empty-my-shop-orders"><div className="shop-empty-icon"><ShoppingBag size={20} /></div><span className="shop-section-index">NO ORDERS YET</span><h2>Your next step starts with a listing.</h2><p>Direct marketplace orders will be recorded here. Referral purchases are managed by the merchant.</p><Link className="shop-button primary" href="/shop"><ShoppingBag size={15} /> Browse equipment & tools</Link></div> :
          <section className="shop-order-list" aria-label="Your marketplace orders">{orders.map((order) => <article key={order.id} className="shop-order-card" data-testid={`card-my-order-${order.id}`}>
            <div className="shop-order-main"><div className="shop-order-id"><span>{order.orderNumber}</span><span>Placed {formatDate(order.createdAt)}</span></div><h2>{order.productTitle}</h2><div className="shop-order-meta"><span>Qty {order.quantity}</span><i /> <span>{formatMoney(order.unitPriceCents * order.quantity, order.currency)}</span></div></div>
            <div className="shop-order-state"><span className={`shop-status-pill ${order.status}`} data-testid={`status-my-order-${order.id}`}><i />{orderStatusLabels[order.status]}</span>{order.paymentReference && <span className="shop-reference-display">Reference: <code>{order.paymentReference}</code></span>}<OrderPaymentReference order={order} onSaved={refreshOrders} /></div>
            {order.status === 'payment_submitted' && <div className="shop-review-note"><Clock3 size={14} /> Reference received; a human review is still pending. This is not an automatic payment confirmation.</div>}
          </article>)}</section>}
  </div>;
}

function AdminProductForm({ product, onClose, onSaved }: { product: ShopProduct | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ShopProductInput>(product ? {
    title: product.title, category: product.category, saleType: product.saleType,
    fulfillment: product.fulfillment, summary: product.summary, description: product.description,
    specs: product.specs, imageUrl: product.imageUrl, priceCents: product.priceCents, priceCurrency: product.priceCurrency,
    affiliateUrl: product.affiliateUrl, status: product.status,
  } : productInitial);
  const [priceInput, setPriceInput] = useState(product?.priceCents === null || product?.priceCents === undefined ? '' : (product.priceCents / 100).toFixed(2));
  const [saveError, setSaveError] = useState('');
  const createProduct = useCreateAdminShopProduct();
  const updateProduct = useUpdateAdminShopProduct();
  const saving = createProduct.isPending || updateProduct.isPending;
  function patch<K extends keyof ShopProductInput>(key: K, value: ShopProductInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError('');
    const cents = priceInput.trim() ? Math.round(Number(priceInput) * 100) : null;
    if (priceInput.trim() && (cents === null || !Number.isFinite(cents) || cents < 0)) {
      setSaveError('Enter a valid non-negative price, or leave it blank.');
      return;
    }
    const data: ShopProductInput = {
      ...form,
      priceCents: cents,
      priceCurrency: form.priceCurrency.trim().toUpperCase(),
      specs: form.specs?.trim() || '',
      imageUrl: form.imageUrl?.trim() || null,
      affiliateUrl: form.saleType === 'affiliate' ? (form.affiliateUrl?.trim() || null) : null,
    };
    const onError = (error: unknown) => setSaveError(asErrorMessage(error));
    if (product) updateProduct.mutate({ id: product.id, data }, { onSuccess: () => { onSaved(); onClose(); }, onError });
    else createProduct.mutate({ data }, { onSuccess: () => { onSaved(); onClose(); }, onError });
  }
  return <form className="shop-admin-form" onSubmit={submit} data-testid="form-admin-product">
    <div className="shop-admin-form-head"><div><span className="shop-section-index">{product ? 'EDIT LISTING' : 'NEW LISTING'}</span><h3>{product ? product.title : 'Add a listing'}</h3></div><button type="button" className="shop-icon-button" onClick={onClose} aria-label="Close product editor" data-testid="button-close-product-editor"><X size={16} /></button></div>
    <div className="shop-form-grid">
      <label className="shop-field shop-field-wide"><span>Title</span><input required minLength={2} maxLength={140} value={form.title} onChange={(event) => patch('title', event.target.value)} data-testid="input-admin-product-title" /></label>
      <label className="shop-field"><span>Category</span><select value={form.category} onChange={(event) => patch('category', event.target.value)} data-testid="select-admin-product-category">{categories.slice(1).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="shop-field"><span>Status</span><select value={form.status} onChange={(event) => patch('status', event.target.value as ShopProductInput['status'])} data-testid="select-admin-product-status"><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
      <label className="shop-field"><span>Checkout route</span><select value={form.saleType} onChange={(event) => patch('saleType', event.target.value as ShopProductInput['saleType'])} data-testid="select-admin-sale-type"><option value="direct">Direct order</option><option value="affiliate">Merchant referral</option></select></label>
      <label className="shop-field"><span>Fulfillment</span><select value={form.fulfillment} onChange={(event) => patch('fulfillment', event.target.value as ShopProductInput['fulfillment'])} data-testid="select-admin-fulfillment"><option value="physical">Physical</option><option value="digital">Digital</option></select></label>
      <label className="shop-field"><span>Price</span><input inputMode="decimal" type="number" min="0" step="0.01" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} placeholder="Leave blank for not listed" data-testid="input-admin-price" /></label>
      <label className="shop-field"><span>Currency code</span><input required minLength={3} maxLength={3} value={form.priceCurrency} onChange={(event) => patch('priceCurrency', event.target.value.toUpperCase())} data-testid="input-admin-currency" /></label>
      <label className="shop-field shop-field-wide"><span>Short summary</span><input required minLength={10} maxLength={300} value={form.summary} onChange={(event) => patch('summary', event.target.value)} data-testid="input-admin-summary" /></label>
      <label className="shop-field shop-field-wide"><span>Description</span><textarea required minLength={20} maxLength={10000} rows={5} value={form.description} onChange={(event) => patch('description', event.target.value)} data-testid="input-admin-description" /></label>
      <label className="shop-field shop-field-wide"><span>Specifications as supplied</span><textarea maxLength={4000} rows={3} value={form.specs ?? ''} onChange={(event) => patch('specs', event.target.value)} placeholder="Only add details confirmed by the source." data-testid="input-admin-specs" /></label>
      <label className="shop-field shop-field-wide"><span>Product image URL</span><input maxLength={1000} value={form.imageUrl ?? ''} onChange={(event) => patch('imageUrl', event.target.value || null)} placeholder="https://… or /shop/your-image.webp" data-testid="input-admin-image-url" /><small>Use an HTTPS image URL or a local image under /shop/.</small></label>
      {form.saleType === 'affiliate' && <label className="shop-field shop-field-wide"><span>Merchant destination URL</span><input type="url" value={form.affiliateUrl ?? ''} onChange={(event) => patch('affiliateUrl', event.target.value || null)} placeholder="https://" data-testid="input-admin-affiliate-url" /></label>}
    </div>
    {saveError && <ShopNotice kind="error"><AlertCircle size={15} />{saveError}</ShopNotice>}
    {(createProduct.isError || updateProduct.isError) && !saveError && <ShopNotice kind="error"><AlertCircle size={15} />{asErrorMessage(createProduct.error ?? updateProduct.error)}</ShopNotice>}
    <div className="shop-admin-form-actions"><button className="shop-button secondary" type="button" onClick={onClose}>Cancel</button><button className="shop-button primary" type="submit" disabled={saving} data-testid="button-save-admin-product">{saving ? 'Saving…' : product ? 'Save listing' : 'Create listing'} <Check size={14} /></button></div>
  </form>;
}

export function ShopManagePage() {
  const client = useQueryClient();
  const productsQuery = useListAdminShopProducts();
  const ordersQuery = useListAdminShopOrders();
  const settingsQuery = useGetAdminShopPaymentSettings();
  const updateSettings = useUpdateAdminShopPaymentSettings();
  const updateOrder = useUpdateAdminShopOrder();
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'catalog' | 'orders' | 'payments'>('catalog');
  const [settingsForm, setSettingsForm] = useState<ShopPaymentSettingsInput>({ asset: '', network: '', receivingAddress: '', instructions: '' });
  const [settingsError, setSettingsError] = useState('');
  const [orderError, setOrderError] = useState('');
  const [statusDrafts, setStatusDrafts] = useState<Record<number, ShopOrderStatus>>({});
  useEffect(() => {
    if (settingsQuery.data) setSettingsForm({
      asset: settingsQuery.data.asset, network: settingsQuery.data.network,
      receivingAddress: settingsQuery.data.receivingAddress, instructions: settingsQuery.data.instructions,
    });
  }, [settingsQuery.data]);

  function invalidateProducts() {
    void client.invalidateQueries({ queryKey: getListAdminShopProductsQueryKey() });
    void client.invalidateQueries({ queryKey: getListShopProductsQueryKey() });
  }
  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsError('');
    updateSettings.mutate({ data: settingsForm }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getGetAdminShopPaymentSettingsQueryKey() });
        void client.invalidateQueries({ queryKey: getGetShopPaymentInstructionsQueryKey() });
      },
      onError: (error) => setSettingsError(asErrorMessage(error)),
    });
  }
  function saveOrderStatus(order: ShopOrder) {
    setOrderError('');
    const status = statusDrafts[order.id] ?? order.status;
    updateOrder.mutate({ id: order.id, data: { status } }, {
      onSuccess: () => {
        setStatusDrafts((current) => { const next = { ...current }; delete next[order.id]; return next; });
        void client.invalidateQueries({ queryKey: getListAdminShopOrdersQueryKey() });
        void client.invalidateQueries({ queryKey: getListMyShopOrdersQueryKey() });
      },
      onError: (error) => setOrderError(asErrorMessage(error)),
    });
  }
  function openEditor(product: ShopProduct | null) {
    setEditingProduct(product);
    setEditorOpen(true);
  }
  const products = productsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];

  return <div className="shop-page shop-manage-page">
    <ShopHeader section="Marketplace control." description="Maintain the catalog, configure manual payment details, and review direct orders." />
    <div className="shop-admin-banner"><div className="shop-admin-banner-mark"><SlidersHorizontal size={17} /></div><div><strong>Admin workspace</strong><span>Product links, checkout instructions, and human order review.</span></div><span className="shop-admin-boundary"><LockKeyhole size={13} /> Administrator access required</span></div>
    <div className="shop-admin-tabs" role="tablist" aria-label="Marketplace management sections">
      {([
        ['catalog', 'Product catalog', Box],
        ['orders', 'Order review', PackageCheck],
        ['payments', 'Payment settings', WalletCards],
      ] as const).map(([tab, label, Icon]) => <button key={tab} type="button" role="tab" aria-selected={selectedTab === tab} className={selectedTab === tab ? 'active' : ''} onClick={() => setSelectedTab(tab)} data-testid={`tab-manage-${tab}`}><Icon size={15} />{label}{tab === 'orders' && orders.length > 0 && <span>{orders.length}</span>}</button>)}
    </div>
    {selectedTab === 'catalog' && <section className="shop-admin-section">
      <div className="shop-admin-section-head"><div><span className="shop-section-index">01 / CATALOG</span><h2>Listings and destinations</h2><p>Draft, publish, or archive items. Affiliate listings send buyers to a merchant destination.</p></div><button className="shop-button primary" type="button" onClick={() => openEditor(null)} data-testid="button-add-shop-product"><Plus size={15} /> Add product</button></div>
      {editorOpen && <AdminProductForm key={editingProduct?.id ?? 'new'} product={editingProduct} onClose={() => setEditorOpen(false)} onSaved={invalidateProducts} />}
      {productsQuery.isLoading ? <div className="shop-admin-list-skeleton" role="status" aria-label="Loading admin product catalog"><div /><div /><div /></div> :
        productsQuery.isError ? <ShopNotice kind="error"><AlertCircle size={16} />Catalog unavailable. {asErrorMessage(productsQuery.error)} <button type="button" onClick={() => productsQuery.refetch()}>Retry</button></ShopNotice> :
          products.length ? <div className="shop-admin-product-list">{products.map((product) => <article className="shop-admin-product" key={product.id} data-testid={`row-admin-product-${product.id}`}>
            <div className="shop-admin-product-symbol"><Cpu size={17} /></div><div className="shop-admin-product-copy"><div><span className={`shop-status-pill product-${product.status}`}><i />{product.status}</span><span className="shop-admin-type">{product.saleType === 'affiliate' ? 'Merchant referral' : 'Direct order'}</span></div><strong>{product.title}</strong><span>{product.category} · {formatMoney(product.priceCents, product.priceCurrency)}{product.saleType === 'affiliate' ? ` · ${product.affiliateUrl ? 'Destination set' : 'No destination'}` : ''}</span></div><button type="button" className="shop-button secondary compact" onClick={() => openEditor(product)} data-testid={`button-edit-product-${product.id}`}>Edit listing <ArrowRight size={13} /></button>
          </article>)}</div> : <div className="shop-admin-empty"><Box size={18} /><strong>The catalog is empty.</strong><span>Add a listing to begin publishing products.</span></div>}
    </section>}
    {selectedTab === 'orders' && <section className="shop-admin-section">
      <div className="shop-admin-section-head"><div><span className="shop-section-index">02 / HUMAN REVIEW</span><h2>Direct order queue</h2><p>Submitted references are evidence for review, not automatic payment confirmation.</p></div><button className="shop-button secondary compact" type="button" onClick={() => ordersQuery.refetch()} data-testid="button-refresh-admin-orders"><Clock3 size={13} /> Refresh queue</button></div>
      {orderError && <ShopNotice kind="error"><AlertCircle size={15} />{orderError}</ShopNotice>}
      {(updateOrder.isError && !orderError) && <ShopNotice kind="error"><AlertCircle size={15} />{asErrorMessage(updateOrder.error)}</ShopNotice>}
      {ordersQuery.isLoading ? <div className="shop-admin-list-skeleton" role="status" aria-label="Loading order review"><div /><div /></div> :
        ordersQuery.isError ? <ShopNotice kind="error"><AlertCircle size={16} />Order queue unavailable. {asErrorMessage(ordersQuery.error)} <button type="button" onClick={() => ordersQuery.refetch()}>Retry</button></ShopNotice> :
          orders.length === 0 ? <div className="shop-admin-empty"><PackageCheck size={18} /><strong>No direct orders to review.</strong><span>New orders will appear here for payment and fulfillment review.</span></div> :
            <div className="shop-admin-order-list">{orders.map((order) => <article className="shop-admin-order" key={order.id} data-testid={`row-admin-order-${order.id}`}>
              <div className="shop-admin-order-head"><div><span className="shop-section-index">{order.orderNumber} · {formatDate(order.createdAt)}</span><h3>{order.productTitle}</h3></div><span className={`shop-status-pill ${order.status}`}><i />{orderStatusLabels[order.status]}</span></div>
              <div className="shop-admin-order-details">
                <div><span>Customer</span><strong>{order.customerName}</strong><a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a></div>
                <div><span>Order total</span><strong>{formatMoney(order.unitPriceCents * order.quantity, order.currency)}</strong><small>Quantity {order.quantity}</small></div>
                <div><span>Payment reference</span><strong className="shop-admin-ref">{order.paymentReference || 'Not submitted'}</strong><small>{order.status === 'payment_submitted' ? 'Requires human review' : 'No automatic payment check'}</small></div>
                {order.shippingAddress && <div><span>Shipping</span><strong>{order.shippingAddress}</strong><small>{[order.shippingCity, order.shippingRegion, order.shippingPostalCode, order.shippingCountry].filter(Boolean).join(', ')}</small></div>}
              </div>
              <div className="shop-admin-order-actions"><label className="shop-status-select"><span>Update status</span><select value={statusDrafts[order.id] ?? order.status} onChange={(event) => setStatusDrafts((current) => ({ ...current, [order.id]: event.target.value as ShopOrderStatus }))} data-testid={`select-admin-order-status-${order.id}`}>{Object.entries(orderStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="shop-button primary compact" type="button" onClick={() => saveOrderStatus(order)} disabled={updateOrder.isPending || !statusDrafts[order.id] || statusDrafts[order.id] === order.status} data-testid={`button-save-order-status-${order.id}`}>Save review status <Check size={13} /></button></div>
            </article>)}</div>}
    </section>}
    {selectedTab === 'payments' && <section className="shop-admin-section shop-payment-settings-section">
      <div className="shop-admin-section-head"><div><span className="shop-section-index">03 / MANUAL PAYMENT</span><h2>Receiving instructions</h2><p>These details are shown to direct-order customers. Transfers are never initiated or verified here.</p></div><span className={`shop-configured-chip ${settingsQuery.data ? 'configured' : ''}`}>{settingsQuery.isLoading ? 'Checking settings' : settingsQuery.isError ? 'Access unavailable' : settingsQuery.data ? 'Settings loaded' : 'Not configured'}</span></div>
      {settingsQuery.isLoading ? <div className="shop-settings-skeleton" role="status" aria-label="Loading payment settings"><div /><div /><div /></div> :
        settingsQuery.isError ? <ShopNotice kind="error"><AlertCircle size={16} />Payment settings unavailable. {asErrorMessage(settingsQuery.error)} <button type="button" onClick={() => settingsQuery.refetch()}>Retry</button></ShopNotice> :
          <form className="shop-admin-form shop-payment-settings-form" onSubmit={saveSettings}>
            <div className="shop-manual-admin-note"><AlertCircle size={15} /><span><strong>Manual process only.</strong> Customers send funds themselves and submit a transaction reference. A team member determines payment status.</span></div>
            <div className="shop-form-grid">
              <label className="shop-field"><span>Asset / token</span><input required minLength={2} maxLength={20} value={settingsForm.asset} onChange={(event) => setSettingsForm((current) => ({ ...current, asset: event.target.value }))} placeholder="USDC" data-testid="input-payment-asset" /></label>
              <label className="shop-field"><span>Network</span><input required minLength={2} maxLength={60} value={settingsForm.network} onChange={(event) => setSettingsForm((current) => ({ ...current, network: event.target.value }))} placeholder="Network name" data-testid="input-payment-network" /></label>
              <label className="shop-field shop-field-wide"><span>Receiving address</span><input required minLength={8} maxLength={200} value={settingsForm.receivingAddress} onChange={(event) => setSettingsForm((current) => ({ ...current, receivingAddress: event.target.value }))} data-testid="input-payment-address" /></label>
              <label className="shop-field shop-field-wide"><span>Customer instructions</span><textarea maxLength={1000} rows={4} value={settingsForm.instructions ?? ''} onChange={(event) => setSettingsForm((current) => ({ ...current, instructions: event.target.value }))} placeholder="Optional details on what customers should include." data-testid="input-payment-instructions" /></label>
            </div>
            {settingsError && <ShopNotice kind="error"><AlertCircle size={15} />{settingsError}</ShopNotice>}
            {updateSettings.isError && !settingsError && <ShopNotice kind="error"><AlertCircle size={15} />{asErrorMessage(updateSettings.error)}</ShopNotice>}
            {updateSettings.isSuccess && !settingsError && <ShopNotice kind="success"><Check size={15} />Payment settings saved and public instructions refreshed.</ShopNotice>}
            <div className="shop-admin-form-actions"><span className="shop-settings-updated">Changes are saved to the marketplace settings.</span><button className="shop-button primary" type="submit" disabled={updateSettings.isPending} data-testid="button-save-payment-settings">{updateSettings.isPending ? 'Saving…' : 'Save payment settings'} <Check size={14} /></button></div>
          </form>}
    </section>}
  </div>;
}
