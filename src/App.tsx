import React, { useEffect, useState } from "react";
import * as $rdf from "rdflib";

const DEFAULT_WEBID = "https://timbl.solidcommunity.net/profile/card#me";

const FOAF = $rdf.Namespace("http://xmlns.com/foaf/0.1/");
const VCARD = $rdf.Namespace("http://www.w3.org/2006/vcard/ns#");
const RDFS = $rdf.Namespace("http://www.w3.org/2000/01/rdf-schema#");

type TermLike = {
  termType: string;
  value: string;
};
const nodeToString = (term: TermLike | null | undefined) => {
  if (!term) return undefined;
  if (term.termType === "Literal") return (term as $rdf.Literal).value;
  if (term.termType === "NamedNode") return (term as $rdf.NamedNode).value;
  return undefined;
};

function extractName(store: $rdf.IndexedFormula, subj: $rdf.NamedNode) {
  const candidates: (TermLike | null)[] = [
    store.any(subj, FOAF("name")),
    store.any(subj, VCARD("fn")),
    store.any(subj, FOAF("givenName")),
    store.any(subj, FOAF("familyName")),
    store.any(subj, RDFS("label")),
  ];
  return candidates.map(nodeToString).find(Boolean);
}

function extractImage(store: $rdf.IndexedFormula, subj: $rdf.NamedNode) {
  const candidates: (TermLike | null)[] = [
    store.any(subj, FOAF("img")),
    store.any(subj, FOAF("depiction")),
    store.any(subj, VCARD("hasPhoto")),
  ];
  return candidates.map(nodeToString).find(Boolean);
}

function extractContacts(store: $rdf.IndexedFormula, subj: $rdf.NamedNode) {
  const contacts = store.each(subj, FOAF("knows"));
  const unique = Array.from(
    new Set(contacts.map((c) => nodeToString(c)))
  ).filter(Boolean) as string[];
  return unique;
}

async function loadProfile(webId: string) {
  const store = $rdf.graph();
  const fetcher = new $rdf.Fetcher(store, {
    fetch: (input: RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (!headers.has("Accept")) {
        headers.set(
          "Accept",
          "text/turtle, application/ld+json;q=0.9, application/n-triples;q=0.8, application/rdf+xml;q=0.7, */*;q=0.1"
        );
      }
      return fetch(input, { ...init, headers });
    },
    timeout: 15000,
  });

  await fetcher.load(webId);
  const subject = $rdf.sym(webId);

  const name = extractName(store, subject) ?? new URL(webId).hostname;
  const image = extractImage(store, subject);
  const contactsUris = extractContacts(store, subject);

  const contacts = await Promise.all(
    contactsUris.map(async (uri) => {
      try {
        await fetcher.load(uri);
        const cSubj = $rdf.sym(uri);
        return {
          webId: uri,
          name: extractName(store, cSubj) ?? uri,
          image: extractImage(store, cSubj),
        };
      } catch {
        return {
          webId: uri,
          name: uri,
          image: undefined as string | undefined,
        };
      }
    })
  );

  return { name, image, contacts } as {
    name: string;
    image?: string;
    contacts: { webId: string; name: string; image?: string }[];
  };
}

function useQueryWebId() {
  const [webId, setWebId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("webid");
  });

  useEffect(() => {
    if (!webId) {
      const url = new URL(window.location.href);
      url.searchParams.set("webid", DEFAULT_WEBID);
      window.location.replace(url.toString());
    }
  }, [webId]);

  return webId;
}

