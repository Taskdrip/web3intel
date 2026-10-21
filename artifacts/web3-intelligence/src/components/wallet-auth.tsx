import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  createWalletAuthChallenge,
  getWalletAuthSession,
  logoutWalletAuth,
  verifyWalletAuth,
  type WalletAuthSession,
} from "@workspace/api-client-react";
import { CircleAlert, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";

type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type AnnouncedProvider = {
  info?: { uuid?: string; name?: string; icon?: string; rdns?: string };
  provider?: InjectedProvider;
};

type AvailableWallet = {
  id: string;
  name: string;
  icon?: string;
  provider: InjectedProvider;
};

type WalletAuthContextValue = {
  session: WalletAuthSession;
  isLoading: boolean;
  sessionError: string;
  signingIn: boolean;
  error: string;
  clearError: () => void;
  signIn: (provider: InjectedProvider) => Promise<void>;
  signOut: () => Promise<void>;
};

const EMPTY_SESSION: WalletAuthSession = {
  authenticated: false,
  address: null,
  role: null,
};
const WalletAuthContext = createContext<WalletAuthContextValue | null>(null);

function responseError(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as {
      message?: string;
      data?: { error?: string };
      status?: number;
      code?: number;
    };
    if (candidate.code === 4001) return "The wallet request was cancelled.";
    if (candidate.data?.error) return candidate.data.error;
    if (candidate.message) return candidate.message;
    if (candidate.status === 503) return "Wallet sign-in is temporarily unavailable.";
  }
  return "Could not complete wallet sign-in. Try again.";
}

function walletName(provider: InjectedProvider): string {
  const flags = provider as InjectedProvider & Record<string, unknown>;
  if (flags.isMetaMask) return "MetaMask";
  if (flags.isRabby) return "Rabby";
  if (flags.isCoinbaseWallet) return "Coinbase Wallet";
  if (flags.isBraveWallet) return "Brave Wallet";
  if (flags.isTrust) return "Trust Wallet";
  if (flags.isOkxWallet) return "OKX Wallet";
  return "Browser wallet";
}

async function discoverWallets(): Promise<AvailableWallet[]> {
  const announced = new Map<string, AvailableWallet>();
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AnnouncedProvider>).detail;
    if (!detail?.provider) return;
    const id = detail.info?.uuid ?? detail.info?.rdns ?? detail.info?.name ?? `provider-${announced.size}`;
    announced.set(id, {
      id,
      name: detail.info?.name ?? walletName(detail.provider),
      icon: detail.info?.icon,
      provider: detail.provider,
    });
  };

  window.addEventListener("eip6963:announceProvider", handler);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  window.removeEventListener("eip6963:announceProvider", handler);

  const ethereum = window.ethereum as
    | (InjectedProvider & { providers?: InjectedProvider[] })
    | undefined;
  const injected = ethereum?.providers?.length ? ethereum.providers : ethereum ? [ethereum] : [];
  for (const provider of injected) {
    if ([...announced.values()].some((wallet) => wallet.provider === provider)) continue;
    const id = `injected-${announced.size}`;
    announced.set(id, { id, name: walletName(provider), provider });
  }
  return [...announced.values()];
}

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(EMPTY_SESSION);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const refreshSession = useCallback(async () => {
    try {
      const current = await getWalletAuthSession();
      setSession(current);
      setSessionError("");
    } catch (cause) {
      setSession(EMPTY_SESSION);
      setSessionError(responseError(cause));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signIn = useCallback(
    async (provider: InjectedProvider) => {
      setError("");
      setSigningIn(true);
      try {
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        const address = Array.isArray(accounts) ? accounts[0] : null;
        if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          throw new Error("The selected wallet did not return a valid EVM address.");
        }

        const chainValue = await provider.request({ method: "eth_chainId" });
        const chainId =
          typeof chainValue === "string"
            ? Number.parseInt(chainValue, 16)
            : typeof chainValue === "number"
              ? chainValue
              : Number.NaN;
        if (!Number.isSafeInteger(chainId) || chainId < 1) {
          throw new Error("The wallet did not return a valid EVM network.");
        }

        const challenge = await createWalletAuthChallenge({ address, chainId });
        const signature = await provider.request({
          method: "personal_sign",
          params: [challenge.message, address],
        });
        if (typeof signature !== "string") {
          throw new Error("The wallet did not return a sign-in signature.");
        }
        await verifyWalletAuth({ message: challenge.message, signature });
        const current = await getWalletAuthSession();
        setSession(current);
        setSessionError("");
        queryClient.clear();
      } catch (cause) {
        setError(responseError(cause));
      } finally {
        setSigningIn(false);
      }
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    setError("");
    try {
      await logoutWalletAuth();
      setSession(EMPTY_SESSION);
      queryClient.clear();
    } catch (cause) {
      setError(responseError(cause));
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      sessionError,
      signingIn,
      error,
      clearError: () => setError(""),
      signIn,
      signOut,
    }),
    [session, isLoading, sessionError, signingIn, error, signIn, signOut],
  );

  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>;
}

export function useWalletAuth() {
  const context = useContext(WalletAuthContext);
  if (!context) throw new Error("useWalletAuth must be used within WalletAuthProvider.");
  return context;
}

export function WalletSignInLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/sign-in"
      className={className}
      data-testid="link-wallet-sign-in"
      aria-label="Sign in with an EVM wallet"
    >
      <Wallet size={14} />
      Wallet sign-in
    </Link>
  );
}

