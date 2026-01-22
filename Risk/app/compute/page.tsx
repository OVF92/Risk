'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface AssetPrice {
  price_date: string;
  close_price: number;
  daily_return: number | null;
}

export default function VarCalculator() {
  // États
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('2024-01-01');
  const [endDate, setEndDate] = useState<string>('2026-01-20');
  const [capital, setCapital] = useState<number>(35000);
  const [confidence, setConfidence] = useState<number>(95);
  
  const [varResult, setVarResult] = useState<number | null>(null);
  const [esResult, setEsResult] = useState<number | null>(null); // ← NOUVEAU
  const [volatility, setVolatility] = useState<number | null>(null);
  const [worstReturn, setWorstReturn] = useState<number | null>(null);
  const [bestReturn, setBestReturn] = useState<number | null>(null);
  const [worstReturnDate, setWorstReturnDate] = useState<string | null>(null);
  const [bestReturnDate, setBestReturnDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Récupérer la liste des assets au chargement
  useEffect(() => {
    async function fetchAssets() {
      const { data, error } = await supabase.rpc('get_assets');
      
      if (error) {
        console.error('Erreur:', error);
        return;
      }
      
      if (data) {
        setAvailableAssets(data.map(d => d.asset_name));
        if (data.length > 0) setSelectedAsset(data[0].asset_name);
      }
    }
    fetchAssets();
  }, []);

  // Fonction de calcul de la VaR et ES
  const calculateVaR = async () => {
    if (!selectedAsset) {
      alert('Veuillez sélectionner un asset');
      return;
    }
    
    setLoading(true);
    
    try {
      console.log('🔍 Paramètres:');
      console.log('  Asset:', selectedAsset);
      console.log('  Start:', startDate);
      console.log('  End:', endDate);
      
      // Récupérer TOUTES les données en plusieurs batch
      let allReturns: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('Financial_Data')
          .select('price_date, daily_return')
          .eq('asset_name', selectedAsset)
          .gte('price_date', startDate)
          .lte('price_date', endDate)
          .not('daily_return', 'is', null)
          .order('price_date', { ascending: true })
          .range(from, from + batchSize - 1);
        
        if (error) {
          console.error('Erreur Supabase:', error);
          throw error;
        }
        
        if (!data || data.length === 0) break;
        
        allReturns = [...allReturns, ...data];
        console.log(`📦 Batch ${from / batchSize + 1}: ${data.length} lignes récupérées`);
        
        if (data.length < batchSize) {
          hasMore = false;
        } else {
          from += batchSize;
        }
      }
      
      console.log('📊 Total returns récupérés:', allReturns.length);
      console.log('🔍 Première date:', allReturns[0]?.price_date);
      console.log('🔍 Dernière date:', allReturns[allReturns.length - 1]?.price_date);

      if (allReturns.length < 2) {
        alert('Pas assez de données pour cette période (minimum 2 jours)');
        setLoading(false);
        return;
      }

      // Extraire les log returns
      const returnValues = allReturns.map(r => r.daily_return as number);
      
      console.log('  MIN return:', Math.min(...returnValues));
      console.log('  MAX return:', Math.max(...returnValues));
      console.log('  MIN %:', Math.min(...returnValues) * 100);
      console.log('  MAX %:', Math.max(...returnValues) * 100);

      // 1. Calculer la VaR (percentile des log returns)
      const sortedReturns = [...returnValues].sort((a, b) => a - b);
      const percentileIndex = Math.floor(sortedReturns.length * (1 - confidence / 100));
      const varLogReturn = sortedReturns[percentileIndex];
      const varAmount = varLogReturn * capital;

      // 2. Calculer l'Expected Shortfall (ES / CVaR)
      // ES = moyenne de tous les returns <= VaR
      const returnsWorseThanVar = sortedReturns.slice(0, percentileIndex + 1);
      const esLogReturn = returnsWorseThanVar.reduce((sum, r) => sum + r, 0) / returnsWorseThanVar.length;
      const esAmount = esLogReturn * capital;
      
      console.log('📊 VaR:', varAmount);
      console.log('📊 ES (CVaR):', esAmount);

      // 3. Calculer la volatilité annualisée
      const mean = returnValues.reduce((a, b) => a + b, 0) / returnValues.length;
      const variance = returnValues.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returnValues.length;
      const dailyVol = Math.sqrt(variance);
      const annualVol = dailyVol * Math.sqrt(252) * 100;

      // 4. Pire et meilleure journée avec dates
      const worstDay = Math.min(...returnValues);
      const bestDay = Math.max(...returnValues);
      
      const worstDayData = allReturns.find(r => r.daily_return === worstDay);
      const bestDayData = allReturns.find(r => r.daily_return === bestDay);

      // Mise à jour des résultats
      setVarResult(varAmount);
      setEsResult(esAmount); // ← NOUVEAU
      setVolatility(annualVol);
      setWorstReturn(worstDay * 100);
      setBestReturn(bestDay * 100);
      setWorstReturnDate(worstDayData?.price_date || null);
      setBestReturnDate(bestDayData?.price_date || null);
      
    } catch (error) {
      console.error('Erreur lors du calcul:', error);
      alert('Erreur lors du calcul de la VaR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Calculateur de VaR & ES
          </h1>
          <p className="text-gray-600">
            Value at Risk & Expected Shortfall - Analyse de risque avec log returns
          </p>
        </div>

        {/* Formulaire principal */}
        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 space-y-6">
          
          {/* Sélection de l'asset */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Asset à analyser
            </label>
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
            >
              {availableAssets.length === 0 && (
                <option>Chargement...</option>
              )}
              {availableAssets.map(asset => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>
          </div>

          {/* Sélection des dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Date de début
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Date de fin
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Capital et niveau de confiance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Capital investi (€)
              </label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                min="0"
                step="1000"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Niveau de confiance
              </label>
              <select
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value={90}>90% (1 jour sur 10)</option>
                <option value={95}>95% (1 jour sur 20)</option>
                <option value={99}>99% (1 jour sur 100)</option>
              </select>
            </div>
          </div>

          {/* Bouton de calcul */}
          <button
            onClick={calculateVaR}
            disabled={loading || !selectedAsset}
            className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-md hover:shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Calcul en cours...
              </span>
            ) : (
              'Calculer VaR & ES'
            )}
          </button>

          {/* Résultats */}
          {varResult !== null && (
            <div className="mt-8 space-y-4">
              
              {/* VaR et ES en 2 colonnes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* VaR */}
                <div className="p-6 bg-gradient-to-r from-red-50 to-orange-50 rounded-xl border-l-4 border-red-500">
                  <h2 className="text-lg font-bold text-gray-900 mb-2">
                    VaR {confidence}% (1 jour)
                  </h2>
                  <div className={`text-3xl font-bold mb-2 ${varResult < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {varResult.toLocaleString('fr-FR', { 
                      style: 'currency', 
                      currency: 'EUR',
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2 
                    })}
                  </div>
                  <p className="text-xs text-gray-600">
                    Dans {confidence}% des cas, votre perte ne dépassera pas ce montant
                  </p>
                </div>

                {/* ES (CVaR) */}
                <div className="p-6 bg-gradient-to-r from-orange-50 to-red-100 rounded-xl border-l-4 border-orange-600">
                  <h2 className="text-lg font-bold text-gray-900 mb-2">
                    ES {confidence}% (CVaR)
                  </h2>
                  <div className={`text-3xl font-bold mb-2 ${esResult && esResult < 0 ? 'text-orange-700' : 'text-green-600'}`}>
                    {esResult?.toLocaleString('fr-FR', { 
                      style: 'currency', 
                      currency: 'EUR',
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2 
                    })}
                  </div>
                  <p className="text-xs text-gray-600">
                    Perte moyenne dans les {100 - confidence}% pires scénarios
                  </p>
                </div>
              </div>

              {/* Explication VaR vs ES */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 text-sm">
                <p className="font-semibold text-blue-900 mb-1">💡 Différence VaR vs ES :</p>
                <p className="text-blue-800">
                  <strong>VaR</strong> = seuil de perte (95e percentile) • 
                  <strong> ES</strong> = perte moyenne au-delà de la VaR (plus conservateur)
                </p>
              </div>

              {/* Métriques supplémentaires */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Volatilité */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-sm font-medium text-blue-700 mb-1">
                    Volatilité annualisée
                  </div>
                  <div className="text-2xl font-bold text-blue-900">
                    {volatility?.toFixed(2)}%
                  </div>
                </div>

                {/* Pire journée */}
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-sm font-medium text-red-700 mb-1">
                    Pire journée (historique)
                  </div>
                  <div className="text-2xl font-bold text-red-900">
                    {worstReturn?.toFixed(2)}%
                  </div>
                  {worstReturnDate && (
                    <div className="text-xs text-red-600 mt-1">
                      📅 {new Date(worstReturnDate).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                </div>

                {/* Meilleure journée */}
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-sm font-medium text-green-700 mb-1">
                    Meilleure journée (historique)
                  </div>
                  <div className="text-2xl font-bold text-green-900">
                    +{bestReturn?.toFixed(2)}%
                  </div>
                  {bestReturnDate && (
                    <div className="text-xs text-green-600 mt-1">
                      📅 {new Date(bestReturnDate).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                </div>
              </div>

              {/* Explication technique */}
              <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600 border border-gray-200">
                <p className="font-semibold mb-2">ℹ️ Méthodologie :</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Utilisation des <strong>log returns</strong> (ln) pour une distribution plus stable</li>
                  <li><strong>VaR</strong> : {confidence}e percentile des returns historiques</li>
                  <li><strong>ES (CVaR)</strong> : Moyenne des returns inférieurs à la VaR</li>
                  <li>Volatilité calculée sur 252 jours de trading annualisés</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Données historiques via Yahoo Finance • Calculs basés sur log returns</p>
        </div>
      </div>
    </div>
  );
}