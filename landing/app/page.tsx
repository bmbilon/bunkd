export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Hero Section */}
      <section className="px-4 py-20 md:py-32">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
                Don't Just Assess.
                <br />
                <span className="text-orange-500">BSess.</span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-400 mb-8">
                Paste any link. Get a BS score in 2 seconds. With receipts.
              </p>
              <a
                href="https://testflight.apple.com/join/raSC1Km6"
                className="inline-block bg-orange-600 hover:bg-orange-700 text-white font-bold text-lg px-8 py-4 rounded-lg transition-colors"
              >
                Get Early Access on TestFlight
              </a>
            </div>

            {/* Verdict Card Mockup */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-baseline gap-4 mb-4">
                <div className="text-6xl font-black text-orange-500">8.8</div>
                <div className="text-2xl text-gray-400">/ 10</div>
              </div>
              <div className="text-2xl font-bold text-orange-400 mb-3">
                Very High BS
              </div>
              <p className="text-gray-400 text-lg mb-6">
                No verifiable evidence found
              </p>
              <button className="text-orange-500 hover:text-orange-400 font-semibold text-sm flex items-center gap-2">
                View Sources
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 py-20 bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-black mb-16 text-center">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-600 rounded-full flex items-center justify-center text-2xl font-black mx-auto mb-6">
                1
              </div>
              <h3 className="text-xl font-bold mb-3">Paste a link</h3>
              <p className="text-gray-400">
                Any claim, ad, guru post, or product pitch
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-600 rounded-full flex items-center justify-center text-2xl font-black mx-auto mb-6">
                2
              </div>
              <h3 className="text-xl font-bold mb-3">Get instant verdict</h3>
              <p className="text-gray-400">
                Score + label + reason in 2 seconds
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-600 rounded-full flex items-center justify-center text-2xl font-black mx-auto mb-6">
                3
              </div>
              <h3 className="text-xl font-bold mb-3">See the receipts</h3>
              <p className="text-gray-400">
                Tap to view sources and methodology
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Bunkd Exists */}
      <section className="px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-black mb-8">
            Why Bunkd Exists
          </h2>
          <div className="space-y-6 text-xl text-gray-300 leading-relaxed">
            <p>
              When you see a claim, you either ignore it, Google it (messy), ask friends (slow), or just guess.
              Bunkd gives you a new option: Run it through the BS-Meter.
            </p>
            <p className="text-2xl font-bold text-orange-500">
              We're not starting debates. We're ending them with receipts.
            </p>
          </div>
        </div>
      </section>

      {/* Trust / Objectivity */}
      <section className="px-4 py-20 bg-gray-900">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-black mb-8">
            We Don't Ask You to Trust Us
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            We show you we can't cheat.
          </p>
          <div className="space-y-4">
            {[
              "Same rubric for everyone",
              "Scores expire and auto-refresh",
              "Open methodology",
              "Sponsors must score below threshold"
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-6 h-6 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-xl text-gray-300">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Vision */}
      <section className="px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight">
            Bunkd is the immune system for truth on the internet.
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
            Every LinkedIn guru, every "scale your startup" ad, every sketchy product claim —
            instantly scored on evidence quality, claim specificity, and BS risk.
          </p>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="px-4 py-20 bg-gradient-to-b from-gray-900 to-gray-950">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-black mb-6">
            Join the beta.
            <br />
            Help us make "Bunk it" a verb.
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
            <a
              href="https://testflight.apple.com/join/raSC1Km6"
              className="inline-flex items-center justify-center bg-orange-600 hover:bg-orange-700 text-white font-bold text-lg px-8 py-4 rounded-lg transition-colors shadow-lg"
            >
              <svg className="w-6 h-6 mr-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Download TestFlight
            </a>
          </div>
          <div className="max-w-md mx-auto">
            <input
              type="email"
              placeholder="Email for waitlist updates"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-orange-600 focus:ring-1 focus:ring-orange-600"
            />
          </div>
          <p className="text-gray-500 text-sm mt-12">
            Currently in beta on iOS via TestFlight
          </p>
        </div>
      </section>
    </div>
  );
}