export default function App() {
  const initialWebId = useQueryWebId();
  const [currentWebId, setCurrentWebId] = useState<string>(initialWebId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<null | {
    name: string;
    image?: string;
    contacts: { webId: string; name: string; image?: string }[];
  }>(null);

  useEffect(() => {
    if (!initialWebId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadProfile(initialWebId)
      .then((res) => {
        if (!cancelled) setProfile(res);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Failed to load the WebID profile."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialWebId]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("webid", currentWebId.trim());
      window.location.href = url.toString();
    } catch {
      setError(
        "Please enter a valid WebID URL (including https:// and any #fragment)."
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            Solid WebID Profile Viewer
          </h1>
          <a
            href={`?webid=${encodeURIComponent(DEFAULT_WEBID)}`}
            className="text-sm underline hover:no-underline"
            title="Go to Tim Berners-Lee's profile"
          >
            Reset to TimBL
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <form
          onSubmit={onSubmit}
          className="mb-6 grid gap-2 md:flex md:gap-3 items-center"
          aria-label="Change WebID"
        >
          <input
            type="url"
            required
            value={currentWebId}
            onChange={(e) => setCurrentWebId(e.target.value)}
            placeholder="Paste a WebID URL (e.g., https://example.com/profile/card#me)"
            className="w-full md:w-[560px] rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="rounded-xl px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.99] shadow"
          >
            View Profile
          </button>
        </form>

        {loading && (
          <div className="animate-pulse p-6 border rounded-2xl bg-white">
            Loading profile…
          </div>
        )}

        {error && (
          <div className="p-4 mb-4 border rounded-2xl bg-red-50 text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && profile && (
          <section className="space-y-6">
            <div className="bg-white border rounded-2xl p-6 flex items-start gap-4 shadow-sm">
              <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                {profile.image ? (
                  <img
                    src={profile.image}
                    alt={`${profile.name}'s profile image`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-gray-400 text-sm">
                    No Image
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{profile.name}</h2>
                {initialWebId && (
                  <p className="text-sm text-gray-600 break-all">
                    <span className="font-medium">WebID:</span> {initialWebId}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Contacts</h3>
                <span className="text-sm text-gray-500">
                  {profile.contacts.length} contact
                  {profile.contacts.length === 1 ? "" : "s"}
                </span>
              </div>

              {profile.contacts.length === 0 ? (
                <p className="text-gray-600">
                  No contacts found via <code>foaf:knows</code>.
                </p>
              ) : (
                <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {profile.contacts.map((c) => (
                    <li
                      key={c.webId}
                      className="border rounded-xl p-4 hover:shadow"
                    >
                      <a
                        href={`?webid=${encodeURIComponent(c.webId)}`}
                        className="flex items-center gap-3"
                        title="Open contact profile"
                      >
                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                          {c.image ? (
                            <img
                              src={c.image}
                              alt={`${c.name}'s profile image`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full grid place-items-center text-gray-400 text-xs">
                              No Img
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          <p className="text-xs text-gray-500 break-all truncate">
                            {c.webId}
                          </p>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>Tim Berners-Lee (solidcommunity.net)</h3>
              <div
                className="QRCode"
                data-value="BEGIN:VCARD
                    FN:Tim Berners-Lee (solidcommunity.net)
                    URL:https://timbl.solidcommunity.net/profile/card#mer
                    END:VCARD
                    VERSION:4.0
                    "
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 57 57"
                  shape-rendering="crispEdges"
                >
                  <path fill="#f0fffc" d="M0 0h57v57H0z"></path>
                  <path
                    stroke="#341bee"
                    d="M4 4.5h7m2 0h6m1 0h5m1 0h1m1 0h1m5 0h2m1 0h1m3 0h1m2 0h1m1 0h7M4 5.5h1m5 0h1m2 0h1m1 0h1m4 0h5m2 0h1m1 0h1m1 0h1m1 0h2m2 0h1m3 0h4m1 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m1 0h4m2 0h1m2 0h1m1 0h1m1 0h4m1 0h1m4 0h1m1 0h4m2 0h2m1 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m1 0h1m4 0h1m2 0h1m1 0h2m2 0h1m1 0h2m3 0h1m1 0h4m2 0h1m1 0h1m2 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m1 0h1m3 0h1m1 0h5m3 0h5m1 0h1m2 0h2m3 0h1m5 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m1 0h2m7 0h3m1 0h2m3 0h5m1 0h1m2 0h1m2 0h1m3 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M12 11.5h1m1 0h4m1 0h4m2 0h2m3 0h1m2 0h1m1 0h1m3 0h2m1 0h2M4 12.5h1m1 0h5m2 0h1m2 0h1m3 0h4m2 0h6m2 0h1m2 0h1m1 0h3m1 0h2m1 0h5M5 13.5h1m1 0h3m1 0h3m1 0h1m1 0h2m1 0h4m1 0h1m1 0h3m4 0h2m1 0h5m2 0h3m2 0h4M4 14.5h7m1 0h1m2 0h2m1 0h1m1 0h2m4 0h1m1 0h2m2 0h5m2 0h3m1 0h2m5 0h3M4 15.5h5m2 0h1m3 0h7m3 0h4m1 0h1m4 0h1m1 0h4m1 0h1m4 0h1m2 0h2M6 16.5h2m2 0h4m1 0h1m1 0h1m1 0h1m2 0h1m4 0h2m1 0h2m2 0h1m1 0h1m1 0h1m1 0h3m2 0h2m1 0h1M4 17.5h3m2 0h1m1 0h2m3 0h2m2 0h5m1 0h4m2 0h2m4 0h3m1 0h4m1 0h3m1 0h2M4 18.5h4m2 0h3m4 0h2m2 0h1m2 0h3m1 0h2m1 0h1m1 0h4m2 0h3m2 0h3m1 0h1m1 0h2M4 19.5h6m1 0h2m1 0h3m1 0h4m1 0h2m1 0h1m1 0h1m1 0h2m1 0h1m4 0h1m1 0h1m2 0h3m1 0h1m3 0h1M5 20.5h2m1 0h4m1 0h1m4 0h6m1 0h1m2 0h2m2 0h1m2 0h4m1 0h3m2 0h3m1 0h1m1 0h1M8 21.5h1m2 0h1m1 0h1m5 0h1m1 0h7m1 0h1m1 0h3m2 0h1m1 0h4m1 0h2m1 0h1m1 0h1m3 0h1M4 22.5h4m2 0h1m2 0h2m3 0h5m3 0h1m2 0h1m2 0h1m1 0h4m1 0h1m1 0h2m1 0h3m1 0h1m3 0h1M8 23.5h1m2 0h1m2 0h4m1 0h1m2 0h1m3 0h5m6 0h4m2 0h2m2 0h2m1 0h3M6 24.5h2m2 0h1m3 0h2m1 0h3m1 0h1m1 0h1m4 0h1m1 0h1m1 0h4m2 0h1m1 0h1m1 0h2m3 0h3m2 0h1M5 25.5h1m2 0h1m3 0h3m3 0h6m2 0h1m2 0h3m1 0h3m4 0h1m1 0h2m1 0h8M5 26.5h8m2 0h4m2 0h1m2 0h11m1 0h2m1 0h1m1 0h1m2 0h5m1 0h2M6 27.5h1m1 0h1m3 0h1m3 0h2m2 0h1m3 0h3m3 0h1m2 0h1m1 0h1m1 0h1m1 0h4m1 0h1m3 0h1m3 0h1M5 28.5h1m1 0h2m1 0h1m1 0h4m3 0h1m1 0h1m1 0h1m2 0h1m1 0h1m1 0h1m1 0h1m1 0h1m3 0h1m2 0h1m1 0h2m1 0h1m1 0h1M6 29.5h1m1 0h1m3 0h1m1 0h1m1 0h1m5 0h1m3 0h1m3 0h1m1 0h2m1 0h1m1 0h1m6 0h1m3 0h5M7 30.5h8m2 0h1m2 0h2m1 0h1m1 0h8m1 0h4m2 0h1m2 0h6m1 0h2M12 31.5h5m7 0h3m8 0h1m1 0h4m1 0h2m1 0h2m1 0h1m2 0h1M6 32.5h2m1 0h3m3 0h2m1 0h1m2 0h1m1 0h1m1 0h1m2 0h1m1 0h1m3 0h2m5 0h1m3 0h2m1 0h1M4 33.5h1m2 0h2m2 0h1m1 0h2m1 0h2m1 0h4m2 0h3m1 0h1m2 0h4m1 0h2m2 0h1m5 0h1m1 0h1m1 0h2M4 34.5h2m1 0h1m1 0h3m1 0h6m2 0h1m1 0h1m1 0h1m3 0h1m1 0h4m1 0h1m2 0h1m1 0h1m1 0h1m1 0h1m1 0h4M4 35.5h1m7 0h2m1 0h1m1 0h4m4 0h1m1 0h1m6 0h2m1 0h1m2 0h1m1 0h6m1 0h4M4 36.5h2m4 0h1m1 0h2m1 0h1m2 0h1m2 0h1m1 0h1m1 0h1m1 0h2m1 0h2m1 0h2m5 0h1m2 0h1m1 0h1m1 0h1m1 0h1m1 0h2M4 37.5h2m1 0h1m1 0h1m1 0h2m1 0h4m3 0h2m1 0h3m2 0h2m3 0h2m1 0h1m6 0h4m3 0h2M10 38.5h2m3 0h1m1 0h5m1 0h1m1 0h1m3 0h1m1 0h1m1 0h2m5 0h1m3 0h1m1 0h2M5 39.5h2m1 0h2m1 0h1m2 0h5m4 0h1m2 0h1m1 0h2m1 0h1m1 0h1m1 0h1m1 0h4m2 0h1m1 0h1m1 0h3m2 0h1M6 40.5h5m1 0h3m8 0h1m3 0h5m2 0h1m2 0h1m1 0h1m1 0h1m2 0h2m1 0h1m1 0h1m1 0h2M4 41.5h2m1 0h1m1 0h1m1 0h3m3 0h2m1 0h3m2 0h2m8 0h3m1 0h1m2 0h1m5 0h1m1 0h3M5 42.5h1m3 0h4m2 0h1m1 0h1m3 0h1m1 0h3m2 0h1m1 0h5m1 0h1m4 0h1m2 0h5m3 0h1M5 43.5h3m5 0h3m3 0h2m3 0h1m1 0h1m4 0h1m1 0h1m1 0h1m2 0h1m1 0h1m1 0h2m2 0h1m1 0h1m2 0h2M4 44.5h3m3 0h2m1 0h3m3 0h1m3 0h1m1 0h6m1 0h1m4 0h4m1 0h7M12 45.5h3m3 0h3m2 0h1m2 0h1m3 0h1m1 0h1m3 0h4m1 0h1m2 0h1m3 0h5M4 46.5h7m4 0h1m2 0h2m1 0h2m1 0h1m1 0h1m1 0h1m1 0h3m1 0h1m1 0h1m3 0h1m2 0h2m1 0h1m1 0h1m1 0h2M4 47.5h1m5 0h1m1 0h1m1 0h2m1 0h1m3 0h2m1 0h1m1 0h1m3 0h2m1 0h1m1 0h1m1 0h2m1 0h3m1 0h1m3 0h1m3 0h1M4 48.5h1m1 0h3m1 0h1m1 0h2m1 0h1m4 0h3m3 0h5m1 0h1m1 0h1m1 0h3m2 0h1m1 0h6M4 49.5h1m1 0h3m1 0h1m1 0h3m1 0h1m1 0h3m1 0h3m3 0h1m2 0h1m7 0h1m3 0h1m1 0h1m2 0h3m1 0h1M4 50.5h1m1 0h3m1 0h1m1 0h2m1 0h1m1 0h2m1 0h1m1 0h1m1 0h1m1 0h1m1 0h2m2 0h3m5 0h1m4 0h5m2 0h1M4 51.5h1m5 0h1m4 0h5m2 0h5m1 0h1m2 0h1m1 0h1m4 0h1m1 0h2m2 0h1m1 0h2m1 0h1M4 52.5h7m1 0h1m2 0h1m1 0h2m4 0h1m1 0h2m2 0h1m2 0h1m2 0h4m1 0h1m2 0h6m3 0h1"
                  ></path>
                </svg>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-gray-500">
          Built for ODI assessment • RDF via rdflib • Supports Turtle & JSON-LD
          • No auth
        </footer>
      </main>
    </div>
  );
}