export function WalletLoginPanel() {
  const { session, signingIn, error, clearError, signIn } = useWalletAuth();
  const [wallets, setWallets] = useState<AvailableWallet[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState("");
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (session.authenticated) setLocation("/dashboard");
  }, [session.authenticated, setLocation]);

  const chooseWallet = async () => {
    clearError();
    setDiscoveryError("");
    setDiscovering(true);
    try {
      const available = await discoverWallets();
      setWallets(available);
      if (!available.length) {
        setDiscoveryError(
          "No EVM wallet was detected. Open this page in a wallet browser or install a compatible browser wallet.",
        );
      }
    } catch {
      setDiscoveryError("The browser could not detect an EVM wallet.");
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <section className="wallet-login-panel" aria-label="Wallet sign-in">
      <div className="wallet-login-heading">
        <span className="wallet-login-mark"><Wallet size={17} /></span>
        <div>
          <strong>Continue with a wallet</strong>
          <p>Connect an EVM wallet and sign one secure login message.</p>
        </div>
      </div>
      {session.authenticated && session.address ? (
        <div className="wallet-session-status">
          <ShieldCheck size={16} />
          Signed in as <code>{`${session.address.slice(0, 7)}…${session.address.slice(-5)}`}</code>
        </div>
      ) : (
        <button
          className="wallet-login-primary"
          type="button"
          onClick={() => void chooseWallet()}
          disabled={discovering || signingIn}
          data-testid="button-wallet-login"
        >
          {discovering || signingIn ? <LoaderCircle className="wallet-auth-spin" size={16} /> : <Wallet size={16} />}
          {discovering ? "Looking for wallets…" : signingIn ? "Waiting for wallet…" : "Choose an EVM wallet"}
        </button>
      )}
      {discoveryError && <p className="wallet-login-error" role="alert"><CircleAlert size={15} />{discoveryError}</p>}
      {error && <p className="wallet-login-error" role="alert"><CircleAlert size={15} />{error}</p>}
      {wallets && wallets.length > 0 && (
        <div className="wallet-choice-list" aria-label="Detected wallets">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              type="button"
              className="wallet-choice"
              onClick={() => void signIn(wallet.provider)}
              disabled={signingIn}
              data-testid={`button-wallet-choice-${wallet.id}`}
            >
              {wallet.icon ? <img src={wallet.icon} alt="" /> : <Wallet size={16} />}
              <span>{wallet.name}</span>
              {signingIn && <LoaderCircle className="wallet-auth-spin" size={14} />}
            </button>
          ))}
        </div>
      )}
      <div className="wallet-login-foot">
        <ShieldCheck size={13} />
        Login only. No transactions, private keys, or seed phrases.
      </div>
    </section>
  );
}
