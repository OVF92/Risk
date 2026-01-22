import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Risk Management Tool
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Analyse de risque de portefeuille multi-assets
        </p>
        <Link
          href="/var-calculator"
          className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition inline-block"
        >
          Accéder au calculateur →
        </Link>
      </div>
    </main>
  );
}