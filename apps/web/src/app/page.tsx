export default function Home() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-neutral-900" />
            <div className="font-semibold tracking-tight text-xl">bunkd</div>
          </div>
          <a
            href="mailto:hello@bunkd.app?subject=Bunkd%20waitlist"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Join waitlist
          </a>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Spot the BS fast.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-neutral-600">
              bunkd helps you sanity-check claims, content, and “too good to be true” pitches —
              with a clear score breakdown, evidence, and citations.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="mailto:hello@bunkd.app?subject=Bunkd%20early%20access"
                className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white hover:opacity-90"
              >
                Get early access
              </a>
              <a
                href="https://github.com/bmbilon/bunkd"
                className="rounded-xl border border-neutral-200 px-5 py-3 text-sm font-medium hover:bg-neutral-50"
              >
                View on GitHub
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <Feature title="Breakdown" desc="See exactly what drove the score." />
              <Feature title="Evidence" desc="Pulls supporting sources + signals." />
              <Feature title="Citations" desc="Trace claims back to references." />
            </div>

            <p className="mt-10 text-sm text-neutral-500">
              iOS TestFlight rolling out soon.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">BS Meter</div>
                <div className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white">
                  72 / 100
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <Row label="Claim support" value="Medium" />
                <Row label="Source quality" value="Mixed" />
                <Row label="Red flags" value="3 🚩" />
                <Row label="Confidence" value="High" />
              </div>

              <div className="mt-6 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
                “Sounds impressive — but key numbers are missing, sources are circular, and
                the strongest claims aren’t independently verified.”
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-16 border-t border-neutral-200 pt-8 text-sm text-neutral-500">
          © {new Date().getFullYear()} bunkd. All rights reserved.
        </footer>
      </div>
    </main>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-neutral-600">{desc}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-2">
      <div className="text-sm text-neutral-600">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
